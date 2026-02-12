import {
  MENU_ID_PREFIX,
  MENU_SEPARATOR,
  ROOT_MENU_BASE_TITLE,
  ROOT_MENU_ID,
} from '../shared/constants'
import { getTemplateMenuTitle, truncateLabel } from '../shared/menu'
import type { CachedSelectedDb } from '../shared/types'

function clearContextMenu(): Promise<void> {
  return new Promise((resolve) => {
    chrome.contextMenus.removeAll(() => resolve())
  })
}

function createMenuItem(createProperties: chrome.contextMenus.CreateProperties): Promise<void> {
  return new Promise((resolve) => {
    chrome.contextMenus.create(createProperties, () => resolve())
  })
}

function getTemplateMenuId(databaseId: string, templateId: string): string {
  return `${MENU_ID_PREFIX}${databaseId}${MENU_SEPARATOR}${templateId}`
}

export function parseTemplateFromMenuId(
  menuItemId: string
): { databaseId: string; templateId: string } | null {
  if (!menuItemId.startsWith(MENU_ID_PREFIX)) return null

  const rest = menuItemId.slice(MENU_ID_PREFIX.length)
  const [databaseId, templateId] = rest.split(MENU_SEPARATOR)
  if (!databaseId || !templateId) return null

  return { databaseId, templateId }
}

async function buildContextMenu(
  cachedItems: CachedSelectedDb[],
  getTemplateOrder: (databaseId: string) => Promise<string[]>,
  sortTemplatesByOrder: (
    templates: CachedSelectedDb['templates'],
    order: string[]
  ) => CachedSelectedDb['templates']
): Promise<void> {
  await createMenuItem({
    id: ROOT_MENU_ID,
    title: ROOT_MENU_BASE_TITLE,
    contexts: ['selection'],
  })

  for (const cached of cachedItems) {
    const order = await getTemplateOrder(cached.id)
    const sortedTemplates = sortTemplatesByOrder(cached.templates, order)
    const parentId = cachedItems.length > 1 ? `notion-ds-${cached.id}` : ROOT_MENU_ID

    if (cachedItems.length > 1) {
      await createMenuItem({
        id: parentId,
        parentId: ROOT_MENU_ID,
        title: cached.name || 'Untitled',
        contexts: ['selection'],
      })
    }

    for (const tpl of sortedTemplates) {
      await createMenuItem({
        id: getTemplateMenuId(cached.id, tpl.id),
        parentId,
        title: getTemplateMenuTitle(tpl),
        contexts: ['selection'],
      })
    }
  }
}

async function buildContextMenuNoDb(): Promise<void> {
  await createMenuItem({
    id: ROOT_MENU_ID,
    title: ROOT_MENU_BASE_TITLE,
    contexts: ['selection'],
  })

  await createMenuItem({
    id: 'notion-config-options',
    parentId: ROOT_MENU_ID,
    title: 'Configure data sources in Settings',
    contexts: ['selection'],
  })
}

type RefreshDeps = {
  getToken: () => Promise<string | null>
  getOrderedDataSourceIds: (token: string, forceRefresh?: boolean) => Promise<string[]>
  getCachedSelectedDb: (token: string, databaseId: string) => Promise<CachedSelectedDb | null>
  getTemplateOrder: (databaseId: string) => Promise<string[]>
  sortTemplatesByOrder: (
    templates: CachedSelectedDb['templates'],
    order: string[]
  ) => CachedSelectedDb['templates']
}

export async function refreshContextMenu(deps: RefreshDeps): Promise<void> {
  await clearContextMenu()
  const token = await deps.getToken()
  if (!token) return

  const selectedIds = await deps.getOrderedDataSourceIds(token, false)
  if (selectedIds.length === 0) {
    await buildContextMenuNoDb()
    return
  }

  const cachedItems = (
    await Promise.all(selectedIds.map((id) => deps.getCachedSelectedDb(token, id)))
  ).filter((item): item is CachedSelectedDb => Boolean(item))

  if (cachedItems.length > 0) {
    await buildContextMenu(cachedItems, deps.getTemplateOrder, deps.sortTemplatesByOrder)
  }
}

export function handleContextMenuShown(info: chrome.contextMenus.OnShownInfo): void {
  if (!info.selectionText) return
  const label = truncateLabel(info.selectionText)
  chrome.contextMenus.update(ROOT_MENU_ID, { title: `Save '${label}' to Notion` }, () => {
    chrome.contextMenus.refresh()
  })
}

type CreatePageDeps = {
  getCachedSelectedDb: (token: string, databaseId: string) => Promise<CachedSelectedDb | null>
  notionFetch: (token: string, path: string, options?: RequestInit) => Promise<Response>
}

async function createPage(
  token: string,
  dataSourceId: string,
  titlePropertyKey: string,
  titleText: string,
  templateId: string,
  deps: CreatePageDeps
): Promise<void> {
  const body: Record<string, unknown> = {
    parent: { data_source_id: dataSourceId },
    properties: {
      [titlePropertyKey]: {
        title: [{ text: { content: titleText.slice(0, 2000) } }],
      },
    },
    template: { type: 'template_id', template_id: templateId },
  }

  const res = await deps.notionFetch(token, '/v1/pages', {
    method: 'POST',
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Create page failed: ${res.status} ${err}`)
  }
}

type ClickDeps = {
  getToken: () => Promise<string | null>
  getCachedSelectedDb: (token: string, databaseId: string) => Promise<CachedSelectedDb | null>
  notionFetch: (token: string, path: string, options?: RequestInit) => Promise<Response>
  openOptionsInTab: () => void
}

export async function handleContextMenuClick(
  info: chrome.contextMenus.OnClickData,
  deps: ClickDeps
): Promise<void> {
  if (info.menuItemId === 'notion-config-options') {
    deps.openOptionsInTab()
    return
  }

  if (info.menuItemId === ROOT_MENU_ID || typeof info.menuItemId !== 'string') {
    return
  }

  const parsedTemplate = parseTemplateFromMenuId(info.menuItemId)
  const selectionText = (info.selectionText ?? '').trim()
  if (!parsedTemplate || !selectionText) return

  const token = await deps.getToken()
  if (!token) return

  const cached = await deps.getCachedSelectedDb(token, parsedTemplate.databaseId)
  if (!cached) return

  await createPage(
    token,
    cached.dataSourceId,
    cached.titlePropertyKey,
    selectionText,
    parsedTemplate.templateId,
    deps
  )
}

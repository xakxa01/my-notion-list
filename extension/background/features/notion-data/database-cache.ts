import {
  CACHE_TTL_MS,
  DATA_SOURCES_LIST_CACHE_KEY,
  SELECTED_DB_CACHE_KEY_PREFIX,
  TEMPLATE_ORDER_KEY,
} from '../../shared/constants'
import { normalizeDatabaseIds } from '../../shared/ids'
import { parseNotionIcon } from '../../shared/notion-parsers'
import type { CachedSelectedDb, NotionIcon } from '../../shared/types'
import { getOrderedDataSourceIds } from './data-sources'
import { notionFetch } from './notion-client'
import type { DatabaseInfo, Template } from './types'

async function getDatabaseFull(
  token: string,
  databaseId: string
): Promise<{ dataSourceId: string; name: string; icon: NotionIcon; titlePropertyKey: string }> {
  const dataSourceRes = await notionFetch(token, `/v1/data_sources/${databaseId}`, {
    method: 'GET',
  })
  if (dataSourceRes.ok) {
    const dataSource = (await dataSourceRes.json()) as {
      title?: Array<{ plain_text?: string }>
      icon?: unknown
      properties: Record<string, { type: string }>
    }

    let titlePropertyKey = ''
    for (const [key, prop] of Object.entries(dataSource.properties ?? {})) {
      if (prop?.type === 'title') {
        titlePropertyKey = key
        break
      }
    }
    if (!titlePropertyKey) throw new Error(`No title property in data source ${databaseId}`)

    const name = dataSource.title
      ? dataSource.title
          .map((t) => t.plain_text ?? '')
          .join('')
          .trim() || 'Untitled'
      : 'Untitled'

    return {
      dataSourceId: databaseId,
      name,
      icon: parseNotionIcon(dataSource.icon),
      titlePropertyKey,
    }
  }

  const databaseRes = await notionFetch(token, `/v1/databases/${databaseId}`, { method: 'GET' })
  if (!databaseRes.ok) throw new Error(`Database/Data source ${databaseId}: ${databaseRes.status}`)

  const database = (await databaseRes.json()) as {
    title?: Array<{ plain_text?: string }>
    icon?: unknown
    properties: Record<string, { type: string }>
    data_sources?: Array<{ id?: string }>
  }

  const resolvedDataSourceId = database.data_sources?.find((d) => d.id)?.id || databaseId
  let titlePropertyKey = ''
  for (const [key, prop] of Object.entries(database.properties ?? {})) {
    if (prop?.type === 'title') {
      titlePropertyKey = key
      break
    }
  }
  if (!titlePropertyKey) throw new Error(`No title property in database ${databaseId}`)

  const name = database.title
    ? database.title
        .map((t) => t.plain_text ?? '')
        .join('')
        .trim() || 'Untitled'
    : 'Untitled'

  return {
    dataSourceId: resolvedDataSourceId,
    name,
    icon: parseNotionIcon(database.icon),
    titlePropertyKey,
  }
}

async function listTemplates(token: string, dataSourceId: string): Promise<Template[]> {
  type RawTemplate = { id: string; name: string; icon?: NotionIcon; pageId?: string }

  const getPageIcon = async (pageId: string): Promise<NotionIcon> => {
    try {
      const res = await notionFetch(token, `/v1/pages/${pageId}`, { method: 'GET' })
      if (!res.ok) return null
      const page = (await res.json()) as { icon?: unknown }
      return parseNotionIcon(page.icon)
    } catch {
      return null
    }
  }

  const enrichWithOriginalIcons = async (templates: RawTemplate[]): Promise<Template[]> => {
    const batchSize = 4
    const enriched: Template[] = []

    for (let i = 0; i < templates.length; i += batchSize) {
      const batch = templates.slice(i, i + batchSize)
      const batchResolved = await Promise.all(
        batch.map(async (template) => {
          const pageId = template.pageId || template.id
          const pageIcon = await getPageIcon(pageId)
          return {
            id: template.id,
            name: template.name,
            icon: pageIcon || template.icon || null,
          }
        })
      )
      enriched.push(...batchResolved)
    }

    return enriched
  }

  const fetchForDataSourceId = async (id: string): Promise<Template[] | null> => {
    const all: RawTemplate[] = []
    let cursor: string | null = null

    do {
      const query = cursor ? `?start_cursor=${encodeURIComponent(cursor)}` : ''
      const res = await notionFetch(token, `/v1/data_sources/${id}/templates${query}`, {
        method: 'GET',
      })
      if (!res.ok) return null

      const data = (await res.json()) as {
        results?: Array<Record<string, unknown>>
        templates?: Array<Record<string, unknown>>
        has_more?: boolean
        next_cursor?: string | null
      }

      const templatesRaw = data.results ?? data.templates ?? []
      for (const t of templatesRaw) {
        const templateId = String(t.id || t.template_id || '')
        if (!templateId) continue

        const pageId = String(
          t.page_id ||
            (typeof t.page === 'object' && t.page !== null
              ? (t.page as Record<string, unknown>).id || ''
              : '')
        )

        all.push({
          id: templateId,
          name: String(t.name || 'Untitled'),
          icon: parseNotionIcon(t.icon),
          pageId: pageId || undefined,
        })
      }

      cursor = data.has_more ? (data.next_cursor ?? null) : null
    } while (cursor)

    return enrichWithOriginalIcons(all)
  }

  try {
    const direct = await fetchForDataSourceId(dataSourceId)
    if (direct) return direct

    const databaseRes = await notionFetch(token, `/v1/databases/${dataSourceId}`, { method: 'GET' })
    if (!databaseRes.ok) return []

    const databaseData = (await databaseRes.json()) as { data_sources?: Array<{ id?: string }> }
    const fallbackDataSourceId = databaseData.data_sources?.find((d) => d.id)?.id
    if (!fallbackDataSourceId) return []

    const fallback = await fetchForDataSourceId(fallbackDataSourceId)
    return fallback ?? []
  } catch {
    return []
  }
}

async function fetchAndCacheSelectedDb(
  token: string,
  databaseId: string
): Promise<CachedSelectedDb | null> {
  try {
    const { dataSourceId, name, icon, titlePropertyKey } = await getDatabaseFull(token, databaseId)
    const templates = await listTemplates(token, dataSourceId)
    const uniqueTemplates = Array.from(new Map(templates.map((t) => [t.id, t])).values())

    const cached: CachedSelectedDb = {
      id: databaseId,
      dataSourceId,
      name,
      icon,
      titlePropertyKey,
      templates: uniqueTemplates,
    }

    const cacheKey = `${SELECTED_DB_CACHE_KEY_PREFIX}${databaseId}`
    await new Promise<void>((resolve) => {
      chrome.storage.local.set({ [cacheKey]: JSON.stringify({ ...cached, ts: Date.now() }) }, () =>
        resolve()
      )
    })

    return cached
  } catch {
    return null
  }
}

export async function clearNotionCaches(): Promise<void> {
  const keysToRemove = await new Promise<string[]>((resolve) => {
    chrome.storage.local.get(null, (items) => {
      const allKeys = Object.keys(items ?? {})
      resolve(
        allKeys.filter(
          (key) =>
            key === DATA_SOURCES_LIST_CACHE_KEY || key.startsWith(SELECTED_DB_CACHE_KEY_PREFIX)
        )
      )
    })
  })

  if (keysToRemove.length === 0) return

  await new Promise<void>((resolve) => {
    chrome.storage.local.remove(keysToRemove, () => resolve())
  })
}

export async function clearSelectedDbCaches(ids: string[]): Promise<void> {
  const normalized = normalizeDatabaseIds(ids)
  if (normalized.length === 0) return

  const keysToRemove = normalized.map((id) => `${SELECTED_DB_CACHE_KEY_PREFIX}${id}`)
  await new Promise<void>((resolve) => {
    chrome.storage.local.remove(keysToRemove, () => resolve())
  })
}

export async function getCachedSelectedDb(
  token: string,
  databaseId: string
): Promise<CachedSelectedDb | null> {
  const cacheKey = `${SELECTED_DB_CACHE_KEY_PREFIX}${databaseId}`
  const raw = await new Promise<string | undefined>((resolve) => {
    chrome.storage.local.get([cacheKey], (r) =>
      resolve((r as Record<string, string | undefined>)[cacheKey])
    )
  })

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as CachedSelectedDb & { ts: number }
      if (parsed.id === databaseId && Date.now() - parsed.ts < CACHE_TTL_MS) {
        if (!Array.isArray(parsed.templates) || parsed.templates.length === 0) {
          return fetchAndCacheSelectedDb(token, databaseId)
        }

        return {
          id: parsed.id,
          dataSourceId: parsed.dataSourceId || parsed.id,
          name: parsed.name || 'Untitled',
          icon: parsed.icon || null,
          titlePropertyKey: parsed.titlePropertyKey,
          templates: parsed.templates,
        }
      }
    } catch {
      // ignore malformed cache
    }
  }

  return fetchAndCacheSelectedDb(token, databaseId)
}

async function getDatabaseInfo(
  token: string,
  databaseId: string,
  forceRefresh = false
): Promise<DatabaseInfo | null> {
  const cached = forceRefresh
    ? await fetchAndCacheSelectedDb(token, databaseId)
    : await getCachedSelectedDb(token, databaseId)

  if (!cached) return null
  return {
    id: cached.id,
    name: cached.name,
    icon: cached.icon,
    templates: cached.templates,
  }
}

export async function getAllDatabaseInfos(
  token: string,
  forceRefresh = false
): Promise<DatabaseInfo[]> {
  const orderedIds = await getOrderedDataSourceIds(token, forceRefresh)
  const infos = await Promise.all(orderedIds.map((id) => getDatabaseInfo(token, id, forceRefresh)))
  return infos.filter((info): info is DatabaseInfo => Boolean(info))
}

export function getTemplateOrder(databaseId: string): Promise<string[]> {
  return new Promise((resolve) => {
    chrome.storage.sync.get([`${TEMPLATE_ORDER_KEY}_${databaseId}`], (r) => {
      resolve((r[`${TEMPLATE_ORDER_KEY}_${databaseId}`] as string[]) || [])
    })
  })
}

export function setTemplateOrder(databaseId: string, order: string[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [`${TEMPLATE_ORDER_KEY}_${databaseId}`]: order }, () => resolve())
  })
}

export function sortTemplatesByOrder(
  templates: Array<{ id: string; name: string; icon?: NotionIcon }>,
  order: string[]
): Array<{ id: string; name: string; icon?: NotionIcon }> {
  if (order.length === 0) {
    return templates
  }

  const orderIndex = new Map(order.map((id, index) => [id, index]))
  return [...templates].sort((a, b) => {
    const indexA = orderIndex.get(a.id)
    const indexB = orderIndex.get(b.id)
    const rankA = typeof indexA === 'number' ? indexA : Number.MAX_SAFE_INTEGER
    const rankB = typeof indexB === 'number' ? indexB : Number.MAX_SAFE_INTEGER
    return rankA - rankB
  })
}

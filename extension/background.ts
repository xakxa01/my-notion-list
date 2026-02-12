/// <reference types="chrome" />
/**
 * Service Worker: Handles OAuth, Notion API communication, context menu management,
 * page creation, and notifications for the browser extension.
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const NOTION_VERSION = '2025-09-03'
const NOTION_API = 'https://api.notion.com'

// Context Menu
const ROOT_MENU_ID = 'notion-save-root'
const MENU_ID_PREFIX = 'notion_tpl_'

// Storage Keys
const SELECTED_DB_CACHE_KEY = 'notion_selected_db_cache'
const SELECTED_DB_STORAGE_KEY = 'notion_selected_database_id'
const TEMPLATE_ORDER_KEY = 'notion_template_order'
const OAUTH_CLIENT_ID_KEY = 'notion_oauth_client_id'
const OAUTH_PROXY_URL_KEY = 'notion_oauth_proxy_url'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const DEFAULT_OAUTH_CLIENT_ID = '305d872b-594c-805b-bbc6-0037cc398635'
const DEFAULT_OAUTH_PROXY_URL = 'https://my-notion-list.vercel.app/api/notion-token'

// ============================================================================
// TYPES
// ============================================================================

type CachedSelectedDb = {
  id: string
  dataSourceId: string
  name: string
  icon: NotionIcon
  titlePropertyKey: string
  templates: Array<{ id: string; name: string; icon?: NotionIcon }>
}

type NotionIcon = { type: 'emoji'; emoji: string } | { type: 'file'; file: { url: string } } | null

// ============================================================================
// STORAGE HELPERS
// ============================================================================

function getToken(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['notion_token'], (r) => resolve((r as { notion_token?: string | null }).notion_token ?? null))
  })
}

function setToken(token: string | null): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ notion_token: token ?? '' }, resolve)
  })
}

function getNotificationsEnabled(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['notifications_enabled'], (r) => {
      resolve(r.notifications_enabled !== false)
    })
  })
}

function getSelectedDatabaseId(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.sync.get([SELECTED_DB_STORAGE_KEY], (r) =>
      resolve((r[SELECTED_DB_STORAGE_KEY] as string) || null)
    )
  })
}

function setSelectedDatabaseId(id: string | null): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [SELECTED_DB_STORAGE_KEY]: id ?? '' }, () => resolve())
  })
}

function getOAuthConfig(): Promise<{ clientId: string; proxyUrl: string }> {
  return new Promise((resolve) => {
    chrome.storage.sync.get([OAUTH_CLIENT_ID_KEY, OAUTH_PROXY_URL_KEY], (r) => {
      const storedClientId = String(r[OAUTH_CLIENT_ID_KEY] || '').trim()
      const storedProxyUrl = String(r[OAUTH_PROXY_URL_KEY] || '').trim()
      resolve({
        clientId: storedClientId || DEFAULT_OAUTH_CLIENT_ID,
        proxyUrl: storedProxyUrl || DEFAULT_OAUTH_PROXY_URL,
      })
    })
  })
}

function getOAuthRedirectUri(): string {
  return chrome.identity.getRedirectURL()
}

async function ensurePermissionForUrl(rawUrl: string): Promise<boolean> {
  try {
    const url = new URL(rawUrl)
    const originPattern = `${url.origin}/*`
    const alreadyGranted = await new Promise<boolean>((resolve) => {
      chrome.permissions.contains({ origins: [originPattern] }, resolve)
    })
    if (alreadyGranted) return true
    return new Promise<boolean>((resolve) => {
      chrome.permissions.request({ origins: [originPattern] }, (granted) => resolve(Boolean(granted)))
    })
  } catch {
    return false
  }
}

async function exchangeOAuthCode(code: string): Promise<void> {
  const { proxyUrl } = await getOAuthConfig()
  const redirectUri = getOAuthRedirectUri()
  if (!proxyUrl) throw new Error('Falta la URL del proxy OAuth en Opciones.')
  if (!/^https?:\/\//i.test(proxyUrl)) throw new Error('La URL del proxy OAuth debe iniciar con http:// o https://.')

  const permissionOk = await ensurePermissionForUrl(proxyUrl)
  if (!permissionOk) throw new Error('Permiso de red denegado para el proxy OAuth.')

  const res = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      redirect_uri: redirectUri,
    }),
  })
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string }
  if (!res.ok) throw new Error(data.error || `OAuth exchange failed: ${res.status}`)
  if (!data.access_token) throw new Error('El proxy OAuth no devolvió access_token.')
  await setToken(data.access_token)
  await refreshContextMenu()
}

async function startOAuthSignIn(): Promise<void> {
  const { clientId } = await getOAuthConfig()
  if (!clientId) throw new Error('Falta Client ID de Notion en Opciones.')

  const redirectUri = getOAuthRedirectUri()
  const state = Math.random().toString(36).slice(2)
  const authUrl = new URL('https://api.notion.com/v1/oauth/authorize')
  authUrl.searchParams.set('owner', 'user')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('state', state)

  const responseUrl = await new Promise<string>((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl.toString(), interactive: true },
      (url) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'OAuth cancelado o bloqueado.'))
          return
        }
        if (!url) {
          reject(new Error('No se recibió URL de retorno de OAuth.'))
          return
        }
        resolve(url)
      }
    )
  })

  const parsed = new URL(responseUrl)
  const returnedState = parsed.searchParams.get('state')
  if (!returnedState || returnedState !== state) throw new Error('Estado OAuth inválido.')
  const oauthError = parsed.searchParams.get('error')
  if (oauthError) throw new Error(`Notion OAuth error: ${oauthError}`)
  const code = parsed.searchParams.get('code')
  if (!code) throw new Error('No se recibió código de autorización.')

  await exchangeOAuthCode(code)
}

// ============================================================================
// NOTION API HELPERS
// ============================================================================

async function notionFetch(
  token: string,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = path.startsWith('http') ? path : `${NOTION_API}${path}`
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    },
  })
}

function getTitleFromResult(result: Record<string, unknown>): string {
  if (result.title && Array.isArray(result.title)) {
    return (result.title as Array<{ plain_text?: string }>)
      .map((t) => t.plain_text ?? '')
      .join('')
      .trim()
  }
  const props = result.properties as Record<string, { type?: string; title?: Array<{ plain_text?: string }> }> | undefined
  if (props) {
    for (const p of Object.values(props)) {
      if (p?.type === 'title' && Array.isArray(p.title)) {
        return (p.title as Array<{ plain_text?: string }>)
          .map((t) => t.plain_text ?? '')
          .join('')
          .trim()
      }
    }
  }
  return 'Sin nombre'
}

function parseNotionIcon(raw: unknown): NotionIcon {
  if (!raw || typeof raw !== 'object') return null
  const icon = raw as Record<string, unknown>
  if (icon.type === 'emoji' && icon.emoji) {
    return { type: 'emoji', emoji: String(icon.emoji) }
  }
  if (icon.type === 'file' && icon.file && typeof icon.file === 'object') {
    const url = (icon.file as Record<string, unknown>).url
    if (url) return { type: 'file', file: { url: String(url) } }
  }
  if (icon.type === 'external' && icon.external && typeof icon.external === 'object') {
    const url = (icon.external as Record<string, unknown>).url
    if (url) return { type: 'file', file: { url: String(url) } }
  }
  if (icon.type === 'custom_emoji' && icon.custom_emoji && typeof icon.custom_emoji === 'object') {
    const url = (icon.custom_emoji as Record<string, unknown>).url
    if (url) return { type: 'file', file: { url: String(url) } }
  }
  return null
}

function getTemplateMenuTitle(template: { name: string; icon?: NotionIcon }): string {
  if (template.icon?.type === 'emoji') return `${template.icon.emoji} ${template.name}`
  return `📄 ${template.name}`
}

// ============================================================================
// STORAGE HELPERS
// ============================================================================

function getTemplateOrder(databaseId: string): Promise<string[]> {
  return new Promise((resolve) => {
    chrome.storage.sync.get([`${TEMPLATE_ORDER_KEY}_${databaseId}`], (r) => {
      resolve((r[`${TEMPLATE_ORDER_KEY}_${databaseId}`] as string[]) || [])
    })
  })
}

function setTemplateOrder(databaseId: string, order: string[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [`${TEMPLATE_ORDER_KEY}_${databaseId}`]: order }, () => resolve())
  })
}

function sortTemplatesByOrder(
  templates: Array<{ id: string; name: string; icon?: NotionIcon }>,
  order: string[]
): Array<{ id: string; name: string; icon?: NotionIcon }> {
  if (order.length === 0) {
    return templates
  }

  const sorted = [...templates].sort((a, b) => {
    const indexA = order.indexOf(a.id)
    const indexB = order.indexOf(b.id)

    if (indexA === -1 && indexB === -1) return 0
    if (indexA === -1) return 1
    if (indexB === -1) return -1
    return indexA - indexB
  })

  return sorted
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

async function searchDataSources(token: string): Promise<Array<{ id: string; name: string }>> {
  const dataSourceSearchRes = await notionFetch(token, '/v1/search', {
    method: 'POST',
    body: JSON.stringify({
      filter: { property: 'object', value: 'data_source' },
      page_size: 100,
    }),
  })
  if (dataSourceSearchRes.ok) {
    const data = (await dataSourceSearchRes.json()) as {
      results?: Array<{ object: string; id: string; title?: Array<{ plain_text: string }> }>
    }
    const results = (data.results ?? [])
      .filter((r) => r.object === 'data_source')
      .map((r) => ({ id: r.id, name: getTitleFromResult(r) || 'Sin nombre' }))
    if (results.length > 0) return results
  }

  // Compatibilidad: algunos workspaces/tokens siguen devolviendo database en search.
  const databaseSearchRes = await notionFetch(token, '/v1/search', {
    method: 'POST',
    body: JSON.stringify({
      filter: { property: 'object', value: 'database' },
      page_size: 100,
    }),
  })
  if (!databaseSearchRes.ok) {
    const err = await databaseSearchRes.text()
    throw new Error(`Search failed: ${databaseSearchRes.status} ${err}`)
  }
  const databaseData = (await databaseSearchRes.json()) as {
    results?: Array<{ object: string; id: string; title?: Array<{ plain_text: string }> }>
  }
  const databaseResults = databaseData.results ?? []
  return databaseResults
    .filter((r) => r.object === 'database')
    .map((r) => ({ id: r.id, name: getTitleFromResult(r) || 'Sin nombre' }))
}

async function getDatabaseFull(token: string, databaseId: string): Promise<{
  dataSourceId: string
  name: string
  icon: NotionIcon
  titlePropertyKey: string
}> {
  const dataSourceRes = await notionFetch(token, `/v1/data_sources/${databaseId}`, { method: 'GET' })
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
      ? dataSource.title.map((t) => t.plain_text ?? '').join('').trim() || 'Sin nombre'
      : 'Sin nombre'
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
    ? database.title.map((t) => t.plain_text ?? '').join('').trim() || 'Sin nombre'
    : 'Sin nombre'
  const icon = parseNotionIcon(database.icon)
  return { dataSourceId: resolvedDataSourceId, name, icon, titlePropertyKey }
}

// ============================================================================
// TEMPLATE OPERATIONS
// ============================================================================

async function listTemplates(
  token: string,
  dataSourceId: string
): Promise<Array<{ id: string; name: string; icon?: { type: 'emoji'; emoji: string } | { type: 'file'; file: { url: string } } | null }>> {
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

  const enrichWithOriginalIcons = async (templates: RawTemplate[]) => {
    const batchSize = 4
    const enriched: Array<{ id: string; name: string; icon?: NotionIcon }> = []

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

  const fetchForDataSourceId = async (id: string) => {
    const all: RawTemplate[] = []
    let cursor: string | null = null

    do {
      const query = cursor ? `?start_cursor=${encodeURIComponent(cursor)}` : ''
      const res = await notionFetch(token, `/v1/data_sources/${id}/templates${query}`, { method: 'GET' })
      if (!res.ok) return null
      const data = (await res.json()) as {
        results?: Array<Record<string, unknown>>
        templates?: Array<Record<string, unknown>>
        has_more?: boolean
        next_cursor?: string | null
      }
      const templatesRaw = data.results ?? data.templates ?? []
      for (const t of templatesRaw) {
        const id = String(
          (t as Record<string, unknown>).id ||
          (t as Record<string, unknown>).template_id ||
          ''
        )
        if (!id) continue
        const name = String((t as Record<string, unknown>).name || 'Sin nombre')
        const icon = parseNotionIcon((t as Record<string, unknown>).icon)
        const pageId = String(
          (t as Record<string, unknown>).page_id ||
          ((t as Record<string, unknown>).page && typeof (t as Record<string, unknown>).page === 'object'
            ? ((t as Record<string, unknown>).page as Record<string, unknown>).id || ''
            : '')
        )
        all.push({ id, name, icon, pageId: pageId || undefined })
      }
      cursor = data.has_more ? data.next_cursor ?? null : null
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

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

async function fetchAndCacheSelectedDb(token: string, databaseId: string): Promise<CachedSelectedDb | null> {
  try {
    const { dataSourceId, name, icon, titlePropertyKey } = await getDatabaseFull(token, databaseId)
    const templates = await listTemplates(token, dataSourceId)

    // Deduplicate templates by ID
    const uniqueTemplates = Array.from(
      new Map(templates.map((t) => [t.id, t])).values()
    )

    const cached: CachedSelectedDb = { id: databaseId, dataSourceId, name, icon, titlePropertyKey, templates: uniqueTemplates }
    await new Promise<void>((resolve) => {
      chrome.storage.local.set(
        { [SELECTED_DB_CACHE_KEY]: JSON.stringify({ ...cached, ts: Date.now() }) },
        () => resolve()
      )
    })
    return cached
  } catch {
    return null
  }
}

async function getCachedSelectedDb(token: string, databaseId: string): Promise<CachedSelectedDb | null> {
  const raw = await new Promise<string | undefined>((resolve) => {
    chrome.storage.local.get([SELECTED_DB_CACHE_KEY], (r) => resolve((r as Record<string, string | undefined>)[SELECTED_DB_CACHE_KEY]))
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
          name: parsed.name || 'Sin nombre',
          icon: parsed.icon || null,
          titlePropertyKey: parsed.titlePropertyKey,
          templates: parsed.templates,
        }
      }
    } catch {
      /* ignore */
    }
  }
  return fetchAndCacheSelectedDb(token, databaseId)
}

async function forceRefreshSelectedDb(token: string, databaseId: string): Promise<CachedSelectedDb | null> {
  return fetchAndCacheSelectedDb(token, databaseId)
}

async function getDatabaseInfo(
  token: string,
  databaseId: string,
  forceRefresh = false
): Promise<{
  id: string
  name: string
  icon: NotionIcon
  templates: Array<{ id: string; name: string; icon?: NotionIcon }>
} | null> {
  const cached = forceRefresh
    ? await forceRefreshSelectedDb(token, databaseId)
    : await getCachedSelectedDb(token, databaseId)
  if (!cached) return null
  return {
    id: cached.id,
    name: cached.name,
    icon: cached.icon,
    templates: cached.templates,
  }
}

// ============================================================================
// CONTEXT MENU MANAGEMENT
// ============================================================================

function clearContextMenu(): Promise<void> {
  return new Promise((resolve) => {
    chrome.contextMenus.removeAll(() => resolve())
  })
}

function buildContextMenu(cached: CachedSelectedDb): Promise<void> {
  return new Promise(async (resolve) => {
    const order = await getTemplateOrder(cached.id)
    const sortedTemplates = sortTemplatesByOrder(cached.templates, order)

    chrome.contextMenus.create(
      {
        id: ROOT_MENU_ID,
        title: "Guardar '%s' en Notion",
        contexts: ['selection'],
      },
      () => {
        sortedTemplates.forEach((tpl) => {
          chrome.contextMenus.create(
            {
              id: `${MENU_ID_PREFIX}${tpl.id}`,
              parentId: ROOT_MENU_ID,
              title: getTemplateMenuTitle(tpl),
              contexts: ['selection'],
            },
            () => {}
          )
        })
        resolve()
      }
    )
  })
}

function buildContextMenuNoDb(): Promise<void> {
  return new Promise((resolve) => {
    chrome.contextMenus.create(
      {
        id: ROOT_MENU_ID,
        title: "Guardar '%s' en Notion",
        contexts: ['selection'],
      },
      () => {
        chrome.contextMenus.create(
          {
            id: 'notion-config-options',
            parentId: ROOT_MENU_ID,
            title: 'Configura la base de datos en Opciones',
            contexts: ['selection'],
          },
          () => resolve()
        )
      }
    )
  })
}

async function refreshContextMenu(): Promise<void> {
  await clearContextMenu()
  const token = await getToken()
  if (!token) return
  const selectedId = await getSelectedDatabaseId()
  if (!selectedId) {
    try {
      await buildContextMenuNoDb()
    } catch {
      /* ignore */
    }
    return
  }
  try {
    const cached = await getCachedSelectedDb(token, selectedId)
    if (cached) await buildContextMenu(cached)
  } catch {
    // no menu on error
  }
}

// ============================================================================
// PAGE CREATION
// ============================================================================

async function createPage(
  token: string,
  dataSourceId: string,
  titlePropertyKey: string,
  titleText: string,
  templateId: string
): Promise<{ url?: string }> {
  const body: Record<string, unknown> = {
    parent: { data_source_id: dataSourceId },
    properties: {
      [titlePropertyKey]: {
        title: [{ text: { content: titleText.slice(0, 2000) } }],
      },
    },
    template: { type: 'template_id', template_id: templateId },
  }
  const res = await notionFetch(token, '/v1/pages', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Create page failed: ${res.status} ${err}`)
  }
  const page = (await res.json()) as { url?: string }
  return page
}

function parseTemplateFromMenuId(menuItemId: string): string | null {
  if (!menuItemId.startsWith(MENU_ID_PREFIX)) return null
  const rest = menuItemId.slice(MENU_ID_PREFIX.length)
  return rest || null
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

chrome.runtime.onInstalled.addListener(() => {
  refreshContextMenu()
})

chrome.runtime.onStartup.addListener(() => {
  refreshContextMenu()
})

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === 'notion-config-options') {
    chrome.runtime.openOptionsPage?.()
    return
  }
  if (info.menuItemId !== ROOT_MENU_ID && typeof info.menuItemId === 'string' && info.menuItemId.startsWith(MENU_ID_PREFIX)) {
    const templateType = parseTemplateFromMenuId(info.menuItemId)
    const selectionText = (info.selectionText ?? '').trim()
    if (templateType === null || !selectionText) return
    const token = await getToken()
    if (!token) return
    const databaseId = await getSelectedDatabaseId()
    if (!databaseId) return
    const cached = await getCachedSelectedDb(token, databaseId)
    if (!cached) return
    try {
      await createPage(
        token,
        cached.dataSourceId,
        cached.titlePropertyKey,
        selectionText,
        templateType
      )
      const showNotif = await getNotificationsEnabled()
      if (showNotif && chrome.notifications) {
        chrome.notifications.create(`notion-save-${Date.now()}`, {
          type: 'basic',
          iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMTMuMDkgOC4yNkwyMCA5TDEzLjA5IDE1Ljc0TDEyIDIyTDEwLjkxIDE1Ljc0TDQgOUwxMC45MSA4LjI2TDEyIDJaIiBmaWxsPSIjMDAwIi8+Cjwvc3ZnPg==',
          title: 'Guardado en Notion',
          message: `Página creada: "${selectionText.slice(0, 50)}${selectionText.length > 50 ? '…' : ''}"`,
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (chrome.notifications) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMTMuMDkgOC4yNkwyMCA5TDEzLjA5IDE1Ljc0TDEyIDIyTDEwLjkxIDE1Ljc0TDQgOUwxMC45MSA4LjI2TDEyIDJaIiBmaWxsPSIjMDAwIi8+Cjwvc3ZnPg==',
          title: 'Error al guardar en Notion',
          message: msg.slice(0, 200),
        })
      }
    }
  }
})

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.notion_token) refreshContextMenu()
  if (areaName === 'sync' && changes[SELECTED_DB_STORAGE_KEY]) refreshContextMenu()
})

chrome.runtime.onMessage.addListener((msg: { type: string; token?: string; code?: string }, _sender, sendResponse) => {
  if (msg.type === 'SET_TOKEN' && msg.token !== undefined) {
    setToken(msg.token || null).then(() => {
      refreshContextMenu()
      sendResponse({ ok: true })
    })
    return true
  }
  if (msg.type === 'GET_TOKEN') {
    getToken().then((t) => sendResponse({ token: t }))
    return true
  }
  if (msg.type === 'GET_OAUTH_REDIRECT_URI') {
    sendResponse({ redirectUri: getOAuthRedirectUri() })
    return true
  }
  if (msg.type === 'START_OAUTH') {
    startOAuthSignIn()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        const errorMessage = err instanceof Error ? err.message : String(err)
        sendResponse({ ok: false, error: errorMessage })
      })
    return true
  }
  if (msg.type === 'OAUTH_CODE' && msg.code) {
    exchangeOAuthCode(msg.code)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        const errorMessage = err instanceof Error ? err.message : String(err)
        sendResponse({ ok: false, error: errorMessage })
      })
    return true
  }
  if (msg.type === 'REFRESH_MENU') {
    refreshContextMenu().then(() => sendResponse({ ok: true }))
    return true
  }
  if (msg.type === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage?.()
    sendResponse({ ok: true })
    return true
  }
  if (msg.type === 'GET_DATABASES') {
    getToken()
      .then((token) => {
        if (!token) return sendResponse({ databases: [] })
        return searchDataSources(token).then((dbs) => sendResponse({ databases: dbs }))
      })
      .catch(() => sendResponse({ databases: [] }))
    return true
  }
  if (msg.type === 'GET_SELECTED_DATABASE_ID') {
    getSelectedDatabaseId().then((id) => sendResponse({ databaseId: id }))
    return true
  }
  if (msg.type === 'GET_SELECTED_DATABASE_INFO') {
    getToken()
      .then((token) => {
        if (!token) return sendResponse({ database: null })
        return getSelectedDatabaseId().then((dbId) => {
          if (!dbId) return sendResponse({ database: null })
          const forceRefresh = Boolean((msg as unknown as { forceRefresh?: boolean }).forceRefresh)
          return getDatabaseInfo(token, dbId, forceRefresh).then((info) => sendResponse({ database: info }))
        })
      })
      .catch(() => sendResponse({ database: null }))
    return true
  }
  if (msg.type === 'SET_SELECTED_DATABASE_ID' && typeof (msg as unknown as { databaseId?: string }).databaseId !== 'undefined') {
    const id = ((msg as unknown) as { databaseId: string | null }).databaseId
    setSelectedDatabaseId(id).then(() => {
      refreshContextMenu()
      sendResponse({ ok: true })
    })
    return true
  }
  if (msg.type === 'SET_TEMPLATE_ORDER' && (msg as unknown as { databaseId?: string; order?: string[] }).databaseId) {
    const databaseId = ((msg as unknown) as { databaseId: string }).databaseId
    const order = ((msg as unknown) as { order?: string[] }).order || []
    setTemplateOrder(databaseId, order).then(() => {
      refreshContextMenu()
      sendResponse({ ok: true })
    })
    return true
  }
  if (msg.type === 'GET_TEMPLATE_ORDER' && (msg as unknown as { databaseId?: string }).databaseId) {
    const databaseId = ((msg as unknown) as { databaseId: string }).databaseId
    getTemplateOrder(databaseId).then((order) => {
      sendResponse({ order })
    })
    return true
  }
})

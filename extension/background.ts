/// <reference types="chrome" />
/**
 * Service Worker: Handles OAuth, Notion API communication, context menu management,
 * and page creation for the browser extension.
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const NOTION_VERSION = '2025-09-03'
const NOTION_API = 'https://api.notion.com'

// Context Menu
const ROOT_MENU_ID = 'notion-save-root'
const MENU_ID_PREFIX = 'notion_tpl_'
const MENU_SEPARATOR = '::'
const ROOT_MENU_BASE_TITLE = 'Save to Notion'

// Storage Keys
const SELECTED_DB_CACHE_KEY_PREFIX = 'notion_selected_db_cache_'
const SELECTED_DB_STORAGE_KEY = 'notion_selected_database_id'
const SELECTED_DB_STORAGE_IDS_KEY = 'notion_selected_database_ids'
const DATA_SOURCE_ORDER_KEY = 'notion_data_source_order'
const ACTIVE_DATA_SOURCE_IDS_KEY = 'notion_active_data_source_ids'
const ACTIVE_DATA_SOURCE_SELECTION_CONFIGURED_KEY = 'notion_active_data_source_selection_configured'
const TEMPLATE_ORDER_KEY = 'notion_template_order'
const DATA_SOURCES_LIST_CACHE_KEY = 'notion_data_sources_list_cache'
const AUTH_METHOD_KEY = 'notion_auth_method'
const OAUTH_CLIENT_ID_KEY = 'notion_oauth_client_id'
const OAUTH_PROXY_URL_KEY = 'notion_oauth_proxy_url'
const CACHE_TTL_MS = Number.MAX_SAFE_INTEGER // effectively no auto-expiration; user refresh controls updates
const DATA_SOURCES_CACHE_TTL_MS = Number.MAX_SAFE_INTEGER // effectively no auto-expiration; user refresh controls updates
const DEFAULT_OAUTH_CLIENT_ID = '305d872b-594c-805b-bbc6-0037cc398635'
const DEFAULT_OAUTH_PROXY_URL = 'https://my-notion-list.vercel.app/api/notion-token'
const TRUSTED_OAUTH_PROXY_ORIGINS = [new URL(DEFAULT_OAUTH_PROXY_URL).origin, 'http://localhost:3000', 'http://localhost:5173']

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
    chrome.storage.local.set({ notion_token: token ?? '', [DATA_SOURCES_LIST_CACHE_KEY]: '' }, resolve)
  })
}

function getAuthMethod(): Promise<'token' | 'oauth' | ''> {
  return new Promise((resolve) => {
    chrome.storage.local.get([AUTH_METHOD_KEY], (r) => {
      const value = String((r as Record<string, unknown>)[AUTH_METHOD_KEY] || '')
      resolve(value === 'token' || value === 'oauth' ? value : '')
    })
  })
}

function setAuthMethod(method: 'token' | 'oauth' | ''): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [AUTH_METHOD_KEY]: method }, () => resolve())
  })
}

async function clearNotionCaches(): Promise<void> {
  const keysToRemove = await new Promise<string[]>((resolve) => {
    chrome.storage.local.get(null, (items) => {
      const allKeys = Object.keys(items ?? {})
      resolve(
        allKeys.filter(
          (key) => key === DATA_SOURCES_LIST_CACHE_KEY || key.startsWith(SELECTED_DB_CACHE_KEY_PREFIX)
        )
      )
    })
  })
  if (keysToRemove.length === 0) return
  await new Promise<void>((resolve) => {
    chrome.storage.local.remove(keysToRemove, () => resolve())
  })
}

async function clearSelectedDbCaches(ids: string[]): Promise<void> {
  const normalized = normalizeDatabaseIds(ids)
  if (normalized.length === 0) return
  const keysToRemove = normalized.map((id) => `${SELECTED_DB_CACHE_KEY_PREFIX}${id}`)
  await new Promise<void>((resolve) => {
    chrome.storage.local.remove(keysToRemove, () => resolve())
  })
}

function normalizeDatabaseIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return []
  const unique = Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)))
  return unique
}

function sortIdsByOrder(ids: string[], order: string[]): string[] {
  const rank = new Map(order.map((id, index) => [id, index]))
  return [...ids].sort((a, b) => {
    const ra = rank.has(a) ? (rank.get(a) as number) : Number.MAX_SAFE_INTEGER
    const rb = rank.has(b) ? (rank.get(b) as number) : Number.MAX_SAFE_INTEGER
    if (ra !== rb) return ra - rb
    return 0
  })
}

function getDataSourceOrder(): Promise<string[]> {
  return new Promise((resolve) => {
    chrome.storage.sync.get([DATA_SOURCE_ORDER_KEY], (r) => {
      resolve(normalizeDatabaseIds(r[DATA_SOURCE_ORDER_KEY]))
    })
  })
}

function setDataSourceOrder(order: string[]): Promise<void> {
  const normalized = normalizeDatabaseIds(order)
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [DATA_SOURCE_ORDER_KEY]: normalized }, () => resolve())
  })
}

function getStoredActiveDataSourceIds(): Promise<string[] | null> {
  return new Promise((resolve) => {
    chrome.storage.sync.get([ACTIVE_DATA_SOURCE_IDS_KEY], (r) => {
      const raw = r[ACTIVE_DATA_SOURCE_IDS_KEY]
      if (typeof raw === 'undefined') return resolve(null)
      resolve(normalizeDatabaseIds(raw))
    })
  })
}

function getActiveDataSourceSelectionConfigured(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.sync.get([ACTIVE_DATA_SOURCE_SELECTION_CONFIGURED_KEY], (r) => {
      resolve(Boolean(r[ACTIVE_DATA_SOURCE_SELECTION_CONFIGURED_KEY]))
    })
  })
}

async function setActiveDataSourceIds(ids: string[], configured = false): Promise<void> {
  const normalized = normalizeDatabaseIds(ids)
  return new Promise<void>((resolve) => {
    chrome.storage.sync.set(
      {
        [ACTIVE_DATA_SOURCE_IDS_KEY]: normalized,
        [ACTIVE_DATA_SOURCE_SELECTION_CONFIGURED_KEY]: configured,
      },
      () => resolve()
    )
  })
}

async function getActiveDataSourceIds(availableIds: string[]): Promise<string[]> {
  const normalizedAvailable = normalizeDatabaseIds(availableIds)
  const stored = await getStoredActiveDataSourceIds()
  const configured = await getActiveDataSourceSelectionConfigured()

  // Default behavior: all accessible data sources are active until user customizes selection.
  if (!configured) {
    await setActiveDataSourceIds(normalizedAvailable, false)
    return normalizedAvailable
  }

  if (stored === null) {
    await setActiveDataSourceIds(normalizedAvailable, true)
    return normalizedAvailable
  }

  const availableSet = new Set(normalizedAvailable)
  const active = stored.filter((id) => availableSet.has(id))
  if (JSON.stringify(active) !== JSON.stringify(stored)) {
    await setActiveDataSourceIds(active, true)
  }
  return active
}

async function getOrderedDataSourceIds(token: string, forceRefresh = false): Promise<string[]> {
  const sources = await searchDataSources(token, forceRefresh)
  const sourceIds = normalizeDatabaseIds(sources.map((s) => s.id))
  const savedOrder = await getDataSourceOrder()
  const sorted = sortIdsByOrder(sourceIds, savedOrder)
  if (JSON.stringify(sorted) !== JSON.stringify(savedOrder)) {
    await setDataSourceOrder(sorted)
  }
  const activeIds = await getActiveDataSourceIds(sorted)
  const activeSet = new Set(activeIds)
  return sorted.filter((id) => activeSet.has(id))
}

function getSelectedDatabaseId(): Promise<string | null> {
  return new Promise((resolve) => {
    getToken()
      .then((token) => {
        if (!token) return resolve(null)
        return getOrderedDataSourceIds(token, false).then((ids) => resolve(ids[0] || null))
      })
      .catch(() => resolve(null))
  })
}

function getSelectedDatabaseIds(): Promise<string[]> {
  return new Promise((resolve) => {
    getToken()
      .then((token) => {
        if (!token) return resolve([])
        return getOrderedDataSourceIds(token, false).then((ids) => resolve(ids))
      })
      .catch(() => resolve([]))
  })
}

function setSelectedDatabaseId(id: string | null): Promise<void> {
  return setSelectedDatabaseIds(id ? [id] : [])
}

function setSelectedDatabaseIds(ids: string[]): Promise<void> {
  const normalized = normalizeDatabaseIds(ids)
  const primaryId = normalized[0] || ''
  return new Promise((resolve) => {
    chrome.storage.sync.set(
      {
        [SELECTED_DB_STORAGE_IDS_KEY]: normalized,
        [SELECTED_DB_STORAGE_KEY]: primaryId,
      },
      () => resolve()
    )
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

function isTrustedOAuthProxyUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    if (!/^https?:$/i.test(url.protocol)) return false
    if (url.protocol === 'http:' && url.hostname !== 'localhost') return false
    return TRUSTED_OAUTH_PROXY_ORIGINS.includes(url.origin)
  } catch {
    return false
  }
}

async function exchangeOAuthCode(code: string): Promise<void> {
  const { proxyUrl } = await getOAuthConfig()
  const redirectUri = getOAuthRedirectUri()
  if (!proxyUrl) throw new Error('OAuth proxy URL is missing in Settings.')
  if (!isTrustedOAuthProxyUrl(proxyUrl)) throw new Error('OAuth proxy is not allowed.')

  const res = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      redirect_uri: redirectUri,
    }),
  })
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string }
  if (!res.ok) throw new Error(data.error || 'OAuth exchange failed.')
  if (!data.access_token) throw new Error('OAuth proxy did not return access_token.')
  await setToken(data.access_token)
  await setAuthMethod('oauth')
  await refreshContextMenu()
}

async function startOAuthSignIn(): Promise<void> {
  const { clientId } = await getOAuthConfig()
  if (!clientId) throw new Error('Notion Client ID is missing in Settings.')

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
          reject(new Error(chrome.runtime.lastError.message || 'OAuth was canceled or blocked.'))
          return
        }
        if (!url) {
          reject(new Error('No OAuth callback URL was received.'))
          return
        }
        resolve(url)
      }
    )
  })

  const parsed = new URL(responseUrl)
  const returnedState = parsed.searchParams.get('state')
  if (!returnedState || returnedState !== state) throw new Error('Invalid OAuth state.')
  const oauthError = parsed.searchParams.get('error')
  if (oauthError) throw new Error(`Notion OAuth error: ${oauthError}`)
  const code = parsed.searchParams.get('code')
  if (!code) throw new Error('No authorization code was received.')

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
  return 'Untitled'
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

async function searchDataSources(token: string, forceRefresh = false): Promise<Array<{ id: string; name: string }>> {
  if (!forceRefresh) {
    const cachedRaw = await new Promise<string | undefined>((resolve) => {
      chrome.storage.local.get([DATA_SOURCES_LIST_CACHE_KEY], (r) =>
        resolve((r as Record<string, string | undefined>)[DATA_SOURCES_LIST_CACHE_KEY])
      )
    })
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw) as { ts: number; sources: Array<{ id: string; name: string }> }
        if (Date.now() - cached.ts < DATA_SOURCES_CACHE_TTL_MS && Array.isArray(cached.sources)) {
          return cached.sources
        }
      } catch {
        /* ignore malformed cache */
      }
    }
  }

  const byId = new Map<string, { id: string; name: string }>()

  const fetchSearch = async (payload: Record<string, unknown>): Promise<void> => {
    let startCursor: string | null = null
    let hasMore = true
    while (hasMore) {
      const body = startCursor ? { ...payload, start_cursor: startCursor } : payload
      const res = await notionFetch(token, '/v1/search', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      if (!res.ok) break
      const data = (await res.json()) as {
        results?: Array<{ object: string; id: string; title?: Array<{ plain_text: string }> }>
        has_more?: boolean
        next_cursor?: string | null
      }
      const results = data.results ?? []
      for (const r of results) {
        if (r.object !== 'data_source' && r.object !== 'database') continue
        if (!byId.has(r.id)) {
          byId.set(r.id, { id: r.id, name: getTitleFromResult(r) || 'Untitled' })
        }
      }
      hasMore = Boolean(data.has_more)
      startCursor = data.next_cursor ?? null
    }
  }

  // Most robust path: no filter, then compatibility fallbacks.
  await fetchSearch({ page_size: 100 })
  if (byId.size === 0) {
    await fetchSearch({ filter: { property: 'object', value: 'data_source' }, page_size: 100 })
  }
  if (byId.size === 0) {
    await fetchSearch({ filter: { property: 'object', value: 'database' }, page_size: 100 })
  }

  const result = Array.from(byId.values())
  await new Promise<void>((resolve) => {
    chrome.storage.local.set(
      { [DATA_SOURCES_LIST_CACHE_KEY]: JSON.stringify({ ts: Date.now(), sources: result }) },
      () => resolve()
    )
  })
  return result
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
      ? dataSource.title.map((t) => t.plain_text ?? '').join('').trim() || 'Untitled'
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
    ? database.title.map((t) => t.plain_text ?? '').join('').trim() || 'Untitled'
    : 'Untitled'
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
        const name = String((t as Record<string, unknown>).name || 'Untitled')
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
    const cacheKey = `${SELECTED_DB_CACHE_KEY_PREFIX}${databaseId}`
    await new Promise<void>((resolve) => {
      chrome.storage.local.set(
        { [cacheKey]: JSON.stringify({ ...cached, ts: Date.now() }) },
        () => resolve()
      )
    })
    return cached
  } catch {
    return null
  }
}

async function getCachedSelectedDb(token: string, databaseId: string): Promise<CachedSelectedDb | null> {
  const cacheKey = `${SELECTED_DB_CACHE_KEY_PREFIX}${databaseId}`
  const raw = await new Promise<string | undefined>((resolve) => {
    chrome.storage.local.get([cacheKey], (r) => resolve((r as Record<string, string | undefined>)[cacheKey]))
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

async function getAllDatabaseInfos(
  token: string,
  forceRefresh = false
): Promise<Array<{ id: string; name: string; icon: NotionIcon; templates: Array<{ id: string; name: string; icon?: NotionIcon }> }>> {
  const orderedIds = await getOrderedDataSourceIds(token, forceRefresh)
  const infos = await Promise.all(orderedIds.map((id) => getDatabaseInfo(token, id, forceRefresh)))
  return infos.filter((info): info is { id: string; name: string; icon: NotionIcon; templates: Array<{ id: string; name: string; icon?: NotionIcon }> } => Boolean(info))
}

// ============================================================================
// CONTEXT MENU MANAGEMENT
// ============================================================================

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

function truncateLabel(text: string, maxChars = 20): string {
  const normalized = text.trim().replace(/\s+/g, ' ')
  if (normalized.length <= maxChars) return normalized
  return `${normalized.slice(0, maxChars)}...`
}

function parseTemplateFromMenuId(menuItemId: string): { databaseId: string; templateId: string } | null {
  if (!menuItemId.startsWith(MENU_ID_PREFIX)) return null
  const rest = menuItemId.slice(MENU_ID_PREFIX.length)
  const [databaseId, templateId] = rest.split(MENU_SEPARATOR)
  if (!databaseId || !templateId) return null
  return { databaseId, templateId }
}

function buildContextMenu(cachedItems: CachedSelectedDb[]): Promise<void> {
  return new Promise(async (resolve) => {
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

    resolve()
  })
}

function buildContextMenuNoDb(): Promise<void> {
  return new Promise((resolve) => {
    chrome.contextMenus.create(
      {
        id: ROOT_MENU_ID,
        title: ROOT_MENU_BASE_TITLE,
        contexts: ['selection'],
      },
      () => {
        chrome.contextMenus.create(
          {
            id: 'notion-config-options',
            parentId: ROOT_MENU_ID,
            title: 'Configure data sources in Settings',
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
  const selectedIds = await getSelectedDatabaseIds()
  if (selectedIds.length === 0) {
    try {
      await buildContextMenuNoDb()
    } catch {
      /* ignore */
    }
    return
  }
  try {
    const cachedItems = (await Promise.all(selectedIds.map((id) => getCachedSelectedDb(token, id)))).filter(
      (item): item is CachedSelectedDb => Boolean(item)
    )
    if (cachedItems.length > 0) await buildContextMenu(cachedItems)
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

function openOptionsInTab(): void {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage()
    return
  }
  const optionsUrl = chrome.runtime.getURL('options.html')
  chrome.tabs.create?.({ url: optionsUrl }, () => {})
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
    openOptionsInTab()
    return
  }
  if (info.menuItemId !== ROOT_MENU_ID && typeof info.menuItemId === 'string' && info.menuItemId.startsWith(MENU_ID_PREFIX)) {
    const parsedTemplate = parseTemplateFromMenuId(info.menuItemId)
    const selectionText = (info.selectionText ?? '').trim()
    if (!parsedTemplate || !selectionText) return
    const token = await getToken()
    if (!token) return
    const cached = await getCachedSelectedDb(token, parsedTemplate.databaseId)
    if (!cached) return
    try {
      await createPage(
        token,
        cached.dataSourceId,
        cached.titlePropertyKey,
        selectionText,
        parsedTemplate.templateId
      )
    } catch (err) {
      // Keep silent in UI; surfaced via console for debugging.
      console.error('Error while saving to Notion:', err)
    }
  }
})

chrome.contextMenus.onShown?.addListener((info) => {
  if (!info.selectionText) return
  const label = truncateLabel(info.selectionText)
  chrome.contextMenus.update(ROOT_MENU_ID, { title: `Save '${label}' to Notion` }, () => {
    chrome.contextMenus.refresh()
  })
})

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.notion_token) refreshContextMenu()
  if (
    areaName === 'sync' &&
    (changes[SELECTED_DB_STORAGE_KEY] ||
      changes[SELECTED_DB_STORAGE_IDS_KEY] ||
      changes[DATA_SOURCE_ORDER_KEY] ||
      changes[ACTIVE_DATA_SOURCE_IDS_KEY])
  ) refreshContextMenu()
})

chrome.runtime.onMessage.addListener((msg: { type: string; token?: string; code?: string }, _sender, sendResponse) => {
  if (msg.type === 'SET_TOKEN' && msg.token !== undefined) {
    const nextToken = msg.token || null
    Promise.all([setToken(nextToken), setAuthMethod(nextToken ? 'token' : '')]).then(() => {
      refreshContextMenu()
      sendResponse({ ok: true })
    })
    return true
  }
  if (msg.type === 'GET_TOKEN') {
    getToken().then((t) => sendResponse({ token: t }))
    return true
  }
  if (msg.type === 'GET_AUTH_METHOD') {
    getAuthMethod().then((method) => sendResponse({ method }))
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
        const raw = err instanceof Error ? err.message : String(err)
        const errorMessage = /cancelado|canceled|blocked|bloqueado/i.test(raw)
          ? 'Sign-in canceled.'
          : 'Could not sign in to Notion. Check OAuth configuration.'
        sendResponse({ ok: false, error: errorMessage })
      })
    return true
  }
  if (msg.type === 'REFRESH_MENU') {
    refreshContextMenu().then(() => sendResponse({ ok: true }))
    return true
  }
  if (msg.type === 'HARD_SYNC') {
    clearNotionCaches()
      .then(() => refreshContextMenu())
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }))
    return true
  }
  if (msg.type === 'OPEN_OPTIONS') {
    openOptionsInTab()
    sendResponse({ ok: true })
    return true
  }
  if (msg.type === 'GET_DATABASES') {
    getToken()
      .then((token) => {
        if (!token) return sendResponse({ databases: [] })
        return searchDataSources(token).then(async (dbs) => {
          const allIds = normalizeDatabaseIds(dbs.map((db) => db.id))
          const activeIds = await getActiveDataSourceIds(allIds)
          sendResponse({ databases: dbs, activeIds })
        })
      })
      .catch(() => sendResponse({ databases: [] }))
    return true
  }
  if (msg.type === 'GET_ACTIVE_DATA_SOURCE_IDS') {
    getToken()
      .then((token) => {
        if (!token) return sendResponse({ activeIds: [] })
        return searchDataSources(token).then(async (dbs) => {
          const allIds = normalizeDatabaseIds(dbs.map((db) => db.id))
          const activeIds = await getActiveDataSourceIds(allIds)
          sendResponse({ activeIds })
        })
      })
      .catch(() => sendResponse({ activeIds: [] }))
    return true
  }
  if (msg.type === 'SET_ACTIVE_DATA_SOURCE_IDS' && Array.isArray((msg as unknown as { ids?: unknown[] }).ids)) {
    const requestedIds = normalizeDatabaseIds((msg as unknown as { ids: string[] }).ids)
    getToken()
      .then((token) => {
        if (!token) {
          return setActiveDataSourceIds(requestedIds, true).then(() => sendResponse({ ok: true }))
        }
        return searchDataSources(token).then(async (dbs) => {
          const allIds = normalizeDatabaseIds(dbs.map((db) => db.id))
          const allowedSet = new Set(allIds)
          const nextActive = requestedIds.filter((id) => allowedSet.has(id))
          const prevActive = await getActiveDataSourceIds(allIds)
          const nextActiveSet = new Set(nextActive)
          const disabled = prevActive.filter((id) => !nextActiveSet.has(id))

          await setActiveDataSourceIds(nextActive, true)
          await clearSelectedDbCaches(disabled)
          await refreshContextMenu()
          sendResponse({ ok: true, activeIds: nextActive })
        })
      })
      .catch(() => sendResponse({ ok: false }))
    return true
  }
  if (msg.type === 'GET_SELECTED_DATABASE_ID') {
    getSelectedDatabaseId().then((id) => sendResponse({ databaseId: id }))
    return true
  }
  if (msg.type === 'GET_SELECTED_DATABASE_IDS') {
    getSelectedDatabaseIds().then((ids) => sendResponse({ databaseIds: ids }))
    return true
  }
  if (msg.type === 'GET_DATA_SOURCE_ORDER') {
    getDataSourceOrder().then((order) => sendResponse({ order }))
    return true
  }
  if (msg.type === 'SET_DATA_SOURCE_ORDER' && Array.isArray((msg as unknown as { order?: unknown[] }).order)) {
    const order = normalizeDatabaseIds((msg as unknown as { order: string[] }).order)
    setDataSourceOrder(order).then(() => {
      refreshContextMenu()
      sendResponse({ ok: true })
    })
    return true
  }
  if (msg.type === 'GET_ALL_DATABASE_INFOS') {
    getToken()
      .then((token) => {
        if (!token) return sendResponse({ databases: [] })
        const forceRefresh = Boolean((msg as unknown as { forceRefresh?: boolean }).forceRefresh)
        return getAllDatabaseInfos(token, forceRefresh).then((databases) => sendResponse({ databases }))
      })
      .catch(() => sendResponse({ databases: [] }))
    return true
  }
  if (msg.type === 'GET_SELECTED_DATABASE_INFO') {
    getToken()
      .then((token) => {
        if (!token) return sendResponse({ database: null })
        return getSelectedDatabaseIds().then((ids) => {
          const dbId = ids[0] || null
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
  if (msg.type === 'SET_SELECTED_DATABASE_IDS' && Array.isArray((msg as unknown as { databaseIds?: unknown[] }).databaseIds)) {
    const ids = ((msg as unknown) as { databaseIds: string[] }).databaseIds
    Promise.all([setSelectedDatabaseIds(ids), setDataSourceOrder(ids)]).then(() => {
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

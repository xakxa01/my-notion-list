import { useCallback, useEffect, useState } from 'react'

declare const chrome: {
  runtime: { sendMessage: (msg: unknown, cb: (r: unknown) => void) => void }
  storage: {
    onChanged?: {
      addListener: (
        listener: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void
      ) => void
      removeListener: (
        listener: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void
      ) => void
    }
    sync: {
      get: (keys: string[], cb: (r: Record<string, unknown>) => void) => void
      set: (items: Record<string, unknown>, cb?: () => void) => void
    }
  }
}

const OAUTH_CLIENT_ID_KEY = 'notion_oauth_client_id'
const OAUTH_PROXY_URL_KEY = 'notion_oauth_proxy_url'
const DEFAULT_OAUTH_CLIENT_ID = '305d872b-594c-805b-bbc6-0037cc398635'
const DEFAULT_OAUTH_PROXY_URL = 'https://my-notion-list.vercel.app/api/notion-token'
const TRUSTED_OAUTH_PROXY_URLS = [
  DEFAULT_OAUTH_PROXY_URL,
  'http://localhost:3000/api/notion-token',
  'http://localhost:5173/api/notion-token',
]
const LINK_SAVE_DEFAULT_URL_PROPERTY_KEY_PREFIX = 'notion_link_default_url_property_'

type DbOption = { id: string; name: string }
type AuthMethod = 'token' | 'oauth' | ''
type LinkSaveMode = 'auto' | 'ask' | 'off'
type UrlPropertyInfo = { id: string; name: string; urlProperties: string[] }

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())
}

function normalizeUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim())
    if (!/^https?:$/i.test(url.protocol)) return null
    if (url.protocol === 'http:' && url.hostname !== 'localhost') return null
    url.search = ''
    url.hash = ''
    if (url.pathname.endsWith('/')) url.pathname = url.pathname.slice(0, -1)
    return url.toString()
  } catch {
    return null
  }
}

export default function Options() {
  const [databases, setDatabases] = useState<DbOption[]>([])
  const [urlPropertySources, setUrlPropertySources] = useState<UrlPropertyInfo[]>([])
  const [urlPropertyDefaults, setUrlPropertyDefaults] = useState<Record<string, string>>({})
  const [activeIds, setActiveIds] = useState<string[]>([])
  const [loadingDbs, setLoadingDbs] = useState(false)
  const [dbLoadMessage, setDbLoadMessage] = useState<string | null>(null)
  const [savingAccess, setSavingAccess] = useState(false)
  const [reconnectLoading, setReconnectLoading] = useState(false)
  const [reconnectMessage, setReconnectMessage] = useState<string | null>(null)
  const [linkSaveMode, setLinkSaveMode] = useState<LinkSaveMode>('auto')
  const [authMethod, setAuthMethod] = useState<AuthMethod>('')
  const [oauthClientId, setOauthClientId] = useState('')
  const [oauthProxyUrl, setOauthProxyUrl] = useState('')
  const [oauthRedirectUri, setOauthRedirectUri] = useState('')
  const [oauthConfigMessage, setOauthConfigMessage] = useState<string | null>(null)

  const loadLinkSettings = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'GET_LINK_SAVE_SETTINGS' }, (r: unknown) => {
      const mode = String((r as { mode?: string }).mode || 'auto')
      setLinkSaveMode(mode === 'ask' || mode === 'off' ? (mode as LinkSaveMode) : 'auto')
    })

    chrome.runtime.sendMessage({ type: 'GET_DATA_SOURCES_WITH_URL_PROPERTIES' }, (r: unknown) => {
      const list = ((r as { databases?: UrlPropertyInfo[] }).databases ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        urlProperties: Array.isArray(item.urlProperties) ? item.urlProperties : [],
      }))
      setUrlPropertySources(list)

      const storageKeys = list.map(
        (item) => `${LINK_SAVE_DEFAULT_URL_PROPERTY_KEY_PREFIX}${item.id}`
      )
      if (storageKeys.length === 0) {
        setUrlPropertyDefaults({})
        return
      }
      chrome.storage.sync.get(storageKeys, (res) => {
        const defaults: Record<string, string> = {}
        list.forEach((item) => {
          const key = `${LINK_SAVE_DEFAULT_URL_PROPERTY_KEY_PREFIX}${item.id}`
          const value = String(res[key] || '').trim()
          if (value) defaults[item.id] = value
        })
        setUrlPropertyDefaults(defaults)
      })
    })
  }, [])

  const loadDataSources = useCallback(() => {
    setLoadingDbs(true)
    setDbLoadMessage('Loading Notion data sources...')
    chrome.runtime.sendMessage({ type: 'GET_DATABASES' }, (r: unknown) => {
      setLoadingDbs(false)
      const raw = (r as { databases?: DbOption[] })?.databases ?? []
      const list = Array.from(new Map(raw.map((db) => [db.id, db])).values())
      const hasExplicitActiveIds = Array.isArray((r as { activeIds?: unknown }).activeIds)
      const rawActive = hasExplicitActiveIds
        ? ((r as { activeIds?: string[] }).activeIds ?? [])
        : list.map((db) => db.id)
      const activeSet = new Set(rawActive)
      setDatabases(list)
      setActiveIds(list.map((db) => db.id).filter((id) => activeSet.has(id)))
      setDbLoadMessage(
        list.length === 0 ? 'No accessible data sources were found for this account/token.' : null
      )
      loadLinkSettings()
    })
  }, [loadLinkSettings])

  useEffect(() => {
    chrome.storage.sync.get([OAUTH_CLIENT_ID_KEY, OAUTH_PROXY_URL_KEY], (r) => {
      setOauthClientId(String(r[OAUTH_CLIENT_ID_KEY] || DEFAULT_OAUTH_CLIENT_ID))
      setOauthProxyUrl(String(r[OAUTH_PROXY_URL_KEY] || DEFAULT_OAUTH_PROXY_URL))
    })

    chrome.runtime.sendMessage({ type: 'GET_OAUTH_REDIRECT_URI' }, (r: unknown) => {
      const redirectUri = (r as { redirectUri?: string })?.redirectUri || ''
      setOauthRedirectUri(redirectUri)
    })
    chrome.runtime.sendMessage({ type: 'GET_AUTH_METHOD' }, (r: unknown) => {
      const method = String((r as { method?: string })?.method || '')
      setAuthMethod(method === 'token' || method === 'oauth' ? (method as AuthMethod) : '')
    })
    loadDataSources()

    const handleStorageChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== 'local') return
      if (changes['notion_token']) {
        const nextValue = changes['notion_token'].newValue
        if (!nextValue) {
          window.close()
        }
      }
      if (changes['notion_auth_method']) {
        const nextMethod = String(changes['notion_auth_method'].newValue || '')
        setAuthMethod(
          nextMethod === 'token' || nextMethod === 'oauth' ? (nextMethod as AuthMethod) : ''
        )
      }
    }
    chrome.storage.onChanged?.addListener(handleStorageChanged)
    return () => chrome.storage.onChanged?.removeListener(handleStorageChanged)
  }, [loadDataSources])

  const handleOAuthClientIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setOauthClientId(value)
    const normalized = value.trim()
    if (!isValidUuid(normalized)) {
      setOauthConfigMessage('OAuth Client ID must be a valid UUID.')
      return
    }
    setOauthConfigMessage(null)
    chrome.storage.sync.set({ [OAUTH_CLIENT_ID_KEY]: normalized })
  }

  const handleOAuthProxyUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setOauthProxyUrl(value)
    const normalized = normalizeUrl(value)
    if (!normalized) {
      setOauthConfigMessage('OAuth proxy URL is invalid.')
      return
    }
    const trusted = new Set(
      TRUSTED_OAUTH_PROXY_URLS.map((url) => normalizeUrl(url)).filter(
        (url): url is string => Boolean(url)
      )
    )
    if (!trusted.has(normalized)) {
      setOauthConfigMessage('OAuth proxy URL must be an approved endpoint.')
      return
    }
    setOauthConfigMessage(null)
    chrome.storage.sync.set({ [OAUTH_PROXY_URL_KEY]: normalized })
  }

  const handleToggleDataSource = (id: string, checked: boolean) => {
    const currentSet = new Set(activeIds)
    if (checked) currentSet.add(id)
    else currentSet.delete(id)
    const next = databases.map((db) => db.id).filter((dbId) => currentSet.has(dbId))
    setActiveIds(next)
    setSavingAccess(true)
    chrome.runtime.sendMessage({ type: 'SET_ACTIVE_DATA_SOURCE_IDS', ids: next }, () => {
      setSavingAccess(false)
    })
  }

  const handleReconnectNotionAccess = () => {
    setReconnectLoading(true)
    setReconnectMessage(null)
    chrome.runtime.sendMessage({ type: 'START_OAUTH' }, (r: unknown) => {
      setReconnectLoading(false)
      if ((r as { ok?: boolean })?.ok) {
        setReconnectMessage('Access updated.')
        loadDataSources()
      } else {
        const error = (r as { error?: string })?.error
        setReconnectMessage(error || 'Could not update access.')
      }
    })
  }

  const handleLinkSaveModeChange = (mode: LinkSaveMode) => {
    setLinkSaveMode(mode)
    chrome.runtime.sendMessage({ type: 'SET_LINK_SAVE_SETTINGS', mode }, () => {})
  }

  const handleDefaultUrlPropertyChange = (databaseId: string, propertyKey: string) => {
    setUrlPropertyDefaults((prev) => ({ ...prev, [databaseId]: propertyKey }))
    chrome.runtime.sendMessage(
      { type: 'SET_DEFAULT_URL_PROPERTY', databaseId, propertyKey },
      () => {}
    )
  }

  return (
    <div className="options-shell">
      <h1 className="options-title">Settings - My Notion List</h1>

      <div className="options-section">
        <label className="options-label">Data source access</label>
        <p className="options-help">
          Enable or disable which accessible data sources should be used in the extension.
        </p>

        <div className="options-card">
          <div className="options-card-head">
            <span className="options-card-title">Detected data sources</span>
            <span className="options-count">{databases.length}</span>
          </div>

          <div className="options-actions">
            <button
              type="button"
              className="options-btn"
              onClick={loadDataSources}
              disabled={loadingDbs || savingAccess}
            >
              {loadingDbs ? 'Refreshing...' : 'Refresh accessible list'}
            </button>
            <button
              type="button"
              className="options-btn"
              onClick={handleReconnectNotionAccess}
              disabled={loadingDbs || savingAccess || reconnectLoading || authMethod === 'token'}
              title={
                authMethod === 'token'
                  ? 'Available only when signed in with Notion OAuth.'
                  : undefined
              }
            >
              {reconnectLoading ? 'Opening Notion...' : 'Reconnect Notion access'}
            </button>
            {savingAccess && <span className="options-inline-note">Saving...</span>}
          </div>

          {(loadingDbs || dbLoadMessage || reconnectMessage) && (
            <p className="options-note">
              {loadingDbs ? 'Checking access...' : reconnectMessage || dbLoadMessage}
            </p>
          )}

          {databases.length > 0 && (
            <ul className="options-list">
              {databases.map((db) => (
                <li key={db.id} className="options-list-item">
                  <label className="options-list-label">
                    <input
                      type="checkbox"
                      checked={activeIds.includes(db.id)}
                      onChange={(e) => handleToggleDataSource(db.id, e.target.checked)}
                      disabled={savingAccess}
                      className="options-checkbox"
                    />
                    <span>{db.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <details className="options-details">
        <summary className="options-summary">Advanced configuration (OAuth)</summary>

        <label className="options-field-label" htmlFor="oauth-client-id">
          OAuth Client ID (Notion)
        </label>
        <input
          id="oauth-client-id"
          className="options-input"
          type="text"
          value={oauthClientId}
          onChange={handleOAuthClientIdChange}
          placeholder="Example: 01234567-89ab-cdef-0123-456789abcdef"
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="off"
          spellCheck={false}
        />

        <label className="options-field-label" htmlFor="oauth-proxy-url">
          OAuth proxy URL
        </label>
        <input
          id="oauth-proxy-url"
          className="options-input"
          type="url"
          value={oauthProxyUrl}
          onChange={handleOAuthProxyUrlChange}
          placeholder="https://your-project.vercel.app/api/notion-token"
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="off"
          spellCheck={false}
        />

        <label className="options-field-label" htmlFor="oauth-redirect-uri">
          Redirect URI for Notion
        </label>
        <input
          id="oauth-redirect-uri"
          className="options-input"
          type="text"
          value={oauthRedirectUri}
          readOnly
        />
        {oauthConfigMessage && <p className="options-note">{oauthConfigMessage}</p>}
      </details>

      <div className="options-section">
        <label className="options-label">Link saving</label>
        <p className="options-help">
          Choose if the extension should add the current page URL to a URL property.
        </p>
        <div className="options-card">
          <div className="options-radio-group">
            <label className="options-radio">
              <input
                type="radio"
                checked={linkSaveMode === 'auto'}
                onChange={() => handleLinkSaveModeChange('auto')}
              />
              <span>Auto-add the link</span>
            </label>
            <label className="options-radio">
              <input
                type="radio"
                checked={linkSaveMode === 'ask'}
                onChange={() => handleLinkSaveModeChange('ask')}
              />
              <span>Ask before adding the link</span>
            </label>
            <label className="options-radio">
              <input
                type="radio"
                checked={linkSaveMode === 'off'}
                onChange={() => handleLinkSaveModeChange('off')}
              />
              <span>Do not save the link</span>
            </label>
          </div>

          {linkSaveMode !== 'off' && (
            <div className="options-subsection">
              <div className="options-subtitle">Default URL property (per data source)</div>
              {urlPropertySources.filter((item) => item.urlProperties.length > 0).length === 0 ? (
                <p className="options-note">No URL properties detected yet.</p>
              ) : (
                <ul className="options-list">
                  {urlPropertySources
                    .filter((item) => item.urlProperties.length > 0)
                    .map((item) => {
                      const defaultValue =
                        urlPropertyDefaults[item.id] || item.urlProperties[0] || ''
                      return (
                        <li key={item.id} className="options-list-item">
                          <div className="options-url-row">
                            <span className="options-url-name">{item.name}</span>
                            <select
                              className="options-select"
                              value={defaultValue}
                              onChange={(e) =>
                                handleDefaultUrlPropertyChange(item.id, e.target.value)
                              }
                            >
                              {item.urlProperties.map((prop) => (
                                <option key={prop} value={prop}>
                                  {prop}
                                </option>
                              ))}
                            </select>
                          </div>
                        </li>
                      )
                    })}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

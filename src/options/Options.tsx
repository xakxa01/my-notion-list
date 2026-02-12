import { useEffect, useState } from 'react'

declare const chrome: {
  runtime: { sendMessage: (msg: unknown, cb: (r: unknown) => void) => void }
  storage: {
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

type DbOption = { id: string; name: string }

export default function Options() {
  const [databases, setDatabases] = useState<DbOption[]>([])
  const [activeIds, setActiveIds] = useState<string[]>([])
  const [loadingDbs, setLoadingDbs] = useState(false)
  const [dbLoadMessage, setDbLoadMessage] = useState<string | null>(null)
  const [savingAccess, setSavingAccess] = useState(false)
  const [reconnectLoading, setReconnectLoading] = useState(false)
  const [reconnectMessage, setReconnectMessage] = useState<string | null>(null)
  const [oauthClientId, setOauthClientId] = useState('')
  const [oauthProxyUrl, setOauthProxyUrl] = useState('')
  const [oauthRedirectUri, setOauthRedirectUri] = useState('')

  const loadDataSources = () => {
    setLoadingDbs(true)
    setDbLoadMessage('Loading Notion data sources...')
    chrome.runtime.sendMessage({ type: 'GET_DATABASES' }, (r: unknown) => {
      setLoadingDbs(false)
      const raw = (r as { databases?: DbOption[] })?.databases ?? []
      const list = Array.from(new Map(raw.map((db) => [db.id, db])).values())
      const rawActive = (r as { activeIds?: string[] })?.activeIds ?? []
      const activeSet = new Set(rawActive.length > 0 ? rawActive : list.map((db) => db.id))
      setDatabases(list)
      setActiveIds(list.map((db) => db.id).filter((id) => activeSet.has(id)))
      setDbLoadMessage(list.length === 0 ? 'No accessible data sources were found for this account/token.' : null)
    })
  }

  useEffect(() => {
    chrome.storage.sync.get([OAUTH_CLIENT_ID_KEY, OAUTH_PROXY_URL_KEY], (r) => {
      setOauthClientId(String(r[OAUTH_CLIENT_ID_KEY] || DEFAULT_OAUTH_CLIENT_ID))
      setOauthProxyUrl(String(r[OAUTH_PROXY_URL_KEY] || DEFAULT_OAUTH_PROXY_URL))
    })

    chrome.runtime.sendMessage({ type: 'GET_OAUTH_REDIRECT_URI' }, (r: unknown) => {
      const redirectUri = (r as { redirectUri?: string })?.redirectUri || ''
      setOauthRedirectUri(redirectUri)
    })
    loadDataSources()
  }, [])

  const handleOAuthClientIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setOauthClientId(value)
    chrome.storage.sync.set({ [OAUTH_CLIENT_ID_KEY]: value.trim() })
  }

  const handleOAuthProxyUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setOauthProxyUrl(value)
    chrome.storage.sync.set({ [OAUTH_PROXY_URL_KEY]: value.trim() })
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

  return (
    <div>
      <h1>Settings - My Notion List</h1>

      <div className="option-block">
        <label className="option-label">Data source access</label>
        <p className="option-hint">
          Enable or disable which accessible data sources should be used in the extension.
        </p>
        <div className="data-source-card">
          <div className="data-source-header">
            <span className="data-source-title">Detected data sources</span>
            <span className="data-source-count">{databases.length}</span>
          </div>
          <div className="data-source-actions">
            <button type="button" className="refresh-btn" onClick={loadDataSources} disabled={loadingDbs || savingAccess}>
              {loadingDbs ? 'Refreshing...' : 'Refresh accessible list'}
            </button>
            <button
              type="button"
              className="refresh-btn"
              onClick={handleReconnectNotionAccess}
              disabled={loadingDbs || savingAccess || reconnectLoading}
            >
              {reconnectLoading ? 'Opening Notion...' : 'Reconnect Notion access'}
            </button>
            {savingAccess && <span className="option-hint">Saving...</span>}
          </div>
          {(loadingDbs || dbLoadMessage || reconnectMessage) && (
            <p className="option-hint data-source-message">
              {loadingDbs ? 'Checking access...' : reconnectMessage || dbLoadMessage}
            </p>
          )}
          {databases.length > 0 && (
            <ul className="data-source-list">
              {databases.map((db) => (
                <li key={db.id} className="data-source-item">
                  <label className="data-source-item-label">
                    <input
                      type="checkbox"
                      checked={activeIds.includes(db.id)}
                      onChange={(e) => handleToggleDataSource(db.id, e.target.checked)}
                      disabled={savingAccess}
                    />
                    <span>{db.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <details className="option-block">
        <summary className="option-label" style={{ cursor: 'pointer' }}>
          Advanced configuration (OAuth)
        </summary>
        <label className="option-label" htmlFor="oauth-client-id" style={{ marginTop: 10 }}>
          OAuth Client ID (Notion)
        </label>
        <input
          id="oauth-client-id"
          className="option-input"
          type="text"
          value={oauthClientId}
          onChange={handleOAuthClientIdChange}
          placeholder="Example: 01234567-89ab-cdef-0123-456789abcdef"
        />
        <label className="option-label" htmlFor="oauth-proxy-url" style={{ marginTop: 10 }}>
          OAuth proxy URL
        </label>
        <input
          id="oauth-proxy-url"
          className="option-input"
          type="url"
          value={oauthProxyUrl}
          onChange={handleOAuthProxyUrlChange}
          placeholder="https://your-project.vercel.app/api/notion-token"
        />
        <label className="option-label" htmlFor="oauth-redirect-uri" style={{ marginTop: 10 }}>
          Redirect URI for Notion
        </label>
        <input id="oauth-redirect-uri" className="option-input" type="text" value={oauthRedirectUri} readOnly />
      </details>
    </div>
  )
}

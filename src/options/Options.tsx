import { useEffect, useState } from 'react'

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

type DbOption = { id: string; name: string }
type AuthMethod = 'token' | 'oauth' | ''

export default function Options() {
  const [databases, setDatabases] = useState<DbOption[]>([])
  const [activeIds, setActiveIds] = useState<string[]>([])
  const [loadingDbs, setLoadingDbs] = useState(false)
  const [dbLoadMessage, setDbLoadMessage] = useState<string | null>(null)
  const [savingAccess, setSavingAccess] = useState(false)
  const [reconnectLoading, setReconnectLoading] = useState(false)
  const [reconnectMessage, setReconnectMessage] = useState<string | null>(null)
  const [authMethod, setAuthMethod] = useState<AuthMethod>('')
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
    <div className="min-w-[360px] p-4 font-sans text-[14px] text-zinc-900">
      <h1 className="mb-4 text-[1.25rem] font-semibold">Settings - My Notion List</h1>

      <div className="mb-5">
        <label className="mb-1.5 block font-medium">Data source access</label>
        <p className="mt-1 text-xs text-zinc-500">
          Enable or disable which accessible data sources should be used in the extension.
        </p>

        <div className="mt-2.5 rounded-[10px] border border-zinc-300 bg-white p-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-zinc-800">Detected data sources</span>
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-zinc-300 bg-zinc-50 text-xs text-zinc-700">
              {databases.length}
            </span>
          </div>

          <div className="mb-1.5 flex items-center gap-2.5">
            <button
              type="button"
              className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-70"
              onClick={loadDataSources}
              disabled={loadingDbs || savingAccess}
            >
              {loadingDbs ? 'Refreshing...' : 'Refresh accessible list'}
            </button>
            <button
              type="button"
              className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-70"
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
            {savingAccess && <span className="text-xs text-zinc-500">Saving...</span>}
          </div>

          {(loadingDbs || dbLoadMessage || reconnectMessage) && (
            <p className="mb-2 text-xs text-zinc-500">
              {loadingDbs ? 'Checking access...' : reconnectMessage || dbLoadMessage}
            </p>
          )}

          {databases.length > 0 && (
            <ul className="m-0 flex max-h-[180px] list-none flex-col gap-1.5 overflow-auto p-0">
              {databases.map((db) => (
                <li
                  key={db.id}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-[14px] text-zinc-900"
                >
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={activeIds.includes(db.id)}
                      onChange={(e) => handleToggleDataSource(db.id, e.target.checked)}
                      disabled={savingAccess}
                      className="m-0 h-4 w-4 cursor-pointer"
                    />
                    <span>{db.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <details className="mb-5">
        <summary className="mb-1.5 cursor-pointer font-medium">
          Advanced configuration (OAuth)
        </summary>

        <label className="mb-1.5 mt-2.5 block font-medium" htmlFor="oauth-client-id">
          OAuth Client ID (Notion)
        </label>
        <input
          id="oauth-client-id"
          className="mb-1.5 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-[14px]"
          type="text"
          value={oauthClientId}
          onChange={handleOAuthClientIdChange}
          placeholder="Example: 01234567-89ab-cdef-0123-456789abcdef"
        />

        <label className="mb-1.5 mt-2.5 block font-medium" htmlFor="oauth-proxy-url">
          OAuth proxy URL
        </label>
        <input
          id="oauth-proxy-url"
          className="mb-1.5 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-[14px]"
          type="url"
          value={oauthProxyUrl}
          onChange={handleOAuthProxyUrlChange}
          placeholder="https://your-project.vercel.app/api/notion-token"
        />

        <label className="mb-1.5 mt-2.5 block font-medium" htmlFor="oauth-redirect-uri">
          Redirect URI for Notion
        </label>
        <input
          id="oauth-redirect-uri"
          className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-[14px]"
          type="text"
          value={oauthRedirectUri}
          readOnly
        />
      </details>
    </div>
  )
}

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

const NOTIFICATIONS_KEY = 'notifications_enabled'
const OAUTH_CLIENT_ID_KEY = 'notion_oauth_client_id'
const OAUTH_PROXY_URL_KEY = 'notion_oauth_proxy_url'
const DEFAULT_OAUTH_CLIENT_ID = '305d872b-594c-805b-bbc6-0037cc398635'
const DEFAULT_OAUTH_PROXY_URL = 'https://my-notion-list.vercel.app/api/notion-token'

type DbOption = { id: string; name: string }

export default function Options() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [databases, setDatabases] = useState<DbOption[]>([])
  const [selectedDatabaseId, setSelectedDatabaseIdState] = useState<string>('')
  const [loadingDbs, setLoadingDbs] = useState(false)
  const [dbLoadMessage, setDbLoadMessage] = useState<string | null>(null)
  const [oauthClientId, setOauthClientId] = useState('')
  const [oauthProxyUrl, setOauthProxyUrl] = useState('')
  const [oauthRedirectUri, setOauthRedirectUri] = useState('')

  useEffect(() => {
    chrome.storage.sync.get(
      [NOTIFICATIONS_KEY, OAUTH_CLIENT_ID_KEY, OAUTH_PROXY_URL_KEY],
      (r) => {
        setNotificationsEnabled(r[NOTIFICATIONS_KEY] !== false)
        setOauthClientId(String(r[OAUTH_CLIENT_ID_KEY] || DEFAULT_OAUTH_CLIENT_ID))
        setOauthProxyUrl(String(r[OAUTH_PROXY_URL_KEY] || DEFAULT_OAUTH_PROXY_URL))
      }
    )
    chrome.runtime.sendMessage({ type: 'GET_OAUTH_REDIRECT_URI' }, (r: unknown) => {
      const redirectUri = (r as { redirectUri?: string })?.redirectUri || ''
      setOauthRedirectUri(redirectUri)
    })
    chrome.runtime.sendMessage({ type: 'GET_SELECTED_DATABASE_ID' }, (r: unknown) => {
      const id = (r as { databaseId?: string | null })?.databaseId ?? ''
      setSelectedDatabaseIdState(id || '')
    })
    setLoadingDbs(true)
    setDbLoadMessage('Cargando fuentes de datos de Notion...')
    chrome.runtime.sendMessage({ type: 'GET_DATABASES' }, (r: unknown) => {
      setLoadingDbs(false)
      const raw = (r as { databases?: DbOption[] })?.databases ?? []
      const list = Array.from(new Map(raw.map((db) => [db.id, db])).values())
      setDatabases(list)
      setDbLoadMessage(
        list.length === 0
          ? 'No se encontraron fuentes de datos accesibles con este token. Verifica que la integración tenga acceso.'
          : null
      )
      // Si solo hay una base de datos, selecciónala por defecto y guarda
      if (list.length === 1) {
        const id = list[0].id
        setSelectedDatabaseIdState(id)
        chrome.runtime.sendMessage({ type: 'SET_SELECTED_DATABASE_ID', databaseId: id }, () => {})
      }
    })
  }, [])

  const handleToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.checked
    setNotificationsEnabled(value)
    chrome.storage.sync.set({ [NOTIFICATIONS_KEY]: value })
  }

  const handleDatabaseChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    setSelectedDatabaseIdState(value)
    chrome.runtime.sendMessage(
      { type: 'SET_SELECTED_DATABASE_ID', databaseId: value || null },
      () => {}
    )
  }

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

  return (
    <div>
      <h1>Opciones - Guardar en Notion</h1>
      <div className="option-block">
        <label className="option-label" htmlFor="database">
          Base de datos de Notion
        </label>
        {databases.length === 1 ? (
          <div style={{ padding: '8px 0' }}>
            <strong>{databases[0].name}</strong>
            <p className="option-hint" style={{ marginTop: 6 }}>
              Se seleccionó esta base de datos automáticamente.
            </p>
          </div>
        ) : (
          <>
            <select
              id="database"
              className="option-select"
              value={selectedDatabaseId}
              onChange={handleDatabaseChange}
              disabled={loadingDbs}
            >
              <option value="">— Elige una base de datos —</option>
              {(() => {
                const byId = Array.from(new Map(databases.map((db) => [db.id, db])).values())
                const rendered: DbOption[] = []
                const seen = new Set<string>()
                for (const db of byId) {
                  if (seen.has(db.name)) continue
                  seen.add(db.name)
                  rendered.push(db)
                }
                return rendered.map((db) => (
                  <option key={db.id} value={db.id}>
                    {db.name}
                  </option>
                ))
              })()}
            </select>
            <p className="option-hint">Elige la base de datos donde se guardará el texto al usar el menú contextual.</p>
            {dbLoadMessage && (
              <p className="option-hint" style={{ marginTop: 8 }}>
                {dbLoadMessage}
              </p>
            )}
          </>
        )}
      </div>
      <div className="toggle-row">
        <input
          type="checkbox"
          id="notifications"
          checked={notificationsEnabled}
          onChange={handleToggle}
        />
        <label htmlFor="notifications">Mostrar notificación al guardar una página en Notion</label>
      </div>
      <details className="option-block">
        <summary className="option-label" style={{ cursor: 'pointer' }}>
          Configuración avanzada (OAuth)
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
          placeholder="Ej: 01234567-89ab-cdef-0123-456789abcdef"
        />
        <label className="option-label" htmlFor="oauth-proxy-url" style={{ marginTop: 10 }}>
          URL del proxy OAuth
        </label>
        <input
          id="oauth-proxy-url"
          className="option-input"
          type="url"
          value={oauthProxyUrl}
          onChange={handleOAuthProxyUrlChange}
          placeholder="https://tu-proyecto.vercel.app/api/notion-token"
        />
        <label className="option-label" htmlFor="oauth-redirect-uri" style={{ marginTop: 10 }}>
          Redirect URI para Notion
        </label>
        <input
          id="oauth-redirect-uri"
          className="option-input"
          type="text"
          value={oauthRedirectUri}
          readOnly
        />
        <p className="option-hint">
          Normalmente no necesitas tocar esto. Solo se usa para personalizar OAuth.
        </p>
      </details>
    </div>
  )
}

import { useEffect, useState } from 'react'
import IntegrationGuideModal from './IntegrationGuideModal'

declare const chrome: {
  runtime: { sendMessage: (msg: unknown, cb: (r: unknown) => void) => void }
  storage: {
    local: { get: (keys: string[], cb: (r: Record<string, unknown>) => void) => void }
    onChanged?: {
      addListener: (listener: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) => void
      removeListener: (listener: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) => void
    }
  }
}

type DatabaseInfo = {
  id: string
  name: string
  icon: { type: 'emoji'; emoji: string } | { type: 'file'; file: { url: string } } | null
  templates: Array<{ id: string; name: string; icon?: { type: 'emoji'; emoji: string } | { type: 'file'; file: { url: string } } | null }>
}

export default function Popup() {
  const [token, setTokenState] = useState<string | null>(null)
  const [inputToken, setInputToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [saving, setSaving] = useState(false)
  const [oauthLoading, setOauthLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [selectedDatabase, setSelectedDatabase] = useState<DatabaseInfo | null>(null)
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<string>('')
  const [loadingDb, setLoadingDb] = useState(false)
  const [dbList, setDbList] = useState<Array<{ id: string; name?: string }>>([])
  const [templatesOrder, setTemplatesOrder] = useState<string[]>([])
  const [draggedItem, setDraggedItem] = useState<string | null>(null)

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_TOKEN' }, (r: unknown) => {
      const t = (r as { token?: string | null })?.token ?? null
      setTokenState(t)
      if (t) setInputToken(t)
    })
    // initial selected database id (if any)
    chrome.runtime.sendMessage({ type: 'GET_SELECTED_DATABASE_ID' }, (r: unknown) => {
      const id = (r as { databaseId?: string | null })?.databaseId ?? ''
      setSelectedDatabaseId(id || '')
    })
    // also fetch DB list to decide whether to show options and to allow inline selection (dedupe by id)
    chrome.runtime.sendMessage({ type: 'GET_DATABASES' }, (r: unknown) => {
      const raw = (r as { databases?: Array<{ id: string; name?: string }> })?.databases ?? []
      const list = Array.from(new Map(raw.map((db) => [db.id, db])).values())
      setDbList(list)
    })
  }, [])

  const loadDatabaseInfo = () => {
    if (token) {
      setLoadingDb(true)
      chrome.runtime.sendMessage({ type: 'GET_SELECTED_DATABASE_INFO', forceRefresh: true }, (r: unknown) => {
        setLoadingDb(false)
        const res = r as { database?: DatabaseInfo | null }
        setSelectedDatabase(res.database || null)
        const dbId = res.database?.id ?? ''
        setSelectedDatabaseId(dbId)
        
        // Load template order
        if (dbId) {
          chrome.runtime.sendMessage({ type: 'GET_TEMPLATE_ORDER', databaseId: dbId }, (orderRes: unknown) => {
            const order = (orderRes as { order?: string[] })?.order ?? []
            setTemplatesOrder(order)
          })
        }
      })
    } else {
      setSelectedDatabase(null)
      setTemplatesOrder([])
    }
  }

  useEffect(() => {
    loadDatabaseInfo()
  }, [token])

  useEffect(() => {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName === 'sync' && changes['notion_selected_database_id']) {
        loadDatabaseInfo()
      }
    }
    chrome.storage.onChanged?.addListener(listener)
    return () => {
      chrome.storage.onChanged?.removeListener(listener)
    }
  }, [token])

  const handleSaveToken = () => {
    const value = inputToken.trim()
    setSaving(true)
    setMessage(null)
    chrome.runtime.sendMessage({ type: 'SET_TOKEN', token: value || null }, (r: unknown) => {
      setSaving(false)
      const res = r as { ok?: boolean }
      if (res?.ok) {
        setTokenState(value || null)
        setMessage(value ? 'Token guardado. Menú contextual actualizado.' : 'Sesión cerrada.')
        if (value) {
          setTimeout(() => loadDatabaseInfo(), 500)
        }
      } else {
        setMessage('Error al guardar.')
      }
    })
  }

  const handleDisconnect = () => {
    setSaving(true)
    setMessage(null)
    chrome.runtime.sendMessage({ type: 'SET_TOKEN', token: null }, (r: unknown) => {
      setSaving(false)
      if ((r as { ok?: boolean })?.ok) {
        setTokenState(null)
        setInputToken('')
        setMessage('Sesión cerrada.')
      }
    })
  }

  const handleOAuthLogin = () => {
    setOauthLoading(true)
    setMessage(null)
    chrome.runtime.sendMessage({ type: 'START_OAUTH' }, (r: unknown) => {
      setOauthLoading(false)
      const res = r as { ok?: boolean; error?: string }
      if (res?.ok) {
        chrome.runtime.sendMessage({ type: 'GET_TOKEN' }, (tokenRes: unknown) => {
          const t = (tokenRes as { token?: string | null })?.token ?? null
          setTokenState(t)
          if (t) setInputToken(t)
          setMessage('Sesión iniciada con Notion.')
          setTimeout(() => loadDatabaseInfo(), 300)
        })
      } else {
        setMessage(res?.error || 'No se pudo iniciar sesión con Notion.')
      }
    })
  }

  return (
    <div>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '24px' }}>💾</span>
        Guardar en Notion
      </h1>
      {message && <p className={`status ${token ? 'connected' : 'disconnected'}`}>{message}</p>}
      {!token ? (
        <>
          <div className="mb">
            <button className="primary mb" onClick={handleOAuthLogin} disabled={oauthLoading || saving}>
              {oauthLoading ? 'Conectando...' : 'Iniciar sesión con Notion'}
            </button>
            <p style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
              Puedes continuar con Google dentro de la pantalla de Notion si tu workspace lo permite.
            </p>
            <label className="label">Token de integración (Notion)</label>
            <div className="token-input-row mb">
              <input
                type={showToken ? 'text' : 'password'}
                placeholder="secret_..."
                value={inputToken}
                onChange={(e) => setInputToken(e.target.value)}
              />
              <button
                type="button"
                className="token-visibility-btn"
                onClick={() => setShowToken((v) => !v)}
              >
                {showToken ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            <button className="primary" onClick={handleSaveToken} disabled={saving}>
              Conectar con token
            </button>
          </div>
        </>
      ) : (
        <>
          {loadingDb ? (
            <p className="mb" style={{ fontSize: 13, color: '#666' }}>
              Cargando información del database...
            </p>
          ) : selectedDatabase ? (
            <div className="database-section mb">
              <div className="database-info">
                <span className="database-icon">
                  {selectedDatabase.icon?.type === 'emoji' ? (
                    <span>{selectedDatabase.icon.emoji}</span>
                  ) : selectedDatabase.icon?.type === 'file' ? (
                    <img src={selectedDatabase.icon.file.url} alt="" />
                  ) : (
                    <span>📄</span>
                  )}
                </span>
                <span className="database-name">{selectedDatabase.name}</span>
              </div>
              <div className="templates-section">
                <p className="templates-title">Templates disponibles (arrastra para reordenar):</p>
                <ul 
                  className="templates-list"
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.currentTarget.style.opacity = '0.8'
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.style.opacity = '1'
                  }}
                >
                  {(() => {
                    // Sort templates according to saved order
                    const sorted = [...selectedDatabase.templates].sort((a, b) => {
                      const indexA = templatesOrder.indexOf(a.id)
                      const indexB = templatesOrder.indexOf(b.id)
                      
                      if (indexA === -1 && indexB === -1) return 0
                      if (indexA === -1) return 1
                      if (indexB === -1) return -1
                      return indexA - indexB
                    })
                    
                    return sorted.map((tpl, index) => (
                      <li 
                        key={tpl.id} 
                        className="template-item"
                        draggable
                        onDragStart={() => setDraggedItem(tpl.id)}
                        onDragEnd={() => setDraggedItem(null)}
                        onDragOver={(e) => {
                          e.preventDefault()
                          if (draggedItem && draggedItem !== tpl.id) {
                            const draggedIndex = sorted.findIndex((t) => t.id === draggedItem)
                            if (draggedIndex !== -1) {
                              const newSorted = [...sorted]
                              const draggedTemplate = newSorted[draggedIndex]
                              newSorted.splice(draggedIndex, 1)
                              newSorted.splice(index, 0, draggedTemplate)
                              
                              const newOrder = newSorted.map((t) => t.id)
                              setTemplatesOrder(newOrder)
                              
                              // Save to background
                              chrome.runtime.sendMessage({
                                type: 'SET_TEMPLATE_ORDER',
                                databaseId: selectedDatabaseId,
                                order: newOrder,
                              }, () => {})
                            }
                          }
                        }}
                        style={{
                          opacity: draggedItem === tpl.id ? 0.5 : 1,
                          cursor: 'grab',
                          transition: 'all 0.2s',
                        }}
                      >
                        <span style={{ marginRight: 8 }}>
                          {tpl.icon?.type === 'emoji' ? (
                            <span>{tpl.icon.emoji}</span>
                          ) : tpl.icon?.type === 'file' ? (
                            <img src={tpl.icon.file.url} alt="" style={{ width: 18, height: 18, verticalAlign: 'middle' }} />
                          ) : (
                            <span>📄</span>
                          )}
                        </span>
                        {tpl.name}
                      </li>
                    ))
                  })()}
                </ul>
              </div>
            </div>
          ) : (
            <>
              <p className="mb" style={{ fontSize: 13, color: '#666' }}>
                No hay base de datos seleccionada. Elige una de la lista para continuar.
              </p>
              <div style={{ marginBottom: 12 }}>
                <select
                  value={selectedDatabaseId}
                  onChange={(e) => {
                    const id = e.target.value || null
                    setSelectedDatabaseId(id || '')
                    chrome.runtime.sendMessage({ type: 'SET_SELECTED_DATABASE_ID', databaseId: id }, () => {
                      // reload selected database info
                      setTimeout(() => loadDatabaseInfo(), 300)
                      // refresh db list/count in case needed
                      chrome.runtime.sendMessage({ type: 'GET_DATABASES' }, (r: unknown) => {
                        const raw = (r as { databases?: Array<{ id: string; name?: string }> })?.databases ?? []
                        const list = Array.from(new Map(raw.map((db) => [db.id, db])).values())
                        setDbList(list)
                      })
                    })
                  }}
                >
                  <option value="">— Elige una base de datos —</option>
                  {(() => {
                    const byId = Array.from(new Map(dbList.map((db) => [db.id, db])).values())
                    const rendered: Array<{ id: string; name?: string }> = []
                    const seenNames = new Set<string>()
                    for (const db of byId) {
                      const name = db.name || db.id
                      if (seenNames.has(name)) continue
                      seenNames.add(name)
                      rendered.push(db)
                    }
                    return rendered.map((db) => (
                      <option key={db.id} value={db.id}>
                        {db.name || db.id}
                      </option>
                    ))
                  })()}
                </select>
              </div>
            </>
          )}
          <div className="mb" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={handleDisconnect} disabled={saving}>
              Cerrar sesión
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                chrome.runtime.sendMessage({ type: 'REFRESH_MENU' }, () => {
                  // reload DB info after refresh
                  setTimeout(() => loadDatabaseInfo(), 500)
                })
              }}
            >
              Resincronizar
            </button>
          </div>
        </>
      )}
      {!token && (
        <button
          type="button"
          className="guide-link"
          onClick={() => setGuideOpen(true)}
          style={{ background: 'none', border: 'none', color: '#2383e2', padding: 0, cursor: 'pointer', textAlign: 'left' }}
        >
          ¿Cómo configuro la integración?
        </button>
      )}
      <div className="footer">
        <button
          type="button"
          className="options-btn"
          onClick={() => {
            chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }, () => {})
          }}
        >
          Abrir opciones
        </button>
      </div>
      <IntegrationGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  )
}

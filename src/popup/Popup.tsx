import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  IconChevronLeft,
  IconChevronRight,
  IconEye,
  IconEyeOff,
  IconLogout,
  IconRefresh,
  IconSettings,
} from '@tabler/icons-react'
import appLogo from '../assets/app-logo.svg'
import notionLogo from '../assets/notion-logo.svg'

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
  }
}

type NotionIcon = { type: 'emoji'; emoji: string } | { type: 'file'; file: { url: string } } | null
type DataSourceInfo = {
  id: string
  name: string
  icon: NotionIcon
  templates: Array<{ id: string; name: string; icon?: NotionIcon }>
}

export default function Popup() {
  const INTERNAL_TOKEN_HELP_URL =
    'https://www.notion.com/help/create-integrations-with-the-notion-api'
  const [token, setTokenState] = useState<string | null>(null)
  const [inputToken, setInputToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [saving, setSaving] = useState(false)
  const [oauthLoading, setOauthLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const [dataSources, setDataSources] = useState<DataSourceInfo[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loadingSources, setLoadingSources] = useState(false)
  const [syncingNow, setSyncingNow] = useState(false)

  const [templatesOrder, setTemplatesOrder] = useState<string[]>([])
  const [draggedSource, setDraggedSource] = useState<string | null>(null)
  const [draggedTemplate, setDraggedTemplate] = useState<string | null>(null)
  const [pendingSourceOrder, setPendingSourceOrder] = useState<string[] | null>(null)
  const [pendingTemplateOrder, setPendingTemplateOrder] = useState<string[] | null>(null)
  const [showDataSourceOrder, setShowDataSourceOrder] = useState(false)

  const currentDataSource = useMemo(
    () =>
      dataSources.length > 0 ? dataSources[Math.min(currentIndex, dataSources.length - 1)] : null,
    [currentIndex, dataSources]
  )

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_TOKEN' }, (r: unknown) => {
      const t = (r as { token?: string | null })?.token ?? null
      setTokenState(t)
      if (t) setInputToken(t)
    })
  }, [])

  const loadDataSources = useCallback(
    (forceRefresh = false, tokenOverride?: string | null) => {
      const effectiveToken = tokenOverride ?? token
      if (!effectiveToken) {
        setDataSources([])
        setTemplatesOrder([])
        setSyncingNow(false)
        return
      }

      setLoadingSources(true)
      chrome.runtime.sendMessage(
        { type: 'GET_ALL_DATABASE_INFOS', forceRefresh, token: effectiveToken },
        (r: unknown) => {
          const raw = (r as { databases?: DataSourceInfo[] })?.databases ?? []
          setDataSources(raw)
          setCurrentIndex((prev) => Math.min(prev, Math.max(0, raw.length - 1)))
          setLoadingSources(false)
          if (forceRefresh) setSyncingNow(false)
        }
      )
    },
    [token]
  )

  useEffect(() => {
    loadDataSources()
  }, [loadDataSources])

  useEffect(() => {
    if (!message) return
    const timeoutId = window.setTimeout(() => setMessage(null), 2600)
    return () => window.clearTimeout(timeoutId)
  }, [message])

  useEffect(() => {
    if (!currentDataSource?.id) {
      setTemplatesOrder([])
      return
    }
    chrome.runtime.sendMessage(
      { type: 'GET_TEMPLATE_ORDER', databaseId: currentDataSource.id },
      (r: unknown) => {
        const order = (r as { order?: string[] })?.order ?? []
        setTemplatesOrder(order)
      }
    )
  }, [currentDataSource?.id])

  useEffect(() => {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName === 'local' && changes['notion_token']) {
        chrome.runtime.sendMessage({ type: 'GET_TOKEN' }, (r: unknown) => {
          const t = (r as { token?: string | null })?.token ?? null
          setTokenState(t)
          if (t) setInputToken(t)
        })
      }
      if (areaName === 'sync' && changes['notion_data_source_order']) {
        loadDataSources()
      }
      if (areaName === 'sync' && changes['notion_active_data_source_ids']) {
        loadDataSources()
      }
    }
    chrome.storage.onChanged?.addListener(listener)
    return () => chrome.storage.onChanged?.removeListener(listener)
  }, [loadDataSources])

  const handleSaveToken = () => {
    const value = inputToken.trim()
    setSaving(true)
    setMessage(null)
    chrome.runtime.sendMessage({ type: 'SET_TOKEN', token: value || null }, (r: unknown) => {
      setSaving(false)
      const res = r as { ok?: boolean }
      if (res?.ok) {
        setTokenState(value || null)
        setMessage(value ? 'Token saved.' : 'Signed out.')
        setTimeout(() => loadDataSources(true, value || null), 200)
      } else {
        setMessage('Error while saving token.')
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
        setMessage('Signed out.')
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
          setTimeout(() => loadDataSources(true, t), 200)
        })
      } else {
        setMessage(res?.error || 'Could not sign in with Notion.')
      }
    })
  }

  const handleReorderDataSources = (newOrder: string[]) => {
    setDataSources((prev) => {
      const map = new Map(prev.map((d) => [d.id, d]))
      return newOrder.map((id) => map.get(id)).filter((d): d is DataSourceInfo => Boolean(d))
    })
    setPendingSourceOrder(newOrder)
  }

  const persistSourceOrder = () => {
    if (!pendingSourceOrder) return
    chrome.runtime.sendMessage(
      { type: 'SET_DATA_SOURCE_ORDER', order: pendingSourceOrder },
      () => {}
    )
    setPendingSourceOrder(null)
  }

  const persistTemplateOrder = () => {
    if (!pendingTemplateOrder || !currentDataSource) return
    chrome.runtime.sendMessage(
      { type: 'SET_TEMPLATE_ORDER', databaseId: currentDataSource.id, order: pendingTemplateOrder },
      () => {}
    )
    setPendingTemplateOrder(null)
  }

  const sortedTemplates = useMemo(() => {
    if (!currentDataSource) return []
    return [...currentDataSource.templates].sort((a, b) => {
      const indexA = templatesOrder.indexOf(a.id)
      const indexB = templatesOrder.indexOf(b.id)
      if (indexA === -1 && indexB === -1) return 0
      if (indexA === -1) return 1
      if (indexB === -1) return -1
      return indexA - indexB
    })
  }, [currentDataSource, templatesOrder])

  const hasMultipleDataSources = Boolean(token) && dataSources.length > 1
  const hasSingleDataSource = Boolean(token) && dataSources.length === 1
  const showSyncInTopBar = Boolean(token) && !loadingSources && hasMultipleDataSources

  const handleHardSync = () => {
    setSyncingNow(true)
    setLoadingSources(true)
    loadDataSources(true)
    chrome.runtime.sendMessage({ type: 'HARD_SYNC' }, () => {})
  }

  return (
    <div className="popup-root">
      <div className="top-shell mb">
        <div className="title-row">
          <h1 className="app-title">
            <img src={appLogo} alt="" className="app-logo" />
            My Notion List
          </h1>
          {token && (
            <div className="title-actions-group">
              <button
                type="button"
                className="icon-action-btn"
                onClick={() => chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }, () => {})}
                title="Settings"
                aria-label="Settings"
              >
                <IconSettings size={16} stroke={1.8} />
              </button>
              <button
                type="button"
                className="icon-action-btn"
                onClick={handleDisconnect}
                disabled={saving}
                title="Sign out"
                aria-label="Sign out"
              >
                <IconLogout size={16} stroke={2} />
              </button>
            </div>
          )}
        </div>

        {token && (
          <div className="controls-row">
            {showSyncInTopBar && (
              <button
                type="button"
                className={`compact-btn sync-icon-btn ${syncingNow ? 'is-syncing' : ''}`}
                onClick={handleHardSync}
                title="Sync now"
                aria-label="Sync now"
              >
                <IconRefresh size={18} stroke={2} />
              </button>
            )}
            {hasMultipleDataSources && (
              <div className="controls-right">
                <button
                  type="button"
                  className="compact-btn compact-icon-btn"
                  onClick={() =>
                    setCurrentIndex((i) => (i - 1 + dataSources.length) % dataSources.length)
                  }
                  title="Previous data source"
                  aria-label="Previous data source"
                >
                  <IconChevronLeft size={16} stroke={2} />
                </button>
                <button
                  type="button"
                  className="compact-btn compact-icon-btn"
                  onClick={() => setCurrentIndex((i) => (i + 1) % dataSources.length)}
                  title="Next data source"
                  aria-label="Next data source"
                >
                  <IconChevronRight size={16} stroke={2} />
                </button>
                <button
                  type="button"
                  className="compact-btn order-toggle-btn"
                  onClick={() => setShowDataSourceOrder((v) => !v)}
                  aria-expanded={showDataSourceOrder}
                >
                  Data sources order
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {message && <p className={`status ${token ? 'connected' : 'disconnected'}`}>{message}</p>}

      {!token ? (
        <div className="mb auth-panel">
          <div className="label-row">
            <label className="label">Integration token (Notion)</label>
            <button
              type="button"
              className="help-icon-btn"
              onClick={() => window.open(INTERNAL_TOKEN_HELP_URL, '_blank', 'noopener,noreferrer')}
              title="Open Notion docs: create integration and get internal token"
              aria-label="Open Notion docs: create integration and get internal token"
            >
              ?
            </button>
          </div>
          <div className="token-input-row mb">
            <input
              type={showToken ? 'text' : 'password'}
              placeholder="ntn_..."
              value={inputToken}
              onChange={(e) => setInputToken(e.target.value)}
            />
            <button
              type="button"
              className="token-visibility-btn"
              onClick={() => setShowToken((v) => !v)}
              title={showToken ? 'Hide token' : 'Show token'}
              aria-label={showToken ? 'Hide token' : 'Show token'}
            >
              {showToken ? <IconEyeOff size={18} stroke={2} /> : <IconEye size={18} stroke={2} />}
            </button>
          </div>
          <div className="auth-actions">
            <button className="primary auth-btn" onClick={handleSaveToken} disabled={saving}>
              Connect with token
            </button>
            <button
              className="auth-btn"
              onClick={handleOAuthLogin}
              disabled={oauthLoading || saving}
            >
              {oauthLoading ? (
                'Connecting...'
              ) : (
                <span className="oauth-btn-content">
                  <span>Sign in with</span>
                  <img src={notionLogo} alt="" className="oauth-btn-logo" />
                </span>
              )}
            </button>
          </div>
        </div>
      ) : loadingSources ? (
        <p className="mb loading-row" style={{ fontSize: 13, color: '#666' }}>
          Loading data sources...
        </p>
      ) : dataSources.length === 0 ? (
        <p className="mb" style={{ fontSize: 13, color: '#666' }}>
          No accessible data sources found for this account/token.
        </p>
      ) : (
        <div className="database-section mb">
          {hasMultipleDataSources && showDataSourceOrder && (
            <div className="data-source-order-panel mb">
              <ul className="templates-list">
                {dataSources.map((source, index) => (
                  <li
                    key={source.id}
                    className="template-item"
                    draggable
                    onDragStart={() => setDraggedSource(source.id)}
                    onDragEnd={() => {
                      setDraggedSource(null)
                      persistSourceOrder()
                    }}
                    onDragOver={(e) => {
                      e.preventDefault()
                      if (!draggedSource || draggedSource === source.id) return
                      const draggedIndex = dataSources.findIndex((s) => s.id === draggedSource)
                      if (draggedIndex === -1) return
                      const newOrder = [...dataSources.map((s) => s.id)]
                      const [moved] = newOrder.splice(draggedIndex, 1)
                      newOrder.splice(index, 0, moved)
                      handleReorderDataSources(newOrder)
                    }}
                    style={{ opacity: draggedSource === source.id ? 0.5 : 1 }}
                  >
                    {source.name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="database-info">
            <span className="database-icon">
              {currentDataSource?.icon?.type === 'emoji' ? (
                <span>{currentDataSource.icon.emoji}</span>
              ) : currentDataSource?.icon?.type === 'file' ? (
                <img src={currentDataSource.icon.file.url} alt="" />
              ) : (
                <span>📄</span>
              )}
            </span>
            <div className="database-name-wrap">
              <span className="database-name">{currentDataSource?.name || 'Untitled'}</span>
              {hasSingleDataSource && (
                <button
                  type="button"
                  className={`compact-btn sync-icon-btn ${syncingNow ? 'is-syncing' : ''}`}
                  onClick={handleHardSync}
                  title="Sync now"
                  aria-label="Sync now"
                >
                  <IconRefresh size={18} stroke={2} />
                </button>
              )}
            </div>
          </div>

          <div className="templates-section">
            <ul className="templates-list">
              {sortedTemplates.map((tpl, index) => (
                <li
                  key={tpl.id}
                  className="template-item"
                  draggable
                  onDragStart={() => setDraggedTemplate(tpl.id)}
                  onDragEnd={() => {
                    setDraggedTemplate(null)
                    persistTemplateOrder()
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    if (!draggedTemplate || draggedTemplate === tpl.id || !currentDataSource) return
                    const draggedIndex = sortedTemplates.findIndex((t) => t.id === draggedTemplate)
                    if (draggedIndex === -1) return
                    const newSorted = [...sortedTemplates]
                    const [moved] = newSorted.splice(draggedIndex, 1)
                    newSorted.splice(index, 0, moved)
                    const newOrder = newSorted.map((t) => t.id)
                    setTemplatesOrder(newOrder)
                    setPendingTemplateOrder(newOrder)
                  }}
                  style={{ opacity: draggedTemplate === tpl.id ? 0.5 : 1 }}
                >
                  <span style={{ marginRight: 8 }}>
                    {tpl.icon?.type === 'emoji' ? (
                      <span>{tpl.icon.emoji}</span>
                    ) : tpl.icon?.type === 'file' ? (
                      <img
                        src={tpl.icon.file.url}
                        alt=""
                        style={{ width: 18, height: 18, verticalAlign: 'middle' }}
                      />
                    ) : (
                      <span>📄</span>
                    )}
                  </span>
                  {tpl.name}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

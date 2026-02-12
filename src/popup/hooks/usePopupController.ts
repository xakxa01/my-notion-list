import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DataSourceInfo } from '../types'

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

export type PopupController = ReturnType<typeof usePopupController>

export function usePopupController() {
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
          if (forceRefresh) {
            setSyncingNow(false)
          }
        }
      )
    },
    [token]
  )

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_TOKEN' }, (r: unknown) => {
      const t = (r as { token?: string | null })?.token ?? null
      setTokenState(t)
      if (t) {
        setInputToken(t)
      }
    })
  }, [])

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
          if (t) {
            setInputToken(t)
          }
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
          if (t) {
            setInputToken(t)
          }
          setTimeout(() => loadDataSources(true, t), 200)
        })
      } else {
        setMessage(res?.error || 'Could not sign in with Notion.')
      }
    })
  }

  const handleHardSync = () => {
    setSyncingNow(true)
    setLoadingSources(true)
    chrome.runtime.sendMessage({ type: 'HARD_SYNC' }, (r: unknown) => {
      const ok = Boolean((r as { ok?: boolean })?.ok)
      if (!ok) {
        setLoadingSources(false)
        setSyncingNow(false)
        setMessage('Could not sync now.')
        return
      }
      loadDataSources(true)
    })
  }

  const persistSourceOrder = () => {
    if (!pendingSourceOrder) return
    chrome.runtime.sendMessage(
      { type: 'SET_DATA_SOURCE_ORDER', order: pendingSourceOrder },
      () => {}
    )
    setPendingSourceOrder(null)
  }

  const handleReorderDataSources = (newOrder: string[]) => {
    setDataSources((prev) => {
      const byId = new Map(prev.map((item) => [item.id, item]))
      return newOrder
        .map((id) => byId.get(id))
        .filter((item): item is DataSourceInfo => Boolean(item))
    })
    setPendingSourceOrder(newOrder)
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

  return {
    message,
    loadingSources,
    token,
    dataSources,
    hasMultipleDataSources,
    hasSingleDataSource,
    showDataSourceOrder,
    sortedTemplates,

    topBar: {
      token,
      saving,
      hasMultipleDataSources,
      showSyncInTopBar,
      syncingNow,
      showDataSourceOrder,
    },
    topBarActions: {
      openSettings: () => chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }, () => {}),
      disconnect: handleDisconnect,
      hardSync: handleHardSync,
      prevSource: () => setCurrentIndex((i) => (i - 1 + dataSources.length) % dataSources.length),
      nextSource: () => setCurrentIndex((i) => (i + 1) % dataSources.length),
      toggleDataSourceOrder: () => setShowDataSourceOrder((v) => !v),
    },

    auth: {
      inputToken,
      showToken,
      saving,
      oauthLoading,
    },
    authActions: {
      setInputToken,
      toggleTokenVisibility: () => setShowToken((v) => !v),
      saveToken: handleSaveToken,
      oauthLogin: handleOAuthLogin,
    },

    order: {
      dataSources,
      draggedSource,
    },
    orderActions: {
      dragStart: setDraggedSource,
      dragEnd: () => {
        setDraggedSource(null)
        persistSourceOrder()
      },
      dragOver: (targetId: string, targetIndex: number) => {
        if (!draggedSource || draggedSource === targetId) return
        const draggedIndex = dataSources.findIndex((s) => s.id === draggedSource)
        if (draggedIndex === -1) return
        const newOrder = dataSources.map((s) => s.id)
        const [moved] = newOrder.splice(draggedIndex, 1)
        newOrder.splice(targetIndex, 0, moved)
        handleReorderDataSources(newOrder)
      },
    },

    templates: {
      currentDataSource,
      sortedTemplates,
      hasSingleDataSource,
      syncingNow,
      draggedTemplate,
    },
    templateActions: {
      hardSync: handleHardSync,
      dragStart: setDraggedTemplate,
      dragEnd: () => {
        setDraggedTemplate(null)
        persistTemplateOrder()
      },
      dragOver: (targetId: string, targetIndex: number) => {
        if (!draggedTemplate || draggedTemplate === targetId || !currentDataSource) return
        const draggedIndex = sortedTemplates.findIndex((t) => t.id === draggedTemplate)
        if (draggedIndex === -1) return
        const newSorted = [...sortedTemplates]
        const [moved] = newSorted.splice(draggedIndex, 1)
        newSorted.splice(targetIndex, 0, moved)
        const newOrder = newSorted.map((t) => t.id)
        setTemplatesOrder(newOrder)
        setPendingTemplateOrder(newOrder)
      },
    },
  }
}

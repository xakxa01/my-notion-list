/// <reference types="chrome" />
import { ACTIVE_DATA_SOURCE_IDS_KEY, DATA_SOURCE_ORDER_KEY } from './background/shared/constants'
import { normalizeDatabaseIds } from './background/shared/ids'
import { startOAuthSignInFlow } from './background/features/oauth'
import {
  getAuthMethod,
  getOAuthConfig,
  getOAuthRedirectUri,
  getToken,
  openOptionsInTab,
  setAuthMethod,
  setToken,
} from './background/features/auth-storage'
import {
  clearNotionCaches,
  clearSelectedDbCaches,
  getActiveDataSourceIds,
  getAllDatabaseInfos,
  getCachedSelectedDb,
  getOrderedDataSourceIds,
  getTemplateOrder,
  notionFetch,
  searchDataSources,
  setActiveDataSourceIds,
  setDataSourceOrder,
  setTemplateOrder,
  sortTemplatesByOrder,
} from './background/features/notion-data'
import {
  handleContextMenuClick,
  handleContextMenuShown,
  refreshContextMenu,
} from './background/features/context-menu'

function refreshMenus(): Promise<void> {
  return refreshContextMenu({
    getToken,
    getOrderedDataSourceIds,
    getCachedSelectedDb,
    getTemplateOrder,
    sortTemplatesByOrder,
  })
}

chrome.runtime.onInstalled.addListener(() => {
  refreshMenus()
})

chrome.runtime.onStartup.addListener(() => {
  refreshMenus()
})

chrome.contextMenus.onClicked.addListener(async (info) => {
  try {
    await handleContextMenuClick(info, {
      getToken,
      getCachedSelectedDb,
      notionFetch,
      openOptionsInTab,
    })
  } catch (err) {
    console.error('Error while saving to Notion:', err)
  }
})

chrome.contextMenus.onShown?.addListener((info) => {
  handleContextMenuShown(info)
})

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.notion_token) refreshMenus()
  if (
    areaName === 'sync' &&
    (changes[DATA_SOURCE_ORDER_KEY] || changes[ACTIVE_DATA_SOURCE_IDS_KEY])
  ) {
    refreshMenus()
  }
})

chrome.runtime.onMessage.addListener(
  (msg: { type: string; token?: string }, _sender, sendResponse) => {
    if (msg.type === 'SET_TOKEN' && msg.token !== undefined) {
      const nextToken = typeof msg.token === 'string' ? msg.token.trim() || null : null
      getToken()
        .then((currentToken) => {
          const tokenChanged = currentToken !== nextToken
          const cacheTask = tokenChanged ? clearNotionCaches() : Promise.resolve()
          return cacheTask.then(() =>
            Promise.all([setToken(nextToken), setAuthMethod(nextToken ? 'token' : '')])
          )
        })
        .then(() => refreshMenus())
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }))
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
      startOAuthSignInFlow({
        getOAuthConfig,
        getOAuthRedirectUri,
        setToken,
        setAuthMethod,
        refreshContextMenu: refreshMenus,
      })
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

    if (msg.type === 'HARD_SYNC') {
      clearNotionCaches()
        .then(() => refreshMenus())
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

    if (
      msg.type === 'SET_ACTIVE_DATA_SOURCE_IDS' &&
      Array.isArray((msg as { ids?: unknown[] }).ids)
    ) {
      const requestedIds = normalizeDatabaseIds((msg as { ids: string[] }).ids)
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
            await refreshMenus()
            sendResponse({ ok: true, activeIds: nextActive })
          })
        })
        .catch(() => sendResponse({ ok: false }))
      return true
    }

    if (
      msg.type === 'SET_DATA_SOURCE_ORDER' &&
      Array.isArray((msg as { order?: unknown[] }).order)
    ) {
      const order = normalizeDatabaseIds((msg as { order: string[] }).order)
      setDataSourceOrder(order).then(() => {
        refreshMenus()
        sendResponse({ ok: true })
      })
      return true
    }

    if (msg.type === 'GET_ALL_DATABASE_INFOS') {
      getToken()
        .then((token) => {
          if (!token) return sendResponse({ databases: [] })
          const forceRefresh = Boolean((msg as { forceRefresh?: boolean }).forceRefresh)
          return getAllDatabaseInfos(token, forceRefresh).then((databases) =>
            sendResponse({ databases })
          )
        })
        .catch(() => sendResponse({ databases: [] }))
      return true
    }

    if (msg.type === 'SET_TEMPLATE_ORDER' && (msg as { databaseId?: string }).databaseId) {
      const databaseId = (msg as { databaseId: string }).databaseId
      const order = (msg as { order?: string[] }).order || []
      setTemplateOrder(databaseId, order).then(() => {
        refreshMenus()
        sendResponse({ ok: true })
      })
      return true
    }

    if (msg.type === 'GET_TEMPLATE_ORDER' && (msg as { databaseId?: string }).databaseId) {
      const databaseId = (msg as { databaseId: string }).databaseId
      getTemplateOrder(databaseId).then((order) => {
        sendResponse({ order })
      })
      return true
    }
  }
)

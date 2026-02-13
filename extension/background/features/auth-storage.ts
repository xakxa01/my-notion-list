import {
  AUTH_METHOD_KEY,
  DATA_SOURCES_LIST_CACHE_KEY,
  DEFAULT_OAUTH_CLIENT_ID,
  DEFAULT_OAUTH_PROXY_URL,
  OAUTH_CLIENT_ID_KEY,
  OAUTH_PROXY_URL_KEY,
} from '../shared/constants'

const TOKEN_KEY = 'notion_token'

export function getToken(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get([TOKEN_KEY], (r) => {
      const token = String((r as { notion_token?: string | null }).notion_token || '').trim()
      resolve(token || null)
    })
  })
}

export function setToken(token: string | null): Promise<void> {
  const normalized = typeof token === 'string' ? token.trim() : ''
  return new Promise((resolve) => {
    if (!normalized) {
      chrome.storage.local.remove([TOKEN_KEY], () => {
        chrome.storage.local.set({ [DATA_SOURCES_LIST_CACHE_KEY]: '' }, resolve)
      })
      return
    }
    chrome.storage.local.set({ [TOKEN_KEY]: normalized, [DATA_SOURCES_LIST_CACHE_KEY]: '' }, resolve)
  })
}

export function getAuthMethod(): Promise<'token' | 'oauth' | ''> {
  return new Promise((resolve) => {
    chrome.storage.local.get([AUTH_METHOD_KEY], (r) => {
      const value = String((r as Record<string, unknown>)[AUTH_METHOD_KEY] || '')
      resolve(value === 'token' || value === 'oauth' ? value : '')
    })
  })
}

export function setAuthMethod(method: 'token' | 'oauth' | ''): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [AUTH_METHOD_KEY]: method }, () => resolve())
  })
}

export function getOAuthConfig(): Promise<{ clientId: string; proxyUrl: string }> {
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

export function getOAuthRedirectUri(): string {
  return chrome.identity.getRedirectURL()
}

export function openOptionsInTab(): void {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage()
    return
  }
  const optionsUrl = chrome.runtime.getURL('options.html')
  chrome.tabs.create?.({ url: optionsUrl }, () => {})
}

import {
  TRUSTED_OAUTH_PROXY_ORIGINS,
} from '../shared/constants'

type OAuthConfig = { clientId: string; proxyUrl: string }

type OAuthDeps = {
  getOAuthConfig: () => Promise<OAuthConfig>
  getOAuthRedirectUri: () => string
  setToken: (token: string | null) => Promise<void>
  setAuthMethod: (method: 'token' | 'oauth' | '') => Promise<void>
  refreshContextMenu: () => Promise<void>
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

async function exchangeOAuthCode(code: string, deps: OAuthDeps): Promise<void> {
  const { proxyUrl } = await deps.getOAuthConfig()
  const redirectUri = deps.getOAuthRedirectUri()
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
  await deps.setToken(data.access_token)
  await deps.setAuthMethod('oauth')
  await deps.refreshContextMenu()
}

export async function startOAuthSignInFlow(deps: OAuthDeps): Promise<void> {
  const { clientId } = await deps.getOAuthConfig()
  if (!clientId) throw new Error('Notion Client ID is missing in Settings.')

  const redirectUri = deps.getOAuthRedirectUri()
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

  await exchangeOAuthCode(code, deps)
}

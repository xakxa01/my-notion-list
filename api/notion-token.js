/**
 * Vercel serverless: exchange Notion OAuth code for access_token.
 * Required env:
 * - NOTION_CLIENT_ID
 * - NOTION_CLIENT_SECRET
 * Optional hardening env:
 * - NOTION_ALLOWED_REDIRECT_URIS (comma-separated exact URIs)
 * - CHROME_EXTENSION_IDS (comma-separated extension IDs)
 */

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT_MAX_REQUESTS = 60
const globalRateState = globalThis.__notionOauthRateState || new Map()
globalThis.__notionOauthRateState = globalRateState

function setSecurityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
}

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for']

  if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim()

  return req.socket?.remoteAddress || 'unknown'
}

function isRateLimited(ip) {
  const now = Date.now()
  const current = globalRateState.get(ip)

  if (!current || now > current.resetAt) {
    globalRateState.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return false
  }

  current.count += 1

  return current.count > RATE_LIMIT_MAX_REQUESTS
}

function getAllowedRedirectUris() {
  const explicit = String(process.env.NOTION_ALLOWED_REDIRECT_URIS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const extensionIds = String(process.env.CHROME_EXTENSION_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((id) => `https://${id}.chromiumapp.org/`)

  return new Set([...explicit, ...extensionIds])
}

function isSafeRedirectUri(redirectUri, allowedRedirectUris) {
  try {
    const parsed = new URL(redirectUri)

    if (parsed.protocol !== 'https:') return false
    return allowedRedirectUris.has(redirectUri)
  } catch {
    return false
  }
}

export default async function handler(req, res) {
  setSecurityHeaders(res)
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const ip = getClientIp(req)
  if (isRateLimited(ip)) {
    res.status(429).json({ error: 'Too many requests. Try again later.' })
    return
  }

  const clientId = process.env.NOTION_CLIENT_ID
  const clientSecret = process.env.NOTION_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    res.status(500).json({ error: 'OAuth server misconfigured.' })
    return
  }

  const { code, redirect_uri } = req.body || {}
  if (typeof code !== 'string' || typeof redirect_uri !== 'string') {
    res.status(400).json({ error: 'Invalid request body.' })
    return
  }

  if (code.length < 8 || code.length > 1024) {
    res.status(400).json({ error: 'Invalid authorization code.' })
    return
  }

  const allowedRedirectUris = getAllowedRedirectUris()
  if (allowedRedirectUris.size === 0) {
    res.status(500).json({ error: 'OAuth redirect allowlist is not configured.' })
    return
  }
  if (!isSafeRedirectUri(redirect_uri, allowedRedirectUris)) {
    res.status(400).json({ error: 'Redirect URI not allowed.' })
    return
  }

  try {
    const tokenRes = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Notion-Version': '2025-09-03',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri,
      }),
    })
    const data = await tokenRes.json().catch(() => ({}))
    if (!tokenRes.ok) {
      res.status(400).json({ error: 'Token exchange failed.' })
      return
    }
    if (!data.access_token) {
      res.status(502).json({ error: 'OAuth provider response invalid.' })
      return
    }
    res.status(200).json({ access_token: data.access_token })
  } catch {
    res.status(500).json({ error: 'Unexpected OAuth server error.' })
  }
}

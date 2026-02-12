/**
 * Vercel serverless: exchange Notion OAuth code for access_token.
 * Set NOTION_CLIENT_ID and NOTION_CLIENT_SECRET in Vercel env.
 * POST body: { code, redirect_uri }
 * Returns: { access_token } or { error }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const clientId = process.env.NOTION_CLIENT_ID
  const clientSecret = process.env.NOTION_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    res.status(500).json({ error: 'Server missing NOTION_CLIENT_ID or NOTION_CLIENT_SECRET' })
    return
  }
  const { code, redirect_uri } = req.body || {}
  if (!code || !redirect_uri) {
    res.status(400).json({ error: 'Body must include code and redirect_uri' })
    return
  }
  try {
    const tokenRes = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri,
      }),
    })
    const data = await tokenRes.json()
    if (!tokenRes.ok) {
      res.status(tokenRes.status).json({ error: data.message || data.error || 'Token exchange failed' })
      return
    }
    res.status(200).json({ access_token: data.access_token })
  } catch (err) {
    res.status(500).json({ error: String(err.message) })
  }
}

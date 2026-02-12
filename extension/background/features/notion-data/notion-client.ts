import { NOTION_API, NOTION_VERSION } from '../../shared/constants'

export async function notionFetch(
  token: string,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = path.startsWith('http') ? path : `${NOTION_API}${path}`
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    },
  })
}

import type { NotionIcon } from './types'

export function getTitleFromResult(result: Record<string, unknown>): string {
  if (result.title && Array.isArray(result.title)) {
    return (result.title as Array<{ plain_text?: string }>)
      .map((t) => t.plain_text ?? '')
      .join('')
      .trim()
  }
  const props = result.properties as Record<string, { type?: string; title?: Array<{ plain_text?: string }> }> | undefined
  if (props) {
    for (const p of Object.values(props)) {
      if (p?.type === 'title' && Array.isArray(p.title)) {
        return (p.title as Array<{ plain_text?: string }>)
          .map((t) => t.plain_text ?? '')
          .join('')
          .trim()
      }
    }
  }
  return 'Untitled'
}

export function parseNotionIcon(raw: unknown): NotionIcon {
  if (!raw || typeof raw !== 'object') return null
  const icon = raw as Record<string, unknown>
  if (icon.type === 'emoji' && icon.emoji) {
    return { type: 'emoji', emoji: String(icon.emoji) }
  }
  if (icon.type === 'file' && icon.file && typeof icon.file === 'object') {
    const url = (icon.file as Record<string, unknown>).url
    if (url) return { type: 'file', file: { url: String(url) } }
  }
  if (icon.type === 'external' && icon.external && typeof icon.external === 'object') {
    const url = (icon.external as Record<string, unknown>).url
    if (url) return { type: 'file', file: { url: String(url) } }
  }
  if (icon.type === 'custom_emoji' && icon.custom_emoji && typeof icon.custom_emoji === 'object') {
    const url = (icon.custom_emoji as Record<string, unknown>).url
    if (url) return { type: 'file', file: { url: String(url) } }
  }
  return null
}

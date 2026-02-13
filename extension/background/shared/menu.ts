import type { NotionIcon } from './types'

export function getTemplateMenuTitle(template: { name: string; icon?: NotionIcon }): string {
  if (template.icon?.type === 'emoji') return `${template.icon.emoji} ${template.name}`
  return `📄 ${template.name}`
}

export function truncateLabel(text: string, maxChars = 20): string {
  const normalized = text.trim().replace(/\s+/g, ' ')
  if (normalized.length <= maxChars) return normalized
  return `${normalized.slice(0, maxChars)}...`
}

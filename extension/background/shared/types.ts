export type NotionIcon = { type: 'emoji'; emoji: string } | { type: 'file'; file: { url: string } } | null

export type CachedSelectedDb = {
  id: string
  dataSourceId: string
  name: string
  icon: NotionIcon
  titlePropertyKey: string
  templates: Array<{ id: string; name: string; icon?: NotionIcon }>
}

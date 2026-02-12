export type NotionIcon =
  | { type: 'emoji'; emoji: string }
  | { type: 'file'; file: { url: string } }
  | null

export type TemplateInfo = { id: string; name: string; icon?: NotionIcon }

export type DataSourceInfo = {
  id: string
  name: string
  icon: NotionIcon
  templates: TemplateInfo[]
}

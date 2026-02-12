export interface NotionDataSource {
  object: string
  id: string
  title?: Array<{ plain_text: string }>
  /** Resolved from GET data_sources/{id} */
  titlePropertyKey?: string
}

export interface NotionSearchResult {
  object: string
  results: Array<{
    object: 'page' | 'data_source'
    id: string
    title?: Array<{ plain_text: string }>
    [key: string]: unknown
  }>
  has_more: boolean
  next_cursor: string | null
}

export interface NotionTemplate {
  id: string
  name: string
  icon?: { type: 'emoji'; emoji: string } | { type: 'file'; file: { url: string } } | null
}

export interface NotionDataSourceDetail {
  object: string
  id: string
  properties: Record<string, { type: string; [key: string]: unknown }>
}

export interface CachedDataSource {
  id: string
  name: string
  titlePropertyKey: string
  templates: Array<{ id: string; name: string; icon?: { type: 'emoji'; emoji: string } | { type: 'file'; file: { url: string } } | null }>
}

export type TemplateChoice = { type: 'none' } | { type: 'default' } | { type: 'template_id'; template_id: string }

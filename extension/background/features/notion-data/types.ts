import type { NotionIcon } from '../../shared/types'

export type DataSource = { id: string; name: string }
export type Template = { id: string; name: string; icon?: NotionIcon }
export type DatabaseInfo = { id: string; name: string; icon: NotionIcon; templates: Template[] }

export const NOTION_VERSION = '2025-09-03'
export const NOTION_API = 'https://api.notion.com'

// Context Menu
export const ROOT_MENU_ID = 'notion-save-root'
export const MENU_ID_PREFIX = 'notion_tpl_'
export const MENU_SEPARATOR = '::'
export const ROOT_MENU_BASE_TITLE = 'Save to Notion'

// Storage Keys
export const SELECTED_DB_CACHE_KEY_PREFIX = 'notion_selected_db_cache_'
export const DATA_SOURCE_ORDER_KEY = 'notion_data_source_order'
export const ACTIVE_DATA_SOURCE_IDS_KEY = 'notion_active_data_source_ids'
export const ACTIVE_DATA_SOURCE_SELECTION_CONFIGURED_KEY = 'notion_active_data_source_selection_configured'
export const TEMPLATE_ORDER_KEY = 'notion_template_order'
export const DATA_SOURCES_LIST_CACHE_KEY = 'notion_data_sources_list_cache'
export const AUTH_METHOD_KEY = 'notion_auth_method'
export const OAUTH_CLIENT_ID_KEY = 'notion_oauth_client_id'
export const OAUTH_PROXY_URL_KEY = 'notion_oauth_proxy_url'

export const CACHE_TTL_MS = Number.MAX_SAFE_INTEGER // effectively no auto-expiration; user refresh controls updates
export const DATA_SOURCES_CACHE_TTL_MS = Number.MAX_SAFE_INTEGER // effectively no auto-expiration; user refresh controls updates

export const DEFAULT_OAUTH_CLIENT_ID = '305d872b-594c-805b-bbc6-0037cc398635'
export const DEFAULT_OAUTH_PROXY_URL = 'https://my-notion-list.vercel.app/api/notion-token'
export const TRUSTED_OAUTH_PROXY_ORIGINS = [new URL(DEFAULT_OAUTH_PROXY_URL).origin, 'http://localhost:3000', 'http://localhost:5173']

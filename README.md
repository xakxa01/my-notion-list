# My Notion List (Browser Extension)

My Notion List lets you save selected text from any page into Notion using your accessible data sources and templates.

## Features

- Save selected text to Notion from the context menu.
- Works with:
  - Notion OAuth (`Sign in with Notion`)
  - Internal integration token (`ntn_...`)
- Multi-data-source support (no hard limit).
- Data sources loaded automatically from your account/token access.
- Reorder data sources and templates with drag and drop.
- Fast loading with cache and manual refresh.
- Per-data-source enable/disable toggles in Settings.

## Install (Unpacked)

1. Run:
   - `npm run build`
2. Open your browser extensions page.
3. Enable developer mode.
4. Load unpacked extension from the `dist/` folder.

## How To Use

1. Open the popup.
2. Connect Notion using either:
   - `Sign in with` (OAuth)
   - `Connect with token` (Internal integration token)
3. Select text on any webpage.
4. Right click and choose `Save '<label>' to Notion`.
5. Pick a template from the submenu.

## Data Sources Behavior

- Accessible data sources are discovered automatically.
- In popup:
  - Use arrows to switch data source (when more than one is active).
  - Use refresh icon to force sync.
- In Settings:
  - Enable/disable each detected data source with checkboxes.
  - By default, all detected data sources are checked.
  - Disabling a data source hides it from popup/context menu and clears its cache.

## Settings

### Data source access

- `Refresh accessible list`: refresh list of accessible data sources.
- `Reconnect Notion access`: reopen OAuth permission flow to grant/review access.
  - This is available for OAuth sessions.
  - For manual token sessions, this action is disabled.

### Advanced configuration (OAuth)

- OAuth Client ID
- OAuth proxy URL
- Redirect URI (read-only)

## OAuth Proxy (Vercel)

This repo includes `api/notion-token.js` for token exchange.

Set these environment variables in your deployment:

- `NOTION_CLIENT_ID`
- `NOTION_CLIENT_SECRET`
- `CHROME_EXTENSION_IDS` (recommended, comma-separated)
- `NOTION_ALLOWED_REDIRECT_URIS` (optional, comma-separated)

Example endpoint:

- `https://your-project.vercel.app/api/notion-token`

## Development

- `npm run build`: build extension into `dist/`.
- `npm run dev`: run Vite dev server for UI work.

## Permissions

- `contextMenus`: context menu actions for selected text.
- `storage`: token, ordering, and settings.
- `identity`: OAuth flow.
- `notifications`: save status notifications.
- Host permissions for Notion API and OAuth proxy.

import {
  IconChevronLeft,
  IconChevronRight,
  IconLogout,
  IconRefresh,
  IconSettings,
} from '@tabler/icons-react'
import appLogo from '../../assets/app-logo.svg'

type TopBarState = {
  token: string | null
  saving: boolean
  hasMultipleDataSources: boolean
  showSyncInTopBar: boolean
  showSourceControls: boolean
  syncingNow: boolean
  showDataSourceOrder: boolean
}

type TopBarActions = {
  openSettings: () => void
  disconnect: () => void
  hardSync: () => void
  prevSource: () => void
  nextSource: () => void
  toggleDataSourceOrder: () => void
}

type TopBarProps = {
  state: TopBarState
  actions: TopBarActions
}

export function TopBar({ state, actions }: TopBarProps) {
  return (
    <div className="topbar">
      <div className="topbar-row">
        <h1 className="topbar-title">
          <img src={appLogo} alt="" className="topbar-logo" draggable={false} />
          My Notion List
        </h1>

        {state.token && (
          <div className="topbar-actions">
            <button
              type="button"
              className="topbar-action-btn"
              onClick={actions.openSettings}
              title="Settings"
              aria-label="Settings"
            >
              <IconSettings size={16} stroke={1.8} />
            </button>
            <button
              type="button"
              className="topbar-action-btn"
              onClick={actions.disconnect}
              disabled={state.saving}
              title="Sign out"
              aria-label="Sign out"
            >
              <IconLogout size={16} stroke={2} />
            </button>
          </div>
        )}
      </div>

      {state.token && (
        <div className="control-row">
          {state.showSyncInTopBar && (
            <button
              type="button"
              className="icon-btn sync-icon"
              onClick={actions.hardSync}
              title="Sync now"
              aria-label="Sync now"
            >
              <IconRefresh
                size={18}
                stroke={2}
                className={`sync-icon-glyph ${
                  state.syncingNow ? 'sync-icon-glyph--spinning' : 'sync-icon-glyph--hover'
                }`}
              />
            </button>
          )}

          {state.showSourceControls && (
            <div className="control-group">
              <button
                type="button"
                className="icon-btn"
                onClick={actions.prevSource}
                title="Previous data source"
                aria-label="Previous data source"
              >
                <IconChevronLeft size={16} stroke={2} />
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={actions.nextSource}
                title="Next data source"
                aria-label="Next data source"
              >
                <IconChevronRight size={16} stroke={2} />
              </button>
              <button
                type="button"
                className="text-btn"
                onClick={actions.toggleDataSourceOrder}
                aria-expanded={state.showDataSourceOrder}
              >
                Data sources order
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

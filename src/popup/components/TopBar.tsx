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
    <div className="top-shell mb">
      <div className="title-row">
        <h1 className="app-title">
          <img src={appLogo} alt="" className="app-logo" />
          My Notion List
        </h1>
        {state.token && (
          <div className="title-actions-group">
            <button
              type="button"
              className="icon-action-btn"
              onClick={actions.openSettings}
              title="Settings"
              aria-label="Settings"
            >
              <IconSettings size={16} stroke={1.8} />
            </button>
            <button
              type="button"
              className="icon-action-btn"
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
        <div className="controls-row">
          {state.showSyncInTopBar && (
            <button
              type="button"
              className={`compact-btn sync-icon-btn ${state.syncingNow ? 'is-syncing' : ''}`}
              onClick={actions.hardSync}
              title="Sync now"
              aria-label="Sync now"
            >
              <IconRefresh size={18} stroke={2} />
            </button>
          )}

          {state.hasMultipleDataSources && (
            <div className="controls-right">
              <button
                type="button"
                className="compact-btn compact-icon-btn"
                onClick={actions.prevSource}
                title="Previous data source"
                aria-label="Previous data source"
              >
                <IconChevronLeft size={16} stroke={2} />
              </button>
              <button
                type="button"
                className="compact-btn compact-icon-btn"
                onClick={actions.nextSource}
                title="Next data source"
                aria-label="Next data source"
              >
                <IconChevronRight size={16} stroke={2} />
              </button>
              <button
                type="button"
                className="compact-btn order-toggle-btn"
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

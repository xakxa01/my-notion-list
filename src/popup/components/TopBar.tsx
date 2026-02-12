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
  const iconBtnBase =
    'inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-800 transition hover:bg-zinc-50'

  return (
    <div className="mb-3 flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="m-0 flex items-center gap-2 whitespace-nowrap text-[1.1rem] font-semibold">
          <img src={appLogo} alt="" className="h-[22px] w-[22px] shrink-0 object-contain" />
          My Notion List
        </h1>

        {state.token && (
          <div className="flex items-center overflow-hidden rounded-[9px] border border-zinc-300 bg-zinc-50">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center border-0 bg-transparent text-zinc-700 transition hover:bg-zinc-100"
              onClick={actions.openSettings}
              title="Settings"
              aria-label="Settings"
            >
              <IconSettings size={16} stroke={1.8} />
            </button>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center border-0 border-l border-l-zinc-300 bg-transparent text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-70"
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
        <div className="flex items-center justify-between gap-2">
          {state.showSyncInTopBar && (
            <button
              type="button"
              className={`group ${iconBtnBase}`}
              onClick={actions.hardSync}
              title="Sync now"
              aria-label="Sync now"
            >
              <IconRefresh
                size={18}
                stroke={2}
                className={
                  state.syncingNow ? 'animate-spin' : 'motion-safe:group-hover:animate-spin'
                }
              />
            </button>
          )}

          {state.hasMultipleDataSources && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={iconBtnBase}
                onClick={actions.prevSource}
                title="Previous data source"
                aria-label="Previous data source"
              >
                <IconChevronLeft size={16} stroke={2} />
              </button>
              <button
                type="button"
                className={iconBtnBase}
                onClick={actions.nextSource}
                title="Next data source"
                aria-label="Next data source"
              >
                <IconChevronRight size={16} stroke={2} />
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center rounded-md border border-zinc-300 bg-white px-3 text-[12px] font-medium text-zinc-800 transition hover:bg-zinc-50"
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

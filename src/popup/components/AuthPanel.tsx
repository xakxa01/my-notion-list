import { IconEye, IconEyeOff } from '@tabler/icons-react'
import notionLogo from '../../assets/notion-logo.svg'

type AuthState = {
  inputToken: string
  showToken: boolean
  saving: boolean
  oauthLoading: boolean
}

type AuthActions = {
  setInputToken: (value: string) => void
  toggleTokenVisibility: () => void
  saveToken: () => void
  oauthLogin: () => void
  openHelp: () => void
}

type AuthPanelProps = {
  state: AuthState
  actions: AuthActions
}

export function AuthPanel({ state, actions }: AuthPanelProps) {
  return (
    <div className="mb-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="text-[14px] font-medium text-zinc-800">Integration token (Notion)</label>
        <button
          type="button"
          className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-[13px] font-semibold leading-none text-amber-800"
          onClick={actions.openHelp}
          title="Open Notion docs: create integration and get internal token"
          aria-label="Open Notion docs: create integration and get internal token"
        >
          ?
        </button>
      </div>

      <div className="mb-3 flex items-center overflow-hidden rounded-lg border border-zinc-300 bg-white">
        <input
          type={state.showToken ? 'text' : 'password'}
          placeholder="ntn_..."
          value={state.inputToken}
          onChange={(e) => actions.setInputToken(e.target.value)}
          className="flex-1 border-none px-3.5 py-3 text-[15px] outline-none"
        />
        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center border-0 border-l border-l-zinc-300 bg-white p-0 text-zinc-600"
          onClick={actions.toggleTokenVisibility}
          title={state.showToken ? 'Hide token' : 'Show token'}
          aria-label={state.showToken ? 'Hide token' : 'Show token'}
        >
          {state.showToken ? <IconEyeOff size={18} stroke={2} /> : <IconEye size={18} stroke={2} />}
        </button>
      </div>

      <div className="flex items-center gap-2.5">
        <button
          className="flex-1 rounded-lg border border-blue-600 bg-blue-600 px-3 py-2 text-sm text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
          onClick={actions.saveToken}
          disabled={state.saving}
        >
          Connect with token
        </button>
        <button
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-70"
          onClick={actions.oauthLogin}
          disabled={state.oauthLoading || state.saving}
        >
          {state.oauthLoading ? (
            'Connecting...'
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span>Sign in with</span>
              <img src={notionLogo} alt="" className="block h-4 w-4" />
            </span>
          )}
        </button>
      </div>
    </div>
  )
}

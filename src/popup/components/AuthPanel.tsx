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
    <div className="auth-panel">
      <div className="auth-label-row">
        <label className="auth-label" htmlFor="notion-internal-token">
          Integration token (Notion)
        </label>
        <button
          type="button"
          className="help-btn"
          onClick={actions.openHelp}
          title="Open Notion docs: create integration and get internal token"
          aria-label="Open Notion docs: create integration and get internal token"
        >
          ?
        </button>
      </div>

      <div className="token-row">
        <input
          id="notion-internal-token"
          type={state.showToken ? 'text' : 'password'}
          placeholder="ntn_..."
          value={state.inputToken}
          onChange={(e) => actions.setInputToken(e.target.value)}
          className="token-input"
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="token-toggle-btn"
          onClick={actions.toggleTokenVisibility}
          title={state.showToken ? 'Hide token' : 'Show token'}
          aria-label={state.showToken ? 'Hide token' : 'Show token'}
        >
          {state.showToken ? <IconEyeOff size={18} stroke={2} /> : <IconEye size={18} stroke={2} />}
        </button>
      </div>

      <div className="auth-actions">
        <button className="btn-primary" onClick={actions.saveToken} disabled={state.saving}>
          Connect with token
        </button>
        <button
          className="btn-secondary"
          onClick={actions.oauthLogin}
          disabled={state.oauthLoading || state.saving}
        >
          {state.oauthLoading ? (
            'Connecting...'
          ) : (
            <span className="oauth-inline">
              <span>Sign in with</span>
              <img src={notionLogo} alt="" className="oauth-logo" />
            </span>
          )}
        </button>
      </div>
    </div>
  )
}

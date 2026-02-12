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
    <div className="mb auth-panel">
      <div className="label-row">
        <label className="label">Integration token (Notion)</label>
        <button
          type="button"
          className="help-icon-btn"
          onClick={actions.openHelp}
          title="Open Notion docs: create integration and get internal token"
          aria-label="Open Notion docs: create integration and get internal token"
        >
          ?
        </button>
      </div>

      <div className="token-input-row mb">
        <input
          type={state.showToken ? 'text' : 'password'}
          placeholder="ntn_..."
          value={state.inputToken}
          onChange={(e) => actions.setInputToken(e.target.value)}
        />
        <button
          type="button"
          className="token-visibility-btn"
          onClick={actions.toggleTokenVisibility}
          title={state.showToken ? 'Hide token' : 'Show token'}
          aria-label={state.showToken ? 'Hide token' : 'Show token'}
        >
          {state.showToken ? <IconEyeOff size={18} stroke={2} /> : <IconEye size={18} stroke={2} />}
        </button>
      </div>

      <div className="auth-actions">
        <button className="primary auth-btn" onClick={actions.saveToken} disabled={state.saving}>
          Connect with token
        </button>
        <button
          className="auth-btn"
          onClick={actions.oauthLogin}
          disabled={state.oauthLoading || state.saving}
        >
          {state.oauthLoading ? (
            'Connecting...'
          ) : (
            <span className="oauth-btn-content">
              <span>Sign in with</span>
              <img src={notionLogo} alt="" className="oauth-btn-logo" />
            </span>
          )}
        </button>
      </div>
    </div>
  )
}

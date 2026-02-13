import { AuthPanel } from './components/AuthPanel'
import { DataSourceOrderPanel } from './components/DataSourceOrderPanel'
import { TemplatesPanel } from './components/TemplatesPanel'
import { TopBar } from './components/TopBar'
import { usePopupController } from './hooks/usePopupController'

const INTERNAL_TOKEN_HELP_URL =
  'https://www.notion.com/help/create-integrations-with-the-notion-api'

export default function Popup() {
  const c = usePopupController()

  return (
    <div className="popup-shell">
      <TopBar state={c.topBar} actions={c.topBarActions} />

      {c.message && (
        <p
          className={`popup-message ${
            c.token ? 'popup-message--connected' : 'popup-message--disconnected'
          }`}
        >
          {c.message}
        </p>
      )}

      {!c.token ? (
        <AuthPanel
          state={c.auth}
          actions={{
            ...c.authActions,
            openHelp: () => window.open(INTERNAL_TOKEN_HELP_URL, '_blank', 'noopener,noreferrer'),
          }}
        />
      ) : c.loadingSources ? (
        <div className="loading-panel" aria-live="polite" aria-busy="true">
          <p className="popup-hint popup-hint--centered">Loading data sources...</p>
          <div className="loading-skeleton" />
          <div className="loading-skeleton loading-skeleton--short" />
          <div className="loading-skeleton loading-skeleton--mid" />
        </div>
      ) : c.dataSources.length === 0 ? (
        <p className="popup-hint">
          No accessible data sources found for this account/token. Open Settings and refresh access.
        </p>
      ) : (
        <div className="popup-card">
          {c.hasMultipleDataSources && c.showDataSourceOrder && (
            <DataSourceOrderPanel state={c.order} actions={c.orderActions} />
          )}
          <TemplatesPanel state={c.templates} actions={c.templateActions} />
        </div>
      )}
    </div>
  )
}

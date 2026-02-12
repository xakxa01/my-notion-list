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
    <div className="popup-root">
      <TopBar state={c.topBar} actions={c.topBarActions} />

      {c.message && (
        <p className={`status ${c.token ? 'connected' : 'disconnected'}`}>{c.message}</p>
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
        <p className="mb loading-row" style={{ fontSize: 13, color: '#666' }}>
          Loading data sources...
        </p>
      ) : c.dataSources.length === 0 ? (
        <p className="mb" style={{ fontSize: 13, color: '#666' }}>
          No accessible data sources found for this account/token.
        </p>
      ) : (
        <div className="database-section mb">
          {c.hasMultipleDataSources && c.showDataSourceOrder && (
            <DataSourceOrderPanel state={c.order} actions={c.orderActions} />
          )}
          <TemplatesPanel state={c.templates} actions={c.templateActions} />
        </div>
      )}
    </div>
  )
}

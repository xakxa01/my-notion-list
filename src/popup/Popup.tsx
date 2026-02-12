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
    <div className="w-[360px] p-3 text-[14px] text-zinc-900">
      <TopBar state={c.topBar} actions={c.topBarActions} />

      {c.message && (
        <p
          className={`mb-3 rounded-md px-2.5 py-2 text-[13px] ${
            c.token ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
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
        <p className="mb-3 w-full text-center text-[13px] text-zinc-500">Loading data sources...</p>
      ) : c.dataSources.length === 0 ? (
        <p className="mb-3 text-[13px] text-zinc-500">
          No accessible data sources found for this account/token.
        </p>
      ) : (
        <div className="mb-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          {c.hasMultipleDataSources && c.showDataSourceOrder && (
            <DataSourceOrderPanel state={c.order} actions={c.orderActions} />
          )}
          <TemplatesPanel state={c.templates} actions={c.templateActions} />
        </div>
      )}
    </div>
  )
}

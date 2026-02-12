import { IconRefresh } from '@tabler/icons-react'
import type { DataSourceInfo, TemplateInfo } from '../types'

type TemplatesState = {
  currentDataSource: DataSourceInfo | null
  sortedTemplates: TemplateInfo[]
  hasSingleDataSource: boolean
  syncingNow: boolean
  draggedTemplate: string | null
}

type TemplatesActions = {
  hardSync: () => void
  dragStart: (id: string) => void
  dragEnd: () => void
  dragOver: (targetId: string, targetIndex: number) => void
}

type TemplatesPanelProps = {
  state: TemplatesState
  actions: TemplatesActions
}

export function TemplatesPanel({ state, actions }: TemplatesPanelProps) {
  return (
    <>
      <div className="database-info">
        <span className="database-icon">
          {state.currentDataSource?.icon?.type === 'emoji' ? (
            <span>{state.currentDataSource.icon.emoji}</span>
          ) : state.currentDataSource?.icon?.type === 'file' ? (
            <img src={state.currentDataSource.icon.file.url} alt="" />
          ) : (
            <span>📄</span>
          )}
        </span>

        <div className="database-name-wrap">
          <span className="database-name">{state.currentDataSource?.name || 'Untitled'}</span>
          {state.hasSingleDataSource && (
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
        </div>
      </div>

      <div className="templates-section">
        <ul className="templates-list">
          {state.sortedTemplates.map((tpl, index) => (
            <li
              key={tpl.id}
              className="template-item"
              draggable
              onDragStart={() => actions.dragStart(tpl.id)}
              onDragEnd={actions.dragEnd}
              onDragOver={(e) => {
                e.preventDefault()
                actions.dragOver(tpl.id, index)
              }}
              style={{ opacity: state.draggedTemplate === tpl.id ? 0.5 : 1 }}
            >
              <span style={{ marginRight: 8 }}>
                {tpl.icon?.type === 'emoji' ? (
                  <span>{tpl.icon.emoji}</span>
                ) : tpl.icon?.type === 'file' ? (
                  <img
                    src={tpl.icon.file.url}
                    alt=""
                    style={{ width: 18, height: 18, verticalAlign: 'middle' }}
                  />
                ) : (
                  <span>📄</span>
                )}
              </span>
              {tpl.name}
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

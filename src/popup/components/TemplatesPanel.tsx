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
      <div className="templates-header">
        <span className="ds-icon-wrap">
          {state.currentDataSource?.icon?.type === 'emoji' ? (
            <span>{state.currentDataSource.icon.emoji}</span>
          ) : state.currentDataSource?.icon?.type === 'file' ? (
            <img src={state.currentDataSource.icon.file.url} alt="" className="ds-icon-image" />
          ) : (
            <span>📄</span>
          )}
        </span>

        <div className="ds-title-wrap">
          <span className="ds-title">{state.currentDataSource?.name || 'Untitled'}</span>
          {state.hasSingleDataSource && (
            <button
              type="button"
              className="icon-btn sync-icon sync-icon--inline"
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
        </div>
      </div>

      <div className="templates-body">
        <ul className="plain-list">
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
              <span className="template-icon-wrap">
                {tpl.icon?.type === 'emoji' ? (
                  <span>{tpl.icon.emoji}</span>
                ) : tpl.icon?.type === 'file' ? (
                  <img src={tpl.icon.file.url} alt="" className="template-icon-image" />
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

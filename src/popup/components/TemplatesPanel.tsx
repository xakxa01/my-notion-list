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
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center text-2xl leading-none">
          {state.currentDataSource?.icon?.type === 'emoji' ? (
            <span>{state.currentDataSource.icon.emoji}</span>
          ) : state.currentDataSource?.icon?.type === 'file' ? (
            <img
              src={state.currentDataSource.icon.file.url}
              alt=""
              className="h-6 w-6 object-contain"
            />
          ) : (
            <span>📄</span>
          )}
        </span>

        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="truncate text-[15px] font-semibold text-zinc-900">
            {state.currentDataSource?.name || 'Untitled'}
          </span>
          {state.hasSingleDataSource && (
            <button
              type="button"
              className="group ml-auto inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-800 transition hover:bg-zinc-50"
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
        </div>
      </div>

      <div className="mt-3">
        <ul className="m-0 list-none p-0">
          {state.sortedTemplates.map((tpl, index) => (
            <li
              key={tpl.id}
              className="mb-1 flex cursor-grab items-center rounded border border-zinc-200 bg-white px-2 py-1.5 text-[13px] text-zinc-700 last:mb-0 active:cursor-grabbing"
              draggable
              onDragStart={() => actions.dragStart(tpl.id)}
              onDragEnd={actions.dragEnd}
              onDragOver={(e) => {
                e.preventDefault()
                actions.dragOver(tpl.id, index)
              }}
              style={{ opacity: state.draggedTemplate === tpl.id ? 0.5 : 1 }}
            >
              <span className="mr-2">
                {tpl.icon?.type === 'emoji' ? (
                  <span>{tpl.icon.emoji}</span>
                ) : tpl.icon?.type === 'file' ? (
                  <img src={tpl.icon.file.url} alt="" className="h-[18px] w-[18px] align-middle" />
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

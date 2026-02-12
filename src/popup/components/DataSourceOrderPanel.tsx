import type { DataSourceInfo } from '../types'

type OrderState = {
  dataSources: DataSourceInfo[]
  draggedSource: string | null
}

type OrderActions = {
  dragStart: (id: string) => void
  dragEnd: () => void
  dragOver: (targetId: string, targetIndex: number) => void
}

type DataSourceOrderPanelProps = {
  state: OrderState
  actions: OrderActions
}

export function DataSourceOrderPanel({ state, actions }: DataSourceOrderPanelProps) {
  return (
    <div className="mb-3 rounded-lg border border-zinc-300 bg-zinc-100 p-2">
      <ul className="m-0 list-none p-0">
        {state.dataSources.map((source, index) => (
          <li
            key={source.id}
            className="mb-1 cursor-grab rounded border border-zinc-200 bg-white px-2 py-1.5 text-[13px] text-zinc-700 last:mb-0 active:cursor-grabbing"
            draggable
            onDragStart={() => actions.dragStart(source.id)}
            onDragEnd={actions.dragEnd}
            onDragOver={(e) => {
              e.preventDefault()
              actions.dragOver(source.id, index)
            }}
            style={{ opacity: state.draggedSource === source.id ? 0.5 : 1 }}
          >
            {source.name}
          </li>
        ))}
      </ul>
    </div>
  )
}

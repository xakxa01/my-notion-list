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
    <div className="data-source-order-panel mb">
      <ul className="templates-list">
        {state.dataSources.map((source, index) => (
          <li
            key={source.id}
            className="template-item"
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

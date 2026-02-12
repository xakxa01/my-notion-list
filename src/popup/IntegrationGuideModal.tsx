import './IntegrationGuideModal.css'

const MY_INTEGRATIONS_URL = 'https://www.notion.so/my-integrations'

type Props = {
  open: boolean
  onClose: () => void
}

export default function IntegrationGuideModal({ open, onClose }: Props) {
  if (!open) return null
  return (
    <div className="guide-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Guía de integración">
      <div className="guide-modal" onClick={(e) => e.stopPropagation()}>
        <div className="guide-header">
          <h2>¿Cómo configuro la integración?</h2>
          <button type="button" className="guide-close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>
        <ol className="guide-steps">
          <li>
            Ve a{' '}
            <a href={MY_INTEGRATIONS_URL} target="_blank" rel="noreferrer">
              Notion → My integrations
            </a>
            .
          </li>
          <li>Crea una integración (Internal o Public según uses token manual u OAuth).</li>
          <li>
            <strong>Si es Internal:</strong> en Capabilities activa lo necesario; en tu base de datos, menú ⋮ →
            “Conectar con” → tu integración; copia el token “Secret” y pégalo aquí.
          </li>
          <li>
            <strong>Si es Public (OAuth):</strong> configura la Redirect URI que te indiquemos; luego usa “Iniciar
            sesión con Notion” y, en la pantalla de Notion, inicia sesión (con Google si tu workspace lo tiene) y acepta
            el acceso.
          </li>
          <li>
            En <strong>Opciones</strong> elige la base de datos donde quieres guardar el texto.
          </li>
        </ol>
        <div className="guide-footer">
          <button type="button" className="primary" onClick={onClose}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}

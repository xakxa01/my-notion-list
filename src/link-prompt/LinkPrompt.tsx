import { useEffect, useMemo, useState } from 'react'

declare const chrome: {
  runtime: { sendMessage: (msg: unknown, cb: (r: unknown) => void) => void }
  windows: { getCurrent: (cb: (w: { id?: number }) => void) => void; remove: (id: number) => void }
}

type PendingLinkSaveRequest = {
  id: string
  databaseId: string
  templateId: string
  selectionText: string
  pageUrl: string
  urlProperties: string[]
  defaultUrlProperty: string | null
  createdAt: number
}

type PendingResponse = { request?: PendingLinkSaveRequest | null }

const MAX_PREVIEW_LENGTH = 220

function truncate(value: string, max = MAX_PREVIEW_LENGTH): string {
  if (value.length <= max) return value
  return `${value.slice(0, max).trim()}...`
}

export default function LinkPrompt() {
  const [request, setRequest] = useState<PendingLinkSaveRequest | null>(null)
  const [selectedProperty, setSelectedProperty] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_PENDING_LINK_SAVE_REQUEST' }, (r: unknown) => {
      const res = r as PendingResponse
      const pending = res?.request ?? null
      setRequest(pending)
      setSelectedProperty(pending?.defaultUrlProperty || pending?.urlProperties?.[0] || '')
      setLoading(false)
    })
  }, [])

  const urlOptions = useMemo(() => request?.urlProperties ?? [], [request])
  const showSelect = urlOptions.length > 1

  const closeWindow = () => {
    chrome.windows.getCurrent((w) => {
      if (w?.id) chrome.windows.remove(w.id)
    })
  }

  const handleCancel = () => {
    chrome.runtime.sendMessage({ type: 'CANCEL_LINK_SAVE_REQUEST' }, () => closeWindow())
  }

  const handleConfirm = () => {
    if (!request) return
    setSaving(true)
    chrome.runtime.sendMessage(
      { type: 'CONFIRM_LINK_SAVE_REQUEST', requestId: request.id, propertyKey: selectedProperty },
      (r: unknown) => {
        const ok = Boolean((r as { ok?: boolean })?.ok)
        if (!ok) {
          setMessage('Could not save the link. Try again.')
          setSaving(false)
          return
        }
        closeWindow()
      }
    )
  }

  if (loading) {
    return (
      <div className="prompt-shell">
        <div className="prompt-card">
          <p className="prompt-muted">Loading...</p>
          <div className="loading-skeleton" />
          <div className="loading-skeleton loading-skeleton--short" />
        </div>
      </div>
    )
  }

  if (!request) {
    return (
      <div className="prompt-shell">
        <div className="prompt-card">
          <h1 className="prompt-title">No pending request</h1>
          <p className="prompt-muted">Close this window and try again.</p>
          <div className="prompt-actions">
            <button type="button" className="btn-secondary" onClick={closeWindow}>
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="prompt-shell">
      <div className="prompt-card">
        <h1 className="prompt-title">Add the page link?</h1>
        <p className="prompt-muted">
          Choose which URL property should receive the current page link.
        </p>

        <div className="prompt-block">
          <span className="prompt-label">Selected text</span>
          <p className="prompt-value">{truncate(request.selectionText)}</p>
        </div>

        <div className="prompt-block">
          <span className="prompt-label">Page URL</span>
          <p className="prompt-value">{truncate(request.pageUrl, 140)}</p>
        </div>

        <div className="prompt-block">
          <span className="prompt-label">URL property</span>
          {showSelect ? (
            <select
              className="prompt-select"
              value={selectedProperty}
              onChange={(e) => setSelectedProperty(e.target.value)}
            >
              {urlOptions.map((prop) => (
                <option key={prop} value={prop}>
                  {prop}
                </option>
              ))}
            </select>
          ) : (
            <p className="prompt-value">{urlOptions[0] || 'No URL property found'}</p>
          )}
        </div>

        {message && <p className="prompt-error">{message}</p>}

        <div className="prompt-actions">
          <button type="button" className="btn-secondary" onClick={handleCancel} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleConfirm} disabled={saving}>
            {saving ? 'Saving...' : 'Save with link'}
          </button>
        </div>
      </div>
    </div>
  )
}

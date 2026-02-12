import {
  ACTIVE_DATA_SOURCE_IDS_KEY,
  ACTIVE_DATA_SOURCE_SELECTION_CONFIGURED_KEY,
  DATA_SOURCES_CACHE_TTL_MS,
  DATA_SOURCES_LIST_CACHE_KEY,
  DATA_SOURCE_ORDER_KEY,
} from '../../shared/constants'
import { normalizeDatabaseIds, sortIdsByOrder } from '../../shared/ids'
import { getTitleFromResult } from '../../shared/notion-parsers'
import { notionFetch } from './notion-client'
import type { DataSource } from './types'

function getDataSourceOrder(): Promise<string[]> {
  return new Promise((resolve) => {
    chrome.storage.sync.get([DATA_SOURCE_ORDER_KEY], (r) => {
      resolve(normalizeDatabaseIds(r[DATA_SOURCE_ORDER_KEY]))
    })
  })
}

export function setDataSourceOrder(order: string[]): Promise<void> {
  const normalized = normalizeDatabaseIds(order)
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [DATA_SOURCE_ORDER_KEY]: normalized }, () => resolve())
  })
}

function getStoredActiveDataSourceIds(): Promise<string[] | null> {
  return new Promise((resolve) => {
    chrome.storage.sync.get([ACTIVE_DATA_SOURCE_IDS_KEY], (r) => {
      const raw = r[ACTIVE_DATA_SOURCE_IDS_KEY]
      if (typeof raw === 'undefined') return resolve(null)
      resolve(normalizeDatabaseIds(raw))
    })
  })
}

function getActiveDataSourceSelectionConfigured(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.sync.get([ACTIVE_DATA_SOURCE_SELECTION_CONFIGURED_KEY], (r) => {
      resolve(Boolean(r[ACTIVE_DATA_SOURCE_SELECTION_CONFIGURED_KEY]))
    })
  })
}

export async function setActiveDataSourceIds(ids: string[], configured = false): Promise<void> {
  const normalized = normalizeDatabaseIds(ids)
  return new Promise<void>((resolve) => {
    chrome.storage.sync.set(
      {
        [ACTIVE_DATA_SOURCE_IDS_KEY]: normalized,
        [ACTIVE_DATA_SOURCE_SELECTION_CONFIGURED_KEY]: configured,
      },
      () => resolve()
    )
  })
}

export async function getActiveDataSourceIds(availableIds: string[]): Promise<string[]> {
  const normalizedAvailable = normalizeDatabaseIds(availableIds)
  const stored = await getStoredActiveDataSourceIds()
  const configured = await getActiveDataSourceSelectionConfigured()

  if (!configured) {
    await setActiveDataSourceIds(normalizedAvailable, false)
    return normalizedAvailable
  }

  if (stored === null) {
    await setActiveDataSourceIds(normalizedAvailable, true)
    return normalizedAvailable
  }

  const availableSet = new Set(normalizedAvailable)
  const active = stored.filter((id) => availableSet.has(id))
  if (JSON.stringify(active) !== JSON.stringify(stored)) {
    await setActiveDataSourceIds(active, true)
  }
  return active
}

export async function searchDataSources(
  token: string,
  forceRefresh = false
): Promise<DataSource[]> {
  if (!forceRefresh) {
    const cachedRaw = await new Promise<string | undefined>((resolve) => {
      chrome.storage.local.get([DATA_SOURCES_LIST_CACHE_KEY], (r) => {
        resolve((r as Record<string, string | undefined>)[DATA_SOURCES_LIST_CACHE_KEY])
      })
    })

    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw) as { ts: number; sources: DataSource[] }
        if (Date.now() - cached.ts < DATA_SOURCES_CACHE_TTL_MS && Array.isArray(cached.sources)) {
          return cached.sources
        }
      } catch {
        // ignore malformed cache
      }
    }
  }

  const byId = new Map<string, DataSource>()

  const fetchSearch = async (payload: Record<string, unknown>): Promise<void> => {
    let startCursor: string | null = null
    let hasMore = true

    while (hasMore) {
      const body = startCursor ? { ...payload, start_cursor: startCursor } : payload
      const res = await notionFetch(token, '/v1/search', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      if (!res.ok) break

      const data = (await res.json()) as {
        results?: Array<{ object: string; id: string; title?: Array<{ plain_text: string }> }>
        has_more?: boolean
        next_cursor?: string | null
      }

      const results = data.results ?? []
      for (const r of results) {
        if (r.object !== 'data_source' && r.object !== 'database') continue
        if (!byId.has(r.id)) {
          byId.set(r.id, { id: r.id, name: getTitleFromResult(r) || 'Untitled' })
        }
      }

      hasMore = Boolean(data.has_more)
      startCursor = data.next_cursor ?? null
    }
  }

  await fetchSearch({ page_size: 100 })
  if (byId.size === 0) {
    await fetchSearch({ filter: { property: 'object', value: 'data_source' }, page_size: 100 })
  }
  if (byId.size === 0) {
    await fetchSearch({ filter: { property: 'object', value: 'database' }, page_size: 100 })
  }

  const result = Array.from(byId.values())
  await new Promise<void>((resolve) => {
    chrome.storage.local.set(
      { [DATA_SOURCES_LIST_CACHE_KEY]: JSON.stringify({ ts: Date.now(), sources: result }) },
      () => resolve()
    )
  })

  return result
}

export async function getOrderedDataSourceIds(
  token: string,
  forceRefresh = false
): Promise<string[]> {
  const sources = await searchDataSources(token, forceRefresh)
  const sourceIds = normalizeDatabaseIds(sources.map((s) => s.id))
  const savedOrder = await getDataSourceOrder()
  const sorted = sortIdsByOrder(sourceIds, savedOrder)

  if (JSON.stringify(sorted) !== JSON.stringify(savedOrder)) {
    await setDataSourceOrder(sorted)
  }

  const activeIds = await getActiveDataSourceIds(sorted)
  const activeSet = new Set(activeIds)
  return sorted.filter((id) => activeSet.has(id))
}

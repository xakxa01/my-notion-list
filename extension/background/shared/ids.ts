export function normalizeDatabaseIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return []
  const unique = Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)))
  return unique
}

export function sortIdsByOrder(ids: string[], order: string[]): string[] {
  const rank = new Map(order.map((id, index) => [id, index]))
  return [...ids].sort((a, b) => {
    const ra = rank.has(a) ? (rank.get(a) as number) : Number.MAX_SAFE_INTEGER
    const rb = rank.has(b) ? (rank.get(b) as number) : Number.MAX_SAFE_INTEGER
    if (ra !== rb) return ra - rb
    return 0
  })
}

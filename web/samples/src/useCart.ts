import { useState } from 'react'
import { dishes } from './data'
export function useCart() {
  const [c, set] = useState<Record<string, number>>({})
  const add = (id: string, d = 1) => set(p => { const n = Math.max(0, (p[id] || 0) + d); const q = { ...p, [id]: n }; if (!n) delete q[id]; return q })
  const count = Object.values(c).reduce((a, b) => a + b, 0)
  const total = Object.entries(c).reduce((a, [id, n]) => a + (dishes.find(x => x.id === id)?.full || 0) * n, 0)
  return { c, add, count, total }
}

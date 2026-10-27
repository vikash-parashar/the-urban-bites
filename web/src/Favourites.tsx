import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { fetchFavourites, type FavItem, type PlacedOrder } from './api'
import { lookup, unitPrice, type Cart } from './cart'
import { dishImage, rupees } from './menu'
import { loadMe } from './shop'

const SHOWN = 'ub-fav-shown'

// "Welcome back" popup with the combo this customer orders most. They can change the
// quantities or drop a dish, then put it all in the cart in one tap (and edit it further there).
export default function FavouritesPopup({ orders, cart, accepting, onOpenCart }: { orders: PlacedOrder[]; cart: Cart; accepting: boolean; onOpenCart: () => void }) {
  const [items, setItems] = useState<FavItem[] | null>(null)
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)
  const latest = orders[0]

  useEffect(() => {
    if (!latest || !accepting) return
    try { if (sessionStorage.getItem(SHOWN)) return } catch { /* blocked */ }
    let live = true
    const t = setTimeout(() => {
      fetchFavourites(latest).then((f) => {
        if (!live || !f) return
        const usable = f.items.filter((i) => { const m = lookup(i.item_id); return m && unitPrice(m, i.size) > 0 })
        if (!usable.length || cart.count > 0) return
        setItems(usable); setCount(f.orders); setOpen(true)
        try { sessionStorage.setItem(SHOWN, '1') } catch { /* blocked */ }
      }).catch(() => {})
    }, 2500) // let the page settle (and the intro play) first
    return () => { live = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.id, accepting])

  const total = useMemo(() => (items ?? []).reduce((s, i) => { const m = lookup(i.item_id); return m ? s + unitPrice(m, i.size) * i.qty : s }, 0), [items])
  const name = (loadMe()?.name || latest?.customer_name || '').trim().split(/\s+/)[0]

  const setQty = (k: number, d: number) => setItems((list) => (list ?? []).map((i, n) => (n === k ? { ...i, qty: Math.max(0, Math.min(20, i.qty + d)) } : i)).filter((i) => i.qty > 0))
  const close = () => setOpen(false)
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  }, [open])
  const addAll = () => {
    const merged = [...cart.lines]
    for (const i of items ?? []) {
      const hit = merged.find((l) => l.itemId === i.item_id && l.size === i.size)
      if (hit) hit.qty += i.qty
      else merged.push({ itemId: i.item_id, size: i.size, qty: i.qty })
    }
    cart.dispatch({ type: 'fill', lines: merged.map((l) => ({ ...l })) })
    setOpen(false)
    onOpenCart()
  }
  const browse = () => { setOpen(false); location.hash = '#menu' }

  return (
    <AnimatePresence>
      {open && items && (
        <motion.div className="fav-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="fav-scrim" onClick={close} />
          <motion.div className="fav-card" role="dialog" aria-modal="true" aria-labelledby="fav-title"
            initial={{ y: 60, scale: 0.94 }} animate={{ y: 0, scale: 1 }} exit={{ y: 60, opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 26 }}>
            <button className="fav-x" onClick={close} aria-label="Close">✕</button>
            <p className="eyebrow">Welcome back{name ? `, ${name}` : ''} 👋</p>
            <h3 id="fav-title">Your usual? 😋</h3>
            <p className="menu-sub">{count > 1 ? `You loved these the most across your ${count} orders. Change anything, then order in one tap.` : 'Same as last time? Change anything, then order in one tap.'}</p>
            <ul className="fav-list">
              <AnimatePresence initial={false}>
                {items.map((i, k) => {
                  const m = lookup(i.item_id)!
                  return (
                    <motion.li key={i.item_id + i.size} layout initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40, height: 0 }}>
                      {m.image ? <img src={dishImage(m.image)} alt="" /> : <span className="fav-noimg" aria-hidden="true">🍽️</span>}
                      <div className="fav-name">
                        <b>{m.name}{i.size === 'half' ? ' (Half)' : ''}</b>
                        <small>{i.times > 1 ? `ordered ${i.times} times` : 'last time'} · {rupees(unitPrice(m, i.size))} each</small>
                      </div>
                      <div className="stepper fav-step">
                        <button onClick={() => setQty(k, -1)} aria-label={`One less ${m.name}`}>{i.qty === 1 ? '🗑' : '−'}</button>
                        <span aria-live="polite">{i.qty}</span>
                        <button onClick={() => setQty(k, 1)} aria-label={`One more ${m.name}`}>+</button>
                      </div>
                    </motion.li>
                  )
                })}
              </AnimatePresence>
            </ul>
            {items.length === 0 ? (
              <p className="menu-sub">All removed. Pick something new from the menu.</p>
            ) : (
              <p className="fav-total">Combo total <b>{rupees(total)}</b></p>
            )}
            <div className="fav-actions">
              <button className="btn btn-ghost btn-sm" onClick={browse}>+ Add more from menu</button>
              {items.length > 0 && (
                <motion.button className="btn btn-gold" whileTap={{ scale: 0.96 }} onClick={addAll}>Yes, order this →</motion.button>
              )}
            </div>
            <button className="fav-later" onClick={close}>Not today</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

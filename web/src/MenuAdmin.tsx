import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { staffApi, type ItemInput, type MenuCategoryAdmin, type MenuItemAdmin } from './staffApi'
import { useGuard } from './StaffExtras'
import { motion } from 'motion/react'
import { itemKind } from './kit'
import { rupees } from './menu'
import { MButton } from './motion'

export const TAGS: [string, string][] = [['', 'No tag'], ['bestseller', '🔥 Bestseller'], ['new', '✨ New'], ['spicy', '🌶️ Spicy'], ['chef', '👨‍🍳 Chef’s special']]

function margin(price?: number | null, cost?: number | null) {
  if (price == null || cost == null || price <= 0) return null
  return Math.round(((price - cost) / price) * 100)
}

// The owner's menu: prices, cost prices, tags, on/off, add, edit and delete.
export default function MenuAdmin({ onSignedOut }: { onSignedOut: () => void }) {
  const [cats, setCats] = useState<MenuCategoryAdmin[]>([])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const { error, guard } = useGuard(onSignedOut)

  const load = useCallback(async () => {
    const r = await guard(staffApi.menu())
    if (r) setCats(r.categories)
  }, [guard])
  useEffect(() => { load() }, [load])

  const images = useMemo(() => [...new Set(cats.flatMap((c) => c.items.map((i) => i.image ?? '')).filter(Boolean))].sort(), [cats])
  const missing = cats.flatMap((c) => c.items).filter((i) => i.full != null && i.cost_full == null).length

  async function save(id: string, u: ItemInput, note?: string) {
    if ((await guard(staffApi.updateItem(id, u))) !== undefined) {
      if (note) setMsg(note)
      load()
    }
  }

  async function addSection(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    const c = await guard(staffApi.createCategory(String(f.get('name')), String(f.get('name_hi') ?? '')))
    if (c) { form.reset(); setMsg(`Added the section ${c.name}. Now add dishes to it.`); setAdding(c.id); load() }
  }

  const needle = q.trim().toLowerCase()
  return (
    <div className="menu-admin">
      <div className="board-head">
        <div>
          <h2 className="staff-h">Menu</h2>
          <p className="menu-sub">Prices save when you leave the box or press Enter. The website updates within a minute.</p>
        </div>
        <input className="ma-search" type="search" placeholder="Find a dish" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a dish" />
      </div>
      {missing > 0 && <p className="dash-note small"><span aria-hidden="true">💡</span> {missing} dishes have no cost price. Add what one plate costs you to make, and the dashboard shows real profit.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {msg && <p className="oc-eta" role="status">{msg}</p>}

      {cats.map((c) => {
        const items = needle ? c.items.filter((i) => i.name.toLowerCase().includes(needle) || (i.name_hi ?? '').includes(q.trim())) : c.items
        if (needle && items.length === 0) return null
        return (
          <section key={c.id} className="ma-cat">
            <div className="ma-cat-head">
              <h3 className="panel-h">{c.name} <small lang="hi">{c.name_hi}</small> <span className="muted">{c.items.length}</span></h3>
              <MButton className="btn btn-ghost btn-sm" onClick={() => setAdding(adding === c.id ? null : c.id)}>{adding === c.id ? 'Close' : '+ Add dish'}</MButton>
            </div>
            {adding === c.id && (
              <ItemForm cats={cats} images={images} initial={{ category_id: c.id }} submitLabel="Add to menu"
                onCancel={() => setAdding(null)}
                onSubmit={async (u) => {
                  const it = await guard(staffApi.createItem(u))
                  if (it) { setAdding(null); setMsg(`${it.name} is on the menu.`); load() }
                }} />
            )}
            <div className="ma-head-row" aria-hidden="true"><span>Dish</span><span>Selling price</span><span>Cost to make</span><span>Margin</span><span /></div>
            {items.map((i) => {
              const m = margin(i.full, i.cost_full)
              return (
                <motion.div layout key={i.id} className={`ma-row ${i.available ? '' : 'off'} ${open === i.id ? 'is-open' : ''}`} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}>
                  <div className="ma-name">
                    <span aria-hidden="true" className="ma-emoji">{itemKind(i.name, c.name).emoji}</span>
                    <span><strong>{i.name}</strong>{i.tag && <span className={`tag-chip tag-${i.tag}`}>{TAGS.find(([k]) => k === i.tag)?.[1]}</span>}<br /><small className="muted" lang="hi">{i.name_hi}</small></span>
                  </div>
                  <div className="ma-prices" data-label="Selling price">
                    <Money id={`p-${i.id}-full`} label="Full" value={i.full} onSave={(v) => save(i.id, { full: v ?? undefined })} />
                    <Money id={`p-${i.id}-half`} label="Half" value={i.half ?? null} clearable onSave={(v) => save(i.id, v == null ? { clear_half: true } : { half: v })} />
                  </div>
                  <div className="ma-prices" data-label="Cost to make">
                    <Money id={`c-${i.id}-full`} label="Full" value={i.cost_full ?? null} onSave={(v) => v != null && save(i.id, { cost_full: v })} />
                    {i.half != null && <Money id={`c-${i.id}-half`} label="Half" value={i.cost_half ?? null} clearable onSave={(v) => save(i.id, v == null ? { clear_cost_half: true } : { cost_half: v })} />}
                  </div>
                  <span className={`ma-margin ${m == null ? 'none' : m < 30 ? 'low' : 'ok'}`}>{m == null ? '—' : `${m}%`}<small>{m != null && i.full != null && i.cost_full != null ? ` ${rupees(i.full - i.cost_full)}/plate` : ''}</small></span>
                  <div className="ma-actions">
                    <label className="switch"><input id={`a-${i.id}`} type="checkbox" checked={i.available} onChange={(e) => save(i.id, { available: e.target.checked })} /><span>{i.available ? 'On menu' : 'Sold out'}</span></label>
                    <MButton className="btn btn-ghost btn-sm" onClick={() => setOpen(open === i.id ? null : i.id)} aria-expanded={open === i.id}>{open === i.id ? 'Close' : 'Edit'}</MButton>
                  </div>
                  {open === i.id && (
                    <div className="ma-edit">
                      <ItemForm cats={cats} images={images} initial={i} submitLabel="Save changes"
                        onCancel={() => setOpen(null)}
                        onSubmit={async (u) => { await save(i.id, u, `Saved ${u.name ?? i.name}.`); setOpen(null) }}
                        onDelete={async () => {
                          if ((await guard(staffApi.deleteItem(i.id))) !== undefined) { setOpen(null); setMsg(`${i.name} is off the menu for good. Past orders still show it.`); load() }
                        }} />
                    </div>
                  )}
                </motion.div>
              )
            })}
          </section>
        )
      })}

      <section className="ma-cat">
        <h3 className="panel-h">Add a menu section</h3>
        <form className="add-staff" onSubmit={addSection}>
          <label className="field" htmlFor="ns-cat">Section name<input id="ns-cat" name="name" required maxLength={40} placeholder="Combos" /></label>
          <label className="field" htmlFor="ns-cat-hi">In Hindi (optional)<input id="ns-cat-hi" name="name_hi" maxLength={40} lang="hi" placeholder="कॉम्बो" /></label>
          <MButton className="btn btn-gold">Add section</MButton>
        </form>
      </section>
    </div>
  )
}

function Money({ id, label, value, onSave, clearable }: { id: string; label: string; value: number | null; onSave: (v: number | null) => void; clearable?: boolean }) {
  const [v, setV] = useState(value?.toString() ?? '')
  useEffect(() => setV(value?.toString() ?? ''), [value])
  return (
    <label className="me-price" htmlFor={id}>
      <span>{label} ₹</span>
      <input id={id} inputMode="numeric" value={v} placeholder="—" onChange={(e) => setV(e.target.value.replace(/[^\d]/g, ''))}
        onBlur={() => {
          if (v === '' && value != null && clearable) return onSave(null)
          const n = parseInt(v, 10)
          if (!Number.isNaN(n) && n !== value) onSave(n)
          else setV(value?.toString() ?? '')
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
    </label>
  )
}

function ItemForm({ cats, images, initial, submitLabel, onSubmit, onCancel, onDelete }: {
  cats: MenuCategoryAdmin[]; images: string[]; initial: Partial<MenuItemAdmin>; submitLabel: string
  onSubmit: (u: ItemInput) => void | Promise<void>; onCancel: () => void; onDelete?: () => void | Promise<void>
}) {
  const [confirm, setConfirm] = useState(false)
  const isNew = !initial.id
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const num = (k: string) => { const s = String(f.get(k) ?? '').trim(); return s === '' ? undefined : parseInt(s, 10) }
    const u: ItemInput = {
      name: String(f.get('name')).trim(), name_hi: String(f.get('name_hi') ?? '').trim(), description: String(f.get('description') ?? '').trim(),
      tag: String(f.get('tag') ?? ''), category_id: String(f.get('category_id')), image: String(f.get('image') ?? ''),
    }
    if (isNew) Object.assign(u, { full: num('full'), half: num('half'), cost_full: num('cost_full'), cost_half: num('cost_half') })
    onSubmit(u)
  }
  const p = initial.id ?? 'new'
  return (
    <form className="item-form" onSubmit={submit}>
      <label className="field" htmlFor={`if-name-${p}`}>Dish name<input id={`if-name-${p}`} name="name" required maxLength={60} defaultValue={initial.name} placeholder="Malai Chaap Roll" /></label>
      <label className="field" htmlFor={`if-hi-${p}`}>Name in Hindi<input id={`if-hi-${p}`} name="name_hi" maxLength={60} lang="hi" defaultValue={initial.name_hi} placeholder="मलाई चाप रोल" /></label>
      <label className="field wide" htmlFor={`if-desc-${p}`}>One line about it (shows on the website)<input id={`if-desc-${p}`} name="description" maxLength={140} defaultValue={initial.description} placeholder="Creamy chaap from the tandoor, wrapped in rumali roti" /></label>
      {isNew && (
        <>
          <label className="field" htmlFor={`if-full-${p}`}>Full plate price ₹<input id={`if-full-${p}`} name="full" inputMode="numeric" required pattern="\d+" /></label>
          <label className="field" htmlFor={`if-half-${p}`}>Half plate price ₹ (optional)<input id={`if-half-${p}`} name="half" inputMode="numeric" pattern="\d*" /></label>
          <label className="field" htmlFor={`if-cf-${p}`}>Cost to make, full ₹<input id={`if-cf-${p}`} name="cost_full" inputMode="numeric" pattern="\d*" /></label>
          <label className="field" htmlFor={`if-ch-${p}`}>Cost to make, half ₹<input id={`if-ch-${p}`} name="cost_half" inputMode="numeric" pattern="\d*" /></label>
        </>
      )}
      <label className="field" htmlFor={`if-tag-${p}`}>Highlight<select id={`if-tag-${p}`} name="tag" defaultValue={initial.tag ?? ''}>{TAGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="field" htmlFor={`if-cat-${p}`}>Section<select id={`if-cat-${p}`} name="category_id" defaultValue={initial.category_id}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="field" htmlFor={`if-img-${p}`}>Photo<select id={`if-img-${p}`} name="image" defaultValue={initial.image ?? ''}><option value="">No photo (shows an emoji)</option>{images.map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
      <div className="item-form-actions">
        <MButton className="btn btn-gold">{submitLabel}</MButton>
        <MButton type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</MButton>
        {onDelete && (!confirm ? (
          <MButton type="button" className="btn btn-danger" onClick={() => setConfirm(true)}>Delete dish</MButton>
        ) : (
          <span className="confirm">Remove {initial.name} from the menu for good?
            <MButton type="button" className="btn btn-danger" onClick={() => onDelete()}>Yes, delete</MButton>
            <MButton type="button" className="btn btn-ghost" onClick={() => setConfirm(false)}>Keep it</MButton>
          </span>
        ))}
      </div>
    </form>
  )
}

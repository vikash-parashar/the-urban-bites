import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { staffApi, type Expense, type Period } from './staffApi'
import { useGuard } from './StaffExtras'
import { rupees } from './menu'

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const ICON: Record<string, string> = {
  'Vegetables & groceries': '🥬', 'Paneer & dairy': '🧀', Gas: '🔥', Packing: '📦', Staff: '🧑‍🍳', 'Rent & electricity': '💡', Repairs: '🔧', Other: '🧾',
}

// Expenses: everything the cart spends besides the per-plate cost, so the dashboard's profit is real.
export default function Expenses({ onSignedOut }: { onSignedOut: () => void }) {
  const [period, setPeriod] = useState<Period>('month')
  const [list, setList] = useState<Expense[]>([])
  const [total, setTotal] = useState(0)
  const [cats, setCats] = useState<string[]>(Object.keys(ICON))
  const [cat, setCat] = useState('Vegetables & groceries')
  const [msg, setMsg] = useState('')
  const [confirm, setConfirm] = useState<string | null>(null)
  const { error, guard } = useGuard(onSignedOut)

  const load = useCallback(async () => {
    const r = await guard(staffApi.expenses(period))
    if (r) { setList(r.expenses); setTotal(r.total); setCats(r.categories) }
  }, [guard, period])
  useEffect(() => { load() }, [load])

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    const r = await guard(staffApi.addExpense({ spent_on: String(f.get('spent_on')), category: cat, amount: parseInt(String(f.get('amount')), 10), note: String(f.get('note') ?? '') }))
    if (r) { form.reset(); setMsg(`Saved ${rupees(r.amount)} for ${r.category}.`); load() }
  }

  async function remove(id: string) {
    if ((await guard(staffApi.deleteExpense(id))) !== undefined) { setConfirm(null); load() }
  }

  return (
    <div className="menu-edit expenses">
      <h2 className="staff-h">Expenses</h2>
      <p className="menu-sub">Gas, vegetables, rent, staff: add what you spend and the dashboard takes it out of profit.</p>
      <form className="exp-form" onSubmit={add}>
        <div className="exp-cats" role="radiogroup" aria-label="What was it for">
          {cats.map((c) => (
            <button type="button" key={c} role="radio" aria-checked={cat === c} className="size" onClick={() => setCat(c)}>
              <span aria-hidden="true">{ICON[c] ?? '🧾'}</span> {c}
            </button>
          ))}
        </div>
        <label className="field" htmlFor="ex-amt">Amount ₹<input id="ex-amt" name="amount" inputMode="numeric" pattern="\d+" required placeholder="900" /></label>
        <label className="field" htmlFor="ex-day">Date<input id="ex-day" name="spent_on" type="date" max={today()} defaultValue={today()} required /></label>
        <label className="field" htmlFor="ex-note">Note (optional)<input id="ex-note" name="note" maxLength={140} placeholder="2 cylinders" /></label>
        <button className="btn btn-gold">Save expense</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {msg && <p className="oc-eta" role="status">{msg}</p>}

      <div className="board-head">
        <h3 className="panel-h">Spent: {rupees(total)}</h3>
        <div className="sizes" role="radiogroup" aria-label="Period">
          {([['week', 'This week'], ['month', 'This month'], ['year', 'This year']] as [Period, string][]).map(([p, l]) => (
            <button key={p} className="size" role="radio" aria-checked={period === p} onClick={() => setPeriod(p)}>{l}</button>
          ))}
        </div>
      </div>
      {list.length === 0 ? <p className="menu-sub">Nothing added for this period yet.</p> : (
        <ul className="lines">
          {list.map((x) => (
            <li key={x.id}>
              <span className="line-emoji" aria-hidden="true">{ICON[x.category] ?? '🧾'}</span>
              <div><strong>{x.category}</strong><small>{new Date(`${x.spent_on}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}{x.note ? ` · ${x.note}` : ''}</small></div>
              {confirm === x.id ? (
                <span className="confirm"><button className="btn btn-danger btn-sm" onClick={() => remove(x.id)}>Delete</button><button className="btn btn-ghost btn-sm" onClick={() => setConfirm(null)}>Keep</button></span>
              ) : <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(x.id)} aria-label={`Delete ${x.category} ${rupees(x.amount)}`}>✕</button>}
              <span className="line-total">{rupees(x.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

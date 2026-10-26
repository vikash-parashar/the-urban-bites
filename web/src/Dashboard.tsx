import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { rupees } from './menu'
import { staffApi, type Bucket, type Dashboard as Dash, type Period, type Split, type Totals } from './staffApi'
import { itemKind } from './kit'
import { useGuard } from './StaffExtras'
import { motion } from 'motion/react'
import { lift, slideIn, stagger } from './motion'
import { MButton } from './motion'

// Bars grow from the left when their row scrolls into view (driven by the parent, since a 0-width bar never "intersects").
const growX = { hidden: { scaleX: 0 }, show: { scaleX: 1, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const } } }

const PERIODS: [Period, string][] = [['day', 'Today'], ['week', 'This week'], ['month', 'This month'], ['year', 'This year']]
const PREV_NAME: Record<Period, string> = { day: 'yesterday', week: 'last week', month: 'the month before', year: 'last year' }
const SOURCE: Record<string, string> = { web: 'Website', counter: 'Counter', app: 'App' }
const PAY: Record<string, string> = { cash: 'Cash', online: 'UPI' }
const FUL: Record<string, string> = { pickup: 'Pickup', delivery: 'Delivery' }
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

// shift moves the anchor date one period back or forward (dates are YYYY-MM-DD in IST).
function shift(date: string, period: Period, by: number) {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  if (period === 'day') t.setUTCDate(t.getUTCDate() + by)
  if (period === 'week') t.setUTCDate(t.getUTCDate() + 7 * by)
  if (period === 'month') t.setUTCMonth(t.getUTCMonth() + by, 1)
  if (period === 'year') t.setUTCFullYear(t.getUTCFullYear() + by, 0, 1)
  return t.toISOString().slice(0, 10)
}

function rangeTitle(d: Dash) {
  const f = (s: string, o: Intl.DateTimeFormatOptions) => new Date(`${s}T12:00:00+05:30`).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', ...o })
  if (d.period === 'day') return f(d.from, { weekday: 'long', day: 'numeric', month: 'long' })
  if (d.period === 'year') return f(d.from, { year: 'numeric' })
  if (d.period === 'month') return f(d.from, { month: 'long', year: 'numeric' })
  return `${f(d.from, { day: 'numeric', month: 'short' })} – ${f(d.to, { day: 'numeric', month: 'short' })}`
}

const compact = (n: number) =>
  Math.abs(n) >= 100000 ? `₹${(n / 100000).toFixed(n % 100000 ? 1 : 0)}L` : Math.abs(n) >= 1000 ? `₹${(n / 1000).toFixed(n % 1000 ? 1 : 0)}K` : `₹${n}`

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// CountUp eases a number from its last value to the new one.
function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(value)
  const from = useRef(0)
  useEffect(() => {
    if (reduced()) { setShown(value); from.current = value; return }
    const start = performance.now(), a = from.current
    let raf = 0
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / 700)
      const v = Math.round(a + (value - a) * (1 - Math.pow(1 - p, 3)))
      setShown(v)
      if (p < 1) raf = requestAnimationFrame(step)
      else from.current = value
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <>{format(shown)}</>
}

function Delta({ now, before, period, goodUp = true, money = true }: { now: number; before: number; period: Period; goodUp?: boolean; money?: boolean }) {
  if (before === 0 && now === 0) return <span className="kpi-delta flat">Same as {PREV_NAME[period]}</span>
  if (before <= 0) return <span className="kpi-delta flat">{PREV_NAME[period][0].toUpperCase() + PREV_NAME[period].slice(1)}: {money ? rupees(before) : before}</span>
  const pct = Math.round(((now - before) / before) * 100)
  const up = pct > 0
  const cls = pct === 0 ? 'flat' : up === goodUp ? 'good' : 'bad'
  return (
    <span className={`kpi-delta ${cls}`}>
      <span aria-hidden="true">{pct === 0 ? '＝' : up ? '▲' : '▼'}</span> {Math.abs(pct)}% vs {PREV_NAME[period]}
    </span>
  )
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(600)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.floor(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

function niceMax(v: number) {
  if (v <= 0) return 100
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p
  return 10 * p
}

// SalesChart: sales as columns and profit as a line, on one rupee axis, with a hover tooltip per bucket.
function SalesChart({ series, bucket }: { series: Bucket[]; bucket: Dash['bucket'] }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const h = 240, padL = 44, padR = 8, padT = 12, padB = 26
  const lo = Math.min(0, ...series.map((b) => b.profit))
  const hi = niceMax(Math.max(...series.map((b) => b.revenue), ...series.map((b) => b.profit), 1))
  const min = lo < 0 ? -niceMax(-lo) : 0
  const y = (v: number) => padT + (h - padT - padB) * (1 - (v - min) / (hi - min))
  const band = (w - padL - padR) / Math.max(1, series.length)
  const bw = Math.min(24, band * 0.62)
  const x = (i: number) => padL + band * i + band / 2
  const ticks = [min, min + (hi - min) / 2, hi].filter((v, i, a) => a.indexOf(v) === i)
  if (min < 0) ticks.push(0)
  const every = series.length > 16 ? Math.ceil(series.length / 8) : 1
  const line = series.map((b, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(b.profit).toFixed(1)}`).join(' ')
  const hb = hover != null ? series[hover] : null
  const empty = series.every((b) => b.revenue === 0 && b.profit === 0)

  return (
    <div className="viz" ref={ref}>
      <div className="viz-legend" aria-hidden="true">
        <span><i className="key key-bar s1" />Sales</span>
        <span><i className="key key-line s2" />Profit {bucket === 'hour' ? '(after food cost)' : '(after food cost and expenses)'}</span>
      </div>
      <svg width={w} height={h} role="img" aria-label={`Sales and profit by ${bucket}`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} className={t === 0 ? 'grid zero' : 'grid'} />
            <text x={padL - 6} y={y(t) + 4} className="tick" textAnchor="end">{compact(Math.round(t))}</text>
          </g>
        ))}
        {series.map((b, i) => {
          const top = y(Math.max(0, b.revenue)), base = y(0)
          const hgt = Math.max(0, base - top)
          return (
            <g key={b.key}>
              {hgt > 0 && (
                <motion.path className={`bar s1 ${hover === i ? 'on' : ''}`} style={{ transformBox: 'fill-box', originY: 1 }}
                  initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: i * 0.018, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  d={`M${x(i) - bw / 2},${base} V${top + Math.min(4, hgt)} Q${x(i) - bw / 2},${top} ${x(i) - bw / 2 + Math.min(4, hgt)},${top} H${x(i) + bw / 2 - Math.min(4, hgt)} Q${x(i) + bw / 2},${top} ${x(i) + bw / 2},${top + Math.min(4, hgt)} V${base} Z`} />
              )}
              {i % every === 0 && <text x={x(i)} y={h - 8} className="tick" textAnchor="middle">{b.label}</text>}
            </g>
          )
        })}
        {!empty && <motion.path key={line} d={line} className="line s2" fill="none" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, delay: 0.2, ease: 'easeInOut' }} />}
        {!empty && series.map((b, i) => (b.orders > 0 || hover === i) && <circle key={b.key} cx={x(i)} cy={y(b.profit)} r={hover === i ? 5 : 4} className="dot s2" />)}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={h - padB} className="crosshair" />}
        {series.map((b, i) => (
          <rect key={b.key} x={padL + band * i} y={0} width={band} height={h} fill="transparent"
            onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
        ))}
      </svg>
      {empty && <p className="viz-empty">No sales yet in this period. Completed orders show up here.</p>}
      {hb && (
        <div className="viz-tip" style={{ left: Math.min(w - 170, Math.max(0, x(hover!) - 80)) }} role="status">
          <strong>{bucket === 'hour' ? hourName(hover!) : bucket === 'day' ? new Date(`${hb.key}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : new Date(`${hb.key}-15T12:00:00+05:30`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</strong>
          <span><i className="key key-bar s1" />Sales {rupees(hb.revenue)}</span>
          <span><i className="key key-line s2" />Profit {rupees(hb.profit)}</span>
          <span className="muted">{hb.orders} order{hb.orders === 1 ? '' : 's'}{hb.expenses ? ` · spent ${rupees(hb.expenses)}` : ''}</span>
        </div>
      )}
    </div>
  )
}

// Columns: one series of counts (busy hours, weekdays), with the peak labelled.
function Columns({ values, labels, every = 1, unit }: { values: number[]; labels: string[]; every?: number; unit: string }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const h = 150, padB = 22, padT = 18
  const max = Math.max(1, ...values)
  const peak = values.indexOf(Math.max(...values))
  const band = w / values.length
  const bw = Math.min(24, band * 0.7)
  return (
    <div className="viz" ref={ref}>
      <svg width={w} height={h} role="img" aria-label={`${unit} by ${labels.length === 7 ? 'weekday' : 'hour'}`} onMouseLeave={() => setHover(null)}>
        <line x1={0} x2={w} y1={h - padB} y2={h - padB} className="grid" />
        {values.map((v, i) => {
          const hgt = ((h - padB - padT) * v) / max
          const cx = band * i + band / 2
          const r = Math.min(4, hgt)
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
              <rect x={band * i} y={0} width={band} height={h} fill="transparent" />
              {hgt > 0 && <motion.path className={`bar s1 ${i === peak ? 'peak' : 'soft'} ${hover === i ? 'on' : ''}`} style={{ transformBox: 'fill-box', originY: 1 }}
                initial={{ scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.02, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                d={`M${cx - bw / 2},${h - padB} V${h - padB - hgt + r} Q${cx - bw / 2},${h - padB - hgt} ${cx - bw / 2 + r},${h - padB - hgt} H${cx + bw / 2 - r} Q${cx + bw / 2},${h - padB - hgt} ${cx + bw / 2},${h - padB - hgt + r} V${h - padB} Z`} />}
              {(i === peak && v > 0) && <text x={cx} y={h - padB - hgt - 5} className="tick strong" textAnchor="middle">{v}</text>}
              {i % every === 0 && <text x={cx} y={h - 6} className="tick" textAnchor="middle">{labels[i]}</text>}
            </g>
          )
        })}
      </svg>
      {hover != null && (
        <div className="viz-tip" style={{ left: Math.min(w - 130, Math.max(0, band * hover + band / 2 - 60)) }} role="status">
          <strong>{labels.length === 24 ? hourName(hover) : WEEKDAYS[hover]}</strong>
          <span>{values[hover]} {unit}</span>
        </div>
      )}
    </div>
  )
}

const hourName = (h: number) => `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'} – ${(h + 1) % 12 || 12} ${(h + 1) % 24 < 12 ? 'am' : 'pm'}`

// SplitBar: a part-to-whole bar (100%) with a legend that carries names and numbers.
function SplitBar({ title, parts, names }: { title: string; parts: Split[]; names: Record<string, string> }) {
  const total = parts.reduce((s, p) => s + p.orders, 0)
  const order = Object.keys(names)
  const sorted = [...parts].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
  return (
    <div className="split">
      <h4>{title}</h4>
      {total === 0 ? <p className="menu-sub">No orders yet.</p> : (
        <>
          <motion.div className="split-bar" initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger(0.12)} role="img" aria-label={sorted.map((p) => `${names[p.key] ?? p.key} ${Math.round((p.orders / total) * 100)}%`).join(', ')}>
            {sorted.map((p) => <motion.i key={p.key} className={`s${order.indexOf(p.key) + 1}`} style={{ flexGrow: p.orders, originX: 0 }} variants={growX} title={`${names[p.key] ?? p.key}: ${p.orders} orders, ${rupees(p.revenue)}`} />)}
          </motion.div>
          <ul className="split-legend">
            {sorted.map((p) => (
              <li key={p.key}><i className={`key key-bar s${order.indexOf(p.key) + 1}`} />{names[p.key] ?? p.key} <strong>{Math.round((p.orders / total) * 100)}%</strong> <span className="muted">{p.orders} · {rupees(p.revenue)}</span></li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function MoneyFlow({ t }: { t: Totals }) {
  if (t.revenue === 0) return null
  const profit = Math.max(0, t.net_profit)
  const parts = [
    { k: 'Food cost', v: t.cost, c: 'mf-cost' },
    { k: 'Expenses', v: t.expenses, c: 'mf-exp' },
    { k: 'Profit', v: profit, c: 'mf-profit' },
  ].filter((p) => p.v > 0)
  return (
    <div className="moneyflow">
      <p className="menu-sub">Where each ₹100 of sales went</p>
      <motion.div className="split-bar tall" initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger(0.15)}>
        {parts.map((p) => <motion.i key={p.k} className={p.c} style={{ flexGrow: p.v, originX: 0 }} variants={growX} />)}
      </motion.div>
      <ul className="split-legend">
        {parts.map((p) => (
          <li key={p.k}><i className={`key key-bar ${p.c}`} />{p.k} <strong>₹{Math.round((p.v / Math.max(t.revenue, t.cost + t.expenses)) * 100)}</strong> <span className="muted">{rupees(p.v)}</span></li>
        ))}
        {t.net_profit < 0 && <li className="bad">Spent {rupees(-t.net_profit)} more than you earned in this period.</li>}
      </ul>
    </div>
  )
}

export default function DashboardView({ onSignedOut, goTo }: { onSignedOut: () => void; goTo: (tab: 'menu' | 'offers' | 'expenses') => void }) {
  const [period, setPeriod] = useState<Period>('day')
  const [date, setDate] = useState(istToday())
  const [d, setD] = useState<Dash | null>(null)
  const [loading, setLoading] = useState(true)
  const { error, guard } = useGuard(onSignedOut)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await guard(staffApi.dashboard(period, date))
    setLoading(false)
    if (r) setD(r)
  }, [period, date, guard])
  useEffect(() => { load() }, [load])
  // Today's numbers move as orders close, so refresh every minute while it's open.
  useEffect(() => {
    if (date !== istToday()) return
    const id = window.setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [load, date])

  const next = shift(date, period, 1)
  const canNext = d ? d.to < istToday() : false
  const t = d?.totals
  const p = d?.previous
  const best = d?.top_items[0]
  const maxQty = Math.max(1, ...(d?.top_items.map((i) => i.qty) ?? [1]))

  return (
    <div className={`dash ${loading ? 'is-loading' : ''}`}>
      <div className="dash-head">
        <div>
          <p className="eyebrow">Your sales</p>
          <h2 className="staff-h">{d ? rangeTitle(d) : 'Dashboard'}</h2>
        </div>
        <div className="dash-controls">
          <div className="sizes" role="radiogroup" aria-label="Period">
            {PERIODS.map(([id, label]) => (
              <MButton key={id} className="size" role="radio" aria-checked={period === id} onClick={() => { setPeriod(id); setDate(istToday()) }}>{label}</MButton>
            ))}
          </div>
          <div className="dash-step">
            <MButton className="btn btn-ghost btn-sm" onClick={() => setDate(shift(date, period, -1))} aria-label="Earlier">‹ Earlier</MButton>
            <MButton className="btn btn-ghost btn-sm" onClick={() => setDate(next > istToday() ? istToday() : next)} disabled={!canNext} aria-label="Later">Later ›</MButton>
          </div>
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      {d && t && p && (
        <>
          <motion.section className="dash-hero" initial="hidden" animate="show" variants={stagger(0.08)}>
            <motion.div className="hero-fig" variants={slideIn} {...lift}>
              <span className="kpi-label">Sales</span>
              <strong className="hero-num"><CountUp value={t.revenue} format={rupees} /></strong>
              <Delta now={t.revenue} before={p.revenue} period={period} />
            </motion.div>
            <motion.div className="kpis" variants={stagger(0.07)}>
              <motion.div className={`kpi ${t.net_profit < 0 ? 'neg' : ''}`} variants={slideIn} {...lift}>
                <span className="kpi-label">Profit</span>
                <strong><CountUp value={t.net_profit} format={rupees} /></strong>
                <Delta now={t.net_profit} before={p.net_profit} period={period} />
              </motion.div>
              <motion.div className="kpi" variants={slideIn} {...lift}>
                <span className="kpi-label">Orders</span>
                <strong><CountUp value={t.orders} format={String} /></strong>
                <Delta now={t.orders} before={p.orders} period={period} money={false} />
              </motion.div>
              <motion.div className="kpi" variants={slideIn} {...lift}>
                <span className="kpi-label">Average order</span>
                <strong><CountUp value={t.avg_order} format={rupees} /></strong>
                <Delta now={t.avg_order} before={p.avg_order} period={period} />
              </motion.div>
              <motion.div className="kpi" variants={slideIn} {...lift}>
                <span className="kpi-label">Customers</span>
                <strong><CountUp value={t.customers} format={String} /></strong>
                <span className="kpi-delta flat">{t.new_customers} new · {t.items_sold} plates sold</span>
              </motion.div>
            </motion.div>
          </motion.section>

          {(d.missing_cost > 0 || t.uncosted_sales > 0) && (
            <div className="dash-note">
              <span aria-hidden="true">💡</span>
              <p><strong>Profit is only as good as your cost prices.</strong> {d.missing_cost} dish{d.missing_cost === 1 ? ' has' : 'es have'} no cost price yet
                {t.uncosted_sales > 0 && <>, so {rupees(t.uncosted_sales)} of these sales count as if the food cost nothing</>}.</p>
              <MButton className="btn btn-ghost btn-sm" onClick={() => goTo('menu')}>Add cost prices</MButton>
            </div>
          )}

          <motion.div className="dash-grid" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.05 }} variants={stagger(0.08)}>
            <motion.section className="card wide" variants={slideIn}>
              <div className="card-head"><h3>Sales and profit</h3>{t.cancelled > 0 && <span className="muted">{t.cancelled} cancelled, not counted</span>}</div>
              <SalesChart series={d.series} bucket={d.bucket} />
              <MoneyFlow t={t} />
            </motion.section>

            <motion.section className="card" variants={slideIn}>
              <div className="card-head"><h3>Most sold</h3><span className="muted">by plates</span></div>
              {best ? (
                <div className="champ">
                  <motion.span className="champ-emoji" aria-hidden="true" animate={{ y: [0, -4, 0], rotate: [0, -6, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}>{itemKind(best.name).emoji}</motion.span>
                  <div><span className="kpi-label">🏆 Number one</span><strong>{best.name}</strong><span className="muted">{best.qty} plates · {rupees(best.sales)}{best.costed ? ` · ${best.margin}% margin` : ''}</span></div>
                </div>
              ) : <p className="menu-sub">Nothing sold yet in this period.</p>}
              <motion.ol className="dash-leaders" initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger(0.06)}>
                {d.top_items.slice(best ? 1 : 0, 8).map((it, i) => (
                  <motion.li key={it.item_id} variants={slideIn}>
                    <span className="dash-rank">{i + 2}</span>
                    <span className="lead-name">{it.name}<span className="lead-bar"><motion.i style={{ width: `${(it.qty / maxQty) * 100}%`, originX: 0 }} variants={growX} /></span></span>
                    <span className="lead-num"><strong>{it.qty}</strong><small>{rupees(it.sales)}</small></span>
                  </motion.li>
                ))}
              </motion.ol>
            </motion.section>

            <motion.section className="card" variants={slideIn}>
              <div className="card-head"><h3>Busy hours</h3><span className="muted">orders by time of day</span></div>
              <Columns values={d.hours} labels={d.hours.map((_, h) => `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`)} every={3} unit="orders" />
              {d.period !== 'day' && (
                <>
                  <div className="card-head sub"><h3>Busy days</h3></div>
                  <Columns values={d.weekdays} labels={WEEKDAYS} unit="orders" />
                </>
              )}
            </motion.section>

            <motion.section className="card" variants={slideIn}>
              <div className="card-head"><h3>How people order</h3></div>
              <SplitBar title="Came from" parts={d.sources} names={SOURCE} />
              <SplitBar title="Paid by" parts={d.payments} names={PAY} />
              <SplitBar title="Took it" parts={d.fulfilment} names={FUL} />
            </motion.section>

            <motion.section className="card" variants={slideIn}>
              <div className="card-head"><h3>Best customers</h3></div>
              {d.top_customers.length === 0 ? <p className="menu-sub">Customers with a phone number show up here.</p> : (
                <ol className="dash-leaders">
                  {d.top_customers.map((c, i) => (
                    <li key={c.phone + c.name}>
                      <span className="dash-rank">{i === 0 ? '👑' : i + 1}</span>
                      <span className="lead-name">{c.name}<small className="muted"> {c.phone}</small></span>
                      <span className="lead-num"><strong>{rupees(c.spent)}</strong><small>{c.orders} order{c.orders === 1 ? '' : 's'}</small></span>
                    </li>
                  ))}
                </ol>
              )}
            </motion.section>

            <motion.section className="card" variants={slideIn}>
              <div className="card-head"><h3>Selling slowly</h3><span className="muted">on the menu, sold least</span></div>
              <ul className="slow">
                {d.slow_items.map((it) => <li key={it.item_id}><span aria-hidden="true">{itemKind(it.name).emoji}</span> {it.name} <span className="muted">{it.qty} sold</span></li>)}
              </ul>
              <MButton className="btn btn-ghost btn-sm" onClick={() => goTo('offers')}>Put one on offer</MButton>
            </motion.section>

            <motion.section className="card" variants={slideIn}>
              <div className="card-head"><h3>Money spent</h3><strong>{rupees(t.expenses)}</strong></div>
              {d.expense_categories.length === 0 ? <p className="menu-sub">Add gas, vegetables, rent and other costs so profit is real.</p> : (
                <ul className="slow">
                  {d.expense_categories.map((e) => <li key={e.key}>{e.key} <strong>{rupees(e.revenue)}</strong></li>)}
                </ul>
              )}
              <MButton className="btn btn-ghost btn-sm" onClick={() => goTo('expenses')}>Add an expense</MButton>
            </motion.section>
          </motion.div>
        </>
      )}
    </div>
  )
}

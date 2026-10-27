import { useEffect, useState, type FormEvent } from 'react'
import QRCode from 'qrcode'
import { sendPaymentRef, setPayMethod, type PlacedOrder, type Tracking } from './api'
import { lookup, unitPrice } from './cart'
import { rupees } from './menu'
import { billText, checkUpiRef, itemKind, upiLink, whatsappBill, type Bill } from './kit'
import type { Shop } from './shop'
import { MA, MButton } from './motion'
import { brand } from './brand'

// UPI: pay link (opens GPay/PhonePe/Paytm on a phone), QR for paying from another phone, and a box
// for the reference. UPI links don't report back, so the owner matches the reference with the bank SMS.
export function UpiPay({ shop, order, amount, sentRef, rejectedRef, onSent }: { shop: Shop; order: PlacedOrder; amount: number; sentRef?: string | null; rejectedRef?: string | null; onSent: () => void }) {
  const link = upiLink(shop.upi_id, shop.upi_name, amount, `${brand.name} order #${order.number}`)
  const [qr, setQr] = useState('')
  const [ref, setRef] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(sentRef ?? '')
  const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent)

  useEffect(() => {
    QRCode.toDataURL(link, { margin: 1, width: 240, color: { dark: '#0b1033', light: '#ffffff' } }).then(setQr).catch(() => {})
  }, [link])
  // The owner can turn a reference down (money not in the bank), which clears it: show the form again.
  useEffect(() => {
    setDone(sentRef ?? '')
  }, [sentRef])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const bad = checkUpiRef(ref)
    if (bad) return setErr(bad)
    setBusy(true)
    setErr('')
    try {
      await sendPaymentRef(order, ref)
      setDone(ref.replace(/\s/g, '').toUpperCase())
      onSent()
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not send. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="upi">
      <div className="upi-head">
        <span className="upi-emoji" aria-hidden="true">📲</span>
        <div>
          <strong>Pay {rupees(amount)} by UPI</strong>
          <small>To {shop.upi_name} · {shop.upi_id}</small>
        </div>
      </div>
      {done ? (
        <p className="upi-sent">⏳ UPI ref <b>{done}</b> sent. The owner will confirm it.</p>
      ) : (
        <>
          {rejectedRef && (
            <p className="upi-rejected" role="alert">
              ❌ <b>Payment not received yet.</b> The owner checked UPI ref <b>{rejectedRef}</b> and the money hasn't reached the bank.
              Check the number in your UPI app's payment details and send it again, pay again below, or pay cash {order.fulfilment === 'delivery' ? 'on delivery' : 'when you collect'}.
            </p>
          )}
          <div className="upi-body">
            {qr && <img className="upi-qr" src={qr} width={180} height={180} alt={`UPI QR code to pay ${rupees(amount)}`} />}
            <div className="upi-side">
              <MA className="btn btn-gold" href={link}>{mobile ? `Pay ${rupees(amount)} in UPI app` : 'Open UPI app'}</MA>
              <p className="opt">{mobile ? 'Opens GPay, PhonePe or Paytm with the amount filled in.' : 'On a computer? Scan the QR with any UPI app on your phone.'}</p>
              <MButton type="button" className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(shop.upi_id)}>Copy UPI ID</MButton>
            </div>
          </div>
          <form className="upi-ref" onSubmit={submit} noValidate>
            <label className="field" htmlFor="upi-ref">
              Paid? Enter the UPI ref / UTR number
              <input id="upi-ref" value={ref} inputMode="text" autoComplete="off" maxLength={35} placeholder="12-digit number from your UPI app"
                onChange={(e) => { setRef(e.target.value.replace(/[^A-Za-z0-9 ]/g, '')); setErr('') }} aria-invalid={!!err} />
            </label>
            <MButton className="btn btn-ghost" disabled={busy}>{busy ? 'Sending…' : 'Send'}</MButton>
          </form>
          {err && <p className="error" role="alert">{err}</p>}
        </>
      )}
    </div>
  )
}

// PayBillBox: on an open, unpaid order the customer picks how to pay: cash at the counter (or on
// delivery) or UPI. The choice goes to the owner's screen; the owner marks it paid, and this page follows.
export function PayBillBox({ shop, order, data, onChange }: { shop: Shop; order: PlacedOrder; data: Tracking; onChange: () => void }) {
  const method = data.payment_method ?? order.payment_method
  const upiReady = !!shop.upi_id && shop.accept_upi
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const delivery = order.fulfilment === 'delivery'
  const cashLabel = delivery ? 'Cash on delivery' : 'Cash at counter'

  async function pick(m: 'cash' | 'online') {
    if (m === method || busy) return
    setBusy(true); setErr('')
    try { await setPayMethod(order, m); onChange() } catch (e) { setErr(e instanceof Error ? e.message : 'Could not change it. Try again.') } finally { setBusy(false) }
  }

  return (
    <section className="paybox" aria-labelledby="paybox-h">
      <div className="paybox-head">
        <h3 id="paybox-h">🧾 Pay bill</h3>
        <b>{rupees(data.total)}</b>
      </div>
      <div className="paybox-opts" role="radiogroup" aria-label="How will you pay?">
        <button type="button" role="radio" aria-checked={method === 'cash'} className={`paybox-opt ${method === 'cash' ? 'on' : ''}`} onClick={() => pick('cash')} disabled={busy}>
          <i aria-hidden="true">💵</i><span><strong>{cashLabel}</strong><small>{delivery ? 'Give it to the rider' : 'Pay when you collect'}</small></span>
        </button>
        <button type="button" role="radio" aria-checked={method === 'online'} className={`paybox-opt ${method === 'online' ? 'on' : ''}`} onClick={() => pick('online')} disabled={busy || !upiReady}>
          <i aria-hidden="true">📲</i><span><strong>UPI</strong><small>{upiReady ? 'GPay, PhonePe, Paytm' : 'Not set up yet'}</small></span>
        </button>
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      {method === 'cash' && (
        <p className="paybox-note">Pay {rupees(data.total)} {delivery ? 'to the rider' : 'at the counter'}. The cart marks it paid and this page turns green on its own.</p>
      )}
      {method === 'online' && upiReady && (
        <UpiPay shop={shop} order={order} amount={data.total} sentRef={data.payment_ref} rejectedRef={data.payment_rejected_ref} onSent={onChange} />
      )}
    </section>
  )
}

// billFrom builds the bill from the tracking data, or from the lines kept in this browser.
export function billFrom(order: PlacedOrder, data: Tracking | null, customer?: string): Bill {
  const lines = data?.items?.length
    ? data.items
    : (order.lines ?? []).flatMap((l) => {
        const it = lookup(l.itemId)
        return it ? [{ name: it.name, size: l.size, qty: l.qty, unit_price: unitPrice(it, l.size) }] : []
      })
  const total = data?.total ?? order.total
  const fee = data?.delivery_fee ?? order.delivery_fee ?? 0
  const how = (data?.payment_method ?? order.payment_method) === 'online' ? 'UPI' : 'Cash'
  const paid = data?.payment_status === 'paid'
  const ref = data?.payment_ref ? ` (ref ${data.payment_ref})` : ''
  return {
    number: order.number,
    when: new Date(data?.created_at ?? order.placed_at),
    customer: data?.customer_name || order.customer_name || customer,
    lines,
    subtotal: data?.subtotal ?? total - fee,
    delivery_fee: fee,
    delivery: order.fulfilment === 'delivery',
    total,
    payment: `${how} · ${paid ? 'Paid' : 'Not paid yet'}${ref}`,
  }
}

// The order summary. Print / WhatsApp / Copy are shop tools, so they show only with actions (staff use).
export function BillCard({ bill, phone, actions = false }: { bill: Bill; phone?: string; actions?: boolean }) {
  return (
    <div className="bill" id="bill">
      <div className="bill-print">
        <img src={brand.logoUrl} alt="" width={88} height={40} />
        <p className="bill-shop">{brand.upper}</p>
        <p className="bill-small">{brand.place}, {brand.region} · {brand.phone_display}</p>
        <p className="bill-small">Bill #{bill.number} · {bill.when.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
        {bill.customer && <p className="bill-small">Customer: {bill.customer}</p>}
      </div>
      <div className="bill-head">
        <strong>🧾 {actions ? 'Bill' : 'What you ordered'}</strong>
        <strong>{rupees(bill.total)}</strong>
      </div>
      <ul className="bill-lines">
        {bill.lines.map((l, i) => (
          <li key={i}>
            <span aria-hidden="true">{itemKind(l.name).emoji}</span>
            <span>{l.qty} × {l.name}{l.size === 'half' ? ' (half)' : ''}</span>
            <span>{rupees(l.qty * l.unit_price)}</span>
          </li>
        ))}
        {bill.delivery && (
          <li>
            <span aria-hidden="true">🛵</span>
            <span>Delivery</span>
            <span>{bill.delivery_fee === 0 ? 'Free' : rupees(bill.delivery_fee)}</span>
          </li>
        )}
      </ul>
      <p className="bill-pay">Payment: {bill.payment}</p>
      <p className="bill-print bill-small">Thank you! Order again at theurbanbites.in</p>
      {actions && <div className="bill-actions">
        <MButton type="button" className="btn btn-ghost btn-sm" onClick={() => printBill()}>🖨️ Print bill</MButton>
        <MA className="btn btn-wa btn-sm" href={whatsappBill(bill, phone)} target="_blank" rel="noopener">Send bill on WhatsApp</MA>
        <MButton type="button" className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(billText(bill))}>Copy</MButton>
      </div>}
    </div>
  )
}

function printBill() {
  document.body.classList.add('printing-bill')
  const done = () => {
    document.body.classList.remove('printing-bill')
    window.removeEventListener('afterprint', done)
  }
  window.addEventListener('afterprint', done)
  window.print()
}

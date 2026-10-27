import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'

// A guided tour of the staff area for the cart owner. Hindi first (Manjeet reads Hindi),
// with a short English line under each step. It opens by itself the first time an owner
// signs in, and the ❓ button in the header plays it again.

type TabId = 'orders' | 'dashboard' | 'walkin' | 'menu' | 'shop' | 'riders' | 'staff' | 'offers' | 'expenses'
export interface TourStep {
  target?: string // CSS selector; the first visible match is highlighted. None = centred card.
  tab?: TabId // switch to this tab first
  hi: string
  en: string
  title: string
  demo?: 'order' | 'welcome'
}

export function ownerSteps(isAdmin: boolean): TourStep[] {
  const steps: TourStep[] = [
    { demo: 'welcome', title: 'नमस्ते! 🙏', hi: 'एक मिनट में सीखिए कि वेबसाइट के ऑर्डर कैसे संभालने हैं। "आगे" दबाते रहिए।', en: 'A one-minute tour of your shop screen. Keep tapping Next.' },
    { target: '[data-tour="orders"]', tab: 'orders', title: 'ऑर्डर', hi: 'नए ऑर्डर यहाँ आते हैं। घंटी बजेगी, फ़ोन बोलेगा "नया ऑर्डर आया सै" और लाल गिनती दिखेगी।', en: 'New orders land here, with a bell, a voice and a red count.' },
    { demo: 'order', tab: 'orders', title: 'ऑर्डर कैसे संभालें', hi: '1. ऑर्डर पर टैप करें  2. कितने मिनट में बनेगा, चुनें  3. बनने पर "Ready" या "Send out" दबाएँ  4. पैसे मिलें तो "Mark paid"।', en: 'Tap the order, pick the minutes, mark it ready, mark it paid.' },
    { target: '.order-filters', tab: 'orders', title: 'छाँटिए', hi: 'New = नए, Cooking = बन रहे, Ready = तैयार, Not paid = पैसे बाकी। गिनती हर बटन पर दिखती है।', en: 'Filter by New, Cooking, Ready or Not paid.' },
    { target: '.sound-btn', tab: 'orders', title: 'घंटी चालू रखें', hi: 'यह हमेशा "Sound on" रखें, और यह पेज खुला रखें, ताकि कोई ऑर्डर छूटे नहीं।', en: 'Keep the sound on and this page open so no order is missed.' },
    { target: '.today-kpis', tab: 'orders', title: 'आज का हिसाब', hi: 'आज की बिक्री, किचन में कितने ऑर्डर, और कितने पैसे बाकी हैं, सब यहाँ एक नज़र में।', en: "Today's sales, kitchen and pending payments at a glance." },
    { target: '[data-tour="walkin"]', tab: 'walkin', title: 'काउंटर की बिक्री', hi: 'जो ग्राहक ठेले पर आकर खाए, उसका बिल यहाँ डालें। फ़ोन नंबर डालेंगे तो उसे बैज मिलेगा।', en: 'Record sales made at the cart. Add the phone number for badges.' },
    { target: '[data-tour="dashboard"]', tab: 'dashboard', title: 'बिक्री', hi: 'आज, हफ़्ते, महीने और साल की कमाई और मुनाफ़ा यहाँ देखें।', en: 'Sales and profit for the day, week, month and year.' },
    { target: '[data-tour="menu"]', tab: 'menu', title: isAdmin ? 'मेनू' : 'माल खत्म?', hi: 'कोई चीज़ खत्म हो जाए तो उसका बटन बंद करें, वह वेबसाइट पर "Sold out" दिखेगी। वापस आए तो चालू करें।', en: 'Switch a dish off when it runs out; switch it on again later.' },
    { target: '[data-tour="shop"]', tab: 'shop', title: 'दुकान बंद/चालू', hi: 'बहुत भीड़ हो या दुकान बंद हो, तो "Pause orders" दबाएँ। फिर से चालू करने के लिए वही बटन।', en: 'Too busy or closed? Pause online orders here.' },
    { target: '[data-tour="riders"]', tab: 'riders', title: 'डिलीवरी वाले', hi: 'डिलीवरी करने वाले लड़कों के लॉगिन यहाँ बनाइए। उन्हें सिर्फ़ डिलीवरी और रास्ता दिखेगा।', en: 'Make logins for your delivery boys. They only see deliveries and the map.' },
    { target: '.staff-acct .acct-btn, .staff-who', tab: 'orders', title: 'पासवर्ड और बाहर निकलें', hi: 'पासवर्ड बदलना हो या लॉगआउट करना हो, तो यहाँ।', en: 'Change your password or sign out here.' },
    { target: '[data-tour="help"]', tab: 'orders', title: 'बस इतना ही! 🎉', hi: 'कुछ भूल जाएँ तो यह ❓ बटन दबाकर यह टूर फिर से देखें। कोई दिक्कत हो तो वेबसाइट सपोर्ट टीम को फ़ोन करें।', en: 'Forgot something? Tap ❓ to see this tour again.' },
  ]
  return steps
}

function visible(sel: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(sel)) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') return el
  }
  return null
}

// On phones Shop and Riders sit behind "More", so point at More instead.
function findTarget(sel: string): HTMLElement | null {
  return visible(sel) ?? (sel.startsWith('[data-tour') ? visible('[data-tour="more"]') : null)
}

type Box = { top: number; left: number; width: number; height: number }

export default function Tour({ steps, onClose, setTab }: { steps: TourStep[]; onClose: () => void; setTab: (t: TabId) => void }) {
  const [i, setI] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const step = steps[i]
  const last = i === steps.length - 1

  const measure = useCallback(() => {
    if (!step.target) return setBox(null)
    const el = findTarget(step.target)
    if (!el) return setBox(null)
    const r = el.getBoundingClientRect()
    const pad = 6
    setBox({ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 })
  }, [step])

  useEffect(() => { if (step.tab) setTab(step.tab) }, [step, setTab])

  useLayoutEffect(() => {
    let t1 = 0
    const run = () => {
      const el = step.target ? findTarget(step.target) : null
      if (el) {
        const r = el.getBoundingClientRect()
        // Phones: bring it into the top part of the screen, leaving the bottom half for the card.
        const narrowNow = innerWidth < 640
        const fixedEl = getComputedStyle(el).position === 'fixed' || !!el.closest('.bottom-nav, .staff-bar')
        if (!fixedEl && (narrowNow ? r.top < 64 || r.bottom > innerHeight * 0.48 : r.top < 70 || r.bottom > innerHeight - 90)) {
          if (narrowNow) window.scrollBy({ top: r.top - 76, behavior: 'instant' as ScrollBehavior })
          else el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior })
        }
      }
      measure()
    }
    // Let the tab render first.
    t1 = window.setTimeout(run, 120)
    const t2 = window.setTimeout(measure, 450)
    addEventListener('resize', measure)
    addEventListener('scroll', measure, true)
    return () => { clearTimeout(t1); clearTimeout(t2); removeEventListener('resize', measure); removeEventListener('scroll', measure, true) }
  }, [step, measure])

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, steps.length - 1))
      if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0))
    }
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  }, [onClose, steps.length])

  // Place the card under the highlight, or above it when there's no room.
  const narrow = typeof window !== 'undefined' && innerWidth < 640
  let cardStyle: React.CSSProperties = {}
  if (box && !step.demo) {
    const below = box.top + box.height + 14
    const cardH = 250
    // Phones: the card takes the half of the screen the highlight isn't in.
    if (narrow) cardStyle = box.top + box.height / 2 < innerHeight / 2 ? { bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' } : { top: 'calc(12px + env(safe-area-inset-top, 0px))' }
    else {
      const left = Math.min(Math.max(16, box.left), innerWidth - 400)
      cardStyle = below + cardH < innerHeight ? { top: below, left } : { top: Math.max(12, box.top - cardH - 14), left }
    }
  }

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="How to use the shop screen">
      {box && !step.demo ? (
        <motion.div className="tour-hole" initial={false} animate={box} transition={{ type: 'spring', stiffness: 260, damping: 30 }} />
      ) : (
        <div className="tour-dim" />
      )}
      <AnimatePresence mode="wait">
        <motion.div
          key={i}
          className={`tour-card ${box && !step.demo ? 'is-pinned' : 'is-centre'} ${step.demo ? 'has-demo' : ''}`}
          style={cardStyle}
          initial={{ opacity: 0, y: 14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22 }}
        >
          <div className="tour-top">
            <span className="tour-count">{i + 1} / {steps.length}</span>
            <button className="tour-x" onClick={onClose} aria-label="Close the tour">✕</button>
          </div>
          {step.demo === 'order' && <OrderDemo />}
          {step.demo === 'welcome' && <WelcomeArt />}
          <h3 lang="hi">{step.title}</h3>
          <p className="tour-hi" lang="hi">{step.hi}</p>
          <p className="tour-en">{step.en}</p>
          <div className="tour-dots" aria-hidden="true">{steps.map((_, n) => <i key={n} className={n === i ? 'on' : ''} />)}</div>
          <div className="tour-actions">
            {i > 0 ? <button className="btn btn-ghost btn-sm" onClick={() => setI(i - 1)}>← पीछे</button> : <button className="btn btn-ghost btn-sm" onClick={onClose}>छोड़ें · Skip</button>}
            <motion.button className="btn btn-gold btn-sm" whileTap={{ scale: 0.95 }} onClick={() => (last ? onClose() : setI(i + 1))}>
              {last ? 'समझ गया ✓' : 'आगे →'}
            </motion.button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function WelcomeArt() {
  return (
    <div className="tour-art" aria-hidden="true">
      {['🧾', '🔔', '🍢', '🛵', '💰'].map((e, n) => (
        <motion.span key={e} initial={{ y: 20, opacity: 0 }} animate={{ y: [0, -10, 0], opacity: 1 }}
          transition={{ opacity: { delay: n * 0.1 }, y: { delay: n * 0.15, duration: 1.8, repeat: Infinity, ease: 'easeInOut' } }}>{e}</motion.span>
      ))}
    </div>
  )
}

// A looping animation of one order going from new to paid, with the buttons the owner will press.
const FRAMES = [
  { tag: 'नया ऑर्डर', tone: 'warn', hint: '🔔 घंटी बजी', tap: 'card' },
  { tag: 'नया ऑर्डर', tone: 'warn', hint: '👆 ऑर्डर पर टैप करें', tap: 'card' },
  { tag: 'नया ऑर्डर', tone: 'warn', hint: '⏱️ "15 min" दबाएँ', tap: 'min' },
  { tag: 'बन रहा है · 15 मिनट', tone: 'info', hint: '👨‍🍳 ग्राहक को टाइम दिख गया', tap: '' },
  { tag: 'बन रहा है · 15 मिनट', tone: 'info', hint: '✅ बन गया? "Ready" दबाएँ', tap: 'ready' },
  { tag: 'तैयार', tone: 'success', hint: '💵 पैसे मिले? "Mark paid"', tap: 'paid' },
  { tag: 'पूरा · पैसे मिले ✓', tone: 'success', hint: '🎉 हो गया!', tap: '' },
] as const

function OrderDemo() {
  const [f, setF] = useState(0)
  useEffect(() => { const t = setInterval(() => setF((n) => (n + 1) % FRAMES.length), 1700); return () => clearInterval(t) }, [])
  const fr = FRAMES[f]
  return (
    <div className="tour-demo" aria-hidden="true">
      <motion.div className={`td-card ${fr.tap === 'card' ? 'is-tap' : ''}`} animate={f === 0 ? { scale: [1, 1.04, 1] } : { scale: 1 }} transition={{ duration: 0.6, repeat: f === 0 ? 2 : 0 }}>
        <div className="td-row"><b>#1024</b><motion.span key={fr.tag} className={`tag tag-${fr.tone}`} initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>{fr.tag}</motion.span><b>₹540</b></div>
        <div className="td-items">2× Malai Chaap · 3× Onion Naan</div>
        <div className="td-btns">
          <span className={`td-btn ${fr.tap === 'min' ? 'is-tap' : ''}`}>15 min</span>
          <span className={`td-btn gold ${fr.tap === 'ready' ? 'is-tap' : ''}`}>Ready</span>
          <span className={`td-btn ${fr.tap === 'paid' ? 'is-tap' : ''}`}>Mark paid</span>
        </div>
      </motion.div>
      <AnimatePresence mode="wait">
        <motion.p key={f} className="td-hint" lang="hi" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>{fr.hint}</motion.p>
      </AnimatePresence>
    </div>
  )
}

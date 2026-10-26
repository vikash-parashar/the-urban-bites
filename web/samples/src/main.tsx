import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AnimatePresence, motion, MotionConfig, LayoutGroup } from 'motion/react'
import './picker.css'
import S1 from './s1'; import S5 from './s5'; import S6 from './s6'


const list = [
  { n: 'Neon Highway', d: 'Night video hero, swipe-through dish reel', C: S1 },
  { n: 'Glass Night Lounge', d: 'Charcoal and gold, premium dhaba feel', C: S5 },
  { n: 'Street Sticker Pop', d: 'Loud stickers and bold blocks, made for Instagram', C: S6 },
]
history.scrollRestoration = 'manual'
const read = () => { const m = /^#s([1-3])$/.exec(location.hash); return m ? +m[1] - 1 : 0 }

function App() {
  const [i, setI] = useState(read)
  useEffect(() => { const f = () => setI(read()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  const go = (k: number) => { const n = (k + list.length) % list.length; history.replaceState(null, '', `#s${n + 1}`); setI(n); scrollTo({ top: 0 }) }
  const S = list[i]
  return (
    <>
      <header className="pk">
        <div className="pk-now">
          <motion.button className="pk-arrow" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => go(i - 1)} aria-label="Previous design">‹</motion.button>
          <div className="pk-title"><b>{i + 1}/{list.length} · {S.n}</b><span>{S.d}</span></div>
          <motion.button className="pk-arrow" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => go(i + 1)} aria-label="Next design">›</motion.button>
        </div>
        <LayoutGroup>
          <nav className="pk-chips" aria-label="Choose a design">
            {list.map((x, k) => (
              <motion.button key={k} className={k === i ? 'on' : ''} onClick={() => go(k)} whileHover={{ y: -1 }} whileTap={{ scale: 0.94 }}>
                {k === i && <motion.span layoutId="pk-on" className="pk-pill" transition={{ type: 'spring', stiffness: 420, damping: 32 }} />}
                <span className="pk-l">{k + 1}. {x.n}</span>
              </motion.button>
            ))}
          </nav>
        </LayoutGroup>
      </header>
      <AnimatePresence mode="wait">
        <motion.main key={i} className="pk-stage" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.35 }}>
          <S.C />
        </motion.main>
      </AnimatePresence>
    </>
  )
}
createRoot(document.getElementById('root')!).render(<StrictMode><MotionConfig reducedMotion="user"><App /></MotionConfig></StrictMode>)

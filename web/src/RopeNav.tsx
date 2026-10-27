import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useAnimationControls } from 'motion/react'

export interface RopeLink { id: string; label: string; icon: string; count?: number }

// A rope hangs from the header. Pull it down (or tap it) and a signboard swings down with the page's
// sections (portalled to <body>, since the header's blur would trap a fixed overlay); pick one and the board is yanked back up while the page glides to that section.
export default function RopeNav({ links }: { links: RopeLink[] }) {
  const [open, setOpen] = useState(false)
  const tug = useAnimationControls()

  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  }, [open])

  const pull = async () => {
    await tug.start({ y: [0, 26, 0], transition: { duration: 0.45, ease: 'easeOut' } })
    setOpen(true)
  }
  const go = (id: string) => {
    setOpen(false)
    // Let the board start rising, then glide; the header stays clear of the section title.
    setTimeout(() => {
      const el = document.getElementById(id)
      if (!el) return
      const head = document.querySelector('.topbar')?.getBoundingClientRect().height ?? 0
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - head - 12, behavior: 'smooth' })
    }, 180)
  }
  const waiting = links.reduce((n, l) => n + (l.count ?? 0), 0)

  return (
    <>
      <motion.button
        className="rope" aria-label="Open the sections menu" aria-expanded={open} onClick={pull}
        drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={0.5}
        onDragEnd={(_, info) => { if (info.offset.y > 24) setOpen(true) }}
        animate={tug}
      >
        <motion.span className="rope-swing" animate={{ rotate: [-3, 3, -3] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}>
          <span className="rope-cord" aria-hidden="true" />
          <span className="rope-tag">
            <span aria-hidden="true">🪢</span> Pull me
            {waiting > 0 && <b className="nav-count">{waiting}</b>}
          </span>
        </motion.span>
      </motion.button>

      {createPortal(<AnimatePresence>
        {open && (
          <motion.div className="rope-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { delay: 0.15 } }}>
            <div className="rope-scrim" onClick={() => setOpen(false)} />
            <motion.nav
              className="rope-board" aria-label="Sections"
              style={{ originY: 0 }}
              initial={{ y: '-110%', rotate: -7 }}
              animate={{ y: 0, rotate: [-7, 4, -2, 0] }}
              exit={{ y: '-120%', rotate: 3, transition: { duration: 0.35, ease: 'easeIn' } }}
              transition={{ y: { type: 'spring', stiffness: 260, damping: 18 }, rotate: { duration: 1.1, ease: 'easeOut' } }}
            >
              <span className="rope-hang left" aria-hidden="true" />
              <span className="rope-hang right" aria-hidden="true" />
              <p className="rope-title">Kahan chalein? 👀</p>
              <ul>
                {links.map((l, i) => (
                  <motion.li key={l.id} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.06 }}>
                    <motion.button onClick={() => go(l.id)} whileHover={{ x: 6 }} whileTap={{ scale: 0.96 }}>
                      <span aria-hidden="true">{l.icon}</span>{l.label}
                      {!!l.count && <b className="nav-count">{l.count}</b>}
                      <span className="rope-go" aria-hidden="true">→</span>
                    </motion.button>
                  </motion.li>
                ))}
              </ul>
              <div className="rope-foot">
                <button className="rope-close" onClick={() => setOpen(false)}>Close</button>
                <a className="rope-staff" href="#staff" onClick={() => setOpen(false)}>👤 Staff login</a>
              </div>
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>, document.body)}
    </>
  )
}

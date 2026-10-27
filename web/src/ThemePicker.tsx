import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { autoTheme, currentTheme, forcedTheme, pickTheme, themes, type ThemeId } from './theme'
import { MButton, spring } from './motion'

export function useTheme() {
  const [id, setId] = useState<ThemeId>(currentTheme)
  useEffect(() => {
    const on = (e: Event) => setId((e as CustomEvent<ThemeId>).detail)
    window.addEventListener('ub-theme', on)
    return () => window.removeEventListener('ub-theme', on)
  }, [])
  return id
}

// Look switcher in the header: Street Pop (day) or Neon Highway (from 5 pm).
export function LookSwitch() {
  const cur = useTheme()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const off = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', off)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', off); document.removeEventListener('keydown', esc) }
  }, [open])
  if (forcedTheme()) return null
  const now = themes.find((t) => t.id === cur)!
  const auto = autoTheme()
  return (
    <div className="look" ref={box}>
      <MButton type="button" className="daynight" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true"
        aria-label={`Change the look of the site (now ${now.name})`} title="Change look">
        <motion.span key={cur} aria-hidden="true" initial={{ rotate: -90, scale: 0.4 }} animate={{ rotate: 0, scale: 1 }} transition={spring}>{now.icon}</motion.span>
      </MButton>
      <AnimatePresence>
        {open && (
          <motion.div className="look-menu" role="menu" initial={{ opacity: 0, y: -8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.96 }} transition={{ duration: 0.18 }}>
            {themes.map((t, i) => (
              <motion.button key={t.id} type="button" role="menuitemradio" aria-checked={cur === t.id} className="look-opt"
                initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0, transition: { delay: i * 0.05 } }} whileHover={{ x: 3 }} whileTap={{ scale: 0.97 }}
                onClick={() => { pickTheme(t.id); setOpen(false) }}>
                <span className="theme-sw" aria-hidden="true">{t.sw.map((c) => <i key={c} style={{ background: c }} />)}</span>
                <span>{t.icon} {t.name}<small>{t.id === auto ? 'Automatic right now' : t.note}</small></span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { currentPeriod, currentTheme, pickTheme, pickedTheme, setPeriod, themes, type ThemeId } from './theme'
import { MButton } from './motion'

function useTheme() {
  const [id, setId] = useState<ThemeId>(currentTheme)
  useEffect(() => {
    const on = (e: Event) => setId((e as CustomEvent<ThemeId>).detail)
    window.addEventListener('ub-theme', on)
    return () => window.removeEventListener('ub-theme', on)
  }, [])
  return id
}

// ☀️/🌙 button in the header. The site already follows Indian time; this lets a visitor flip it.
export function DayNightToggle() {
  useTheme()
  if (pickedTheme()) return null
  const day = currentPeriod() === 'day'
  return (
    <MButton type="button" className="daynight" onClick={() => setPeriod(day ? 'night' : 'day')}
      aria-label={day ? 'Switch to night colours' : 'Switch to day colours'} title={day ? 'Night colours' : 'Day colours'}>
      <span aria-hidden="true">{day ? '🌙' : '☀️'}</span>
    </MButton>
  )
}

// Colour comparison panel, only with ?pick=1.
export function ThemePicker() {
  const cur = useTheme()
  const [open, setOpen] = useState(false)
  if (!new URLSearchParams(location.search).has('pick')) return null
  return (
    <div className="theme-pick">
      {open && (
        <div className="theme-panel" role="dialog" aria-label="Choose website colours">
          <p>🎨 Choose colours</p>
          {themes.map((t) => (
            <button key={t.id} type="button" className="theme-opt" aria-pressed={cur === t.id} onClick={() => pickTheme(t.id)}>
              <span className="theme-sw" aria-hidden="true">{t.sw.map((c) => <i key={c} style={{ background: c }} />)}</span>
              <span>{t.name}<small>{t.note}</small></span>
            </button>
          ))}
        </div>
      )}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>🎨 {open ? 'Close' : 'Colours'}</button>
    </div>
  )
}

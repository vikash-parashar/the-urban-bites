import { useState } from 'react'
import { isPreview } from './api'
import { applyTheme, initialTheme, themes, type ThemeId } from './theme'

// Floating colour picker, shown in the preview or with ?pick=1, so the owner can compare looks.
export function ThemePicker() {
  const show = isPreview || new URLSearchParams(location.search).has('pick')
  const [cur, setCur] = useState<ThemeId>(initialTheme)
  const [open, setOpen] = useState(false)
  if (!show) return null
  return (
    <div className="theme-pick">
      {open && (
        <div className="theme-panel" role="dialog" aria-label="Choose website colours">
          <p>🎨 Choose colours</p>
          {themes.map((t) => (
            <button key={t.id} type="button" className="theme-opt" aria-pressed={cur === t.id}
              onClick={() => { setCur(t.id); applyTheme(t.id, true) }}>
              <span className="theme-sw" aria-hidden="true">{t.sw.map((c) => <i key={c} style={{ background: c }} />)}</span>
              <span>{t.name}<small>{t.note}</small></span>
            </button>
          ))}
        </div>
      )}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        🎨 {open ? 'Close' : 'Colours'}
      </button>
    </div>
  )
}

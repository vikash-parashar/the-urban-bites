// Colour themes for the website. The owner's choice is set at build time with VITE_THEME;
// the preview also lets a visitor try each one (kept in this browser only).
export const themes = [
  { id: 'navy', name: 'Midnight Navy', note: 'Current blue night look', sw: ['#070a1c', '#3d5cff', '#f4b43a'] },
  { id: 'charcoal', name: 'Charcoal Gold', note: 'Black with gold, premium', sw: ['#0b0b0d', '#222228', '#f4b43a'] },
  { id: 'maroon', name: 'Tandoor Maroon', note: 'Deep red with flame orange', sw: ['#170607', '#ff7a1a', '#f4b43a'] },
  { id: 'green', name: 'Hariyali Green', note: 'Fresh and clean', sw: ['#05130e', '#22c55e', '#f4b43a'] },
  { id: 'cream', name: 'Cream Day', note: 'Light, bright, simple', sw: ['#fbf6ec', '#3550e8', '#e9a21f'] },
  { id: 'masala', name: 'Masala Orange', note: 'Light with spicy orange', sw: ['#fff4e8', '#e85d04', '#f59e0b'] },
] as const
export type ThemeId = (typeof themes)[number]['id']

const KEY = 'ub_theme'
const valid = (v: string | null | undefined): v is ThemeId => !!v && themes.some((t) => t.id === v)

export function initialTheme(): ThemeId {
  const q = new URLSearchParams(location.search).get('theme')
  if (valid(q)) return q
  try {
    const saved = localStorage.getItem(KEY)
    if (valid(saved)) return saved
  } catch { /* storage blocked */ }
  const built = import.meta.env.VITE_THEME as string | undefined
  return valid(built) ? built : 'navy'
}

export function applyTheme(id: ThemeId, save = false) {
  document.documentElement.dataset.theme = id
  const bg = { navy: '#070a1c', charcoal: '#0b0b0d', maroon: '#170607', green: '#05130e', cream: '#fbf6ec', masala: '#fff4e8' }[id]
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
  if (save) {
    try { localStorage.setItem(KEY, id) } catch { /* storage blocked */ }
  }
}

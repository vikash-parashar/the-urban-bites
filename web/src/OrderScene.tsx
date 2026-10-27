import { useEffect, useMemo, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { SCENE_DEFS, SCENES } from './scenes.gen'

// Animated Manjeet scenes for each order step (built by scripts/build_scenes.py from the anime
// images). The loops inside each scene are SVG animations; switching between steps uses Framer Motion.
const BASE = `${import.meta.env.BASE_URL}media/chars/scene/`

export type SceneKey = 'placed' | 'cooking' | 'hold' | 'ready' | 'out' | 'done' | 'cancelled'

export function sceneFor(status: string, opts: { overdue?: boolean; paused?: boolean }): SceneKey {
  switch (status) {
    case 'placed':
      return opts.paused ? 'hold' : 'placed'
    case 'accepted':
    case 'preparing':
      return opts.overdue ? 'hold' : 'cooking'
    case 'ready':
      return 'ready'
    case 'out_for_delivery':
      return 'out'
    case 'completed':
      return 'done'
    case 'cancelled':
      return 'cancelled'
    default:
      return 'placed'
  }
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)
const clip = (t: string) => (t.length > 22 ? `${t.slice(0, 21)}…` : t)

function Art({ scene, label, items }: { scene: SceneKey; label: string; items: string[] }) {
  const ref = useRef<SVGSVGElement>(null)
  const key = items.join('|')
  const html = useMemo(() => {
    let s = (SCENES[scene] ?? '').replaceAll('__B__', BASE)
    // The "order placed" scene shows the customer's own first three dishes popping up as he writes.
    for (let i = 0; i < 3; i++) {
      s = items[i]
        ? s.replace(`__I${i}__`, esc(clip(items[i])))
        : s.replace(new RegExp(`<!--chip${i}-->[\\s\\S]*?<!--/chip${i}-->`), '')
    }
    return SCENE_DEFS + s
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, key])
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) ref.current?.pauseAnimations()
  }, [html])
  return <svg ref={ref} viewBox="0 0 1200 896" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: html }} />
}

export default function OrderScene({ scene, label, time, progress, items = [] }: { scene: SceneKey; label: string; time?: React.ReactNode; progress?: number; items?: string[] }) {
  return (
    <div className={`scene-card scene-${scene}`} aria-live="polite">
      <div className="scene-art">
        <AnimatePresence initial={false}>
          <motion.div key={scene} className="scene-layer"
            initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}>
            <Art scene={scene} label={label} items={items} />
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="scene-info">
        <span className="scene-label">{label}</span>
        {time && <span className="scene-time">{time}</span>}
      </div>
      {progress != null && (
        <div className="scene-bar" aria-hidden="true">
          <motion.i initial={false} animate={{ scaleX: Math.min(1, Math.max(0, progress)) }} transition={{ duration: 1, ease: 'linear' }} />
        </div>
      )}
    </div>
  )
}

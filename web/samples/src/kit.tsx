import { motion, type Variants, type HTMLMotionProps } from 'motion/react'
import type { ReactNode } from 'react'
export const spring = { type: 'spring', stiffness: 380, damping: 22 } as const
export const soft = { type: 'spring', stiffness: 160, damping: 20 } as const
export const ease = [0.22, 1, 0.36, 1] as const
export const fadeUp: Variants = { hidden: { opacity: 0, y: 36 }, show: { opacity: 1, y: 0, transition: { duration: 0.7, ease } } }
export const slideL: Variants = { hidden: { opacity: 0, x: -60 }, show: { opacity: 1, x: 0, transition: { duration: 0.7, ease } } }
export const slideR: Variants = { hidden: { opacity: 0, x: 60 }, show: { opacity: 1, x: 0, transition: { duration: 0.7, ease } } }
export const pop: Variants = { hidden: { opacity: 0, scale: 0.6, rotate: -8 }, show: { opacity: 1, scale: 1, rotate: 0, transition: { type: 'spring', stiffness: 300, damping: 16 } } }
export const stag = (gap = 0.08, delay = 0): Variants => ({ hidden: {}, show: { transition: { staggerChildren: gap, delayChildren: delay } } })
export const view = { initial: 'hidden', whileInView: 'show', viewport: { once: true, amount: 0.2 } } as const
export const alive = { whileHover: { y: -2, scale: 1.04 }, whileTap: { scale: 0.94 }, transition: spring }

export function Reveal({ children, v = fadeUp, className, as = 'div' }: { children: ReactNode; v?: Variants; className?: string; as?: 'div' | 'section' | 'header' }) {
  const C = motion[as]
  return <C className={className} variants={v} {...view}>{children}</C>
}
export function Stagger({ children, className, gap = 0.08, delay = 0, amount = 0.15 }: { children: ReactNode; className?: string; gap?: number; delay?: number; amount?: number }) {
  return <motion.div className={className} variants={stag(gap, delay)} initial="hidden" whileInView="show" viewport={{ once: true, amount }}>{children}</motion.div>
}
export function Btn(p: HTMLMotionProps<'a'>) { return <motion.a {...alive} {...p} /> }
export function B(p: HTMLMotionProps<'button'>) { return <motion.button type="button" {...alive} {...p} /> }

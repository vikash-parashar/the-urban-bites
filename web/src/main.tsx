import { StrictMode, useEffect, useState } from 'react'
import { MotionConfig } from 'motion/react'
import { createRoot } from 'react-dom/client'
import App from './App'
import StaffApp from './Staff'
import './styles.css'
import { startThemeClock } from './theme'

startThemeClock()

// #staff opens the owner/admin area (#staff/reset?token=… from a reset email); everything else is the public site.
function Root() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const on = () => setHash(location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash === '#staff' || hash.startsWith('#staff/') ? <StaffApp hash={hash} /> : <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <Root />
    </MotionConfig>
  </StrictMode>,
)

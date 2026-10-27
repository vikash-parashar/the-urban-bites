import { StrictMode, useEffect, useState } from 'react'
import { MotionConfig } from 'motion/react'
import { createRoot } from 'react-dom/client'
import App from './App'
import StaffApp from './Staff'
import './styles.css'
import { startThemeClock } from './theme'
import { setupInstall, useManifest } from './install'

startThemeClock()
setupInstall()
// The installed "Orders" app always opens on the staff screen.
if (new URLSearchParams(location.search).get('app') === 'staff' && !location.hash.startsWith('#staff')) location.hash = '#staff'

// #staff opens the owner/admin area (#staff/reset?token=… from a reset email); everything else is the public site.
function Root() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const on = () => setHash(location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const staff = hash === '#staff' || hash.startsWith('#staff/')
  useEffect(() => { document.documentElement.dataset.area = staff ? 'staff' : 'site' }, [staff])
  useManifest(staff)
  return staff ? <StaffApp hash={hash} /> : <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <Root />
    </MotionConfig>
  </StrictMode>,
)

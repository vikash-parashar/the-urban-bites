import { useState } from 'react'
import { useInstall } from './install'
import { MButton } from './motion'

// InstallApp puts "The Urban Bites Orders" on Manjeet's home screen. Opening that icon goes straight
// to the staff screen, so he never needs the website address.
export default function InstallApp({ compact = false }: { compact?: boolean }) {
  const { installed, canPrompt, ios, install } = useInstall()
  const [done, setDone] = useState(false)
  const [help, setHelp] = useState(false)
  if (installed) return compact ? null : <p className="install-ok">✅ Opened from the installed app.</p>
  if (done) return <p className="install-ok">✅ Installed. Look for “UB Orders” on the home screen.</p>

  return (
    <div className={`install ${compact ? 'is-compact' : ''}`}>
      <span className="install-ico" aria-hidden="true">📲</span>
      <div className="install-txt">
        <strong>Install as an app</strong>
        <small>An “UB Orders” icon on the home screen opens orders directly. No need to remember the website.</small>
      </div>
      {canPrompt ? (
        <MButton type="button" className="btn btn-gold btn-sm" onClick={async () => setDone(await install())}>Install</MButton>
      ) : (
        <MButton type="button" className="btn btn-ghost btn-sm" onClick={() => setHelp((v) => !v)} aria-expanded={help}>How?</MButton>
      )}
      {help && !canPrompt && (
        <ol className="install-steps">
          {ios ? (
            <>
              <li>Open this page in <b>Safari</b>.</li>
              <li>Tap the <b>Share</b> button (square with an arrow ↑).</li>
              <li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
            </>
          ) : (
            <>
              <li>Open this page in <b>Chrome</b>.</li>
              <li>Tap the <b>⋮</b> menu at the top right.</li>
              <li>Tap <b>Install app</b> (or <b>Add to Home screen</b>), then <b>Install</b>.</li>
            </>
          )}
          <li>Sign in once. The icon stays signed in and opens the orders screen.</li>
        </ol>
      )}
    </div>
  )
}

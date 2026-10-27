import Wordmark from './Wordmark'
import { useState, type FormEvent } from 'react'
import { changePassword, forgotPassword, resetPassword, signIn, signOut, type Staff } from './staffApi'
import { MA, MButton } from './motion'

const Brand = () => <a className="brand" href="#top"><Wordmark /></a>

function PasswordField({ id, name, label, auto }: { id: string; name: string; label: string; auto: string }) {
  const [show, setShow] = useState(false)
  return (
    <label className="field" htmlFor={id}>{label}
      <span className="pw-wrap">
        <input id={id} name={name} type={show ? 'text' : 'password'} required minLength={name === 'current' || name === 'password-login' ? 1 : 10} maxLength={72} autoComplete={auto} />
        <MButton type="button" className="pw-eye" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>{show ? '🙈' : '👁️'}</MButton>
      </span>
    </label>
  )
}

const RULES = 'At least 10 characters. Don’t use the shop name, “demo”, your email or 1234…'

export function Login({ onIn }: { onIn: (s: Staff) => void }) {
  const [mode, setMode] = useState<'in' | 'forgot' | 'sent'>('in')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    setError('')
    try {
      if (mode === 'in') onIn(await signIn(String(f.get('email')), String(f.get('password-login'))))
      else { await forgotPassword(String(f.get('email'))); setMode('sent') }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="staff-login">
      <form className="checkout" onSubmit={submit}>
        <Brand />
        {mode === 'sent' ? (
          <>
            <h1 className="staff-h">Check your email</h1>
            <p className="menu-sub">If <strong>{email}</strong> has a staff account, a link to set a new password is on its way. It works once, for 30 minutes. Look in Spam too.</p>
            <MButton type="button" className="btn btn-gold btn-block" onClick={() => setMode('in')}>Back to sign in</MButton>
          </>
        ) : (
          <>
            <h1 className="staff-h">{mode === 'in' ? 'Staff sign in' : 'Forgot your password?'}</h1>
            <p className="menu-sub">{mode === 'in' ? 'For the owner and the admin: orders, menu, offers and sales.' : 'Enter your staff email and we’ll send you a link to choose a new one.'}</p>
            <label className="field" htmlFor="st-email">Email<input id="st-email" name="email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            {mode === 'in' && <PasswordField id="st-pass" name="password-login" label="Password" auto="current-password" />}
            {error && <p className="error" role="alert">{error}</p>}
            <MButton className="btn btn-gold btn-block" disabled={busy}>{busy ? 'One moment…' : mode === 'in' ? 'Sign in' : 'Email me a link'}</MButton>
            <MButton type="button" className="linkish" onClick={() => { setError(''); setMode(mode === 'in' ? 'forgot' : 'in') }}>
              {mode === 'in' ? 'Forgot password?' : 'Back to sign in'}
            </MButton>
          </>
        )}
      </form>
    </div>
  )
}

// ChangePassword is forced after a temporary password, and available any time from the staff bar.
export function ChangePassword({ user, forced, onDone, onCancel }: { user: Staff; forced: boolean; onDone: (s: Staff) => void; onCancel?: () => void }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    if (f.get('new') !== f.get('again')) return setError('The two new passwords don’t match.')
    setBusy(true)
    setError('')
    try {
      onDone(await changePassword(String(f.get('current')), String(f.get('new'))))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="staff-login">
      <form className="checkout" onSubmit={submit}>
        <Brand />
        <h1 className="staff-h">{forced ? `Welcome, ${user.name.split(' ')[0]}! Choose your password` : 'Change your password'}</h1>
        <p className="menu-sub">{forced ? 'You signed in with a temporary password. Pick one only you know; after this, the temporary one stops working.' : 'Other phones and tablets signed in to this account will need the new password.'}</p>
        <input type="email" name="username" autoComplete="username" value={user.email} readOnly hidden />
        <PasswordField id="cp-cur" name="current" label={forced ? 'Temporary password' : 'Current password'} auto="current-password" />
        <PasswordField id="cp-new" name="new" label="New password" auto="new-password" />
        <PasswordField id="cp-again" name="again" label="New password again" auto="new-password" />
        <p className="pw-rules">{RULES}</p>
        {error && <p className="error" role="alert">{error}</p>}
        <MButton className="btn btn-gold btn-block" disabled={busy}>{busy ? 'Saving…' : 'Save my password'}</MButton>
        {forced ? (
          <MButton type="button" className="linkish" onClick={() => { signOut(); location.reload() }}>Sign out</MButton>
        ) : onCancel && <MButton type="button" className="linkish" onClick={onCancel}>Cancel</MButton>}
      </form>
    </div>
  )
}

// ResetPassword opens from the email link: #staff/reset?token=…
export function ResetPassword({ token, onDone }: { token: string; onDone: (s: Staff) => void }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    if (f.get('new') !== f.get('again')) return setError('The two passwords don’t match.')
    setBusy(true)
    setError('')
    try {
      const s = await resetPassword(token, String(f.get('new')))
      onDone(s)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="staff-login">
      <form className="checkout" onSubmit={submit}>
        <Brand />
        <h1 className="staff-h">Choose a new password</h1>
        <PasswordField id="rp-new" name="new" label="New password" auto="new-password" />
        <PasswordField id="rp-again" name="again" label="New password again" auto="new-password" />
        <p className="pw-rules">{RULES}</p>
        {error && <p className="error" role="alert">{error}</p>}
        <MButton className="btn btn-gold btn-block" disabled={busy || !token}>{busy ? 'Saving…' : 'Save and sign in'}</MButton>
        <MA className="linkish" href="#staff">Back to sign in</MA>
      </form>
    </div>
  )
}

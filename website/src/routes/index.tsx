import { useEffect, useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { authClient } from '#/lib/auth'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const { data: session, isPending } = authClient.useSession()
  const [view, setView] = useState<'signin' | 'signup' | 'forgot' | 'reset' | 'two-factor' | 'account' | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [secondFactor, setSecondFactor] = useState<'totp' | 'otp' | 'backup'>('totp')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [totpURI, setTotpURI] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const signedIn = !!session?.user

  useEffect(() => {
    if (window.location.hash === '#two-factor') {
      setView('two-factor')
      if (new URLSearchParams(window.location.search).get('twoFactorMethods')?.includes('otp')) setSecondFactor('otp')
    }
    if (new URLSearchParams(window.location.search).has('token')) setView('reset')
  }, [])

  async function submit(event: FormEvent<HTMLFormElement> | undefined, action: () => Promise<unknown>, success = 'Request completed.') {
    event?.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      const result = await action() as { error?: { message?: string }; data?: unknown }
      if (result.error) throw new Error(result.error.message || 'That request could not be completed.')
      setMessage(success)
      if (view === 'signup') setView('signin')
      if (view === 'forgot') setView('signin')
      if (view === 'reset') { setView('signin'); window.history.replaceState(null, '', '/') }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'That request could not be completed.')
    } finally { setBusy(false) }
  }

  function closeAccount() {
    setView(null)
    setMessage('')
    setTotpURI('')
    setBackupCodes([])
  }

  return (
    <main className="site-shell">
      <nav aria-label="Primary navigation">
        <a className="brand" href="/" aria-label="Lift home"><span>LI</span><i />FT</a>
        <div className="account-actions">
          {!isPending && (signedIn
            ? <button className="text-button" type="button" onClick={() => setView('account')}>{session.user.name || session.user.email}</button>
            : <><button className="text-button" type="button" onClick={() => setView('signin')}>Sign in</button><button className="button" type="button" onClick={() => setView('signup')}>Create account</button></>)}
        </div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="intro">Your training, remembered.</p>
          <h1>A workout log that learns your rhythm.</h1>
          <p className="lede">Lift keeps every set close, tracks recovery across sessions, and helps you choose what to train next without turning fitness into homework.</p>
          {!signedIn
            ? <button className="button hero-button" type="button" onClick={() => setView('signup')}>Start with Lift</button>
            : <p className="connected">Your Lift account is connected.</p>}
        </div>

        <div className="training-board" aria-label="Example weekly training summary">
          <div className="board-top"><span>This week</span><strong>3 sessions</strong></div>
          <div className="week" aria-hidden="true">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => <div key={`${day}-${index}`} className={index === 0 || index === 2 || index === 4 ? 'trained' : ''}><span>{day}</span><i /></div>)}
          </div>
          <div className="next-session">
            <span>Up next</span>
            <strong>Pull</strong>
            <p>Back and biceps are ready. Start from your last working weights.</p>
          </div>
        </div>
      </section>

      <section className="principles" aria-label="What Lift does">
        <article><strong>Log fast</strong><p>Sets, reps, weight, and effort without breaking the flow of a workout.</p></article>
        <article><strong>Recover intelligently</strong><p>Recent muscle fatigue changes recommendations until your body catches up.</p></article>
        <article><strong>Own the history</strong><p>Your account keeps training consistent across devices and remains exportable.</p></article>
      </section>

      <footer>
        <span>Lift</span>
        <div><a href="https://api.lift.garrett.one/privacy">Privacy</a><a href="https://api.lift.garrett.one/terms">Terms</a><a href="https://api.lift.garrett.one/support">Support</a></div>
      </footer>
      {view && <div className="auth-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAccount() }}>
        <section className="auth-panel" role="dialog" aria-modal="true" aria-labelledby="auth-title">
          <button className="auth-close" aria-label="Close" type="button" onClick={closeAccount}>×</button>
          {view === 'account' ? <>
            <p className="intro">Your account</p><h2 id="auth-title">{session?.user.name || session?.user.email}</h2>
            <p className="auth-note">{session?.user.email}</p>
            {message && <p className="auth-message" role="status">{message}</p>}
            {!session?.user.emailVerified && <div className="auth-feature"><p>Verify your email to secure your account.</p><button type="button" className="text-button" onClick={() => void submit(undefined, () => authClient.sendVerificationEmail({ email: session?.user.email || '', callbackURL: window.location.origin }))}>Resend verification email</button></div>}
            <form onSubmit={(e) => void submit(e, async () => {
              const result = await authClient.twoFactor.enable({ password, method: 'totp', issuer: 'Lift' })
              if (result.data?.method === 'totp') {
                setTotpURI(result.data.totpURI)
                setBackupCodes(result.data.backupCodes)
              }
              return result
            }, 'Scan the setup URI, then verify a code to finish enrollment.') }>
              <h3>Authenticator app</h3><p className="auth-note">{session?.user.twoFactorEnabled ? 'Two-factor authentication is enabled.' : 'Add a time-based code for sign-in.'}</p>
              {!session?.user.twoFactorEnabled && <><label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label><button className="button auth-submit" disabled={busy}>Set up authenticator</button></>}
            </form>
            {!!totpURI && <div className="auth-feature"><p>Scan this setup URI in your authenticator app, then enter its 6-digit code.</p><code>{totpURI}</code><form onSubmit={(e) => void submit(e, () => authClient.twoFactor.verifyTotp({ code }), 'Authenticator enabled. Save your backup codes securely.')}><label>Authenticator code<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required /></label><button className="button auth-submit">Verify code</button></form></div>}
            {!!backupCodes.length && <p className="auth-note">Backup codes: {backupCodes.join(' · ')}</p>}
            <button className="text-button" type="button" onClick={() => void authClient.signOut().then(() => closeAccount())}>Sign out</button>
            <div className="auth-feature"><h3>Delete account</h3><p className="auth-note">This permanently deletes your identity, profile, workouts, recommendations, and friend connections.</p><label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label><button className="text-button" type="button" disabled={busy || !password} onClick={() => { if (window.confirm('Permanently delete your Lift account and all of its data?')) void submit(undefined, async () => { const result = await authClient.deleteUser({ password }); if (!result.error) closeAccount(); return result }, 'Account deleted.') }}>Delete account</button></div>
          </> : <>
            <p className="intro">Lift account</p>
            <h2 id="auth-title">{view === 'signup' ? 'Create your account' : view === 'signin' ? 'Welcome back' : view === 'forgot' ? 'Reset your password' : view === 'reset' ? 'Choose a new password' : 'Two-factor check'}</h2>
            {view === 'two-factor' ? <form onSubmit={(e) => void submit(e, async () => {
              const result = secondFactor === 'backup'
                ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice: true })
                : secondFactor === 'otp'
                  ? await authClient.twoFactor.verifyOtp({ code, trustDevice: true })
                  : await authClient.twoFactor.verifyTotp({ code, trustDevice: true })
              if (!result.error) { window.history.replaceState(null, '', '/'); closeAccount() }
              return result
            })}>
              <p className="auth-note">{secondFactor === 'backup' ? 'Enter one of your unused backup codes.' : secondFactor === 'otp' ? 'Enter the code sent to your email.' : 'Enter the code from your authenticator app.'}</p>
              {secondFactor === 'otp' && <button type="button" className="text-button" onClick={() => void submit(undefined, () => authClient.twoFactor.sendOtp({ trustDevice: true }), 'A security code was sent to your email.')}>Send email code</button>}
              <label>Verification code<input autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required /></label><button className="button auth-submit" disabled={busy}>Verify and sign in</button>
              <div className="auth-options">
                <button className="text-button" type="button" onClick={() => setSecondFactor('totp')}>Authenticator app</button>
                {new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('twoFactorMethods')?.includes('otp') && <button className="text-button" type="button" onClick={() => setSecondFactor('otp')}>Email code</button>}
                <button className="text-button" type="button" onClick={() => setSecondFactor('backup')}>Backup code</button>
              </div>
            </form> : <form onSubmit={(e) => void submit(e, () => {
              if (view === 'signup') return authClient.signUp.email({ name, email, password, callbackURL: window.location.origin })
              if (view === 'signin') return authClient.signIn.email({ email, password })
              if (view === 'forgot') return authClient.requestPasswordReset({ email, redirectTo: window.location.origin })
              return authClient.resetPassword({ newPassword: password, token: new URLSearchParams(window.location.search).get('token') || '' })
            }, view === 'signup' ? 'Account created. Check your email to verify your address.' : view === 'forgot' ? 'If an account uses that email, a reset link is on its way.' : view === 'reset' ? 'Password updated. You can sign in now.' : 'Signed in successfully.') }>
              {view === 'signup' && <label>Name<input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required /></label>}
              {view !== 'reset' && <label>Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>}
              {view !== 'forgot' && <label>Password<input type="password" autoComplete={view === 'signin' ? 'current-password' : 'new-password'} minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} required /></label>}
              <button className="button auth-submit" disabled={busy}>{view === 'signup' ? 'Create account' : view === 'signin' ? 'Sign in' : view === 'forgot' ? 'Send reset link' : 'Update password'}</button>
            </form>}
            {message && <p className="auth-message" role="status">{message}</p>}
            {view === 'signin' && <button className="text-button" type="button" onClick={() => { setView('forgot'); setMessage('') }}>Forgot password?</button>}
            {view === 'signin' && <p className="auth-note">New to Lift? <button type="button" className="inline-link" onClick={() => { setView('signup'); setMessage('') }}>Create an account</button></p>}
            {view === 'signup' && <p className="auth-note">Already have an account? <button type="button" className="inline-link" onClick={() => { setView('signin'); setMessage('') }}>Sign in</button></p>}
            {view === 'forgot' && <p className="auth-note"><button type="button" className="inline-link" onClick={() => { setView('signin'); setMessage('') }}>Back to sign in</button></p>}
          </>}
        </section>
      </div>}
    </main>
  )
}

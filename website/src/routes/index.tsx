import { useEffect, useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { authClient } from '#/lib/auth'
import { Icon } from '#/components/icons'
import { Wordmark } from '#/components/wordmark'

export const Route = createFileRoute('/')({ component: Home })

// Weekly activity heatmap shown inside the hero phone preview.
const activity = [0, 0, 1, 0, 2, 0, 0, 1, 0, 0, 3, 0, 0, 2, 0, 2, 4, 0, 0, 1, 0, 0, 0, 0, 2, 4, 0, 0, 1, 0, 3, 0, 0, 2, 0]

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
      if (view === 'signup') setView('account')
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
        <a className="brand" href="/" aria-label="Lift home"><Wordmark height={22} /></a>
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

        <div className="hero-visual">
          <div className="phone" role="img" aria-label="Lift app home screen">
            <div className="phone-island" />
            <div className="phone-screen">
              <div className="app-title">Home</div>
              <div className="app-trend">
                <div className="app-trend-row"><span className="app-trend-value">128<em>LB</em></span><span className="app-trend-change">+12% from last week</span></div>
                <div className="app-trend-label">Weekly volume</div>
                <svg className="app-chart" viewBox="0 0 260 70" preserveAspectRatio="none" aria-hidden="true">
                  {[18, 38, 58].map((y) => <line key={y} x1="0" x2="260" y1={y} y2={y} className="app-chart-grid" />)}
                  <polyline points="0,58 37,50 74,54 111,36 148,40 185,24 222,20 260,8" className="app-chart-line" />
                </svg>
                <div className="app-tabs"><span className="is-active">All</span><span>Push</span><span>Pull</span><span>Legs</span></div>
              </div>
              <div className="app-activity">
                <div className="app-activity-head"><strong>September activity</strong><span>11 DAYS</span></div>
                <div className="app-grid" aria-hidden="true">{activity.map((level, index) => <i key={index} data-level={level} />)}</div>
              </div>
              <div className="app-next"><span>YOUR NEXT WORKOUT</span><strong>Pull · Back and biceps</strong></div>
            </div>
          </div>
        </div>
      </section>

      <section className="features" aria-label="What Lift does">
        <div className="features-head">
          <p className="intro">What you get</p>
          <h2>Everything you need to train with context.</h2>
        </div>
        <div className="principles">
          <article><span className="feature-icon"><Icon name="zap" /></span><strong>Log fast</strong><p>Sets, reps, weight, and effort without breaking the flow of a workout.</p></article>
          <article><span className="feature-icon"><Icon name="activity" /></span><strong>Recover intelligently</strong><p>Recent muscle fatigue changes recommendations until your body catches up.</p></article>
          <article><span className="feature-icon"><Icon name="archive" /></span><strong>Own the history</strong><p>Your account keeps training consistent across devices and remains exportable.</p></article>
        </div>
      </section>

      {!signedIn && <section className="cta-band">
        <div>
          <h2>Your next session starts here.</h2>
          <p>Free to start, and your training history stays yours.</p>
        </div>
        <button className="button cta-button" type="button" onClick={() => setView('signup')}>Start with Lift</button>
      </section>}

      <footer>
        <span className="brand"><Wordmark height={20} /></span>
        <div><a href="https://api.lift.garrett.one/privacy">Privacy</a><a href="https://api.lift.garrett.one/terms">Terms</a><a href="https://api.lift.garrett.one/support">Support</a></div>
      </footer>
      {view && <div className="auth-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAccount() }}>
        <section className="auth-panel" role="dialog" aria-modal="true" aria-labelledby="auth-title">
          <button className="auth-close" aria-label="Close" type="button" onClick={closeAccount}>×</button>
          {view === 'account' ? <>
            <Wordmark height={18} /><h2 id="auth-title">{session?.user.name || session?.user.email}</h2>
            <p className="auth-note">{session?.user.email}</p>
            {message && <p className="auth-message" role="status">{message}</p>}
            {session?.user && !session.user.emailVerified && <div className="auth-feature"><p>Check your inbox or Spam folder for the verification link sent to {session.user.email}.</p><button type="button" className="text-button" onClick={() => void submit(undefined, () => authClient.sendVerificationEmail({ email: session.user.email, callbackURL: window.location.origin }), 'Verification email sent.')}>Resend verification email</button></div>}
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
            <Wordmark height={18} />
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
            }, view === 'signup' ? 'Account created. Check your inbox or Spam folder for the verification link.' : view === 'forgot' ? 'If an account uses that email, a reset link is on its way.' : view === 'reset' ? 'Password updated. You can sign in now.' : 'Signed in successfully.') }>
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

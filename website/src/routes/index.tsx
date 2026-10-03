import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { authClient, needsOnboarding, submitOnboarding, type Onboarding } from '#/lib/auth'
import { Icon } from '#/components/icons'
import { experienceLabel, OnboardingSteps } from '#/components/onboarding'
import { Wordmark } from '#/components/wordmark'

export const Route = createFileRoute('/')({ component: Home })

// Weekly activity heatmap shown inside the hero phone preview.
const activity = [0, 0, 1, 0, 2, 0, 0, 1, 0, 0, 3, 0, 0, 2, 0, 2, 4, 0, 0, 1, 0, 0, 0, 0, 2, 4, 0, 0, 1, 0, 3, 0, 0, 2, 0]

type View = 'onboarding' | 'welcome' | 'signup' | 'signin' | 'forgot' | 'reset' | 'two-factor' | 'account'
type Go = (view: View, notice?: string) => void
type Result = { error?: { message?: string } | null } | void

function Home() {
  const { data: session, isPending } = authClient.useSession()
  const user = session?.user
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [view, setView] = useState<View | null>(null)
  const [notice, setNotice] = useState('')
  const [answers, setAnswers] = useState<Onboarding | null>(null)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [savingAnswers, setSavingAnswers] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (window.location.hash === '#two-factor') setView('two-factor')
    else if (params.has('token')) setView('reset')
  }, [])

  // Accounts created before onboarding existed, or whose answers failed to
  // save, get a hero prompt instead of an interruption.
  useEffect(() => {
    if (!user?.id) { setNeedsSetup(false); return }
    let active = true
    void needsOnboarding().then((value) => { if (active) setNeedsSetup(value) }, () => undefined)
    return () => { active = false }
  }, [user?.id])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (view && !dialog.open) dialog.showModal()
    if (!view && dialog.open) dialog.close()
  }, [view])

  const go: Go = (next, message = '') => { setView(next); setNotice(message) }
  function close() {
    setView(null)
    setNotice('')
    if (window.location.search || window.location.hash) window.history.replaceState(null, '', '/')
  }

  async function finishOnboarding(next: Onboarding) {
    setAnswers(next)
    if (!user) return go('signup')
    setSavingAnswers(true)
    try {
      await submitOnboarding(next)
      setNeedsSetup(false)
      go('welcome')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save your training preferences.')
    } finally { setSavingAnswers(false) }
  }

  return (
    <main className="site-shell">
      <nav aria-label="Primary navigation">
        <a className="brand" href="/" aria-label="Lift home"><Wordmark height={22} /></a>
        <div className="account-actions">
          {!isPending && (user
            ? <button className="text-button" type="button" onClick={() => go('account')}>{user?.name || user?.email}</button>
            : <><button className="text-button" type="button" onClick={() => go('signin')}>Sign in</button><button className="button" type="button" onClick={() => go('onboarding')}>Create account</button></>)}
        </div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="intro">Your training, remembered.</p>
          <h1>A workout log that learns your rhythm.</h1>
          <p className="lede">Lift keeps every set close, tracks recovery across sessions, and helps you choose what to train next without turning fitness into homework.</p>
          {!user || needsSetup
            ? <button className="button hero-button" type="button" onClick={() => go('onboarding')}>{user ? 'Personalize your plan' : 'Start with Lift'}</button>
            : <p className="connected">Your Lift account is connected. Log workouts in the Lift app.</p>}
        </div>

        <div className="hero-visual">
          <div className="phone" role="img" aria-label="Lift app home screen">
            <div className="phone-island" />
            <div className="phone-screen">
              <div className="app-title">Home</div>
              <div className="app-trend">
                <div className="app-trend-row"><span className="app-trend-value">12.8k<em>LB</em></span><span className="app-trend-change">+12% from last week</span></div>
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

      {!user && <section className="cta-band">
        <div>
          <h2>Your next session starts here.</h2>
          <p>Free to start, and your training history stays yours.</p>
        </div>
        <button className="button cta-button" type="button" onClick={() => go('onboarding')}>Start with Lift</button>
      </section>}

      <footer>
        <span className="brand"><Wordmark height={20} /></span>
        <div><a href="https://api.lift.garrett.one/privacy">Privacy</a><a href="https://api.lift.garrett.one/terms">Terms</a><a href="https://api.lift.garrett.one/support">Support</a></div>
      </footer>
      <dialog ref={dialogRef} className="auth-dialog" aria-labelledby="auth-title" onClose={close} onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
        {view && <section className="auth-panel">
          <button className="auth-close" aria-label="Close" type="button" onClick={close}>×</button>
          <Wordmark height={18} />
          {notice && <p className="auth-message" role="status">{notice}</p>}
          {view === 'onboarding' ? <OnboardingSteps initial={answers} busy={savingAnswers} finishLabel={user ? 'Save my plan' : 'Continue'} onDone={(next) => void finishOnboarding(next)} />
            : view === 'welcome' ? <Welcome answers={answers} email={user?.emailVerified ? '' : user?.email ?? ''} onDone={close} />
            : view === 'account' && user ? <AccountPanel user={user} close={close} />
            : view === 'two-factor' ? <TwoFactorForm close={close} />
            : view !== 'account' && <AuthForm key={view} mode={view} answers={answers} go={go} close={close} onboarded={() => setNeedsSetup(false)} />}
        </section>}
      </dialog>
    </main>
  )
}

function useRequest() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function run(action: () => Promise<Result>, success = '') {
    setBusy(true)
    setMessage('')
    try {
      const result = await action()
      if (result?.error) throw new Error(result.error.message || 'That request could not be completed.')
      setMessage(success)
      return true
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'That request could not be completed.')
      return false
    } finally { setBusy(false) }
  }
  return { busy, message, run }
}

function AuthForm({ mode, answers, go, close, onboarded }: { mode: 'signup' | 'signin' | 'forgot' | 'reset'; answers: Onboarding | null; go: Go; close: () => void; onboarded: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { busy, message, run } = useRequest()

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mode === 'signin') {
      if (!await run(() => authClient.signIn.email({ email, password }))) return
      // Answered the questions, then signed in to an existing account: only fill in a profile that has none.
      if (answers && await needsOnboarding().catch(() => false)) await submitOnboarding(answers).then(onboarded, () => undefined)
      close()
    } else if (mode === 'forgot') {
      if (await run(() => authClient.requestPasswordReset({ email, redirectTo: window.location.origin }))) go('signin', 'If an account uses that email, a reset link is on its way.')
    } else if (mode === 'reset') {
      const token = new URLSearchParams(window.location.search).get('token') || ''
      if (await run(() => authClient.resetPassword({ newPassword: password, token }))) {
        window.history.replaceState(null, '', '/')
        go('signin', 'Password updated. You can sign in now.')
      }
    } else if (await run(() => authClient.signUp.email({ name, email, password, callbackURL: window.location.origin }))) {
      // Sign-up returns a session, so the answers can be saved right away.
      const saved = !answers || await submitOnboarding(answers).then(() => true, () => false)
      if (saved && answers) onboarded()
      go('welcome', saved ? '' : 'Your account is ready, but your training preferences did not save. Use “Personalize your plan” on the home page to try again.')
    }
  }

  const title = mode === 'signup' ? 'Create your account' : mode === 'signin' ? 'Welcome back' : mode === 'forgot' ? 'Reset your password' : 'Choose a new password'
  return <>
    <h2 id="auth-title">{title}</h2>
    {mode === 'signup' && answers && <p className="plan-summary">
      <span>{answers.goals.join(' · ')}</span><span>{experienceLabel(answers.experience)}</span><span>{answers.trainingDays} {answers.trainingDays === 1 ? 'day' : 'days'} a week</span>
      <button type="button" className="inline-link" onClick={() => go('onboarding')}>Edit</button>
    </p>}
    <form onSubmit={(event) => void submit(event)}>
      {mode === 'signup' && <label>Name<input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required /></label>}
      {mode !== 'reset' && <label>Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>}
      {mode !== 'forgot' && <label>Password<input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={mode === 'signin' ? undefined : 12} value={password} onChange={(e) => setPassword(e.target.value)} required />{mode !== 'signin' && <small>At least 12 characters.</small>}</label>}
      <button className="button auth-submit" disabled={busy}>{busy ? 'One moment…' : mode === 'signup' ? 'Create account' : mode === 'signin' ? 'Sign in' : mode === 'forgot' ? 'Send reset link' : 'Update password'}</button>
    </form>
    {message && <p className="auth-message" role="alert">{message}</p>}
    <div className="auth-options">
      {mode === 'signin' && <>
        <button className="text-button" type="button" onClick={() => go('forgot')}>Forgot password?</button>
        <span className="auth-note">New to Lift? <button type="button" className="inline-link" onClick={() => go('onboarding')}>Create an account</button></span>
      </>}
      {mode === 'signup' && <span className="auth-note">Already have an account? <button type="button" className="inline-link" onClick={() => go('signin')}>Sign in</button></span>}
      {mode === 'forgot' && <button type="button" className="inline-link" onClick={() => go('signin')}>Back to sign in</button>}
    </div>
  </>
}

function TwoFactorForm({ close }: { close: () => void }) {
  const offersEmail = new URLSearchParams(window.location.search).get('twoFactorMethods')?.includes('otp') ?? false
  const [method, setMethod] = useState<'totp' | 'otp' | 'backup'>(offersEmail ? 'otp' : 'totp')
  const [code, setCode] = useState('')
  const { busy, message, run } = useRequest()
  const verify = () => method === 'backup' ? authClient.twoFactor.verifyBackupCode({ code, trustDevice: true })
    : method === 'otp' ? authClient.twoFactor.verifyOtp({ code, trustDevice: true })
    : authClient.twoFactor.verifyTotp({ code, trustDevice: true })
  return <>
    <h2 id="auth-title">Two-factor check</h2>
    <form onSubmit={(event) => { event.preventDefault(); void run(verify).then((ok) => ok && close()) }}>
      <p className="auth-note">{method === 'backup' ? 'Enter one of your unused backup codes.' : method === 'otp' ? 'Enter the code sent to your email.' : 'Enter the code from your authenticator app.'}</p>
      {method === 'otp' && <button type="button" className="text-button" disabled={busy} onClick={() => void run(() => authClient.twoFactor.sendOtp({ trustDevice: true }), 'A security code was sent to your email.')}>Send email code</button>}
      <label>Verification code<input autoComplete="one-time-code" inputMode={method === 'backup' ? 'text' : 'numeric'} value={code} onChange={(e) => setCode(e.target.value)} required /></label>
      <button className="button auth-submit" disabled={busy}>Verify and sign in</button>
    </form>
    {message && <p className="auth-message" role="status">{message}</p>}
    <div className="auth-options">
      {method !== 'totp' && <button className="text-button" type="button" onClick={() => setMethod('totp')}>Use authenticator app</button>}
      {offersEmail && method !== 'otp' && <button className="text-button" type="button" onClick={() => setMethod('otp')}>Use email code</button>}
      {method !== 'backup' && <button className="text-button" type="button" onClick={() => setMethod('backup')}>Use backup code</button>}
    </div>
  </>
}

type User = NonNullable<ReturnType<typeof authClient.useSession>['data']>['user']

function AccountPanel({ user, close }: { user: User; close: () => void }) {
  // Separate fields: the authenticator and delete forms must never share a typed password.
  const [setupPassword, setSetupPassword] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [code, setCode] = useState('')
  const [totpURI, setTotpURI] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const { busy, message, run } = useRequest()

  async function enable() {
    const result = await authClient.twoFactor.enable({ password: setupPassword, method: 'totp', issuer: 'Lift' })
    if (result.data?.method === 'totp') {
      setTotpURI(result.data.totpURI)
      setBackupCodes(result.data.backupCodes)
    }
    return result
  }

  return <>
    <h2 id="auth-title">{user.name || user.email}</h2>
    <p className="auth-note">{user.email}</p>
    {message && <p className="auth-message" role="status">{message}</p>}
    {!user.emailVerified && <div className="auth-feature">
      <p>Check your inbox or Spam folder for the verification link sent to {user.email}.</p>
      <button type="button" className="text-button" disabled={busy} onClick={() => void run(() => authClient.sendVerificationEmail({ email: user.email, callbackURL: window.location.origin }), 'Verification email sent.')}>Resend verification email</button>
    </div>}

    <h3>Authenticator app</h3>
    <p className="auth-note">{user.twoFactorEnabled ? 'Two-factor authentication is enabled.' : 'Add a time-based code for sign-in.'}</p>
    {!user.twoFactorEnabled && !totpURI && <form onSubmit={(event) => { event.preventDefault(); void run(enable, 'Open the setup link, then verify a code to finish enrollment.') }}>
      <label>Password<input type="password" autoComplete="current-password" value={setupPassword} onChange={(e) => setSetupPassword(e.target.value)} required /></label>
      <button className="button auth-submit" disabled={busy}>Set up authenticator</button>
    </form>}
    {!!totpURI && <div className="auth-feature">
      <p>Open this link on a device with your authenticator app, or copy it in manually. Then enter its 6-digit code.</p>
      <a className="totp-link" href={totpURI}>{totpURI}</a>
      <form onSubmit={(event) => { event.preventDefault(); void run(() => authClient.twoFactor.verifyTotp({ code }), 'Authenticator enabled. Save your backup codes securely.') }}>
        <label>Authenticator code<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required /></label>
        <button className="button auth-submit" disabled={busy}>Verify code</button>
      </form>
      {!!backupCodes.length && <><p>Backup codes — each works once:</p><code>{backupCodes.join('  ')}</code></>}
    </div>}

    <button className="button secondary-button" type="button" onClick={() => void authClient.signOut().then(close)}>Sign out</button>

    <details className="danger-zone">
      <summary>Delete account</summary>
      <p className="auth-note">This permanently deletes your identity, profile, workouts, recommendations, and friend connections.</p>
      <label>Password<input type="password" autoComplete="current-password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} /></label>
      <button className="button danger-button" type="button" disabled={busy || !deletePassword} onClick={() => {
        if (window.confirm('Permanently delete your Lift account and all of its data?')) void run(() => authClient.deleteUser({ password: deletePassword })).then((ok) => ok && close())
      }}>Delete account</button>
    </details>
  </>
}

function Welcome({ answers, email, onDone }: { answers: Onboarding | null; email: string; onDone: () => void }) {
  return <>
    <p className="intro">Your plan is ready</p>
    <h2 id="auth-title">You’re all set.</h2>
    {answers && <div className="auth-feature plan-card">
      <span>Your starting point</span>
      <strong>{answers.trainingDays} {answers.trainingDays === 1 ? 'day' : 'days'} a week</strong>
      <p>{experienceLabel(answers.experience)} · Focused on {answers.goals.map((goal) => goal.toLowerCase()).join(', ')}</p>
    </div>}
    {email && <p className="auth-note">We sent a verification link to <strong>{email}</strong>. Check your Spam folder if it doesn’t arrive.</p>}
    <p className="auth-note">Sign in to the Lift app on your phone with this account — your first workout will be waiting.</p>
    <button className="button auth-submit" type="button" onClick={onDone}>Done</button>
  </>
}

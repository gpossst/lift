import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { authClient, needsOnboarding, submitOnboarding, type Onboarding } from '#/lib/auth'
import { experienceLabel, OnboardingSteps } from '#/components/onboarding'
import { Wordmark } from '#/components/wordmark'

export const Route = createFileRoute('/')({ component: Home })

const TESTFLIGHT = 'https://testflight.apple.com/join/wcj1WUHE'

// Each feature row pairs one app clip (public/home) with what it shows; tone colours the heading.
const features: [string, string, string, string][] = [
  ['log-workout', 'red', 'Log fast', 'Sets, reps, weight, and effort in a swipe, without breaking the flow of a workout.'],
  ['timer', 'ink', 'Rest on cue', 'A rest timer starts after every set, and a tap adds or trims 15 seconds.'],
  ['fatigue-input', 'blue', 'Recover intelligently', 'Recent muscle fatigue shapes what Lift suggests next, until your body catches up.'],
  ['active-diagram', 'red', 'See what you’ve hit', 'The active workout maps every muscle you’ve trained so far, and what’s still waiting.'],
  ['exercise-progress', 'ink', 'Own the history', 'Every set stays with your account, consistent across devices and always exportable.'],
]

// A looping app clip (public/home/<clip>.mp4, first frame as <clip>.jpg) in a phone frame that always tilts toward the mouse; --mx/--my also place the hover sheen.
function Phone({ clip, alt }: { clip: string; alt: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    // Reduced motion: hold on the opening frame instead of looping.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) video.current?.pause()
    const clamp = (n: number) => Math.max(-1, Math.min(1, n))
    function tilt(event: globalThis.PointerEvent) {
      const el = ref.current
      if (!el || event.pointerType !== 'mouse') return
      const box = el.getBoundingClientRect()
      // Lean toward the cursor: a faint hint from afar, full tilt once within ~200px of the frame.
      const dx = Math.max(box.left - event.clientX, 0, event.clientX - box.right)
      const dy = Math.max(box.top - event.clientY, 0, event.clientY - box.bottom)
      const strength = .15 + .85 * Math.max(0, 1 - Math.hypot(dx, dy) / 200)
      const x = clamp((event.clientX - box.left - box.width / 2) / (box.width / 2)) * strength
      const y = clamp((event.clientY - box.top - box.height / 2) / (box.height / 2)) * strength
      el.style.setProperty('--ry', `${x * 12}deg`)
      el.style.setProperty('--rx', `${y * -9}deg`)
      el.style.setProperty('--mx', `${(event.clientX - box.left) / box.width * 100}%`)
      el.style.setProperty('--my', `${(event.clientY - box.top) / box.height * 100}%`)
    }
    window.addEventListener('pointermove', tilt)
    return () => window.removeEventListener('pointermove', tilt)
  }, [])
  return <span ref={ref} className="phone"><video ref={video} src={`/home/${clip}.mp4`} poster={`/home/${clip}.jpg`} aria-label={alt} role="img" width={496} height={1080} autoPlay muted loop playsInline /></span>
}

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
  const [savingAnswers, setSavingAnswers] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (window.location.hash === '#two-factor') setView('two-factor')
    else if (window.location.hash === '#signin') setView('signin')
    else if (params.has('token')) setView('reset')
  }, [])

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
            : <><button className="text-button" type="button" onClick={() => go('signin')}>Sign in</button><a className="button nav-cta" href={TESTFLIGHT}>Get the app</a></>)}
        </div>
      </nav>

      <section className="hero">
        <h1>A workout log that learns your rhythm.</h1>
        <p className="hero-sub">Lift keeps every set close, tracks recovery, and helps you choose what to train next.</p>
        <div className="hero-actions">
          <a className="chunky" href={TESTFLIGHT}><img src="/home/testflight.webp" alt="" width={26} height={26} />Get Lift on TestFlight</a>
          <a className="chunky secondary" href="/feedback">Feedback</a>
        </div>
        <div className="hero-phones">
          <Phone clip="start-workout" alt="Lift: pick what to train today and start a workout" />
          <Phone clip="pr-and-overview" alt="Lift celebrating a new PR, then the workout recap" />
          <Phone clip="stats-page" alt="Lift stats: muscle coverage, splits, and weekly training" />
        </div>
      </section>

      {features.map(([clip, tone, title, body], index) => <section key={clip} className={`feature${index % 2 ? ' is-flipped' : ''}`} data-tone={tone}>
        <div>
          <h2>{title}</h2>
          <p>{body}</p>
        </div>
        <Phone clip={clip} alt={`Lift: ${title.toLowerCase()}`} />
      </section>)}

      <section className="section closing">
        <h2>Your next session starts here.</h2>
        <a className="chunky" href={TESTFLIGHT}>Get started</a>
      </section>

      <footer>
        <span className="brand"><Wordmark height={20} /></span>
        <div><a href="/feedback">Feedback</a><a href="https://api.lift.garrett.one/privacy">Privacy</a><a href="https://api.lift.garrett.one/terms">Terms</a><a href="https://api.lift.garrett.one/support">Support</a></div>
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
            : view !== 'account' && <AuthForm key={view} mode={view} answers={answers} go={go} close={close} />}
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

function AuthForm({ mode, answers, go, close }: { mode: 'signup' | 'signin' | 'forgot' | 'reset'; answers: Onboarding | null; go: Go; close: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { busy, message, run } = useRequest()

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mode === 'signin') {
      if (!await run(() => authClient.signIn.email({ email, password }))) return
      // Answered the questions, then signed in to an existing account: only fill in a profile that has none.
      if (answers && await needsOnboarding().catch(() => false)) await submitOnboarding(answers).catch(() => undefined)
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
      go('welcome', saved ? '' : 'Your account is ready, but your training preferences did not save. You can set them up in the Lift app.')
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

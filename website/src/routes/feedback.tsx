import { useEffect, useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { authClient, feedbackRequest, type Feedback, type FeedbackKind } from '#/lib/auth'
import { Wordmark } from '#/components/wordmark'

export const Route = createFileRoute('/feedback')({
  head: () => ({ meta: [{ title: 'Feedback — Lift' }] }),
  component: FeedbackPage,
})

const kinds: [FeedbackKind, string][] = [['bug', 'Bug fix'], ['feature', 'Feature request'], ['other', 'Other']]
const kindLabel = Object.fromEntries(kinds) as Record<FeedbackKind, string>

function FeedbackPage() {
  const { data: session, isPending } = authClient.useSession()
  const user = session?.user
  const [items, setItems] = useState<Feedback[] | null>(null)
  const [kind, setKind] = useState<FeedbackKind>('bug')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  // Reload once the session resolves so the list carries this reader's votes.
  useEffect(() => { if (!isPending) void run(() => feedbackRequest()) }, [isPending, user?.id])

  async function run(request: () => Promise<Feedback[]>) {
    setBusy(true)
    setMessage('')
    try { setItems(await request()); return true }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Something went wrong.'); return false }
    finally { setBusy(false) }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (await run(() => feedbackRequest('', { method: 'POST', body: { kind, body } }))) setBody('')
  }

  const vote = (item: Feedback, value: 1 | -1) => void run(() => feedbackRequest(`/${item.id}/vote`, { method: 'POST', body: { value: item.myVote === value ? 0 : value } }))

  return (
    <main className="site-shell feedback-page">
      <nav aria-label="Primary navigation">
        <a className="brand" href="/" aria-label="Lift home"><Wordmark height={22} /></a>
      </nav>

      <h1>Feedback</h1>
      <p className="hero-sub">Found a bug or want something new? Tell us, and vote on what matters most to you.</p>

      {user ? <form className="feedback-form" onSubmit={(event) => void submit(event)}>
        <fieldset className="kind-picker">
          <legend className="sr-only">Feedback type</legend>
          {kinds.map(([value, label]) => <label key={value}><input type="radio" name="kind" value={value} checked={kind === value} onChange={() => setKind(value)} />{label}</label>)}
        </fieldset>
        <label className="sr-only" htmlFor="feedback-body">Your feedback</label>
        <textarea id="feedback-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={5} required placeholder="What happened, or what would you like to see?" />
        <button className="chunky" disabled={busy || !body.trim()}>Send feedback</button>
      </form>
        : !isPending && <p className="auth-message"><a className="inline-link" href="/#signin">Sign in</a> to post feedback and vote.</p>}

      {message && <p className="auth-message" role="alert">{message}</p>}

      <ul className="feedback-list">
        {items?.map((item) => <li key={item.id}>
          <div className="vote" aria-label={`Score ${item.score}`}>
            <button type="button" aria-label="Upvote" aria-pressed={item.myVote === 1} disabled={!user || busy} onClick={() => vote(item, 1)}>▲</button>
            <strong>{item.score}</strong>
            <button type="button" aria-label="Downvote" aria-pressed={item.myVote === -1} disabled={!user || busy} onClick={() => vote(item, -1)}>▼</button>
          </div>
          <div>
            <span className="feedback-meta" data-kind={item.kind}>{kindLabel[item.kind]} · {item.author} · {new Date(item.createdAt * 1000).toLocaleDateString()}</span>
            <p>{item.body}</p>
          </div>
        </li>)}
        {items?.length === 0 && <li className="auth-note">No feedback yet. Be the first.</li>}
      </ul>
    </main>
  )
}

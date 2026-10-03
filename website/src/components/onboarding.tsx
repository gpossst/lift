import { useState, type FormEvent } from 'react'
import type { Onboarding } from '#/lib/auth'

// Same questions, copy, and allowed values as mobile/src/components/onboarding.tsx;
// the Worker rejects goals outside this list.
const goals = ['Build muscle', 'Get stronger', 'Lose fat', 'Feel healthier']
const experiences = [
  { value: 'new', label: 'Just getting started', detail: 'I’m learning the basics.' },
  { value: 'some', label: 'I’ve trained before', detail: 'I know my way around a workout.' },
  { value: 'experienced', label: 'Very experienced', detail: 'Training is already part of my routine.' },
] as const
const steps = 3

export const experienceLabel = (value: Onboarding['experience']) => experiences.find((item) => item.value === value)!.label

export function OnboardingSteps({ initial, finishLabel, busy, onDone }: { initial: Onboarding | null; finishLabel: string; busy?: boolean; onDone: (answers: Onboarding) => void }) {
  const [step, setStep] = useState(0)
  const [selected, setSelected] = useState<string[]>(initial?.goals ?? [])
  const [experience, setExperience] = useState<Onboarding['experience'] | null>(initial?.experience ?? null)
  const [days, setDays] = useState(initial?.trainingDays ?? 3)
  const valid = [selected.length > 0, !!experience, true][step]

  function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!valid) return
    if (step < steps - 1) setStep(step + 1)
    else onDone({ goals: selected, experience: experience!, trainingDays: days })
  }

  return (
    <form className="onboarding" onSubmit={next}>
      <div className="steps">
        <span>{step + 1} of {steps}</span>
        <div className="progress"><i style={{ width: `${((step + 1) / steps) * 100}%` }} /></div>
      </div>
      <div className="step" key={step}>
        {step === 0 && <>
          <h2 id="auth-title">What are you working toward?</h2>
          <p className="auth-note">Pick all that feel right.</p>
          <div className="choices">{goals.map((goal) => (
            <label className="choice" key={goal}>
              <input type="checkbox" checked={selected.includes(goal)} onChange={() => setSelected((current) => current.includes(goal) ? current.filter((item) => item !== goal) : [...current, goal])} />
              <strong>{goal}</strong>
            </label>
          ))}</div>
        </>}
        {step === 1 && <>
          <h2 id="auth-title">How much lifting experience do you have?</h2>
          <p className="auth-note">We’ll meet you where you are.</p>
          <div className="choices" role="radiogroup">{experiences.map((item) => (
            <label className="choice" key={item.value}>
              <input type="radio" name="experience" checked={experience === item.value} onChange={() => setExperience(item.value)} />
              <span><strong>{item.label}</strong><small>{item.detail}</small></span>
            </label>
          ))}</div>
        </>}
        {step === 2 && <>
          <h2 id="auth-title">Let’s shape your routine.</h2>
          <p className="auth-note">How many days a week do you want to train?</p>
          <div className="days">
            <output htmlFor="training-days">{days}</output>
            <span>{days === 1 ? 'day' : 'days'} / week</span>
          </div>
          <input id="training-days" className="days-range" type="range" min={1} max={7} value={days} onChange={(event) => setDays(Number(event.target.value))} aria-label="Training days per week" />
          <div className="day-ticks" aria-hidden="true">{[1, 2, 3, 4, 5, 6, 7].map((day) => <span key={day} data-active={day === days}>{day}</span>)}</div>
        </>}
      </div>
      <div className="step-actions">
        {step > 0 && <button className="text-button" type="button" onClick={() => setStep(step - 1)}>‹ Back</button>}
        <button className="button auth-submit" disabled={!valid || busy}>{step < steps - 1 ? 'Continue' : busy ? 'Saving…' : finishLabel}</button>
      </div>
    </form>
  )
}

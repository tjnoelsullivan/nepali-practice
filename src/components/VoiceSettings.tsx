import { useState } from 'react'
import { romanize } from '../core/devanagari'
import { WEEKDAYS } from '../core/plan'
import { GOAL_CHOICES, setPrefs, usePrefs } from '../core/prefs'
import { explainError, getAccessCode, setAccessCode } from '../voice/api'
import { setVoiceSettings, useVoiceSettings } from '../voice/settings'
import { checkMic, listenOnce } from '../voice/stt'
import { speak, unlockAudio } from '../voice/tts'

export function VoiceSettings() {
  const v = useVoiceSettings()
  const { goalMinutes, lessonDays, sounds } = usePrefs()
  const gi = GOAL_CHOICES.indexOf(goalMinutes)
  const [code, setCode] = useState(getAccessCode())
  const [saved, setSaved] = useState(false)
  const [status, setStatus] = useState('')

  const testVoice = () => {
    unlockAudio()
    setStatus('Playing…')
    speak('नमस्ते। तपाईं सन्चै हुनुहुन्छ?')
      .then(() => setStatus('Voice works.'))
      .catch((e) => setStatus(explainError(e)))
  }

  const testMic = async () => {
    setStatus('Asking for the microphone…')
    if (!(await checkMic())) {
      setStatus('Microphone access is off. Allow it in Settings > Safari > Microphone.')
      return
    }
    setStatus('Listening… say "Namaste".')
    try {
      const heard = await listenOnce().result
      setStatus(heard ? `Heard: ${romanize(heard)}` : "Didn't catch anything. Try again a little louder.")
    } catch (e) {
      setStatus(e instanceof Error && navigator.onLine && !('status' in e) ? e.message : explainError(e))
    }
  }

  return (
    <section className="card settings">
      <h2>Settings</h2>

      <div className="setting">
        <span>
          Daily goal
          <small className="muted">Active minutes per day</small>
        </span>
        <div className="stepper">
          <button aria-label="Lower goal" disabled={gi <= 0} onClick={() => setPrefs({ goalMinutes: GOAL_CHOICES[Math.max(0, gi - 1)] })}>
            −
          </button>
          <strong>{goalMinutes} min</strong>
          <button
            aria-label="Raise goal"
            disabled={gi >= GOAL_CHOICES.length - 1}
            onClick={() => setPrefs({ goalMinutes: GOAL_CHOICES[Math.min(GOAL_CHOICES.length - 1, gi + 1)] })}
          >
            +
          </button>
        </div>
      </div>

      <div className="setting">
        <span>
          Lesson days
          <small className="muted">For the on-track estimate</small>
        </span>
        <div className="lesson-days">
          {WEEKDAYS.map((d, i) => (
            <button
              key={d}
              className={lessonDays.includes(i) ? 'on' : ''}
              aria-pressed={lessonDays.includes(i)}
              onClick={() =>
                setPrefs({
                  lessonDays: lessonDays.includes(i) ? lessonDays.filter((x) => x !== i) : [...lessonDays, i].sort(),
                })
              }
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="setting">
        <span>Voice</span>
        <div className="segmented small-seg">
          <button className={v.voice === 'female' ? 'on' : ''} onClick={() => setVoiceSettings({ voice: 'female' })}>
            Hemkala (f)
          </button>
          <button className={v.voice === 'male' ? 'on' : ''} onClick={() => setVoiceSettings({ voice: 'male' })}>
            Sagar (m)
          </button>
        </div>
      </div>

      <label className="setting">
        <span>
          Read sentences aloud
          <small className="muted">Plays the Nepali automatically</small>
        </span>
        <input type="checkbox" className="toggle" checked={v.autoplay} onChange={(e) => setVoiceSettings({ autoplay: e.target.checked })} />
      </label>

      <label className="setting">
        <span>
          Sounds
          <small className="muted">Chimes for answers and celebrations</small>
        </span>
        <input type="checkbox" className="toggle" checked={sounds} onChange={(e) => setPrefs({ sounds: e.target.checked })} />
      </label>

      <label className="setting">
        <span>
          Listening practice
          <small className="muted">Hide the Nepali text until you tap it</small>
        </span>
        <input type="checkbox" className="toggle" checked={v.hideText} onChange={(e) => setVoiceSettings({ hideText: e.target.checked })} />
      </label>

      <form
        className="setting code"
        onSubmit={(e) => {
          e.preventDefault()
          setAccessCode(code)
          setSaved(true)
        }}
      >
        <span>
          Access code
          <small className="muted">Only if you set APP_ACCESS_CODE in Vercel</small>
        </span>
        <div className="answer">
          <input
            type="password"
            value={code}
            onChange={(e) => {
              setCode(e.target.value)
              setSaved(false)
            }}
            autoComplete="off"
            placeholder="Access code"
          />
          <button type="submit">{saved ? 'Saved' : 'Save'}</button>
        </div>
      </form>

      <div className="btn-row">
        <button className="ghost" onClick={testVoice}>
          Test voice
        </button>
        <button className="ghost" onClick={() => void testMic()}>
          Test microphone
        </button>
      </div>
      {status && <p className="muted small">{status}</p>}
    </section>
  )
}

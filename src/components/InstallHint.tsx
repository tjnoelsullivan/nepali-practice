import { useState } from 'react'

const KEY = 'saathi.installHintDismissed'

function shouldShow() {
  const ua = navigator.userAgent
  const isIOS = /iPhone|iPad|iPod/.test(ua)
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  let dismissed = false
  try {
    dismissed = localStorage.getItem(KEY) === '1'
  } catch {
    /* ignore */
  }
  return isIOS && !standalone && !dismissed
}

export function InstallHint() {
  const [show, setShow] = useState(shouldShow)
  if (!show) return null
  return (
    <div className="install-hint" role="note">
      <div>
        <strong>Install Saathi</strong>
        <p>
          Tap <ShareIcon /> Share, then <em>Add to Home Screen</em>. It then opens full screen and works
          offline.
        </p>
      </div>
      <button
        className="icon-btn"
        aria-label="Dismiss"
        onClick={() => {
          try {
            localStorage.setItem(KEY, '1')
          } catch {
            /* ignore */
          }
          setShow(false)
        }}
      >
        ×
      </button>
    </div>
  )
}

function ShareIcon() {
  return (
    <svg className="inline-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 11v9h14v-9" />
    </svg>
  )
}

// One shared microphone stream. On iPhone, every getUserMedia call from a home-screen app can
// bring up the permission prompt again, so the app asks once and reuses the stream for every
// spoken answer and recording. Each user gets a clone, which they may stop freely.
// The mic is released after a couple of minutes without use, or when the app goes to the
// background, so the orange "mic in use" dot doesn't linger.

const IDLE_RELEASE_MS = 2 * 60_000
let shared: MediaStream | null = null
let pending: Promise<MediaStream> | null = null
let idle: ReturnType<typeof setTimeout> | undefined

function live(s: MediaStream | null): s is MediaStream {
  return !!s && s.active && s.getAudioTracks().some((t) => t.readyState === 'live')
}

/** A clone of the shared mic stream. Stop its tracks when done; the shared stream stays open. */
export async function micStream(): Promise<MediaStream> {
  clearTimeout(idle)
  if (!live(shared)) {
    pending ??= navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .finally(() => (pending = null))
    shared = await pending
  }
  idle = setTimeout(releaseMic, IDLE_RELEASE_MS)
  return shared.clone()
}

/** Keep the mic open a little longer (call while it's in use). */
export function touchMic() {
  if (!shared) return
  clearTimeout(idle)
  idle = setTimeout(releaseMic, IDLE_RELEASE_MS)
}

export function releaseMic() {
  clearTimeout(idle)
  shared?.getTracks().forEach((t) => t.stop())
  shared = null
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') releaseMic()
  })
}

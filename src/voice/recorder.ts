// Records audio with the phone's microphone (MediaRecorder). iPhone Safari records audio/mp4.
import { micStream, touchMic } from './mic'

export type ActiveRecording = { stop: () => Promise<{ blob: Blob; mime: string; durationMs: number }>; cancel: () => void }

function pickMime(): string {
  for (const m of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'])
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m
  return ''
}

export async function startRecording(): Promise<ActiveRecording> {
  const stream = await micStream()
  const mime = pickMime()
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
  const parts: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data)
  const started = Date.now()
  rec.start()
  const release = () => {
    stream.getTracks().forEach((t) => t.stop())
    touchMic()
  }
  return {
    stop: () =>
      new Promise((resolve) => {
        rec.onstop = () => {
          release()
          const type = rec.mimeType || mime || 'audio/mp4'
          resolve({ blob: new Blob(parts, { type }), mime: type, durationMs: Date.now() - started })
        }
        rec.stop()
      }),
    cancel: () => {
      rec.onstop = release
      if (rec.state !== 'inactive') rec.stop()
      else release()
    },
  }
}

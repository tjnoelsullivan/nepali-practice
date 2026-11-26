// Speech recognition for spoken Nepali answers, using Azure Speech in the browser.
// The SDK is large, so it loads only the first time the mic is used. The Azure key stays on the
// server; the browser gets a 10-minute token from /api/speech-token.
import { api } from './api'

type Token = { token: string; region: string; at: number }
let tok: Token | null = null

async function token(): Promise<Token> {
  if (tok && Date.now() - tok.at < 8 * 60_000) return tok
  const r = await api('/api/speech-token')
  const j = (await r.json()) as { token: string; region: string }
  tok = { ...j, at: Date.now() }
  return tok
}

export type Listening = {
  /** Resolves with what was heard (Devanagari), or '' if nothing was recognized. */
  result: Promise<string>
  cancel: () => void
}

/** Start listening for one Nepali utterance. Ends by itself after a pause. */
export function listenOnce(): Listening {
  let cancelled = false
  let close: () => void = () => {}
  const result = (async () => {
    const [sdk, t] = await Promise.all([import('microsoft-cognitiveservices-speech-sdk'), token()])
    if (cancelled) return ''
    const cfg = sdk.SpeechConfig.fromAuthorizationToken(t.token, t.region)
    cfg.speechRecognitionLanguage = 'ne-NP'
    cfg.setProperty(sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, '1200')
    cfg.setProperty(sdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, '8000')
    const rec = new sdk.SpeechRecognizer(cfg, sdk.AudioConfig.fromDefaultMicrophoneInput())
    close = () => rec.close()
    return await new Promise<string>((resolve, reject) => {
      rec.recognizeOnceAsync(
        (r) => {
          rec.close()
          if (r.reason === sdk.ResultReason.RecognizedSpeech) resolve(r.text ?? '')
          else if (r.reason === sdk.ResultReason.Canceled) {
            const c = sdk.CancellationDetails.fromResult(r)
            if (c.ErrorCode === sdk.CancellationErrorCode.AuthenticationFailure) tok = null
            reject(new Error(c.errorDetails || 'Speech recognition was cancelled.'))
          } else resolve('')
        },
        (err) => {
          rec.close()
          reject(new Error(err))
        },
      )
    })
  })()
  return {
    result,
    cancel: () => {
      cancelled = true
      try {
        close()
      } catch {
        /* already closed */
      }
    },
  }
}

/** Ask for the mic once, so the first real answer isn't interrupted by the permission prompt. */
export async function checkMic(): Promise<boolean> {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true })
    s.getTracks().forEach((t) => t.stop())
    return true
  } catch {
    return false
  }
}

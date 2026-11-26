// Issues a 10-minute Azure Speech token so the browser can run speech recognition
// without ever seeing the Azure key.
import { azure, denied, json } from './_shared.js'

export async function GET(request: Request): Promise<Response> {
  const no = denied(request)
  if (no) return no
  const az = azure()
  if (!az) return json({ error: 'azure-not-configured' }, 503)
  const r = await fetch(`https://${az.region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': az.key, 'content-length': '0' },
  })
  if (!r.ok) return json({ error: 'azure-token', status: r.status }, 502)
  return json({ token: await r.text(), region: az.region, expiresIn: 540 })
}

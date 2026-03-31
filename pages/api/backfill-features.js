/**
 * Proxy sicuro verso Cloud Run POST /backfill-features (Bearer solo lato server).
 * La Training App chiama questa route; non esporre mai il secret al browser.
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const base = (process.env.CLOUD_RUN_SERVICE_URL
    || process.env.NEXT_PUBLIC_CLOUD_RUN_URL
    || '').replace(/\/$/, '')
  const secret = process.env.CLOUD_RUN_SECRET_KEY
    || process.env.CLOUD_RUN_BACKFILL_SECRET

  if (!base) {
    return res.status(500).json({
      error: 'URL Cloud Run mancante: imposta NEXT_PUBLIC_CLOUD_RUN_URL o CLOUD_RUN_SERVICE_URL'
    })
  }
  if (!secret) {
    return res.status(500).json({
      error: 'CLOUD_RUN_SECRET_KEY mancante (.env.local): necessario per autorizzare /backfill-features sul servizio'
    })
  }

  let dry_run = false
  let limit = null
  if (req.body && typeof req.body === 'object') {
    dry_run = Boolean(req.body.dry_run)
    const n = req.body.limit
    if (n != null && Number.isFinite(Number(n)) && Number(n) > 0) {
      limit = Math.floor(Number(n))
    }
  }

  const qs = new URLSearchParams()
  if (dry_run) qs.set('dry_run', 'true')
  if (limit != null) qs.set('limit', String(limit))
  const q = qs.toString()
  const url = `${base}/backfill-features${q ? `?${q}` : ''}`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
    })

    const text = await response.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      data = { error: text || 'Invalid JSON from Cloud Run' }
    }

    if (!response.ok) {
      const msg = data.error || data.message || `Cloud Run HTTP ${response.status}`
      return res.status(response.status >= 400 && response.status < 600 ? response.status : 502).json({
        error: msg,
        details: data,
      })
    }

    return res.status(200).json(data)
  } catch (e) {
    console.error('backfill-features proxy:', e)
    return res.status(500).json({
      error: e.message || 'Proxy backfill failed',
    })
  }
}

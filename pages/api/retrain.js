export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    console.log('🔄 Triggering Cloud Run retrain...')

    const CLOUD_RUN_URL = process.env.CLOUD_RUN_RETRAIN_URL
    const SECRET_KEY = process.env.CLOUD_RUN_SECRET_KEY

    if (!CLOUD_RUN_URL || !SECRET_KEY) {
      throw new Error('Cloud Run configuration missing')
    }

    const response = await fetch(`${CLOUD_RUN_URL}/train`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Retrain failed')
    }

    const data = await response.json()
    console.log('✅ Retrain completed:', data)

    return res.status(200).json({
      success: true,
      photosProcessed: data.photos_processed,
      accuracy: data.accuracy,
      spaceFree: data.space_freed_mb
    })

  } catch (error) {
    console.error('❌ Error:', error)
    return res.status(500).json({
      error: error.message || 'Retrain failed'
    })
  }
}

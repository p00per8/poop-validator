import { createClient } from '@supabase/supabase-js'

function getLabelFromFilename(imageUrl) {
  if (!imageUrl) return null
  const filename = imageUrl.split('/').pop()
  if (filename.startsWith('valid_')) return 'valid'
  if (filename.startsWith('invalid_')) return 'invalid'
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Fetch all photos
    const { data: photos, error } = await supabase
      .from('training_photos')
      .select('id, label, image_url')

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    if (!photos || photos.length === 0) {
      return res.status(200).json({
        message: 'No photos found',
        synced: 0,
        skipped: 0,
        errors: 0,
        total: 0
      })
    }

    let syncCount = 0
    let skipCount = 0
    let errorCount = 0
    const updates = []

    for (const photo of photos) {
      const labelFromFilename = getLabelFromFilename(photo.image_url)
      const currentLabel = photo.label

      if (!labelFromFilename) {
        skipCount++
        continue
      }

      if (labelFromFilename === currentLabel) {
        skipCount++
        continue
      }

      // Update needed
      const { error: updateError } = await supabase
        .from('training_photos')
        .update({ label: labelFromFilename })
        .eq('id', photo.id)

      if (updateError) {
        errorCount++
        updates.push({
          id: photo.id,
          filename: photo.image_url.split('/').pop(),
          status: 'error',
          error: updateError.message
        })
      } else {
        syncCount++
        updates.push({
          id: photo.id,
          filename: photo.image_url.split('/').pop(),
          status: 'updated',
          oldLabel: currentLabel,
          newLabel: labelFromFilename
        })
      }
    }

    return res.status(200).json({
      message: syncCount > 0
        ? `Successfully synced ${syncCount} photos`
        : 'All labels already in sync',
      synced: syncCount,
      skipped: skipCount,
      errors: errorCount,
      total: photos.length,
      updates: updates
    })

  } catch (error) {
    console.error('Sync labels error:', error)
    return res.status(500).json({ error: error.message })
  }
}

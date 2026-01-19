import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { photoIndex } = req.body // 0-based index (0 = first, 1 = second, 2 = third)

  if (photoIndex === undefined || photoIndex < 0) {
    return res.status(400).json({ error: 'Invalid photoIndex' })
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get today's photos
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data: photos, error: fetchError } = await supabase
      .from('training_photos')
      .select('*')
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: true })

    if (fetchError) {
      return res.status(500).json({ error: fetchError.message })
    }

    if (!photos || photos.length <= photoIndex) {
      return res.status(404).json({
        error: `Foto non trovata. Totale foto oggi: ${photos?.length || 0}`
      })
    }

    const photoToFix = photos[photoIndex]
    const oldFilename = photoToFix.image_url.split('/').pop()

    if (photoToFix.label === 'valid') {
      return res.status(200).json({
        message: 'Foto già marcata come valid',
        photo: photoToFix
      })
    }

    // Update database label
    const { error: updateError } = await supabase
      .from('training_photos')
      .update({ label: 'valid' })
      .eq('id', photoToFix.id)

    if (updateError) {
      return res.status(500).json({ error: updateError.message })
    }

    let renamed = false

    // Rename file in storage if needed
    if (oldFilename.startsWith('invalid_')) {
      const newFilename = oldFilename.replace('invalid_', 'valid_')
      const bucketName = 'training-dataset'

      try {
        // Download file
        const { data: fileData, error: downloadError } = await supabase
          .storage
          .from(bucketName)
          .download(oldFilename)

        if (!downloadError && fileData) {
          // Upload with new name
          const { error: uploadError } = await supabase
            .storage
            .from(bucketName)
            .upload(newFilename, fileData, {
              contentType: 'image/jpeg',
              upsert: false
            })

          if (!uploadError) {
            // Delete old file
            await supabase.storage.from(bucketName).remove([oldFilename])

            // Update image_url
            const newPath = photoToFix.image_url.replace(oldFilename, newFilename)
            await supabase
              .from('training_photos')
              .update({ image_url: newPath })
              .eq('id', photoToFix.id)

            renamed = true
          }
        }
      } catch (storageError) {
        console.error('Storage rename error:', storageError)
        // Continue even if rename fails - label is still updated
      }
    }

    return res.status(200).json({
      success: true,
      message: renamed
        ? 'Foto corretta: label aggiornato e file rinominato'
        : 'Foto corretta: label aggiornato',
      photo: {
        id: photoToFix.id,
        oldFilename,
        newFilename: renamed ? oldFilename.replace('invalid_', 'valid_') : oldFilename,
        oldLabel: 'invalid',
        newLabel: 'valid',
        created_at: photoToFix.created_at
      }
    })

  } catch (error) {
    console.error('Fix photo error:', error)
    return res.status(500).json({ error: error.message })
  }
}

import { createAdminClient } from '../../shared/lib/supabase'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'

const execAsync = promisify(exec)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  console.log('🔄 Retrain process started...')

  try {
    const supabase = createAdminClient()

    // 1. Get all photos not yet used in training
    const { data: photos, error: fetchError } = await supabase
      .from('training_photos')
      .select('*')
      .eq('used_in_training', false)

    if (fetchError) throw fetchError

    if (!photos || photos.length < 50) {
      return res.status(400).json({
        error: 'Servono almeno 50 foto per il retrain',
        currentCount: photos?.length || 0
      })
    }

    console.log(`📊 Found ${photos.length} photos to process`)

    // 2. Create temp directories
    const tmpDir = '/tmp/training'
    const validDir = path.join(tmpDir, 'valid')
    const invalidDir = path.join(tmpDir, 'invalid')

    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true })
    }
    fs.mkdirSync(validDir, { recursive: true })
    fs.mkdirSync(invalidDir, { recursive: true })

    // 3. Download photos from Supabase Storage
    console.log('⬇️ Downloading photos...')
    let totalSize = 0

    for (const photo of photos) {
      try {
        const { data: file, error: downloadError } = await supabase.storage
          .from('training-dataset')
          .download(photo.image_url)

        if (downloadError) throw downloadError

        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        
        totalSize += buffer.length

        const targetDir = photo.label === 'valid' ? validDir : invalidDir
        const filename = `${photo.id}.jpg`
        
        fs.writeFileSync(path.join(targetDir, filename), buffer)
      } catch (err) {
        console.error(`Failed to download ${photo.image_url}:`, err)
      }
    }

    console.log(`✅ Downloaded ${photos.length} photos (${(totalSize / 1024 / 1024).toFixed(2)} MB)`)

    // 4. Run Python training script
    console.log('🧠 Training model...')
    
    const scriptPath = path.join(process.cwd(), 'scripts', 'retrain_model.py')
    const { stdout, stderr } = await execAsync(
      `python3 ${scriptPath} ${tmpDir}`
    )

    console.log('Training output:', stdout)
    if (stderr) console.error('Training stderr:', stderr)

    // Extract accuracy from output
    const accuracyMatch = stdout.match(/Accuracy: ([\d.]+)/)
    const accuracy = accuracyMatch ? parseFloat(accuracyMatch[1]) : 0

    console.log(`✅ Training completed with accuracy: ${accuracy}%`)

    // 5. Mark photos as processed
    const { error: updateError } = await supabase
      .from('training_photos')
      .update({ used_in_training: true })
      .in('id', photos.map(p => p.id))

    if (updateError) throw updateError

    // 6. Delete photos from storage to free space
    console.log('🗑️ Deleting photos from storage...')
    let spaceFree = 0

    for (const photo of photos) {
      try {
        // Get file size before deletion
        const { data: fileList } = await supabase.storage
          .from('training-dataset')
          .list('', { search: photo.image_url })

        if (fileList && fileList.length > 0) {
          spaceFree += fileList[0].metadata?.size || 0
        }

        // Delete file
        await supabase.storage
          .from('training-dataset')
          .remove([photo.image_url])
      } catch (err) {
        console.error(`Failed to delete ${photo.image_url}:`, err)
      }
    }

    console.log(`✅ Freed ${(spaceFree / 1024 / 1024).toFixed(2)} MB`)

    // 7. Cleanup temp directory
    fs.rmSync(tmpDir, { recursive: true })
    console.log('🧹 Cleaned up temp files')

    // 8. Return success response
    return res.status(200).json({
      success: true,
      photosProcessed: photos.length,
      accuracy: accuracy.toFixed(2),
      spaceFree: (spaceFree / 1024 / 1024).toFixed(2),
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Retrain error:', error)
    return res.status(500).json({
      error: error.message || 'Retrain failed',
      details: error.toString()
    })
  }
}

#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function fixPhotoLabel() {
  console.log('🔍 Cercando foto di oggi...\n')

  // Get today's date at midnight
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Fetch all photos from today, ordered by creation time
  const { data: photos, error } = await supabase
    .from('training_photos')
    .select('*')
    .gte('created_at', today.toISOString())
    .order('created_at', { ascending: true })

  if (error) {
    console.error('❌ Errore query database:', error.message)
    process.exit(1)
  }

  if (!photos || photos.length === 0) {
    console.log('❌ Nessuna foto trovata oggi.')
    process.exit(0)
  }

  console.log(`📊 Trovate ${photos.length} foto di oggi:\n`)

  photos.forEach((photo, idx) => {
    const time = new Date(photo.created_at).toLocaleTimeString('it-IT')
    const filename = photo.image_url.split('/').pop()
    console.log(`${idx + 1}. [${photo.label.toUpperCase()}] ${filename} - ${time}`)
  })

  // The third photo (index 2)
  if (photos.length < 3) {
    console.log('\n❌ Non ci sono abbastanza foto (minimo 3 necessarie)')
    process.exit(0)
  }

  const photoToFix = photos[2] // Third photo (0-indexed)
  const oldFilename = photoToFix.image_url.split('/').pop()

  console.log(`\n🎯 Terza foto identificata:`)
  console.log(`   ID: ${photoToFix.id}`)
  console.log(`   File: ${oldFilename}`)
  console.log(`   Label attuale: ${photoToFix.label}`)
  console.log(`   Creata: ${new Date(photoToFix.created_at).toLocaleString('it-IT')}`)

  if (photoToFix.label === 'valid') {
    console.log('\n✅ La foto è già marcata come "valid", nessuna correzione necessaria!')
    process.exit(0)
  }

  console.log(`\n🔧 Correzione in corso...`)

  // Step 1: Update database label
  console.log('   1. Aggiornamento label nel database...')
  const { error: updateError } = await supabase
    .from('training_photos')
    .update({ label: 'valid' })
    .eq('id', photoToFix.id)

  if (updateError) {
    console.error('   ❌ Errore aggiornamento database:', updateError.message)
    process.exit(1)
  }
  console.log('   ✅ Database aggiornato!')

  // Step 2: Rename file in storage (if it starts with "invalid_")
  if (oldFilename.startsWith('invalid_')) {
    console.log('   2. Rinominazione file nello storage...')

    const newFilename = oldFilename.replace('invalid_', 'valid_')
    const bucketName = 'training-dataset'

    // Download the file
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from(bucketName)
      .download(oldFilename)

    if (downloadError) {
      console.error('   ⚠️  Errore download file:', downloadError.message)
      console.log('   ⚠️  Label aggiornato nel DB ma file non rinominato')
    } else {
      // Upload with new name
      const { error: uploadError } = await supabase
        .storage
        .from(bucketName)
        .upload(newFilename, fileData, {
          contentType: 'image/jpeg',
          upsert: false
        })

      if (uploadError) {
        console.error('   ⚠️  Errore upload nuovo file:', uploadError.message)
        console.log('   ⚠️  Label aggiornato nel DB ma file non rinominato')
      } else {
        // Delete old file
        const { error: deleteError } = await supabase
          .storage
          .from(bucketName)
          .remove([oldFilename])

        if (deleteError) {
          console.error('   ⚠️  Errore eliminazione vecchio file:', deleteError.message)
          console.log('   ⚠️  Nuovo file creato ma vecchio non eliminato')
        }

        // Update image_url in database
        const oldPath = photoToFix.image_url
        const newPath = oldPath.replace(oldFilename, newFilename)

        const { error: urlUpdateError } = await supabase
          .from('training_photos')
          .update({ image_url: newPath })
          .eq('id', photoToFix.id)

        if (urlUpdateError) {
          console.error('   ⚠️  Errore aggiornamento URL:', urlUpdateError.message)
        } else {
          console.log('   ✅ File rinominato in storage!')
          console.log(`      ${oldFilename} → ${newFilename}`)
        }
      }
    }
  } else {
    console.log('   2. File già con nome corretto, skip rinomina')
  }

  console.log(`\n✅ COMPLETATO!`)
  console.log(`   La terza foto è ora marcata come VALID`)
  console.log(`   Controlla la dashboard per verificare il conteggio aggiornato.`)
}

fixPhotoLabel().catch(err => {
  console.error('❌ Errore:', err)
  process.exit(1)
})

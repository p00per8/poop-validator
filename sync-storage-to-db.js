#!/usr/bin/env node

require('dotenv').config({ path: './training-app/.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Credenziali Supabase mancanti')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function syncStorageToDb() {
  console.log('🔄 Sincronizzazione Storage → Database')
  console.log('======================================\n')

  // 1. Get all files from Storage
  console.log('📦 Lettura file da Supabase Storage...')
  const { data: files, error: storageError } = await supabase
    .storage
    .from('training-dataset')
    .list('', { limit: 1000 })

  if (storageError) {
    console.error('❌ Errore Storage:', storageError.message)
    process.exit(1)
  }

  console.log(`   Trovati ${files.length} file in Storage\n`)

  // Create a map of filenames in storage
  const storageFiles = new Map()
  files.forEach(file => {
    storageFiles.set(file.name, file)
  })

  // 2. Get all photos from Database
  console.log('💾 Lettura foto dal Database...')
  const { data: photos, error: dbError } = await supabase
    .from('training_photos')
    .select('id, image_url, label')

  if (dbError) {
    console.error('❌ Errore Database:', dbError.message)
    process.exit(1)
  }

  console.log(`   Trovate ${photos.length} foto nel Database\n`)

  let updated = 0
  let skipped = 0
  let notFound = 0

  console.log('🔧 Sincronizzazione in corso...\n')

  for (const photo of photos) {
    const currentFilename = photo.image_url.split('/').pop()

    // Check if file exists in storage
    if (!storageFiles.has(currentFilename)) {
      // File in DB doesn't exist in Storage, try to find it
      // Maybe it was renamed?

      // Extract timestamp from current filename
      const timestampMatch = currentFilename.match(/(\d{13})/)

      if (!timestampMatch) {
        console.log(`⚠️  [SKIP] ${currentFilename} - Formato nome non valido`)
        notFound++
        continue
      }

      const timestamp = timestampMatch[1]

      // Find files with same timestamp in storage
      const matchingFiles = Array.from(storageFiles.keys()).filter(name =>
        name.includes(timestamp)
      )

      if (matchingFiles.length === 0) {
        console.log(`⚠️  [NOT FOUND] ${currentFilename} - File non trovato in Storage`)
        notFound++
        continue
      }

      if (matchingFiles.length > 1) {
        console.log(`⚠️  [AMBIGUOUS] ${currentFilename} - Trovati ${matchingFiles.length} file con stesso timestamp`)
        console.log(`      Candidati: ${matchingFiles.join(', ')}`)
        notFound++
        continue
      }

      // Found exactly one match!
      const newFilename = matchingFiles[0]
      const newLabel = newFilename.startsWith('valid_') ? 'valid' :
                       newFilename.startsWith('invalid_') ? 'invalid' :
                       photo.label

      console.log(`🔧 [UPDATE] ${currentFilename} → ${newFilename}`)
      console.log(`   Label: ${photo.label} → ${newLabel}`)

      // Update image_url and label in database
      const newUrl = photo.image_url.replace(currentFilename, newFilename)

      const { error: updateError } = await supabase
        .from('training_photos')
        .update({
          image_url: newUrl,
          label: newLabel
        })
        .eq('id', photo.id)

      if (updateError) {
        console.error(`   ❌ Errore: ${updateError.message}`)
      } else {
        console.log(`   ✅ Aggiornato`)
        updated++
      }

    } else {
      // File exists with same name, check label
      const labelFromFilename = currentFilename.startsWith('valid_') ? 'valid' :
                                currentFilename.startsWith('invalid_') ? 'invalid' :
                                null

      if (labelFromFilename && labelFromFilename !== photo.label) {
        console.log(`🔧 [UPDATE LABEL] ${currentFilename}`)
        console.log(`   Label: ${photo.label} → ${labelFromFilename}`)

        const { error: updateError } = await supabase
          .from('training_photos')
          .update({ label: labelFromFilename })
          .eq('id', photo.id)

        if (updateError) {
          console.error(`   ❌ Errore: ${updateError.message}`)
        } else {
          console.log(`   ✅ Aggiornato`)
          updated++
        }
      } else {
        skipped++
      }
    }
  }

  console.log('\n======================================')
  console.log('📊 RIEPILOGO:')
  console.log(`   ✅ Aggiornati: ${updated}`)
  console.log(`   ⏭️  Già sincronizzati: ${skipped}`)
  console.log(`   ⚠️  Non trovati: ${notFound}`)
  console.log(`   📝 Totale: ${photos.length}`)
  console.log('======================================\n')

  if (updated > 0) {
    console.log('✨ Sincronizzazione completata!')
    console.log('   Ricarica index e dashboard per vedere i conteggi aggiornati.')
  } else if (notFound > 0) {
    console.log('⚠️  Alcune foto non sono state trovate in Storage.')
    console.log('   Verifica manualmente i file mancanti.')
  } else {
    console.log('✨ Tutto già sincronizzato!')
  }
}

syncStorageToDb().catch(err => {
  console.error('❌ Errore:', err.message)
  process.exit(1)
})

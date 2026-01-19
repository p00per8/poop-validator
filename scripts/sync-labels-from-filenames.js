#!/usr/bin/env node

/**
 * Script per sincronizzare i label nel database basandosi sui filename
 * Utile dopo rinominazioni manuali in Supabase Storage
 */

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials')
  console.error('   Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

function getLabelFromFilename(imageUrl) {
  if (!imageUrl) return null
  const filename = imageUrl.split('/').pop()
  if (filename.startsWith('valid_')) return 'valid'
  if (filename.startsWith('invalid_')) return 'invalid'
  return null
}

async function syncLabels() {
  console.log('🔄 Sincronizzazione Label da Filename')
  console.log('=====================================\n')

  try {
    // Fetch all photos
    const { data: photos, error } = await supabase
      .from('training_photos')
      .select('id, label, image_url')

    if (error) {
      console.error('❌ Errore caricamento foto:', error.message)
      process.exit(1)
    }

    if (!photos || photos.length === 0) {
      console.log('ℹ️  Nessuna foto trovata nel database')
      process.exit(0)
    }

    console.log(`📊 Trovate ${photos.length} foto nel database\n`)

    let syncCount = 0
    let skipCount = 0
    let errorCount = 0

    for (const photo of photos) {
      const filename = photo.image_url.split('/').pop()
      const labelFromFilename = getLabelFromFilename(photo.image_url)
      const currentLabel = photo.label

      if (!labelFromFilename) {
        console.log(`⚠️  [SKIP] ${filename} - Nome file non inizia con valid_ o invalid_`)
        skipCount++
        continue
      }

      if (labelFromFilename === currentLabel) {
        // Already in sync
        skipCount++
        continue
      }

      // Update needed
      console.log(`🔧 [UPDATE] ${filename}`)
      console.log(`   DB Label: ${currentLabel} → ${labelFromFilename}`)

      const { error: updateError } = await supabase
        .from('training_photos')
        .update({ label: labelFromFilename })
        .eq('id', photo.id)

      if (updateError) {
        console.error(`   ❌ Errore: ${updateError.message}`)
        errorCount++
      } else {
        console.log(`   ✅ Aggiornato`)
        syncCount++
      }
    }

    console.log('\n' + '='.repeat(50))
    console.log('📊 RIEPILOGO:')
    console.log(`   ✅ Aggiornati: ${syncCount}`)
    console.log(`   ⏭️  Già sincronizzati: ${skipCount}`)
    if (errorCount > 0) {
      console.log(`   ❌ Errori: ${errorCount}`)
    }
    console.log(`   📝 Totale: ${photos.length}`)
    console.log('='.repeat(50))

    if (syncCount > 0) {
      console.log('\n✨ Sincronizzazione completata!')
      console.log('   Ricarica index e dashboard per vedere i conteggi aggiornati.')
    } else {
      console.log('\n✨ Tutti i label erano già sincronizzati!')
    }

  } catch (error) {
    console.error('❌ Errore:', error.message)
    process.exit(1)
  }
}

syncLabels()

#!/usr/bin/env node

require('dotenv').config({ path: './training-app/.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Credenziali Supabase mancanti in training-app/.env.local')
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

async function sync() {
  console.log('🔄 Sincronizzazione Label da Filename')
  console.log('=====================================\n')

  const { data: photos, error } = await supabase
    .from('training_photos')
    .select('id, label, image_url')

  if (error) {
    console.error('❌ Errore:', error.message)
    process.exit(1)
  }

  if (!photos || photos.length === 0) {
    console.log('ℹ️  Nessuna foto nel database')
    process.exit(0)
  }

  console.log(`📊 Trovate ${photos.length} foto\n`)

  let synced = 0
  let skipped = 0

  for (const photo of photos) {
    const labelFromFilename = getLabelFromFilename(photo.image_url)

    if (!labelFromFilename) {
      skipped++
      continue
    }

    if (labelFromFilename === photo.label) {
      skipped++
      continue
    }

    const filename = photo.image_url.split('/').pop()
    console.log(`🔧 ${filename}: ${photo.label} → ${labelFromFilename}`)

    const { error: updateError } = await supabase
      .from('training_photos')
      .update({ label: labelFromFilename })
      .eq('id', photo.id)

    if (updateError) {
      console.error(`   ❌ Errore: ${updateError.message}`)
    } else {
      console.log(`   ✅ Aggiornato`)
      synced++
    }
  }

  console.log('\n=====================================')
  console.log('📊 RIEPILOGO:')
  console.log(`   ✅ Aggiornati: ${synced}`)
  console.log(`   ⏭️  Già sincronizzati: ${skipped}`)
  console.log(`   📝 Totale: ${photos.length}`)
  console.log('=====================================\n')

  if (synced > 0) {
    console.log('✨ Sincronizzazione completata!')
  } else {
    console.log('✨ Tutti i label erano già sincronizzati!')
  }
}

sync().catch(err => {
  console.error('❌ Errore:', err.message)
  process.exit(1)
})

#!/usr/bin/env node

require('dotenv').config({ path: './training-app/.env.local' })
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

function flattenObject(obj, prefix = '') {
  const flattened = {}

  for (const key in obj) {
    const value = obj[key]
    const newKey = prefix ? `${prefix}.${key}` : key

    if (value === null || value === undefined) {
      continue
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === 'object' && item !== null) {
          Object.assign(flattened, flattenObject(item, `${newKey}[${index}]`))
        } else {
          flattened[`${newKey}[${index}]`] = item
        }
      })
    } else if (typeof value === 'object') {
      Object.assign(flattened, flattenObject(value, newKey))
    } else {
      flattened[newKey] = value
    }
  }

  return flattened
}

async function dumpFeatures() {
  console.log('🔍 Recupero features dal database...\n')

  // Get one photo with features
  const { data: photos, error } = await supabase
    .from('training_photos')
    .select('id, image_url, label, features')
    .not('features', 'is', null)
    .limit(5)

  if (error) {
    console.error('❌ Errore:', error.message)
    process.exit(1)
  }

  if (!photos || photos.length === 0) {
    console.log('❌ Nessuna foto con features trovata nel database')
    console.log('\nℹ️  Le foto potrebbero non avere features estratte ancora.')
    console.log('   Hai già chiamato il Cloud Run service per estrarre le features?')
    process.exit(1)
  }

  console.log(`✅ Trovate ${photos.length} foto con features\n`)

  // Analyze first photo
  const photo = photos[0]
  const flattened = flattenObject(photo.features)
  const featureNames = Object.keys(flattened)

  console.log('📊 SAMPLE PHOTO:')
  console.log(`   File: ${photo.image_url.split('/').pop()}`)
  console.log(`   Label: ${photo.label}`)
  console.log(`   Total features: ${featureNames.length}`)
  console.log('')

  // Save complete dump to file
  const dumpData = {
    total_features: featureNames.length,
    feature_names: featureNames,
    sample_values: flattened,
    all_photos: photos.map(p => ({
      id: p.id,
      filename: p.image_url.split('/').pop(),
      label: p.label,
      feature_count: Object.keys(flattenObject(p.features)).length
    }))
  }

  fs.writeFileSync('features-dump.json', JSON.stringify(dumpData, null, 2))
  console.log('💾 Dump completo salvato in: features-dump.json\n')

  // Show first 50 feature names
  console.log('📋 PRIMI 50 NOMI FEATURES:')
  featureNames.slice(0, 50).forEach((name, i) => {
    const value = flattened[name]
    const valueStr = typeof value === 'number' ? value.toFixed(4) : value
    console.log(`   ${String(i + 1).padStart(3)}. ${name.padEnd(50)} = ${valueStr}`)
  })

  if (featureNames.length > 50) {
    console.log(`   ... e altre ${featureNames.length - 50} features`)
  }

  // Analyze patterns
  console.log('\n\n🔬 ANALISI PATTERN:')

  const patterns = {
    color: featureNames.filter(n => n.toLowerCase().match(/color|rgb|hsv|hue|sat|bright|red|green|blue/)),
    histogram: featureNames.filter(n => n.toLowerCase().match(/hist|bin/)),
    texture: featureNames.filter(n => n.toLowerCase().match(/text|glcm|lbp|gabor|contrast|homog/)),
    edge: featureNames.filter(n => n.toLowerCase().match(/edge|grad|sobel|canny|lapl/)),
    shape: featureNames.filter(n => n.toLowerCase().match(/shape|perim|area|circ|solid|bbox/)),
    moment: featureNames.filter(n => n.toLowerCase().match(/moment|hu_|mu_/)),
    spatial: featureNames.filter(n => n.toLowerCase().match(/spatial|zone|quad|region/)),
    frequency: featureNames.filter(n => n.toLowerCase().match(/fft|freq|fourier|spect/)),
    stats: featureNames.filter(n => n.toLowerCase().match(/mean|std|var|median|min|max|range|skew|kurt|entropy/))
  }

  Object.entries(patterns).forEach(([category, names]) => {
    if (names.length > 0) {
      console.log(`\n   ${category.toUpperCase()}: ${names.length} features`)
      console.log(`   Examples: ${names.slice(0, 3).join(', ')}`)
    }
  })

  const uncategorized = featureNames.filter(name => {
    const lower = name.toLowerCase()
    return !Object.values(patterns).some(arr => arr.includes(name))
  })

  if (uncategorized.length > 0) {
    console.log(`\n   UNCATEGORIZED: ${uncategorized.length} features`)
    console.log(`   Examples: ${uncategorized.slice(0, 10).join(', ')}`)
  }

  // Analyze prefixes
  console.log('\n\n🏷️  PREFISSI COMUNI:')
  const prefixes = {}
  featureNames.forEach(name => {
    const parts = name.split('.')
    const prefix = parts[0]
    prefixes[prefix] = (prefixes[prefix] || 0) + 1
  })

  Object.entries(prefixes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([prefix, count]) => {
      console.log(`   ${prefix.padEnd(30)} : ${count} features`)
    })

  console.log('\n\n✅ Analisi completata!')
  console.log('📄 Controlla features-dump.json per i dettagli completi')
}

dumpFeatures().catch(console.error)

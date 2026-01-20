#!/usr/bin/env node

require('dotenv').config({ path: './training-app/.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

function flattenFeatures(obj, prefix = '') {
  let result = {}
  for (let key in obj) {
    const newKey = prefix ? `${prefix}.${key}` : key

    if (Array.isArray(obj[key])) {
      obj[key].forEach((value, idx) => {
        if (typeof value === 'number') {
          result[`${newKey}[${idx}]`] = value
        }
      })
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      Object.assign(result, flattenFeatures(obj[key], newKey))
    } else if (typeof obj[key] === 'number') {
      result[newKey] = obj[key]
    }
  }
  return result
}

async function analyzeFeatureNames() {
  console.log('🔍 Analisi Feature Names\n')

  const { data: photos, error } = await supabase
    .from('training_photos')
    .select('features')
    .not('features', 'is', null)
    .limit(1)

  if (error || !photos || photos.length === 0) {
    console.error('❌ Nessuna foto con features trovata')
    process.exit(1)
  }

  const flatFeatures = flattenFeatures(photos[0].features)
  const featureNames = Object.keys(flatFeatures)

  console.log(`📊 Totale features: ${featureNames.length}\n`)
  console.log('📝 Primi 100 nomi di feature:\n')

  featureNames.slice(0, 100).forEach((name, idx) => {
    console.log(`${idx + 1}. ${name}`)
  })

  console.log('\n\n🔎 Analisi Pattern:\n')

  // Analyze patterns
  const patterns = {
    color: featureNames.filter(n => n.includes('color') || n.includes('rgb') || n.includes('hsv')),
    hist: featureNames.filter(n => n.includes('hist') || n.includes('histogram')),
    texture: featureNames.filter(n => n.includes('texture') || n.includes('lbp') || n.includes('gabor')),
    edge: featureNames.filter(n => n.includes('edge') || n.includes('gradient')),
    shape: featureNames.filter(n => n.includes('shape') || n.includes('contour')),
    moments: featureNames.filter(n => n.includes('moment') || n.includes('hu_')),
    spatial: featureNames.filter(n => n.includes('spatial') || n.includes('zone')),
    frequency: featureNames.filter(n => n.includes('fft') || n.includes('frequency')),
    stats: featureNames.filter(n => n.includes('mean') || n.includes('std') || n.includes('variance'))
  }

  for (const [category, matches] of Object.entries(patterns)) {
    console.log(`${category}: ${matches.length} features`)
    if (matches.length > 0 && matches.length < 5) {
      console.log(`  → ${matches.join(', ')}`)
    }
  }

  console.log('\n\n📋 Sample di feature names unici:\n')
  const uniquePrefixes = new Set()
  featureNames.forEach(name => {
    const prefix = name.split(/[.\[\d]/)[0]
    uniquePrefixes.add(prefix)
  })

  Array.from(uniquePrefixes).sort().forEach(prefix => {
    console.log(`  - ${prefix}`)
  })
}

analyzeFeatureNames().catch(console.error)

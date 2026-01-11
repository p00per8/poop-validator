import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default function TrainingDashboard() {
  const router = useRouter()
  const [stats, setStats] = useState(null)
  const [insights, setInsights] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
  }, [])

  async function loadDashboardData() {
    try {
      const { data: photos, error } = await supabase
        .from('training_photos')
        .select('*')
        .not('features', 'is', null)

      if (error) throw error

      if (!photos || photos.length === 0) {
        setStats({ total: 0, valid: 0, invalid: 0 })
        setLoading(false)
        return
      }

      const validPhotos = photos.filter(p => p.label === 'valid')
      const invalidPhotos = photos.filter(p => p.label === 'invalid')

      setStats({
        total: photos.length,
        valid: validPhotos.length,
        invalid: invalidPhotos.length,
        storage_mb: (photos.reduce((sum, p) => sum + (p.file_size || 0), 0) / 1024 / 1024).toFixed(2)
      })

      if (validPhotos.length > 0 && invalidPhotos.length > 0) {
        const analysis = analyzeAndExplain(validPhotos, invalidPhotos)
        setInsights(analysis)
      }

      setLoading(false)
    } catch (error) {
      console.error('Error loading dashboard:', error)
      setLoading(false)
    }
  }

  function analyzeAndExplain(validPhotos, invalidPhotos) {
    // Estrai tutte le feature
    const allFeatureKeys = new Set()
    
    validPhotos.forEach(photo => {
      if (photo.features) {
        Object.keys(flattenFeatures(photo.features)).forEach(key => allFeatureKeys.add(key))
      }
    })
    
    invalidPhotos.forEach(photo => {
      if (photo.features) {
        Object.keys(flattenFeatures(photo.features)).forEach(key => allFeatureKeys.add(key))
      }
    })

    // Analizza ogni feature
    const featureStats = []

    allFeatureKeys.forEach(featureKey => {
      const validValues = validPhotos
        .map(p => getNestedValue(p.features, featureKey))
        .filter(v => v !== null && v !== undefined && typeof v === 'number')
      
      const invalidValues = invalidPhotos
        .map(p => getNestedValue(p.features, featureKey))
        .filter(v => v !== null && v !== undefined && typeof v === 'number')

      if (validValues.length === 0 || invalidValues.length === 0) return

      const validMean = average(validValues)
      const invalidMean = average(invalidValues)
      const validStd = standardDeviation(validValues)
      const invalidStd = standardDeviation(invalidValues)

      const meanDiff = Math.abs(validMean - invalidMean)
      const pooledStd = Math.sqrt((validStd ** 2 + invalidStd ** 2) / 2)
      const separationScore = pooledStd > 0 ? meanDiff / pooledStd : 0

      featureStats.push({
        name: featureKey,
        validMean,
        invalidMean,
        difference: validMean - invalidMean,
        separationScore,
        category: getFeatureCategory(featureKey)
      })
    })

    featureStats.sort((a, b) => b.separationScore - a.separationScore)

    // Genera insights in italiano semplice
    const topFeatures = featureStats.slice(0, 10)
    const humanInsights = generateHumanInsights(topFeatures, validPhotos.length, invalidPhotos.length)

    return {
      topFeatures: topFeatures,
      totalFeatures: featureStats.length,
      insights: humanInsights,
      byCategory: groupByCategory(featureStats)
    }
  }

  function generateHumanInsights(topFeatures, validCount, invalidCount) {
    const insights = []

    topFeatures.forEach((feature, idx) => {
      if (idx >= 5) return // Solo top 5

      const featureName = feature.name
      const isValidHigher = feature.difference > 0
      const diffPercent = Math.abs((feature.difference / (isValidHigher ? feature.invalidMean : feature.validMean)) * 100)

      let explanation = ''
      let icon = '🔍'
      let importance = 'normale'

      // Determina importanza
      if (feature.separationScore > 1.5) {
        importance = 'molto importante'
        icon = '⭐'
      } else if (feature.separationScore > 0.8) {
        importance = 'importante'
        icon = '💡'
      }

      // Spiega in base al tipo di feature
      if (featureName.includes('blur') || featureName.includes('sharpness')) {
        if (featureName.includes('blur') && isValidHigher) {
          explanation = `Le foto CORRETTE sono più sfocate del normale. Questo potrebbe indicare che le foto valide hanno meno dettagli netti.`
        } else if (featureName.includes('sharpness') && !isValidHigher) {
          explanation = `Le foto SBAGLIATE sono più nitide e dettagliate. Le foto corrette tendono ad essere meno definite.`
        } else {
          explanation = `La nitidezza delle foto è un fattore discriminante tra foto corrette e sbagliate.`
        }
      } else if (featureName.includes('brightness') || featureName.includes('mean')) {
        if (isValidHigher) {
          explanation = `Le foto CORRETTE sono generalmente più luminose. La luminosità media è del ${diffPercent.toFixed(0)}% più alta.`
        } else {
          explanation = `Le foto SBAGLIATE sono più luminose. Le foto corrette tendono ad essere più scure.`
        }
      } else if (featureName.includes('edge')) {
        if (isValidHigher) {
          explanation = `Le foto CORRETTE hanno più bordi e contorni definiti. Questo suggerisce maggiore complessità visiva.`
        } else {
          explanation = `Le foto SBAGLIATE hanno più bordi visibili. Le foto corrette sono più uniformi.`
        }
      } else if (featureName.includes('color') || featureName.includes('rgb')) {
        if (isValidHigher) {
          explanation = `Le foto CORRETTE hanno tonalità di colore differenti. I valori cromatici sono mediamente più alti.`
        } else {
          explanation = `Le foto SBAGLIATE hanno colori più intensi in questa gamma. Le foto corrette usano tonalità diverse.`
        }
      } else if (featureName.includes('texture') || featureName.includes('glcm') || featureName.includes('lbp')) {
        explanation = `La texture della superficie è diversa tra foto corrette e sbagliate. Questa è una caratteristica matematica della "grana" dell'immagine.`
      } else if (featureName.includes('contrast') || featureName.includes('std')) {
        if (isValidHigher) {
          explanation = `Le foto CORRETTE hanno più contrasto (differenza tra zone chiare e scure).`
        } else {
          explanation = `Le foto SBAGLIATE hanno più contrasto. Le foto corrette sono più uniformi.`
        }
      } else if (featureName.includes('gradient')) {
        explanation = `Le transizioni tra colori adiacenti sono diverse. Questo misura quanto "gradualmente" cambiano i colori.`
      } else {
        // Spiegazione generica
        if (isValidHigher) {
          explanation = `Questa caratteristica matematica è più alta nelle foto CORRETTE (${diffPercent.toFixed(0)}% in più).`
        } else {
          explanation = `Questa caratteristica matematica è più alta nelle foto SBAGLIATE (${diffPercent.toFixed(0)}% in più).`
        }
      }

      insights.push({
        icon,
        importance,
        title: humanizeFeatureName(featureName),
        explanation,
        technicalName: featureName,
        validHigher: isValidHigher,
        difference: diffPercent.toFixed(0),
        score: feature.separationScore
      })
    })

    return insights
  }

  function humanizeFeatureName(name) {
    // Traduci nomi tecnici in italiano comprensibile
    const translations = {
      'blur': 'Sfocatura',
      'sharpness': 'Nitidezza',
      'brightness': 'Luminosità',
      'contrast': 'Contrasto',
      'edge': 'Bordi',
      'color': 'Colore',
      'texture': 'Texture',
      'gradient': 'Gradiente',
      'rgb': 'RGB',
      'mean': 'Media',
      'std': 'Variazione',
      'glcm': 'Pattern Texture',
      'lbp': 'Pattern Locale',
      'spatial': 'Distribuzione Spaziale',
      'hist': 'Distribuzione',
      'zone': 'Zona',
      'density': 'Densità'
    }

    let humanName = name
    for (const [tech, human] of Object.entries(translations)) {
      if (name.toLowerCase().includes(tech)) {
        humanName = human
        break
      }
    }

    return humanName
  }

  function flattenFeatures(obj, prefix = '') {
    let result = {}
    for (let key in obj) {
      const newKey = prefix ? `${prefix}.${key}` : key
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        Object.assign(result, flattenFeatures(obj[key], newKey))
      } else if (typeof obj[key] === 'number') {
        result[newKey] = obj[key]
      }
    }
    return result
  }

  function getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj)
  }

  function average(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length
  }

  function standardDeviation(arr) {
    const avg = average(arr)
    const squareDiffs = arr.map(value => Math.pow(value - avg, 2))
    return Math.sqrt(average(squareDiffs))
  }

  function getFeatureCategory(name) {
    if (name.includes('color') || name.includes('rgb') || name.includes('hsv')) return 'Colore'
    if (name.includes('texture') || name.includes('glcm') || name.includes('lbp')) return 'Texture'
    if (name.includes('edge') || name.includes('gradient') || name.includes('contour')) return 'Bordi'
    if (name.includes('spatial') || name.includes('zone')) return 'Spaziale'
    return 'Altro'
  }

  function groupByCategory(features) {
    const groups = {}
    features.forEach(f => {
      const cat = f.category
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(f)
    })
    return groups
  }

  function PhotoAccordion() {
    const [allPhotos, setAllPhotos] = useState([])
    const [openPhoto, setOpenPhoto] = useState(null)

    useEffect(() => {
      loadPhotos()
    }, [])

    async function loadPhotos() {
      const { data, error } = await supabase
        .from('training_photos')
        .select('*')
        .not('features', 'is', null)
        .order('created_at', { ascending: false })

      if (data && !error) {
        setAllPhotos(data)
      }
    }

    function translateFeatureName(key) {
      // Traduzioni specifiche
      const translations = {
        // Color features
        'color_b_mean': 'Media Blu',
        'color_g_mean': 'Media Verde',
        'color_r_mean': 'Media Rosso',
        'color_b_std': 'Variazione Blu',
        'color_g_std': 'Variazione Verde',
        'color_r_std': 'Variazione Rosso',
        'color_b_skewness': 'Asimmetria Blu',
        'color_g_skewness': 'Asimmetria Verde',
        'color_r_skewness': 'Asimmetria Rosso',
        'color_b_kurtosis': 'Picco Blu',
        'color_g_kurtosis': 'Picco Verde',
        'color_r_kurtosis': 'Picco Rosso',
        
        // Spatial features
        'spatial_brightness': 'Luminosità Zona',
        'spatial_std': 'Variazione Zona',
        
        // Statistical features
        'stat_mean': 'Media Generale',
        'stat_std': 'Deviazione Standard',
        'stat_variance': 'Varianza',
        'stat_min': 'Valore Minimo',
        'stat_max': 'Valore Massimo',
        'stat_range': 'Intervallo',
        'stat_median': 'Mediana',
        'stat_skewness': 'Asimmetria',
        'stat_kurtosis': 'Curtosi',
        'stat_entropy': 'Entropia',
        'stat_laplacian_var': 'Nitidezza (Laplaciano)',
        'stat_rms_contrast': 'Contrasto RMS',
        'stat_michelson_contrast': 'Contrasto Michelson',
        'stat_percentile_25': '25° Percentile',
        'stat_percentile_75': '75° Percentile',
        
        // Edge features
        'edge_density_global': 'Densità Bordi Globale',
        'edge_density': 'Densità Bordi',
        'edge_orientation': 'Orientamento Bordi',
        
        // Gradient features
        'gradient_mean': 'Gradiente Medio',
        'gradient_std': 'Gradiente Variazione',
        'gradient_max': 'Gradiente Massimo',
        'gradient_min': 'Gradiente Minimo',
        'gradient_median': 'Gradiente Mediano',
        
        // Contour features
        'contour_area': 'Area Contorno',
        'contour_perimeter': 'Perimetro',
        'contour_circularity': 'Circolarità',
        'contour_bbox_aspect_ratio': 'Rapporto Aspetto',
        'contour_bbox_extent': 'Estensione Box',
        'contour_solidity': 'Solidità',
        'contour_hu_moment': 'Momento Hu',
        'contour_count': 'Numero Contorni',
        
        // FFT features
        'fft_magnitude_mean': 'Frequenza Media',
        'fft_magnitude_std': 'Frequenza Variazione',
        'fft_magnitude_max': 'Frequenza Massima',
        'fft_energy': 'Energia Frequenza',
        'fft_entropy': 'Entropia Frequenza',
        
        // GLCM features
        'glcm_contrast': 'Contrasto Texture',
        'glcm_dissimilarity': 'Dissimilarità Texture',
        'glcm_homogeneity': 'Omogeneità Texture',
        'glcm_energy': 'Energia Texture',
        'glcm_correlation': 'Correlazione Texture',
        
        // LBP features
        'lbp_hist': 'Pattern Locale',
        
        // Gabor features
        'gabor': 'Filtro Gabor'
      }
      
      // Check for exact matches first
      if (translations[key]) {
        return `${translations[key]} (${key})`
      }
      
      // Pattern matching for complex keys
      for (const [pattern, translation] of Object.entries(translations)) {
        if (key.includes(pattern)) {
          // Extract additional info (like zone numbers, bin numbers, angles)
          const parts = key.split('_')
          let extra = ''
          
          if (key.includes('zone_')) {
            const zoneMatch = key.match(/zone_(\d+)_(\d+)/)
            if (zoneMatch) extra = ` Z${zoneMatch[1]}${zoneMatch[2]}`
          }
          
          if (key.includes('bin_')) {
            const binMatch = key.match(/bin_(\d+)/)
            if (binMatch) extra = ` Bin${binMatch[1]}`
          }
          
          if (key.includes('angle_')) {
            const angleMatch = key.match(/angle_(\d+)/)
            if (angleMatch) {
              const angleDeg = angleMatch[1] === '0' ? '0°' : 
                              angleMatch[1] === '1' ? '45°' : 
                              angleMatch[1] === '2' ? '90°' : '135°'
              extra = ` ${angleDeg}`
            }
          }
          
          if (key.includes('_q') && !key.includes('_mean')) {
            const qMatch = key.match(/_q(\d+)/)
            if (qMatch) extra = ` Q${qMatch[1]}`
          }
          
          if (key.includes('_f') && key.includes('_o')) {
            const fMatch = key.match(/_f(\d+)/)
            const oMatch = key.match(/_o(\d+)/)
            if (fMatch && oMatch) extra = ` F${fMatch[1]}O${oMatch[1]}`
          }
          
          return `${translation}${extra} (${key})`
        }
      }
      
      // Fallback: just clean up the key name
      return key
        .replace(/_/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ') + ` (${key})`
    }

    function formatFeatureValue(value) {
      if (typeof value === 'number') {
        return value.toFixed(3)
      }
      if (typeof value === 'boolean') {
        return value ? '✓ Sì' : '✗ No'
      }
      if (Array.isArray(value)) {
        return value.join(', ')
      }
      return String(value)
    }

    function getFeatureCount(features) {
      const flattened = flattenFeatures(features)
      return Object.keys(flattened).length
    }

    function categorizeFeatures(features) {
      const flattened = flattenFeatures(features)
      const categories = {
        'Colore': [],
        'Texture': [],
        'Bordi': [],
        'Spaziale': [],
        'Statistiche': [],
        'Altro': []
      }

      Object.entries(flattened).forEach(([key, value]) => {
        let category = 'Altro'
        
        if (key.includes('color') || key.includes('rgb') || key.includes('hsv')) {
          category = 'Colore'
        } else if (key.includes('texture') || key.includes('glcm') || key.includes('lbp') || key.includes('gabor')) {
          category = 'Texture'
        } else if (key.includes('edge') || key.includes('gradient') || key.includes('contour')) {
          category = 'Bordi'
        } else if (key.includes('spatial') || key.includes('zone')) {
          category = 'Spaziale'
        } else if (key.includes('stat') || key.includes('mean') || key.includes('std')) {
          category = 'Statistiche'
        }

        categories[category].push({ key, value })
      })

      return categories
    }

    return (
      <div className="space-y-3">
        {allPhotos.map((photo, idx) => {
          const isOpen = openPhoto === photo.id
          const featureCount = getFeatureCount(photo.features)
          const categorized = categorizeFeatures(photo.features)
          const uploadDate = new Date(photo.uploaded_at).toLocaleDateString('it-IT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })

          return (
            <div key={photo.id} className="border-2 border-gray-200 rounded-xl overflow-hidden hover:border-indigo-300 transition">
              <button
                onClick={() => setOpenPhoto(isOpen ? null : photo.id)}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${
                    photo.label === 'valid' 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {photo.label === 'valid' ? '✓' : '✗'}
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-gray-900">
                      Foto #{idx + 1} - {photo.label === 'valid' ? 'CORRETTA' : 'SBAGLIATA'}
                    </div>
                    <div className="text-sm text-gray-500">
                      {featureCount} caratteristiche • Caricata il {uploadDate}
                    </div>
                  </div>
                </div>
                <div className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {isOpen && (
                <div className="border-t-2 border-gray-200 bg-gray-50 p-6">
                  {/* Metadata */}
                  <div className="bg-white rounded-lg p-4 mb-4 border border-gray-200">
                    <h4 className="font-bold text-gray-900 mb-3">ℹ️ Informazioni</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-gray-600">ID:</span>{' '}
                        <span className="font-mono text-xs">{photo.id.slice(0, 8)}...</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Dimensione:</span>{' '}
                        <span className="font-medium">{(photo.file_size / 1024).toFixed(1)} KB</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Caricata da:</span>{' '}
                        <span className="font-medium">{photo.uploaded_by || 'Sconosciuto'}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Usata nel training:</span>{' '}
                        <span className="font-medium">{photo.used_in_training ? '✓ Sì' : '✗ No'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Features by Category */}
                  <div className="space-y-4">
                    {Object.entries(categorized).map(([category, features]) => {
                      if (features.length === 0) return null
                      
                      return (
                        <div key={category} className="bg-white rounded-lg p-4 border border-gray-200">
                          <h4 className="font-bold text-gray-900 mb-3">
                            {category === 'Colore' && '🎨 '}
                            {category === 'Texture' && '🔲 '}
                            {category === 'Bordi' && '📐 '}
                            {category === 'Spaziale' && '🗺️ '}
                            {category === 'Statistiche' && '📊 '}
                            {category === 'Altro' && '📋 '}
                            {category} ({features.length})
                          </h4>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {features.slice(0, 20).map(({ key, value }) => (
                              <div key={key} className="flex justify-between items-center bg-gray-50 rounded px-3 py-2">
                                <span className="text-xs text-gray-600 truncate mr-2">{translateFeatureName(key)}</span>
                                <span className="text-sm font-mono font-bold text-gray-900">
                                  {formatFeatureValue(value)}
                                </span>
                              </div>
                            ))}
                          </div>
                          
                          {features.length > 20 && (
                            <div className="mt-2 text-xs text-gray-500 text-center">
                              ... e altre {features.length - 20} caratteristiche
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {allPhotos.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <div className="text-5xl mb-4">📭</div>
            <p>Nessuna foto con features estratte</p>
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Sto analizzando le foto...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">🧠 Cosa Ha Imparato l'AI</h1>
            <p className="text-gray-600 text-lg">Scopri quali caratteristiche distinguono le foto corrette da quelle sbagliate</p>
          </div>
          <button
            onClick={() => router.push('/training')}
            className="px-6 py-3 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 transition font-medium shadow-sm"
          >
            ← Torna al Training
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-2xl shadow-lg border-2 border-gray-100 p-6">
            <div className="text-sm text-gray-500 mb-2">📸 Foto Totali</div>
            <div className="text-4xl font-bold text-gray-900">{stats?.total || 0}</div>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl shadow-lg border-2 border-green-200 p-6">
            <div className="text-sm text-green-700 font-medium mb-2">✅ Foto Corrette</div>
            <div className="text-4xl font-bold text-green-700">{stats?.valid || 0}</div>
          </div>
          <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-2xl shadow-lg border-2 border-red-200 p-6">
            <div className="text-sm text-red-700 font-medium mb-2">❌ Foto Sbagliate</div>
            <div className="text-4xl font-bold text-red-700">{stats?.invalid || 0}</div>
          </div>
        </div>

        {!insights && (
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-8 text-center shadow-lg">
            <div className="text-5xl mb-4">⚠️</div>
            <p className="text-yellow-800 text-lg font-medium">
              Carica almeno 1 foto corretta e 1 foto sbagliata per vedere l'analisi
            </p>
          </div>
        )}

        {insights && (
          <>
            {/* Main Insights */}
            <div className="bg-white rounded-2xl shadow-xl border-2 border-indigo-100 p-8 mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                💡 Scoperte Principali
              </h2>
              
              <div className="space-y-6">
                {insights.insights.map((insight, idx) => (
                  <div key={idx} className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-6 border-2 border-purple-100">
                    <div className="flex items-start gap-4">
                      <div className="text-4xl">{insight.icon}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-xl font-bold text-gray-900">{insight.title}</h3>
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            insight.importance === 'molto importante' 
                              ? 'bg-green-200 text-green-800' 
                              : 'bg-blue-200 text-blue-800'
                          }`}>
                            {insight.importance.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-gray-700 text-lg leading-relaxed">{insight.explanation}</p>
                        <div className="mt-3 text-sm text-gray-500">
                          Differenza: <span className="font-bold">{insight.difference}%</span> • 
                          Affidabilità: <span className="font-bold">{(insight.score * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary Box */}
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl shadow-xl p-8 text-white mb-8">
              <h3 className="text-2xl font-bold mb-4">📊 In Sintesi</h3>
              <div className="text-lg space-y-3">
                <p>
                  ✨ Ho analizzato <span className="font-bold">{insights.totalFeatures}</span> caratteristiche matematiche diverse
                </p>
                <p>
                  🎯 Ho trovato <span className="font-bold">{insights.topFeatures.filter(f => f.separationScore > 1.5).length}</span> caratteristiche molto importanti che distinguono le foto
                </p>
                <p>
                  🧪 Queste caratteristiche sono state estratte automaticamente, senza che nessuno dicesse all'AI cosa cercare
                </p>
              </div>
            </div>

            {/* Metrics Dashboard */}
            <div className="bg-white rounded-2xl shadow-xl border-2 border-gray-200 p-8 mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">📈 Metriche e Statistiche</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border-2 border-blue-200">
                  <div className="text-sm text-blue-700 font-medium mb-1">Feature Totali</div>
                  <div className="text-3xl font-bold text-blue-900">{insights.totalFeatures}</div>
                  <div className="text-xs text-blue-600 mt-1">Caratteristiche estratte</div>
                </div>
                
                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border-2 border-green-200">
                  <div className="text-sm text-green-700 font-medium mb-1">Feature Forti</div>
                  <div className="text-3xl font-bold text-green-900">
                    {insights.topFeatures.filter(f => f.separationScore > 1.5).length}
                  </div>
                  <div className="text-xs text-green-600 mt-1">Score {'>'} 1.5</div>
                </div>
                
                <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl p-4 border-2 border-yellow-200">
                  <div className="text-sm text-yellow-700 font-medium mb-1">Feature Moderate</div>
                  <div className="text-3xl font-bold text-yellow-900">
                    {insights.topFeatures.filter(f => f.separationScore > 0.8 && f.separationScore <= 1.5).length}
                  </div>
                  <div className="text-xs text-yellow-600 mt-1">Score 0.8-1.5</div>
                </div>
                
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border-2 border-purple-200">
                  <div className="text-sm text-purple-700 font-medium mb-1">Affidabilità Media</div>
                  <div className="text-3xl font-bold text-purple-900">
                    {(insights.topFeatures.slice(0, 5).reduce((acc, f) => acc + f.separationScore, 0) / 5).toFixed(1)}
                  </div>
                  <div className="text-xs text-purple-600 mt-1">Top 5 features</div>
                </div>
              </div>

              {/* Category Breakdown */}
              <div className="bg-gray-50 rounded-xl p-6">
                <h3 className="font-bold text-gray-900 mb-4">Distribuzione per Categoria</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(insights.byCategory).map(([category, features]) => {
                    const strongCount = features.filter(f => f.separationScore > 1.5).length
                    const percentage = ((strongCount / features.length) * 100).toFixed(0)
                    
                    return (
                      <div key={category} className="text-center">
                        <div className="text-2xl mb-2">
                          {category === 'Colore' && '🎨'}
                          {category === 'Texture' && '🔲'}
                          {category === 'Bordi' && '📐'}
                          {category === 'Spaziale' && '🗺️'}
                          {category === 'Altro' && '📊'}
                        </div>
                        <div className="font-bold text-gray-900">{category}</div>
                        <div className="text-sm text-gray-600">{features.length} features</div>
                        <div className="text-xs text-green-600 font-medium mt-1">
                          {strongCount} forti ({percentage}%)
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Per-Photo Accordion */}
            <div className="bg-white rounded-2xl shadow-xl border-2 border-gray-200 p-8 mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">📋 Dettaglio Foto per Foto</h2>
              <p className="text-gray-600 mb-6">
                Esplora le caratteristiche estratte da ogni singola foto
              </p>
              
              <PhotoAccordion />
            </div>

            {/* Technical Details (collapsed) */}
            <details className="bg-white rounded-2xl shadow-lg border-2 border-gray-200 p-6">
              <summary className="text-lg font-bold text-gray-900 cursor-pointer hover:text-indigo-600 transition">
                🔬 Dettagli Tecnici (per esperti)
              </summary>
              <div className="mt-6 space-y-4">
                {insights.topFeatures.slice(0, 10).map((feature, idx) => (
                  <div key={idx} className="border-l-4 border-indigo-500 pl-4 py-2">
                    <div className="font-mono text-sm text-gray-600">{feature.name}</div>
                    <div className="grid grid-cols-2 gap-4 mt-2 text-sm">
                      <div className="bg-green-50 rounded p-2">
                        <span className="text-green-600 font-medium">VALID: </span>
                        <span className="font-bold">{feature.validMean.toFixed(3)}</span>
                      </div>
                      <div className="bg-red-50 rounded p-2">
                        <span className="text-red-600 font-medium">INVALID: </span>
                        <span className="font-bold">{feature.invalidMean.toFixed(3)}</span>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Separation Score: {feature.separationScore.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  )
}
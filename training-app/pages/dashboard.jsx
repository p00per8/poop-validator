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
  const [featureAnalysis, setFeatureAnalysis] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
  }, [])

  async function loadDashboardData() {
    try {
      // Carica tutte le foto con features
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

      // Calcola statistiche base
      const validPhotos = photos.filter(p => p.label === 'valid')
      const invalidPhotos = photos.filter(p => p.label === 'invalid')

      const stats = {
        total: photos.length,
        valid: validPhotos.length,
        invalid: invalidPhotos.length,
        storage_mb: (photos.reduce((sum, p) => sum + (p.file_size || 0), 0) / 1024 / 1024).toFixed(2)
      }

      setStats(stats)

      // Analizza features
      if (validPhotos.length > 0 && invalidPhotos.length > 0) {
        const analysis = analyzeFeatures(validPhotos, invalidPhotos)
        setFeatureAnalysis(analysis)
      }

      setLoading(false)
    } catch (error) {
      console.error('Error loading dashboard:', error)
      setLoading(false)
    }
  }

  function analyzeFeatures(validPhotos, invalidPhotos) {
    // Estrai tutte le feature uniche
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

    // Calcola statistiche per ogni feature
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

      // Calcola "separation score" - quanto questa feature discrimina
      const meanDiff = Math.abs(validMean - invalidMean)
      const pooledStd = Math.sqrt((validStd ** 2 + invalidStd ** 2) / 2)
      const separationScore = pooledStd > 0 ? meanDiff / pooledStd : 0

      featureStats.push({
        name: featureKey,
        validMean,
        invalidMean,
        validStd,
        invalidStd,
        difference: validMean - invalidMean,
        separationScore,
        category: getFeatureCategory(featureKey)
      })
    })

    // Ordina per separation score (più discriminanti prima)
    featureStats.sort((a, b) => b.separationScore - a.separationScore)

    // Top discriminating features
    const topFeatures = featureStats.slice(0, 20)

    // Group by category
    const byCategory = {}
    featureStats.forEach(f => {
      if (!byCategory[f.category]) byCategory[f.category] = []
      byCategory[f.category].push(f)
    })

    return {
      allFeatures: featureStats,
      topFeatures,
      byCategory,
      totalFeatures: featureStats.length
    }
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

  function getFeatureCategory(featureName) {
    if (featureName.includes('color') || featureName.includes('rgb') || featureName.includes('hsv')) return 'Color'
    if (featureName.includes('glcm') || featureName.includes('lbp') || featureName.includes('gabor')) return 'Texture'
    if (featureName.includes('edge') || featureName.includes('contour') || featureName.includes('gradient')) return 'Shape & Edges'
    if (featureName.includes('spatial') || featureName.includes('fft')) return 'Spatial'
    if (featureName.includes('stat')) return 'Statistical'
    return 'Other'
  }

  function getSeparationColor(score) {
    if (score > 1.5) return 'bg-green-100 text-green-800'
    if (score > 0.8) return 'bg-yellow-100 text-yellow-800'
    return 'bg-gray-100 text-gray-600'
  }

  function getSeparationLabel(score) {
    if (score > 1.5) return 'Forte'
    if (score > 0.8) return 'Moderata'
    return 'Debole'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Caricamento dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">📊 Training Intelligence Dashboard</h1>
            <p className="text-gray-600 mt-1">Analisi automatica delle feature estratte</p>
          </div>
          <button
            onClick={() => router.push('/training')}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            ← Torna al Training
          </button>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="text-sm text-gray-600 mb-1">Foto Totali</div>
            <div className="text-3xl font-bold text-gray-900">{stats?.total || 0}</div>
          </div>
          <div className="bg-green-50 rounded-xl shadow-sm border border-green-200 p-6">
            <div className="text-sm text-green-600 mb-1">✅ Foto Valid</div>
            <div className="text-3xl font-bold text-green-700">{stats?.valid || 0}</div>
          </div>
          <div className="bg-red-50 rounded-xl shadow-sm border border-red-200 p-6">
            <div className="text-sm text-red-600 mb-1">❌ Foto Invalid</div>
            <div className="text-3xl font-bold text-red-700">{stats?.invalid || 0}</div>
          </div>
          <div className="bg-blue-50 rounded-xl shadow-sm border border-blue-200 p-6">
            <div className="text-sm text-blue-600 mb-1">🔍 Features Estratte</div>
            <div className="text-3xl font-bold text-blue-700">{featureAnalysis?.totalFeatures || 0}</div>
          </div>
        </div>

        {!featureAnalysis && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
            <p className="text-yellow-800">
              ⚠️ Carica almeno 1 foto valid e 1 foto invalid con features estratte per vedere l'analisi.
            </p>
          </div>
        )}

        {featureAnalysis && (
          <>
            {/* Top Discriminating Features */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                🎯 Top 20 Feature più Discriminanti
              </h2>
              <p className="text-gray-600 mb-6">
                Queste feature mostrano la differenza più marcata tra foto valid e invalid
              </p>
              
              <div className="space-y-3">
                {featureAnalysis.topFeatures.map((feature, idx) => (
                  <div key={feature.name} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="text-lg font-bold text-gray-400 w-8">#{idx + 1}</div>
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{feature.name}</div>
                          <div className="text-sm text-gray-500">{feature.category}</div>
                        </div>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-xs font-medium ${getSeparationColor(feature.separationScore)}`}>
                        {getSeparationLabel(feature.separationScore)} ({feature.separationScore.toFixed(2)})
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mt-3">
                      <div className="bg-green-50 rounded-lg p-3">
                        <div className="text-xs text-green-600 font-medium mb-1">✅ VALID</div>
                        <div className="text-sm">
                          <span className="font-bold text-green-700">{feature.validMean.toFixed(3)}</span>
                          <span className="text-green-600 ml-2">±{feature.validStd.toFixed(3)}</span>
                        </div>
                      </div>
                      <div className="bg-red-50 rounded-lg p-3">
                        <div className="text-xs text-red-600 font-medium mb-1">❌ INVALID</div>
                        <div className="text-sm">
                          <span className="font-bold text-red-700">{feature.invalidMean.toFixed(3)}</span>
                          <span className="text-red-600 ml-2">±{feature.invalidStd.toFixed(3)}</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Visual comparison bar */}
                    <div className="mt-3 relative h-8 bg-gray-100 rounded-lg overflow-hidden">
                      <div 
                        className="absolute top-0 left-0 h-full bg-green-500 opacity-50"
                        style={{ width: `${Math.min((feature.validMean / (feature.validMean + feature.invalidMean)) * 100, 100)}%` }}
                      ></div>
                      <div 
                        className="absolute top-0 right-0 h-full bg-red-500 opacity-50"
                        style={{ width: `${Math.min((feature.invalidMean / (feature.validMean + feature.invalidMean)) * 100, 100)}%` }}
                      ></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs font-medium text-gray-700">
                          Δ = {Math.abs(feature.difference).toFixed(3)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Features by Category */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                📂 Feature per Categoria
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(featureAnalysis.byCategory).map(([category, features]) => {
                  const strongFeatures = features.filter(f => f.separationScore > 1.5).length
                  const moderateFeatures = features.filter(f => f.separationScore > 0.8 && f.separationScore <= 1.5).length
                  
                  return (
                    <div key={category} className="border border-gray-200 rounded-lg p-4">
                      <h3 className="font-bold text-gray-900 mb-2">{category}</h3>
                      <div className="text-2xl font-bold text-blue-600 mb-2">{features.length}</div>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-green-600">Forti</span>
                          <span className="font-medium">{strongFeatures}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-yellow-600">Moderate</span>
                          <span className="font-medium">{moderateFeatures}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Deboli</span>
                          <span className="font-medium">{features.length - strongFeatures - moderateFeatures}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Insights */}
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl shadow-sm border border-purple-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                💡 Pattern Scoperti Automaticamente
              </h2>
              
              <div className="space-y-3">
                {featureAnalysis.topFeatures.slice(0, 5).map((feature, idx) => (
                  <div key={idx} className="bg-white rounded-lg p-4 border border-purple-100">
                    <div className="flex items-start gap-3">
                      <div className="text-2xl">🔍</div>
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 mb-1">
                          {feature.name.split('.').pop().replace(/_/g, ' ')}
                        </div>
                        <p className="text-sm text-gray-600">
                          {feature.difference > 0 ? (
                            <span>Le foto <span className="font-bold text-green-600">valid</span> hanno valori <span className="font-bold">{Math.abs(feature.difference).toFixed(1)}x più alti</span> di questa caratteristica</span>
                          ) : (
                            <span>Le foto <span className="font-bold text-red-600">invalid</span> hanno valori <span className="font-bold">{Math.abs(feature.difference).toFixed(1)}x più alti</span> di questa caratteristica</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
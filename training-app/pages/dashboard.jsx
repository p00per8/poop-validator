import { useState, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { supabase } from '../../shared/lib/supabase'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
)

export default function Dashboard() {
  const router = useRouter()
  const [algorithmStats, setAlgorithmStats] = useState(null)
  const [trainingHistory, setTrainingHistory] = useState([])
  const [featuresAnalysis, setFeaturesAnalysis] = useState(null)
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)

  useEffect(() => {
    loadDashboardData()
    
    // Auto-refresh ogni 10 secondi se abilitato
    let interval
    if (autoRefresh) {
      interval = setInterval(() => {
        loadDashboardData()
      }, 10000)
    }
    
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [autoRefresh])

  async function loadDashboardData() {
    try {
      // Load current algorithm stats
      const { data: stats, error: statsError } = await supabase
        .from('algorithm_stats')
        .select('*')
        .single()

      if (statsError && statsError.code !== 'PGRST116') throw statsError

      // Load training history (last 10)
      const { data: history, error: historyError } = await supabase
        .from('training_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10)

      if (historyError) throw historyError

      // Load features analysis
      const analysis = await loadFeaturesAnalysis()

      setAlgorithmStats(stats || getDefaultStats())
      setTrainingHistory(history?.reverse() || []) // Reverse for chronological chart
      setFeaturesAnalysis(analysis)

    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadFeaturesAnalysis() {
    try {
      // Query foto con features
      const { data: photos, error } = await supabase
        .from('training_photos')
        .select('label, features')
        .not('features', 'is', null)
        .limit(200) // Sample di 200 foto per performance

      if (error) throw error

      if (!photos || photos.length === 0) {
        return null
      }

      // Analizza features per label
      const validPhotos = photos.filter(p => p.label === 'valid')
      const invalidPhotos = photos.filter(p => p.label === 'invalid')

      const analysis = {
        total_with_features: photos.length,
        valid_count: validPhotos.length,
        invalid_count: invalidPhotos.length,
        valid_patterns: analyzeFeatures(validPhotos),
        invalid_patterns: analyzeFeatures(invalidPhotos),
        key_differences: []
      }

      // Calcola differenze chiave
      if (validPhotos.length > 0 && invalidPhotos.length > 0) {
        analysis.key_differences = calculateKeyDifferences(
          analysis.valid_patterns,
          analysis.invalid_patterns
        )
      }

      return analysis

    } catch (error) {
      console.error('Error loading features analysis:', error)
      return null
    }
  }

  function analyzeFeatures(photos) {
    if (!photos || photos.length === 0) return null

    const patterns = {
      brightness: [],
      white_percentage: [],
      ceramic_detected_count: 0,
      toilet_visible_count: 0,
      too_dark_count: 0,
      too_bright_count: 0,
      motion_blur_count: 0,
      reflection_count: 0
    }

    photos.forEach(photo => {
      const features = photo.features
      if (!features) return

      // Visual features
      if (features.visual) {
        if (features.visual.brightness !== undefined) {
          patterns.brightness.push(features.visual.brightness)
        }
      }

      // Color features
      if (features.colors) {
        if (features.colors.white_percentage !== undefined) {
          patterns.white_percentage.push(features.colors.white_percentage)
        }
      }

      // Object detection
      if (features.objects) {
        if (features.objects.ceramic_detected) patterns.ceramic_detected_count++
        if (features.objects.toilet_visible) patterns.toilet_visible_count++
      }

      // Issues
      if (features.issues) {
        if (features.issues.too_dark) patterns.too_dark_count++
        if (features.issues.too_bright) patterns.too_bright_count++
        if (features.issues.motion_blur) patterns.motion_blur_count++
        if (features.issues.reflection) patterns.reflection_count++
      }
    })

    // Calcola medie
    const total = photos.length
    return {
      avg_brightness: average(patterns.brightness),
      avg_white_percentage: average(patterns.white_percentage),
      ceramic_detected_pct: (patterns.ceramic_detected_count / total) * 100,
      toilet_visible_pct: (patterns.toilet_visible_count / total) * 100,
      too_dark_pct: (patterns.too_dark_count / total) * 100,
      too_bright_pct: (patterns.too_bright_count / total) * 100,
      motion_blur_pct: (patterns.motion_blur_count / total) * 100,
      reflection_pct: (patterns.reflection_count / total) * 100
    }
  }

  function calculateKeyDifferences(validPatterns, invalidPatterns) {
    if (!validPatterns || !invalidPatterns) return []

    const differences = []

    // Brightness difference
    const brightnessDiff = validPatterns.avg_brightness - invalidPatterns.avg_brightness
    if (Math.abs(brightnessDiff) > 20) {
      differences.push({
        feature: 'Luminosità',
        valid: validPatterns.avg_brightness.toFixed(1),
        invalid: invalidPatterns.avg_brightness.toFixed(1),
        difference: brightnessDiff > 0 ? `+${brightnessDiff.toFixed(1)}` : brightnessDiff.toFixed(1),
        significance: 'high'
      })
    }

    // White percentage difference
    const whiteDiff = validPatterns.avg_white_percentage - invalidPatterns.avg_white_percentage
    if (Math.abs(whiteDiff) > 10) {
      differences.push({
        feature: 'Carta Igienica (%)',
        valid: validPatterns.avg_white_percentage.toFixed(1) + '%',
        invalid: invalidPatterns.avg_white_percentage.toFixed(1) + '%',
        difference: whiteDiff > 0 ? `+${whiteDiff.toFixed(1)}%` : `${whiteDiff.toFixed(1)}%`,
        significance: 'high'
      })
    }

    // Ceramic detection difference
    const ceramicDiff = validPatterns.ceramic_detected_pct - invalidPatterns.ceramic_detected_pct
    if (Math.abs(ceramicDiff) > 20) {
      differences.push({
        feature: 'Ceramica Rilevata',
        valid: `${validPatterns.ceramic_detected_pct.toFixed(0)}%`,
        invalid: `${invalidPatterns.ceramic_detected_pct.toFixed(0)}%`,
        difference: ceramicDiff > 0 ? `+${ceramicDiff.toFixed(0)}%` : `${ceramicDiff.toFixed(0)}%`,
        significance: 'high'
      })
    }

    return differences
  }

  function average(arr) {
    if (!arr || arr.length === 0) return 0
    return arr.reduce((a, b) => a + b, 0) / arr.length
  }

  function getDefaultStats() {
    return {
      current_level: 'BRONZO',
      current_accuracy: 0,
      total_trainings: 0,
      total_photos_analyzed: 0,
      last_training_date: null
    }
  }

  const getLevelColor = (level) => {
    switch (level) {
      case 'BRONZO': return 'text-amber-700'
      case 'ARGENTO': return 'text-gray-400'
      case 'ORO': return 'text-yellow-500'
      case 'DIAMANTE': return 'text-purple-600'
      default: return 'text-gray-600'
    }
  }

  const getLevelBadge = (level) => {
    switch (level) {
      case 'BRONZO': return '🥉'
      case 'ARGENTO': return '🥈'
      case 'ORO': return '🥇'
      case 'DIAMANTE': return '💎'
      default: return '📊'
    }
  }

  const chartData = trainingHistory.length > 0 ? {
    labels: trainingHistory.map(t => `#${t.training_number}`),
    datasets: [
      {
        label: 'Accuracy (%)',
        data: trainingHistory.map(t => t.accuracy),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4,
        fill: true
      },
      {
        label: 'Precision (%)',
        data: trainingHistory.map(t => t.precision_score),
        borderColor: 'rgb(16, 185, 129)',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        tension: 0.4,
        fill: true
      },
      {
        label: 'Recall (%)',
        data: trainingHistory.map(t => t.recall_score),
        borderColor: 'rgb(239, 68, 68)',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        tension: 0.4,
        fill: true
      }
    ]
  } : null

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top'
      },
      title: {
        display: true,
        text: 'Storico Performance Algoritmo'
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="loading-spinner mx-auto mb-4" />
          <p className="text-gray-600">Caricamento dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-20">
      <Head>
        <title>Dashboard - Training Stats</title>
      </Head>

      <div className="max-w-6xl mx-auto">
        {/* Header with Back Button */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/training-app')}
            className="inline-flex items-center text-blue-600 hover:text-blue-800 font-medium mb-4"
          >
            ← Torna alla raccolta dati
          </button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">
                📊 Dashboard Algoritmo
              </h1>
              <p className="text-gray-600">
                Statistiche e performance del modello di validazione
              </p>
            </div>
            
            {/* Auto-refresh toggle */}
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Auto-refresh:</span>
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  autoRefresh 
                    ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {autoRefresh ? '🟢 ON' : '⚪ OFF'}
              </button>
            </div>
          </div>
        </div>

        {/* Algorithm Level Card */}
        {algorithmStats && (
          <div className="card bg-gradient-to-r from-blue-50 to-indigo-50 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold mb-2">
                  Livello Algoritmo
                </h2>
                <div className={`text-6xl font-black ${getLevelColor(algorithmStats.current_level)}`}>
                  {getLevelBadge(algorithmStats.current_level)} {algorithmStats.current_level}
                </div>
              </div>
              <div className="text-right">
                <div className="text-4xl font-bold text-blue-600">
                  {algorithmStats.current_accuracy.toFixed(2)}%
                </div>
                <div className="text-sm text-gray-600">Accuracy Attuale</div>
              </div>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        {algorithmStats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="card">
              <div className="text-sm text-gray-600 mb-1">Training Totali</div>
              <div className="text-3xl font-bold text-blue-600">
                {algorithmStats.total_trainings}
              </div>
            </div>
            
            <div className="card">
              <div className="text-sm text-gray-600 mb-1">Foto Analizzate</div>
              <div className="text-3xl font-bold text-green-600">
                {algorithmStats.total_photos_analyzed.toLocaleString()}
              </div>
            </div>
            
            <div className="card">
              <div className="text-sm text-gray-600 mb-1">Ultimo Training</div>
              <div className="text-lg font-semibold text-gray-800">
                {algorithmStats.last_training_date ? 
                  new Date(algorithmStats.last_training_date).toLocaleDateString('it-IT', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })
                  : 'Nessun training'
                }
              </div>
            </div>
          </div>
        )}

        {/* Features Analysis Section */}
        {featuresAnalysis && (
          <>
            <div className="card mb-6">
              <h3 className="text-xl font-bold mb-4 flex items-center">
                🔍 Analisi Features Estratti
                <span className="ml-3 text-sm font-normal text-gray-500">
                  (Sample di {featuresAnalysis.total_with_features} foto)
                </span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* VALID Patterns */}
                <div className="border-l-4 border-green-500 pl-4">
                  <h4 className="font-bold text-green-700 mb-3 flex items-center">
                    ✅ FOTO VALID ({featuresAnalysis.valid_count} foto)
                  </h4>
                  
                  {featuresAnalysis.valid_patterns && (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">💡 Luminosità media:</span>
                        <span className="font-semibold">
                          {featuresAnalysis.valid_patterns.avg_brightness.toFixed(0)}/255
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">📄 Carta visibile:</span>
                        <span className="font-semibold">
                          {featuresAnalysis.valid_patterns.avg_white_percentage.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">🚽 Ceramica rilevata:</span>
                        <span className="font-semibold">
                          {featuresAnalysis.valid_patterns.ceramic_detected_pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">🎯 WC visibile:</span>
                        <span className="font-semibold">
                          {featuresAnalysis.valid_patterns.toilet_visible_pct.toFixed(0)}%
                        </span>
                      </div>
                      
                      {featuresAnalysis.valid_patterns.too_dark_pct > 0 && (
                        <div className="flex justify-between text-amber-600">
                          <span>⚠️ Troppo scure:</span>
                          <span className="font-semibold">
                            {featuresAnalysis.valid_patterns.too_dark_pct.toFixed(0)}%
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* INVALID Patterns */}
                <div className="border-l-4 border-red-500 pl-4">
                  <h4 className="font-bold text-red-700 mb-3 flex items-center">
                    ❌ FOTO INVALID ({featuresAnalysis.invalid_count} foto)
                  </h4>
                  
                  {featuresAnalysis.invalid_patterns && (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">💡 Luminosità media:</span>
                        <span className="font-semibold">
                          {featuresAnalysis.invalid_patterns.avg_brightness.toFixed(0)}/255
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">📄 Carta visibile:</span>
                        <span className="font-semibold">
                          {featuresAnalysis.invalid_patterns.avg_white_percentage.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">🚽 Ceramica rilevata:</span>
                        <span className="font-semibold">
                          {featuresAnalysis.invalid_patterns.ceramic_detected_pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">🎯 WC visibile:</span>
                        <span className="font-semibold">
                          {featuresAnalysis.invalid_patterns.toilet_visible_pct.toFixed(0)}%
                        </span>
                      </div>

                      {featuresAnalysis.invalid_patterns.too_dark_pct > 0 && (
                        <div className="flex justify-between text-amber-600">
                          <span>⚠️ Troppo scure:</span>
                          <span className="font-semibold">
                            {featuresAnalysis.invalid_patterns.too_dark_pct.toFixed(0)}%
                          </span>
                        </div>
                      )}
                      {featuresAnalysis.invalid_patterns.motion_blur_pct > 0 && (
                        <div className="flex justify-between text-amber-600">
                          <span>⚠️ Sfocate:</span>
                          <span className="font-semibold">
                            {featuresAnalysis.invalid_patterns.motion_blur_pct.toFixed(0)}%
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Key Differences */}
              {featuresAnalysis.key_differences && featuresAnalysis.key_differences.length > 0 && (
                <div className="mt-6 pt-6 border-t">
                  <h4 className="font-bold mb-3">🎯 Differenze Chiave Rilevate:</h4>
                  <div className="space-y-2">
                    {featuresAnalysis.key_differences.map((diff, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-blue-50 rounded">
                        <span className="font-medium">{diff.feature}:</span>
                        <div className="text-sm">
                          <span className="text-green-600 font-semibold">Valid: {diff.valid}</span>
                          <span className="mx-2 text-gray-400">vs</span>
                          <span className="text-red-600 font-semibold">Invalid: {diff.invalid}</span>
                          <span className="ml-3 text-blue-600 font-bold">
                            ({diff.difference})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Insights / Suggerimenti */}
            {featuresAnalysis.key_differences && featuresAnalysis.key_differences.length > 0 && (
              <div className="card bg-gradient-to-r from-purple-50 to-pink-50 mb-6">
                <h3 className="text-xl font-bold mb-3 text-purple-900">
                  💡 Insights Intelligenti
                </h3>
                <div className="space-y-2 text-sm">
                  <p className="text-purple-800">
                    <strong>Il modello ha identificato {featuresAnalysis.key_differences.length} pattern discriminanti chiave:</strong>
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-purple-700 ml-4">
                    {featuresAnalysis.key_differences.map((diff, idx) => (
                      <li key={idx}>
                        <strong>{diff.feature}</strong> è significativamente diverso tra valid e invalid
                      </li>
                    ))}
                  </ul>
                  <p className="text-purple-600 mt-3 pt-3 border-t border-purple-200">
                    📈 Questi pattern verranno utilizzati per migliorare l'accuratezza del prossimo training.
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {!featuresAnalysis && (
          <div className="card mb-6 bg-yellow-50">
            <p className="text-sm text-gray-700">
              ⚠️ <strong>Nessun feature estratto ancora.</strong> Le foto dovranno essere processate con feature extraction prima di vedere le analisi.
            </p>
          </div>
        )}

        {/* Chart */}
        {trainingHistory.length > 0 && chartData && (
          <div className="card mb-6">
            <div style={{ height: '400px' }}>
              <Line data={chartData} options={chartOptions} />
            </div>
          </div>
        )}

        {/* Training History Table */}
        {trainingHistory.length > 0 && (
          <div className="card">
            <h3 className="text-xl font-bold mb-4">
              📜 Storico Training
            </h3>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left">#</th>
                    <th className="px-4 py-3 text-left">Data</th>
                    <th className="px-4 py-3 text-right">Foto</th>
                    <th className="px-4 py-3 text-right">Accuracy</th>
                    <th className="px-4 py-3 text-right">Precision</th>
                    <th className="px-4 py-3 text-right">Recall</th>
                    <th className="px-4 py-3 text-right">Miglioramento</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {trainingHistory.map((training) => (
                    <tr key={training.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-semibold">
                        {training.training_number}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {new Date(training.created_at).toLocaleDateString('it-IT', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit'
                        })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {training.photos_count}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-600">
                        {training.accuracy.toFixed(2)}%
                      </td>
                      <td className="px-4 py-3 text-right text-green-600">
                        {training.precision_score.toFixed(2)}%
                      </td>
                      <td className="px-4 py-3 text-right text-red-600">
                        {training.recall_score.toFixed(2)}%
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold ${
                        training.improvement > 0 ? 'text-green-600' : 
                        training.improvement < 0 ? 'text-red-600' : 
                        'text-gray-400'
                      }`}>
                        {training.improvement > 0 && '+'}
                        {training.improvement.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {trainingHistory.length === 0 && (
          <div className="card text-center py-12">
            <p className="text-gray-500 text-lg">
              📊 Nessun training completato ancora
            </p>
            <p className="text-gray-400 text-sm mt-2">
              Completa il primo training per vedere le statistiche
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

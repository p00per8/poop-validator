import { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
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
  const [algorithmStats, setAlgorithmStats] = useState(null)
  const [trainingHistory, setTrainingHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
  }, [])

  async function loadDashboardData() {
    try {
      // Load current algorithm stats
      const { data: stats, error: statsError } = await supabase
        .from('algorithm_stats')
        .select('*')
        .single()

      if (statsError) throw statsError

      // Load training history (last 10)
      const { data: history, error: historyError } = await supabase
        .from('training_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10)

      if (historyError) throw historyError

      setAlgorithmStats(stats)
      setTrainingHistory(history.reverse()) // Reverse for chronological chart

    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const getLevelColor = (level) => {
    switch (level) {
      case 'BRONZO': return 'text-amber-700'
      case 'ARGENTO': return 'text-gray-400'
      case 'ORO': return 'text-yellow-500'
      case 'PLATINO': return 'text-blue-500'
      case 'DIAMANTE': return 'text-purple-600'
      default: return 'text-gray-600'
    }
  }

  const getLevelBadge = (level) => {
    switch (level) {
      case 'BRONZO': return '🥉'
      case 'ARGENTO': return '🥈'
      case 'ORO': return '🥇'
      case 'PLATINO': return '💎'
      case 'DIAMANTE': return '💠'
      default: return '📊'
    }
  }

  const chartData = {
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
  }

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
          <Link href="/">
            <button onClick={() => router.push('/')}>
  ← Torna alla pagina principale
</button>
          </Link>
          
          <h1 className="text-3xl font-bold mb-2">
            📊 Dashboard Algoritmo
          </h1>
          <p className="text-gray-600">
            Statistiche e performance del modello di validazione
          </p>
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

        {/* Chart */}
        {trainingHistory.length > 0 && (
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

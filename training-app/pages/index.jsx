import { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import Camera from '../../shared/components/Camera'
import StorageMonitor from '../components/StorageMonitor'
import { supabase } from '../../shared/lib/supabase'
import { compressForTraining } from '../../shared/lib/imageCompression'

export default function TrainingApp() {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [sessionExpiry, setSessionExpiry] = useState(null)
  const [timeRemaining, setTimeRemaining] = useState(null)
  const [stats, setStats] = useState({
    valid: 0,
    invalid: 0,
    total: 0,
    storageUsed: 0,
    storageLimit: 1000,
    canUpload: true
  })
  const [mode, setMode] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [message, setMessage] = useState(null)
  const [isRetraining, setIsRetraining] = useState(false)

  // Check session on mount
  useEffect(() => {
    const savedExpiry = localStorage.getItem('training_session_expiry')
    if (savedExpiry) {
      const expiry = parseInt(savedExpiry)
      if (Date.now() < expiry) {
        setIsAuthenticated(true)
        setSessionExpiry(expiry)
      } else {
        localStorage.removeItem('training_session_expiry')
      }
    }
  }, [])

  // Timer countdown
  useEffect(() => {
    if (!isAuthenticated || !sessionExpiry) return

    const interval = setInterval(() => {
      const remaining = sessionExpiry - Date.now()
      
      if (remaining <= 0) {
        localStorage.removeItem('training_session_expiry')
        setIsAuthenticated(false)
        setSessionExpiry(null)
        setTimeRemaining(null)
        setMessage({ type: 'error', text: '⏱️ Sessione scaduta. Effettua nuovamente il login.' })
        return
      }

      const minutes = Math.floor(remaining / 60000)
      const seconds = Math.floor((remaining % 60000) / 1000)
      setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`)
    }, 1000)

    return () => clearInterval(interval)
  }, [isAuthenticated, sessionExpiry])

  useEffect(() => {
    if (isAuthenticated) {
      loadStats()
      checkStorage()
    }
  }, [isAuthenticated])

  function handleLogin(e) {
    e.preventDefault()
    
    const correctPassword = process.env.NEXT_PUBLIC_TRAINING_PASSWORD || 'defaultpass'
    
    if (password === correctPassword) {
      const expiry = Date.now() + (30 * 60 * 1000) // 30 minuti
      localStorage.setItem('training_session_expiry', expiry.toString())
      setIsAuthenticated(true)
      setSessionExpiry(expiry)
      setPassword('')
      setMessage({ type: 'success', text: '✅ Login effettuato!' })
    } else {
      setMessage({ type: 'error', text: '❌ Password errata' })
    }
  }

  async function loadStats() {
    try {
      const { data, error } = await supabase
        .from('training_photos')
        .select('label')

      if (error) throw error

      const valid = data?.filter(d => d.label === 'valid').length || 0
      const invalid = data?.filter(d => d.label === 'invalid').length || 0

      setStats(prev => ({
        ...prev,
        valid,
        invalid,
        total: valid + invalid
      }))
    } catch (error) {
      console.error('Error loading stats:', error)
      setMessage({ type: 'error', text: 'Errore caricamento stats' })
    }
  }

  async function checkStorage() {
    try {
      const { data: files, error } = await supabase.storage
        .from('training-dataset')
        .list()

      if (error) throw error

      const totalSize = files?.reduce((acc, file) => {
        return acc + (file.metadata?.size || 0)
      }, 0) || 0

      const usedMB = totalSize / 1024 / 1024
      const percentage = (usedMB / 1000) * 100

      setStats(prev => ({
        ...prev,
        storageUsed: usedMB,
        canUpload: percentage < 95
      }))
    } catch (error) {
      console.error('Error checking storage:', error)
    }
  }

  async function handlePhotoCapture(photoBlob) {
    if (!stats.canUpload) {
      setMessage({ 
        type: 'error', 
        text: '⚠️ Storage pieno! Esegui retrain per continuare.' 
      })
      setMode(null)
      return
    }

    setIsProcessing(true)
    setMessage({ type: 'info', text: '⏳ Compressione in corso...' })

    try {
      const compressedBlob = await compressForTraining(photoBlob)
      setMessage({ type: 'info', text: '⏳ Estrazione features...' })

      // ✅ CHIAMA CLOUD RUN per upload + feature extraction
      const formData = new FormData()
      formData.append('photo', compressedBlob, `${mode}_${Date.now()}.jpg`)
      formData.append('label', mode)
      formData.append('uploaded_by', 'team')

      const response = await fetch(
        'https://poop-validator-retrain-514366132128.europe-west1.run.app/upload-training-photo',
        {
          method: 'POST',
          body: formData
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Upload failed')
      }

      const result = await response.json()

      setMessage({ 
        type: 'success', 
        text: `✅ Foto ${mode.toUpperCase()} salvata! ${result.features_extracted} features estratte.` 
      })

      // Force reload stats
      await Promise.all([loadStats(), checkStorage()])

    } catch (error) {
      console.error('Error uploading photo:', error)
      setMessage({ 
        type: 'error', 
        text: '❌ Errore: ' + error.message 
      })
    } finally {
      setIsProcessing(false)
      setMode(null)
    }
  }

  async function triggerRetrain() {
    const confirmed = window.confirm(
      `Questo processo:\n` +
      `1. Addestrerà il modello con ${stats.total} foto\n` +
      `2. Libererà spazio cancellando le foto\n` +
      `3. Richiederà circa 10-20 minuti\n\n` +
      `Continuare?`
    )

    if (!confirmed) return

    setIsRetraining(true)
    setMessage({ type: 'info', text: '🧠 Training in corso... Attendere (10-20 min)' })

    try {
      const response = await fetch('/api/retrain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Training failed')
      }

      setMessage({
        type: 'success',
        text: `✅ Training completato! Accuracy: ${result.accuracy}% | Spazio liberato: ${result.space_freed_mb} MB`
      })

      await Promise.all([loadStats(), checkStorage()])

    } catch (error) {
      console.error('Training error:', error)
      setMessage({
        type: 'error',
        text: `❌ Errore training: ${error.message}`
      })
    } finally {
      setIsRetraining(false)
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center p-4">
        <Head>
          <title>Training App - Login</title>
        </Head>

        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">🔒</div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Training App</h1>
            <p className="text-gray-600">Area riservata al team</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none transition"
                placeholder="Inserisci password"
                required
              />
            </div>

            {message && (
              <div className={`p-4 rounded-lg ${
                message.type === 'error' 
                  ? 'bg-red-100 text-red-800' 
                  : 'bg-green-100 text-green-800'
              }`}>
                {message.text}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition"
            >
              Accedi
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4 pb-20">
      <Head>
        <title>Training App - Raccolta Dati</title>
      </Head>

      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">🎓 Training App</h1>
              <p className="text-gray-600">Raccolta dati per algoritmo ML</p>
            </div>
            {timeRemaining && (
              <div className="bg-indigo-100 text-indigo-800 px-4 py-2 rounded-lg font-mono font-bold">
                ⏱️ {timeRemaining}
              </div>
            )}
          </div>

          <div className="flex gap-4">
            <Link href="/training/dashboard">
              <button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium">
                📊 Vai alla Dashboard →
              </button>
            </Link>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className={`mb-6 p-4 rounded-xl shadow-md ${
            message.type === 'success' ? 'bg-green-100 text-green-800' :
            message.type === 'error' ? 'bg-red-100 text-red-800' :
            'bg-blue-100 text-blue-800'
          }`}>
            <p className="font-medium">{message.text}</p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-md p-6 text-center">
            <div className="text-4xl font-bold text-indigo-600">{stats.total}</div>
            <div className="text-gray-600 text-sm mt-1">Foto Totali</div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 text-center">
            <div className="text-4xl font-bold text-green-600">{stats.valid}</div>
            <div className="text-gray-600 text-sm mt-1">✅ Valid</div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 text-center">
            <div className="text-4xl font-bold text-red-600">{stats.invalid}</div>
            <div className="text-gray-600 text-sm mt-1">❌ Invalid</div>
          </div>
        </div>

        {/* Storage Monitor */}
        <StorageMonitor 
          used={stats.storageUsed}
          limit={stats.storageLimit}
          canUpload={stats.canUpload}
        />

        {/* Camera Mode */}
        {mode && (
          <div className="fixed inset-0 z-50 bg-black">
            <Camera
              label={mode}
              onCapture={handlePhotoCapture}
              onCancel={() => setMode(null)}
              fullscreen={true}
            />
          </div>
        )}

        {/* Action Buttons */}
        {!mode && !isProcessing && (
          <div className="grid grid-cols-2 gap-4 mb-6">
            <button
              onClick={() => setMode('valid')}
              disabled={!stats.canUpload}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white py-8 rounded-2xl text-xl font-bold shadow-xl transition transform active:scale-95"
            >
              📸 SCATTA VALID
            </button>
            <button
              onClick={() => setMode('invalid')}
              disabled={!stats.canUpload}
              className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white py-8 rounded-2xl text-xl font-bold shadow-xl transition transform active:scale-95"
            >
              📸 SCATTA INVALID
            </button>
          </div>
        )}

        {/* Retrain Button */}
        {stats.total >= 100 && !isRetraining && (
          <button
            onClick={triggerRetrain}
            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white py-6 rounded-2xl text-xl font-bold shadow-2xl transition transform active:scale-95"
          >
            🧠 RETRAIN MODEL ({stats.total} foto pronte)
          </button>
        )}

        {isRetraining && (
          <div className="bg-yellow-100 border-2 border-yellow-400 rounded-2xl p-6 text-center">
            <div className="animate-spin text-6xl mb-4">🧠</div>
            <p className="text-xl font-bold text-yellow-800">Training in corso...</p>
            <p className="text-yellow-700 mt-2">Questo richiederà 10-20 minuti. Non chiudere la pagina.</p>
          </div>
        )}

        {stats.total < 100 && (
          <div className="bg-gray-100 rounded-2xl p-6 text-center">
            <p className="text-gray-600">
              📊 Progresso: <span className="font-bold">{stats.total}/100</span> foto
            </p>
            <p className="text-gray-500 text-sm mt-2">
              Mancano {100 - stats.total} foto per abilitare il training
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
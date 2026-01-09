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
        // Session expired
        localStorage.removeItem('training_session_expiry')
        setIsAuthenticated(false)
        setSessionExpiry(null)
        setTimeRemaining(null)
        setMessage({ type: 'error', text: '⏱️ Sessione scaduta. Effettua nuovamente il login.' })
      } else {
        setTimeRemaining(remaining)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [isAuthenticated, sessionExpiry])

  useEffect(() => {
    if (isAuthenticated) {
      loadStats()
      checkStorage()
    }
  }, [isAuthenticated])

  const handleLogin = (e) => {
    e.preventDefault()
    if (password === process.env.NEXT_PUBLIC_TRAINING_PASSWORD || password === 'training123') {
      const expiry = Date.now() + (5 * 60 * 1000) // 5 minutes
      localStorage.setItem('training_session_expiry', expiry.toString())
      setSessionExpiry(expiry)
      setIsAuthenticated(true)
      setMessage({ type: 'success', text: '✅ Autenticazione riuscita!' })
    } else {
      setMessage({ type: 'error', text: '❌ Password errata' })
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('training_session_expiry')
    setIsAuthenticated(false)
    setSessionExpiry(null)
    setTimeRemaining(null)
  }

  const formatTimeRemaining = (ms) => {
    if (!ms) return '0:00'
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  async function loadStats() {
    try {
      console.log('🔄 Loading stats...')
      const { data, error } = await supabase
        .from('training_photos')
        .select('label')

      if (error) {
        console.error('❌ Supabase error:', error)
        throw error
      }

      console.log('📊 Data received:', data)

      const valid = data?.filter(d => d.label === 'valid').length || 0
      const invalid = data?.filter(d => d.label === 'invalid').length || 0

      console.log('✅ Counts - Valid:', valid, 'Invalid:', invalid, 'Total:', valid + invalid)

      setStats(prev => {
        const newStats = {
          ...prev,
          valid,
          invalid,
          total: valid + invalid
        }
        console.log('📝 Setting stats:', newStats)
        return newStats
      })
    } catch (error) {
      console.error('Error loading stats:', error)
      setMessage({ type: 'error', text: 'Errore caricamento stats' })
    }
  }

  async function checkStorage() {
    try {
      console.log('💾 Checking storage...')
      // Get total size from database records (more accurate)
      const { data: photos, error } = await supabase
        .from('training_photos')
        .select('file_size')

      if (error) {
        console.error('❌ Storage error:', error)
        throw error
      }

      console.log('📁 Photos data:', photos)

      const totalSize = photos?.reduce((acc, photo) => {
        return acc + (photo.file_size || 0)
      }, 0) || 0

      const usedMB = totalSize / 1024 / 1024
      const percentage = (usedMB / 1000) * 100

      console.log('📊 Storage - Total bytes:', totalSize, 'MB:', usedMB.toFixed(2), '%:', percentage.toFixed(2))

      setStats(prev => {
        const newStats = {
          ...prev,
          storageUsed: usedMB,
          canUpload: percentage < 95
        }
        console.log('💾 Setting storage stats:', newStats)
        return newStats
      })
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
      setMessage({ type: 'info', text: '⏳ Upload in corso...' })

      const filename = `${mode}_${Date.now()}.jpg`
      const { data: upload, error: uploadError } = await supabase.storage
        .from('training-dataset')
        .upload(filename, compressedBlob, {
          contentType: 'image/jpeg',
          upsert: false
        })

      if (uploadError) throw uploadError

      const { error: dbError } = await supabase
        .from('training_photos')
        .insert({
          image_url: upload.path,
          label: mode,
          file_size: compressedBlob.size,
          uploaded_by: 'team',
          used_in_training: false
        })

      if (dbError) throw dbError

      setMessage({ 
        type: 'success', 
        text: `✅ Foto ${mode.toUpperCase()} salvata con successo!` 
      })

      // Force reload stats
      await Promise.all([loadStats(), checkStorage()])

    } catch (error) {
      console.error('Error uploading photo:', error)
      setMessage({ 
        type: 'error', 
        text: '❌ Errore nel salvataggio: ' + error.message 
      })
    } finally {
      setIsProcessing(false)
      setMode(null)
    }
  }

  async function triggerRetrain() {
    const confirmed = window.confirm(
      `Questo processo:\n` +
      `1. Scaricherà tutte le ${stats.total} foto\n` +
      `2. Allenerà il modello\n` +
      `3. CANCELLERÀ le foto da storage (metadata rimane)\n\n` +
      `Tempo stimato: 10-20 minuti\n\n` +
      `Procedere?`
    )

    if (!confirmed) return

    setIsRetraining(true)
    setMessage({ type: 'info', text: '🔄 Retrain avviato... (10-20 min)' })

    try {
      const res = await fetch('/api/retrain', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Retrain failed')

      setMessage({ 
        type: 'success', 
        text: `✅ Retrain completato!\n` +
               `Foto: ${data.photosProcessed}\n` +
               `Accuracy: ${data.accuracy}%\n` +
               `Spazio liberato: ${data.spaceFree} MB` 
      })

      await checkStorage()
      await loadStats()

    } catch (error) {
      console.error('Retrain error:', error)
      setMessage({ 
        type: 'error', 
        text: '❌ Errore retrain: ' + error.message 
      })
    } finally {
      setIsRetraining(false)
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Head>
          <title>Training App - Login</title>
        </Head>
        
        <div className="card max-w-md w-full">
          <h1 className="text-2xl font-bold text-center mb-6">
            🎓 Training Data Collector
          </h1>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Password di accesso
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Inserisci password..."
                required
              />
            </div>
            
            <button type="submit" className="btn btn-primary w-full">
              🔓 Accedi
            </button>
          </form>

          {message && (
            <div className={`mt-4 p-3 rounded-lg text-sm ${
              message.type === 'error' ? 'bg-red-50 text-red-600' :
              message.type === 'success' ? 'bg-green-50 text-green-600' :
              'bg-blue-50 text-blue-600'
            }`}>
              {message.text}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-32">
      <Head>
        <title>Training App - Data Collection</title>
      </Head>

      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">
            🎓 Training Data Collector
          </h1>
          <p className="text-gray-600">
            Raccogli foto per addestrare l'algoritmo di validazione
          </p>
          
          <button onClick={() => router.push('/dashboard')}>
              📊 Vai alla Dashboard →
          </button>
        </div>

        <StorageMonitor 
          used={stats.storageUsed}
          limit={stats.storageLimit}
          canUpload={stats.canUpload}
        />

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="stat-box">
            <div className="stat-number text-green-600">{stats.valid}</div>
            <div className="stat-label">✅ Valid</div>
          </div>
          <div className="stat-box">
            <div className="stat-number text-red-600">{stats.invalid}</div>
            <div className="stat-label">❌ Invalid</div>
          </div>
          <div className="stat-box">
            <div className="stat-number text-blue-600">{stats.total}</div>
            <div className="stat-label">📊 Totale</div>
          </div>
        </div>

        {message && (
          <div className={`card mb-6 ${
            message.type === 'error' ? 'bg-red-50 border-red-200' :
            message.type === 'success' ? 'bg-green-50 border-green-200' :
            'bg-blue-50 border-blue-200'
          }`}>
            <p className="text-sm whitespace-pre-line">{message.text}</p>
          </div>
        )}

        {!mode ? (
          <div className="space-y-4">
            {stats.canUpload && !isProcessing && (
              <>
                <button
                  onClick={() => setMode('valid')}
                  className="btn btn-success w-full text-lg py-4"
                >
                  📸 Scatta Foto VALID
                </button>
                <button
                  onClick={() => setMode('invalid')}
                  className="btn btn-danger w-full text-lg py-4"
                >
                  📸 Scatta Foto INVALID
                </button>
              </>
            )}

            {stats.total >= 100 && stats.total % 100 === 0 && (
              <button
                onClick={triggerRetrain}
                disabled={isRetraining}
                className={`btn w-full text-lg py-4 ${
                  isRetraining ? 'btn-disabled' : 'btn-primary'
                }`}
              >
                {isRetraining ? (
                  <>
                    <span className="loading-spinner mr-2" />
                    Retrain in corso...
                  </>
                ) : (
                  <>
                    🔄 RETRAIN MODEL + Libera Storage
                    <span className="block text-sm mt-1">
                      ({stats.total} foto pronte)
                    </span>
                  </>
                )}
              </button>
            )}

            {stats.total < 100 && (
              <div className="card bg-yellow-50">
                <p className="text-sm text-gray-700">
                  💡 <strong>Tip:</strong> Servono almeno 100 foto (50 valid + 50 invalid) 
                  per il primo training. Attualmente: {stats.total}/100
                </p>
              </div>
            )}
          </div>
        ) : (
          <Camera
            onCapture={handlePhotoCapture}
            onCancel={() => setMode(null)}
            label={mode}
            fullscreen={true}
          />
        )}

        {/* Session Timer - Fixed at bottom */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4 z-40">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="text-sm">
                <span className="text-gray-600">⏱️ Sessione scade tra: </span>
                <span className={`font-mono font-bold ${
                  timeRemaining && timeRemaining < 60000 ? 'text-red-600' : 'text-green-600'
                }`}>
                  {formatTimeRemaining(timeRemaining)}
                </span>
              </div>
            </div>
            
            <button
              onClick={handleLogout}
              className="text-sm text-red-600 hover:text-red-800 font-medium"
            >
              🚪 Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

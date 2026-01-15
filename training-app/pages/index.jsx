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
  const [uploadProgress, setUploadProgress] = useState(0) // 🆕 Progress percentage
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

  // Timer countdown - FIX: mantiene sempre 5 minuti
  useEffect(() => {
    if (!isAuthenticated || !sessionExpiry) return

    const interval = setInterval(() => {
      const remaining = sessionExpiry - Date.now()
      
      if (remaining <= 0) {
        localStorage.removeItem('training_session_expiry')
        setIsAuthenticated(false)
        setSessionExpiry(null)
        setTimeRemaining(null)
        showMessage('error', '⏱️ Sessione scaduta. Effettua nuovamente il login.')
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
      const expiry = Date.now() + (5 * 60 * 1000) // FIX: Sempre 5 minuti
      localStorage.setItem('training_session_expiry', expiry.toString())
      setSessionExpiry(expiry)
      setIsAuthenticated(true)
      showMessage('success', '✅ Autenticazione riuscita!')
      setPassword('')
    } else {
      showMessage('error', '❌ Password errata')
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('training_session_expiry')
    setIsAuthenticated(false)
    setSessionExpiry(null)
    setTimeRemaining(null)
    showMessage('info', '👋 Logout effettuato')
  }

  const formatTimeRemaining = (ms) => {
    if (!ms) return '--:--'
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const loadStats = async () => {
    try {
      const response = await fetch('/api/training-stats')
      if (!response.ok) throw new Error('Failed to fetch stats')
      const data = await response.json()
      
      // FIX: Forza aggiornamento UI con nuovo object reference
      setStats({
        valid: data.valid || 0,
        invalid: data.invalid || 0,
        total: data.total || 0,
        storageUsed: data.storageUsed || 0,
        storageLimit: data.storageLimit || 1000,
        canUpload: data.canUpload !== false
      })
    } catch (error) {
      console.error('Error loading stats:', error)
    }
  }

  const checkStorage = async () => {
    try {
      const { data, error } = await supabase.storage
        .from('training-photos')
        .list()
      
      if (error) throw error
      
      const used = data?.length || 0
      const limit = 1000
      
      setStats(prev => ({
        ...prev,
        storageUsed: used,
        storageLimit: limit,
        canUpload: used < limit
      }))
    } catch (error) {
      console.error('Storage check error:', error)
    }
  }

  // FIX: Snackbar con posizione fixed bottom-right
  const showMessage = (type, text, duration = 3000) => {
    setMessage({ type, text })
    setTimeout(() => {
      setMessage(null)
    }, duration)
  }

  const handlePhotoCapture = async (blob, isValid) => {
    setIsProcessing(true)
    setUploadProgress(0) // Reset progress
    
    try {
      // Step 1: Compress (10%)
      setUploadProgress(10)
      showMessage('info', '📦 Compressione in corso...')
      const compressedBlob = await compressForTraining(blob)
      
      // Step 2: Upload to storage (30%)
      setUploadProgress(30)
      showMessage('info', '☁️ Caricamento su storage...')
      const fileName = `${isValid ? 'valid' : 'invalid'}/${Date.now()}.jpg`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('training-photos')
        .upload(fileName, compressedBlob)
      
      if (uploadError) throw uploadError
      
      // Step 3: Extract features via Cloud Run (60%)
      setUploadProgress(60)
      showMessage('info', '🧠 Estrazione features...')
      
      const formData = new FormData()
      formData.append('file', compressedBlob, 'photo.jpg')
      
      const cloudRunUrl = process.env.NEXT_PUBLIC_CLOUD_RUN_URL
      const featuresResponse = await fetch(`${cloudRunUrl}/extract-features`, {
        method: 'POST',
        body: formData
      })
      
      if (!featuresResponse.ok) {
        throw new Error('Feature extraction failed')
      }
      
      const featuresData = await featuresResponse.json()
      
      // Step 4: Save to database with features (80%)
      setUploadProgress(80)
      showMessage('info', '💾 Salvataggio nel database...')
      
      const { error: dbError } = await supabase
        .from('training_photos')
        .insert({
          storage_path: uploadData.path,
          is_valid: isValid,
          features: featuresData.features, // 🆕 Salva features estratte
          uploaded_at: new Date().toISOString()
        })
      
      if (dbError) throw dbError
      
      // Step 5: Refresh stats (100%)
      setUploadProgress(100)
      await loadStats()
      await checkStorage()
      
      showMessage('success', `✅ Foto ${isValid ? 'valida' : 'non valida'} caricata!`)
      setMode(null)
      
    } catch (error) {
      console.error('Upload error:', error)
      showMessage('error', `❌ Errore: ${error.message}`)
    } finally {
      setIsProcessing(false)
      setUploadProgress(0)
    }
  }

  const triggerRetraining = async () => {
    if (!confirm('Vuoi avviare il retraining del modello? Questo processo può richiedere alcuni minuti.')) {
      return
    }
    
    setIsRetraining(true)
    showMessage('info', '🔄 Retraining avviato...')
    
    try {
      const response = await fetch('/api/trigger-retraining', {
        method: 'POST'
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Retraining failed')
      }
      
      showMessage('success', '✅ Retraining completato con successo!')
    } catch (error) {
      console.error('Retraining error:', error)
      showMessage('error', `❌ Errore retraining: ${error.message}`)
    } finally {
      setIsRetraining(false)
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center p-4">
        <Head>
          <title>Training App - Login</title>
        </Head>
        
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">💩</div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Training App</h1>
            <p className="text-gray-600">Inserisci la password per accedere</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none transition-colors"
              autoFocus
            />
            
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity"
            >
              🔓 Accedi
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-32">
      <Head>
        <title>Training App - Data Collection</title>
      </Head>

      {/* Header */}
      <div className="max-w-4xl mx-auto mb-6">
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-800">
              💩 Training Data Collection
            </h1>
            
            <Link href="/dashboard">
              <a className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
                📊 Dashboard
              </a>
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Cards - FIX: key per forzare re-render */}
      <div key={`stats-${stats.total}`} className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-md p-4 text-center">
          <div className="text-3xl font-bold text-green-600">{stats.valid}</div>
          <div className="text-sm text-gray-600 mt-1">✅ Foto Valide</div>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-4 text-center">
          <div className="text-3xl font-bold text-red-600">{stats.invalid}</div>
          <div className="text-sm text-gray-600 mt-1">❌ Foto Non Valide</div>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-4 text-center">
          <div className="text-3xl font-bold text-blue-600">{stats.total}</div>
          <div className="text-sm text-gray-600 mt-1">📊 Totale</div>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-4 text-center">
          <div className="text-3xl font-bold text-purple-600">
            {Math.round((stats.storageUsed / stats.storageLimit) * 100)}%
          </div>
          <div className="text-sm text-gray-600 mt-1">
            💾 Storage ({stats.storageUsed}/{stats.storageLimit})
          </div>
        </div>
      </div>

      {/* Camera Buttons */}
      {!mode && !isProcessing && (
        <div className="max-w-4xl mx-auto grid grid-cols-2 gap-4 mb-6">
          <button
            onClick={() => setMode('valid')}
            disabled={!stats.canUpload}
            className={`p-6 rounded-lg shadow-md font-semibold text-lg transition-all ${
              stats.canUpload
                ? 'bg-green-500 text-white hover:bg-green-600 active:scale-95'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            ✅ Foto VALIDA
          </button>
          
          <button
            onClick={() => setMode('invalid')}
            disabled={!stats.canUpload}
            className={`p-6 rounded-lg shadow-md font-semibold text-lg transition-all ${
              stats.canUpload
                ? 'bg-red-500 text-white hover:bg-red-600 active:scale-95'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            ❌ Foto NON VALIDA
          </button>
        </div>
      )}

      {/* Retraining Button */}
      {!mode && !isProcessing && stats.total >= 100 && (
        <div className="max-w-4xl mx-auto mb-6">
          <button
            onClick={triggerRetraining}
            disabled={isRetraining}
            className={`w-full p-6 rounded-lg shadow-md font-semibold text-lg transition-all ${
              isRetraining
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90 active:scale-95'
            }`}
          >
            {isRetraining ? '⏳ Retraining in corso...' : '🚀 Avvia Retraining Modello'}
          </button>
        </div>
      )}

      {/* Camera Component */}
      {mode && (
        <Camera
          onCapture={handlePhotoCapture}
          onCancel={() => setMode(null)}
          label={mode}
          fullscreen={true}
        />
      )}

      {/* Processing Overlay con Progress Percentage */}
      {isProcessing && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 text-center">
            <div className="text-6xl mb-4">⏳</div>
            <div className="text-2xl font-bold text-gray-800 mb-4">
              Caricamento in corso...
            </div>
            
            {/* Progress Bar */}
            <div className="w-full bg-gray-200 rounded-full h-6 mb-4 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-purple-500 h-full rounded-full transition-all duration-300 flex items-center justify-center text-white text-sm font-bold"
                style={{ width: `${uploadProgress}%` }}
              >
                {uploadProgress}%
              </div>
            </div>
            
            <p className="text-gray-600 text-sm">
              {uploadProgress < 30 && '📦 Compressione immagine...'}
              {uploadProgress >= 30 && uploadProgress < 60 && '☁️ Upload su storage...'}
              {uploadProgress >= 60 && uploadProgress < 80 && '🧠 Estrazione features...'}
              {uploadProgress >= 80 && uploadProgress < 100 && '💾 Salvataggio database...'}
              {uploadProgress === 100 && '✅ Completato!'}
            </p>
          </div>
        </div>
      )}

      {/* FIX: Snackbar bottom-right con easing */}
      {message && (
        <div className="fixed bottom-20 right-4 z-50 animate-slide-in">
          <div className={`rounded-lg shadow-lg p-4 max-w-sm ${
            message.type === 'success' ? 'bg-green-500' :
            message.type === 'error' ? 'bg-red-500' :
            message.type === 'info' ? 'bg-blue-500' :
            'bg-gray-500'
          } text-white`}>
            {message.text}
          </div>
        </div>
      )}

      {/* Timer fisso bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-200 p-4 shadow-lg z-40">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <span className="text-gray-700 font-medium">⏱️ Sessione scade tra:</span>
            <span className={`text-xl font-bold ${
              timeRemaining && timeRemaining < 60000 ? 'text-red-600' : 'text-green-600'
            }`}>
              {formatTimeRemaining(timeRemaining)}
            </span>
          </div>
          
          <button
            onClick={handleLogout}
            className="text-sm text-red-600 hover:text-red-800 font-medium"
          >
            🚪 Logout
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        
        .animate-slide-in {
          animation: slide-in 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
      `}</style>
    </div>
  )
}
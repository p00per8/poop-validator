import { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import Camera from '../../shared/components/Camera'
import { supabase } from '../../shared/lib/supabase'
import { compressForTraining } from '../../shared/lib/imageCompression'

export default function TrainingApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [sessionExpiry, setSessionExpiry] = useState(null)
  const [timeRemaining, setTimeRemaining] = useState(null)
  const [stats, setStats] = useState({
    valid: 0,
    invalid: 0,
    total: 0,
    canUpload: true
  })
  const [mode, setMode] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [message, setMessage] = useState(null)
  const [statsLoading, setStatsLoading] = useState(true)

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

  useEffect(() => {
    if (!isAuthenticated || !sessionExpiry) return

    const interval = setInterval(() => {
      const remaining = sessionExpiry - Date.now()
      
      if (remaining <= 0) {
        localStorage.removeItem('training_session_expiry')
        setIsAuthenticated(false)
        setSessionExpiry(null)
        setTimeRemaining(null)
        showMessage('error', '⏱️ Sessione scaduta')
      } else {
        setTimeRemaining(remaining)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [isAuthenticated, sessionExpiry])

  useEffect(() => {
    if (isAuthenticated) {
      loadStats()
    }
  }, [isAuthenticated])

  const handleLogin = (e) => {
    e.preventDefault()
    if (password === process.env.NEXT_PUBLIC_TRAINING_PASSWORD || password === 'training123') {
      const expiry = Date.now() + (5 * 60 * 1000)
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

  // Helper: determina label dal filename (per gestire rinominazioni manuali in Supabase)
  const getLabelFromFilename = (imageUrl) => {
    if (!imageUrl) return null
    const filename = imageUrl.split('/').pop()
    if (filename.startsWith('valid_')) return 'valid'
    if (filename.startsWith('invalid_')) return 'invalid'
    return null
  }

  const loadStats = async () => {
    setStatsLoading(true)
    try {
      // Query con image_url per leggere label dal filename
      const { data: photos, error } = await supabase
        .from('training_photos')
        .select('label, image_url')

      if (error) throw error

      // Determina label dal filename (priorità) o dal campo database (fallback)
      const photosWithLabels = photos.map(p => ({
        ...p,
        effectiveLabel: getLabelFromFilename(p.image_url) || p.label
      }))

      const valid = photosWithLabels.filter(p => p.effectiveLabel === 'valid').length
      const invalid = photosWithLabels.filter(p => p.effectiveLabel === 'invalid').length
      const total = photos.length

      setStats({
        valid,
        invalid,
        total,
        canUpload: true
      })
    } catch (error) {
      console.error('Error loading stats:', error)
      // Fallback: mostra 0 senza errore
      setStats({
        valid: 0,
        invalid: 0,
        total: 0,
        canUpload: true
      })
    } finally {
      setStatsLoading(false)
    }
  }

  const showMessage = (type, text, duration = 3000) => {
    setMessage({ type, text })
    setTimeout(() => {
      setMessage(null)
    }, duration)
  }

  const handlePhotoCapture = async (blob, isValid) => {
    setIsProcessing(true)
    setUploadProgress(0)
    
    try {
      // Step 1: Compress (20%)
      setUploadProgress(20)
      showMessage('info', '📦 Compressione...')
      const compressedBlob = await compressForTraining(blob)
      
      // Step 2: Cloud Run fa TUTTO (upload + features + DB)
      setUploadProgress(40)
      showMessage('info', '☁️ Upload e estrazione features...')
      
      // Generate unique filename: label_timestamp_randomId.jpg
      const timestamp = Date.now()
      const randomId = Math.random().toString(36).substring(2, 9)
      const label = isValid ? 'valid' : 'invalid'
      const uniqueFilename = `${label}_${timestamp}_${randomId}.jpg`

      const formData = new FormData()
      formData.append('photo', compressedBlob, uniqueFilename)
      formData.append('label', label)
      formData.append('uploaded_by', 'training-app')
      
      const cloudRunUrl = process.env.NEXT_PUBLIC_CLOUD_RUN_URL
      const response = await fetch(`${cloudRunUrl}/upload-training-photo`, {
        method: 'POST',
        body: formData
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Upload failed')
      }
      
      const data = await response.json()
      
      // Step 3: Refresh stats
      setUploadProgress(100)
      await loadStats()
      
      showMessage('success', `✅ Foto caricata con ${data.features_extracted} features!`)
      setMode(null)
      
    } catch (error) {
      console.error('Upload error:', error)
      showMessage('error', `❌ Errore: ${error.message}`)
    } finally {
      setIsProcessing(false)
      setUploadProgress(0)
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
            
            <Link href="/training/dashboard" className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
              📊 Dashboard
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div key={`stats-${stats.total}`} className="max-w-4xl mx-auto grid grid-cols-3 gap-4 mb-6">
        {statsLoading ? (
          <>
            <div className="bg-white rounded-lg shadow-md p-4 text-center">
              <div className="h-8 bg-green-100 rounded w-12 mx-auto mb-2 animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded w-24 mx-auto animate-pulse"></div>
            </div>
            <div className="bg-white rounded-lg shadow-md p-4 text-center">
              <div className="h-8 bg-red-100 rounded w-12 mx-auto mb-2 animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded w-24 mx-auto animate-pulse"></div>
            </div>
            <div className="bg-white rounded-lg shadow-md p-4 text-center">
              <div className="h-8 bg-blue-100 rounded w-12 mx-auto mb-2 animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded w-24 mx-auto animate-pulse"></div>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* Training Ready Banner */}
      {!statsLoading && stats.valid >= 50 && stats.invalid >= 50 && (
        <div className="max-w-4xl mx-auto mb-6">
          <div className="bg-gradient-to-r from-green-500 to-blue-500 text-white rounded-lg shadow-lg p-6 text-center">
            <div className="text-4xl mb-2">🎉</div>
            <div className="text-2xl font-bold mb-2">Dataset Completo!</div>
            <p className="text-lg">50 foto valide e 50 foto invalide raccolte.</p>
            <p className="text-sm opacity-90 mt-2">Puoi iniziare il training del modello!</p>
          </div>
        </div>
      )}

      {/* Camera Buttons */}
      {!mode && !isProcessing && (
        <div className="max-w-4xl mx-auto grid grid-cols-2 gap-4 mb-6">
          {/* Valid Photo Button */}
          <button
            onClick={() => setMode('valid')}
            disabled={!stats.canUpload || stats.valid >= 50}
            className={`p-6 rounded-lg shadow-md font-semibold text-lg transition-all ${
              stats.canUpload && stats.valid < 50
                ? 'bg-green-500 text-white hover:bg-green-600 active:scale-95'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            ✅ Foto VALIDA
          </button>

          {/* Invalid Photo Button */}
          <button
            onClick={() => setMode('invalid')}
            disabled={!stats.canUpload || stats.invalid >= 50}
            className={`p-6 rounded-lg shadow-md font-semibold text-lg transition-all ${
              stats.canUpload && stats.invalid < 50
                ? 'bg-red-500 text-white hover:bg-red-600 active:scale-95'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            ❌ Foto NON VALIDA
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

      {/* Processing Overlay */}
      {isProcessing && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 text-center">
            <div className="text-6xl mb-4">⏳</div>
            <div className="text-2xl font-bold text-gray-800 mb-4">
              Caricamento in corso...
            </div>
            
            <div className="w-full bg-gray-200 rounded-full h-6 mb-4 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-purple-500 h-full rounded-full transition-all duration-300 flex items-center justify-center text-white text-sm font-bold"
                style={{ width: `${uploadProgress}%` }}
              >
                {uploadProgress}%
              </div>
            </div>
            
            <p className="text-gray-600 text-sm">
              {uploadProgress < 40 && '📦 Compressione...'}
              {uploadProgress >= 40 && uploadProgress < 100 && '☁️ Upload e features...'}
              {uploadProgress === 100 && '✅ Completato!'}
            </p>
          </div>
        </div>
      )}

      {/* Snackbar */}
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

      {/* Timer */}
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
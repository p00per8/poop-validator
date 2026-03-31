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
    unusedValid: 0,
    unusedInvalid: 0,
    unusedTotal: 0,
    unusedExplicitFalse: 0,
    unusedReadyForTraining: 0,
    unusedValidReady: 0,
    unusedInvalidReady: 0,
    photosMissingFeatures: 0,
    canUpload: true
  })
  const [backfillLoading, setBackfillLoading] = useState(false)
  const [mode, setMode] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [message, setMessage] = useState(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [isTraining, setIsTraining] = useState(false)
  const [trainingProgress, setTrainingProgress] = useState(null)

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

  useEffect(() => {
    // Resume training poll se era attivo prima del reload/chiusura pagina
    const activeVersion = localStorage.getItem('training_active_version')
    if (activeVersion) {
      setIsTraining(true)
      setTrainingProgress({ progress: 50, status: 'Ripristino training in corso...' })
      pollTrainingStatus(activeVersion)
    }
  }, [])

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

  /** Riga ancora disponibile per un nuovo training (solo `true` = già usata). */
  const isNotYetUsed = (p) => p.used_in_training !== true

  /** Molti backend contano solo `used_in_training = false` e ignorano NULL in SQL. */
  const isUnusedStrictDb = (p) => p.used_in_training === false

  const hasUsableFeatures = (p) => {
    const f = p.features
    if (f == null) return false
    if (Array.isArray(f)) return f.length > 0
    if (typeof f === 'object') return Object.keys(f).length > 0
    return false
  }

  const loadStats = async () => {
    setStatsLoading(true)
    try {
      const { data: photos, error } = await supabase
        .from('training_photos')
        .select('label, image_url, used_in_training, features')

      if (error) throw error

      const photosWithLabels = photos.map(p => ({
        ...p,
        effectiveLabel: getLabelFromFilename(p.image_url) || p.label
      }))

      const valid = photosWithLabels.filter(p => p.effectiveLabel === 'valid').length
      const invalid = photosWithLabels.filter(p => p.effectiveLabel === 'invalid').length
      const total = photos.length

      const unusedValid = photosWithLabels.filter(p => p.effectiveLabel === 'valid' && isNotYetUsed(p)).length
      const unusedInvalid = photosWithLabels.filter(p => p.effectiveLabel === 'invalid' && isNotYetUsed(p)).length
      const unusedTotal = photos.filter(isNotYetUsed).length

      const unusedExplicitFalse = photos.filter(isUnusedStrictDb).length
      const unusedReadyForTraining = photos.filter(p => isNotYetUsed(p) && hasUsableFeatures(p)).length
      const unusedValidReady = photosWithLabels.filter(p =>
        p.effectiveLabel === 'valid' && isNotYetUsed(p) && hasUsableFeatures(p)).length
      const unusedInvalidReady = photosWithLabels.filter(p =>
        p.effectiveLabel === 'invalid' && isNotYetUsed(p) && hasUsableFeatures(p)).length

      const photosMissingFeatures = photos.filter(p => !hasUsableFeatures(p)).length

      setStats({
        valid,
        invalid,
        total,
        unusedValid,
        unusedInvalid,
        unusedTotal,
        unusedExplicitFalse,
        unusedReadyForTraining,
        unusedValidReady,
        unusedInvalidReady,
        photosMissingFeatures,
        canUpload: true
      })
    } catch (error) {
      console.error('Error loading stats:', error)
      setStats({
        valid: 0,
        invalid: 0,
        total: 0,
        unusedValid: 0,
        unusedInvalid: 0,
        unusedTotal: 0,
        unusedExplicitFalse: 0,
        unusedReadyForTraining: 0,
        unusedValidReady: 0,
        unusedInvalidReady: 0,
        photosMissingFeatures: 0,
        canUpload: true
      })
    } finally {
      setStatsLoading(false)
    }
  }

  const handleBackfillFeatures = async () => {
    const n = stats.photosMissingFeatures ?? 0
    if (n === 0) {
      showMessage('info', 'Nessuna foto senza features.')
      return
    }
    const ok = confirm(
      `Estrarre le features per le foto che ne sono prive?\n\n` +
        `Cloud Run elaborerà fino a ${n} record (tutte quelle con features NULL nel DB).\n` +
        `Può richiedere diversi minuti.`
    )
    if (!ok) return

    setBackfillLoading(true)
    showMessage('info', '⏳ Backfill features in corso via Cloud Run…', 5000)
    try {
      const response = await fetch('/api/backfill-features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || `Errore HTTP ${response.status}`)
      }
      const st = data.stats
      const msg = st
        ? `Completato: ${st.success} ok, ${st.errors || 0} errori su ${st.total} foto.`
        : (data.message || 'Backfill completato.')
      showMessage('success', msg, 10000)
      await loadStats()
    } catch (err) {
      console.error('Backfill:', err)
      showMessage('error', err.message || 'Backfill fallito', 8000)
    } finally {
      setBackfillLoading(false)
    }
  }

  const showMessage = (type, text, duration = 3000) => {
    setMessage({ type, text })
    setTimeout(() => {
      setMessage(null)
    }, duration)
  }

  const handleTrainModel = async () => {
    const ready = stats.unusedReadyForTraining ?? 0
    const confirmed = confirm(
      `🧠 Training con ${ready} foto contate dal server (non usate + con features).\n` +
      `(Nuove in senso lato: ${stats.unusedTotal}; con flag DB esplicito false: ${stats.unusedExplicitFalse})\n\n` +
      `Continuare?`
    )

    if (!confirmed) return

    setIsTraining(true)
    setTrainingProgress({ progress: 0, status: 'starting' })
    showMessage('info', '🚀 Avvio training...', 5000)

    try {
      const cloudRunUrl = process.env.NEXT_PUBLIC_CLOUD_RUN_URL
      if (!cloudRunUrl) {
        throw new Error('Cloud Run URL non configurato (NEXT_PUBLIC_CLOUD_RUN_URL)')
      }
      const response = await fetch(`${cloudRunUrl}/train-model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          min_photos: 100,
          client_counts: {
            unused_loose: stats.unusedTotal,
            unused_strict_false: stats.unusedExplicitFalse,
            unused_with_features: ready,
            unused_valid_ready: stats.unusedValidReady,
            unused_invalid_ready: stats.unusedInvalidReady
          }
        })
      })

      if (!response.ok) {
        let msg = `HTTP ${response.status}`
        try {
          const errorData = await response.json()
          msg = errorData.error || errorData.message || msg
        } catch {
          try {
            msg = (await response.text()) || msg
          } catch { /* ignore */ }
        }
        throw new Error(msg)
      }

      const data = await response.json()

      if (data.success) {
        localStorage.setItem('training_active_version', data.version)
        showMessage('success', '✅ Training avviato!', 5000)
        pollTrainingStatus(data.version)
      } else {
        throw new Error(data.error || 'Failed to start training')
      }

    } catch (error) {
      console.error('Training error:', error)
      showMessage('error', `❌ Errore: ${error.message}`)
      setIsTraining(false)
      setTrainingProgress(null)
    }
  }

  const pollTrainingStatus = (version) => {
    const pollInterval = setInterval(async () => {
      try {
        const cloudRunUrl = process.env.NEXT_PUBLIC_CLOUD_RUN_URL
        const response = await fetch(`${cloudRunUrl}/training-status/${version}`)

        if (!response.ok) {
          throw new Error('Failed to get training status')
        }

        const data = await response.json()

        if (data.status === 'completed') {
          clearInterval(pollInterval)
          localStorage.removeItem('training_active_version')
          setIsTraining(false)
          setTrainingProgress(null)

          showMessage(
            'success',
            `🎉 Training completato! Accuracy: ${(data.train_accuracy * 100).toFixed(1)}%`,
            10000
          )

          await loadStats()
        } else if (data.status === 'training') {
          setTrainingProgress({
            progress: data.progress || 50,
            status: data.message || 'Training in corso...'
          })
        } else if (data.status === 'failed') {
          clearInterval(pollInterval)
          localStorage.removeItem('training_active_version')
          setIsTraining(false)
          setTrainingProgress(null)
          showMessage('error', `❌ Training fallito: ${data.error}`)
        }

      } catch (error) {
        console.error('Polling error:', error)
        // Non stoppo il polling per errori temporanei di rete
      }
    }, 5000) // Poll ogni 5 secondi

    // Cleanup function stored in component
    return () => clearInterval(pollInterval)
  }

  const handlePhotoCapture = async (blob, isValid) => {
    setIsProcessing(true)
    setUploadProgress(0)

    try {
      console.log('🔵 START upload', { blobSize: blob?.size, isValid })

      // Step 1: Compress (20%)
      setUploadProgress(20)
      showMessage('info', '📦 Compressione...')
      const compressedBlob = await compressForTraining(blob)
      console.log('🔵 Compressed', { size: compressedBlob?.size })

      // Step 2: Cloud Run fa TUTTO (upload + features + DB)
      setUploadProgress(40)
      showMessage('info', '☁️ Upload e estrazione features...')

      // Generate unique filename: label_timestamp_randomId.jpg
      const timestamp = Date.now()
      const randomId = Math.random().toString(36).substring(2, 9)
      const label = isValid ? 'valid' : 'invalid'
      const uniqueFilename = `${label}_${timestamp}_${randomId}.jpg`
      console.log('🔵 Filename', uniqueFilename)

      const formData = new FormData()
      formData.append('photo', compressedBlob, uniqueFilename)
      formData.append('label', label)
      formData.append('uploaded_by', 'training-app')

      const cloudRunUrl = process.env.NEXT_PUBLIC_CLOUD_RUN_URL
      console.log('🔵 URL', cloudRunUrl)

      if (!cloudRunUrl) {
        throw new Error('Cloud Run URL non configurato')
      }

      console.log('🔵 Fetching...', `${cloudRunUrl}/upload-training-photo`)
      const response = await fetch(`${cloudRunUrl}/upload-training-photo`, {
        method: 'POST',
        body: formData
      })

      console.log('🔵 Response', response.status, response.statusText)

      if (!response.ok) {
        let errorMsg = `HTTP ${response.status}`
        try {
          const errorData = await response.json()
          errorMsg = errorData.error || errorMsg
          console.error('🔴 Error data', errorData)
        } catch (e) {
          console.error('🔴 Failed to parse error', e)
        }
        throw new Error(errorMsg)
      }

      const data = await response.json()
      console.log('🔵 Success', data)

      // Step 3: Refresh stats
      setUploadProgress(100)
      await loadStats()

      showMessage('success', `✅ Foto caricata con ${data.features_extracted} features!`)
      setMode(null)

    } catch (error) {
      console.error('🔴 Upload error:', error)
      // Mostra errore dettagliato all'utente
      const errorMsg = error.message || 'Unknown error'
      showMessage('error', `❌ ${errorMsg}`, 8000)
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
              <div className="text-3xl font-bold text-green-600">{stats.unusedValid}</div>
              <div className="text-sm text-gray-600 mt-1">✅ Valide (nuove)</div>
              {stats.valid > stats.unusedValid && (
                <div className="text-xs text-gray-400 mt-0.5">{stats.valid} totali</div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow-md p-4 text-center">
              <div className="text-3xl font-bold text-red-600">{stats.unusedInvalid}</div>
              <div className="text-sm text-gray-600 mt-1">❌ Non Valide (nuove)</div>
              {stats.invalid > stats.unusedInvalid && (
                <div className="text-xs text-gray-400 mt-0.5">{stats.invalid} totali</div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow-md p-4 text-center">
              <div className="text-3xl font-bold text-blue-600">{stats.unusedReadyForTraining ?? stats.unusedTotal}</div>
              <div className="text-sm text-gray-600 mt-1">📊 Pronte per il train</div>
              <div className="text-xs text-gray-500 mt-1">(non usate + con features)</div>
              {(stats.unusedTotal !== stats.unusedReadyForTraining) && (
                <div className="text-xs text-amber-600 mt-1">Altrimenti “nuove”: {stats.unusedTotal}</div>
              )}
              {stats.total > stats.unusedTotal && (
                <div className="text-xs text-gray-400 mt-0.5">{stats.total} totali in DB</div>
              )}
            </div>
          </>
        )}
      </div>

      {!statsLoading && stats.unusedTotal > (stats.unusedExplicitFalse ?? 0) && (
        <div className="max-w-4xl mx-auto mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Attenzione:</strong> alcune foto hanno <code>used_in_training</code> a <strong>NULL</strong>.
          La UI le considera “nuove”, ma molti backend contano solo <code>false</code> esplicito e rispondono “not enough photos”.
          In Supabase SQL: <code className="select-all">UPDATE training_photos SET used_in_training = false WHERE used_in_training IS NULL;</code>
        </div>
      )}

      {!statsLoading && (stats.photosMissingFeatures ?? 0) > 0 && (
        <div className="max-w-4xl mx-auto mb-4 rounded-lg border border-orange-300 bg-orange-50 p-4 text-sm text-orange-900 space-y-3">
          <p>
            <strong>Features mancanti:</strong> {stats.photosMissingFeatures} foto nel database senza vettore di features
            {stats.unusedTotal > (stats.unusedReadyForTraining ?? 0) && (
              <> (di cui ~{stats.unusedTotal - (stats.unusedReadyForTraining ?? 0)} ancora &quot;nuove&quot; per il training)</>
            )}
            . Il train le ignora finché non sono estratte.
          </p>
          <p className="text-xs text-orange-800 opacity-90">
            Richiede <code className="bg-orange-100 px-1 rounded">CLOUD_RUN_SECRET_KEY</code> in <code>.env.local</code> (stesso Bearer accettato da <code>/backfill-features</code> su Cloud Run).
          </p>
          <button
            type="button"
            onClick={handleBackfillFeatures}
            disabled={backfillLoading || isTraining}
            className={`w-full sm:w-auto px-5 py-2.5 rounded-lg font-semibold text-white shadow ${
              backfillLoading || isTraining
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-orange-600 hover:bg-orange-700'
            }`}
          >
            {backfillLoading ? '⏳ Estrazione in corso…' : '🔧 Estrai features (Cloud Run)'}
          </button>
        </div>
      )}

      {/* Training Ready Banner */}
      {!statsLoading && stats.unusedValid >= 50 && stats.unusedInvalid >= 50 && (
        <div className="max-w-4xl mx-auto mb-6">
          <div className="bg-gradient-to-r from-green-500 to-blue-500 text-white rounded-lg shadow-lg p-6 text-center">
            <div className="text-4xl mb-2">🎉</div>
            <div className="text-2xl font-bold mb-2">Dataset Completo!</div>
            <p className="text-lg">50 foto valide e 50 foto invalide raccolte.</p>
            <p className="text-sm opacity-90 mt-2">Puoi iniziare il training del modello!</p>
          </div>
        </div>
      )}

      {/* Training Button: stesse soglie del dataset + solo foto che il backend può usare (features) */}
      {!statsLoading &&
        (stats.unusedReadyForTraining ?? 0) >= 100 &&
        (stats.unusedValidReady ?? 0) >= 50 &&
        (stats.unusedInvalidReady ?? 0) >= 50 &&
        !isTraining && (
        <div className="max-w-4xl mx-auto mb-6">
          <button
            onClick={handleTrainModel}
            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-8 py-4 rounded-lg font-bold shadow-lg hover:opacity-90 transition-opacity active:scale-95"
          >
            <div className="text-2xl mb-1">🧠 TRAIN NUOVO MODELLO</div>
            <div className="text-sm opacity-90">
              ({stats.unusedReadyForTraining} con features — valide {stats.unusedValidReady} / invalide {stats.unusedInvalidReady})
            </div>
          </button>
        </div>
      )}

      {/* Training Progress Widget */}
      {isTraining && trainingProgress && (
        <div className="max-w-4xl mx-auto mb-6">
          <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-6 shadow-lg">
            <div className="text-center mb-4">
              <div className="text-2xl font-bold text-yellow-800 mb-2">
                🔄 Training in corso... {trainingProgress.progress}%
              </div>
              <p className="text-sm text-yellow-700">{trainingProgress.status}</p>
            </div>

            <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
              <div
                className="bg-gradient-to-r from-purple-600 to-indigo-600 h-4 rounded-full transition-all duration-500"
                style={{ width: `${trainingProgress.progress}%` }}
              />
            </div>

            <p className="text-center text-sm text-purple-600 font-medium mt-4">
              ✅ Il training continua anche se chiudi o aggiorni la pagina
            </p>
          </div>
        </div>
      )}

      {/* Camera Buttons */}
      {!mode && !isProcessing && (
        <div className="max-w-4xl mx-auto grid grid-cols-2 gap-4 mb-6">
          {/* Valid Photo Button */}
          <button
            onClick={() => setMode('valid')}
            disabled={!stats.canUpload || stats.unusedValid >= 50 || isTraining}
            className={`p-6 rounded-lg shadow-md font-semibold text-lg transition-all ${
              stats.canUpload && stats.unusedValid < 50 && !isTraining
                ? 'bg-green-500 text-white hover:bg-green-600 active:scale-95'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-50'
            }`}
          >
            ✅ Foto VALIDA
          </button>

          {/* Invalid Photo Button */}
          <button
            onClick={() => setMode('invalid')}
            disabled={!stats.canUpload || stats.unusedInvalid >= 50 || isTraining}
            className={`p-6 rounded-lg shadow-md font-semibold text-lg transition-all ${
              stats.canUpload && stats.unusedInvalid < 50 && !isTraining
                ? 'bg-red-500 text-white hover:bg-red-600 active:scale-95'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-50'
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

      {/* Bottom Bar - Training persistente o Timer sessione */}
      <div className={`fixed bottom-0 left-0 right-0 border-t-2 shadow-lg z-40 ${
        isTraining ? 'bg-purple-50 border-purple-400' : 'bg-white border-gray-200'
      }`}>
        {isTraining && trainingProgress ? (
          <div className="px-4 py-3">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-1">
                <span className="text-purple-800 font-bold text-sm">
                  🧠 Training in corso... {trainingProgress.progress}%
                </span>
                <span className="text-purple-600 text-xs">{trainingProgress.status}</span>
              </div>
              <div className="w-full bg-purple-200 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-purple-600 to-indigo-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${trainingProgress.progress}%` }}
                />
              </div>
            </div>
          </div>
        ) : isAuthenticated ? (
          <div className="p-4">
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
        ) : null}
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
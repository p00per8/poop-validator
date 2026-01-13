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
  const [capturedPhoto, setCapturedPhoto] = useState(null)
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

  // Auto-hide message after 5 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [message])

  function handleLogin(e) {
    e.preventDefault()
    
    const correctPassword = process.env.NEXT_PUBLIC_TRAINING_PASSWORD || 'defaultpass'
    
    if (password === correctPassword) {
      const expiry = Date.now() + (30 * 60 * 1000)
      localStorage.setItem('training_session_expiry', expiry.toString())
      setIsAuthenticated(true)
      setSessionExpiry(expiry)
      setPassword('')
      setMessage({ type: 'success', text: '✅ Accesso effettuato con successo!' })
    } else {
      setMessage({ type: 'error', text: '❌ Password non corretta' })
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
      setMessage({ type: 'error', text: '❌ Errore nel caricamento delle statistiche' })
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

  function handlePhotoCapture(photoBlob) {
    // Salva la foto catturata per conferma
    setCapturedPhoto(photoBlob)
  }

  function handlePhotoDiscard() {
    setCapturedPhoto(null)
  }

  async function handlePhotoConfirm() {
    if (!stats.canUpload) {
      setMessage({ 
        type: 'error', 
        text: '⚠️ Spazio di archiviazione pieno! Esegui il training per liberare spazio.' 
      })
      setCapturedPhoto(null)
      setMode(null)
      return
    }

    setIsProcessing(true)
    setMessage({ type: 'info', text: '⏳ Compressione immagine in corso...' })

    try {
      const compressedBlob = await compressForTraining(capturedPhoto)
      setMessage({ type: 'info', text: '🔍 Estrazione delle caratteristiche...' })

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
        throw new Error(error.error || 'Errore durante il caricamento')
      }

      const result = await response.json()

      setMessage({ 
        type: 'success', 
        text: `✅ Grazie! Foto salvata con successo. ${result.features_extracted} caratteristiche estratte.` 
      })

      await Promise.all([loadStats(), checkStorage()])

    } catch (error) {
      console.error('Error uploading photo:', error)
      setMessage({ 
        type: 'error', 
        text: `❌ Errore durante il salvataggio: ${error.message}` 
      })
    } finally {
      setIsProcessing(false)
      setCapturedPhoto(null)
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
        throw new Error(result.error || 'Errore durante il training')
      }

      setMessage({
        type: 'success',
        text: `✅ Training completato! Accuratezza: ${result.accuracy}% | Spazio liberato: ${result.space_freed_mb} MB`
      })

      await Promise.all([loadStats(), checkStorage()])

    } catch (error) {
      console.error('Training error:', error)
      setMessage({
        type: 'error',
        text: `❌ Errore durante il training: ${error.message}`
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

        {/* Message Snackbar */}
        {message && (
          <div className={`mb-6 p-4 rounded-xl shadow-lg animate-slide-down ${
            message.type === 'success' ? 'bg-green-100 text-green-800 border-2 border-green-300' :
            message.type === 'error' ? 'bg-red-100 text-red-800 border-2 border-red-300' :
            'bg-blue-100 text-blue-800 border-2 border-blue-300'
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
            <div className="text-gray-600 text-sm mt-1">✅ Valide</div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 text-center">
            <div className="text-4xl font-bold text-red-600">{stats.invalid}</div>
            <div className="text-gray-600 text-sm mt-1">❌ Non Valide</div>
          </div>
        </div>

        {/* Storage Monitor */}
        <StorageMonitor 
          used={stats.storageUsed}
          limit={stats.storageLimit}
          canUpload={stats.canUpload}
        />

        {/* Camera Mode */}
        {mode && !capturedPhoto && !isProcessing && (
          <div className="fixed inset-0 z-50 bg-black">
            <Camera
              label={mode}
              onCapture={handlePhotoCapture}
              onCancel={() => setMode(null)}
              fullscreen={true}
            />
          </div>
        )}

        {/* Photo Confirmation */}
        {capturedPhoto && !isProcessing && (
          <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-4">
            <div className="max-w-2xl w-full">
              <img 
                src={URL.createObjectURL(capturedPhoto)} 
                alt="Preview" 
                className="w-full rounded-2xl shadow-2xl mb-6"
              />
              
              <div className="bg-white rounded-2xl p-6 shadow-2xl">
                <p className="text-center text-xl font-semibold text-gray-800 mb-6">
                  Confermi questa foto come <span className={mode === 'valid' ? 'text-green-600' : 'text-red-600'}>
                    {mode === 'valid' ? 'VALIDA' : 'NON VALIDA'}
                  </span>?
                </p>
                
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={handlePhotoDiscard}
                    className="bg-gray-600 hover:bg-gray-700 text-white py-4 rounded-xl text-lg font-bold shadow-lg transition transform active:scale-95"
                  >
                    ❌ Scarta
                  </button>
                  <button
                    onClick={handlePhotoConfirm}
                    className="bg-green-600 hover:bg-green-700 text-white py-4 rounded-xl text-lg font-bold shadow-lg transition transform active:scale-95"
                  >
                    ✓ Conferma
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Processing Overlay */}
        {isProcessing && (
          <div className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin text-8xl mb-6">🔄</div>
              <p className="text-white text-2xl font-bold">Elaborazione in corso...</p>
              <p className="text-gray-300 text-lg mt-2">{message?.text}</p>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {!mode && !isProcessing && !capturedPhoto && (
          <div className="grid grid-cols-2 gap-4 mb-6">
            <button
              onClick={() => setMode('valid')}
              disabled={!stats.canUpload}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white py-8 rounded-2xl text-xl font-bold shadow-xl transition transform active:scale-95"
            >
              📸 SCATTA VALIDA
            </button>
            <button
              onClick={() => setMode('invalid')}
              disabled={!stats.canUpload}
              className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white py-8 rounded-2xl text-xl font-bold shadow-xl transition transform active:scale-95"
            >
              📸 SCATTA NON VALIDA
            </button>
          </div>
        )}

        {/* Retrain Button */}
        {stats.total >= 100 && !isRetraining && (
          <button
            onClick={triggerRetrain}
            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white py-6 rounded-2xl text-xl font-bold shadow-2xl transition transform active:scale-95"
          >
            🧠 AVVIA TRAINING ({stats.total} foto pronte)
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

      <style jsx>{`
        @keyframes slide-down {
          from {
            transform: translateY(-100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slide-down {
          animation: slide-down 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}
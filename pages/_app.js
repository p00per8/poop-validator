import { useState, useEffect, useCallback } from 'react'
import '../styles/globals.css'

function TrainingStatusBar() {
  const [training, setTraining] = useState(null) // { version, status, accuracy?, error? }

  const checkStatus = useCallback(async (version) => {
    const cloudRunUrl = process.env.NEXT_PUBLIC_CLOUD_RUN_URL
    if (!cloudRunUrl) return
    try {
      const res = await fetch(`${cloudRunUrl}/training-status/${version}`)
      if (!res.ok) return
      const data = await res.json()

      if (data.status === 'training') {
        setTraining({ version, status: 'training' })
      } else if (data.status === 'completed') {
        localStorage.removeItem('training_active_version')
        setTraining({ version, status: 'completed', accuracy: data.train_accuracy })
        setTimeout(() => setTraining(null), 10000)
      } else if (data.status === 'failed') {
        localStorage.removeItem('training_active_version')
        setTraining({ version, status: 'failed', error: data.error })
        setTimeout(() => setTraining(null), 10000)
      } else {
        localStorage.removeItem('training_active_version')
        setTraining(null)
      }
    } catch (_) {
      // ignora errori di rete temporanei
    }
  }, [])

  useEffect(() => {
    const version = localStorage.getItem('training_active_version')
    if (!version) return

    setTraining({ version, status: 'training' })
    checkStatus(version)

    const interval = setInterval(() => {
      const v = localStorage.getItem('training_active_version')
      if (v) {
        checkStatus(v)
      } else {
        clearInterval(interval)
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [checkStatus])

  if (!training) return null

  const barStyle = {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    padding: '10px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '14px',
    fontFamily: 'sans-serif',
    boxShadow: '0 -2px 8px rgba(0,0,0,0.2)',
    background: training.status === 'completed' ? '#15803d'
      : training.status === 'failed' ? '#b91c1c'
      : '#1e40af',
    color: 'white',
  }

  return (
    <div style={barStyle}>
      {training.status === 'training' && (
        <>
          <span style={{ fontSize: 16 }}>⚙️</span>
          <span>
            <strong>Training {training.version}</strong> in corso...
          </span>
          <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.25)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: '40%',
              height: '100%',
              background: 'rgba(255,255,255,0.8)',
              borderRadius: 2,
              animation: 'training-slide 1.5s ease-in-out infinite',
            }} />
          </div>
          <span style={{ fontSize: 12, opacity: 0.8 }}>Non chiudere l&apos;app</span>
        </>
      )}
      {training.status === 'completed' && (
        <span>
          ✅ Training <strong>{training.version}</strong> completato!
          {training.accuracy != null && ` Accuracy: ${(training.accuracy * 100).toFixed(1)}%`}
        </span>
      )}
      {training.status === 'failed' && (
        <span>
          ❌ Training <strong>{training.version}</strong> fallito
          {training.error && `: ${training.error}`}
        </span>
      )}
      <style>{`
        @keyframes training-slide {
          0%   { transform: translateX(-100%) }
          50%  { transform: translateX(250%) }
          100% { transform: translateX(-100%) }
        }
      `}</style>
    </div>
  )
}

function MyApp({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      <TrainingStatusBar />
    </>
  )
}

export default MyApp

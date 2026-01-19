import { useRef, useState, useEffect } from 'react'

export default function Camera({ onCapture, onCancel, label, fullscreen = false }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [hasFlash, setHasFlash] = useState(false)
  const [flashEnabled, setFlashEnabled] = useState(false)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    startCamera()
    return () => {
      stopCamera()
    }
  }, [])

  async function startCamera() {
    try {
      // Request camera with ideal settings
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      })

      streamRef.current = stream
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }

      // Check if flash is available
      const track = stream.getVideoTracks()[0]
      const capabilities = track.getCapabilities()
      
      if (capabilities.torch) {
        setHasFlash(true)
      }

      setIsReady(true)

    } catch (error) {
      console.error('Error accessing camera:', error)
      alert('Impossibile accedere alla fotocamera: ' + error.message)
      onCancel()
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop()
      })
    }
  }

  async function toggleFlash() {
    if (!streamRef.current || !hasFlash) return

    try {
      const track = streamRef.current.getVideoTracks()[0]
      const newFlashState = !flashEnabled
      
      await track.applyConstraints({
        advanced: [{ torch: newFlashState }]
      })
      
      setFlashEnabled(newFlashState)
    } catch (error) {
      console.error('Error toggling flash:', error)
    }
  }

  async function capturePhoto() {
    if (!videoRef.current) return

    try {
      const canvas = document.createElement('canvas')
      canvas.width = videoRef.current.videoWidth
      canvas.height = videoRef.current.videoHeight
      
      const ctx = canvas.getContext('2d')
      ctx.drawImage(videoRef.current, 0, 0)

      canvas.toBlob((blob) => {
        if (blob) {
          stopCamera()
          onCapture(blob, label === 'valid')
        }
      }, 'image/jpeg', 0.95)

    } catch (error) {
      console.error('Error capturing photo:', error)
      alert('Errore durante lo scatto: ' + error.message)
    }
  }

  const containerClass = fullscreen
    ? 'fixed inset-0 z-50 bg-black'
    : 'relative'

  return (
    <div className={containerClass}>
      {/* Video Stream */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={fullscreen ? 'w-full h-full object-cover' : 'w-full rounded-lg'}
      />

      {/* Controls Overlay */}
      <div className={`${
        fullscreen 
          ? 'absolute inset-x-0 bottom-0 pb-safe' 
          : 'mt-4'
      }`}>
        <div className="flex items-center justify-center space-x-6 p-6">
          {/* Cancel Button */}
          <button
            onClick={() => {
              stopCamera()
              onCancel()
            }}
            className="w-16 h-16 rounded-full bg-gray-200 text-gray-800 flex items-center justify-center text-2xl font-bold shadow-lg hover:bg-gray-300 transition"
          >
            ✕
          </button>

          {/* Capture Button */}
          <button
            onClick={capturePhoto}
            disabled={!isReady}
            className={`w-20 h-20 rounded-full flex items-center justify-center shadow-xl transition ${
              label === 'valid'
                ? 'bg-green-500 hover:bg-green-600'
                : 'bg-red-500 hover:bg-red-600'
            } ${!isReady ? 'opacity-50' : ''}`}
          >
            <div className="w-16 h-16 rounded-full bg-white border-4 border-current" />
          </button>

          {/* Flash Button */}
          {hasFlash && (
            <button
              onClick={toggleFlash}
              className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl shadow-lg transition ${
                flashEnabled
                  ? 'bg-yellow-400 text-yellow-900 hover:bg-yellow-500'
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
            >
              {flashEnabled ? '⚡' : '🔦'}
            </button>
          )}
        </div>

        {/* Label */}
        {fullscreen && (
          <div className="text-center pb-4">
            <div className={`inline-block px-6 py-2 rounded-full font-bold text-white ${
              label === 'valid' ? 'bg-green-500' : 'bg-red-500'
            }`}>
              {label === 'valid' ? '✅ VALID' : '❌ INVALID'}
            </div>
          </div>
        )}
      </div>

      {/* Loading Indicator */}
      {!isReady && fullscreen && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="text-center">
            <div className="loading-spinner mx-auto mb-4" style={{ borderColor: 'white', borderTopColor: 'transparent' }} />
            <p className="text-white">Avvio fotocamera...</p>
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useRef, useEffect } from 'react'

export default function Camera({ onCapture, onCancel, label }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [stream, setStream] = useState(null)
  const [photo, setPhoto] = useState(null)
  const [error, setError] = useState(null)
  const [facingMode, setFacingMode] = useState('environment') // 'user' or 'environment'

  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [facingMode])

  const startCamera = async () => {
    try {
      setError(null)
      
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1920 }
        }
      })
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
      }
      setStream(mediaStream)
    } catch (err) {
      console.error('Camera error:', err)
      setError('Impossibile accedere alla fotocamera. Verifica i permessi.')
    }
  }

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
    }
  }

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current

    // Set canvas size to video size
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    // Draw video frame to canvas
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0)

    // Convert to blob
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob)
        setPhoto({ blob, url })
      }
    }, 'image/jpeg', 0.95)
  }

  const confirmPhoto = () => {
    if (photo) {
      stopCamera()
      onCapture(photo.blob)
    }
  }

  const retakePhoto = () => {
    if (photo) {
      URL.revokeObjectURL(photo.url)
    }
    setPhoto(null)
  }

  const handleCancel = () => {
    stopCamera()
    if (photo) {
      URL.revokeObjectURL(photo.url)
    }
    onCancel()
  }

  const switchCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user')
  }

  if (error) {
    return (
      <div className="camera-container">
        <div className="result-error">
          <p className="text-lg font-medium mb-4">❌ {error}</p>
          <button onClick={handleCancel} className="btn btn-secondary">
            Chiudi
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="camera-container">
      {!photo ? (
        <>
          <div className="relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="camera-preview"
            />
            {label && (
              <div className="absolute top-4 left-4 bg-black bg-opacity-70 text-white px-4 py-2 rounded-lg">
                <span className="font-medium">
                  {label === 'valid' ? '✅ FOTO VALIDA' : '❌ FOTO INVALIDA'}
                </span>
              </div>
            )}
          </div>

          <canvas ref={canvasRef} style={{ display: 'none' }} />

          <div className="flex gap-4 mt-6">
            <button onClick={handleCancel} className="btn btn-secondary flex-1">
              Annulla
            </button>
            <button onClick={switchCamera} className="btn btn-secondary">
              🔄
            </button>
            <button onClick={capturePhoto} className="btn btn-primary flex-1">
              📸 Scatta
            </button>
          </div>
        </>
      ) : (
        <>
          <img src={photo.url} alt="Preview" className="camera-preview" />

          <div className="mt-6 space-y-4">
            <p className="text-center text-gray-600">
              Conferma questa foto?
            </p>
            <div className="flex gap-4">
              <button onClick={retakePhoto} className="btn btn-secondary flex-1">
                🔄 Riscatta
              </button>
              <button onClick={confirmPhoto} className="btn btn-success flex-1">
                ✓ Conferma
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

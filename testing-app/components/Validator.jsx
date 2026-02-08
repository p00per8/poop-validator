import { useState, useRef } from 'react'

export default function Validator({ photoBlob, onReset }) {
  const [result, setResult] = useState(null)
  const [isValidating, setIsValidating] = useState(false)
  const imageRef = useRef(null)

  const handleValidate = async () => {
    if (!photoBlob) return

    setIsValidating(true)
    setResult(null)

    try {
      const cloudRunUrl = process.env.NEXT_PUBLIC_CLOUD_RUN_URL

      if (!cloudRunUrl) {
        throw new Error('Cloud Run URL not configured')
      }

      const formData = new FormData()
      formData.append('photo', photoBlob, 'photo.jpg')

      const response = await fetch(`${cloudRunUrl}/validate-photo`, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Validation failed')
      }

      const data = await response.json()

      // Transform Cloud Run response to component format
      setResult({
        valid: data.valid,
        confidence: Math.round(data.confidence * 100),
        message: data.valid
          ? '✅ Foto valida e conforme ai requisiti'
          : data.reason || 'Foto non conforme ai requisiti',
        category: data.valid ? 'success' : 'error',
        modelVersion: data.model_version,
        suspiciousFeatures: data.suspicious_features || []
      })

    } catch (error) {
      console.error('Validation error:', error)
      setResult({
        valid: false,
        confidence: 0,
        message: '❌ Errore validazione: ' + error.message,
        category: 'error'
      })
    } finally {
      setIsValidating(false)
    }
  }

  // Auto-validate on mount
  useState(() => {
    if (photoBlob) {
      // Wait for image to load
      const img = imageRef.current
      if (img) {
        if (img.complete) {
          handleValidate()
        } else {
          img.onload = handleValidate
        }
      }
    }
  }, [photoBlob])

  if (!photoBlob) return null

  const photoUrl = URL.createObjectURL(photoBlob)

  return (
    <div className="space-y-6">
      {/* Photo Preview */}
      <div className="relative">
        <img
          ref={imageRef}
          src={photoUrl}
          alt="Photo to validate"
          className="w-full max-w-md mx-auto rounded-xl shadow-lg"
          crossOrigin="anonymous"
        />
        {isValidating && (
          <div className="absolute inset-0 bg-black bg-opacity-50 rounded-xl flex items-center justify-center">
            <div className="text-center">
              <div className="loading-spinner mb-4" />
              <p className="text-white font-medium">
                🤖 Validazione in corso...
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Result */}
      {result && !isValidating && (
        <div className={
          result.category === 'success' ? 'result-success' :
          result.category === 'warning' ? 'result-warning' :
          'result-error'
        }>
          <div className="text-4xl mb-4">
            {result.valid ? '✅' : '❌'}
          </div>
          
          <h2 className="text-2xl font-bold mb-2">
            {result.valid ? 'FOTO VALIDA' : 'FOTO NON VALIDA'}
          </h2>
          
          <p className="text-lg mb-4">
            {result.message}
          </p>
          
          <div className="inline-block bg-white bg-opacity-50 px-4 py-2 rounded-lg">
            <p className="text-sm font-medium">
              Confidenza: {result.confidence}%
            </p>
          </div>

          {result.modelVersion && (
            <div className="mt-2">
              <p className="text-xs text-gray-700 opacity-75">
                Modello: {result.modelVersion}
              </p>
            </div>
          )}

          {result.valid && (
            <div className="mt-6 p-4 bg-white bg-opacity-50 rounded-lg text-left">
              <p className="text-sm font-medium mb-2">✅ Requisiti soddisfatti:</p>
              <ul className="text-sm space-y-1">
                <li>• Soggetto riconosciuto correttamente</li>
                <li>• Qualità immagine sufficiente</li>
                <li>• Illuminazione adeguata</li>
              </ul>
            </div>
          )}

          {!result.valid && result.category !== 'error' && result.message && (
            <div className="mt-6 p-4 bg-white bg-opacity-50 rounded-lg text-left">
              <p className="text-sm font-medium mb-2">⚠️ Motivo:</p>
              <p className="text-sm">{result.message}</p>

              {result.suspiciousFeatures && result.suspiciousFeatures.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium mb-1">Caratteristiche sospette:</p>
                  <ul className="text-xs space-y-1">
                    {result.suspiciousFeatures.slice(0, 3).map((feature, idx) => (
                      <li key={idx}>• {feature}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-4">
        <button
          onClick={onReset}
          className="btn btn-secondary flex-1"
        >
          🔄 Scatta un'altra foto
        </button>
        
        {result && !result.valid && (
          <button
            onClick={handleValidate}
            className="btn btn-primary flex-1"
            disabled={isValidating}
          >
            🔄 Riprova validazione
          </button>
        )}
      </div>

      {/* Debug Info (only in development) */}
      {process.env.NODE_ENV === 'development' && result && (
        <details className="card text-xs">
          <summary className="cursor-pointer font-medium">
            🔍 Debug Info
          </summary>
          <pre className="mt-2 overflow-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </details>
      )}
    </div>
  )
}

import { useState, useRef } from 'react'
import { validatePhoto } from '../../shared/lib/tfjs-model'

export default function Validator({ photoBlob, onReset }) {
  const [result, setResult] = useState(null)
  const [isValidating, setIsValidating] = useState(false)
  const imageRef = useRef(null)

  const handleValidate = async () => {
    if (!photoBlob || !imageRef.current) return

    setIsValidating(true)
    setResult(null)

    try {
      // Small delay for UX (shows loading state)
      await new Promise(resolve => setTimeout(resolve, 500))

      const validationResult = await validatePhoto(imageRef.current)
      setResult(validationResult)
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
              Confidence: {result.confidence}%
            </p>
          </div>

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

          {!result.valid && result.category === 'warning' && (
            <div className="mt-6 p-4 bg-white bg-opacity-50 rounded-lg text-left">
              <p className="text-sm font-medium mb-2">💡 Suggerimenti:</p>
              <ul className="text-sm space-y-1">
                <li>• Migliora l'illuminazione</li>
                <li>• Avvicina la camera</li>
                <li>• Riduci ombre e riflessi</li>
              </ul>
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

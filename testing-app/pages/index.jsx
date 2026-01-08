import { useState } from 'react'
import Head from 'next/head'
import Camera from '../../shared/components/Camera'
import Validator from '../components/Validator'

export default function TestingApp() {
  const [photo, setPhoto] = useState(null)
  const [showCamera, setShowCamera] = useState(false)

  const handlePhotoCapture = (photoBlob) => {
    setPhoto(photoBlob)
    setShowCamera(false)
  }

  const handleReset = () => {
    if (photo) {
      URL.revokeObjectURL(URL.createObjectURL(photo))
    }
    setPhoto(null)
    setShowCamera(false)
  }

  const startCamera = () => {
    setShowCamera(true)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4 pb-20">
      <Head>
        <title>Photo Validator - Test AI</title>
        <meta name="description" content="Testa l'algoritmo di validazione fotografica" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 pt-8">
          <div className="inline-block p-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl mb-4">
            <span className="text-5xl">🤖</span>
          </div>
          
          <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Photo Validator
          </h1>
          
          <p className="text-gray-600 text-lg">
            Testa il nostro algoritmo AI di riconoscimento automatico
          </p>
        </div>

        {/* Main Content */}
        {!showCamera && !photo && (
          <div className="space-y-6">
            {/* Info Card */}
            <div className="card">
              <h2 className="text-xl font-semibold mb-3">
                Come funziona?
              </h2>
              <ol className="space-y-2 text-gray-700">
                <li className="flex items-start">
                  <span className="font-bold mr-2">1.</span>
                  Scatta una foto con la tua fotocamera
                </li>
                <li className="flex items-start">
                  <span className="font-bold mr-2">2.</span>
                  L'algoritmo AI analizzerà l'immagine in tempo reale
                </li>
                <li className="flex items-start">
                  <span className="font-bold mr-2">3.</span>
                  Ricevi il risultato istantaneo: valida o non valida
                </li>
              </ol>
            </div>

            {/* Features */}
            <div className="grid grid-cols-2 gap-4">
              <div className="card text-center">
                <div className="text-3xl mb-2">⚡</div>
                <h3 className="font-semibold mb-1">Veloce</h3>
                <p className="text-xs text-gray-600">
                  Risultato in 1-2 secondi
                </p>
              </div>
              <div className="card text-center">
                <div className="text-3xl mb-2">🔒</div>
                <h3 className="font-semibold mb-1">Privato</h3>
                <p className="text-xs text-gray-600">
                  Nessuna foto salvata
                </p>
              </div>
              <div className="card text-center">
                <div className="text-3xl mb-2">🎯</div>
                <h3 className="font-semibold mb-1">Preciso</h3>
                <p className="text-xs text-gray-600">
                  Algoritmo ML proprietario
                </p>
              </div>
              <div className="card text-center">
                <div className="text-3xl mb-2">📱</div>
                <h3 className="font-semibold mb-1">On-Device</h3>
                <p className="text-xs text-gray-600">
                  Processing locale
                </p>
              </div>
            </div>

            {/* CTA Button */}
            <button
              onClick={startCamera}
              className="btn btn-primary w-full text-xl py-6 shadow-lg hover:shadow-xl transition-shadow"
            >
              📸 Scatta Foto Test
            </button>

            {/* Privacy Note */}
            <div className="card bg-blue-50 border-blue-200">
              <p className="text-sm text-gray-700 text-center">
                🔒 <strong>Privacy garantita:</strong> Tutte le foto sono elaborate 
                localmente sul tuo dispositivo e non vengono mai salvate o inviate a server.
              </p>
            </div>
          </div>
        )}

        {/* Camera View */}
        {showCamera && !photo && (
          <Camera
            onCapture={handlePhotoCapture}
            onCancel={() => setShowCamera(false)}
          />
        )}

        {/* Validation View */}
        {photo && (
          <Validator
            photoBlob={photo}
            onReset={handleReset}
          />
        )}

        {/* Footer */}
        <div className="text-center mt-12 text-sm text-gray-500">
          <p>Powered by TensorFlow.js & MobileNetV3</p>
          <p className="mt-1">© 2024 - Prototipo MVP</p>
        </div>
      </div>
    </div>
  )
}

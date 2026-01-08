import * as tf from '@tensorflow/tfjs'

let model = null
let isLoading = false

/**
 * Load the TensorFlow.js model
 */
export async function loadModel() {
  if (model) return model
  
  if (isLoading) {
    // Wait for existing load to complete
    while (isLoading) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return model
  }

  isLoading = true
  
  try {
    console.log('Loading TensorFlow.js model...')
    model = await tf.loadLayersModel('/model/model.json')
    console.log('✅ Model loaded successfully')
    return model
  } catch (error) {
    console.error('❌ Failed to load model:', error)
    throw new Error('Model non disponibile. Esegui prima il training.')
  } finally {
    isLoading = false
  }
}

/**
 * Validate a photo using the ML model
 * @param {HTMLImageElement} imageElement 
 * @returns {Promise<{valid: boolean, confidence: number, message: string}>}
 */
export async function validatePhoto(imageElement) {
  try {
    const model = await loadModel()
    
    // Preprocess image
    const tensor = tf.browser.fromPixels(imageElement)
      .resizeBilinear([224, 224])  // Model input size
      .toFloat()
      .div(255.0)  // Normalize to [0, 1]
      .expandDims(0)  // Add batch dimension

    // Predict
    const prediction = await model.predict(tensor).data()
    const confidence = prediction[0]  // Probability [0-1]
    
    // Cleanup
    tensor.dispose()

    // Decision logic
    const confidencePercent = Math.round(confidence * 100)
    
    if (confidence > 0.75) {
      return {
        valid: true,
        confidence: confidencePercent,
        message: '✅ Foto valida!',
        category: 'success'
      }
    } else if (confidence > 0.4) {
      return {
        valid: false,
        confidence: confidencePercent,
        message: '⚠️ Foto poco chiara, riprova con migliore illuminazione',
        category: 'warning'
      }
    } else {
      // Try to detect reason for rejection
      const reason = await detectRejectionReason(imageElement)
      return {
        valid: false,
        confidence: confidencePercent,
        message: `❌ ${reason}`,
        category: 'error'
      }
    }
  } catch (error) {
    console.error('Validation error:', error)
    throw error
  }
}

/**
 * Detect reason for photo rejection (heuristic analysis)
 */
async function detectRejectionReason(imageElement) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  
  canvas.width = imageElement.width
  canvas.height = imageElement.height
  ctx.drawImage(imageElement, 0, 0)
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const pixels = imageData.data
  
  // Calculate color statistics
  let totalBrightness = 0
  let whitePixels = 0
  let darkPixels = 0
  const pixelCount = pixels.length / 4
  
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]
    const g = pixels[i + 1]
    const b = pixels[i + 2]
    const brightness = (r + g + b) / 3
    
    totalBrightness += brightness
    
    if (brightness > 220) whitePixels++
    if (brightness < 40) darkPixels++
  }
  
  const avgBrightness = totalBrightness / pixelCount
  const whitePercentage = (whitePixels / pixelCount) * 100
  const darkPercentage = (darkPixels / pixelCount) * 100
  
  // Heuristic rules for rejection reasons
  if (whitePercentage > 60) {
    return 'Troppa carta igienica o superficie troppo chiara'
  }
  
  if (darkPercentage > 70 || avgBrightness < 50) {
    return 'Foto troppo scura, migliora l\'illuminazione'
  }
  
  if (avgBrightness > 200) {
    return 'Foto sovraesposta, riduci luminosità'
  }
  
  // Check for blur (variance of Laplacian - approximation)
  const isBlurry = await checkBlur(imageElement)
  if (isBlurry) {
    return 'Foto sfocata, mantieni la camera ferma'
  }
  
  return 'Soggetto non riconosciuto o oggetto sbagliato'
}

/**
 * Check if image is blurry (simplified)
 */
async function checkBlur(imageElement) {
  // Simple blur detection: check edge sharpness
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  
  canvas.width = 100
  canvas.height = 100
  ctx.drawImage(imageElement, 0, 0, 100, 100)
  
  const imageData = ctx.getImageData(0, 0, 100, 100)
  const pixels = imageData.data
  
  // Calculate edge gradient variance
  let variance = 0
  for (let i = 0; i < pixels.length - 4; i += 4) {
    const diff = Math.abs(pixels[i] - pixels[i + 4])
    variance += diff
  }
  
  const avgVariance = variance / (pixels.length / 4)
  
  // Low variance = likely blurry
  return avgVariance < 10
}

/**
 * Get model info (for debugging)
 */
export async function getModelInfo() {
  const model = await loadModel()
  return {
    inputs: model.inputs.map(i => ({ name: i.name, shape: i.shape })),
    outputs: model.outputs.map(o => ({ name: o.name, shape: o.shape }))
  }
}

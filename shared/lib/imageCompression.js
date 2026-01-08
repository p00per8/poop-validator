/**
 * Comprime immagine per training dataset
 * Target: 512x512px, JPEG quality 65%, ~100KB
 * 
 * @param {File|Blob} file - Immagine originale
 * @returns {Promise<Blob>} - Immagine compressa
 */
export async function compressForTraining(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onerror = () => reject(new Error('Failed to read file'))
    
    reader.onload = (e) => {
      const img = new Image()
      
      img.onerror = () => reject(new Error('Failed to load image'))
      
      img.onload = () => {
        try {
          // Create canvas for resize + compress
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          
          // Calculate dimensions (maintain aspect ratio)
          const maxSize = 512
          let width = img.width
          let height = img.height
          
          if (width > height) {
            if (width > maxSize) {
              height = Math.round((height * maxSize) / width)
              width = maxSize
            }
          } else {
            if (height > maxSize) {
              width = Math.round((width * maxSize) / height)
              height = maxSize
            }
          }
          
          canvas.width = width
          canvas.height = height
          
          // Enable high-quality smoothing
          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = 'high'
          
          // Draw resized image
          ctx.drawImage(img, 0, 0, width, height)
          
          // Export as JPEG with 65% quality
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to compress image'))
                return
              }
              
              const originalSizeKB = (file.size / 1024).toFixed(1)
              const compressedSizeKB = (blob.size / 1024).toFixed(1)
              const ratio = ((1 - blob.size / file.size) * 100).toFixed(1)
              
              console.log(`✅ Compressed: ${originalSizeKB}KB → ${compressedSizeKB}KB (${ratio}% reduction)`)
              
              resolve(blob)
            },
            'image/jpeg',
            0.65
          )
        } catch (error) {
          reject(error)
        }
      }
      
      img.src = e.target.result
    }
    
    reader.readAsDataURL(file)
  })
}

/**
 * Converte Blob a Data URL per preview
 */
export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Calcola hash perceptual per duplicate detection (semplificato)
 */
export function simpleHash(imageData) {
  // Implementazione base: hash di dimensioni ridotte
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  
  canvas.width = 8
  canvas.height = 8
  
  const img = new Image()
  img.src = imageData
  
  return new Promise((resolve) => {
    img.onload = () => {
      ctx.drawImage(img, 0, 0, 8, 8)
      const data = ctx.getImageData(0, 0, 8, 8).data
      
      // Simple hash: average grayscale
      let sum = 0
      for (let i = 0; i < data.length; i += 4) {
        sum += (data[i] + data[i+1] + data[i+2]) / 3
      }
      const avg = sum / 64
      
      // Binary hash
      let hash = ''
      for (let i = 0; i < data.length; i += 4) {
        const gray = (data[i] + data[i+1] + data[i+2]) / 3
        hash += gray > avg ? '1' : '0'
      }
      
      resolve(hash)
    }
  })
}

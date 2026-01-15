import imageCompression from 'browser-image-compression'

/**
 * Comprimi immagine per training
 * Compressione RIDOTTA per qualità migliore
 */
export async function compressForTraining(blob) {
  const options = {
    maxSizeMB: 2,           // Max 2MB (era 0.5MB)
    maxWidthOrHeight: 1920, // Alta risoluzione
    quality: 0.85,          // 85% qualità (era 60%)
    useWebWorker: true,
    fileType: 'image/jpeg'
  }
  
  try {
    const compressedFile = await imageCompression(blob, options)
    console.log('Original:', (blob.size / 1024 / 1024).toFixed(2), 'MB')
    console.log('Compressed:', (compressedFile.size / 1024 / 1024).toFixed(2), 'MB')
    return compressedFile
  } catch (error) {
    console.error('Compression error:', error)
    return blob
  }
}
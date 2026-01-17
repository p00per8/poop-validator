import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '@supabase/supabase-js'
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend 
} from 'chart.js'
import { Bar } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale, 
  LinearScale, 
  BarElement,
  Title, 
  Tooltip, 
  Legend
)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default function TrainingDashboard() {
  const router = useRouter()
  const [stats, setStats] = useState(null)
  const [insights, setInsights] = useState(null)
  const [loading, setLoading] = useState(true)
  
  // NUOVI STATE per grafici e previsioni
  const [dailyActivities, setDailyActivities] = useState([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [prediction, setPrediction] = useState(null)
  const [activityLoading, setActivityLoading] = useState(false)

  // Imposta date predefinite (ultimi 7 giorni)
  useEffect(() => {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 7)
    
    setStartDate(start.toISOString().split('T')[0])
    setEndDate(end.toISOString().split('T')[0])
  }, [])

  useEffect(() => {
    loadDashboardData()
  }, [])

  // Carica attività quando le date sono pronte o quando cambiano
  useEffect(() => {
    if (startDate && endDate) {
      loadActivityData()
    }
  }, [startDate, endDate])

  async function loadDashboardData() {
    try {
      // Check total photos first
      const { data: allPhotos } = await supabase
        .from('training_photos')
        .select('id, label')

      const { data: photos, error } = await supabase
        .from('training_photos')
        .select('*')
        .not('features', 'is', null)

      if (error) throw error

      if (!photos || photos.length === 0) {
        setStats({
          total: 0,
          valid: 0,
          invalid: 0,
          missingFeatures: allPhotos?.length || 0
        })
        setLoading(false)
        return
      }

      const validPhotos = photos.filter(p => p.label === 'valid')
      const invalidPhotos = photos.filter(p => p.label === 'invalid')
      const missingFeaturesCount = (allPhotos?.length || 0) - photos.length

      setStats({
        total: photos.length,
        valid: validPhotos.length,
        invalid: invalidPhotos.length,
        storage_mb: (photos.reduce((sum, p) => sum + (p.file_size || 0), 0) / 1024 / 1024).toFixed(2),
        missingFeatures: missingFeaturesCount
      })

      if (validPhotos.length > 0 && invalidPhotos.length > 0) {
        const analysis = analyzeAndExplain(validPhotos, invalidPhotos)
        setInsights(analysis)
      }

      setLoading(false)
      
      // Carica dati attività dopo aver impostato le stats
      // Questo garantisce che le previsioni abbiano i dati necessari
      if (startDate && endDate) {
        loadActivityData()
      }

    } catch (error) {
      console.error('Error loading dashboard:', error)
      setLoading(false)
    }
  }

  async function loadActivityData() {
    setActivityLoading(true)
    try {
      // Attività giornaliere nel range
      const { data: rangePhotos } = await supabase
        .from('training_photos')
        .select('created_at, label')
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`)
        .order('created_at')

      // Aggrega per giorno
      const dailyMap = new Map()
      rangePhotos?.forEach(photo => {
        const date = photo.created_at.split('T')[0]
        const current = dailyMap.get(date) || { valid: 0, invalid: 0 }

        if (photo.label === 'valid') {
          current.valid++
        } else {
          current.invalid++
        }

        dailyMap.set(date, current)
      })

      const activities = Array.from(dailyMap.entries())
        .map(([date, counts]) => ({
          date,
          valid: counts.valid,
          invalid: counts.invalid,
          total: counts.valid + counts.invalid
        }))
        .sort((a, b) => a.date.localeCompare(b.date))

      setDailyActivities(activities)

      // Calcola previsioni - usa stats.total direttamente dallo state
      // Se stats è ancora null, le previsioni verranno calcolate al prossimo render
      const { data: allPhotos } = await supabase
        .from('training_photos')
        .select('id')

      const totalPhotos = allPhotos?.length || 0
      calculatePredictions(totalPhotos, activities)

    } catch (error) {
      console.error('Errore caricamento attività:', error)
    } finally {
      setActivityLoading(false)
    }
  }

  function calculatePredictions(totalPhotos, recentActivities) {
    // Media giornaliera ultimi 7 giorni con attività
    const last7Days = recentActivities.slice(-7)
    const avgPerDay = last7Days.length > 0
      ? last7Days.reduce((sum, day) => sum + day.total, 0) / last7Days.length
      : 0

    if (avgPerDay === 0) {
      setPrediction(null)
      return
    }

    // Scaglioni
    const milestones = [100, 200, 300, 500, 750, 1000, 1500, 2000]
    
    // Trova prossimo scaglione
    const nextMilestone = milestones.find(m => m > totalPhotos)
    
    if (!nextMilestone) {
      setPrediction({ message: '🎉 Hai superato tutti gli scaglioni!' })
      return
    }

    const photosNeeded = nextMilestone - totalPhotos
    const daysNeeded = Math.ceil(photosNeeded / avgPerDay)
    const estimatedDate = new Date()
    estimatedDate.setDate(estimatedDate.getDate() + daysNeeded)

    // Calcola anche gli altri scaglioni
    const allPredictions = milestones
      .filter(m => m > totalPhotos)
      .slice(0, 3)
      .map(milestone => {
        const needed = milestone - totalPhotos
        const days = Math.ceil(needed / avgPerDay)
        const date = new Date()
        date.setDate(date.getDate() + days)
        return {
          milestone,
          photosNeeded: needed,
          daysNeeded: days,
          estimatedDate: date.toLocaleDateString('it-IT')
        }
      })

    setPrediction({
      avgPerDay: avgPerDay.toFixed(1),
      current: totalPhotos,
      nextMilestone,
      photosNeeded,
      daysNeeded,
      estimatedDate: estimatedDate.toLocaleDateString('it-IT'),
      allPredictions
    })
  }

  function analyzeAndExplain(validPhotos, invalidPhotos) {
    // [CODICE ESISTENTE - invariato]
    const allFeatureKeys = new Set()
    
    validPhotos.forEach(photo => {
      if (photo.features) {
        Object.keys(flattenFeatures(photo.features)).forEach(key => allFeatureKeys.add(key))
      }
    })
    
    invalidPhotos.forEach(photo => {
      if (photo.features) {
        Object.keys(flattenFeatures(photo.features)).forEach(key => allFeatureKeys.add(key))
      }
    })

    const featureStats = []

    allFeatureKeys.forEach(featureKey => {
      const validValues = validPhotos
        .map(p => getNestedValue(p.features, featureKey))
        .filter(v => v !== null && v !== undefined && typeof v === 'number')
      
      const invalidValues = invalidPhotos
        .map(p => getNestedValue(p.features, featureKey))
        .filter(v => v !== null && v !== undefined && typeof v === 'number')

      if (validValues.length === 0 || invalidValues.length === 0) return

      const validMean = average(validValues)
      const invalidMean = average(invalidValues)
      const validStd = standardDeviation(validValues)
      const invalidStd = standardDeviation(invalidValues)

      const meanDiff = Math.abs(validMean - invalidMean)
      const pooledStd = Math.sqrt((validStd ** 2 + invalidStd ** 2) / 2)
      const separationScore = pooledStd > 0 ? meanDiff / pooledStd : 0

      featureStats.push({
        name: featureKey,
        validMean,
        invalidMean,
        difference: validMean - invalidMean,
        separationScore,
        category: getFeatureCategory(featureKey)
      })
    })

    featureStats.sort((a, b) => b.separationScore - a.separationScore)

    const topFeatures = featureStats.slice(0, 10)
    const humanInsights = generateHumanInsights(topFeatures, validPhotos.length, invalidPhotos.length)

    return {
      topFeatures: topFeatures,
      allFeatures: featureStats, // TUTTE le features, non solo top 10
      totalFeatures: featureStats.length,
      insights: humanInsights,
      byCategory: groupByCategory(featureStats)
    }
  }

  function generateHumanInsights(topFeatures, validCount, invalidCount) {
    const insights = []

    topFeatures.forEach((feature, idx) => {
      if (idx >= 5) return

      const featureName = feature.name.toLowerCase()
      const isValidHigher = feature.difference > 0

      let explanation = ''
      let learningPoint = ''
      let icon = '🔍'
      let importance = 'importante'

      if (feature.separationScore > 1.5) {
        importance = 'cruciale'
        icon = '⭐'
      } else if (feature.separationScore > 0.8) {
        importance = 'importante'
        icon = '💡'
      }

      // Linguaggio MOLTO SEMPLICE
      if (featureName.includes('hist') || featureName.includes('bin')) {
        const color = featureName.includes('_r_') ? 'rosse' :
                     featureName.includes('_g_') ? 'verdi' :
                     featureName.includes('_b_') ? 'blu' : 'colorate'
        if (isValidHigher) {
          explanation = `Le foto buone hanno più tonalità ${color}`
          learningPoint = `Sta imparando a riconoscere i colori ${color} tipici delle foto corrette`
        } else {
          explanation = `Le foto sbagliate hanno più tonalità ${color}`
          learningPoint = `Sta imparando che troppo ${color} indica una foto sbagliata`
        }
      } else if (featureName.includes('lbp')) {
        if (isValidHigher) {
          explanation = `Le foto buone hanno una superficie con una "grana" particolare`
          learningPoint = `Sta imparando a riconoscere la texture tipica della superficie corretta`
        } else {
          explanation = `Le foto sbagliate hanno una superficie diversa al tatto (visivamente)`
          learningPoint = `Sta imparando che questa texture indica una foto sbagliata`
        }
      } else if (featureName.includes('glcm')) {
        if (isValidHigher) {
          explanation = `Le foto buone hanno più contrasto e texture uniforme`
          learningPoint = `Sta imparando che una certa consistenza visiva è tipica delle foto corrette`
        } else {
          explanation = `Le foto sbagliate hanno troppo contrasto o texture irregolare`
          learningPoint = `Sta imparando a individuare texture sospette`
        }
      } else if (featureName.includes('edge') || featureName.includes('gradient')) {
        if (isValidHigher) {
          explanation = `Le foto buone hanno più dettagli e contorni visibili`
          learningPoint = `Sta imparando che i dettagli nitidi sono importanti`
        } else {
          explanation = `Le foto sbagliate hanno troppi contorni marcati`
          learningPoint = `Sta imparando che troppi dettagli possono indicare l'oggetto sbagliato`
        }
      } else if (featureName.includes('brightness') || featureName.includes('luminance')) {
        if (isValidHigher) {
          explanation = `Le foto buone sono più luminose`
          learningPoint = `Sta imparando che serve una buona illuminazione`
        } else {
          explanation = `Le foto sbagliate sono troppo chiare (sovraesposte)`
          learningPoint = `Sta imparando a riconoscere quando la foto è troppo luminosa`
        }
      } else if (featureName.includes('rgb') || featureName.includes('color')) {
        const color = featureName.includes('_r_') ? 'rosso' :
                     featureName.includes('_g_') ? 'verde' :
                     featureName.includes('_b_') ? 'blu' : 'colore'
        if (isValidHigher) {
          explanation = `Le foto buone hanno più ${color}`
          learningPoint = `Sta imparando che il ${color} è un segnale positivo`
        } else {
          explanation = `Le foto sbagliate hanno più ${color}`
          learningPoint = `Sta imparando che troppo ${color} è sospetto`
        }
      } else if (featureName.includes('std') || featureName.includes('variance')) {
        if (isValidHigher) {
          explanation = `Le foto buone hanno più variazioni di colore e texture`
          learningPoint = `Sta imparando che le foto corrette sono più "ricche" visivamente`
        } else {
          explanation = `Le foto sbagliate sono troppo varie o caotiche`
          learningPoint = `Sta imparando a riconoscere quando c'è troppa confusione nell'immagine`
        }
      } else if (featureName.includes('spatial') || featureName.includes('zone')) {
        const zone = featureName.match(/zone[_\[]?(\d+)/)?.[1] || '?'
        if (isValidHigher) {
          explanation = `In una certa parte della foto (zona ${zone}), le foto buone si comportano diversamente`
          learningPoint = `Sta imparando che alcune zone della foto sono più importanti di altre`
        } else {
          explanation = `In una certa parte della foto, le foto sbagliate hanno caratteristiche particolari`
          learningPoint = `Sta imparando a controllare zone specifiche per trovare problemi`
        }
      } else if (featureName.includes('entropy')) {
        if (isValidHigher) {
          explanation = `Le foto buone contengono più "informazione" visiva`
          learningPoint = `Sta imparando che le foto corrette sono più complesse e dettagliate`
        } else {
          explanation = `Le foto sbagliate sono troppo complesse o confusionarie`
          learningPoint = `Sta imparando che troppa complessità può essere un problema`
        }
      } else {
        // Fallback super semplice
        if (isValidHigher) {
          explanation = `Le foto buone hanno questa caratteristica più sviluppata`
          learningPoint = `Sta imparando che questa cosa distingue le foto corrette`
        } else {
          explanation = `Le foto sbagliate hanno questa caratteristica più sviluppata`
          learningPoint = `Sta imparando a riconoscere questo segnale di errore`
        }
      }

      insights.push({
        icon,
        importance,
        title: humanizeFeatureName(feature.name),
        explanation,
        learningPoint,
        technicalName: feature.name,
        validHigher: isValidHigher
      })
    })

    return insights
  }

  function humanizeFeatureName(name) {
    // Traduzioni complete e intuitive
    const translations = {
      // Statistiche base
      'mean': 'Valore Medio',
      'std': 'Variazione',
      'variance': 'Varianza',
      'median': 'Mediana',
      'min': 'Minimo',
      'max': 'Massimo',
      'range': 'Intervallo',
      'skewness': 'Asimmetria',
      'kurtosis': 'Picco',
      'entropy': 'Entropia (Disordine)',
      'percentile': 'Percentile',

      // Colore
      'color': 'Colore',
      'brightness': 'Luminosità',
      'rgb': 'RGB',
      'hsv': 'HSV (Tonalità)',
      'hue': 'Tonalità',
      'saturation': 'Saturazione',
      'luminance': 'Luminanza',
      '_r_': 'Rosso',
      '_g_': 'Verde',
      '_b_': 'Blu',

      // Texture
      'texture': 'Texture',
      'glcm': 'Pattern Texture (GLCM)',
      'lbp': 'Pattern Locale (LBP)',
      'gabor': 'Filtro Gabor',
      'haralick': 'Pattern Haralick',
      'homogeneity': 'Omogeneità',
      'dissimilarity': 'Dissimilarità',
      'correlation': 'Correlazione',
      'contrast': 'Contrasto',
      'asm': 'Uniformità',

      // Forme e bordi
      'edge': 'Bordi',
      'gradient': 'Gradiente',
      'contour': 'Contorno',
      'shape': 'Forma',
      'perimeter': 'Perimetro',
      'circularity': 'Circolarità',
      'solidity': 'Solidità',
      'bbox': 'Riquadro',
      'sobel': 'Bordi Sobel',
      'canny': 'Bordi Canny',
      'laplacian': 'Nitidezza Laplaciana',

      // Frequenze
      'fft': 'Frequenza (FFT)',
      'frequency': 'Frequenza',
      'fourier': 'Fourier',
      'spectrum': 'Spettro',
      'magnitude': 'Magnitudo',
      'phase': 'Fase',

      // Istogrammi
      'hist': 'Istogramma',
      'histogram': 'Istogramma',
      'bin': 'Fascia',

      // Spaziale
      'spatial': 'Distribuzione Spaziale',
      'zone': 'Zona',
      'quadrant': 'Quadrante',
      'region': 'Regione',

      // Altro
      'blur': 'Sfocatura',
      'sharpness': 'Nitidezza',
      'density': 'Densità',
      'moment': 'Momento',
      'hu': 'Hu (Forma)'
    }

    let humanName = name
    let matched = false

    // Prova a matchare le traduzioni
    for (const [tech, human] of Object.entries(translations)) {
      if (name.toLowerCase().includes(tech.toLowerCase())) {
        humanName = human
        matched = true
        break
      }
    }

    // Se non trovato, prova a rendere più leggibile il nome tecnico
    if (!matched) {
      // Rimuovi underscore e capitalizza
      humanName = name
        .replace(/_/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')
    }

    // Aggiungi dettagli se presente indice array
    const arrayMatch = name.match(/\[(\d+)\]/)
    if (arrayMatch) {
      const index = arrayMatch[1]
      humanName += ` #${index}`
    }

    return humanName
  }

  function flattenFeatures(obj, prefix = '') {
    let result = {}
    for (let key in obj) {
      const newKey = prefix ? `${prefix}.${key}` : key

      if (Array.isArray(obj[key])) {
        // Handle arrays - flatten each element with index
        obj[key].forEach((value, idx) => {
          if (typeof value === 'number') {
            result[`${newKey}[${idx}]`] = value
          } else if (typeof value === 'object' && value !== null) {
            // Nested object in array
            Object.assign(result, flattenFeatures(value, `${newKey}[${idx}]`))
          }
        })
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        // Nested object - recurse
        Object.assign(result, flattenFeatures(obj[key], newKey))
      } else if (typeof obj[key] === 'number') {
        // Direct number value
        result[newKey] = obj[key]
      }
      // Note: strings, booleans, null are still ignored
    }
    return result
  }

  function getNestedValue(obj, path) {
    // Handle paths like "color_hist[0]" or "spatial.zone[2]"
    const keys = path.split('.')
    let current = obj

    for (let key of keys) {
      if (!current) return null

      // Check for array notation: key[index]
      const arrayMatch = key.match(/^(.+)\[(\d+)\]$/)
      if (arrayMatch) {
        const [, arrayKey, index] = arrayMatch
        current = current[arrayKey]?.[parseInt(index)]
      } else {
        current = current[key]
      }
    }

    return current
  }

  function average(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length
  }

  function standardDeviation(arr) {
    const avg = average(arr)
    const squareDiffs = arr.map(value => Math.pow(value - avg, 2))
    return Math.sqrt(average(squareDiffs))
  }

  function getFeatureCategory(name) {
    const lower = name.toLowerCase()

    // Debug: log feature names to see actual patterns
    if (Math.random() < 0.01) { // Log only 1% to avoid spam
      console.log('Feature name:', name)
    }

    // Colore e luminosità
    if (lower.includes('color') || lower.includes('rgb') || lower.includes('hsv') ||
        lower.includes('hue') || lower.includes('saturation') || lower.includes('brightness') ||
        lower.includes('_r_') || lower.includes('_g_') || lower.includes('_b_') ||
        lower.includes('luminance') || lower.includes('chroma') ||
        lower.includes('red') || lower.includes('green') || lower.includes('blue')) {
      return '🎨 Colore'
    }

    // Texture e pattern
    if (lower.includes('texture') || lower.includes('glcm') || lower.includes('lbp') ||
        lower.includes('gabor') || lower.includes('haralick') || lower.includes('pattern') ||
        lower.includes('homogeneity') || lower.includes('dissimilarity') ||
        lower.includes('correlation') || lower.includes('asm') || lower.includes('contrast')) {
      return '🔲 Texture'
    }

    // Bordi e forme
    if (lower.includes('edge') || lower.includes('gradient') || lower.includes('contour') ||
        lower.includes('sobel') || lower.includes('canny') || lower.includes('laplacian') ||
        lower.includes('shape') || lower.includes('perimeter') || lower.includes('circularity') ||
        lower.includes('solidity') || lower.includes('bbox')) {
      return '📐 Forme & Bordi'
    }

    // Frequenze e FFT
    if (lower.includes('fft') || lower.includes('frequency') || lower.includes('fourier') ||
        lower.includes('spectrum') || lower.includes('magnitude') || lower.includes('phase')) {
      return '📡 Frequenze'
    }

    // Istogrammi
    if (lower.includes('hist') || lower.includes('histogram') || lower.includes('bin')) {
      return '📊 Istogrammi'
    }

    // Distribuzione spaziale
    if (lower.includes('spatial') || lower.includes('zone') || lower.includes('quadrant') ||
        lower.includes('region') || lower.includes('segment')) {
      return '🗺️ Distribuzione'
    }

    // Statistiche base - MUST BE AFTER OTHER CATEGORIES (more generic)
    if (lower.includes('mean') || lower.includes('std') || lower.includes('variance') ||
        lower.includes('median') || lower.includes('min') || lower.includes('max') ||
        lower.includes('range') || lower.includes('skewness') || lower.includes('kurtosis') ||
        lower.includes('entropy') || lower.includes('percentile')) {
      return '📈 Statistiche'
    }

    // Momenti di Hu
    if (lower.includes('moment') || lower.includes('hu_')) {
      return '🔄 Momenti'
    }

    // Log uncategorized features
    console.log('⚠️ Uncategorized feature:', name)
    return '📋 Altro'
  }

  function groupByCategory(features) {
    const groups = {}
    features.forEach(f => {
      const cat = f.category
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(f)
    })
    return groups
  }

  // Complete Features Table Component
  function AllFeaturesTable({ allFeatures }) {
    const [searchTerm, setSearchTerm] = useState('')
    const [categoryFilter, setCategoryFilter] = useState('Tutte')
    const [sortBy, setSortBy] = useState('score') // 'score', 'name', 'difference'
    const [showCount, setShowCount] = useState(50)

    if (!allFeatures || allFeatures.length === 0) {
      return null
    }

    // Filter and sort
    let filtered = allFeatures.filter(f => {
      const matchesSearch = f.name.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesCategory = categoryFilter === 'Tutte' || f.category === categoryFilter
      return matchesSearch && matchesCategory
    })

    // Sort
    if (sortBy === 'score') {
      filtered.sort((a, b) => b.separationScore - a.separationScore)
    } else if (sortBy === 'name') {
      filtered.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sortBy === 'difference') {
      filtered.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
    }

    const categories = ['Tutte', ...new Set(allFeatures.map(f => f.category))]
    const displayed = filtered.slice(0, showCount)

    return (
      <div className="bg-white rounded-2xl shadow-xl border-2 border-gray-200 p-8 mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">📊 Tabella Completa Features</h2>
            <p className="text-gray-600 mt-1">
              {allFeatures.length} features totali • {filtered.length} visualizzate
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium mb-2">🔍 Cerca Feature</label>
            <input
              type="text"
              placeholder="es. brightness, edge, color..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Category Filter */}
          <div>
            <label className="block text-sm font-medium mb-2">📂 Categoria</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Sort */}
          <div>
            <label className="block text-sm font-medium mb-2">🔢 Ordina per</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
            >
              <option value="score">Importanza (Score)</option>
              <option value="difference">Differenza (Abs)</option>
              <option value="name">Nome (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-green-50 rounded-lg p-3 border border-green-200">
            <div className="text-xs text-green-700">Score {'>'} 1.5</div>
            <div className="text-2xl font-bold text-green-900">
              {filtered.filter(f => f.separationScore > 1.5).length}
            </div>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
            <div className="text-xs text-blue-700">Score 0.8-1.5</div>
            <div className="text-2xl font-bold text-blue-900">
              {filtered.filter(f => f.separationScore > 0.8 && f.separationScore <= 1.5).length}
            </div>
          </div>
          <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-200">
            <div className="text-xs text-yellow-700">Score 0.5-0.8</div>
            <div className="text-2xl font-bold text-yellow-900">
              {filtered.filter(f => f.separationScore > 0.5 && f.separationScore <= 0.8).length}
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <div className="text-xs text-gray-700">Score {'<'} 0.5</div>
            <div className="text-2xl font-bold text-gray-900">
              {filtered.filter(f => f.separationScore <= 0.5).length}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100 border-b-2 border-gray-300">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">#</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">Feature</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">Categoria</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-700 uppercase">Valid (avg)</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-700 uppercase">Invalid (avg)</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-700 uppercase">Diff</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-700 uppercase">Score</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((feature, idx) => {
                const scoreColor =
                  feature.separationScore > 1.5 ? 'bg-green-50' :
                  feature.separationScore > 0.8 ? 'bg-blue-50' :
                  feature.separationScore > 0.5 ? 'bg-yellow-50' : 'bg-white'

                const higherInValid = feature.difference > 0

                return (
                  <tr key={feature.name} className={`border-b border-gray-200 hover:bg-gray-50 transition ${scoreColor}`}>
                    <td className="px-4 py-3 text-sm text-gray-500">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-gray-900">{feature.name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700">
                        {feature.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-mono text-sm ${higherInValid ? 'font-bold text-green-700' : 'text-gray-600'}`}>
                        {feature.validMean.toFixed(3)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-mono text-sm ${!higherInValid ? 'font-bold text-red-700' : 'text-gray-600'}`}>
                        {feature.invalidMean.toFixed(3)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-mono text-sm font-medium ${higherInValid ? 'text-green-700' : 'text-red-700'}`}>
                        {higherInValid ? '+' : ''}{feature.difference.toFixed(3)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-bold text-gray-900">{feature.separationScore.toFixed(2)}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Load More */}
        {filtered.length > showCount && (
          <div className="text-center mt-6">
            <button
              onClick={() => setShowCount(prev => prev + 50)}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
            >
              Mostra altre 50 features ({filtered.length - showCount} rimanenti)
            </button>
          </div>
        )}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <div className="text-4xl mb-3">🔍</div>
            <p>Nessuna feature trovata con i filtri applicati</p>
          </div>
        )}

        {/* Export Data */}
        <div className="mt-6 pt-6 border-t-2 border-gray-200">
          <button
            onClick={() => {
              const csv = [
                ['Feature', 'Category', 'Valid Mean', 'Invalid Mean', 'Difference', 'Separation Score'].join(','),
                ...filtered.map(f => [
                  f.name,
                  f.category,
                  f.validMean.toFixed(6),
                  f.invalidMean.toFixed(6),
                  f.difference.toFixed(6),
                  f.separationScore.toFixed(6)
                ].join(','))
              ].join('\n')

              const blob = new Blob([csv], { type: 'text/csv' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `features-analysis-${new Date().toISOString().split('T')[0]}.csv`
              a.click()
            }}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition text-sm font-medium"
          >
            📥 Esporta CSV ({filtered.length} features)
          </button>
        </div>
      </div>
    )
  }

  // [RESTO DEL CODICE PhotoAccordion e funzioni helper - invariato]
  function PhotoAccordion() {
    const [allPhotos, setAllPhotos] = useState([])
    const [openPhoto, setOpenPhoto] = useState(null)

    useEffect(() => {
      loadPhotos()
    }, [])

    async function loadPhotos() {
      const { data, error } = await supabase
        .from('training_photos')
        .select('*')
        .not('features', 'is', null)
        .order('created_at', { ascending: false })

      if (data && !error) {
        setAllPhotos(data)
      }
    }

    function translateFeatureName(key) {
      const translations = {
        'color_b_mean': 'Media Blu',
        'color_g_mean': 'Media Verde',
        'color_r_mean': 'Media Rosso',
        'color_b_std': 'Variazione Blu',
        'color_g_std': 'Variazione Verde',
        'color_r_std': 'Variazione Rosso',
        'color_b_skewness': 'Asimmetria Blu',
        'color_g_skewness': 'Asimmetria Verde',
        'color_r_skewness': 'Asimmetria Rosso',
        'color_b_kurtosis': 'Picco Blu',
        'color_g_kurtosis': 'Picco Verde',
        'color_r_kurtosis': 'Picco Rosso',
        'spatial_brightness': 'Luminosità Zona',
        'spatial_std': 'Variazione Zona',
        'stat_mean': 'Media Generale',
        'stat_std': 'Deviazione Standard',
        'stat_variance': 'Varianza',
        'stat_min': 'Valore Minimo',
        'stat_max': 'Valore Massimo',
        'stat_range': 'Intervallo',
        'stat_median': 'Mediana',
        'stat_skewness': 'Asimmetria',
        'stat_kurtosis': 'Curtosi',
        'stat_entropy': 'Entropia',
        'stat_laplacian_var': 'Nitidezza (Laplaciano)',
        'stat_rms_contrast': 'Contrasto RMS',
        'stat_michelson_contrast': 'Contrasto Michelson',
        'stat_percentile_25': '25° Percentile',
        'stat_percentile_75': '75° Percentile',
        'edge_density_global': 'Densità Bordi Globale',
        'edge_density': 'Densità Bordi',
        'edge_orientation': 'Orientamento Bordi',
        'gradient_mean': 'Gradiente Medio',
        'gradient_std': 'Gradiente Variazione',
        'gradient_max': 'Gradiente Massimo',
        'gradient_min': 'Gradiente Minimo',
        'gradient_median': 'Gradiente Mediano',
        'contour_area': 'Area Contorno',
        'contour_perimeter': 'Perimetro',
        'contour_circularity': 'Circolarità',
        'contour_bbox_aspect_ratio': 'Rapporto Aspetto',
        'contour_bbox_extent': 'Estensione Box',
        'contour_solidity': 'Solidità',
        'contour_hu_moment': 'Momento Hu',
        'contour_count': 'Numero Contorni',
        'fft_magnitude_mean': 'Frequenza Media',
        'fft_magnitude_std': 'Frequenza Variazione',
        'fft_magnitude_max': 'Frequenza Massima',
        'fft_energy': 'Energia Frequenza',
        'fft_entropy': 'Entropia Frequenza',
        'glcm_contrast': 'Contrasto Texture',
        'glcm_dissimilarity': 'Dissimilarità Texture',
        'glcm_homogeneity': 'Omogeneità Texture',
        'glcm_energy': 'Energia Texture',
        'glcm_correlation': 'Correlazione Texture',
        'lbp_hist': 'Pattern Locale',
        'gabor': 'Filtro Gabor'
      }
      
      if (translations[key]) {
        return `${translations[key]} (${key})`
      }
      
      for (const [pattern, translation] of Object.entries(translations)) {
        if (key.includes(pattern)) {
          const parts = key.split('_')
          let extra = ''
          
          if (key.includes('zone_')) {
            const zoneMatch = key.match(/zone_(\d+)_(\d+)/)
            if (zoneMatch) extra = ` Z${zoneMatch[1]}${zoneMatch[2]}`
          }
          
          if (key.includes('bin_')) {
            const binMatch = key.match(/bin_(\d+)/)
            if (binMatch) extra = ` Bin${binMatch[1]}`
          }
          
          if (key.includes('angle_')) {
            const angleMatch = key.match(/angle_(\d+)/)
            if (angleMatch) {
              const angleDeg = angleMatch[1] === '0' ? '0°' : 
                              angleMatch[1] === '1' ? '45°' : 
                              angleMatch[1] === '2' ? '90°' : '135°'
              extra = ` ${angleDeg}`
            }
          }
          
          if (key.includes('_q') && !key.includes('_mean')) {
            const qMatch = key.match(/_q(\d+)/)
            if (qMatch) extra = ` Q${qMatch[1]}`
          }
          
          if (key.includes('_f') && key.includes('_o')) {
            const fMatch = key.match(/_f(\d+)/)
            const oMatch = key.match(/_o(\d+)/)
            if (fMatch && oMatch) extra = ` F${fMatch[1]}O${oMatch[1]}`
          }
          
          return `${translation}${extra} (${key})`
        }
      }
      
      return key
        .replace(/_/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ') + ` (${key})`
    }

    function formatFeatureValue(value) {
      if (typeof value === 'number') {
        return value.toFixed(3)
      }
      if (typeof value === 'boolean') {
        return value ? '✓ Sì' : '✗ No'
      }
      if (Array.isArray(value)) {
        return value.join(', ')
      }
      return String(value)
    }

    function getFeatureCount(features) {
      const flattened = flattenFeatures(features)
      return Object.keys(flattened).length
    }

    function categorizeFeatures(features) {
      const flattened = flattenFeatures(features)
      const categories = {
        'Colore': [],
        'Texture': [],
        'Bordi': [],
        'Spaziale': [],
        'Statistiche': [],
        'Altro': []
      }

      Object.entries(flattened).forEach(([key, value]) => {
        let category = 'Altro'
        
        if (key.includes('color') || key.includes('rgb') || key.includes('hsv')) {
          category = 'Colore'
        } else if (key.includes('texture') || key.includes('glcm') || key.includes('lbp') || key.includes('gabor')) {
          category = 'Texture'
        } else if (key.includes('edge') || key.includes('gradient') || key.includes('contour')) {
          category = 'Bordi'
        } else if (key.includes('spatial') || key.includes('zone')) {
          category = 'Spaziale'
        } else if (key.includes('stat') || key.includes('mean') || key.includes('std')) {
          category = 'Statistiche'
        }

        categories[category].push({ key, value })
      })

      return categories
    }

    return (
      <div className="space-y-3">
        {allPhotos.map((photo, idx) => {
          const isOpen = openPhoto === photo.id
          const featureCount = getFeatureCount(photo.features)
          const categorized = categorizeFeatures(photo.features)
          const uploadDate = new Date(photo.uploaded_at).toLocaleDateString('it-IT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })

          return (
            <div key={photo.id} className="border-2 border-gray-200 rounded-xl overflow-hidden hover:border-indigo-300 transition">
              <button
                onClick={() => setOpenPhoto(isOpen ? null : photo.id)}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${
                    photo.label === 'valid' 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {photo.label === 'valid' ? '✓' : '✗'}
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-gray-900">
                      Foto #{idx + 1} - {photo.label === 'valid' ? 'CORRETTA' : 'SBAGLIATA'}
                    </div>
                    <div className="text-sm text-gray-500">
                      {featureCount} caratteristiche • Caricata il {uploadDate}
                    </div>
                  </div>
                </div>
                <div className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {isOpen && (
                <div className="border-t-2 border-gray-200 bg-gray-50 p-6">
                  <div className="bg-white rounded-lg p-4 mb-4 border border-gray-200">
                    <h4 className="font-bold text-gray-900 mb-3">ℹ️ Informazioni</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-gray-600">ID:</span>{' '}
                        <span className="font-mono text-xs">{photo.id.slice(0, 8)}...</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Dimensione:</span>{' '}
                        <span className="font-medium">{(photo.file_size / 1024).toFixed(1)} KB</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Caricata da:</span>{' '}
                        <span className="font-medium">{photo.uploaded_by || 'Sconosciuto'}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Usata nel training:</span>{' '}
                        <span className="font-medium">{photo.used_in_training ? '✓ Sì' : '✗ No'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {Object.entries(categorized).map(([category, features]) => {
                      if (features.length === 0) return null
                      
                      return (
                        <div key={category} className="bg-white rounded-lg p-4 border border-gray-200">
                          <h4 className="font-bold text-gray-900 mb-3">
                            {category === 'Colore' && '🎨 '}
                            {category === 'Texture' && '🔲 '}
                            {category === 'Bordi' && '📐 '}
                            {category === 'Spaziale' && '🗺️ '}
                            {category === 'Statistiche' && '📊 '}
                            {category === 'Altro' && '📋 '}
                            {category} ({features.length})
                          </h4>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {features.slice(0, 20).map(({ key, value }) => (
                              <div key={key} className="flex justify-between items-center bg-gray-50 rounded px-3 py-2">
                                <span className="text-xs text-gray-600 truncate mr-2">{translateFeatureName(key)}</span>
                                <span className="text-sm font-mono font-bold text-gray-900">
                                  {formatFeatureValue(value)}
                                </span>
                              </div>
                            ))}
                          </div>
                          
                          {features.length > 20 && (
                            <div className="mt-2 text-xs text-gray-500 text-center">
                              ... e altre {features.length - 20} caratteristiche
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {allPhotos.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <div className="text-5xl mb-4">📭</div>
            <p>Nessuna foto con features estratte</p>
          </div>
        )}
      </div>
    )
  }

  // Configurazione grafico a barre
  const chartData = {
    labels: dailyActivities.map(a => new Date(a.date).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })),
    datasets: [
      {
        label: 'Valide',
        data: dailyActivities.map(a => a.valid),
        backgroundColor: 'rgba(34, 197, 94, 0.8)',
        borderColor: 'rgb(34, 197, 94)',
        borderWidth: 1
      },
      {
        label: 'Non Valide',
        data: dailyActivities.map(a => a.invalid),
        backgroundColor: 'rgba(239, 68, 68, 0.8)',
        borderColor: 'rgb(239, 68, 68)',
        borderWidth: 1
      }
    ]
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: false
      }
    },
    scales: {
      x: {
        stacked: true,
      },
      y: {
        stacked: true,
        beginAtZero: true,
        ticks: {
          stepSize: 1
        }
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Sto analizzando le foto...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">🧠 Dashboard Training Completa</h1>
            <p className="text-gray-600 text-lg">Analisi AI, Attività e Previsioni</p>
          </div>
          <button
            onClick={() => router.push('/training')}
            className="px-6 py-3 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 transition font-medium shadow-sm"
          >
            ← Torna al Training
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {loading ? (
            <>
              <div className="bg-white rounded-2xl shadow-lg border-2 border-gray-100 p-6">
                <div className="h-4 bg-gray-200 rounded w-24 mb-3 animate-pulse"></div>
                <div className="h-10 bg-gray-200 rounded w-16 animate-pulse"></div>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl shadow-lg border-2 border-green-200 p-6">
                <div className="h-4 bg-green-200 rounded w-28 mb-3 animate-pulse"></div>
                <div className="h-10 bg-green-200 rounded w-16 animate-pulse"></div>
              </div>
              <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-2xl shadow-lg border-2 border-red-200 p-6">
                <div className="h-4 bg-red-200 rounded w-28 mb-3 animate-pulse"></div>
                <div className="h-10 bg-red-200 rounded w-16 animate-pulse"></div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-white rounded-2xl shadow-lg border-2 border-gray-100 p-6">
                <div className="text-sm text-gray-500 mb-2">📸 Foto Totali</div>
                <div className="text-4xl font-bold text-gray-900">{stats?.total || 0}</div>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl shadow-lg border-2 border-green-200 p-6">
                <div className="text-sm text-green-700 font-medium mb-2">✅ Foto Corrette</div>
                <div className="text-4xl font-bold text-green-700">{stats?.valid || 0}</div>
              </div>
              <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-2xl shadow-lg border-2 border-red-200 p-6">
                <div className="text-sm text-red-700 font-medium mb-2">❌ Foto Sbagliate</div>
                <div className="text-4xl font-bold text-red-700">{stats?.invalid || 0}</div>
              </div>
            </>
          )}
        </div>

        {/* WARNING: Missing Features */}
        {stats?.missingFeatures > 0 && (
          <div className="bg-orange-50 border-2 border-orange-400 rounded-2xl p-6 mb-8 shadow-lg">
            <div className="flex items-start gap-4">
              <div className="text-4xl">⚠️</div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-orange-900 mb-2">
                  {stats.missingFeatures} foto senza features estratte
                </h3>
                <p className="text-orange-800 mb-3">
                  Ci sono {stats.missingFeatures} foto nel database che non hanno features estratte.
                  Questo può succedere se:
                </p>
                <ul className="list-disc list-inside text-orange-800 space-y-1 mb-4">
                  <li>Il servizio Cloud Run non era attivo durante l'upload</li>
                  <li>L'estrazione features è fallita per quelle foto</li>
                  <li>Le foto sono state caricate prima dell'implementazione del sistema features</li>
                </ul>
                <p className="text-orange-900 font-medium">
                  🔧 Controlla il repository Cloud Run per verificare il servizio di estrazione features
                </p>
              </div>
            </div>
          </div>
        )}

        {/* === SEZIONE NUOVA: GRAFICI E PREVISIONI === */}
        <div className="bg-white rounded-2xl shadow-xl border-2 border-indigo-100 p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">📊 Attività Giornaliere</h2>
          
          {/* Filtri Date */}
          <div className="flex gap-4 mb-6 flex-wrap">
            <div>
              <label className="block text-sm font-medium mb-1">Data Inizio</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Data Fine</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={loadActivityData}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                Aggiorna
              </button>
            </div>
          </div>

          {/* Grafico */}
          {activityLoading ? (
            <div className="space-y-3 py-6">
              <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-48 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
            </div>
          ) : dailyActivities.length > 0 ? (
            <div style={{ height: '300px' }}>
              <Bar key={`${startDate}-${endDate}`} data={chartData} options={chartOptions} />
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <div className="text-4xl mb-3">📅</div>
              <p>Nessuna attività nel periodo selezionato</p>
            </div>
          )}
        </div>

        {/* Previsioni Scaglioni */}
        {prediction && prediction.allPredictions && (
          <div className="bg-white rounded-2xl shadow-xl border-2 border-purple-100 p-8 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">🎯 Previsioni Scaglioni</h2>
            
            <div className="bg-blue-50 rounded-xl p-4 mb-6">
              <div className="text-sm text-blue-900 mb-2">
                📈 Media giornaliera (ultimi 7 giorni): <strong>{prediction.avgPerDay} foto/giorno</strong>
              </div>
              <div className="text-sm text-blue-900">
                📍 Foto attuali: <strong>{prediction.current}</strong>
              </div>
            </div>

            <div className="space-y-4">
              {prediction.allPredictions.map((pred, idx) => (
                <div 
                  key={pred.milestone}
                  className={`rounded-xl p-6 ${
                    idx === 0 
                      ? 'bg-blue-50 border-2 border-blue-400' 
                      : 'bg-gray-50 border border-gray-300'
                  }`}
                >
                  <div className="flex justify-between items-center mb-2">
                    <div>
                      <span className="text-xl font-bold">
                        {idx === 0 && '🎯 '}Scaglione {pred.milestone} foto
                      </span>
                      {idx === 0 && <span className="ml-2 text-sm text-gray-600">(prossimo)</span>}
                    </div>
                    <div className="text-right">
                      <div className={`text-2xl font-bold ${idx === 0 ? 'text-blue-600' : 'text-gray-600'}`}>
                        {pred.daysNeeded} giorni
                      </div>
                      <div className="text-xs text-gray-500">
                        ~{pred.estimatedDate}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-gray-600">
                    Mancano ancora <strong>{pred.photosNeeded} foto</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!prediction && stats?.total > 0 && (
          <div className="bg-white rounded-2xl shadow-xl border-2 border-gray-200 p-8 text-center mb-8">
            <div className="text-4xl mb-4">📊</div>
            <p className="text-gray-600">
              Carica più foto per vedere le previsioni sugli scaglioni!
            </p>
          </div>
        )}
        {/* === FINE SEZIONE NUOVA === */}

        {!insights && (
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-8 text-center shadow-lg">
            <div className="text-5xl mb-4">⚠️</div>
            <p className="text-yellow-800 text-lg font-medium">
              Carica almeno 1 foto corretta e 1 foto sbagliata per vedere l'analisi AI
            </p>
          </div>
        )}

        {insights && (
          <>
            {/* Main Insights */}
            <div className="bg-white rounded-2xl shadow-xl border-2 border-indigo-100 p-8 mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                💡 Scoperte Principali dell'AI
              </h2>
              
              <div className="space-y-6">
                {insights.insights.map((insight, idx) => (
                  <div key={idx} className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-6 border-2 border-purple-100">
                    <div className="flex items-start gap-4">
                      <div className="text-4xl">{insight.icon}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-xl font-bold text-gray-900">{insight.title}</h3>
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            insight.importance === 'molto importante' 
                              ? 'bg-green-200 text-green-800' 
                              : 'bg-blue-200 text-blue-800'
                          }`}>
                            {insight.importance.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-gray-700 text-base leading-relaxed mb-3">{insight.explanation}</p>

                        {/* Learning Point - Cosa sta imparando l'AI */}
                        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-4 border-l-4 border-purple-400">
                          <div className="flex items-start gap-3">
                            <span className="text-2xl">🧠</span>
                            <div className="flex-1">
                              <div className="text-xs font-bold text-purple-700 uppercase tracking-wide mb-2">💡 Cosa sta imparando</div>
                              <p className="text-base text-purple-900 leading-relaxed">{insight.learningPoint}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary Box - Cosa sta imparando */}
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl shadow-xl p-8 text-white mb-8">
              <h3 className="text-3xl font-bold mb-6">🧠 In Sintesi: Cosa Sta Imparando</h3>
              <div className="text-lg space-y-5 leading-relaxed">
                <p className="text-xl">
                  ✨ L'AI ha analizzato <span className="font-bold text-yellow-300">{insights.totalFeatures}</span> caratteristiche diverse dalle tue foto
                </p>
                <p className="text-xl">
                  🎯 Ha trovato <span className="font-bold text-yellow-300">{insights.topFeatures.filter(f => f.separationScore > 1.5).length}</span> caratteristiche cruciali e <span className="font-bold text-yellow-300">{insights.topFeatures.filter(f => f.separationScore > 0.8 && f.separationScore <= 1.5).length}</span> importanti che distinguono le foto
                </p>
                <div className="bg-white/20 rounded-xl p-5 space-y-3">
                  <div className="font-bold text-xl mb-3">📊 Cosa sta guardando:</div>
                  {Object.entries(insights.byCategory).map(([category, features]) => {
                    const strongCount = features.filter(f => f.separationScore > 1.5).length
                    const isImportant = strongCount > 0
                    return (
                      <div key={category} className="flex items-center gap-3">
                        <span className="text-2xl">{category.split(' ')[0]}</span>
                        <span className="flex-1">{category.includes(' ') ? category.split(' ').slice(1).join(' ') : category}</span>
                        {isImportant && (
                          <span className="px-3 py-1 bg-yellow-400 text-gray-900 rounded-full text-sm font-bold">
                            {strongCount} {strongCount === 1 ? 'aspetto cruciale' : 'aspetti cruciali'}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
                <p className="text-xl border-t border-white/30 pt-4">
                  🔬 L'AI sta imparando da sola quali dettagli visivi distinguono le foto buone da quelle sbagliate
                </p>
                <p className="text-xl">
                  🚀 Più foto carichi, più diventa brava a riconoscerle!
                </p>
              </div>
            </div>

            {/* Metrics Dashboard */}
            <div className="bg-white rounded-2xl shadow-xl border-2 border-gray-200 p-8 mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">📈 Metriche e Statistiche</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border-2 border-blue-200">
                  <div className="text-sm text-blue-700 font-medium mb-1">Feature Totali</div>
                  <div className="text-3xl font-bold text-blue-900">{insights.totalFeatures}</div>
                  <div className="text-xs text-blue-600 mt-1">Caratteristiche estratte</div>
                </div>
                
                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border-2 border-green-200">
                  <div className="text-sm text-green-700 font-medium mb-1">Feature Forti</div>
                  <div className="text-3xl font-bold text-green-900">
                    {insights.topFeatures.filter(f => f.separationScore > 1.5).length}
                  </div>
                  <div className="text-xs text-green-600 mt-1">Score {'>'} 1.5</div>
                </div>
                
                <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl p-4 border-2 border-yellow-200">
                  <div className="text-sm text-yellow-700 font-medium mb-1">Feature Moderate</div>
                  <div className="text-3xl font-bold text-yellow-900">
                    {insights.topFeatures.filter(f => f.separationScore > 0.8 && f.separationScore <= 1.5).length}
                  </div>
                  <div className="text-xs text-yellow-600 mt-1">Score 0.8-1.5</div>
                </div>
                
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border-2 border-purple-200">
                  <div className="text-sm text-purple-700 font-medium mb-1">Affidabilità Media</div>
                  <div className="text-3xl font-bold text-purple-900">
                    {(insights.topFeatures.slice(0, 5).reduce((acc, f) => acc + f.separationScore, 0) / 5).toFixed(1)}
                  </div>
                  <div className="text-xs text-purple-600 mt-1">Top 5 features</div>
                </div>
              </div>

              {/* Category Breakdown */}
              <div className="bg-gray-50 rounded-xl p-6">
                <h3 className="font-bold text-gray-900 mb-4">Distribuzione per Categoria</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(insights.byCategory).map(([category, features]) => {
                    const strongCount = features.filter(f => f.separationScore > 1.5).length
                    const percentage = ((strongCount / features.length) * 100).toFixed(0)
                    
                    return (
                      <div key={category} className="text-center">
                        <div className="text-3xl mb-2">
                          {category.split(' ')[0]}
                        </div>
                        <div className="font-bold text-gray-900">{category.includes(' ') ? category.split(' ').slice(1).join(' ') : category}</div>
                        <div className="text-sm text-gray-600">{features.length} features</div>
                        <div className="text-xs text-green-600 font-medium mt-1">
                          {strongCount} forti ({percentage}%)
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Per-Photo Accordion */}
            <div className="bg-white rounded-2xl shadow-xl border-2 border-gray-200 p-8 mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">📋 Dettaglio Foto per Foto</h2>
              <p className="text-gray-600 mb-6">
                Esplora le caratteristiche estratte da ogni singola foto
              </p>
              
              <PhotoAccordion />
            </div>

            {/* Complete Features Table */}
            <AllFeaturesTable allFeatures={insights.allFeatures} />
          </>
        )}
      </div>
    </div>
  )
}
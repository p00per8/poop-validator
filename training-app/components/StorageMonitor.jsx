export default function StorageMonitor({ used, limit, canUpload }) {
  const percentage = (used / limit) * 100
  
  let colorClass = 'bg-green-500'
  let statusText = '✅ Spazio disponibile'
  
  if (percentage > 90) {
    colorClass = 'bg-red-500'
    statusText = '⚠️ Storage quasi pieno!'
  } else if (percentage > 70) {
    colorClass = 'bg-yellow-500'
    statusText = '⚡ Storage in uso'
  }
  
  return (
    <div className="card mb-6">
      <h3 className="text-lg font-semibold mb-3">💾 Storage Status</h3>
      
      <div className="storage-bar mb-2">
        <div 
          className={`storage-fill ${colorClass}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      
      <div className="flex justify-between items-center text-sm">
        <span className="text-gray-600">
          {used.toFixed(2)} MB / {limit} MB
        </span>
        <span className={`font-medium ${
          percentage > 90 ? 'text-red-600' : 
          percentage > 70 ? 'text-yellow-600' : 
          'text-green-600'
        }`}>
          {percentage.toFixed(1)}%
        </span>
      </div>
      
      <div className="mt-3">
        <p className={`text-sm font-medium ${
          canUpload ? 'text-green-600' : 'text-red-600'
        }`}>
          {statusText}
        </p>
        {!canUpload && (
          <p className="text-xs text-red-500 mt-1">
            Esegui un retrain per liberare spazio e continuare
          </p>
        )}
      </div>
    </div>
  )
}

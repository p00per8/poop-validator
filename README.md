# 🤖 Intestinal Validator - AI Photo Validation System

Sistema completo di validazione fotografica basato su ML con algoritmo proprietario MobileNetV3.

## 📋 Panoramica

Questo progetto include:
- **Training App**: Webapp privata per raccogliere foto di training
- **Testing App**: Webapp pubblica per testare l'algoritmo
- **Algoritmo ML**: MobileNetV3 con transfer learning
- **Backend**: API Node.js per retrain automatico
- **Storage**: Supabase con gestione intelligente dello spazio

## 🏗️ Architettura

```
┌─────────────────┐
│  Training App   │  → Raccogli foto (valid/invalid)
│   (Privata)     │  → Compressione automatica
└────────┬────────┘  → Upload Supabase Storage
         │
         ↓
┌─────────────────┐
│    Supabase     │  → Storage (1GB free)
│  Database +     │  → Metadata tracking
│    Storage      │  → Auto-cleanup dopo train
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ Retrain API     │  → Download foto
│  (Node.js)      │  → Training Python script
└────────┬────────┘  → Export TensorFlow.js
         │
         ↓
┌─────────────────┐
│  Testing App    │  → Camera browser
│   (Pubblica)    │  → Validazione on-device
└─────────────────┘  → TensorFlow.js inference
```

## 🚀 Quick Start

### 1. Clone Repository

```bash
git clone <your-repo-url>
cd intestinal-validator
npm install
```

### 2. Setup Supabase

1. Crea account su [supabase.com](https://supabase.com)
2. Crea nuovo progetto
3. Vai su SQL Editor ed esegui `scripts/setup_supabase.sql`
4. Vai su Storage → Crea bucket "training-dataset" (private)
5. Copia URL e Keys da Settings → API

### 3. Environment Variables

Crea file `.env.local`:

```bash
cp .env.example .env.local
```

Modifica `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...
NEXT_PUBLIC_TRAINING_PASSWORD=your_secure_password
```

### 4. Install Python Dependencies

```bash
pip install tensorflow tensorflowjs pillow --break-system-packages
```

### 5. Run Apps

**Training App** (porta 3001):
```bash
npm run training
# Apri http://localhost:3001
# Password: quella che hai messo in .env.local
```

**Testing App** (porta 3000):
```bash
npm run testing
# Apri http://localhost:3000
```

Oppure entrambe insieme:
```bash
npm run dev  # Usa porta 3000
```

## 📸 Workflow Completo

### Phase 1: Data Collection (Week 1-2)

1. Apri Training App
2. Login con password
3. Scatta 100-200 foto:
   - 50% VALID (foto target reali)
   - 50% INVALID (carta, oggetti sbagliati, foto vuote, etc)
4. Foto vengono compresse automaticamente (3MB → 100KB)
5. Storage monitor mostra spazio usato

### Phase 2: First Training (Week 2)

**Opzione A: Automatic (via API)**
1. Quando raggiungi 100 foto, appare bottone "RETRAIN MODEL"
2. Click → API scarica foto, allena modello, pulisce storage
3. Attendi 10-20 minuti
4. Modello aggiornato automaticamente in `/public/model/`

**Opzione B: Manual (via Google Colab)**
1. Apri `notebooks/training.ipynb` in Google Colab
2. Modifica credenziali Supabase
3. Esegui tutte le celle
4. Scarica `model.json` e `group1-shard1of1.bin`
5. Carica in `/public/model/`

### Phase 3: Testing (Week 3+)

1. Apri Testing App
2. Click "Scatta Foto Test"
3. Scatta foto con camera
4. Algoritmo valida in 1-2 secondi
5. Risultato: ✅ VALIDA o ❌ NON VALIDA + motivo

### Phase 4: Continuous Improvement

1. Ogni settimana aggiungi 20-50 foto edge cases
2. Retrain ogni 100 nuove foto
3. Modello migliora continuamente

## 🗂️ Struttura File

```
intestinal-validator/
├── training-app/          # App privata raccolta dati
│   ├── pages/index.jsx    # Dashboard principale
│   └── components/
│       └── StorageMonitor.jsx
│
├── testing-app/           # App pubblica test
│   ├── pages/index.jsx
│   └── components/
│       └── Validator.jsx
│
├── shared/                # Componenti condivisi
│   ├── components/
│   │   └── Camera.jsx     # Camera component
│   ├── lib/
│   │   ├── supabase.js
│   │   ├── imageCompression.js
│   │   └── tfjs-model.js
│   └── styles/
│       └── globals.css
│
├── pages/api/
│   └── retrain.js         # Endpoint retrain
│
├── scripts/
│   ├── retrain_model.py   # Training script
│   └── setup_supabase.sql
│
├── notebooks/
│   └── training.ipynb     # Google Colab
│
└── public/
    └── model/             # TensorFlow.js model
        ├── model.json     # (generato dopo training)
        └── *.bin
```

## 🎛️ Configurazione Avanzata

### Modifica Threshold Validazione

In `shared/lib/tfjs-model.js`:

```javascript
if (confidence > 0.75) {  // Alta confidenza
  return { valid: true, ... }
} else if (confidence > 0.4) {  // Media confidenza
  return { valid: false, message: 'Riprova', ... }
} else {  // Bassa confidenza
  return { valid: false, message: 'Oggetto sbagliato', ... }
}
```

### Modifica Compressione Foto

In `shared/lib/imageCompression.js`:

```javascript
const maxSize = 512  // Dimensione massima (px)
'image/jpeg', 0.65   // Qualità JPEG (0-1)
```

### Storage Limits

In `training-app/pages/index.jsx`:

```javascript
storageLimit: 1000,  // MB (1GB)
canUpload: percentage < 95  // Blocca al 95%
```

## 🔧 Troubleshooting

### Problema: "Failed to load model"

**Soluzione**: Devi prima completare un training.
1. Raccogli almeno 100 foto in Training App
2. Click "RETRAIN MODEL"
3. Attendi completamento
4. Ricarica Testing App

### Problema: "Storage pieno"

**Soluzione**: Esegui retrain per liberare spazio.
- Il retrain cancella foto da storage (metadata rimane)
- Spazio si libera automaticamente
- Puoi raccogliere altre foto dopo

### Problema: "Camera permission denied"

**Soluzione**: Abilita permessi camera nel browser.
- Chrome: Settings → Privacy → Site Settings → Camera
- Safari: Preferences → Websites → Camera

### Problema: "Retrain failed"

**Soluzione**:
1. Verifica che Python sia installato: `python3 --version`
2. Verifica TensorFlow: `pip show tensorflow`
3. Controlla logs in console: errori dettagliati
4. Prova training manuale con Google Colab

## 📊 Database Schema

### Table: training_photos

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| image_url | TEXT | Path in Supabase Storage |
| label | TEXT | 'valid' or 'invalid' |
| file_size | INTEGER | Bytes |
| used_in_training | BOOLEAN | Se già usata in training |
| created_at | TIMESTAMP | Data upload |

### Table: model_versions

| Column | Type | Description |
|--------|------|-------------|
| version | TEXT | Primary key (e.g., 'v0.1') |
| trained_at | TIMESTAMP | Data training |
| training_photos_count | INTEGER | Numero foto usate |
| val_accuracy | FLOAT | Accuracy validazione (%) |

## 💰 Costi

### Development (Free)

- Supabase: Free tier (1GB storage, 2GB bandwidth)
- Vercel: Free tier (hosting)
- Google Colab: Free GPU per training
- **Totale: €0/mese**

### Production (Scalato)

- Supabase Pro: €25/mese (8GB storage, 50GB bandwidth)
- Vercel Pro: €20/mese (se necessario)
- Training compute: €0 (Google Colab)
- **Totale: €25-45/mese**

### Per 10.000 utenti:

- Storage: ~0 MB (train & delete workflow)
- Bandwidth: Minimo (TF.js model 5MB, cached)
- Compute: Zero (on-device inference)
- **Costi aggiuntivi: ~€0**

## 🎯 Performance

### Compression

- Input: ~3 MB/foto
- Output: ~100 KB/foto
- Ratio: **30x compression**
- Quality: Sufficiente per ML

### Inference Speed

- Model size: ~5 MB
- Load time: ~2 sec (first time)
- Inference: ~500ms/foto
- **Total: <3 sec first photo, <1 sec dopo**

### Training

- 100 foto: ~5-10 min (Google Colab GPU)
- 500 foto: ~15-20 min
- 1000 foto: ~30-40 min

## 📈 Roadmap

### v0.1 (Current) - MVP
- [x] Training webapp
- [x] Testing webapp
- [x] Basic ML model
- [x] Auto compression
- [x] Storage management

### v0.2 - Improvements
- [ ] Multi-category classification (non solo binary)
- [ ] User analytics dashboard
- [ ] A/B testing framework
- [ ] Model versioning system

### v0.3 - Scale
- [ ] Mobile app (React Native)
- [ ] Edge detection improvements
- [ ] Multi-language support
- [ ] API per integrazione terze parti

## 🤝 Contributing

Per contribuire:
1. Fork repository
2. Crea branch (`git checkout -b feature/amazing`)
3. Commit (`git commit -m 'Add amazing feature'`)
4. Push (`git push origin feature/amazing`)
5. Apri Pull Request

## 📄 License

MIT License - vedi LICENSE file

## 🙏 Credits

- **TensorFlow.js**: Google
- **MobileNetV3**: Google Research
- **Supabase**: Supabase Inc.
- **Next.js**: Vercel

## 📞 Support

Per problemi o domande:
- Apri un Issue su GitHub
- Email: your-email@example.com

---

**Made with ❤️ and 🤖 by Ben & Team**

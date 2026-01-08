# 🚀 Deploy su Vercel

## Prerequisites

- Account Vercel (gratuito)
- Repository GitHub con il progetto
- Supabase setup completato
- Almeno un modello trainato

## Step 1: Prepare Repository

1. **Commit tutto su GitHub**:
```bash
git add .
git commit -m "Initial commit - ready for deployment"
git push origin main
```

2. **Assicurati che .gitignore escluda**:
- `.env.local`
- `node_modules/`
- `/public/model/*.bin` (file modello troppo grandi)

## Step 2: Deploy Training App

1. Vai su https://vercel.com
2. Click "Import Project"
3. Seleziona repository GitHub
4. **Root Directory**: Lascia vuoto
5. **Framework Preset**: Next.js
6. **Environment Variables**:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   NEXT_PUBLIC_TRAINING_PASSWORD=...
   ```
7. Click "Deploy"

### Post-Deploy Training App

Training App sarà disponibile su:
```
https://your-project-name.vercel.app
```

**⚠️ Security**: Aggiungi password protection!

#### Opzione A: Vercel Password Protection (Pro plan)
Settings → Password Protection → Enable

#### Opzione B: Custom Auth (Free)
Già implementato in `training-app/pages/index.jsx`
- Password check via env variable
- Redirect non autenticati

## Step 3: Deploy Testing App

Per avere URL separato (opzionale):

1. Crea nuovo progetto Vercel
2. Stesso repo, ma:
   - **Root Directory**: `testing-app`
   - Solo env variables pubblici (no SERVICE_ROLE_KEY)

Oppure usa stesso deployment, routing automatico Next.js.

## Step 4: Upload Model a Vercel

Il modello TensorFlow.js deve essere accessibile pubblicamente.

### Opzione A: Supabase Storage (Consigliato)

1. Upload model files a Supabase Storage:
```bash
# Via dashboard o CLI
```

2. Crea bucket pubblico "models"

3. Update `shared/lib/tfjs-model.js`:
```javascript
const modelUrl = 'https://xxx.supabase.co/storage/v1/object/public/models/model.json'
model = await tf.loadLayersModel(modelUrl)
```

### Opzione B: Vercel Blob Storage

1. Install: `npm install @vercel/blob`
2. Upload model
3. Get public URL
4. Update loader

### Opzione C: CDN Esterno

1. Upload a Cloudflare R2 (free tier)
2. Get public URL
3. Update loader

## Step 5: Configurazione API Routes

Vercel supporta Next.js API routes out of the box.

**⚠️ Importante**: Python script per retrain

Vercel non supporta Python natively. Soluzioni:

### Soluzione A: Vercel + Python Runtime (Sperimentale)
```json
// vercel.json
{
  "functions": {
    "api/retrain.js": {
      "runtime": "python3.9"
    }
  }
}
```

### Soluzione B: Separate Retrain Service
1. Deploy script Python su Google Cloud Run (free tier)
2. API route chiama endpoint esterno
3. Più affidabile per production

### Soluzione C: Manual Retrain (MVP)
- Retrain rimane solo locale o Google Colab
- Upload model manualmente dopo training
- Ok per testing/MVP

## Step 6: Testing

1. **Test Training App**:
   - Login funziona?
   - Upload foto funziona?
   - Storage Supabase accessibile?

2. **Test Testing App**:
   - Model si carica?
   - Camera funziona?
   - Validazione funziona?

3. **Test API**:
   - `/api/retrain` risponde? (se deploy Python)

## Environment Variables su Vercel

**Public** (Testing + Training):
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_TRAINING_PASSWORD
```

**Private** (Solo Training):
```
SUPABASE_SERVICE_ROLE_KEY
```

## Monitoring

Vercel Dashboard fornisce:
- Real-time logs
- Error tracking
- Performance metrics
- Usage analytics

## Rollback

Se deploy fallisce:
```bash
vercel rollback
```

## Custom Domain (Opzionale)

1. Settings → Domains
2. Add domain
3. Configure DNS
4. SSL automatico

## Costi Vercel

**Free Tier** (sufficiente per testing):
- 100 GB bandwidth/mese
- Serverless functions
- Automatic SSL

**Pro Tier** ($20/mese):
- 1 TB bandwidth
- Password protection
- Team collaboration

## Troubleshooting

### "Module not found"
→ Check package.json, npm install

### "Environment variable missing"
→ Add in Vercel settings

### "API route timeout"
→ Retrain troppo lungo, usa external service

### "Model not loading"
→ Check CORS, model URL accessibile

## Alternative Platforms

Se Vercel non funziona bene:

- **Railway**: Supporta Python natively
- **Render**: Free tier generoso
- **Fly.io**: Vicino a utenti EU
- **Netlify**: Simile a Vercel

## Security Checklist

- [ ] Training app protetta da password
- [ ] Service role key non esposta
- [ ] CORS configurato correttamente
- [ ] Rate limiting API (se necessario)
- [ ] HTTPS ovunque

## Performance Optimization

1. **Model caching**: CloudFlare CDN
2. **Image optimization**: Next.js automatic
3. **Edge functions**: Vercel Edge (se serve)
4. **Compression**: Abilitata by default

---

**Deploy completato! 🎉**

Testing App pubblico: `https://your-app.vercel.app`
Training App privato: `https://your-app.vercel.app/training` (+ password)

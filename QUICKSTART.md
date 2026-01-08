# 🚀 GUIDA RAPIDA - 5 MINUTI

## Setup Veloce

### 1. Clone & Install (2 min)
```bash
git clone <repo-url>
cd intestinal-validator
npm install
pip install -r requirements.txt --break-system-packages
```

### 2. Supabase Setup (2 min)
1. Vai su https://supabase.com → New Project
2. SQL Editor → Incolla contenuto di `scripts/setup_supabase.sql` → Run
3. Storage → Create bucket "training-dataset" (Private)
4. Settings → API → Copia URL + Keys

### 3. Configurazione (1 min)
```bash
cp .env.example .env.local
# Modifica .env.local con le tue credenziali Supabase
```

### 4. Start! (30 sec)
```bash
npm run dev
# Training App: http://localhost:3001
# Testing App: http://localhost:3000
```

## Primo Training (1 ora)

### Step 1: Raccogli Foto
1. Apri http://localhost:3001
2. Login (password da .env.local)
3. Scatta 100 foto:
   - 50 VALID (clic "Scatta VALID")
   - 50 INVALID (clic "Scatta INVALID")

### Step 2: Train Model
1. Quando arrivi a 100 foto, appare "RETRAIN MODEL"
2. Click → Attendi 10-15 min
3. ✅ Done! Model pronto

### Step 3: Testa
1. Apri http://localhost:3000
2. Scatta foto test
3. Vedi risultato in 1-2 sec!

## Comandi Utili

```bash
# Start training app only
npm run training

# Start testing app only
npm run testing

# Check database
# Vai su Supabase Dashboard → Table Editor

# Deploy su Vercel
vercel
```

## Problemi Comuni

**"Model not found"**
→ Devi prima fare training (Step 2 sopra)

**"Storage pieno"**
→ Click "RETRAIN MODEL" per liberare spazio

**"Camera not working"**
→ Abilita permessi camera nel browser

## Next Steps

1. ✅ Raccogli più foto (più dati = modello migliore)
2. ✅ Testa con foto edge cases
3. ✅ Retrain ogni 100 nuove foto
4. ✅ Deploy su Vercel quando pronto

## Domande?

Leggi README.md completo per dettagli avanzati!

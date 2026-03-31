# Flusso training (riferimento dopo git pull)

Questo file descrive **cosa fa il codice in questo repository** e **cosa deve fare il backend Cloud Run** che non è versionato qui. Dopo un pull, leggi questo file prima di cambiare env o API.

## 1. Raccoglimento dati (Training App)

- **Autenticazione**: password in `NEXT_PUBLIC_TRAINING_PASSWORD` (o fallback hardcoded `training123` in dev — da evitare in produzione).
- **Upload di ogni foto**: il browser chiama **solo** il servizio pubblico:
  - `POST {NEXT_PUBLIC_CLOUD_RUN_URL}/upload-training-photo`
  - `multipart/form-data`: `photo`, `label` (`valid` | `invalid`), `uploaded_by`
- **Effetto atteso sul backend** (tipico del servizio feature + DB):
  - file su Storage bucket `training-dataset`;
  - riga in `training_photos` con `used_in_training = false`, `image_url`, eventuali `features`, ecc.
- **Limite UI sul “round”** (file `training-app/pages/index.jsx`):
  - massimo **50** nuove foto **valid** e **50** nuove **invalid** (`unusedValid` / `unusedInvalid` < 50 per abilitare il bottone cattura);
  - il bottone **“TRAIN NUOVO MODELLO”** compare solo se `unusedTotal >= 100` (conteggio righe con `used_in_training === false`).
- **Label “intelligente”**: in stats si usa il prefisso sul filename (`valid_` / `invalid_`) se presente, altrimenti il campo `label` DB.

## 2. Avvio training (bottone in Training App)

- **Non passa da Next.js**: la chiamata parte **dal browser** verso Cloud Run:
  - `POST {NEXT_PUBLIC_CLOUD_RUN_URL}/train-model`
  - body JSON tipico: `{ "min_photos": 100 }`
- Risposta attesa di successo: JSON con `success: true` e `version` (stringa identificativa del job / modello).
- Il frontend salva `training_active_version` in `localStorage` e fa polling:
  - `GET {NEXT_PUBLIC_CLOUD_RUN_URL}/training-status/{version}`
  - stati attesi: `training` → poi `completed` o `failed`; in `completed` con `train_accuracy` ecc.
- `_app.js` mostra una barra di stato globale usando gli stessi endpoint.

**Nota**: nel repo `poop-validator-retrain` (Flask) trovi **upload** e **backfill feature**, non le route `/train-model` e `/training-status`. Il job che ha trainato davvero è un **altro deploy** (o stesso URL ma codice non in questo monorepo): deve implementare quel contratto.

## 3. Percorso alternativo (non usato dalla Training App UI)

- `POST /api/retrain` (Next.js server) usa variabili **server-side**:
  - `CLOUD_RUN_RETRAIN_URL` + `CLOUD_RUN_SECRET_KEY`
  - chiama `POST {CLOUD_RUN_RETRAIN_URL}/train` con header `Authorization: Bearer …`
- È un **contratto diverso** (path `/train`, auth Bearer, niente polling dalla UI attuale). Se il tuo training “ufficiale” è quello del bottone, ignora questo per la UX; tenerlo allineato è lavoro sul deploy.

## 4. Dopo un training riuscito (contratto dati Supabase)

Per non perdere lo storico e permettere il **secondo** (e successivi) training:

- **`training_photos`**: le foto usate nel batch devono avere `used_in_training = true` (e idealmente `model_version` valorizzato). Le nuove foto restano `false`. Così `unusedTotal` si resetta e puoi ricominciare a raccogliere verso 100.
- **`model_versions`**: **solo INSERT** di una nuova riga per ogni training (nuovo `version` / `id`). Eventualmente **UPDATE** `is_active` sulle righe vecchie. **Mai** `DELETE` / `TRUNCATE` se vuoi storico in dashboard.
- Opzionale: script SQL `scripts/protect_model_history.sql` per bloccare DELETE su `model_versions` a livello DB.

## 5. Dashboard (“Modelli trainati”)

- Carica `model_versions` ordinate per data (`created_at`, fallback `trained_at`), **senza** filtrare via righe con `status` nullo o diverso da `completed` (evita storico “invisibile” in UI).
- Ogni riga può contenere `metrics` JSON (RandomForest / matrice di confusione, ecc.) a seconda dello schema reale su Supabase.

## 6. “Not enough photos” pur essendoci abbastanza foto

Cause tipiche:

1. **`used_in_training` NULL**: in JavaScript `!null` è “non usata”; in SQL `WHERE used_in_training = false` **esclude** NULL. Soluzione: `scripts/normalize_used_in_training_nulls.sql`.
2. **Senza `features`**: il job di training spesso ignora le righe senza vettore features; la Training App espone **“Pronte per il train”** (non usate + con features) e il bottone richiede 100 totali e 50+50 per classe **tra quelle con features**.

## 7. Backfill features dalla Training App

- Bottone **“Estrai features (Cloud Run)”** quando ci sono foto senza features.
- Chiama `POST /api/backfill-features` (Next.js), che fa proxy a `POST {CLOUD_RUN_URL}/backfill-features` con header `Authorization: Bearer {CLOUD_RUN_SECRET_KEY}`.
- In `.env.local` servono **stesso** URL del servizio (`NEXT_PUBLIC_CLOUD_RUN_URL` o `CLOUD_RUN_SERVICE_URL`) e **`CLOUD_RUN_SECRET_KEY`** allineato a quanto si aspetta Cloud Run.

## 8. Variabili d’ambiente minime (frontend)

Vedi `.env.local.template`: `NEXT_PUBLIC_CLOUD_RUN_URL`, Supabase pubblico, password training; per backfill anche `CLOUD_RUN_SECRET_KEY`. Senza URL pubblico, upload e training dal browser falliscono.

## 9. Training locale / notebook (fuori da Cloud Run)

- `scripts/retrain_model.py`: training MobileNet con cartelle `valid/` e `invalid/` in locale, export TF.js in `public/model/`. Non sostituisce da solo il flusso Cloud Run della Training App.

---

**In sintesi**: questo repo definisce **UX, Supabase lato client, e contratti HTTP** per upload + train asincrono. Il **motore ML che scarica le foto, allena e scrive `model_versions`** vive nel servizio che deployi su Cloud Run; per non dover “tornare a correggere” dopo un pull, mantieni quel servizio allineato a `train-model` / `training-status` e all’append-only su `model_versions`.

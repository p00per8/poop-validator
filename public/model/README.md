# 🤖 Model Directory

Questa cartella conterrà il modello TensorFlow.js dopo il primo training.

## File che appariranno qui:

```
/public/model/
├── model.json           # Model architecture
└── group1-shard1of1.bin # Model weights (~5 MB)
```

## Come generare il modello:

### Opzione 1: Automatic (Consigliato)
1. Raccogli 100+ foto in Training App
2. Click "RETRAIN MODEL"
3. Attendi 10-20 minuti
4. ✅ File generati automaticamente qui

### Opzione 2: Manual (Google Colab)
1. Apri `notebooks/training.ipynb` in Google Colab
2. Esegui tutte le celle
3. Scarica i file generati
4. Carica qui manualmente

## ⚠️ Importante

**NON committare i file .bin su Git** (sono troppo grandi!)

Il `.gitignore` è già configurato per escluderli.

## Verifica Modello

Dopo il training, verifica che i file esistano:

```bash
ls -lh public/model/
# Dovresti vedere:
# model.json (~100 KB)
# group1-shard1of1.bin (~5 MB)
```

## Testing

Apri Testing App e verifica che non ci siano errori console:

```
✅ Model loaded successfully
```

Se vedi "Model not found", significa che devi ancora fare il training.

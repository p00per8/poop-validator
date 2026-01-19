#!/bin/bash

set -e  # Exit on error

echo "🚀 Setup e Sync Labels - Poop Validator"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Errore: Esegui questo script dalla directory poop-validator${NC}"
    echo "   cd /home/user/poop-validator"
    exit 1
fi

# Check if training-app exists
if [ ! -d "training-app" ]; then
    echo -e "${RED}❌ Errore: Directory training-app non trovata${NC}"
    exit 1
fi

# Check for .env.local
ENV_FILE="training-app/.env.local"

if [ ! -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}⚠️  File .env.local non trovato!${NC}"
    echo ""
    echo "Devi creare il file con le credenziali Supabase."
    echo ""
    echo "Vai su: https://app.supabase.com → Il tuo progetto → Settings → API"
    echo ""
    echo "Copia questo template e sostituisci i valori:"
    echo ""
    echo "NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co"
    echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi..."
    echo "SUPABASE_SERVICE_KEY=eyJhbGciOi..."
    echo "NEXT_PUBLIC_TRAINING_PASSWORD=your_password"
    echo ""
    echo "Vuoi aprire nano per creare il file ora? (y/n)"
    read -r response

    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        nano "$ENV_FILE"

        # Check if file was created
        if [ ! -f "$ENV_FILE" ]; then
            echo -e "${RED}❌ File non creato. Abortito.${NC}"
            exit 1
        fi
    else
        echo -e "${RED}❌ Impossibile continuare senza .env.local${NC}"
        exit 1
    fi
fi

# Verify .env.local has required variables
if ! grep -q "NEXT_PUBLIC_SUPABASE_URL" "$ENV_FILE"; then
    echo -e "${RED}❌ Errore: NEXT_PUBLIC_SUPABASE_URL mancante in .env.local${NC}"
    exit 1
fi

if ! grep -q "NEXT_PUBLIC_SUPABASE_ANON_KEY" "$ENV_FILE"; then
    echo -e "${RED}❌ Errore: NEXT_PUBLIC_SUPABASE_ANON_KEY mancante in .env.local${NC}"
    exit 1
fi

echo -e "${GREEN}✅ File .env.local trovato e valido${NC}"
echo ""

# Check if node_modules exists in training-app
if [ ! -d "training-app/node_modules" ]; then
    echo "📦 Installazione dipendenze..."
    cd training-app
    npm install
    cd ..
    echo -e "${GREEN}✅ Dipendenze installate${NC}"
    echo ""
fi

# Check if server is already running
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Server Next.js già in esecuzione${NC}"
    SERVER_RUNNING=true
else
    echo "🔄 Avvio server Next.js..."
    cd training-app
    npm run dev > /tmp/nextjs-dev.log 2>&1 &
    SERVER_PID=$!
    cd ..

    echo "   Attendo che il server sia pronto..."

    # Wait for server to be ready (max 30 seconds)
    for i in {1..30}; do
        if curl -s http://localhost:3000 > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Server avviato su http://localhost:3000 (PID: $SERVER_PID)${NC}"
            SERVER_RUNNING=true
            break
        fi
        sleep 1
        echo -n "."
    done
    echo ""

    if [ "$SERVER_RUNNING" != "true" ]; then
        echo -e "${RED}❌ Timeout: Server non avviato dopo 30 secondi${NC}"
        echo "   Controlla i log: tail -f /tmp/nextjs-dev.log"
        kill $SERVER_PID 2>/dev/null || true
        exit 1
    fi
fi

echo ""
echo "🔄 Sincronizzazione Label da Filename"
echo "======================================"
echo ""

# Call sync API
RESPONSE=$(curl -s -X POST http://localhost:3000/api/sync-labels \
  -H "Content-Type: application/json")

# Check if response is valid JSON
if echo "$RESPONSE" | jq empty 2>/dev/null; then
    echo -e "${GREEN}📝 Risposta API:${NC}"
    echo "$RESPONSE" | jq '.'

    # Extract stats
    SYNCED=$(echo "$RESPONSE" | jq -r '.synced // 0')
    SKIPPED=$(echo "$RESPONSE" | jq -r '.skipped // 0')
    ERRORS=$(echo "$RESPONSE" | jq -r '.errors // 0')
    TOTAL=$(echo "$RESPONSE" | jq -r '.total // 0')

    echo ""
    echo "======================================"
    echo -e "${GREEN}📊 RIEPILOGO:${NC}"
    echo "   ✅ Aggiornati: $SYNCED"
    echo "   ⏭️  Già sincronizzati: $SKIPPED"
    if [ "$ERRORS" -gt 0 ]; then
        echo -e "   ${RED}❌ Errori: $ERRORS${NC}"
    fi
    echo "   📝 Totale: $TOTAL"
    echo "======================================"

    if [ "$SYNCED" -gt 0 ]; then
        echo ""
        echo -e "${GREEN}✨ Sincronizzazione completata!${NC}"
        echo "   Apri http://localhost:3000/training per vedere i conteggi aggiornati"
        echo "   Apri http://localhost:3000/training/dashboard per la dashboard"
    else
        echo ""
        echo -e "${GREEN}✨ Tutti i label erano già sincronizzati!${NC}"
    fi
else
    echo -e "${RED}❌ Errore nella risposta API:${NC}"
    echo "$RESPONSE"
    exit 1
fi

echo ""
echo -e "${YELLOW}ℹ️  Il server Next.js è ancora in esecuzione.${NC}"
echo "   Per fermarlo: pkill -f 'next dev'"
echo ""

exit 0

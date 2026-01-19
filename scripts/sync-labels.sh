#!/bin/bash

echo "🔄 Sincronizzazione Label da Filename"
echo "====================================="
echo ""
echo "Questo script sincronizza i label nel database con i nomi dei file in Supabase Storage"
echo ""

# Check if server is running
if ! curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "❌ Server Next.js non in esecuzione!"
    echo "   Avvia il server con: npm run dev"
    exit 1
fi

echo "📡 Invio richiesta all'API..."
echo ""

# Call the API
RESPONSE=$(curl -s -X POST http://localhost:3000/api/sync-labels \
  -H "Content-Type: application/json")

# Pretty print the response
echo "📝 Risposta:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

echo ""
echo "✅ Completato! Ricarica index e dashboard per vedere i conteggi aggiornati."

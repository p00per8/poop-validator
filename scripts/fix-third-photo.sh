#!/bin/bash

echo "🔧 Correzione Terza Foto di Oggi"
echo "================================="
echo ""
echo "Questo script correggerà la terza foto di oggi da 'invalid' a 'valid'"
echo ""

# Check if server is running
if ! curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "❌ Server Next.js non in esecuzione!"
    echo "   Avvia il server con: npm run dev"
    exit 1
fi

echo "📡 Invio richiesta all'API..."
echo ""

# Call the API (photoIndex=2 means third photo, 0-indexed)
RESPONSE=$(curl -s -X POST http://localhost:3000/api/fix-photo \
  -H "Content-Type: application/json" \
  -d '{"photoIndex": 2}')

# Pretty print the response
echo "📝 Risposta:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

echo ""
echo "✅ Completato! Controlla la dashboard per verificare."

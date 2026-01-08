#!/bin/bash

# 🚀 Intestinal Validator - Automated Setup Script
# This script automates the initial setup process

set -e  # Exit on error

echo "🚀 Starting Intestinal Validator Setup..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if Node.js is installed
echo "Checking prerequisites..."
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi
print_success "Node.js found: $(node --version)"

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    print_warning "Python 3 is not installed. Training features will not work."
    echo "Install Python 3.9+ to enable model training."
else
    print_success "Python found: $(python3 --version)"
fi

# Install npm dependencies
echo ""
echo "📦 Installing npm dependencies..."
npm install
print_success "npm dependencies installed"

# Install Python dependencies (if Python is available)
if command -v python3 &> /dev/null; then
    echo ""
    echo "🐍 Installing Python dependencies..."
    if command -v pip3 &> /dev/null; then
        pip3 install -r requirements.txt --break-system-packages 2>/dev/null || pip3 install -r requirements.txt
        print_success "Python dependencies installed"
    else
        print_warning "pip3 not found. Skipping Python dependencies."
    fi
fi

# Setup environment file
echo ""
echo "⚙️  Setting up environment file..."
if [ ! -f .env.local ]; then
    cp .env.example .env.local
    print_success "Created .env.local from template"
    echo ""
    print_warning "IMPORTANT: Edit .env.local with your Supabase credentials!"
    echo ""
    echo "You need to:"
    echo "1. Create a Supabase project at https://supabase.com"
    echo "2. Run scripts/setup_supabase.sql in SQL Editor"
    echo "3. Create 'training-dataset' storage bucket (private)"
    echo "4. Copy URL and keys to .env.local"
    echo ""
else
    print_success ".env.local already exists"
fi

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p public/model
mkdir -p data/train/valid
mkdir -p data/train/invalid
print_success "Directories created"

# Setup complete
echo ""
echo "════════════════════════════════════════"
echo "🎉 Setup Complete!"
echo "════════════════════════════════════════"
echo ""
echo "Next steps:"
echo ""
echo "1. Edit .env.local with your Supabase credentials"
echo "   (See QUICKSTART.md for Supabase setup)"
echo ""
echo "2. Start development server:"
echo "   npm run dev"
echo ""
echo "3. Open apps:"
echo "   Training App: http://localhost:3001"
echo "   Testing App:  http://localhost:3000"
echo ""
echo "4. Collect 100+ photos in Training App"
echo ""
echo "5. Click 'RETRAIN MODEL' to train first model"
echo ""
echo "6. Test in Testing App"
echo ""
echo "📖 Read README.md for full documentation"
echo "⚡ Read QUICKSTART.md for 5-minute guide"
echo ""
echo "Happy coding! 🚀"

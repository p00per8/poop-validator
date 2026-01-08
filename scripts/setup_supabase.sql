-- ============================================
-- SUPABASE SCHEMA FOR INTESTINAL VALIDATOR
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLE: training_photos
-- Stores metadata for all training photos
-- ============================================
CREATE TABLE IF NOT EXISTS training_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  image_url TEXT NOT NULL,
  label TEXT NOT NULL CHECK (label IN ('valid', 'invalid')),
  sublabel TEXT,  -- Optional: specific reason (e.g., 'too_much_paper', 'wrong_object')
  file_size INTEGER,  -- Size in bytes
  uploaded_by TEXT DEFAULT 'team',
  used_in_training BOOLEAN DEFAULT FALSE,
  model_version TEXT,  -- Which model version used this photo
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX idx_training_photos_label ON training_photos(label);
CREATE INDEX idx_training_photos_used ON training_photos(used_in_training);
CREATE INDEX idx_training_photos_created ON training_photos(created_at);

-- ============================================
-- TABLE: model_versions
-- Tracks different model versions over time
-- ============================================
CREATE TABLE IF NOT EXISTS model_versions (
  version TEXT PRIMARY KEY,
  trained_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  training_photos_count INTEGER,
  train_accuracy FLOAT,
  val_accuracy FLOAT,
  notes TEXT,
  model_url TEXT,  -- URL to stored .h5 file or TF.js model
  is_active BOOLEAN DEFAULT TRUE
);

-- ============================================
-- TABLE: validation_logs (Optional)
-- Logs all validations from testing app
-- ============================================
CREATE TABLE IF NOT EXISTS validation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_version TEXT,
  confidence FLOAT,
  result TEXT CHECK (result IN ('valid', 'invalid', 'uncertain')),
  detected_reason TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- STORAGE BUCKET SETUP
-- ============================================
-- Run this in Supabase Dashboard > Storage

-- Create storage bucket for training photos
-- Bucket name: training-dataset
-- Public: false (private)
-- File size limit: 5 MB
-- Allowed MIME types: image/jpeg, image/jpg

-- SQL to create bucket (if not using UI):
INSERT INTO storage.buckets (id, name, public)
VALUES ('training-dataset', 'training-dataset', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on tables
ALTER TABLE training_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role full access (for API)
CREATE POLICY "Service role full access on training_photos"
ON training_photos
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on model_versions"
ON model_versions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on validation_logs"
ON validation_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Policy: Allow anon users to insert validation logs (optional)
CREATE POLICY "Allow anon insert validation_logs"
ON validation_logs
FOR INSERT
TO anon
WITH CHECK (true);

-- ============================================
-- STORAGE POLICIES
-- ============================================

-- Policy: Allow service role full access to storage
CREATE POLICY "Service role full access to training-dataset"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'training-dataset')
WITH CHECK (bucket_id = 'training-dataset');

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update updated_at on training_photos
CREATE TRIGGER update_training_photos_updated_at
BEFORE UPDATE ON training_photos
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- HELPFUL QUERIES
-- ============================================

-- Get training statistics
-- SELECT 
--   label,
--   COUNT(*) as count,
--   SUM(file_size) / 1024 / 1024 as total_mb,
--   AVG(file_size) / 1024 as avg_kb
-- FROM training_photos
-- GROUP BY label;

-- Get photos not yet used in training
-- SELECT * FROM training_photos 
-- WHERE used_in_training = false 
-- ORDER BY created_at DESC;

-- Get model history
-- SELECT * FROM model_versions 
-- ORDER BY trained_at DESC;

-- Calculate storage usage
-- SELECT 
--   COUNT(*) as total_files,
--   SUM(file_size) / 1024 / 1024 as total_mb,
--   (SUM(file_size) / 1024.0 / 1024.0 / 1000.0) * 100 as percentage_of_1gb
-- FROM training_photos
-- WHERE used_in_training = false;

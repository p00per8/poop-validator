#!/usr/bin/env python3
"""
Retrain MobileNetV3 model with new photos
Usage: python retrain_model.py /path/to/training/data
"""

import sys
import os
import tensorflow as tf
from tensorflow.keras.applications import MobileNetV3Small
from tensorflow.keras.preprocessing.image import ImageDataGenerator
from tensorflow.keras import layers, models
import tensorflowjs as tfjs

# Suppress TF warnings
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

def create_model():
    """Create MobileNetV3 model for binary classification"""
    base_model = MobileNetV3Small(
        weights='imagenet',
        include_top=False,
        input_shape=(224, 224, 3)
    )
    
    # Freeze base model initially
    base_model.trainable = False
    
    model = models.Sequential([
        base_model,
        layers.GlobalAveragePooling2D(),
        layers.Dense(128, activation='relu'),
        layers.Dropout(0.5),
        layers.Dense(1, activation='sigmoid')  # Binary output
    ])
    
    model.compile(
        optimizer='adam',
        loss='binary_crossentropy',
        metrics=['accuracy']
    )
    
    return model

def retrain_model(data_dir, output_dir='./public/model'):
    """
    Retrain model with new data
    
    Args:
        data_dir: Path to training data (should contain 'valid' and 'invalid' subdirs)
        output_dir: Path to save TensorFlow.js model
    """
    print(f"🚀 Starting retrain with data from: {data_dir}")
    
    # Check if data exists
    valid_dir = os.path.join(data_dir, 'valid')
    invalid_dir = os.path.join(data_dir, 'invalid')
    
    if not os.path.exists(valid_dir) or not os.path.exists(invalid_dir):
        raise ValueError(f"Missing 'valid' or 'invalid' directories in {data_dir}")
    
    valid_count = len([f for f in os.listdir(valid_dir) if f.endswith('.jpg')])
    invalid_count = len([f for f in os.listdir(invalid_dir) if f.endswith('.jpg')])
    
    print(f"📊 Dataset: {valid_count} valid, {invalid_count} invalid")
    
    if valid_count < 25 or invalid_count < 25:
        raise ValueError("Need at least 25 photos per class")
    
    # Data augmentation
    datagen = ImageDataGenerator(
        rescale=1./255,
        validation_split=0.2,
        rotation_range=15,
        width_shift_range=0.1,
        height_shift_range=0.1,
        shear_range=0.1,
        zoom_range=0.1,
        horizontal_flip=True,
        fill_mode='nearest'
    )
    
    # Load training data
    train_generator = datagen.flow_from_directory(
        data_dir,
        target_size=(224, 224),
        batch_size=16,
        class_mode='binary',
        subset='training',
        shuffle=True
    )
    
    # Load validation data
    val_generator = datagen.flow_from_directory(
        data_dir,
        target_size=(224, 224),
        batch_size=16,
        class_mode='binary',
        subset='validation',
        shuffle=False
    )
    
    # Try to load existing model, or create new one
    model_path = './current_model.h5'
    
    if os.path.exists(model_path):
        print("📂 Loading existing model for fine-tuning...")
        try:
            model = tf.keras.models.load_model(model_path)
            print("✅ Existing model loaded")
        except Exception as e:
            print(f"⚠️ Failed to load existing model: {e}")
            print("🆕 Creating new model...")
            model = create_model()
    else:
        print("🆕 Creating new model (first training)...")
        model = create_model()
    
    # Callbacks
    callbacks = [
        tf.keras.callbacks.EarlyStopping(
            monitor='val_loss',
            patience=3,
            restore_best_weights=True
        ),
        tf.keras.callbacks.ReduceLROnPlateau(
            monitor='val_loss',
            factor=0.5,
            patience=2,
            min_lr=1e-7
        )
    ]
    
    # Train
    print("🧠 Training model...")
    history = model.fit(
        train_generator,
        validation_data=val_generator,
        epochs=10,
        callbacks=callbacks,
        verbose=1
    )
    
    # Get final accuracy
    val_accuracy = history.history['val_accuracy'][-1] * 100
    train_accuracy = history.history['accuracy'][-1] * 100
    
    print(f"\n✅ Training completed!")
    print(f"   Train Accuracy: {train_accuracy:.2f}%")
    print(f"   Val Accuracy: {val_accuracy:.2f}%")
    
    # Save Keras model
    model.save(model_path)
    print(f"💾 Model saved to {model_path}")
    
    # Export to TensorFlow.js
    print(f"📦 Exporting to TensorFlow.js...")
    
    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)
    
    tfjs.converters.save_keras_model(model, output_dir)
    print(f"✅ TensorFlow.js model exported to {output_dir}")
    
    # Output accuracy for parsing by Node.js
    print(f"Accuracy: {val_accuracy:.2f}")
    
    return val_accuracy

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python retrain_model.py <data_directory>")
        sys.exit(1)
    
    data_dir = sys.argv[1]
    
    try:
        accuracy = retrain_model(data_dir)
        print(f"\n🎉 SUCCESS! Model accuracy: {accuracy:.2f}%")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

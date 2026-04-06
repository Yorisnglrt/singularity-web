'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import styles from './AvatarUpload.module.css';

interface AvatarUploadProps {
  currentUrl?: string;
  onUploadSuccess: (url: string) => void;
}

export default function AvatarUpload({ currentUrl, onUploadSuccess }: AvatarUploadProps) {
  const { user } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Clean up object URLs to avoid memory leaks
  useEffect(() => {
    return () => {
      if (previewSrc && previewSrc.startsWith('blob:')) {
        URL.revokeObjectURL(previewSrc);
      }
    };
  }, [previewSrc]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validation
    if (!file.type.startsWith('image/')) {
      setMessage({ text: 'Please select an image file (JPG, PNG, WebP).', type: 'error' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage({ text: 'File is too large. Max size is 5MB.', type: 'error' });
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewSrc(url);
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    setMessage(null);
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!previewSrc) return;
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setDragStart({ x: clientX - position.x, y: clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setPosition({
      x: clientX - dragStart.x,
      y: clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleSave = async () => {
    if (!user || !imgRef.current || !previewSrc) return;
    setIsUploading(true);
    setMessage(null);

    try {
      const canvas = document.createElement('canvas');
      const size = 400; // Standard avatar output size
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not create canvas context');

      // Clear canvas
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, size, size);

      // Calculations for drawing the cropped image
      const img = imgRef.current;
      const container = containerRef.current!;
      
      // Calculate how to draw the image based on zoom and position
      // Current image dimensions in the container
      const rect = container.getBoundingClientRect();
      const scale = (img.naturalWidth / img.width); // How much larger natural size is than displayed size
      
      // The drawing logic needs to map the visible portion in the 200px container 
      // to the 400px canvas
      const canvasScale = size / rect.width; // 400 / 200 = 2
      
      // Draw image
      ctx.drawImage(
        img,
        (position.x * scale),
        (position.y * scale),
        img.naturalWidth * zoom,
        img.naturalHeight * zoom
      );

      // Alternative simpler approach: Use the actual visible area
      // 1. Draw centered
      ctx.save();
      ctx.translate(size / 2, size / 2);
      ctx.scale(zoom, zoom);
      
      // Map the relative offset from the center of the viewport
      // Viewport is rect.width wide, image is img.width wide.
      const rawOffsetX = position.x * canvasScale;
      const rawOffsetY = position.y * canvasScale;
      
      ctx.drawImage(
        img, 
        (rawOffsetX - (img.width * canvasScale / 2)) / zoom,
        (rawOffsetY - (img.height * canvasScale / 2)) / zoom,
        (img.width * canvasScale) / zoom,
        (img.height * canvasScale) / zoom
      );
      
      // Re-implementing correctly:
      // We want to draw the image such that the portion visible in the 200px circle 
      // is what ends up in the 400px canvas.
      
      // Clear and use the most reliable drawing method
      ctx.restore();
      ctx.clearRect(0,0,size,size);
      ctx.fillStyle = '#050507'; // Deep black background
      ctx.fillRect(0,0,size,size);
      
      // The viewport is 'size' pixels (400).
      // The image displayed in UI has a certain width/height.
      // We apply the same relative zoom and position.
      const displayToCanvasFactor = size / 200; // UI Container is 200px
      
      const drawWidth = img.width * displayToCanvasFactor * zoom;
      const drawHeight = img.height * displayToCanvasFactor * zoom;
      const drawX = (size / 2) + (position.x * displayToCanvasFactor) - (drawWidth / 2);
      const drawY = (size / 2) + (position.y * displayToCanvasFactor) - (drawHeight / 2);

      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

      // Convert to blob
      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.9));
      if (!blob) throw new Error('Failed to generate image blob');

      // Upload to Supabase Storage
      const fileExt = 'jpg';
      const filePath = `${user.id}/avatar.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, blob, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Add timestamp to bust cache
      const finalUrl = `${publicUrl}?t=${Date.now()}`;
      
      onUploadSuccess(finalUrl);
      setPreviewSrc(null);
      setMessage({ text: 'Avatar updated!', type: 'success' });
      
    } catch (err: any) {
      console.error('Avatar upload error:', err);
      setMessage({ text: err.message || 'Failed to upload avatar.', type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.previewContainer}>
        {/* The Viewport */}
        <div 
          ref={containerRef}
          className={styles.viewport}
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
          onMouseMove={handleMouseMove}
          onTouchMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchEnd={handleMouseUp}
        >
          {previewSrc ? (
            <img 
              ref={imgRef}
              src={previewSrc} 
              alt="Preview" 
              className={styles.previewImg}
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
                cursor: isDragging ? 'grabbing' : 'grab'
              }}
              draggable={false}
            />
          ) : (
            <div className={styles.currentAvatar}>
              {currentUrl ? (
                <img src={currentUrl} alt="Current profile" className={styles.currentAvatarImg} />
              ) : (
                <span className={styles.placeholder}>◈</span>
              )}
            </div>
          )}
          
          {/* Overlay to show the circle crop area */}
          <div className={styles.overlay} />
        </div>

        {/* Controls */}
        <div className={styles.controls}>
          {previewSrc ? (
            <>
              <div className={styles.zoomControl}>
                <label>Zoom</label>
                <input 
                  type="range" 
                  min="0.5" 
                  max="3" 
                  step="0.01" 
                  value={zoom} 
                  onChange={(e) => setZoom(parseFloat(e.target.value))} 
                />
              </div>
              <div className={styles.actions}>
                <button 
                  type="button" 
                  className={styles.saveBtn} 
                  onClick={handleSave}
                  disabled={isUploading}
                >
                  {isUploading ? 'Uploading...' : 'Confirm & Save'}
                </button>
                <button 
                  type="button" 
                  className={styles.cancelBtn} 
                  onClick={() => setPreviewSrc(null)}
                  disabled={isUploading}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <button 
              type="button" 
              className={styles.uploadBtn}
              onClick={() => fileInputRef.current?.click()}
            >
              Change Photo
            </button>
          )}
        </div>
      </div>

      <input 
        ref={fileInputRef}
        type="file" 
        accept="image/*" 
        onChange={handleFileChange} 
        style={{ display: 'none' }} 
      />

      {message && (
        <div className={`${styles.message} ${styles[message.type]}`}>
          {message.text}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './ImageUpload.module.css';

interface ImageUploadProps {
  currentUrl?: string;
  onUploadSuccess: (url: string) => void;
  bucket: string;
  uploadPath: string;
  label?: string;
  aspectRatio?: number; // width / height, e.g. 1 for square, 0.75 for 3:4 portrait
  circular?: boolean;
  outputWidth?: number;
  outputHeight?: number;
  allowZoomOutToFit?: boolean;
}

export default function ImageUpload({
  currentUrl,
  onUploadSuccess,
  bucket,
  uploadPath,
  label = 'Change Image',
  aspectRatio = 1,
  circular = false,
  outputWidth = 400,
  outputHeight = 400,
  allowZoomOutToFit = false
}: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [minZoom, setMinZoom] = useState(0.5);
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

    if (!file.type.startsWith('image/')) {
      setMessage({ text: 'Please select an image file.', type: 'error' });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setMessage({ text: 'File is too large. Max size is 10MB.', type: 'error' });
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewSrc(url);
    // Initial reset, actual calculation happens in handleImageLoad
    setZoom(1);
    setMinZoom(0.5);
    setPosition({ x: 0, y: 0 });
    setMessage(null);
  };

  const handleImageLoad = () => {
    if (!imgRef.current || !containerRef.current || !allowZoomOutToFit) return;
    
    const img = imgRef.current;
    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    
    // Calculate zooms relative to natural dimensions
    const zoomX = containerRect.width / img.naturalWidth;
    const zoomY = containerRect.height / img.naturalHeight;
    
    const fitZoom = Math.min(zoomX, zoomY);
    const fillZoom = Math.max(zoomX, zoomY);
    
    setMinZoom(fitZoom);
    setZoom(fillZoom);
    setPosition({ x: 0, y: 0 });
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
    if (!imgRef.current || !previewSrc) return;
    setIsUploading(true);
    setMessage({ text: 'Processing and uploading...', type: 'success' });

    try {
      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not create canvas context');

      ctx.fillStyle = '#050507';
      ctx.fillRect(0, 0, outputWidth, outputHeight);

      const img = imgRef.current;
      const container = containerRef.current!;
      const containerRect = container.getBoundingClientRect();
      
      // Calculate how to draw the image based on zoom and position
      // The viewport UI width is fixed at 300px (from CSS) unless resized by parent.
      // But we use the actual measured width.
      const viewportWidth = containerRect.width;
      const viewportHeight = containerRect.height;
      
      const displayToCanvasFactorX = outputWidth / viewportWidth;
      const displayToCanvasFactorY = outputHeight / viewportHeight;
      
      const drawWidth = img.width * displayToCanvasFactorX * zoom;
      const drawHeight = img.height * displayToCanvasFactorY * zoom;
      
      const drawX = (outputWidth / 2) + (position.x * displayToCanvasFactorX) - (drawWidth / 2);
      const drawY = (outputHeight / 2) + (position.y * displayToCanvasFactorY) - (drawHeight / 2);

      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.9));
      if (!blob) throw new Error('Failed to generate image blob');

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(uploadPath, blob, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(uploadPath);

      const finalUrl = `${publicUrl}?t=${Date.now()}`;
      
      onUploadSuccess(finalUrl);
      setPreviewSrc(null);
      setMessage({ text: 'Upload successful!', type: 'success' });
      
    } catch (err: any) {
      console.error('Image upload error:', err);
      setMessage({ text: err.message || 'Failed to upload image.', type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  // Viewport styling
  const viewportStyle = {
    width: '100%',
    maxWidth: '300px',
    aspectRatio: `${aspectRatio}`,
    height: 'auto'
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.previewContainer}>
        <div 
          ref={containerRef}
          className={`${styles.viewport} ${circular ? styles.circular : ''}`}
          style={viewportStyle}
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
              onLoad={handleImageLoad}
              style={{
                transform: `translate(-50%, -50%) translate(${position.x}px, ${position.y}px) scale(${zoom})`,
                cursor: isDragging ? 'grabbing' : 'grab'
              }}
              draggable={false}
            />
          ) : (
            <div className={styles.currentImage}>
              {currentUrl ? (
                <img src={currentUrl} alt="Current" className={styles.currentImageImg} />
              ) : (
                <span className={styles.placeholder}>◈</span>
              )}
            </div>
          )}
          <div className={styles.overlay} />
        </div>

        <div className={styles.controls}>
          {previewSrc ? (
            <>
              <div className={styles.zoomControl}>
                <label>Zoom</label>
                <input 
                  type="range" 
                  min={minZoom} 
                  max="4" 
                  step="0.001" 
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
                  {isUploading ? 'Uploading...' : 'Confirm'}
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
              {label}
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

'use client';

import ImageUpload from './ImageUpload';
import { useAuth } from '@/context/AuthContext';

interface AvatarUploadProps {
  currentUrl?: string;
  onUploadSuccess: (url: string) => void;
}

/**
 * AvatarUpload - A specialized version of ImageUpload for user profiles.
 * It uses a 1:1 aspect ratio and a circular preview.
 */
export default function AvatarUpload({ currentUrl, onUploadSuccess }: AvatarUploadProps) {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <ImageUpload
      currentUrl={currentUrl}
      onUploadSuccess={onUploadSuccess}
      bucket="avatars"
      uploadPath={`${user.id}/avatar.jpg`}
      aspectRatio={1}
      circular={true}
      outputWidth={400}
      outputHeight={400}
      label="Change Photo"
    />
  );
}

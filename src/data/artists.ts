import { Locale } from '@/i18n';
import artistsData from './artists.json';

export interface Artist {
  id: string;
  name: string;
  photoUrl?: string;
  bio: Record<Locale, string>;
  isCrew: boolean;
  isInvited: boolean;
  isNewTalent?: boolean;
  avatarGradient: string;
  socialLinks: {
    soundcloud?: string;
    mixcloud?: string;
    instagram?: string;
  };
}

export const artists = artistsData as Artist[];
export const crew = artists.filter(a => a.isCrew);
export const invitedGuests = artists.filter(a => a.isInvited);

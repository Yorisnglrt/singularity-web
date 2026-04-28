export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarInitial: string;
  avatarUrl?: string;
  bio?: string;
  favoriteProducer?: string;
  favoriteTrack?: string;
  favoriteVenue?: string;
  favoriteFestival?: string;
  city?: string;
  favoriteSubgenre?: string;
  points: number;
  isAdmin: boolean;
  createdAt: string;
  memberCode?: string;
  tier?: string;
  memberSince?: string;
  qrToken?: string;
  marketingConsent?: boolean;
  marketingConsentAt?: string | null;
  marketingUnsubscribedAt?: string | null;
}

import mixesData from './mixes.json';

export interface Mix {
  id: string;
  title: string;
  artist: string;
  duration: string;
  date: string;
  coverGradient: string;
  audioSrc?: string;
  soundcloudUrl?: string;
  eventId: string;
  label: string;
}

export const mixes = mixesData as Mix[];

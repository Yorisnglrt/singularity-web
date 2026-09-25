/**
 * Rave Points (RP) awarded per ticket for a ticket type.
 *
 * Priority:
 *  1. Manual value set by admin on the ticket type (event_ticket_types.rave_points)
 *  2. Default: Supporter = 200 RP, Early Bird = 150 RP, everything else = 100 RP
 */
export const SUPPORTER_RAVE_POINTS = 200;
export const EARLY_BIRD_RAVE_POINTS = 150;
export const DEFAULT_RAVE_POINTS = 100;

const EARLY_BIRD_RE = /early[\s_-]*bird/i;

export function isEarlyBirdName(name: string | null | undefined): boolean {
  return !!name && EARLY_BIRD_RE.test(name);
}

export function getDefaultRavePoints(name: string | null | undefined, isSupporter = false): number {
  if (isSupporter) return SUPPORTER_RAVE_POINTS;
  return isEarlyBirdName(name) ? EARLY_BIRD_RAVE_POINTS : DEFAULT_RAVE_POINTS;
}

export function getRavePointsPerTicket(tt: {
  name?: string | null;
  isSupporter?: boolean | null;
  is_supporter?: boolean | null;
  ravePoints?: number | null;
  rave_points?: number | null;
} | null | undefined): number {
  if (!tt) return DEFAULT_RAVE_POINTS;
  const manual = tt.ravePoints ?? tt.rave_points;
  if (manual != null && Number.isInteger(Number(manual)) && Number(manual) >= 0) {
    return Number(manual);
  }
  return getDefaultRavePoints(tt.name, !!(tt.isSupporter ?? tt.is_supporter));
}

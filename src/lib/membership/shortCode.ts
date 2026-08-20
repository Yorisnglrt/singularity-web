/**
 * Canonical alphabet for 6-character membership short codes.
 * Exact same alphabet as event ticket short codes (26 uppercase alphanumeric characters).
 * Avoids visually ambiguous characters (0, O, 1, I, B, 8, S, 5, Z, 2).
 */
export const MEMBERSHIP_SHORT_CODE_CHARS = 'ACDEFGHJKLMNPQRTUVWXY34679';
export const MEMBERSHIP_SHORT_CODE_LENGTH = 6;
export const MEMBER_QR_PREFIX = 'M:';

/**
 * Normalizes a scanned QR payload or user-typed string for member_short_code lookup.
 * - Trims leading/trailing whitespace
 * - Removes internal whitespace
 * - Uppercases
 * - Strips optional leading 'M:' prefix
 */
export function normalizeMemberShortCode(input: string): string {
  if (!input) return '';
  let clean = input.trim().replace(/\s+/g, '').toUpperCase();
  if (clean.startsWith(MEMBER_QR_PREFIX)) {
    clean = clean.slice(MEMBER_QR_PREFIX.length);
  }
  return clean;
}

/**
 * Validates whether a string matches the canonical 6-character membership short code format.
 */
export function isValidMemberShortCode(code: string): boolean {
  if (!code || code.length !== MEMBERSHIP_SHORT_CODE_LENGTH) return false;
  const regex = /^[ACDEFGHJKLMNPQRTUVWXY34679]{6}$/;
  return regex.test(code);
}

/**
 * Validates whether a string matches the legacy SG-XXXXXXXX member code format.
 */
export function isValidLegacyMemberCode(code: string): boolean {
  if (!code) return false;
  const regex = /^SG-[A-Z0-9]{8}$/;
  return regex.test(code);
}

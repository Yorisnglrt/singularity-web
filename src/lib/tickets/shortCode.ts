/**
 * Generates short, human-readable ticket codes for manual check-in.
 *
 * Charset: 26 chars — uppercase letters + digits, excluding confusing pairs:
 *   B/8, I/1, O/0, S/5, Z/2
 *
 * 26^6 ≈ 308 million combinations — collision risk is negligible.
 * A UNIQUE database constraint is the final guarantee.
 */

const SHORT_CODE_CHARS = 'ACDEFGHJKLMNPQRTUVWXY34679';
const SHORT_CODE_LENGTH = 6;

/**
 * Generate a single random short code (e.g., "7K4P9X").
 */
export function generateShortCode(): string {
  let result = '';
  for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
    result += SHORT_CODE_CHARS[Math.floor(Math.random() * SHORT_CODE_CHARS.length)];
  }
  return result;
}

/**
 * Normalize a user-typed input for short_code lookup.
 * Strips optional "SG-" prefix, uppercases, trims whitespace.
 */
export function normalizeShortCodeInput(input: string): string {
  return input.trim().toUpperCase().replace(/^SG-/, '');
}

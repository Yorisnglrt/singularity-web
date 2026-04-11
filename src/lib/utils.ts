/**
 * Converts an ISO 3166-1 alpha-2 country code to a flag emoji.
 */
export function getFlagEmoji(countryCode: string | undefined | null): string {
  if (!countryCode) return '';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

/**
 * Returns a URL for the flag image of a given country code using FlagCDN.
 * @param countryCode ISO 3166-1 alpha-2 code
 * @param width Width of the flag image (default 40px)
 */
export function getFlagUrl(countryCode: string | undefined | null, width: number = 40): string {
  if (!countryCode) return '';
  return `https://flagcdn.com/w${width}/${countryCode.toLowerCase()}.png`;
}

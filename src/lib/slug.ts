/**
 * Converts a string into a clean, URL-friendly slug.
 * Removes diacritics, converts to lowercase, handles spaces and special characters.
 */
export function toSlug(value: string): string {
  if (!value) return '';

  return value
    .normalize('NFD') // Separate base characters from their diacritics
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // Remove non-alphanumeric characters (except spaces and hyphens)
    .replace(/[\s_]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading and trailing hyphens
}

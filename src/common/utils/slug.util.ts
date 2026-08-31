/** Converts a display name to a URL-safe slug: lowercase, alphanumeric + hyphens only. */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')   // strip everything except letters, digits, spaces
    .trim()
    .replace(/\s+/g, '-');         // collapse whitespace into single hyphens
}

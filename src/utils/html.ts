/**
 * Text for a place that parses HTML (Leaflet tooltips set innerHTML). Names reach the live map from
 * profiles and venues, and an SPG can edit their own name — so a name is text, never markup.
 */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

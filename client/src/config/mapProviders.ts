// Map basemap provider configuration.
//
// Historically the app rendered Google's undocumented `mt{0-3}.google.com/vt`
// raster endpoints. Those are not a supported public API and using them
// violates Google's Terms of Service, so they are no longer used.
//
// Default provider is OpenFreeMap: free, vector, no API key, production-ready,
// and good enough for a single-campus deployment. Set VITE_OLA_MAPS_API_KEY to
// opt into Ola Maps (India-tuned vector + satellite, key injected on tile
// requests). If Ola is selected without a key we fall back to OpenFreeMap so the
// map always renders.

export type MapProvider = 'openfreemap' | 'ola';

export const OLA_API_KEY = (import.meta.env.VITE_OLA_MAPS_API_KEY as string | undefined)?.trim() || '';
export const MAP_PROVIDER: MapProvider =
  (import.meta.env.VITE_MAP_PROVIDER as string | undefined) === 'ola' && OLA_API_KEY ? 'ola' : 'openfreemap';

export const OPENFREEMAP_STYLES = {
  bright: 'https://tiles.openfreemap.org/styles/bright',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const;

// Verified Ola Maps vector style endpoint (styles are resolved by name).
export const OLA_STYLE_BASE = 'https://api.olamaps.io/tiles/vector/v1/styles';
export const olaStyle = (name: string) => `${OLA_STYLE_BASE}/${name}/style.json`;

// Ola Maps authenticates via an `api_key` query parameter on every tile,
// sprite, glyph and style request. MapLibre funnels all of those through
// `transformRequest`, which is also where the documented `app.olamaps.io` →
// `api.olamaps.io` host swap happens.
export function olaTransformRequest(url: string, resourceType?: string): { url: string } {
  if (!OLA_API_KEY) return { url };
  if (resourceType !== 'Tile' && resourceType !== 'Source' && resourceType !== 'Sprite' && resourceType !== 'Glyphs') {
    return { url };
  }
  const rewritten = url.replace('app.olamaps.io', 'api.olamaps.io');
  const separator = rewritten.includes('?') ? '&' : '?';
  return { url: `${rewritten}${separator}api_key=${OLA_API_KEY}` };
}

/** Human-readable byte size (B/KB/MB/GB). */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Region, language, and TV-standard tokens that dump tools tack onto names. */
const REGION_TOKENS = new Set([
  // regions
  "world", "usa", "us", "europe", "eu", "japan", "jp", "asia", "korea", "kr",
  "china", "cn", "australia", "brazil", "canada", "france", "germany", "spain",
  "italy", "netherlands", "sweden", "russia", "uk", "scandinavia", "taiwan",
  "hong kong", "mexico", "poland", "portugal", "greece", "finland", "denmark",
  "norway", "india", "latin america", "unknown",
  // language codes
  "en", "fr", "de", "es", "it", "ja", "nl", "sv", "pt", "ru", "pl", "ko", "zh",
  "da", "no", "fi", "cs", "hu", "el", "tr", "ar", "he",
  // tv standards
  "ntsc", "pal", "ntsc-u", "ntsc-j", "ntsc-c", "secam",
]);

/** A bracketed group is a region/language tag if every comma-separated token is
 *  a known region, language code, TV standard, or "MultiN". */
function isRegionTag(inner: string): boolean {
  const tokens = inner.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  return tokens.length > 0 && tokens.every((t) => REGION_TOKENS.has(t) || /^multi\d+$/.test(t));
}

/** Library display name: drop region/language tags like "(USA)", "(World)",
 *  "(En,Fr,De)" while keeping disc-type hints like "(Install)" or "(Disc 1)" so
 *  the user can still tell an install disc from a play disc. The stored title is
 *  left untouched — this is presentation only. */
export function displayTitle(raw: string): string {
  return raw
    .replace(/[([]([^()[\]]*)[)\]]/g, (m, inner: string) => (isRegionTag(inner) ? "" : m))
    .replace(/\s{2,}/g, " ")
    .trim();
}

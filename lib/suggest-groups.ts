export type SuggestionAssetLike = {
  id: string;
  filename?: string;
  mediaSubtypes?: string[];
  width?: number;
  height?: number;
  creationTime: number;
};

const GAP_MS = 30 * 3600 * 1000;
const MAX_SPAN_MS = 5 * 864e5; // Maximum 5 days per moment to avoid lumping multi-week spans together
const MIN_GROUP_SIZE = 5;

/** Excludes device screenshots, tiny thumbnails, and screen-grab assets from story suggestions. */
export function isMemoryPhotoAsset(asset: SuggestionAssetLike): boolean {
  if (!asset.creationTime) return false;
  if (Array.isArray(asset.mediaSubtypes) && asset.mediaSubtypes.includes('screenshot')) return false;
  if (typeof asset.filename === 'string' && /^(screenshot|screen[ _-]?shot|screenrecording)/i.test(asset.filename.trim())) return false;
  if (asset.width && asset.height && Math.min(asset.width, asset.height) < 320) return false;
  return true;
}

/** Clusters descending-sorted assets into natural trips/outings separated by >=24h gaps. */
export function clusterSuggestionAssets<T extends SuggestionAssetLike>(assets: T[]): T[][] {
  const realPhotos = assets.filter(isMemoryPhotoAsset).sort((a, b) => b.creationTime - a.creationTime);
  const groups: T[][] = [];
  for (const asset of realPhotos) {
    const current = groups[groups.length - 1];
    const fitsGap = current && (current[current.length - 1].creationTime - asset.creationTime) < GAP_MS;
    const fitsSpan = current && (current[0].creationTime - asset.creationTime) < MAX_SPAN_MS;
    if (fitsGap && fitsSpan) current.push(asset);
    else groups.push([asset]);
  }
  return groups.filter(group => group.length >= MIN_GROUP_SIZE);
}

/** Ranks a photo based on composition, resolution, and position within the cluster. */
export function rankCoverPhoto<T extends SuggestionAssetLike>(asset: T, index: number, total: number): number {
  let score = 100;
  // Representativeness: prefer photos near the middle of the cluster (35%)
  const centerDist = Math.abs(index - (total - 1) / 2) / Math.max(1, (total - 1) / 2);
  score += Math.round((1 - centerDist) * 35);

  if (asset.width && asset.height) {
    // Thumbnail suitability and standard camera aspect ratio (15%)
    const ratio = asset.width / asset.height;
    if (ratio >= 0.7 && ratio <= 1.55) score += 15;
    else if (ratio >= 0.55 && ratio <= 1.8) score += 8;

    // Image quality & resolution (30%)
    const pixels = asset.width * asset.height;
    if (pixels >= 6_000_000) score += 30;
    else if (pixels >= 2_000_000) score += 20;
    else if (pixels >= 700_000) score += 10;
  }
  return score;
}

/** Selects the most representative, high-quality cover photo from a cluster. */
export function selectBestCoverAsset<T extends SuggestionAssetLike>(assets: T[]): T {
  if (!assets.length) throw new Error('Cannot select cover from empty assets');
  let best = assets[0];
  let bestScore = -Infinity;
  for (let i = 0; i < assets.length; i += 1) {
    const score = rankCoverPhoto(assets[i], i, assets.length);
    if (score > bestScore) {
      bestScore = score;
      best = assets[i];
    }
  }
  return best;
}

/** Formats an unambiguous date range string (e.g. "12–15 Aug 2026" or "15 Aug 2026"). */
export function formatDateRangeLabel(startMs: number, endMs: number): string {
  const start = new Date(startMs);
  const end = new Date(endMs);
  const sameDay = start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  if (sameDay) {
    return start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  const sameMonth = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
  if (sameMonth) {
    const monthYear = end.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    return `${start.getDate()}–${end.getDate()} ${monthYear}`;
  }
  const sameYear = start.getFullYear() === end.getFullYear();
  if (sameYear) {
    const a = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const b = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${a} – ${b}`;
  }
  const a = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const b = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${a} – ${b}`;
}

/** Produces readable, distinct titles from resolved places and dates (e.g. "Mumbai & Delhi · 2–7 Aug 2026"). */
export function formatSuggestionTitle(places: string[], startMs: number, endMs: number): string {
  const unique = [...new Set(places.map(p => p.trim()).filter(Boolean))];
  const range = formatDateRangeLabel(startMs, endMs);
  if (!unique.length) {
    const start = new Date(startMs);
    const end = new Date(endMs);
    const sameDay = start.getFullYear() === end.getFullYear() &&
      start.getMonth() === end.getMonth() &&
      start.getDate() === end.getDate();
    return sameDay
      ? start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
      : range;
  }
  if (unique.length === 1) return `${unique[0]} · ${range}`;
  if (unique.length === 2) return `${unique[0]} & ${unique[1]} · ${range}`;
  return `${unique[0]} + ${unique.length - 1} places · ${range}`;
}

function coordinate(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value) && value.length === 3) {
    const parts = value.map(part => {
      if (typeof part === 'number') return part;
      if (typeof part === 'string' && part.includes('/')) {
        const [top, bottom] = part.split('/').map(Number);
        return bottom ? top / bottom : NaN;
      }
      return Number(part);
    });
    return parts.every(Number.isFinite) ? parts[0] + parts[1] / 60 + parts[2] / 3600 : null;
  }
  return null;
}

export function photoMetadata(exif: Record<string, any> = {}) {
  const gps = exif['{GPS}'] ?? exif;
  let lat = coordinate(gps.Latitude ?? gps.GPSLatitude);
  let lng = coordinate(gps.Longitude ?? gps.GPSLongitude);
  const latRef = gps.LatitudeRef ?? gps.GPSLatitudeRef;
  const lngRef = gps.LongitudeRef ?? gps.GPSLongitudeRef;
  if (lat !== null && latRef === 'S') lat = -Math.abs(lat);
  if (lng !== null && lngRef === 'W') lng = -Math.abs(lng);
  if (lat !== null && Math.abs(lat) > 90) lat = null;
  if (lng !== null && Math.abs(lng) > 180) lng = null;
  const date = exif['{Exif}']?.DateTimeOriginal ?? exif.DateTimeOriginal;
  const normalized = typeof date === 'string' ? date.replace(/^(\d{4}):(\d{2}):(\d{2}) /, '$1-$2-$3T') : null;
  const takenAt = normalized && Number.isFinite(Date.parse(normalized)) ? normalized : null;
  return { lat, lng, takenAt };
}

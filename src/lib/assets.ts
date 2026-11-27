export const ASSETS = {
  heroStudio: '/src/assets/images/hero_studio_gold_1795681257458.jpg',
  brandEmblem: '/assets/aistudio/20261126_143846_7ca479ff.jpg',
  artistDashboardBg: '/assets/aistudio/file_000000003a8c81f8823d2bf064194b08_2_b9f5883e.jpg',
  artistAvatar: '/src/assets/images/artist_profile_avatar_1795681258314.jpg',
  releaseFallback: '/src/assets/images/release_cover_sample_1795681257768.jpg',
  adminAvatar: '/src/assets/images/admin_executive_avatar_1795681258300.jpg',
} as const;

export const COMPANY_INFO = {
  brandName: 'ANGAD MUSIC DISTRIBUTOR',
  parentCompany: 'PALAMU ENTERTAINMENT INDUSTRY',
  phone: '9939149838',
  whatsapp: '919939149838',
  email: 'palamuentertainmentindustry@gmail.com',
} as const;

export const SUPPORTED_STORES = [
  'Spotify',
  'Apple Music',
  'YouTube Music',
  'JioSaavn',
  'Gaana',
  'Wynk Music',
  'Amazon Music',
  'Hungama Music',
  'Deezer',
  'Facebook Music',
  'Instagram Music',
  'TikTok Music',
  'Airtel Music',
  'Vodafone Music',
  'Other Available Platforms',
] as const;

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function isValidCalendarYMD(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const check = new Date(Date.UTC(year, month - 1, day));
  return (
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
  );
}

/** Returns today's date (YYYY-MM-DD) strictly in the user's local timezone. */
export function getLocalTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parses YYYY-MM-DD or DD/MM/YYYY string into canonical YYYY-MM-DD if valid. */
export function parseDateInputToIso(raw: string): string | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    return isValidCalendarYMD(y, m, d) ? `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}` : null;
  }

  const dmyMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (dmyMatch) {
    const d = Number(dmyMatch[1]);
    const m = Number(dmyMatch[2]);
    const y = Number(dmyMatch[3]);
    return isValidCalendarYMD(y, m, d) ? `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}` : null;
  }

  return null;
}

/** Formats stored YYYY-MM-DD (or DD/MM/YYYY) string to DD/MM/YYYY without timezone drift. */
export function formatDateDDMMYYYY(raw?: string | null): string {
  if (!raw) return '—';
  const trimmed = raw.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    if (isValidCalendarYMD(y, m, d)) {
      return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
    }
  }
  const dmyMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (dmyMatch) {
    return trimmed;
  }
  return trimmed;
}


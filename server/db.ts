import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const backupsDir = path.resolve(dataDir, 'backups');
if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

export const privateDocsDir = path.resolve(dataDir, 'private_docs');
if (!fs.existsSync(privateDocsDir)) {
  fs.mkdirSync(privateDocsDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'angad.db');
export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    stage_name TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL,
    mobile TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'artist',
    avatar_url TEXT NOT NULL DEFAULT '',
    payout_method TEXT NOT NULL DEFAULT 'UPI',
    payout_details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS admin_credentials (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    claimed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS releases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artist_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    release_type TEXT NOT NULL DEFAULT 'Single',
    primary_artist TEXT NOT NULL,
    featured_artists TEXT NOT NULL DEFAULT '',
    genre TEXT NOT NULL,
    language TEXT NOT NULL,
    release_date TEXT NOT NULL,
    label_name TEXT NOT NULL DEFAULT 'Palamu Entertainment Industry',
    upc TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Pending Review',
    admin_notes TEXT NOT NULL DEFAULT '',
    target_stores_json TEXT NOT NULL DEFAULT '[]',
    delivery_mode TEXT NOT NULL DEFAULT 'Manual QA & Partner Fulfillment',
    cover_url TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (artist_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    release_id INTEGER NOT NULL,
    artist_id INTEGER NOT NULL,
    track_number INTEGER NOT NULL DEFAULT 1,
    title TEXT NOT NULL,
    isrc TEXT NOT NULL DEFAULT '',
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    explicit INTEGER NOT NULL DEFAULT 0,
    composer TEXT NOT NULL DEFAULT '',
    lyricist TEXT NOT NULL DEFAULT '',
    audio_filename TEXT NOT NULL DEFAULT '',
    audio_url TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Pending Review',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE CASCADE,
    FOREIGN KEY (artist_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS smart_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    release_id INTEGER NOT NULL UNIQUE,
    artist_id INTEGER NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    headline TEXT NOT NULL DEFAULT '',
    subtitle TEXT NOT NULL DEFAULT '',
    spotify_url TEXT NOT NULL DEFAULT '',
    apple_music_url TEXT NOT NULL DEFAULT '',
    youtube_music_url TEXT NOT NULL DEFAULT '',
    jiosaavn_url TEXT NOT NULL DEFAULT '',
    gaana_url TEXT NOT NULL DEFAULT '',
    wynk_url TEXT NOT NULL DEFAULT '',
    amazon_music_url TEXT NOT NULL DEFAULT '',
    clicks INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE CASCADE,
    FOREIGN KEY (artist_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS royalty_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artist_id INTEGER NOT NULL,
    release_id INTEGER,
    store_name TEXT NOT NULL,
    period TEXT NOT NULL,
    streams INTEGER NOT NULL DEFAULT 0,
    amount_inr REAL NOT NULL DEFAULT 0,
    reference_note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Verified',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (artist_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS payout_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artist_id INTEGER NOT NULL,
    amount_inr REAL NOT NULL,
    payment_method TEXT NOT NULL,
    account_summary TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Requested',
    admin_reference TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (artist_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS support_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Distribution',
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Open',
    admin_reply TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS release_platform_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    release_id INTEGER NOT NULL,
    platform_name TEXT NOT NULL,
    delivery_status TEXT NOT NULL DEFAULT 'Not Submitted',
    partner_name TEXT NOT NULL DEFAULT '',
    partner_confirmation_id TEXT NOT NULL DEFAULT '',
    live_url TEXT NOT NULL DEFAULT '',
    verified_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(release_id, platform_name),
    FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'release',
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS otp_challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identifier TEXT NOT NULL,
    purpose TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS artist_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_user_id INTEGER NOT NULL,
    artist_name TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'India',
    genre TEXT NOT NULL DEFAULT 'Bhojpuri',
    bio TEXT NOT NULL DEFAULT '',
    instagram_url TEXT NOT NULL DEFAULT '',
    spotify_url TEXT NOT NULL DEFAULT '',
    youtube_url TEXT NOT NULL DEFAULT '',
    verification_status TEXT NOT NULL DEFAULT 'Unverified',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS distribution_platforms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL DEFAULT 'Global DSP',
    is_enabled INTEGER NOT NULL DEFAULT 1,
    partner_notes TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS release_change_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    release_id INTEGER NOT NULL,
    artist_id INTEGER NOT NULL,
    request_type TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Pending',
    admin_notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE CASCADE,
    FOREIGN KEY (artist_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS service_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artist_id INTEGER NOT NULL,
    release_id INTEGER,
    service_type TEXT NOT NULL,
    budget_note TEXT NOT NULL DEFAULT '',
    target_links TEXT NOT NULL DEFAULT '',
    brief TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Submitted',
    admin_notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (artist_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS support_chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_key TEXT NOT NULL,
    user_id INTEGER,
    sender_role TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS login_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    role TEXT NOT NULL DEFAULT 'artist',
    identifier TEXT NOT NULL,
    login_method TEXT NOT NULL,
    ip_address TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Success',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS system_backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    trigger_type TEXT NOT NULL DEFAULT 'Automatic',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS artist_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artist_id INTEGER NOT NULL,
    label_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(artist_id, label_name),
    FOREIGN KEY (artist_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS artist_kyc (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    legal_name TEXT NOT NULL DEFAULT '',
    mobile TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    full_address TEXT NOT NULL DEFAULT '',
    aadhaar_masked TEXT NOT NULL DEFAULT '',
    aadhaar_encrypted TEXT NOT NULL DEFAULT '',
    pan_masked TEXT NOT NULL DEFAULT '',
    pan_encrypted TEXT NOT NULL DEFAULT '',
    aadhaar_front_file TEXT NOT NULL DEFAULT '',
    aadhaar_back_file TEXT NOT NULL DEFAULT '',
    pan_card_file TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    consent_accepted INTEGER NOT NULL DEFAULT 0,
    consent_timestamp TEXT NOT NULL DEFAULT '',
    kyc_status TEXT NOT NULL DEFAULT 'Pending Verification',
    reviewer_notes TEXT NOT NULL DEFAULT '',
    reviewed_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS song_agreements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agreement_code TEXT NOT NULL UNIQUE,
    release_id INTEGER NOT NULL,
    track_id INTEGER NOT NULL UNIQUE,
    artist_id INTEGER NOT NULL,
    artist_name TEXT NOT NULL DEFAULT '',
    singer_name TEXT NOT NULL DEFAULT '',
    song_title TEXT NOT NULL DEFAULT '',
    music_director TEXT NOT NULL DEFAULT '',
    lyricist TEXT NOT NULL DEFAULT '',
    composer TEXT NOT NULL DEFAULT '',
    label_name TEXT NOT NULL DEFAULT 'Palamu Entertainment Industry',
    release_details_json TEXT NOT NULL DEFAULT '{}',
    agreement_date TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Pending',
    sent_via TEXT NOT NULL DEFAULT '',
    sent_at TEXT NOT NULL DEFAULT '',
    signed_pdf_file TEXT NOT NULL DEFAULT '',
    signed_pdf_original_name TEXT NOT NULL DEFAULT '',
    signed_uploaded_at TEXT NOT NULL DEFAULT '',
    approved_at TEXT NOT NULL DEFAULT '',
    admin_notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
    FOREIGN KEY (artist_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

function addColumnIfMissing(table: string, colName: string, definition: string): void {
  const existingCols = (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
    (c) => c.name
  );
  if (!existingCols.includes(colName)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${colName} ${definition}`);
  }
}

// Safely add new columns to existing tables while preserving all data
const extraUserCols: Array<[string, string]> = [
  ['verification_status', "TEXT NOT NULL DEFAULT 'Unverified'"],
  ['verification_doc_url', "TEXT NOT NULL DEFAULT ''"],
  ['verification_notes', "TEXT NOT NULL DEFAULT ''"],
  ['otp_verified', 'INTEGER NOT NULL DEFAULT 0'],
  ['account_protected', 'INTEGER NOT NULL DEFAULT 1'],
  ['bio', "TEXT NOT NULL DEFAULT ''"],
];
for (const [col, def] of extraUserCols) {
  addColumnIfMissing('users', col, def);
}

const extraSmartLinkCols = [
  'hungama_music_url',
  'facebook_music_url',
  'instagram_music_url',
  'tiktok_music_url',
  'airtel_music_url',
  'vodafone_music_url',
  'deezer_url',
  'other_platforms_url',
];
for (const col of extraSmartLinkCols) {
  addColumnIfMissing('smart_links', col, "TEXT NOT NULL DEFAULT ''");
}

const extraReleaseCols: Array<[string, string]> = [
  ['p_line', "TEXT NOT NULL DEFAULT ''"],
  ['c_line', "TEXT NOT NULL DEFAULT ''"],
  ['copyright_owner', "TEXT NOT NULL DEFAULT ''"],
  ['copyright_year', "TEXT NOT NULL DEFAULT ''"],
  ['catalogue_number', "TEXT NOT NULL DEFAULT ''"],
  ['music_director', "TEXT NOT NULL DEFAULT ''"],
  ['producer', "TEXT NOT NULL DEFAULT ''"],
  ['subgenre', "TEXT NOT NULL DEFAULT ''"],
  ['original_release_date', "TEXT NOT NULL DEFAULT ''"],
  ['processing_tier', "TEXT NOT NULL DEFAULT 'Standard'"],
  ['release_schedule_mode', "TEXT NOT NULL DEFAULT 'Scheduled'"],
  ['release_version', "TEXT NOT NULL DEFAULT ''"],
  ['various_artists', 'INTEGER NOT NULL DEFAULT 0'],
  ['production_year', "TEXT NOT NULL DEFAULT ''"],
];
for (const [col, def] of extraReleaseCols) {
  addColumnIfMissing('releases', col, def);
}

const extraTrackCols: Array<[string, string]> = [
  ['disc_number', 'INTEGER NOT NULL DEFAULT 1'],
  ['song_version', "TEXT NOT NULL DEFAULT 'Original'"],
  ['vocal_language', "TEXT NOT NULL DEFAULT ''"],
  ['is_instrumental', 'INTEGER NOT NULL DEFAULT 0'],
  ['lyrics_text', "TEXT NOT NULL DEFAULT ''"],
  ['lyrics_filename', "TEXT NOT NULL DEFAULT ''"],
  ['lyrics_url', "TEXT NOT NULL DEFAULT ''"],
  ['artist_roles_json', "TEXT NOT NULL DEFAULT '[]'"],
  ['audio_mime', "TEXT NOT NULL DEFAULT ''"],
  ['audio_size_bytes', 'INTEGER NOT NULL DEFAULT 0'],
  ['audio_sample_rate', 'INTEGER NOT NULL DEFAULT 0'],
  ['audio_bit_depth', 'INTEGER NOT NULL DEFAULT 0'],
  ['audio_channels', 'INTEGER NOT NULL DEFAULT 0'],
  ['audio_quality_status', "TEXT NOT NULL DEFAULT 'Pending Inspection'"],
  ['audio_quality_notes', "TEXT NOT NULL DEFAULT ''"],
  ['audio_sha256', "TEXT NOT NULL DEFAULT ''"],
  ['primary_track_type', "TEXT NOT NULL DEFAULT 'Original'"],
  ['remixer', "TEXT NOT NULL DEFAULT ''"],
  ['author', "TEXT NOT NULL DEFAULT ''"],
  ['music_director', "TEXT NOT NULL DEFAULT ''"],
  ['producer', "TEXT NOT NULL DEFAULT ''"],
  ['publisher', "TEXT NOT NULL DEFAULT ''"],
  ['caller_tune_start_time', "TEXT NOT NULL DEFAULT '00:00'"],
  ['parental_advisory', "TEXT NOT NULL DEFAULT 'Non-Explicit'"],
  ['youtube_content_id', 'INTEGER NOT NULL DEFAULT 0'],
];
for (const [col, def] of extraTrackCols) {
  addColumnIfMissing('tracks', col, def);
}

addColumnIfMissing('royalty_entries', 'entry_date', "TEXT NOT NULL DEFAULT ''");

export const DISTRIBUTION_STORES = [
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

const PLATFORM_SEED_CATEGORIES: Record<string, string> = {
  Spotify: 'Global DSP',
  'Apple Music': 'Global DSP',
  'YouTube Music': 'Global DSP',
  JioSaavn: 'Indian DSP',
  Gaana: 'Indian DSP',
  'Wynk Music': 'Indian DSP',
  'Amazon Music': 'Global DSP',
  'Hungama Music': 'Indian DSP',
  Deezer: 'Global DSP',
  'Facebook Music': 'Social & Short Video',
  'Instagram Music': 'Social & Short Video',
  'TikTok Music': 'Social & Short Video',
  'Airtel Music': 'Telecom Caller Tune',
  'Vodafone Music': 'Telecom Caller Tune',
  'Other Available Platforms': 'Partner Network',
};

const seedPlatformStmt = db.prepare(
  `INSERT OR IGNORE INTO distribution_platforms (name, category, is_enabled, partner_notes)
   VALUES (?, ?, 1, '')`
);
for (const store of DISTRIBUTION_STORES) {
  seedPlatformStmt.run(store, PLATFORM_SEED_CATEGORIES[store] || 'Partner Network');
}

const DEFAULT_SITE_SETTINGS: Record<string, string> = {
  brand_tagline: 'Independent Music Distribution Built for Serious Catalogs.',
  announcement_banner: '',
  latest_update_text:
    'Fast Track Priority QC (4–5 working days estimate*) and Verified Artist Profile Verification are now live inside your studio workspace.',
  whatsapp_number: '919939149838',
  support_phone: '9939149838',
  support_email: 'palamuentertainmentindustry@gmail.com',
};

const seedSettingStmt = db.prepare(
  `INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)`
);
for (const [k, v] of Object.entries(DEFAULT_SITE_SETTINGS)) {
  seedSettingStmt.run(k, v);
}

export function getSiteSettings(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM site_settings').all() as Array<{ key: string; value: string }>;
  const result: Record<string, string> = { ...DEFAULT_SITE_SETTINGS };
  for (const r of rows) {
    result[r.key] = r.value;
  }
  return result;
}

export function createNotification(
  userId: number,
  title: string,
  message: string,
  category: 'release' | 'delivery' | 'royalty' | 'payout' | 'support' | 'security' | 'service' = 'release'
): void {
  if (!Number.isFinite(userId) || userId <= 0) return;
  db.prepare(
    `INSERT INTO notifications (user_id, title, message, category)
     VALUES (?, ?, ?, ?)`
  ).run(userId, title.slice(0, 140), message.slice(0, 500), category);
}

export function recordLoginEvent(params: {
  userId: number | null;
  role: 'artist' | 'admin';
  identifier: string;
  loginMethod: string;
  ipAddress: string;
  userAgent: string;
  status: 'Success' | 'Failed';
}): void {
  try {
    db.prepare(
      `INSERT INTO login_history (user_id, role, identifier, login_method, ip_address, user_agent, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      params.userId,
      params.role,
      params.identifier.slice(0, 140),
      params.loginMethod.slice(0, 60),
      params.ipAddress.slice(0, 80),
      params.userAgent.slice(0, 240),
      params.status
    );
  } catch {
    // Non-fatal audit log write
  }
}

export function createDatabaseBackup(triggerType: 'Automatic' | 'Manual' = 'Automatic'): {
  id: number;
  filename: string;
  size_bytes: number;
  trigger_type: string;
  created_at: string;
} {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `angad-db-backup-${stamp}.db`;
  const destPath = path.resolve(backupsDir, filename);
  if (!destPath.startsWith(backupsDir + path.sep)) {
    throw new Error('Invalid backup path.');
  }
  db.exec('PRAGMA wal_checkpoint(PASSIVE);');
  fs.copyFileSync(dbPath, destPath);
  const stats = fs.statSync(destPath);
  const res = db
    .prepare(
      `INSERT INTO system_backups (filename, size_bytes, trigger_type)
       VALUES (?, ?, ?)`
    )
    .run(filename, stats.size, triggerType);

  // Keep latest 15 backup files to avoid unbounded disk usage
  const oldRows = db
    .prepare('SELECT id, filename FROM system_backups ORDER BY id DESC LIMIT -1 OFFSET 15')
    .all() as Array<{ id: number; filename: string }>;
  for (const old of oldRows) {
    const oldFile = path.resolve(backupsDir, path.basename(old.filename));
    if (oldFile.startsWith(backupsDir + path.sep) && fs.existsSync(oldFile)) {
      fs.unlinkSync(oldFile);
    }
    db.prepare('DELETE FROM system_backups WHERE id = ?').run(old.id);
  }

  return db
    .prepare('SELECT * FROM system_backups WHERE id = ?')
    .get(Number(res.lastInsertRowid)) as {
    id: number;
    filename: string;
    size_bytes: number;
    trigger_type: string;
    created_at: string;
  };
}

// Run an automatic backup on startup if none occurred in the last 24 hours
try {
  const latestBackup = db
    .prepare('SELECT created_at FROM system_backups ORDER BY id DESC LIMIT 1')
    .get() as { created_at: string } | undefined;
  const shouldBackup =
    !latestBackup || Date.now() - new Date(latestBackup.created_at + 'Z').getTime() > 24 * 60 * 60 * 1000;
  if (shouldBackup) {
    createDatabaseBackup('Automatic');
  }
} catch {
  // Ignore startup backup errors
}

export function getActivePlatformNames(): string[] {
  const rows = db
    .prepare('SELECT name FROM distribution_platforms WHERE is_enabled = 1 ORDER BY id ASC')
    .all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

export function getAllPlatformNames(): string[] {
  const rows = db
    .prepare('SELECT name FROM distribution_platforms ORDER BY id ASC')
    .all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

export type PlatformDeliveryStatus =
  | 'Not Submitted'
  | 'Queued for Partner'
  | 'In Review'
  | 'LIVE'
  | 'Rejected'
  | 'Takedown';

export interface PlatformDeliveryRow {
  id: number;
  release_id: number;
  platform_name: string;
  delivery_status: PlatformDeliveryStatus;
  partner_name: string;
  partner_confirmation_id: string;
  live_url: string;
  verified_at: string;
  updated_at: string;
}

export function seedPlatformDeliveries(releaseId: number, targetStores: string[]): void {
  const normalizedSelected = new Set(
    targetStores.map((s) => (s === 'Instagram & Meta Audio' ? 'Instagram Music' : s))
  );
  const allPlatforms = Array.from(new Set([...DISTRIBUTION_STORES, ...getAllPlatformNames(), ...targetStores]));
  const insert = db.prepare(
    `INSERT OR IGNORE INTO release_platform_deliveries (release_id, platform_name, delivery_status)
     VALUES (?, ?, ?)`
  );
  for (const store of allPlatforms) {
    const initialStatus: PlatformDeliveryStatus = normalizedSelected.has(store)
      ? 'Queued for Partner'
      : 'Not Submitted';
    insert.run(releaseId, store, initialStatus);
  }
}

export function getReleasePlatformDeliveries(releaseId: number, targetStores: string[]): PlatformDeliveryRow[] {
  seedPlatformDeliveries(releaseId, targetStores);
  const rows = db
    .prepare('SELECT * FROM release_platform_deliveries WHERE release_id = ?')
    .all(releaseId) as unknown as PlatformDeliveryRow[];

  const orderedPlatforms = Array.from(new Set([...DISTRIBUTION_STORES, ...getAllPlatformNames()]));
  const byPlatform = new Map(rows.map((r) => [r.platform_name, r]));
  const ordered = orderedPlatforms.map((store) => byPlatform.get(store)).filter((r): r is PlatformDeliveryRow => Boolean(r));
  for (const r of rows) {
    if (!orderedPlatforms.includes(r.platform_name)) {
      ordered.push(r);
    }
  }
  return ordered;
}

export interface ArtistBalanceSummary {
  verifiedEarnings: number;
  totalPaidOut: number;
  pendingPayouts: number;
  availableBalance: number;
}

export function getArtistBalance(artistId: number): ArtistBalanceSummary {
  const earningsRow = db
    .prepare('SELECT COALESCE(SUM(amount_inr), 0) AS total FROM royalty_entries WHERE artist_id = ?')
    .get(artistId) as { total: number };

  const paidRow = db
    .prepare("SELECT COALESCE(SUM(amount_inr), 0) AS total FROM payout_requests WHERE artist_id = ? AND status = 'Paid'")
    .get(artistId) as { total: number };

  const pendingRow = db
    .prepare(
      "SELECT COALESCE(SUM(amount_inr), 0) AS total FROM payout_requests WHERE artist_id = ? AND status IN ('Requested', 'Processing')"
    )
    .get(artistId) as { total: number };

  const verifiedEarnings = Number(earningsRow?.total ?? 0);
  const totalPaidOut = Number(paidRow?.total ?? 0);
  const pendingPayouts = Number(pendingRow?.total ?? 0);
  const availableBalance = Math.max(0, Number((verifiedEarnings - totalPaidOut - pendingPayouts).toFixed(2)));

  return {
    verifiedEarnings: Number(verifiedEarnings.toFixed(2)),
    totalPaidOut: Number(totalPaidOut.toFixed(2)),
    pendingPayouts: Number(pendingPayouts.toFixed(2)),
    availableBalance,
  };
}

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import {
  extractBearerUser,
  getAdminConfigState,
  hashPassword,
  requireAdmin,
  requireArtist,
  requireAuth,
  signSessionToken,
  timingSafeStringMatch,
  verifyPassword,
  type AuthenticatedRequest,
} from './server/auth.ts';
import { inspectAudioFile, validateImageMagicBytes } from './server/audioInspector.ts';
import {
  DISTRIBUTION_STORES,
  createNotification,
  db,
  getAllPlatformNames,
  getArtistBalance,
  getReleasePlatformDeliveries,
  recordLoginEvent,
  seedPlatformDeliveries,
} from './server/db.ts';
import { registerExtendedRoutes } from './server/routesExtension.ts';
import { ensureSongAgreementForTrack, registerKycAndAgreementRoutes } from './server/kycAndAgreements.ts';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));

const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    const safeExt = ext || '.bin';
    cb(null, `${crypto.randomUUID()}${safeExt}`);
  },
});

const artworkUpload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, or WEBP artwork images are allowed.'));
    }
  },
});

const audioUpload = multer({
  storage,
  limits: { fileSize: 250 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.wav' && (allowed.includes(file.mimetype) || file.mimetype === 'application/octet-stream' || !file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Audio Format must be WAV Only (.wav). Stereo 16–24 bit, minimum 44.1 kHz, 60s to 6 minutes.'));
    }
  },
});

function hashFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

const lyricsUpload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['text/plain', 'application/pdf', 'application/octet-stream', 'text/lrc'];
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExt = ['.txt', '.lrc', '.srt', '.pdf'];
    if (allowed.includes(file.mimetype) || allowedExt.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only TXT, LRC, SRT, or PDF lyrics files are allowed.'));
    }
  },
});

function sanitizeHttpUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return '';
  } catch {
    return '';
  }
}

function normalizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function safeParseArray(raw: unknown): unknown[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Serve uploaded media safely with path confinement
app.get('/api/uploads/:filename', (req: Request, res: Response) => {
  const filename = path.basename(String(req.params.filename || ''));
  if (!filename || !/^[a-zA-Z0-9._-]+$/.test(filename)) {
    res.status(400).json({ error: 'Invalid file name.' });
    return;
  }
  const resolved = path.resolve(uploadsDir, filename);
  if (!resolved.startsWith(uploadsDir + path.sep)) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }
  if (!fs.existsSync(resolved)) {
    res.status(404).json({ error: 'File not found.' });
    return;
  }
  res.sendFile(resolved);
});

// Upload routes
app.post('/api/upload/artwork', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  artworkUpload.single('file')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Artwork upload failed.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No artwork file uploaded.' });
      return;
    }
    const imgCheck = validateImageMagicBytes(req.file.path);
    if (!imgCheck.valid) {
      fs.unlink(req.file.path, () => {});
      res.status(400).json({ error: 'Uploaded artwork is not a valid JPG, PNG, or WEBP image.' });
      return;
    }
    res.json({
      filename: req.file.filename,
      originalName: req.file.originalname,
      url: `/api/uploads/${req.file.filename}`,
      size: req.file.size,
      format: imgCheck.format,
    });
  });
});

app.post('/api/upload/audio', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  audioUpload.single('file')(req, res, async (err) => {
    if (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'WAV audio upload failed.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No WAV audio file uploaded.' });
      return;
    }
    const inspection = inspectAudioFile(
      req.file.path,
      req.file.originalname,
      req.file.mimetype,
      req.file.size
    );
    if (!inspection.valid) {
      fs.unlink(req.file.path, () => {});
      res.status(400).json({ error: inspection.error || 'Invalid WAV audio master.' });
      return;
    }
    try {
      const sha256 = await hashFileSha256(req.file.path);
      const duplicateMatches = db
        .prepare(
          `SELECT t.title AS trackTitle, r.title AS releaseTitle, r.id AS releaseId
           FROM tracks t
           JOIN releases r ON r.id = t.release_id
           WHERE t.audio_sha256 = ? AND t.audio_sha256 != '' AND r.status != 'Rejected'
           LIMIT 5`
        )
        .all(sha256) as Array<{ trackTitle: string; releaseTitle: string; releaseId: number }>;

      res.json({
        filename: req.file.filename,
        originalName: req.file.originalname,
        url: `/api/uploads/${req.file.filename}`,
        size: req.file.size,
        mimeType: inspection.mimeType,
        formatLabel: inspection.formatLabel,
        sampleRate: inspection.sampleRate,
        bitDepth: inspection.bitDepth,
        channels: inspection.channels,
        durationSeconds: inspection.durationSeconds,
        qualityStatus: inspection.qualityStatus,
        qualityNotes: inspection.qualityNotes,
        audioSha256: sha256,
        duplicateDetected: duplicateMatches.length > 0,
        duplicateMatches,
      });
    } catch {
      fs.unlink(req.file.path, () => {});
      res.status(500).json({ error: 'Failed to process uploaded WAV master.' });
    }
  });
});

app.post('/api/upload/lyrics', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  lyricsUpload.single('file')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Lyrics file upload failed.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No lyrics file uploaded.' });
      return;
    }
    res.json({
      filename: req.file.filename,
      originalName: req.file.originalname,
      url: `/api/uploads/${req.file.filename}`,
      size: req.file.size,
    });
  });
});

// ========================
// AUTHENTICATION ENDPOINTS
// ========================

app.post('/api/auth/artist/register', (req: Request, res: Response) => {
  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
  const country = typeof req.body?.country === 'string' ? req.body.country.trim() : '';
  const mobile = typeof req.body?.mobile === 'string' ? req.body.mobile.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (fullName.length < 2 || fullName.length > 100) {
    res.status(400).json({ error: 'Full Name must be between 2 and 100 characters.' });
    return;
  }
  if (country.length < 2 || country.length > 80) {
    res.status(400).json({ error: 'Please provide a valid Country.' });
    return;
  }
  if (mobile.length < 7 || mobile.length > 20) {
    res.status(400).json({ error: 'Please provide a valid Mobile number.' });
    return;
  }
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Please provide a valid Email address.' });
    return;
  }
  if (password.length < 8 || password.length > 128) {
    res.status(400).json({ error: 'Password must be at least 8 characters.' });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    res.status(409).json({ error: 'An artist account with this email already exists.' });
    return;
  }

  const passwordHash = hashPassword(password);
  const result = db
    .prepare(
      `INSERT INTO users (full_name, stage_name, country, mobile, email, password_hash, role)
       VALUES (?, ?, ?, ?, ?, ?, 'artist')`
    )
    .run(fullName, fullName, country, mobile, email, passwordHash);

  const userId = Number(result.lastInsertRowid);
  const token = signSessionToken({
    id: userId,
    role: 'artist',
    email,
    fullName,
  });

  const user = db
    .prepare(
      'SELECT id, full_name, stage_name, country, mobile, email, role, avatar_url, payout_method, payout_details, created_at FROM users WHERE id = ?'
    )
    .get(userId);

  res.status(201).json({ token, user });
});

app.post('/api/auth/artist/login', (req: Request, res: Response) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!isValidEmail(email) || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const row = db.prepare('SELECT * FROM users WHERE email = ? AND role = ?').get(email, 'artist') as
    | {
        id: number;
        full_name: string;
        stage_name: string;
        country: string;
        mobile: string;
        email: string;
        password_hash: string;
        role: 'artist';
        avatar_url: string;
        payout_method: string;
        payout_details: string;
        created_at: string;
      }
    | undefined;

  if (!row || !verifyPassword(password, row.password_hash)) {
    recordLoginEvent({
      userId: row ? row.id : null,
      role: 'artist',
      identifier: email,
      loginMethod: 'Email Password',
      ipAddress: String(req.headers['x-forwarded-for'] || req.ip || ''),
      userAgent: String(req.headers['user-agent'] || ''),
      status: 'Failed',
    });
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  recordLoginEvent({
    userId: row.id,
    role: 'artist',
    identifier: row.email,
    loginMethod: 'Email Password',
    ipAddress: String(req.headers['x-forwarded-for'] || req.ip || ''),
    userAgent: String(req.headers['user-agent'] || ''),
    status: 'Success',
  });

  const token = signSessionToken({
    id: row.id,
    role: 'artist',
    email: row.email,
    fullName: row.full_name,
  });

  const { password_hash: _ignored, ...safeUser } = row;
  res.json({ token, user: safeUser });
});

app.get('/api/auth/admin/status', (_req: Request, res: Response) => {
  const state = getAdminConfigState();
  res.json({
    configured: state.configured,
    envManaged: state.envManaged,
  });
});

app.post('/api/auth/admin/claim', (req: Request, res: Response) => {
  const state = getAdminConfigState();
  if (state.configured) {
    res.status(403).json({ error: 'Administrator credentials are already configured.' });
    return;
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Please provide a valid administrator email.' });
    return;
  }
  if (password.length < 8 || password.length > 128) {
    res.status(400).json({ error: 'Administrator password must be at least 8 characters.' });
    return;
  }

  const passwordHash = hashPassword(password);
  try {
    db.prepare('INSERT INTO admin_credentials (id, email, password_hash) VALUES (1, ?, ?)').run(email, passwordHash);
  } catch {
    res.status(403).json({ error: 'Administrator credentials were already claimed.' });
    return;
  }

  const token = signSessionToken({
    id: 0,
    role: 'admin',
    email,
    fullName: 'Palamu Label Administrator',
  });

  res.status(201).json({
    token,
    user: {
      id: 0,
      full_name: 'Palamu Label Administrator',
      email,
      role: 'admin',
    },
  });
});

app.post('/api/auth/admin/login', (req: Request, res: Response) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!isValidEmail(email) || !password) {
    res.status(400).json({ error: 'Administrator email and password are required.' });
    return;
  }

  const envPass = process.env.ADMIN_PASSCODE?.trim() ?? '';
  const envEmail = (process.env.ADMIN_EMAIL?.trim() || 'palamuentertainmentindustry@gmail.com').toLowerCase();

  if (envPass.length > 0) {
    if (!timingSafeStringMatch(email, envEmail) || !timingSafeStringMatch(password, envPass)) {
      recordLoginEvent({
        userId: 0,
        role: 'admin',
        identifier: email,
        loginMethod: 'Admin Passcode',
        ipAddress: String(req.headers['x-forwarded-for'] || req.ip || ''),
        userAgent: String(req.headers['user-agent'] || ''),
        status: 'Failed',
      });
      res.status(401).json({ error: 'Invalid administrator credentials.' });
      return;
    }
    recordLoginEvent({
      userId: 0,
      role: 'admin',
      identifier: email,
      loginMethod: 'Admin Passcode',
      ipAddress: String(req.headers['x-forwarded-for'] || req.ip || ''),
      userAgent: String(req.headers['user-agent'] || ''),
      status: 'Success',
    });
    const token = signSessionToken({
      id: 0,
      role: 'admin',
      email,
      fullName: 'Palamu Label Administrator',
    });
    res.json({
      token,
      user: {
        id: 0,
        full_name: 'Palamu Label Administrator',
        email,
        role: 'admin',
      },
    });
    return;
  }

  const adminRow = db.prepare('SELECT * FROM admin_credentials WHERE id = 1').get() as
    | { id: number; email: string; password_hash: string }
    | undefined;

  if (!adminRow) {
    res.status(403).json({ error: 'Administrator account not claimed yet. Complete first-run setup.' });
    return;
  }

  if (!timingSafeStringMatch(email, adminRow.email) || !verifyPassword(password, adminRow.password_hash)) {
    recordLoginEvent({
      userId: 0,
      role: 'admin',
      identifier: email,
      loginMethod: 'Admin Credentials',
      ipAddress: String(req.headers['x-forwarded-for'] || req.ip || ''),
      userAgent: String(req.headers['user-agent'] || ''),
      status: 'Failed',
    });
    res.status(401).json({ error: 'Invalid administrator credentials.' });
    return;
  }

  recordLoginEvent({
    userId: 0,
    role: 'admin',
    identifier: adminRow.email,
    loginMethod: 'Admin Credentials',
    ipAddress: String(req.headers['x-forwarded-for'] || req.ip || ''),
    userAgent: String(req.headers['user-agent'] || ''),
    status: 'Success',
  });

  const token = signSessionToken({
    id: 0,
    role: 'admin',
    email: adminRow.email,
    fullName: 'Palamu Label Administrator',
  });

  res.json({
    token,
    user: {
      id: 0,
      full_name: 'Palamu Label Administrator',
      email: adminRow.email,
      role: 'admin',
    },
  });
});

app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (req.user!.role === 'admin') {
    res.json({
      user: {
        id: 0,
        full_name: 'Palamu Label Administrator',
        email: req.user!.email,
        role: 'admin',
      },
    });
    return;
  }

  const user = db
    .prepare(
      `SELECT id, full_name, stage_name, country, mobile, email, role, avatar_url, payout_method, payout_details,
              verification_status, verification_doc_url, verification_notes, otp_verified, account_protected, bio, created_at
       FROM users WHERE id = ?`
    )
    .get(req.user!.id);

  if (!user) {
    res.status(404).json({ error: 'User profile not found.' });
    return;
  }
  res.json({ user });
});

app.patch('/api/artist/profile', requireArtist, (req: AuthenticatedRequest, res: Response) => {
  const stageName = typeof req.body?.stageName === 'string' ? req.body.stageName.trim().slice(0, 100) : undefined;
  const mobile = typeof req.body?.mobile === 'string' ? req.body.mobile.trim().slice(0, 20) : undefined;
  const country = typeof req.body?.country === 'string' ? req.body.country.trim().slice(0, 80) : undefined;
  const payoutMethod = typeof req.body?.payoutMethod === 'string' ? req.body.payoutMethod.trim().slice(0, 40) : undefined;
  const payoutDetails = typeof req.body?.payoutDetails === 'string' ? req.body.payoutDetails.trim().slice(0, 200) : undefined;
  const avatarUrl = typeof req.body?.avatarUrl === 'string' ? req.body.avatarUrl.trim().slice(0, 300) : undefined;

  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as Record<string, string>;
  if (!current) {
    res.status(404).json({ error: 'Artist not found.' });
    return;
  }

  const safeAvatar =
    avatarUrl && (avatarUrl.startsWith('/api/uploads/') || avatarUrl.startsWith('/src/assets/'))
      ? avatarUrl
      : current.avatar_url;

  db.prepare(
    `UPDATE users
     SET stage_name = ?, mobile = ?, country = ?, payout_method = ?, payout_details = ?, avatar_url = ?
     WHERE id = ?`
  ).run(
    stageName ?? current.stage_name,
    mobile ?? current.mobile,
    country ?? current.country,
    payoutMethod ?? current.payout_method,
    payoutDetails ?? current.payout_details,
    safeAvatar,
    req.user!.id
  );

  const updated = db
    .prepare(
      `SELECT id, full_name, stage_name, country, mobile, email, role, avatar_url, payout_method, payout_details,
              verification_status, verification_doc_url, verification_notes, otp_verified, account_protected, bio, created_at
       FROM users WHERE id = ?`
    )
    .get(req.user!.id);

  res.json({ user: updated });
});

// ========================
// ARTIST DASHBOARD & CATALOG
// ========================

app.get('/api/artist/overview', requireArtist, (req: AuthenticatedRequest, res: Response) => {
  const artistId = req.user!.id;

  const songCounts = db
    .prepare(
      `SELECT
         COUNT(*) AS totalSongs,
         SUM(CASE WHEN status = 'Live' THEN 1 ELSE 0 END) AS liveSongs,
         SUM(CASE WHEN status = 'Pending Review' THEN 1 ELSE 0 END) AS pendingSongs,
         SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END) AS rejectedSongs
       FROM tracks
       WHERE artist_id = ?`
    )
    .get(artistId) as {
    totalSongs: number;
    liveSongs: number | null;
    pendingSongs: number | null;
    rejectedSongs: number | null;
  };

  const releaseCounts = db
    .prepare(
      `SELECT
         COUNT(*) AS totalReleases,
         SUM(CASE WHEN status = 'Live' THEN 1 ELSE 0 END) AS liveReleases,
         SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END) AS approvedReleases,
         SUM(CASE WHEN status = 'Pending Review' THEN 1 ELSE 0 END) AS pendingReleases,
         SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END) AS rejectedReleases
       FROM releases
       WHERE artist_id = ?`
    )
    .get(artistId) as {
    totalReleases: number;
    liveReleases: number | null;
    approvedReleases: number | null;
    pendingReleases: number | null;
    rejectedReleases: number | null;
  };

  const streamsRow = db
    .prepare('SELECT COALESCE(SUM(streams), 0) AS total FROM royalty_entries WHERE artist_id = ?')
    .get(artistId) as { total: number };

  const storeDeliveryStats = db
    .prepare(
      `SELECT
         COUNT(*) AS totalStoreDeliveries,
         SUM(CASE WHEN rpd.delivery_status = 'LIVE' THEN 1 ELSE 0 END) AS liveStoreDeliveries
       FROM release_platform_deliveries rpd
       JOIN releases r ON r.id = rpd.release_id
       WHERE r.artist_id = ?`
    )
    .get(artistId) as { totalStoreDeliveries: number | null; liveStoreDeliveries: number | null };

  const unreadNotifRow = db
    .prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0')
    .get(artistId) as { count: number };

  const balance = getArtistBalance(artistId);

  const recentReleases = db
    .prepare(
      `SELECT r.*, sl.slug AS smart_link_slug,
         (SELECT COUNT(*) FROM tracks t WHERE t.release_id = r.id) AS track_count
       FROM releases r
       LEFT JOIN smart_links sl ON sl.release_id = r.id
       WHERE r.artist_id = ?
       ORDER BY r.created_at DESC
       LIMIT 6`
    )
    .all(artistId);

  const recentRoyalties = db
    .prepare(
      `SELECT re.*, r.title AS release_title
       FROM royalty_entries re
       LEFT JOIN releases r ON r.id = re.release_id
       WHERE re.artist_id = ?
       ORDER BY re.created_at DESC
       LIMIT 5`
    )
    .all(artistId);

  const recentNotifications = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 8')
    .all(artistId);

  res.json({
    metrics: {
      totalSongs: Number(songCounts?.totalSongs ?? 0),
      liveSongs: Number(songCounts?.liveSongs ?? 0),
      pendingSongs: Number(songCounts?.pendingSongs ?? 0),
      rejectedSongs: Number(songCounts?.rejectedSongs ?? 0),
      totalReleases: Number(releaseCounts?.totalReleases ?? 0),
      liveReleases: Number(releaseCounts?.liveReleases ?? 0),
      approvedReleases: Number(releaseCounts?.approvedReleases ?? 0),
      pendingReleases: Number(releaseCounts?.pendingReleases ?? 0),
      rejectedReleases: Number(releaseCounts?.rejectedReleases ?? 0),
      verifiedEarnings: balance.verifiedEarnings,
      availableBalance: balance.availableBalance,
      totalPaidOut: balance.totalPaidOut,
      pendingPayouts: balance.pendingPayouts,
      totalStreams: Number(streamsRow?.total ?? 0),
      liveStoreDeliveries: Number(storeDeliveryStats?.liveStoreDeliveries ?? 0),
      totalStoreDeliveries: Number(storeDeliveryStats?.totalStoreDeliveries ?? 0),
      unreadNotifications: Number(unreadNotifRow?.count ?? 0),
    },
    recentReleases,
    recentRoyalties,
    recentNotifications,
  });
});

app.get('/api/artist/notifications', requireArtist, (req: AuthenticatedRequest, res: Response) => {
  const notifications = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(req.user!.id);
  const unreadCount = (
    db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user!.id) as {
      count: number;
    }
  ).count;
  res.json({ notifications, unreadCount: Number(unreadCount ?? 0) });
});

app.patch('/api/artist/notifications/read-all', requireArtist, (req: AuthenticatedRequest, res: Response) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user!.id);
  res.json({ updated: true });
});

app.patch('/api/artist/notifications/:id/read', requireArtist, (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(id, req.user!.id);
  res.json({ updated: true });
});

app.get('/api/artist/releases', requireArtist, (req: AuthenticatedRequest, res: Response) => {
  const artistId = req.user!.id;
  const releases = db
    .prepare(
      `SELECT r.*, sl.slug AS smart_link_slug, sl.clicks AS smart_link_clicks
       FROM releases r
       LEFT JOIN smart_links sl ON sl.release_id = r.id
       WHERE r.artist_id = ?
       ORDER BY r.created_at DESC`
    )
    .all(artistId) as Array<Record<string, unknown>>;

  const getTracks = db.prepare('SELECT * FROM tracks WHERE release_id = ? ORDER BY disc_number ASC, track_number ASC');
  const enriched = releases.map((release) => {
    const targetStores = safeParseArray(release.target_stores_json) as string[];
    const trackRows = getTracks.all(Number(release.id)) as Array<Record<string, unknown>>;
    return {
      ...release,
      target_stores: targetStores,
      platform_deliveries: getReleasePlatformDeliveries(Number(release.id), targetStores),
      tracks: trackRows.map((t) => ({
        ...t,
        artist_roles: safeParseArray(t.artist_roles_json),
      })),
    };
  });

  res.json({ releases: enriched });
});

app.post('/api/artist/releases', requireArtist, (req: AuthenticatedRequest, res: Response) => {
  const artistId = req.user!.id;
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const releaseVersion =
    typeof req.body?.releaseVersion === 'string' ? req.body.releaseVersion.trim().slice(0, 120) : '';
  const releaseType = ['Single', 'EP', 'Album'].includes(req.body?.releaseType) ? req.body.releaseType : 'Single';
  const primaryArtist = typeof req.body?.primaryArtist === 'string' ? req.body.primaryArtist.trim() : '';
  const featuredArtists = typeof req.body?.featuredArtists === 'string' ? req.body.featuredArtists.trim() : '';
  const variousArtists = req.body?.variousArtists ? 1 : 0;
  const genre = typeof req.body?.genre === 'string' ? req.body.genre.trim() : '';
  const subgenre = typeof req.body?.subgenre === 'string' ? req.body.subgenre.trim().slice(0, 80) : '';
  const language = typeof req.body?.language === 'string' ? req.body.language.trim() : '';
  const rawReleaseDate = typeof req.body?.releaseDate === 'string' ? req.body.releaseDate.trim() : '';
  const rawOriginalReleaseDate =
    typeof req.body?.originalReleaseDate === 'string' && req.body.originalReleaseDate.trim()
      ? req.body.originalReleaseDate.trim()
      : rawReleaseDate;

  const normalizeDateIso = (raw: string): string | null => {
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
    let y = 0;
    let m = 0;
    let d = 0;
    let out = '';
    if (iso) {
      y = Number(iso[1]);
      m = Number(iso[2]);
      d = Number(iso[3]);
      out = `${iso[1]}-${iso[2]}-${iso[3]}`;
    } else if (dmy) {
      d = Number(dmy[1]);
      m = Number(dmy[2]);
      y = Number(dmy[3]);
      out = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    } else {
      return null;
    }
    if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const check = new Date(Date.UTC(y, m - 1, d));
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
      return null;
    }
    return out;
  };

  const releaseDate = normalizeDateIso(rawReleaseDate);
  const originalReleaseDate = normalizeDateIso(rawOriginalReleaseDate);

  const labelName =
    typeof req.body?.labelName === 'string' && req.body.labelName.trim()
      ? req.body.labelName.trim().slice(0, 120)
      : 'Palamu Entertainment Industry';
  const upc = typeof req.body?.upc === 'string' ? req.body.upc.trim().slice(0, 32) : '';
  const pLine = typeof req.body?.pLine === 'string' ? req.body.pLine.trim().slice(0, 160) : '';
  const cLine = typeof req.body?.cLine === 'string' ? req.body.cLine.trim().slice(0, 160) : '';
  const productionYearRaw =
    typeof req.body?.productionYear === 'string' ? req.body.productionYear.trim().slice(0, 10) : '';
  const copyrightYearRaw =
    typeof req.body?.copyrightYear === 'string' ? req.body.copyrightYear.trim().slice(0, 10) : '';
  const productionYear = /^\d{4}$/.test(productionYearRaw)
    ? productionYearRaw
    : /^\d{4}$/.test(copyrightYearRaw)
      ? copyrightYearRaw
      : String(new Date().getFullYear());
  const copyrightYear = /^\d{4}$/.test(copyrightYearRaw) ? copyrightYearRaw : productionYear;
  const copyrightOwner =
    typeof req.body?.copyrightOwner === 'string' && req.body.copyrightOwner.trim()
      ? req.body.copyrightOwner.trim().slice(0, 140)
      : labelName;
  const catalogueNumber =
    typeof req.body?.catalogueNumber === 'string' ? req.body.catalogueNumber.trim().slice(0, 60) : '';
  const musicDirector =
    typeof req.body?.musicDirector === 'string' ? req.body.musicDirector.trim().slice(0, 120) : '';
  const producer = typeof req.body?.producer === 'string' ? req.body.producer.trim().slice(0, 120) : '';
  const processingTier = req.body?.processingTier === 'Fast Track' ? 'Fast Track' : 'Standard';
  const releaseScheduleMode = req.body?.releaseScheduleMode === 'Instant Request' ? 'Instant Request' : 'Scheduled';
  const coverUrlRaw = typeof req.body?.coverUrl === 'string' ? req.body.coverUrl.trim() : '';
  const coverUrl = coverUrlRaw.startsWith('/api/uploads/') ? coverUrlRaw : '';
  const targetStoresInput = Array.isArray(req.body?.targetStores)
    ? req.body.targetStores.filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, 20)
    : [];
  const tracksInput = Array.isArray(req.body?.tracks) ? req.body.tracks : [];

  if (title.length < 1 || title.length > 160) {
    res.status(400).json({ error: 'Release title is required (max 160 characters).' });
    return;
  }
  if (!primaryArtist && !variousArtists) {
    res.status(400).json({ error: 'Primary artist name is required.' });
    return;
  }
  const effectivePrimaryArtist = primaryArtist || 'Various Artists';

  if (!genre || !language || !releaseDate || !originalReleaseDate) {
    res.status(400).json({
      error: 'Genre, language, and valid Main & Original Release Dates (DD/MM/YYYY) are required.',
    });
    return;
  }
  if (!pLine || !cLine || !/^\d{4}$/.test(productionYear)) {
    res.status(400).json({
      error: 'P-Line, C-Line, and a valid 4-digit Production Year are required.',
    });
    return;
  }
  if (targetStoresInput.length === 0) {
    res.status(400).json({ error: 'Select at least one distribution store.' });
    return;
  }
  if (tracksInput.length === 0 || tracksInput.length > 25) {
    res.status(400).json({ error: 'Add between 1 and 25 tracks to submit a release.' });
    return;
  }

  for (let i = 0; i < tracksInput.length; i++) {
    const t = tracksInput[i];
    if (!t || typeof t.title !== 'string' || !t.title.trim()) {
      res.status(400).json({ error: `Track ${i + 1} must have a valid title.` });
      return;
    }
    const trackNo = Number(t.trackNumber ?? i + 1);
    const discNo = Number(t.discNumber ?? 1);
    if (!Number.isFinite(trackNo) || trackNo < 1 || !Number.isFinite(discNo) || discNo < 1) {
      res.status(400).json({ error: `Track "${t.title.trim()}" requires valid Track Number and Disc Number (>= 1).` });
      return;
    }
    const dur = Number(t.durationSeconds ?? 0);
    if (t.audioUrl && (!Number.isFinite(dur) || dur < 60 || dur > 360)) {
      res.status(400).json({
        error: `Track "${t.title.trim()}" duration (${dur}s) must be between 60 seconds (1 min) and 360 seconds (6 min).`,
      });
      return;
    }
    if (t.audioUrl && typeof t.audioFilename === 'string' && !t.audioFilename.toLowerCase().endsWith('.wav')) {
      res.status(400).json({
        error: `Track "${t.title.trim()}" must use WAV format (.wav) only.`,
      });
      return;
    }
  }

  const releaseResult = db
    .prepare(
      `INSERT INTO releases (
         artist_id, title, release_version, release_type, primary_artist, featured_artists, various_artists,
         genre, subgenre, language, release_date, original_release_date, production_year, label_name, upc,
         p_line, c_line, copyright_owner, copyright_year, catalogue_number, music_director, producer,
         processing_tier, release_schedule_mode, status, target_stores_json, delivery_mode, cover_url
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending Review', ?, 'Manual QA & Partner Fulfillment', ?)`
    )
    .run(
      artistId,
      title,
      releaseVersion,
      releaseType,
      effectivePrimaryArtist,
      featuredArtists,
      variousArtists,
      genre,
      subgenre,
      language,
      releaseDate,
      originalReleaseDate,
      productionYear,
      labelName,
      upc,
      pLine,
      cLine,
      copyrightOwner,
      copyrightYear,
      catalogueNumber,
      musicDirector,
      producer,
      processingTier,
      releaseScheduleMode,
      JSON.stringify(targetStoresInput),
      coverUrl
    );

  const releaseId = Number(releaseResult.lastInsertRowid);

  const insertTrack = db.prepare(
    `INSERT INTO tracks (
       release_id, artist_id, track_number, disc_number, title, song_version, primary_track_type,
       remixer, author, music_director, producer, publisher, caller_tune_start_time, parental_advisory,
       youtube_content_id, isrc, duration_seconds,
       explicit, is_instrumental, vocal_language, composer, lyricist, artist_roles_json,
       lyrics_text, lyrics_filename, lyrics_url,
       audio_filename, audio_url, audio_mime, audio_size_bytes,
       audio_sample_rate, audio_bit_depth, audio_channels, audio_quality_status, audio_quality_notes, audio_sha256, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending Review')`
  );

  tracksInput.forEach((t: Record<string, unknown>, idx: number) => {
    const tNumber = Number.isFinite(Number(t.trackNumber)) ? Math.max(1, Math.round(Number(t.trackNumber))) : idx + 1;
    const tDisc = Number.isFinite(Number(t.discNumber)) ? Math.max(1, Math.round(Number(t.discNumber))) : 1;
    const tTitle = String(t.title).trim().slice(0, 160);
    const tPrimaryType =
      typeof t.primaryTrackType === 'string' && t.primaryTrackType.trim()
        ? t.primaryTrackType.trim().slice(0, 60)
        : 'Original';
    const tVersion =
      typeof t.songVersion === 'string' && t.songVersion.trim()
        ? t.songVersion.trim().slice(0, 50)
        : tPrimaryType;
    const tRemixer = typeof t.remixer === 'string' ? t.remixer.trim().slice(0, 120) : '';
    const tInstrumental = t.isInstrumental ? 1 : 0;
    const rawAuthor = typeof t.author === 'string' ? t.author : typeof t.lyricist === 'string' ? t.lyricist : '';
    const tAuthor = tInstrumental ? '' : rawAuthor.trim().slice(0, 120);
    const tLyricist = tAuthor;
    const tComposer = typeof t.composer === 'string' ? t.composer.trim().slice(0, 120) : '';
    const tMusicDirector =
      typeof t.musicDirector === 'string' && t.musicDirector.trim()
        ? t.musicDirector.trim().slice(0, 120)
        : musicDirector;
    const tProducer =
      typeof t.producer === 'string' && t.producer.trim() ? t.producer.trim().slice(0, 120) : producer;
    const tPublisher = typeof t.publisher === 'string' ? t.publisher.trim().slice(0, 120) : '';
    const tCallerTuneStart =
      typeof t.callerTuneStartTime === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(t.callerTuneStartTime.trim())
        ? t.callerTuneStartTime.trim()
        : '00:00';
    const allowedAdvisory = ['Non-Explicit', 'Explicit', 'Clean / Edited'];
    const tAdvisory = tInstrumental
      ? 'Non-Explicit'
      : typeof t.parentalAdvisory === 'string' && allowedAdvisory.includes(t.parentalAdvisory)
        ? t.parentalAdvisory
        : t.explicit
          ? 'Explicit'
          : 'Non-Explicit';
    const tExplicit = tInstrumental ? 0 : tAdvisory === 'Explicit' || Boolean(t.explicit) ? 1 : 0;
    const tYoutubeContentId = t.youtubeContentId ? 1 : 0;

    const tIsrc = typeof t.isrc === 'string' ? t.isrc.trim().slice(0, 32) : '';
    const tDuration = Number.isFinite(Number(t.durationSeconds)) ? Math.max(0, Math.round(Number(t.durationSeconds))) : 0;
    const tVocalLanguage = tInstrumental
      ? 'Instrumental (No Vocals)'
      : typeof t.vocalLanguage === 'string' && t.vocalLanguage.trim()
        ? t.vocalLanguage.trim().slice(0, 60)
        : language;

    const rawRoles = Array.isArray(t.artistRoles) ? t.artistRoles : [];
    const cleanedRoles = rawRoles
      .filter(
        (r): r is { name: string; role: string } =>
          Boolean(r) &&
          typeof r.name === 'string' &&
          r.name.trim().length > 0 &&
          typeof r.role === 'string' &&
          r.role.trim().length > 0
      )
      .slice(0, 15)
      .map((r) => ({ name: r.name.trim().slice(0, 100), role: r.role.trim().slice(0, 50) }));

    const tLyricsText = tInstrumental
      ? ''
      : typeof t.lyricsText === 'string'
        ? t.lyricsText.trim().slice(0, 15000)
        : '';
    const tLyricsFilename = tInstrumental
      ? ''
      : typeof t.lyricsFilename === 'string'
        ? t.lyricsFilename.trim().slice(0, 180)
        : '';
    const tLyricsUrlRaw = tInstrumental
      ? ''
      : typeof t.lyricsUrl === 'string'
        ? t.lyricsUrl.trim()
        : '';
    const tLyricsUrl = tLyricsUrlRaw.startsWith('/api/uploads/') ? tLyricsUrlRaw : '';

    const tAudioFilename = typeof t.audioFilename === 'string' ? t.audioFilename.trim().slice(0, 180) : '';
    const tAudioUrlRaw = typeof t.audioUrl === 'string' ? t.audioUrl.trim() : '';
    const tAudioUrl = tAudioUrlRaw.startsWith('/api/uploads/') ? tAudioUrlRaw : '';
    const tAudioMime = typeof t.audioMime === 'string' ? t.audioMime.trim().slice(0, 80) : '';
    const tAudioSize = Number.isFinite(Number(t.audioSizeBytes)) ? Math.max(0, Math.round(Number(t.audioSizeBytes))) : 0;
    const tAudioSampleRate = Number.isFinite(Number(t.audioSampleRate))
      ? Math.max(0, Math.round(Number(t.audioSampleRate)))
      : 0;
    const tAudioBitDepth = Number.isFinite(Number(t.audioBitDepth))
      ? Math.max(0, Math.round(Number(t.audioBitDepth)))
      : 0;
    const tAudioChannels = Number.isFinite(Number(t.audioChannels))
      ? Math.max(0, Math.round(Number(t.audioChannels)))
      : 0;
    const tQualityStatus =
      typeof t.audioQualityStatus === 'string' && t.audioQualityStatus.trim()
        ? t.audioQualityStatus.trim().slice(0, 60)
        : tAudioUrl
          ? 'Uploaded'
          : 'No Master Uploaded';
    const tQualityNotes =
      typeof t.audioQualityNotes === 'string' ? t.audioQualityNotes.trim().slice(0, 240) : '';
    const tAudioSha256 =
      typeof t.audioSha256 === 'string' && /^[a-f0-9]{64}$/i.test(t.audioSha256.trim())
        ? t.audioSha256.trim().toLowerCase()
        : '';

    const trackInsertRes = insertTrack.run(
      releaseId,
      artistId,
      tNumber,
      tDisc,
      tTitle,
      tVersion,
      tPrimaryType,
      tRemixer,
      tAuthor,
      tMusicDirector,
      tProducer,
      tPublisher,
      tCallerTuneStart,
      tAdvisory,
      tYoutubeContentId,
      tIsrc,
      tDuration,
      tExplicit,
      tInstrumental,
      tVocalLanguage,
      tComposer,
      tLyricist,
      JSON.stringify(cleanedRoles),
      tLyricsText,
      tLyricsFilename,
      tLyricsUrl,
      tAudioFilename,
      tAudioUrl,
      tAudioMime,
      tAudioSize,
      tAudioSampleRate,
      tAudioBitDepth,
      tAudioChannels,
      tQualityStatus,
      tQualityNotes,
      tAudioSha256
    );
    ensureSongAgreementForTrack(Number(trackInsertRes.lastInsertRowid), false);
  });

  // Seed individual per-platform delivery rows (Queued for Partner for selected stores, Not Submitted otherwise)
  seedPlatformDeliveries(releaseId, targetStoresInput);

  // Create initial smart link draft
  const baseSlug = normalizeSlug(`${primaryArtist}-${title}`) || `release-${releaseId}`;
  const slugCheck = db.prepare('SELECT id FROM smart_links WHERE slug = ?').get(baseSlug);
  const finalSlug = slugCheck ? `${baseSlug}-${releaseId}` : baseSlug;

  db.prepare(
    `INSERT INTO smart_links (release_id, artist_id, slug, headline, subtitle)
     VALUES (?, ?, ?, ?, ?)`
  ).run(releaseId, artistId, finalSlug, title, `${primaryArtist} · Palamu Entertainment Industry`);

  createNotification(
    artistId,
    processingTier === 'Fast Track'
      ? `Fast Track Submitted: ${title}`
      : `Release Submitted: ${title}`,
    processingTier === 'Fast Track'
      ? `Your ${releaseType} "${title}" has entered Priority Quality Review (4–5 working days estimated review after complete submission; actual store publishing depends on partner and platform approval).`
      : `Your ${releaseType} "${title}" has entered Pending Review for ${targetStoresInput.length} selected stores.`,
    'release'
  );

  res.status(201).json({
    id: releaseId,
    smartLinkSlug: finalSlug,
    processingTier,
    message:
      processingTier === 'Fast Track'
        ? 'Release submitted with Fast Track Priority Quality Review to Palamu Entertainment Industry.'
        : 'Release submitted to Palamu Entertainment Industry for quality review.',
  });
});

app.delete('/api/artist/releases/:id', requireArtist, (req: AuthenticatedRequest, res: Response) => {
  const releaseId = Number(req.params.id);
  const release = db
    .prepare('SELECT id, artist_id, status FROM releases WHERE id = ?')
    .get(releaseId) as { id: number; artist_id: number; status: string } | undefined;

  if (!release || release.artist_id !== req.user!.id) {
    res.status(404).json({ error: 'Release not found.' });
    return;
  }
  if (release.status === 'Live') {
    res.status(400).json({ error: 'Live releases cannot be deleted directly. Request takedown via Support.' });
    return;
  }

  db.prepare('DELETE FROM releases WHERE id = ? AND artist_id = ?').run(releaseId, req.user!.id);
  res.json({ deleted: true });
});

// ========================
// SMART LINKS
// ========================

app.get('/api/artist/smart-links', requireArtist, (req: AuthenticatedRequest, res: Response) => {
  const links = db
    .prepare(
      `SELECT sl.*, r.title AS release_title, r.primary_artist, r.cover_url, r.status AS release_status, r.release_date
       FROM smart_links sl
       JOIN releases r ON r.id = sl.release_id
       WHERE sl.artist_id = ?
       ORDER BY sl.created_at DESC`
    )
    .all(req.user!.id);
  res.json({ smartLinks: links });
});

app.put('/api/artist/smart-links/:releaseId', requireArtist, (req: AuthenticatedRequest, res: Response) => {
  const releaseId = Number(req.params.releaseId);
  const release = db
    .prepare('SELECT id, artist_id, title, primary_artist FROM releases WHERE id = ?')
    .get(releaseId) as { id: number; artist_id: number; title: string; primary_artist: string } | undefined;

  if (!release || release.artist_id !== req.user!.id) {
    res.status(404).json({ error: 'Release not found.' });
    return;
  }

  const slugInput = typeof req.body?.slug === 'string' ? normalizeSlug(req.body.slug) : '';
  if (!slugInput || slugInput.length < 3) {
    res.status(400).json({ error: 'Smart Link slug must be at least 3 URL-safe characters.' });
    return;
  }

  const conflict = db
    .prepare('SELECT id FROM smart_links WHERE slug = ? AND release_id != ?')
    .get(slugInput, releaseId);
  if (conflict) {
    res.status(409).json({ error: 'This Smart Link slug is already claimed. Choose another.' });
    return;
  }

  const headline = typeof req.body?.headline === 'string' ? req.body.headline.trim().slice(0, 140) : release.title;
  const subtitle =
    typeof req.body?.subtitle === 'string' ? req.body.subtitle.trim().slice(0, 180) : release.primary_artist;

  const spotifyUrl = sanitizeHttpUrl(req.body?.spotifyUrl);
  const appleMusicUrl = sanitizeHttpUrl(req.body?.appleMusicUrl);
  const youtubeMusicUrl = sanitizeHttpUrl(req.body?.youtubeMusicUrl);
  const jiosaavnUrl = sanitizeHttpUrl(req.body?.jiosaavnUrl);
  const gaanaUrl = sanitizeHttpUrl(req.body?.gaanaUrl);
  const wynkUrl = sanitizeHttpUrl(req.body?.wynkUrl);
  const amazonMusicUrl = sanitizeHttpUrl(req.body?.amazonMusicUrl);
  const hungamaMusicUrl = sanitizeHttpUrl(req.body?.hungamaMusicUrl);
  const facebookMusicUrl = sanitizeHttpUrl(req.body?.facebookMusicUrl);
  const instagramMusicUrl = sanitizeHttpUrl(req.body?.instagramMusicUrl);
  const tiktokMusicUrl = sanitizeHttpUrl(req.body?.tiktokMusicUrl);
  const airtelMusicUrl = sanitizeHttpUrl(req.body?.airtelMusicUrl);
  const vodafoneMusicUrl = sanitizeHttpUrl(req.body?.vodafoneMusicUrl);
  const deezerUrl = sanitizeHttpUrl(req.body?.deezerUrl);
  const otherPlatformsUrl = sanitizeHttpUrl(req.body?.otherPlatformsUrl);

  const existing = db.prepare('SELECT id FROM smart_links WHERE release_id = ?').get(releaseId);
  if (existing) {
    db.prepare(
      `UPDATE smart_links
       SET slug = ?, headline = ?, subtitle = ?, spotify_url = ?, apple_music_url = ?,
           youtube_music_url = ?, jiosaavn_url = ?, gaana_url = ?, wynk_url = ?, amazon_music_url = ?,
           hungama_music_url = ?, deezer_url = ?, facebook_music_url = ?, instagram_music_url = ?,
           tiktok_music_url = ?, airtel_music_url = ?, vodafone_music_url = ?, other_platforms_url = ?
       WHERE release_id = ? AND artist_id = ?`
    ).run(
      slugInput,
      headline,
      subtitle,
      spotifyUrl,
      appleMusicUrl,
      youtubeMusicUrl,
      jiosaavnUrl,
      gaanaUrl,
      wynkUrl,
      amazonMusicUrl,
      hungamaMusicUrl,
      deezerUrl,
      facebookMusicUrl,
      instagramMusicUrl,
      tiktokMusicUrl,
      airtelMusicUrl,
      vodafoneMusicUrl,
      otherPlatformsUrl,
      releaseId,
      req.user!.id
    );
  } else {
    db.prepare(
      `INSERT INTO smart_links (
         release_id, artist_id, slug, headline, subtitle,
         spotify_url, apple_music_url, youtube_music_url, jiosaavn_url, gaana_url, wynk_url, amazon_music_url,
         hungama_music_url, deezer_url, facebook_music_url, instagram_music_url, tiktok_music_url,
         airtel_music_url, vodafone_music_url, other_platforms_url
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      releaseId,
      req.user!.id,
      slugInput,
      headline,
      subtitle,
      spotifyUrl,
      appleMusicUrl,
      youtubeMusicUrl,
      jiosaavnUrl,
      gaanaUrl,
      wynkUrl,
      amazonMusicUrl,
      hungamaMusicUrl,
      deezerUrl,
      facebookMusicUrl,
      instagramMusicUrl,
      tiktokMusicUrl,
      airtelMusicUrl,
      vodafoneMusicUrl,
      otherPlatformsUrl
    );
  }

  const updated = db.prepare('SELECT * FROM smart_links WHERE release_id = ?').get(releaseId);
  res.json({ smartLink: updated });
});

app.get('/api/public/smart-link/:slug', (req: Request, res: Response) => {
  const slug = normalizeSlug(String(req.params.slug || ''));
  if (!slug) {
    res.status(400).json({ error: 'Invalid smart link.' });
    return;
  }

  const link = db
    .prepare(
      `SELECT sl.*, r.title AS release_title, r.primary_artist, r.featured_artists, r.cover_url,
              r.genre, r.language, r.release_date, r.label_name, r.status AS release_status
       FROM smart_links sl
       JOIN releases r ON r.id = sl.release_id
       WHERE sl.slug = ?`
    )
    .get(slug) as Record<string, unknown> | undefined;

  if (!link) {
    res.status(404).json({ error: 'Smart Link not found.' });
    return;
  }

  db.prepare('UPDATE smart_links SET clicks = clicks + 1 WHERE id = ?').run(Number(link.id));
  const tracks = db
    .prepare('SELECT id, track_number, title, duration_seconds, explicit FROM tracks WHERE release_id = ? ORDER BY track_number ASC')
    .all(Number(link.release_id));

  res.json({
    smartLink: {
      ...link,
      clicks: Number(link.clicks) + 1,
      tracks,
    },
  });
});

// ========================
// PAYMENTS & ROYALTIES
// ========================

app.get('/api/artist/royalties', requireArtist, (req: AuthenticatedRequest, res: Response) => {
  const artistId = req.user!.id;
  const balance = getArtistBalance(artistId);

  const entries = db
    .prepare(
      `SELECT re.*, r.title AS release_title
       FROM royalty_entries re
       LEFT JOIN releases r ON r.id = re.release_id
       WHERE re.artist_id = ?
       ORDER BY re.created_at DESC`
    )
    .all(artistId);

  const payouts = db
    .prepare('SELECT * FROM payout_requests WHERE artist_id = ? ORDER BY created_at DESC')
    .all(artistId);

  res.json({
    balance,
    entries,
    payouts,
  });
});

app.post('/api/artist/payouts', requireArtist, (req: AuthenticatedRequest, res: Response) => {
  const artistId = req.user!.id;
  const amount = Number(req.body?.amountInr);
  const paymentMethod = typeof req.body?.paymentMethod === 'string' ? req.body.paymentMethod.trim() : '';
  const accountSummary = typeof req.body?.accountSummary === 'string' ? req.body.accountSummary.trim() : '';

  if (!Number.isFinite(amount) || amount < 500) {
    res.status(400).json({ error: 'Minimum payout threshold is ₹500.00 of verified available balance.' });
    return;
  }
  if (!paymentMethod || !accountSummary || accountSummary.length < 4) {
    res.status(400).json({ error: 'Payment method and payout destination (UPI ID or Bank Account) are required.' });
    return;
  }

  const balance = getArtistBalance(artistId);
  if (amount > balance.availableBalance) {
    res.status(400).json({
      error: `Requested amount exceeds available verified balance (₹${balance.availableBalance.toFixed(2)}).`,
    });
    return;
  }

  const result = db
    .prepare(
      `INSERT INTO payout_requests (artist_id, amount_inr, payment_method, account_summary, status)
       VALUES (?, ?, ?, ?, 'Requested')`
    )
    .run(artistId, Number(amount.toFixed(2)), paymentMethod.slice(0, 40), accountSummary.slice(0, 200));

  const created = db.prepare('SELECT * FROM payout_requests WHERE id = ?').get(Number(result.lastInsertRowid));
  res.status(201).json({ payout: created, balance: getArtistBalance(artistId) });
});

// ========================
// SUPPORT TICKETS
// ========================

app.get('/api/artist/support', requireArtist, (req: AuthenticatedRequest, res: Response) => {
  const tickets = db
    .prepare('SELECT * FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC')
    .all(req.user!.id);
  res.json({ tickets });
});

app.post('/api/support', (req: Request, res: Response) => {
  const sessionUser = extractBearerUser(req);
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim().slice(0, 25) : '';
  const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : '';
  const category = typeof req.body?.category === 'string' ? req.body.category.trim().slice(0, 50) : 'Distribution';
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

  if (name.length < 2 || !isValidEmail(email) || subject.length < 3 || message.length < 10) {
    res.status(400).json({ error: 'Please provide your name, valid email, subject, and a message (min 10 characters).' });
    return;
  }

  const userId = sessionUser && sessionUser.role === 'artist' ? sessionUser.id : null;
  const result = db
    .prepare(
      `INSERT INTO support_tickets (user_id, name, email, phone, subject, category, message, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Open')`
    )
    .run(userId, name.slice(0, 100), email, phone, subject.slice(0, 160), category, message.slice(0, 2000));

  const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(Number(result.lastInsertRowid));
  res.status(201).json({ ticket });
});

// ========================
// ADMIN DASHBOARD ENDPOINTS
// ========================

app.get('/api/admin/overview', requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const artistsCount = (db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'artist'").get() as { count: number }).count;

  const releaseStats = db
    .prepare(
      `SELECT
         COUNT(*) AS totalReleases,
         SUM(CASE WHEN status = 'Pending Review' THEN 1 ELSE 0 END) AS pendingReleases,
         SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END) AS approvedReleases,
         SUM(CASE WHEN status = 'Live' THEN 1 ELSE 0 END) AS liveReleases,
         SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END) AS rejectedReleases
       FROM releases`
    )
    .get() as Record<string, number | null>;

  const trackCount = (db.prepare('SELECT COUNT(*) AS count FROM tracks').get() as { count: number }).count;
  const royaltySum = (db.prepare('SELECT COALESCE(SUM(amount_inr), 0) AS total FROM royalty_entries').get() as { total: number }).total;
  const pendingPayouts = (
    db.prepare("SELECT COUNT(*) AS count FROM payout_requests WHERE status IN ('Requested', 'Processing')").get() as { count: number }
  ).count;
  const openTickets = (
    db.prepare("SELECT COUNT(*) AS count FROM support_tickets WHERE status IN ('Open', 'In Progress')").get() as { count: number }
  ).count;

  res.json({
    metrics: {
      totalArtists: Number(artistsCount ?? 0),
      totalReleases: Number(releaseStats?.totalReleases ?? 0),
      pendingReleases: Number(releaseStats?.pendingReleases ?? 0),
      approvedReleases: Number(releaseStats?.approvedReleases ?? 0),
      liveReleases: Number(releaseStats?.liveReleases ?? 0),
      rejectedReleases: Number(releaseStats?.rejectedReleases ?? 0),
      totalSongs: Number(trackCount ?? 0),
      verifiedRoyaltiesTotal: Number(Number(royaltySum ?? 0).toFixed(2)),
      pendingPayoutRequests: Number(pendingPayouts ?? 0),
      openSupportTickets: Number(openTickets ?? 0),
    },
  });
});

app.get('/api/admin/releases', requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const releases = db
    .prepare(
      `SELECT r.*, u.full_name AS artist_account_name, u.email AS artist_email, u.mobile AS artist_mobile,
              u.country AS artist_country, sl.slug AS smart_link_slug
       FROM releases r
       JOIN users u ON u.id = r.artist_id
       LEFT JOIN smart_links sl ON sl.release_id = r.id
       ORDER BY r.created_at DESC`
    )
    .all() as Array<Record<string, unknown>>;

  const getTracks = db.prepare('SELECT * FROM tracks WHERE release_id = ? ORDER BY disc_number ASC, track_number ASC');
  const enriched = releases.map((r) => {
    const targetStores = safeParseArray(r.target_stores_json) as string[];
    const trackRows = getTracks.all(Number(r.id)) as Array<Record<string, unknown>>;
    return {
      ...r,
      target_stores: targetStores,
      platform_deliveries: getReleasePlatformDeliveries(Number(r.id), targetStores),
      tracks: trackRows.map((t) => ({
        ...t,
        artist_roles: safeParseArray(t.artist_roles_json),
      })),
    };
  });

  res.json({ releases: enriched });
});

app.patch('/api/admin/releases/:id/status', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const releaseId = Number(req.params.id);
  const status = String(req.body?.status || '');
  const validStatuses = ['Pending Review', 'Approved', 'Live', 'Rejected'];
  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: 'Invalid release status.' });
    return;
  }

  const release = db.prepare('SELECT * FROM releases WHERE id = ?').get(releaseId) as Record<string, unknown> | undefined;
  if (!release) {
    res.status(404).json({ error: 'Release not found.' });
    return;
  }

  const upc = typeof req.body?.upc === 'string' ? req.body.upc.trim().slice(0, 32) : String(release.upc || '');
  const adminNotes =
    typeof req.body?.adminNotes === 'string' ? req.body.adminNotes.trim().slice(0, 500) : String(release.admin_notes || '');

  db.prepare(
    `UPDATE releases
     SET status = ?, upc = ?, admin_notes = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(status, upc, adminNotes, releaseId);

  const trackStatus = status === 'Live' ? 'Live' : status === 'Rejected' ? 'Rejected' : 'Pending Review';
  db.prepare('UPDATE tracks SET status = ? WHERE release_id = ?').run(trackStatus, releaseId);

  if (Array.isArray(req.body?.trackIsrcs)) {
    const updateIsrc = db.prepare('UPDATE tracks SET isrc = ? WHERE id = ? AND release_id = ?');
    for (const item of req.body.trackIsrcs) {
      if (item && Number.isFinite(Number(item.id)) && typeof item.isrc === 'string') {
        updateIsrc.run(item.isrc.trim().slice(0, 32), Number(item.id), releaseId);
      }
    }
  }

  createNotification(
    Number(release.artist_id),
    `Release ${status}: ${String(release.title)}`,
    adminNotes
      ? `Release status updated to ${status}. Note: ${adminNotes}`
      : `Your release "${String(release.title)}" status is now ${status}.`,
    'release'
  );

  res.json({ updated: true, status });
});

const PLATFORM_TO_SMARTLINK_COL: Record<string, string> = {
  Spotify: 'spotify_url',
  'Apple Music': 'apple_music_url',
  'YouTube Music': 'youtube_music_url',
  JioSaavn: 'jiosaavn_url',
  Gaana: 'gaana_url',
  'Wynk Music': 'wynk_url',
  'Amazon Music': 'amazon_music_url',
  'Hungama Music': 'hungama_music_url',
  Deezer: 'deezer_url',
  'Facebook Music': 'facebook_music_url',
  'Instagram Music': 'instagram_music_url',
  'TikTok Music': 'tiktok_music_url',
  'Airtel Music': 'airtel_music_url',
  'Vodafone Music': 'vodafone_music_url',
  'Other Available Platforms': 'other_platforms_url',
};

app.patch('/api/admin/releases/:id/platforms', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const releaseId = Number(req.params.id);
  const release = db.prepare('SELECT id, artist_id, title, target_stores_json FROM releases WHERE id = ?').get(releaseId) as
    | { id: number; artist_id: number; title: string; target_stores_json: string }
    | undefined;

  if (!release) {
    res.status(404).json({ error: 'Release not found.' });
    return;
  }

  const updatesRaw = Array.isArray(req.body?.updates)
    ? req.body.updates
    : req.body?.platformName
      ? [req.body]
      : [];

  if (updatesRaw.length === 0) {
    res.status(400).json({ error: 'No platform updates provided.' });
    return;
  }

  const validStatuses = ['Not Submitted', 'Queued for Partner', 'In Review', 'LIVE', 'Rejected', 'Takedown'];
  const allowedStores = new Set<string>([...DISTRIBUTION_STORES, ...getAllPlatformNames()]);

  const normalizedUpdates: Array<{
    platformName: string;
    deliveryStatus: string;
    partnerName: string;
    partnerConfirmationId: string;
    liveUrl: string;
  }> = [];

  for (const item of updatesRaw) {
    const platformName = typeof item?.platformName === 'string' ? item.platformName.trim() : '';
    const deliveryStatus = typeof item?.deliveryStatus === 'string' ? item.deliveryStatus.trim() : '';
    const partnerName = typeof item?.partnerName === 'string' ? item.partnerName.trim().slice(0, 120) : '';
    const partnerConfirmationId =
      typeof item?.partnerConfirmationId === 'string' ? item.partnerConfirmationId.trim().slice(0, 120) : '';
    const liveUrl = sanitizeHttpUrl(item?.liveUrl);

    if (!allowedStores.has(platformName)) {
      res.status(400).json({ error: `Unsupported platform: ${platformName || 'unknown'}` });
      return;
    }
    if (!validStatuses.includes(deliveryStatus)) {
      res.status(400).json({ error: `Invalid delivery status for ${platformName}.` });
      return;
    }
    if (deliveryStatus === 'LIVE' && (!partnerName || !partnerConfirmationId)) {
      res.status(400).json({
        error: `${platformName} cannot be marked LIVE without a real distribution partner name and confirmation ID.`,
      });
      return;
    }

    normalizedUpdates.push({
      platformName,
      deliveryStatus,
      partnerName,
      partnerConfirmationId,
      liveUrl,
    });
  }

  const targetStores = safeParseArray(release.target_stores_json) as string[];
  seedPlatformDeliveries(releaseId, targetStores);

  const upsert = db.prepare(
    `UPDATE release_platform_deliveries
     SET delivery_status = ?, partner_name = ?, partner_confirmation_id = ?, live_url = ?,
         verified_at = CASE WHEN ? = 'LIVE' THEN COALESCE(NULLIF(verified_at, ''), datetime('now')) ELSE '' END,
         updated_at = datetime('now')
     WHERE release_id = ? AND platform_name = ?`
  );

  for (const u of normalizedUpdates) {
    upsert.run(
      u.deliveryStatus,
      u.partnerName,
      u.partnerConfirmationId,
      u.liveUrl,
      u.deliveryStatus,
      releaseId,
      u.platformName
    );

    const col = PLATFORM_TO_SMARTLINK_COL[u.platformName];
    if (col && u.liveUrl && u.deliveryStatus === 'LIVE') {
      db.prepare(`UPDATE smart_links SET ${col} = ? WHERE release_id = ? AND ${col} = ''`).run(u.liveUrl, releaseId);
    }
  }

  const livePlatforms = normalizedUpdates.filter((u) => u.deliveryStatus === 'LIVE').map((u) => u.platformName);
  if (livePlatforms.length > 0) {
    createNotification(
      release.artist_id,
      `Store Delivery Confirmed LIVE: ${release.title}`,
      `${livePlatforms.join(', ')} confirmed LIVE delivery for "${release.title}".`,
      'delivery'
    );
  }

  const updatedDeliveries = getReleasePlatformDeliveries(releaseId, targetStores);
  res.json({ updated: true, platform_deliveries: updatedDeliveries });
});

app.get('/api/admin/artists', requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const artists = db
    .prepare(
      `SELECT users.id, users.full_name, users.stage_name, users.country, users.mobile, users.email,
              users.payout_method, users.payout_details,
              users.verification_status, users.verification_doc_url, users.verification_notes,
              users.otp_verified, users.account_protected, users.created_at,
              k.aadhaar_masked, k.pan_masked, k.full_address, k.consent_timestamp,
              k.aadhaar_front_file, k.aadhaar_back_file, k.pan_card_file, k.kyc_status,
         (SELECT COUNT(*) FROM releases r WHERE r.artist_id = users.id) AS release_count,
         (SELECT COUNT(*) FROM tracks t WHERE t.artist_id = users.id) AS song_count
       FROM users
       LEFT JOIN artist_kyc k ON k.user_id = users.id
       WHERE users.role = 'artist'
       ORDER BY users.created_at DESC`
    )
    .all() as Array<Record<string, unknown>>;

  const enriched = artists.map((a) => ({
    id: a.id,
    full_name: a.full_name,
    stage_name: a.stage_name,
    country: a.country,
    mobile: a.mobile,
    email: a.email,
    payout_method: a.payout_method,
    payout_details: a.payout_details,
    verification_status: a.verification_status,
    verification_doc_url: a.verification_doc_url,
    verification_notes: a.verification_notes,
    otp_verified: a.otp_verified,
    account_protected: a.account_protected,
    created_at: a.created_at,
    release_count: a.release_count,
    song_count: a.song_count,
    kyc_status: a.kyc_status || a.verification_status || 'Unverified',
    aadhaar_masked: a.aadhaar_masked || '',
    pan_masked: a.pan_masked || '',
    full_address: a.full_address || '',
    consent_timestamp: a.consent_timestamp || '',
    has_aadhaar_front: Boolean(a.aadhaar_front_file),
    has_aadhaar_back: Boolean(a.aadhaar_back_file),
    has_pan_card: Boolean(a.pan_card_file),
    balance: getArtistBalance(Number(a.id)),
  }));

  res.json({ artists: enriched });
});

app.get('/api/admin/royalties', requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const entries = db
    .prepare(
      `SELECT re.*, u.full_name AS artist_name, u.email AS artist_email, r.title AS release_title
       FROM royalty_entries re
       JOIN users u ON u.id = re.artist_id
       LEFT JOIN releases r ON r.id = re.release_id
       ORDER BY re.created_at DESC`
    )
    .all();
  res.json({ entries });
});

app.post('/api/admin/royalties', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const artistId = Number(req.body?.artistId);
  const releaseId = req.body?.releaseId ? Number(req.body.releaseId) : null;
  const storeName = typeof req.body?.storeName === 'string' ? req.body.storeName.trim() : '';
  const period = typeof req.body?.period === 'string' ? req.body.period.trim() : '';
  const entryDateRaw = typeof req.body?.entryDate === 'string' ? req.body.entryDate.trim() : '';
  const entryDate = /^\d{4}-\d{2}-\d{2}$/.test(entryDateRaw)
    ? entryDateRaw
    : new Date().toISOString().slice(0, 10);
  const streams = Number(req.body?.streams ?? 0);
  const amountInr = Number(req.body?.amountInr);
  const referenceNote = typeof req.body?.referenceNote === 'string' ? req.body.referenceNote.trim().slice(0, 240) : '';

  const artist = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'artist'").get(artistId);
  if (!artist) {
    res.status(404).json({ error: 'Selected artist account not found.' });
    return;
  }
  if (!storeName || !period || !Number.isFinite(amountInr) || amountInr <= 0) {
    res.status(400).json({ error: 'Store name, reporting period, and positive royalty amount (INR) are required.' });
    return;
  }

  const result = db
    .prepare(
      `INSERT INTO royalty_entries (artist_id, release_id, store_name, period, entry_date, streams, amount_inr, reference_note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Verified')`
    )
    .run(
      artistId,
      releaseId,
      storeName.slice(0, 80),
      period.slice(0, 60),
      entryDate,
      Number.isFinite(streams) ? Math.max(0, Math.round(streams)) : 0,
      Number(amountInr.toFixed(2)),
      referenceNote
    );

  createNotification(
    artistId,
    `Verified Royalty Credited: ₹${Number(amountInr.toFixed(2))}`,
    `${storeName} statement for ${period} credited to your verified royalty ledger.`,
    'royalty'
  );

  const entry = db.prepare('SELECT * FROM royalty_entries WHERE id = ?').get(Number(result.lastInsertRowid));
  res.status(201).json({ entry });
});

app.get('/api/admin/payouts', requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const payouts = db
    .prepare(
      `SELECT p.*, u.full_name AS artist_name, u.email AS artist_email, u.mobile AS artist_mobile
       FROM payout_requests p
       JOIN users u ON u.id = p.artist_id
       ORDER BY p.created_at DESC`
    )
    .all();
  res.json({ payouts });
});

app.patch('/api/admin/payouts/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const payoutId = Number(req.params.id);
  const status = String(req.body?.status || '');
  const adminReference = typeof req.body?.adminReference === 'string' ? req.body.adminReference.trim().slice(0, 140) : '';

  if (!['Requested', 'Processing', 'Paid', 'Declined'].includes(status)) {
    res.status(400).json({ error: 'Invalid payout status.' });
    return;
  }

  const existing = db
    .prepare('SELECT id, artist_id, amount_inr FROM payout_requests WHERE id = ?')
    .get(payoutId) as { id: number; artist_id: number; amount_inr: number } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Payout request not found.' });
    return;
  }

  db.prepare(
    `UPDATE payout_requests
     SET status = ?, admin_reference = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(status, adminReference, payoutId);

  createNotification(
    existing.artist_id,
    `Payout Request ${status}: ₹${Number(existing.amount_inr).toFixed(2)}`,
    adminReference
      ? `Your withdrawal request #${payoutId} is marked ${status}. Reference: ${adminReference}.`
      : `Your withdrawal request #${payoutId} status changed to ${status}.`,
    'payout'
  );

  res.json({ updated: true });
});

app.get('/api/admin/support', requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const tickets = db.prepare('SELECT * FROM support_tickets ORDER BY created_at DESC').all();
  res.json({ tickets });
});

app.patch('/api/admin/support/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const ticketId = Number(req.params.id);
  const status = String(req.body?.status || '');
  const adminReply = typeof req.body?.adminReply === 'string' ? req.body.adminReply.trim().slice(0, 2000) : '';

  if (!['Open', 'In Progress', 'Resolved'].includes(status)) {
    res.status(400).json({ error: 'Invalid ticket status.' });
    return;
  }

  const ticket = db
    .prepare('SELECT id, user_id, subject FROM support_tickets WHERE id = ?')
    .get(ticketId) as { id: number; user_id: number | null; subject: string } | undefined;

  db.prepare(
    `UPDATE support_tickets
     SET status = ?, admin_reply = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(status, adminReply, ticketId);

  if (ticket?.user_id) {
    createNotification(
      ticket.user_id,
      `Support Ticket #${ticketId} (${status})`,
      adminReply
        ? `Reply on "${ticket.subject}": ${adminReply}`
        : `Your support ticket "${ticket.subject}" is now ${status}.`,
      'support'
    );
  }

  res.json({ updated: true });
});

registerExtendedRoutes(app);
registerKycAndAgreementRoutes(app);

// ========================
// VITE / STATIC SPA SERVING
// ========================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`ANGAD MUSIC DISTRIBUTOR server running on http://0.0.0.0:${PORT}`);
  });
  // Allow large 4-6 minute WAV uploads without premature connection timeouts
  httpServer.requestTimeout = 0;
  httpServer.headersTimeout = 120000;
  httpServer.keepAliveTimeout = 120000;
}

startServer();

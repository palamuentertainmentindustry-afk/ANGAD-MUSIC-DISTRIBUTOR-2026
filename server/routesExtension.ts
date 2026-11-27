import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Express, Request, Response } from 'express';
import {
  extractBearerUser,
  hashPassword,
  requireAdmin,
  requireArtist,
  signSessionToken,
  verifyPassword,
  type AuthenticatedRequest,
} from './auth.ts';
import {
  backupsDir,
  createDatabaseBackup,
  createNotification,
  db,
  getActivePlatformNames,
  getSiteSettings,
  recordLoginEvent,
} from './db.ts';

function normalizeMobile(raw: string): string {
  return raw.replace(/[\s\-()]/g, '').trim();
}

function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function createOtpChallenge(identifier: string, purpose: 'login' | 'reset' | 'verify'): {
  code: string;
  expiresAt: string;
} {
  const code = String(crypto.randomInt(100000, 1000000));
  const codeHash = hashPassword(code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  db.prepare('UPDATE otp_challenges SET used = 1 WHERE identifier = ? AND purpose = ? AND used = 0').run(
    identifier,
    purpose
  );

  db.prepare(
    `INSERT INTO otp_challenges (identifier, purpose, code_hash, expires_at)
     VALUES (?, ?, ?, ?)`
  ).run(identifier, purpose, codeHash, expiresAt);

  return { code, expiresAt };
}

function verifyOtpChallenge(
  identifier: string,
  purpose: 'login' | 'reset' | 'verify',
  code: string
): { valid: boolean; error?: string } {
  const row = db
    .prepare(
      `SELECT * FROM otp_challenges
       WHERE identifier = ? AND purpose = ? AND used = 0
       ORDER BY id DESC LIMIT 1`
    )
    .get(identifier, purpose) as
    | {
        id: number;
        code_hash: string;
        expires_at: string;
        attempts: number;
      }
    | undefined;

  if (!row) {
    return { valid: false, error: 'No active OTP challenge found. Request a new 6-digit OTP.' };
  }
  if (row.attempts >= 5) {
    db.prepare('UPDATE otp_challenges SET used = 1 WHERE id = ?').run(row.id);
    return { valid: false, error: 'Maximum OTP attempts exceeded. Request a new OTP.' };
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('UPDATE otp_challenges SET used = 1 WHERE id = ?').run(row.id);
    return { valid: false, error: 'OTP expired. Request a new 6-digit OTP.' };
  }

  if (!verifyPassword(code.trim(), row.code_hash)) {
    db.prepare('UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    return { valid: false, error: 'Invalid 6-digit OTP code.' };
  }

  db.prepare('UPDATE otp_challenges SET used = 1 WHERE id = ?').run(row.id);
  return { valid: true };
}

function findArtistByMobile(mobileInput: string) {
  const normalized = normalizeMobile(mobileInput);
  const last10 = normalized.length >= 10 ? normalized.slice(-10) : normalized;
  const candidates = db.prepare("SELECT * FROM users WHERE role = 'artist'").all() as Array<
    Record<string, unknown>
  >;
  return candidates.find((u) => {
    const m = normalizeMobile(String(u.mobile || ''));
    return m === normalized || (last10.length === 10 && m.endsWith(last10));
  });
}

export function registerExtendedRoutes(app: Express): void {
  // ========================
  // PUBLIC SITE SETTINGS & PLATFORMS
  // ========================
  app.get('/api/site-settings', (_req: Request, res: Response) => {
    res.json({ settings: getSiteSettings() });
  });

  app.get('/api/platforms', (_req: Request, res: Response) => {
    const platforms = db.prepare('SELECT * FROM distribution_platforms ORDER BY id ASC').all();
    res.json({
      platforms,
      activeNames: getActivePlatformNames(),
    });
  });

  // ========================
  // MOBILE OTP LOGIN, FORGOT PASSWORD & RESET
  // ========================
  app.post('/api/auth/artist/otp/request', (req: Request, res: Response) => {
    const mobile = typeof req.body?.mobile === 'string' ? normalizeMobile(req.body.mobile) : '';
    if (mobile.length < 7) {
      res.status(400).json({ error: 'Enter your registered mobile number.' });
      return;
    }

    const user = findArtistByMobile(mobile);
    if (!user) {
      res.status(404).json({ error: 'No artist account found with this mobile number.' });
      return;
    }

    const { code } = createOtpChallenge(normalizeMobile(String(user.mobile)), 'login');
    res.json({
      sent: true,
      deliveryMode: process.env.SMS_WEBHOOK_URL ? 'sms' : 'preview',
      previewOtp: process.env.SMS_WEBHOOK_URL ? undefined : code,
      maskedMobile: String(user.mobile),
      message: process.env.SMS_WEBHOOK_URL
        ? '6-digit verification OTP sent to your registered mobile number.'
        : 'Preview OTP generated below (connect an SMS gateway for live mobile dispatch).',
    });
  });

  app.post('/api/auth/artist/otp/verify', (req: Request, res: Response) => {
    const mobile = typeof req.body?.mobile === 'string' ? normalizeMobile(req.body.mobile) : '';
    const otp = typeof req.body?.otp === 'string' ? req.body.otp.trim() : '';
    const ip = getClientIp(req);
    const ua = String(req.headers['user-agent'] || '');

    if (!mobile || !/^\d{6}$/.test(otp)) {
      res.status(400).json({ error: 'Mobile number and valid 6-digit OTP are required.' });
      return;
    }

    const user = findArtistByMobile(mobile) as Record<string, unknown> | undefined;
    if (!user) {
      recordLoginEvent({
        userId: null,
        role: 'artist',
        identifier: mobile,
        loginMethod: 'Mobile OTP',
        ipAddress: ip,
        userAgent: ua,
        status: 'Failed',
      });
      res.status(404).json({ error: 'Artist account not found.' });
      return;
    }

    const check = verifyOtpChallenge(normalizeMobile(String(user.mobile)), 'login', otp);
    if (!check.valid) {
      recordLoginEvent({
        userId: Number(user.id),
        role: 'artist',
        identifier: String(user.mobile),
        loginMethod: 'Mobile OTP',
        ipAddress: ip,
        userAgent: ua,
        status: 'Failed',
      });
      res.status(401).json({ error: check.error || 'OTP verification failed.' });
      return;
    }

    db.prepare('UPDATE users SET otp_verified = 1 WHERE id = ?').run(Number(user.id));

    recordLoginEvent({
      userId: Number(user.id),
      role: 'artist',
      identifier: String(user.mobile),
      loginMethod: 'Mobile OTP',
      ipAddress: ip,
      userAgent: ua,
      status: 'Success',
    });

    const token = signSessionToken({
      id: Number(user.id),
      role: 'artist',
      email: String(user.email),
      fullName: String(user.full_name),
    });

    const safeUser = db
      .prepare(
        `SELECT id, full_name, stage_name, country, mobile, email, role, avatar_url, payout_method, payout_details,
                verification_status, verification_doc_url, verification_notes, otp_verified, account_protected, bio, created_at
         FROM users WHERE id = ?`
      )
      .get(Number(user.id));

    res.json({ token, user: safeUser });
  });

  app.post('/api/auth/artist/forgot-password', (req: Request, res: Response) => {
    const identifier = typeof req.body?.identifier === 'string' ? req.body.identifier.trim() : '';
    if (!identifier) {
      res.status(400).json({ error: 'Enter your registered email or mobile number.' });
      return;
    }

    let user: Record<string, unknown> | undefined;
    if (identifier.includes('@')) {
      user = db
        .prepare("SELECT * FROM users WHERE email = ? AND role = 'artist'")
        .get(identifier.toLowerCase()) as Record<string, unknown> | undefined;
    } else {
      user = findArtistByMobile(identifier);
    }

    if (!user) {
      res.status(404).json({ error: 'No matching artist account found.' });
      return;
    }

    const challengeKey = String(user.email).toLowerCase();
    const { code } = createOtpChallenge(challengeKey, 'reset');

    res.json({
      sent: true,
      deliveryMode: process.env.SMS_WEBHOOK_URL ? 'gateway' : 'preview',
      previewOtp: process.env.SMS_WEBHOOK_URL ? undefined : code,
      message: process.env.SMS_WEBHOOK_URL
        ? 'Password reset OTP sent to your registered contact.'
        : 'Preview reset OTP generated below. Enter it with your new password.',
    });
  });

  app.post('/api/auth/artist/reset-password', (req: Request, res: Response) => {
    const identifier = typeof req.body?.identifier === 'string' ? req.body.identifier.trim() : '';
    const otp = typeof req.body?.otp === 'string' ? req.body.otp.trim() : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

    if (!identifier || !/^\d{6}$/.test(otp)) {
      res.status(400).json({ error: 'Account email/mobile and 6-digit reset OTP are required.' });
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      res.status(400).json({ error: 'New password must be between 8 and 128 characters.' });
      return;
    }

    const user = (
      identifier.includes('@')
        ? db.prepare("SELECT * FROM users WHERE email = ? AND role = 'artist'").get(identifier.toLowerCase())
        : findArtistByMobile(identifier)
    ) as Record<string, unknown> | undefined;

    if (!user) {
      res.status(404).json({ error: 'Artist account not found.' });
      return;
    }

    const check = verifyOtpChallenge(String(user.email).toLowerCase(), 'reset', otp);
    if (!check.valid) {
      res.status(401).json({ error: check.error || 'Invalid reset OTP.' });
      return;
    }

    const nextHash = hashPassword(newPassword);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(nextHash, Number(user.id));

    createNotification(
      Number(user.id),
      'Password Reset Completed',
      'Your artist account password was reset securely via OTP verification.',
      'security'
    );

    res.json({ reset: true, message: 'Password updated successfully. You can now sign in.' });
  });

  app.post('/api/auth/artist/change-password', requireArtist, (req: AuthenticatedRequest, res: Response) => {
    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

    if (!currentPassword || newPassword.length < 8 || newPassword.length > 128) {
      res.status(400).json({ error: 'Current password and a new password (min 8 chars) are required.' });
      return;
    }

    const row = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(req.user!.id) as
      | { id: number; password_hash: string }
      | undefined;

    if (!row || !verifyPassword(currentPassword, row.password_hash)) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }

    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), row.id);
    createNotification(
      row.id,
      'Account Password Updated',
      'Your ANGAD MUSIC DISTRIBUTOR password was changed from your Account Security console.',
      'security'
    );
    res.json({ updated: true });
  });

  // ========================
  // ARTIST VERIFICATION, SUB-ACCOUNTS & SECURITY
  // ========================
  app.post('/api/artist/verification', requireArtist, (req: AuthenticatedRequest, res: Response) => {
    const bio = typeof req.body?.bio === 'string' ? req.body.bio.trim().slice(0, 600) : '';
    const docUrlRaw = typeof req.body?.verificationDocUrl === 'string' ? req.body.verificationDocUrl.trim() : '';
    const docUrl = docUrlRaw.startsWith('/api/uploads/') ? docUrlRaw : '';
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 300) : '';

    if (!docUrl && !notes) {
      res.status(400).json({ error: 'Upload an ID/profile proof or include verification details.' });
      return;
    }

    db.prepare(
      `UPDATE users
       SET verification_status = 'Pending Verification',
           verification_doc_url = CASE WHEN ? != '' THEN ? ELSE verification_doc_url END,
           verification_notes = ?,
           bio = CASE WHEN ? != '' THEN ? ELSE bio END
       WHERE id = ?`
    ).run(docUrl, docUrl, notes, bio, bio, req.user!.id);

    createNotification(
      req.user!.id,
      'Verification Submitted',
      'Your Artist Profile Verification request is now Pending Verification by Palamu Entertainment Industry.',
      'security'
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

  app.post('/api/artist/security/otp-request', requireArtist, (req: AuthenticatedRequest, res: Response) => {
    const user = db.prepare('SELECT mobile FROM users WHERE id = ?').get(req.user!.id) as { mobile: string } | undefined;
    if (!user?.mobile) {
      res.status(400).json({ error: 'Add a mobile number to your profile first.' });
      return;
    }
    const { code } = createOtpChallenge(normalizeMobile(user.mobile), 'verify');
    res.json({
      sent: true,
      deliveryMode: process.env.SMS_WEBHOOK_URL ? 'sms' : 'preview',
      previewOtp: process.env.SMS_WEBHOOK_URL ? undefined : code,
    });
  });

  app.post('/api/artist/security/otp-confirm', requireArtist, (req: AuthenticatedRequest, res: Response) => {
    const otp = typeof req.body?.otp === 'string' ? req.body.otp.trim() : '';
    const user = db.prepare('SELECT mobile FROM users WHERE id = ?').get(req.user!.id) as { mobile: string } | undefined;
    if (!user?.mobile || !/^\d{6}$/.test(otp)) {
      res.status(400).json({ error: 'Valid 6-digit OTP is required.' });
      return;
    }
    const check = verifyOtpChallenge(normalizeMobile(user.mobile), 'verify', otp);
    if (!check.valid) {
      res.status(401).json({ error: check.error || 'OTP invalid.' });
      return;
    }
    db.prepare('UPDATE users SET otp_verified = 1, account_protected = 1 WHERE id = ?').run(req.user!.id);
    res.json({ verified: true });
  });

  app.get('/api/artist/security', requireArtist, (req: AuthenticatedRequest, res: Response) => {
    const history = db
      .prepare('SELECT * FROM login_history WHERE user_id = ? ORDER BY id DESC LIMIT 30')
      .all(req.user!.id);
    const user = db
      .prepare('SELECT otp_verified, account_protected, verification_status FROM users WHERE id = ?')
      .get(req.user!.id);
    res.json({ history, security: user });
  });

  app.patch('/api/artist/security', requireArtist, (req: AuthenticatedRequest, res: Response) => {
    const accountProtected = req.body?.accountProtected ? 1 : 0;
    db.prepare('UPDATE users SET account_protected = ? WHERE id = ?').run(accountProtected, req.user!.id);
    res.json({ account_protected: accountProtected });
  });

  app.get('/api/artist/sub-accounts', requireArtist, (req: AuthenticatedRequest, res: Response) => {
    const profiles = db
      .prepare('SELECT * FROM artist_profiles WHERE owner_user_id = ? ORDER BY id DESC')
      .all(req.user!.id);
    res.json({ profiles });
  });

  app.post('/api/artist/sub-accounts', requireArtist, (req: AuthenticatedRequest, res: Response) => {
    const artistName = typeof req.body?.artistName === 'string' ? req.body.artistName.trim().slice(0, 100) : '';
    const country = typeof req.body?.country === 'string' ? req.body.country.trim().slice(0, 60) : 'India';
    const genre = typeof req.body?.genre === 'string' ? req.body.genre.trim().slice(0, 60) : 'Bhojpuri';
    const bio = typeof req.body?.bio === 'string' ? req.body.bio.trim().slice(0, 500) : '';
    const instagramUrl = typeof req.body?.instagramUrl === 'string' ? req.body.instagramUrl.trim().slice(0, 240) : '';
    const spotifyUrl = typeof req.body?.spotifyUrl === 'string' ? req.body.spotifyUrl.trim().slice(0, 240) : '';
    const youtubeUrl = typeof req.body?.youtubeUrl === 'string' ? req.body.youtubeUrl.trim().slice(0, 240) : '';

    if (artistName.length < 2) {
      res.status(400).json({ error: 'Artist / Band Name must be at least 2 characters.' });
      return;
    }

    const result = db
      .prepare(
        `INSERT INTO artist_profiles
         (owner_user_id, artist_name, country, genre, bio, instagram_url, spotify_url, youtube_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(req.user!.id, artistName, country, genre, bio, instagramUrl, spotifyUrl, youtubeUrl);

    const profile = db.prepare('SELECT * FROM artist_profiles WHERE id = ?').get(Number(result.lastInsertRowid));
    res.status(201).json({ profile });
  });

  app.delete('/api/artist/sub-accounts/:id', requireArtist, (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id);
    const row = db
      .prepare('SELECT id, owner_user_id FROM artist_profiles WHERE id = ?')
      .get(id) as { id: number; owner_user_id: number } | undefined;
    if (!row || row.owner_user_id !== req.user!.id) {
      res.status(404).json({ error: 'Artist profile not found.' });
      return;
    }
    db.prepare('DELETE FROM artist_profiles WHERE id = ?').run(id);
    res.json({ deleted: true });
  });

  // ========================
  // ARTIST LABELS & DATABASE / SPOTIFY SEARCH
  // ========================
  app.get('/api/artist/labels', requireArtist, (req: AuthenticatedRequest, res: Response) => {
    const customLabels = db
      .prepare('SELECT * FROM artist_labels WHERE artist_id = ? ORDER BY created_at DESC')
      .all(req.user!.id);
    const releaseLabels = db
      .prepare("SELECT DISTINCT label_name FROM releases WHERE artist_id = ? AND label_name != ''")
      .all(req.user!.id) as Array<{ label_name: string }>;

    const mergedNames = Array.from(
      new Set([
        'Palamu Entertainment Industry',
        ...(customLabels as Array<{ label_name: string }>).map((l) => l.label_name),
        ...releaseLabels.map((l) => l.label_name),
      ])
    );
    res.json({ labels: customLabels, labelNames: mergedNames });
  });

  app.post('/api/artist/labels', requireArtist, (req: AuthenticatedRequest, res: Response) => {
    const labelName = typeof req.body?.labelName === 'string' ? req.body.labelName.trim().slice(0, 120) : '';
    if (labelName.length < 2) {
      res.status(400).json({ error: 'Label name must be at least 2 characters.' });
      return;
    }
    try {
      const result = db
        .prepare('INSERT INTO artist_labels (artist_id, label_name) VALUES (?, ?)')
        .run(req.user!.id, labelName);
      const label = db.prepare('SELECT * FROM artist_labels WHERE id = ?').get(Number(result.lastInsertRowid));
      res.status(201).json({ label, labelName });
    } catch {
      res.json({ labelName, alreadyExists: true });
    }
  });

  app.get('/api/artist/artist-search', requireArtist, async (req: AuthenticatedRequest, res: Response) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 200) : '';
    if (!query || query.length < 2) {
      res.json({ databaseResults: [], spotifyResults: [], spotifyConfigured: Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) });
      return;
    }

    const likePattern = `%${query}%`;
    const subRows = db
      .prepare(
        `SELECT id, artist_name AS name, country, genre, spotify_url
         FROM artist_profiles
         WHERE artist_name LIKE ?
         ORDER BY id DESC LIMIT 12`
      )
      .all(likePattern) as Array<{ id: number; name: string; country: string; genre: string; spotify_url: string }>;

    const relRows = db
      .prepare(
        `SELECT DISTINCT primary_artist AS name, genre
         FROM releases
         WHERE primary_artist LIKE ?
         LIMIT 12`
      )
      .all(likePattern) as Array<{ name: string; genre: string }>;

    const userRows = db
      .prepare(
        `SELECT id, COALESCE(NULLIF(stage_name, ''), full_name) AS name, country
         FROM users
         WHERE role = 'artist' AND (full_name LIKE ? OR stage_name LIKE ?)
         LIMIT 10`
      )
      .all(likePattern, likePattern) as Array<{ id: number; name: string; country: string }>;

    const seen = new Set<string>();
    const databaseResults: Array<{ name: string; source: string; detail: string; spotifyUrl: string }> = [];

    for (const r of subRows) {
      const key = r.name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        databaseResults.push({
          name: r.name,
          source: 'Artist Roster',
          detail: [r.genre, r.country].filter(Boolean).join(' · '),
          spotifyUrl: r.spotify_url || '',
        });
      }
    }
    for (const r of relRows) {
      const key = r.name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        databaseResults.push({
          name: r.name,
          source: 'Catalog Release',
          detail: r.genre || 'Catalog Artist',
          spotifyUrl: '',
        });
      }
    }
    for (const r of userRows) {
      const key = r.name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        databaseResults.push({
          name: r.name,
          source: 'Registered Account',
          detail: r.country || 'Artist Account',
          spotifyUrl: '',
        });
      }
    }

    const spotifyResults: Array<{ name: string; source: string; detail: string; spotifyUrl: string }> = [];
    const spotifyUrlMatch = /^https:\/\/open\.spotify\.com\/(intl-[a-z]+\/)?artist\/[a-zA-Z0-9]+/i.test(query);

    if (spotifyUrlMatch) {
      try {
        const oembedRes = await fetch(
          `https://open.spotify.com/oembed?url=${encodeURIComponent(query)}`
        );
        if (oembedRes.ok) {
          const data = (await oembedRes.json()) as { title?: string };
          if (data.title) {
            spotifyResults.push({
              name: data.title,
              source: 'Spotify Verified URL',
              detail: 'Linked via Spotify Artist URL',
              spotifyUrl: query,
            });
          }
        }
      } catch {
        // Ignore network errors cleanly
      }
    } else if (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
      try {
        const creds = Buffer.from(
          `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
        ).toString('base64');
        const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: {
            Authorization: `Basic ${creds}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'grant_type=client_credentials',
        });
        if (tokenRes.ok) {
          const tokenJson = (await tokenRes.json()) as { access_token?: string };
          if (tokenJson.access_token) {
            const searchRes = await fetch(
              `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=artist&limit=6`,
              { headers: { Authorization: `Bearer ${tokenJson.access_token}` } }
            );
            if (searchRes.ok) {
              const sJson = (await searchRes.json()) as {
                artists?: {
                  items?: Array<{
                    name: string;
                    genres?: string[];
                    external_urls?: { spotify?: string };
                  }>;
                };
              };
              for (const item of sJson.artists?.items || []) {
                spotifyResults.push({
                  name: item.name,
                  source: 'Spotify Web API',
                  detail: (item.genres || []).slice(0, 2).join(', ') || 'Spotify Artist Profile',
                  spotifyUrl: item.external_urls?.spotify || '',
                });
              }
            }
          }
        }
      } catch {
        // Ignore transient Spotify API errors cleanly
      }
    }

    res.json({
      databaseResults,
      spotifyResults,
      spotifyConfigured: Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
    });
  });

  // ========================
  // RELEASE UPDATE & TAKEDOWN REQUESTS
  // ========================
  app.get('/api/artist/release-requests', requireArtist, (req: AuthenticatedRequest, res: Response) => {
    const requests = db
      .prepare(
        `SELECT rcr.*, r.title AS release_title
         FROM release_change_requests rcr
         JOIN releases r ON r.id = rcr.release_id
         WHERE rcr.artist_id = ?
         ORDER BY rcr.created_at DESC`
      )
      .all(req.user!.id);
    res.json({ requests });
  });

  app.post('/api/artist/release-requests', requireArtist, (req: AuthenticatedRequest, res: Response) => {
    const releaseId = Number(req.body?.releaseId);
    const requestType = req.body?.requestType === 'Takedown' ? 'Takedown' : 'Update';
    const details = typeof req.body?.details === 'string' ? req.body.details.trim().slice(0, 1200) : '';
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 600) : '';

    const rel = db
      .prepare('SELECT id, artist_id, title FROM releases WHERE id = ?')
      .get(releaseId) as { id: number; artist_id: number; title: string } | undefined;

    if (!rel || rel.artist_id !== req.user!.id) {
      res.status(404).json({ error: 'Release not found.' });
      return;
    }
    if (!reason && !details) {
      res.status(400).json({ error: 'Provide details or reason for this release request.' });
      return;
    }

    const result = db
      .prepare(
        `INSERT INTO release_change_requests (release_id, artist_id, request_type, details, reason, status)
         VALUES (?, ?, ?, ?, ?, 'Pending')`
      )
      .run(releaseId, req.user!.id, requestType, details, reason);

    createNotification(
      req.user!.id,
      `Release ${requestType} Requested: ${rel.title}`,
      `Your ${requestType.toLowerCase()} request for "${rel.title}" was logged with Palamu Entertainment Industry.`,
      'release'
    );

    const created = db
      .prepare(
        `SELECT rcr.*, r.title AS release_title
         FROM release_change_requests rcr
         JOIN releases r ON r.id = rcr.release_id
         WHERE rcr.id = ?`
      )
      .get(Number(result.lastInsertRowid));
    res.status(201).json({ request: created });
  });

  // ========================
  // ARTIST SERVICES (PROMOTION, VIDEO DIST, BRANDING, COVER ART)
  // ========================
  const ALLOWED_SERVICES = [
    'Song Promotion',
    'YouTube Promotion',
    'Playlist Promotion',
    'Music Video Distribution',
    'Artist Branding',
    'Cover Design Service',
  ];

  app.get('/api/artist/services', requireArtist, (req: AuthenticatedRequest, res: Response) => {
    const services = db
      .prepare(
        `SELECT sr.*, r.title AS release_title
         FROM service_requests sr
         LEFT JOIN releases r ON r.id = sr.release_id
         WHERE sr.artist_id = ?
         ORDER BY sr.created_at DESC`
      )
      .all(req.user!.id);
    res.json({ services });
  });

  app.post('/api/artist/services', requireArtist, (req: AuthenticatedRequest, res: Response) => {
    const serviceType = typeof req.body?.serviceType === 'string' ? req.body.serviceType.trim() : '';
    const releaseId = req.body?.releaseId ? Number(req.body.releaseId) : null;
    const budgetNote = typeof req.body?.budgetNote === 'string' ? req.body.budgetNote.trim().slice(0, 120) : '';
    const targetLinks = typeof req.body?.targetLinks === 'string' ? req.body.targetLinks.trim().slice(0, 500) : '';
    const brief = typeof req.body?.brief === 'string' ? req.body.brief.trim().slice(0, 1500) : '';

    if (!ALLOWED_SERVICES.includes(serviceType)) {
      res.status(400).json({ error: 'Select a valid artist service.' });
      return;
    }
    if (brief.length < 10) {
      res.status(400).json({ error: 'Describe your campaign brief or requirements (min 10 characters).' });
      return;
    }

    if (releaseId) {
      const ownRel = db
        .prepare('SELECT id FROM releases WHERE id = ? AND artist_id = ?')
        .get(releaseId, req.user!.id);
      if (!ownRel) {
        res.status(404).json({ error: 'Selected release not found.' });
        return;
      }
    }

    const result = db
      .prepare(
        `INSERT INTO service_requests (artist_id, release_id, service_type, budget_note, target_links, brief, status)
         VALUES (?, ?, ?, ?, ?, ?, 'Submitted')`
      )
      .run(req.user!.id, releaseId, serviceType, budgetNote, targetLinks, brief);

    createNotification(
      req.user!.id,
      `Service Request Submitted: ${serviceType}`,
      `Your ${serviceType} request is queued for Palamu Entertainment Industry team review.`,
      'service'
    );

    const created = db
      .prepare(
        `SELECT sr.*, r.title AS release_title
         FROM service_requests sr
         LEFT JOIN releases r ON r.id = sr.release_id
         WHERE sr.id = ?`
      )
      .get(Number(result.lastInsertRowid));
    res.status(201).json({ service: created });
  });

  // ========================
  // SUPPORT TRACKING & REAL LIVE CHAT
  // ========================
  app.get('/api/support/track', (req: Request, res: Response) => {
    const ticketId = Number(req.query.ticketId);
    const email = typeof req.query.email === 'string' ? req.query.email.trim().toLowerCase() : '';
    if (!Number.isFinite(ticketId) || !email) {
      res.status(400).json({ error: 'Enter both Ticket # and Email address to track complaint status.' });
      return;
    }

    const ticket = db
      .prepare('SELECT * FROM support_tickets WHERE id = ? AND lower(email) = ?')
      .get(ticketId, email);
    if (!ticket) {
      res.status(404).json({ error: 'No matching ticket found for that ID and Email.' });
      return;
    }
    res.json({ ticket });
  });

  app.get('/api/support/chat', (req: Request, res: Response) => {
    const sessionUser = extractBearerUser(req);
    const sessionKeyQuery = typeof req.query.sessionKey === 'string' ? req.query.sessionKey.trim().slice(0, 80) : '';
    const sessionKey =
      sessionUser && sessionUser.role === 'artist' ? `artist-${sessionUser.id}` : sessionKeyQuery;

    if (!sessionKey || sessionKey.length < 6) {
      res.json({ messages: [] });
      return;
    }

    const messages = db
      .prepare('SELECT * FROM support_chat_messages WHERE session_key = ? ORDER BY id ASC LIMIT 100')
      .all(sessionKey);
    res.json({ messages, sessionKey });
  });

  app.post('/api/support/chat', (req: Request, res: Response) => {
    const sessionUser = extractBearerUser(req);
    const rawKey = typeof req.body?.sessionKey === 'string' ? req.body.sessionKey.trim().slice(0, 80) : '';
    const senderName =
      sessionUser?.role === 'artist'
        ? sessionUser.fullName
        : typeof req.body?.senderName === 'string' && req.body.senderName.trim()
          ? req.body.senderName.trim().slice(0, 80)
          : 'Guest Artist';
    const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 1200) : '';

    if (!message) {
      res.status(400).json({ error: 'Message cannot be empty.' });
      return;
    }

    const sessionKey =
      sessionUser && sessionUser.role === 'artist'
        ? `artist-${sessionUser.id}`
        : rawKey && rawKey.length >= 6
          ? rawKey
          : `guest-${crypto.randomUUID().slice(0, 12)}`;

    const resInsert = db
      .prepare(
        `INSERT INTO support_chat_messages (session_key, user_id, sender_role, sender_name, message)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        sessionKey,
        sessionUser?.role === 'artist' ? sessionUser.id : null,
        sessionUser?.role === 'artist' ? 'artist' : 'visitor',
        senderName,
        message
      );

    const created = db
      .prepare('SELECT * FROM support_chat_messages WHERE id = ?')
      .get(Number(resInsert.lastInsertRowid));
    res.status(201).json({ chatMessage: created, sessionKey });
  });

  // ========================
  // ADMIN EXTENDED CONTROLS
  // ========================
  app.patch('/api/admin/artists/:id/verification', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const artistId = Number(req.params.id);
    const status = String(req.body?.verificationStatus || '');
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 300) : '';
    if (!['Unverified', 'Pending Verification', 'Verified', 'Rejected'].includes(status)) {
      res.status(400).json({ error: 'Invalid verification status.' });
      return;
    }

    const artist = db.prepare("SELECT id, full_name FROM users WHERE id = ? AND role = 'artist'").get(artistId);
    if (!artist) {
      res.status(404).json({ error: 'Artist account not found.' });
      return;
    }

    db.prepare('UPDATE users SET verification_status = ?, verification_notes = ? WHERE id = ?').run(
      status,
      notes,
      artistId
    );

    db.prepare(
      `UPDATE artist_kyc
       SET kyc_status = ?,
           reviewer_notes = ?,
           reviewed_at = datetime('now'),
           updated_at = datetime('now')
       WHERE user_id = ?`
    ).run(status, notes, artistId);

    createNotification(
      artistId,
      `Profile Verification: ${status}`,
      notes ? `Artist verification updated to ${status}. Note: ${notes}` : `Your artist profile verification is now ${status}.`,
      'security'
    );

    res.json({ updated: true, verification_status: status });
  });

  app.get('/api/admin/platforms', requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
    const platforms = db.prepare('SELECT * FROM distribution_platforms ORDER BY id ASC').all();
    res.json({ platforms });
  });

  app.post('/api/admin/platforms', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 80) : '';
    const category = typeof req.body?.category === 'string' ? req.body.category.trim().slice(0, 50) : 'Partner Network';
    const partnerNotes = typeof req.body?.partnerNotes === 'string' ? req.body.partnerNotes.trim().slice(0, 200) : '';
    if (name.length < 2) {
      res.status(400).json({ error: 'Platform name must be at least 2 characters.' });
      return;
    }
    try {
      const result = db
        .prepare(
          `INSERT INTO distribution_platforms (name, category, is_enabled, partner_notes)
           VALUES (?, ?, 1, ?)`
        )
        .run(name, category, partnerNotes);
      const platform = db.prepare('SELECT * FROM distribution_platforms WHERE id = ?').get(Number(result.lastInsertRowid));
      res.status(201).json({ platform });
    } catch {
      res.status(409).json({ error: 'Platform with this name already exists.' });
    }
  });

  app.patch('/api/admin/platforms/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id);
    const isEnabled = req.body?.isEnabled ? 1 : 0;
    const partnerNotes = typeof req.body?.partnerNotes === 'string' ? req.body.partnerNotes.trim().slice(0, 200) : '';
    db.prepare(
      `UPDATE distribution_platforms SET is_enabled = ?, partner_notes = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(isEnabled, partnerNotes, id);
    res.json({ updated: true });
  });

  app.get('/api/admin/release-requests', requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
    const requests = db
      .prepare(
        `SELECT rcr.*, r.title AS release_title, u.full_name AS artist_name, u.email AS artist_email
         FROM release_change_requests rcr
         JOIN releases r ON r.id = rcr.release_id
         JOIN users u ON u.id = rcr.artist_id
         ORDER BY rcr.created_at DESC`
      )
      .all();
    res.json({ requests });
  });

  app.patch('/api/admin/release-requests/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id);
    const status = String(req.body?.status || '');
    const adminNotes = typeof req.body?.adminNotes === 'string' ? req.body.adminNotes.trim().slice(0, 500) : '';
    if (!['Pending', 'Approved', 'Completed', 'Rejected'].includes(status)) {
      res.status(400).json({ error: 'Invalid request status.' });
      return;
    }

    const row = db
      .prepare(
        `SELECT rcr.*, r.title AS release_title
         FROM release_change_requests rcr
         JOIN releases r ON r.id = rcr.release_id
         WHERE rcr.id = ?`
      )
      .get(id) as { id: number; artist_id: number; release_id: number; request_type: string; release_title: string } | undefined;

    if (!row) {
      res.status(404).json({ error: 'Request not found.' });
      return;
    }

    db.prepare(
      `UPDATE release_change_requests SET status = ?, admin_notes = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(status, adminNotes, id);

    if (row.request_type === 'Takedown' && status === 'Completed') {
      db.prepare("UPDATE release_platform_deliveries SET delivery_status = 'Takedown', updated_at = datetime('now') WHERE release_id = ?").run(
        row.release_id
      );
      db.prepare("UPDATE releases SET status = 'Rejected', admin_notes = ? WHERE id = ?").run(
        adminNotes || 'Taken down per approved artist takedown request.',
        row.release_id
      );
    }

    createNotification(
      row.artist_id,
      `${row.request_type} Request ${status}: ${row.release_title}`,
      adminNotes || `Your ${row.request_type.toLowerCase()} request for "${row.release_title}" is now ${status}.`,
      'release'
    );

    res.json({ updated: true });
  });

  app.get('/api/admin/services', requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
    const services = db
      .prepare(
        `SELECT sr.*, u.full_name AS artist_name, u.email AS artist_email, r.title AS release_title
         FROM service_requests sr
         JOIN users u ON u.id = sr.artist_id
         LEFT JOIN releases r ON r.id = sr.release_id
         ORDER BY sr.created_at DESC`
      )
      .all();
    res.json({ services });
  });

  app.patch('/api/admin/services/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id);
    const status = String(req.body?.status || '');
    const adminNotes = typeof req.body?.adminNotes === 'string' ? req.body.adminNotes.trim().slice(0, 500) : '';
    if (!['Submitted', 'In Review', 'Active', 'Completed', 'Declined'].includes(status)) {
      res.status(400).json({ error: 'Invalid service status.' });
      return;
    }

    const row = db
      .prepare('SELECT id, artist_id, service_type FROM service_requests WHERE id = ?')
      .get(id) as { id: number; artist_id: number; service_type: string } | undefined;
    if (!row) {
      res.status(404).json({ error: 'Service request not found.' });
      return;
    }

    db.prepare(
      `UPDATE service_requests SET status = ?, admin_notes = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(status, adminNotes, id);

    createNotification(
      row.artist_id,
      `Service ${status}: ${row.service_type}`,
      adminNotes || `Your ${row.service_type} request status updated to ${status}.`,
      'service'
    );
    res.json({ updated: true });
  });

  app.post('/api/admin/notifications/broadcast', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const targetArtistId = req.body?.artistId ? Number(req.body.artistId) : null;
    const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 140) : '';
    const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 500) : '';

    if (title.length < 3 || message.length < 5) {
      res.status(400).json({ error: 'Notification title and message are required.' });
      return;
    }

    let count = 0;
    if (targetArtistId) {
      createNotification(targetArtistId, title, message, 'release');
      count = 1;
    } else {
      const artists = db.prepare("SELECT id FROM users WHERE role = 'artist'").all() as Array<{ id: number }>;
      for (const a of artists) {
        createNotification(a.id, title, message, 'release');
        count += 1;
      }
    }

    res.json({ sentCount: count });
  });

  app.get('/api/admin/support/chat', requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
    const messages = db
      .prepare('SELECT * FROM support_chat_messages ORDER BY id DESC LIMIT 150')
      .all();
    res.json({ messages });
  });

  app.post('/api/admin/support/chat', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const sessionKey = typeof req.body?.sessionKey === 'string' ? req.body.sessionKey.trim() : '';
    const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 1200) : '';
    if (!sessionKey || !message) {
      res.status(400).json({ error: 'Session key and reply message are required.' });
      return;
    }

    const resInsert = db
      .prepare(
        `INSERT INTO support_chat_messages (session_key, user_id, sender_role, sender_name, message)
         VALUES (?, NULL, 'admin', 'Palamu Label Support', ?)`
      )
      .run(sessionKey, message);

    if (sessionKey.startsWith('artist-')) {
      const uid = Number(sessionKey.replace('artist-', ''));
      if (Number.isFinite(uid) && uid > 0) {
        createNotification(uid, 'Live Chat Reply from Label Support', message, 'support');
      }
    }

    const created = db
      .prepare('SELECT * FROM support_chat_messages WHERE id = ?')
      .get(Number(resInsert.lastInsertRowid));
    res.status(201).json({ chatMessage: created });
  });

  app.put('/api/admin/site-settings', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const allowedKeys = [
      'brand_tagline',
      'announcement_banner',
      'latest_update_text',
      'whatsapp_number',
      'support_phone',
      'support_email',
    ];
    const upsert = db.prepare(
      `INSERT INTO site_settings (key, value, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    );
    for (const k of allowedKeys) {
      if (typeof req.body?.[k] === 'string') {
        upsert.run(k, req.body[k].trim().slice(0, 300));
      }
    }
    res.json({ settings: getSiteSettings() });
  });

  app.get('/api/admin/security', requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
    const loginHistory = db.prepare('SELECT * FROM login_history ORDER BY id DESC LIMIT 60').all();
    const backups = db.prepare('SELECT * FROM system_backups ORDER BY id DESC LIMIT 20').all();
    res.json({ loginHistory, backups });
  });

  app.post('/api/admin/backups', requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
    const backup = createDatabaseBackup('Manual');
    res.status(201).json({ backup });
  });

  app.get('/api/admin/backups/:filename', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const safeName = path.basename(String(req.params.filename || ''));
    if (!safeName || !/^angad-db-backup-[a-zA-Z0-9._-]+\.db$/.test(safeName)) {
      res.status(400).json({ error: 'Invalid backup file name.' });
      return;
    }
    const resolved = path.resolve(backupsDir, safeName);
    if (!resolved.startsWith(backupsDir + path.sep) || !fs.existsSync(resolved)) {
      res.status(404).json({ error: 'Backup file not found.' });
      return;
    }
    res.download(resolved, safeName);
  });
}

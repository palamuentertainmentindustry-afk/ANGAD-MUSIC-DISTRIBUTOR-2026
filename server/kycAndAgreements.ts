import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Express, Response } from 'express';
import multer from 'multer';
import { generateSongAgreementPdfBuffer, type AgreementPdfData } from './agreementPdf.ts';
import { validateImageMagicBytes } from './audioInspector.ts';
import { requireAdmin, requireArtist, requireAuth, type AuthenticatedRequest } from './auth.ts';
import { createNotification, db, privateDocsDir } from './db.ts';

const keyFilePath = path.resolve(process.cwd(), 'data', '.kyc_master_key');

function getKycEncryptionKey(): Buffer {
  const envSecret = process.env.KYC_ENCRYPTION_KEY?.trim() || process.env.SESSION_SECRET?.trim();
  if (envSecret && envSecret.length >= 16) {
    return crypto.createHash('sha256').update(envSecret).digest();
  }
  try {
    if (fs.existsSync(keyFilePath)) {
      const hex = fs.readFileSync(keyFilePath, 'utf8').trim();
      if (/^[a-f0-9]{64}$/i.test(hex)) {
        return Buffer.from(hex, 'hex');
      }
    }
    const generated = crypto.randomBytes(32);
    fs.writeFileSync(keyFilePath, generated.toString('hex'), { mode: 0o600 });
    return generated;
  } catch {
    return crypto.createHash('sha256').update(process.cwd()).digest();
  }
}

const KYC_MASTER_KEY = getKycEncryptionKey();

function encryptSensitive(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KYC_MASTER_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptSensitive(payload: string): string {
  if (!payload) return '';
  if (!payload.startsWith('v1:')) return payload;
  try {
    const parts = payload.split(':');
    if (parts.length !== 4) return '';
    const iv = Buffer.from(parts[1], 'hex');
    const tag = Buffer.from(parts[2], 'hex');
    const encrypted = Buffer.from(parts[3], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', KYC_MASTER_KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

function maskAadhaar(digits: string): string {
  if (digits.length !== 12) return 'XXXX-XXXX-XXXX';
  return `XXXX-XXXX-${digits.slice(-4)}`;
}

function maskPan(pan: string): string {
  if (pan.length !== 10) return 'XXXXXXXXXX';
  return `${pan.slice(0, 2)}XXXXX${pan.slice(-3)}`;
}

function validatePdfMagicBytes(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(5);
    const bytesRead = fs.readSync(fd, buf, 0, 5, 0);
    fs.closeSync(fd);
    return bytesRead >= 4 && buf.toString('ascii', 0, 4) === '%PDF';
  } catch {
    return false;
  }
}

function validateKycDocumentFile(filePath: string): { valid: boolean; format?: string } {
  const img = validateImageMagicBytes(filePath);
  if (img.valid) return img;
  if (validatePdfMagicBytes(filePath)) return { valid: true, format: 'PDF' };
  return { valid: false };
}

function resolvePrivateDoc(filename: string): string | null {
  const safe = path.basename(String(filename || ''));
  if (!safe || !/^[a-zA-Z0-9._-]+$/.test(safe)) return null;
  const resolved = path.resolve(privateDocsDir, safe);
  if (!resolved.startsWith(privateDocsDir + path.sep)) return null;
  if (!fs.existsSync(resolved)) return null;
  return resolved;
}

const privateStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, privateDocsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    cb(null, `${crypto.randomUUID()}${ext || '.bin'}`);
  },
});

const kycDocUpload = multer({
  storage: privateStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedMime = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedMime.includes(file.mimetype) || ['.jpg', '.jpeg', '.png', '.webp', '.pdf'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, WEBP, or PDF KYC documents are accepted.'));
    }
  },
});

const signedPdfUpload = multer({
  storage: privateStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.mimetype === 'application/pdf' || ext === '.pdf') {
      cb(null, true);
    } else {
      cb(new Error('Signed agreement must be a valid PDF (.pdf) file.'));
    }
  },
});

function formatTodayDDMMYYYY(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function safeParseJsonObj(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function formatAgreementRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    agreement_code: String(row.agreement_code || ''),
    release_id: Number(row.release_id),
    track_id: Number(row.track_id),
    artist_id: Number(row.artist_id),
    artist_name: String(row.artist_name || ''),
    singer_name: String(row.singer_name || ''),
    song_title: String(row.song_title || ''),
    music_director: String(row.music_director || ''),
    lyricist: String(row.lyricist || ''),
    composer: String(row.composer || ''),
    label_name: String(row.label_name || 'Palamu Entertainment Industry'),
    release_details: safeParseJsonObj(row.release_details_json),
    agreement_date: String(row.agreement_date || ''),
    status: String(row.status || 'Pending'),
    sent_via: String(row.sent_via || ''),
    sent_at: String(row.sent_at || ''),
    has_signed_pdf: Boolean(row.signed_pdf_file),
    signed_pdf_original_name: String(row.signed_pdf_original_name || ''),
    signed_uploaded_at: String(row.signed_uploaded_at || ''),
    approved_at: String(row.approved_at || ''),
    admin_notes: String(row.admin_notes || ''),
    artist_mobile: row.artist_mobile ? String(row.artist_mobile) : undefined,
    artist_email: row.artist_email ? String(row.artist_email) : undefined,
    artist_verification_status: row.artist_verification_status ? String(row.artist_verification_status) : undefined,
    release_status: row.release_status ? String(row.release_status) : undefined,
    audio_quality_status: row.audio_quality_status ? String(row.audio_quality_status) : undefined,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  };
}

export function ensureSongAgreementForTrack(trackId: number, refreshSnapshot = false) {
  const track = db
    .prepare(
      `SELECT t.*, r.title AS rel_title, r.release_type, r.primary_artist, r.featured_artists,
              r.genre, r.subgenre, r.language, r.release_date, r.original_release_date,
              r.production_year, r.catalogue_number, r.upc, r.p_line, r.c_line, r.label_name,
              r.music_director AS rel_music_director, r.producer AS rel_producer,
              u.full_name AS account_full_name, u.stage_name AS account_stage_name
       FROM tracks t
       JOIN releases r ON r.id = t.release_id
       JOIN users u ON u.id = t.artist_id
       WHERE t.id = ?`
    )
    .get(trackId) as Record<string, unknown> | undefined;

  if (!track) return null;

  const year = new Date().getFullYear();
  const agreementCode = `AMD-AGR-${year}-${String(trackId).padStart(5, '0')}`;
  const artistName = String(track.account_stage_name || track.account_full_name || track.primary_artist || '').trim();
  const singerName = String(track.primary_artist || artistName).trim();
  const songTitle = String(track.title || track.rel_title || 'Untitled Song').trim();
  const musicDirector = String(track.music_director || track.rel_music_director || '').trim();
  const lyricist = String(track.author || track.lyricist || '').trim();
  const composer = String(track.composer || '').trim();
  const labelName = String(track.label_name || 'Palamu Entertainment Industry').trim();
  const releaseDetails = {
    releaseTitle: String(track.rel_title || songTitle),
    releaseType: String(track.release_type || 'Single'),
    genre: String(track.genre || ''),
    subgenre: String(track.subgenre || ''),
    language: String(track.vocal_language || track.language || ''),
    releaseDate: String(track.release_date || ''),
    originalReleaseDate: String(track.original_release_date || track.release_date || ''),
    productionYear: String(track.production_year || ''),
    catalogueNumber: String(track.catalogue_number || ''),
    upc: String(track.upc || ''),
    isrc: String(track.isrc || ''),
    pLine: String(track.p_line || ''),
    cLine: String(track.c_line || ''),
    producer: String(track.producer || track.rel_producer || ''),
    durationSeconds: Number(track.duration_seconds || 0),
    sampleRate: Number(track.audio_sample_rate || 0),
    bitDepth: Number(track.audio_bit_depth || 0),
    channels: Number(track.audio_channels || 0),
    audioQualityStatus: String(track.audio_quality_status || ''),
  };

  const existing = db.prepare('SELECT * FROM song_agreements WHERE track_id = ?').get(trackId) as
    | Record<string, unknown>
    | undefined;

  if (existing) {
    if (refreshSnapshot) {
      db.prepare(
        `UPDATE song_agreements
         SET artist_name = ?, singer_name = ?, song_title = ?, music_director = ?, lyricist = ?,
             composer = ?, label_name = ?, release_details_json = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        artistName,
        singerName,
        songTitle,
        musicDirector,
        lyricist,
        composer,
        labelName,
        JSON.stringify(releaseDetails),
        Number(existing.id)
      );
    }
    const refreshed = db.prepare('SELECT * FROM song_agreements WHERE id = ?').get(Number(existing.id)) as Record<
      string,
      unknown
    >;
    return formatAgreementRow(refreshed);
  }

  const today = formatTodayDDMMYYYY();
  const res = db
    .prepare(
      `INSERT INTO song_agreements (
         agreement_code, release_id, track_id, artist_id, artist_name, singer_name,
         song_title, music_director, lyricist, composer, label_name, release_details_json,
         agreement_date, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`
    )
    .run(
      agreementCode,
      Number(track.release_id),
      trackId,
      Number(track.artist_id),
      artistName,
      singerName,
      songTitle,
      musicDirector,
      lyricist,
      composer,
      labelName,
      JSON.stringify(releaseDetails),
      today
    );

  const created = db
    .prepare('SELECT * FROM song_agreements WHERE id = ?')
    .get(Number(res.lastInsertRowid)) as Record<string, unknown>;
  return formatAgreementRow(created);
}

export function registerKycAndAgreementRoutes(app: Express): void {
  // ========================
  // ARTIST PRIVATE KYC DOCUMENTS & SUBMISSION
  // ========================
  app.post('/api/upload/kyc-doc', requireArtist, (req: AuthenticatedRequest, res: Response) => {
    kycDocUpload.single('file')(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'KYC document upload failed.' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'Select a valid KYC document (JPG, PNG, WEBP, or PDF).' });
        return;
      }
      const check = validateKycDocumentFile(req.file.path);
      if (!check.valid) {
        fs.unlink(req.file.path, () => {});
        res.status(400).json({ error: 'Invalid file header. Only genuine JPG, PNG, WEBP, or PDF files are allowed.' });
        return;
      }
      res.json({
        privateFileKey: req.file.filename,
        originalName: req.file.originalname,
        format: check.format,
        size: req.file.size,
      });
    });
  });

  app.get('/api/artist/kyc', requireArtist, (req: AuthenticatedRequest, res: Response) => {
    const user = db
      .prepare('SELECT id, full_name, mobile, email, verification_status, verification_notes FROM users WHERE id = ?')
      .get(req.user!.id) as Record<string, unknown> | undefined;

    const kyc = db.prepare('SELECT * FROM artist_kyc WHERE user_id = ?').get(req.user!.id) as
      | Record<string, unknown>
      | undefined;

    if (!kyc) {
      res.json({
        kyc: {
          user_id: req.user!.id,
          legal_name: String(user?.full_name || ''),
          mobile: String(user?.mobile || ''),
          email: String(user?.email || ''),
          full_address: '',
          aadhaar_masked: '',
          pan_masked: '',
          has_aadhaar_front: false,
          has_aadhaar_back: false,
          has_pan_card: false,
          notes: String(user?.verification_notes || ''),
          consent_accepted: false,
          consent_timestamp: '',
          kyc_status: String(user?.verification_status || 'Unverified'),
          reviewer_notes: String(user?.verification_notes || ''),
          reviewed_at: '',
          updated_at: '',
        },
      });
      return;
    }

    res.json({
      kyc: {
        user_id: Number(kyc.user_id),
        legal_name: String(kyc.legal_name || ''),
        mobile: String(kyc.mobile || ''),
        email: String(kyc.email || ''),
        full_address: String(kyc.full_address || ''),
        aadhaar_masked: String(kyc.aadhaar_masked || ''),
        pan_masked: String(kyc.pan_masked || ''),
        has_aadhaar_front: Boolean(kyc.aadhaar_front_file),
        has_aadhaar_back: Boolean(kyc.aadhaar_back_file),
        has_pan_card: Boolean(kyc.pan_card_file),
        notes: String(kyc.notes || ''),
        consent_accepted: Boolean(kyc.consent_accepted),
        consent_timestamp: String(kyc.consent_timestamp || ''),
        kyc_status: String(user?.verification_status || kyc.kyc_status || 'Pending Verification'),
        reviewer_notes: String(kyc.reviewer_notes || user?.verification_notes || ''),
        reviewed_at: String(kyc.reviewed_at || ''),
        updated_at: String(kyc.updated_at || ''),
      },
    });
  });

  app.post('/api/artist/kyc', requireArtist, (req: AuthenticatedRequest, res: Response) => {
    const artistId = req.user!.id;
    const existing = db.prepare('SELECT * FROM artist_kyc WHERE user_id = ?').get(artistId) as
      | Record<string, unknown>
      | undefined;

    const legalName = typeof req.body?.legalName === 'string' ? req.body.legalName.trim().slice(0, 120) : '';
    const mobile = typeof req.body?.mobile === 'string' ? req.body.mobile.trim().slice(0, 25) : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 120) : '';
    const fullAddress = typeof req.body?.fullAddress === 'string' ? req.body.fullAddress.trim().slice(0, 400) : '';
    const rawAadhaar = typeof req.body?.aadhaarNumber === 'string' ? req.body.aadhaarNumber.replace(/[\s-]/g, '').trim() : '';
    const rawPan = typeof req.body?.panNumber === 'string' ? req.body.panNumber.toUpperCase().trim() : '';
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 300) : '';
    const bio = typeof req.body?.bio === 'string' ? req.body.bio.trim().slice(0, 600) : '';
    const consentAccepted = Boolean(req.body?.consentAccepted);

    const reqFront = typeof req.body?.aadhaarFrontFile === 'string' ? path.basename(req.body.aadhaarFrontFile.trim()) : '';
    const reqBack = typeof req.body?.aadhaarBackFile === 'string' ? path.basename(req.body.aadhaarBackFile.trim()) : '';
    const reqPanFile = typeof req.body?.panCardFile === 'string' ? path.basename(req.body.panCardFile.trim()) : '';

    if (!consentAccepted) {
      res.status(400).json({ error: 'Explicit privacy consent is required to collect and store Aadhaar & PAN KYC details.' });
      return;
    }
    if (legalName.length < 2 || mobile.length < 7 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Valid legal artist name, mobile number, and email address are required.' });
      return;
    }
    if (fullAddress.length < 10) {
      res.status(400).json({ error: 'Enter your complete residential address (minimum 10 characters).' });
      return;
    }

    let aadhaarEncrypted = String(existing?.aadhaar_encrypted || '');
    let aadhaarMasked = String(existing?.aadhaar_masked || '');
    if (rawAadhaar) {
      if (!/^\d{12}$/.test(rawAadhaar)) {
        res.status(400).json({ error: 'Aadhaar number must be exactly 12 digits.' });
        return;
      }
      aadhaarEncrypted = encryptSensitive(rawAadhaar);
      aadhaarMasked = maskAadhaar(rawAadhaar);
    } else if (!aadhaarEncrypted) {
      res.status(400).json({ error: '12-digit Aadhaar number is required.' });
      return;
    }

    let panEncrypted = String(existing?.pan_encrypted || '');
    let panMasked = String(existing?.pan_masked || '');
    if (rawPan) {
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(rawPan)) {
        res.status(400).json({ error: 'PAN card number must match valid format (e.g. ABCDE1234F).' });
        return;
      }
      panEncrypted = encryptSensitive(rawPan);
      panMasked = maskPan(rawPan);
    } else if (!panEncrypted) {
      res.status(400).json({ error: '10-character PAN card number is required.' });
      return;
    }

    const frontFile = reqFront && resolvePrivateDoc(reqFront) ? reqFront : String(existing?.aadhaar_front_file || '');
    const backFile = reqBack && resolvePrivateDoc(reqBack) ? reqBack : String(existing?.aadhaar_back_file || '');
    const panFile = reqPanFile && resolvePrivateDoc(reqPanFile) ? reqPanFile : String(existing?.pan_card_file || '');

    if (!frontFile || !panFile) {
      res.status(400).json({ error: 'Upload both Aadhaar Front document and PAN Card document.' });
      return;
    }

    const consentTs = String(existing?.consent_timestamp || '') || new Date().toISOString();

    db.prepare(
      `INSERT INTO artist_kyc (
         user_id, legal_name, mobile, email, full_address,
         aadhaar_masked, aadhaar_encrypted, pan_masked, pan_encrypted,
         aadhaar_front_file, aadhaar_back_file, pan_card_file,
         notes, consent_accepted, consent_timestamp, kyc_status, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'Pending Verification', datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         legal_name = excluded.legal_name,
         mobile = excluded.mobile,
         email = excluded.email,
         full_address = excluded.full_address,
         aadhaar_masked = excluded.aadhaar_masked,
         aadhaar_encrypted = excluded.aadhaar_encrypted,
         pan_masked = excluded.pan_masked,
         pan_encrypted = excluded.pan_encrypted,
         aadhaar_front_file = excluded.aadhaar_front_file,
         aadhaar_back_file = excluded.aadhaar_back_file,
         pan_card_file = excluded.pan_card_file,
         notes = excluded.notes,
         consent_accepted = 1,
         consent_timestamp = COALESCE(NULLIF(artist_kyc.consent_timestamp, ''), excluded.consent_timestamp),
         kyc_status = 'Pending Verification',
         updated_at = datetime('now')`
    ).run(
      artistId,
      legalName,
      mobile,
      email,
      fullAddress,
      aadhaarMasked,
      aadhaarEncrypted,
      panMasked,
      panEncrypted,
      frontFile,
      backFile,
      panFile,
      notes,
      consentTs
    );

    db.prepare(
      `UPDATE users
       SET verification_status = 'Pending Verification',
           verification_notes = ?,
           bio = CASE WHEN ? != '' THEN ? ELSE bio END
       WHERE id = ?`
    ).run(notes, bio, bio, artistId);

    createNotification(
      artistId,
      'KYC Identity Verification Submitted',
      'Your Aadhaar & PAN KYC verification documents were securely encrypted and queued for Admin review.',
      'security'
    );

    const saved = db.prepare('SELECT * FROM artist_kyc WHERE user_id = ?').get(artistId) as Record<string, unknown>;
    res.json({
      kyc: {
        user_id: artistId,
        legal_name: String(saved.legal_name),
        mobile: String(saved.mobile),
        email: String(saved.email),
        full_address: String(saved.full_address),
        aadhaar_masked: String(saved.aadhaar_masked),
        pan_masked: String(saved.pan_masked),
        has_aadhaar_front: Boolean(saved.aadhaar_front_file),
        has_aadhaar_back: Boolean(saved.aadhaar_back_file),
        has_pan_card: Boolean(saved.pan_card_file),
        notes: String(saved.notes || ''),
        consent_accepted: true,
        consent_timestamp: String(saved.consent_timestamp),
        kyc_status: 'Pending Verification',
        reviewer_notes: String(saved.reviewer_notes || ''),
        reviewed_at: String(saved.reviewed_at || ''),
        updated_at: String(saved.updated_at || ''),
      },
    });
  });

  app.get('/api/private-docs/kyc/:artistId/:slot', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const artistId = Number(req.params.artistId);
    const slot = String(req.params.slot || '');
    if (!Number.isFinite(artistId) || !['aadhaar_front', 'aadhaar_back', 'pan_card'].includes(slot)) {
      res.status(400).json({ error: 'Invalid document request.' });
      return;
    }
    if (req.user!.role !== 'admin' && req.user!.id !== artistId) {
      res.status(403).json({ error: 'Private KYC documents are protected and inaccessible.' });
      return;
    }

    const row = db
      .prepare('SELECT aadhaar_front_file, aadhaar_back_file, pan_card_file FROM artist_kyc WHERE user_id = ?')
      .get(artistId) as Record<string, string> | undefined;

    const col =
      slot === 'aadhaar_front'
        ? 'aadhaar_front_file'
        : slot === 'aadhaar_back'
          ? 'aadhaar_back_file'
          : 'pan_card_file';

    const resolved = row?.[col] ? resolvePrivateDoc(row[col]) : null;
    if (!resolved) {
      res.status(404).json({ error: 'KYC document not found.' });
      return;
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(resolved);
  });

  app.get('/api/admin/kyc/:artistId', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const artistId = Number(req.params.artistId);
    const user = db
      .prepare(
        `SELECT id, full_name, mobile, email, verification_status, verification_doc_url, verification_notes
         FROM users WHERE id = ? AND role = 'artist'`
      )
      .get(artistId) as Record<string, unknown> | undefined;

    if (!user) {
      res.status(404).json({ error: 'Artist account not found.' });
      return;
    }

    const kyc = db.prepare('SELECT * FROM artist_kyc WHERE user_id = ?').get(artistId) as
      | Record<string, unknown>
      | undefined;

    if (!kyc) {
      res.json({
        kyc: {
          user_id: artistId,
          legal_name: String(user.full_name || ''),
          mobile: String(user.mobile || ''),
          email: String(user.email || ''),
          full_address: '',
          aadhaar_masked: '',
          aadhaar_number: '',
          pan_masked: '',
          pan_number: '',
          has_aadhaar_front: false,
          has_aadhaar_back: false,
          has_pan_card: false,
          notes: String(user.verification_notes || ''),
          consent_accepted: false,
          consent_timestamp: '',
          kyc_status: String(user.verification_status || 'Unverified'),
          reviewer_notes: String(user.verification_notes || ''),
          reviewed_at: '',
          updated_at: '',
          legacy_doc_url: String(user.verification_doc_url || ''),
        },
      });
      return;
    }

    res.json({
      kyc: {
        user_id: artistId,
        legal_name: String(kyc.legal_name || ''),
        mobile: String(kyc.mobile || ''),
        email: String(kyc.email || ''),
        full_address: String(kyc.full_address || ''),
        aadhaar_masked: String(kyc.aadhaar_masked || ''),
        aadhaar_number: decryptSensitive(String(kyc.aadhaar_encrypted || '')),
        pan_masked: String(kyc.pan_masked || ''),
        pan_number: decryptSensitive(String(kyc.pan_encrypted || '')),
        has_aadhaar_front: Boolean(kyc.aadhaar_front_file),
        has_aadhaar_back: Boolean(kyc.aadhaar_back_file),
        has_pan_card: Boolean(kyc.pan_card_file),
        notes: String(kyc.notes || ''),
        consent_accepted: Boolean(kyc.consent_accepted),
        consent_timestamp: String(kyc.consent_timestamp || ''),
        kyc_status: String(user.verification_status || kyc.kyc_status || 'Pending Verification'),
        reviewer_notes: String(kyc.reviewer_notes || user.verification_notes || ''),
        reviewed_at: String(kyc.reviewed_at || ''),
        updated_at: String(kyc.updated_at || ''),
        legacy_doc_url: String(user.verification_doc_url || ''),
      },
    });
  });

  // ========================
  // SINGLE SONG AGREEMENT PDF SYSTEM
  // ========================
  app.get('/api/artist/agreements', requireArtist, (req: AuthenticatedRequest, res: Response) => {
    // Ensure any existing tracks uploaded by this artist have an agreement record
    const missingTracks = db
      .prepare(
        `SELECT t.id FROM tracks t
         LEFT JOIN song_agreements sa ON sa.track_id = t.id
         WHERE t.artist_id = ? AND sa.id IS NULL`
      )
      .all(req.user!.id) as Array<{ id: number }>;
    for (const mt of missingTracks) {
      ensureSongAgreementForTrack(mt.id, false);
    }

    const rows = db
      .prepare(
        `SELECT sa.*, r.status AS release_status, t.audio_quality_status
         FROM song_agreements sa
         JOIN releases r ON r.id = sa.release_id
         JOIN tracks t ON t.id = sa.track_id
         WHERE sa.artist_id = ?
         ORDER BY sa.id DESC`
      )
      .all(req.user!.id) as Array<Record<string, unknown>>;

    res.json({ agreements: rows.map(formatAgreementRow) });
  });

  app.get('/api/admin/agreements', requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
    const missingTracks = db
      .prepare(
        `SELECT t.id FROM tracks t
         LEFT JOIN song_agreements sa ON sa.track_id = t.id
         WHERE sa.id IS NULL`
      )
      .all() as Array<{ id: number }>;
    for (const mt of missingTracks) {
      ensureSongAgreementForTrack(mt.id, false);
    }

    const rows = db
      .prepare(
        `SELECT sa.*, u.mobile AS artist_mobile, u.email AS artist_email, u.verification_status AS artist_verification_status,
                r.status AS release_status, t.audio_quality_status
         FROM song_agreements sa
         JOIN users u ON u.id = sa.artist_id
         JOIN releases r ON r.id = sa.release_id
         JOIN tracks t ON t.id = sa.track_id
         ORDER BY sa.id DESC`
      )
      .all() as Array<Record<string, unknown>>;

    res.json({ agreements: rows.map(formatAgreementRow) });
  });

  app.post('/api/admin/agreements/generate/:trackId', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const trackId = Number(req.params.trackId);
    const agreement = ensureSongAgreementForTrack(trackId, true);
    if (!agreement) {
      res.status(404).json({ error: 'Track not found.' });
      return;
    }
    res.json({ agreement });
  });

  app.get('/api/agreements/:id/pdf', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const agreementId = Number(req.params.id);
    const row = db
      .prepare(
        `SELECT sa.*, u.mobile AS artist_mobile, u.email AS artist_email
         FROM song_agreements sa
         JOIN users u ON u.id = sa.artist_id
         WHERE sa.id = ?`
      )
      .get(agreementId) as Record<string, unknown> | undefined;

    if (!row) {
      res.status(404).json({ error: 'Agreement not found.' });
      return;
    }
    if (req.user!.role !== 'admin' && req.user!.id !== Number(row.artist_id)) {
      res.status(403).json({ error: 'You do not have permission to download this agreement.' });
      return;
    }

    // Refresh latest snapshot fields before rendering PDF so UPC/ISRC/QA status stay up-to-date
    const fresh = ensureSongAgreementForTrack(Number(row.track_id), true);
    const source = fresh || formatAgreementRow(row);

    const pdfData: AgreementPdfData = {
      agreementCode: source.agreement_code,
      agreementDate: source.agreement_date || formatTodayDDMMYYYY(),
      status: source.status,
      artistName: source.artist_name,
      artistEmail: row.artist_email ? String(row.artist_email) : '',
      artistMobile: row.artist_mobile ? String(row.artist_mobile) : '',
      singerName: source.singer_name,
      songTitle: source.song_title,
      musicDirector: source.music_director,
      lyricist: source.lyricist,
      composer: source.composer,
      labelName: source.label_name,
      releaseDetails: source.release_details as AgreementPdfData['releaseDetails'],
    };

    try {
      const buffer = await generateSongAgreementPdfBuffer(pdfData);
      const safeTitle = source.song_title.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 48) || 'Song';
      const fileName = `${source.agreement_code}_${safeTitle}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Cache-Control', 'no-store, private');
      res.send(buffer);
    } catch {
      res.status(500).json({ error: 'Failed to render Song Agreement PDF.' });
    }
  });

  app.patch('/api/admin/agreements/:id/status', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const agreementId = Number(req.params.id);
    const status = String(req.body?.status || '');
    const sentVia = typeof req.body?.sentVia === 'string' ? req.body.sentVia.trim().slice(0, 40) : '';
    const adminNotes = typeof req.body?.adminNotes === 'string' ? req.body.adminNotes.trim().slice(0, 400) : '';

    if (!['Pending', 'Sent', 'Signed', 'Approved'].includes(status)) {
      res.status(400).json({ error: 'Invalid agreement status.' });
      return;
    }

    const existing = db.prepare('SELECT * FROM song_agreements WHERE id = ?').get(agreementId) as
      | Record<string, unknown>
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Agreement not found.' });
      return;
    }

    const nextSentVia = sentVia || String(existing.sent_via || '');
    db.prepare(
      `UPDATE song_agreements
       SET status = ?,
           sent_via = ?,
           sent_at = CASE WHEN ? = 'Sent' THEN COALESCE(NULLIF(sent_at, ''), datetime('now')) ELSE sent_at END,
           approved_at = CASE WHEN ? = 'Approved' THEN datetime('now') ELSE approved_at END,
           admin_notes = CASE WHEN ? != '' THEN ? ELSE admin_notes END,
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(status, nextSentVia, status, status, adminNotes, adminNotes, agreementId);

    if (status === 'Sent' || status === 'Approved') {
      createNotification(
        Number(existing.artist_id),
        `Song Agreement ${status}: ${String(existing.song_title)}`,
        status === 'Sent'
          ? `Agreement ${String(existing.agreement_code)} was sent via ${nextSentVia || 'Label Desk'} for your signature. Download, sign, and upload the signed PDF under My Releases.`
          : `Signed Song Agreement ${String(existing.agreement_code)} for "${String(existing.song_title)}" is now Approved.`,
        'release'
      );
    }

    const updated = db
      .prepare(
        `SELECT sa.*, u.mobile AS artist_mobile, u.email AS artist_email, u.verification_status AS artist_verification_status,
                r.status AS release_status, t.audio_quality_status
         FROM song_agreements sa
         JOIN users u ON u.id = sa.artist_id
         JOIN releases r ON r.id = sa.release_id
         JOIN tracks t ON t.id = sa.track_id
         WHERE sa.id = ?`
      )
      .get(agreementId) as Record<string, unknown>;

    res.json({ agreement: formatAgreementRow(updated) });
  });

  app.post('/api/agreements/:id/signed-pdf', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const agreementId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM song_agreements WHERE id = ?').get(agreementId) as
      | Record<string, unknown>
      | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Agreement not found.' });
      return;
    }
    if (req.user!.role !== 'admin' && req.user!.id !== Number(existing.artist_id)) {
      res.status(403).json({ error: 'You do not have permission to upload signed files for this agreement.' });
      return;
    }

    signedPdfUpload.single('file')(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Signed PDF upload failed.' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'Select a signed PDF file (.pdf).' });
        return;
      }
      if (!validatePdfMagicBytes(req.file.path)) {
        fs.unlink(req.file.path, () => {});
        res.status(400).json({ error: 'Invalid PDF header. Upload a genuine signed .pdf document.' });
        return;
      }

      const nextStatus = existing.status === 'Approved' ? 'Approved' : 'Signed';
      db.prepare(
        `UPDATE song_agreements
         SET signed_pdf_file = ?,
             signed_pdf_original_name = ?,
             signed_uploaded_at = datetime('now'),
             status = ?,
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(req.file.filename, req.file.originalname.slice(0, 160), nextStatus, agreementId);

      createNotification(
        Number(existing.artist_id),
        `Signed Agreement Received: ${String(existing.song_title)}`,
        `Signed PDF uploaded for ${String(existing.agreement_code)}. Status is now ${nextStatus}.`,
        'release'
      );

      const updated = db
        .prepare(
          `SELECT sa.*, r.status AS release_status, t.audio_quality_status
           FROM song_agreements sa
           JOIN releases r ON r.id = sa.release_id
           JOIN tracks t ON t.id = sa.track_id
           WHERE sa.id = ?`
        )
        .get(agreementId) as Record<string, unknown>;

      res.json({ agreement: formatAgreementRow(updated) });
    });
  });

  app.get('/api/agreements/:id/signed-pdf', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const agreementId = Number(req.params.id);
    const row = db
      .prepare('SELECT id, artist_id, agreement_code, signed_pdf_file, signed_pdf_original_name FROM song_agreements WHERE id = ?')
      .get(agreementId) as Record<string, unknown> | undefined;

    if (!row) {
      res.status(404).json({ error: 'Agreement not found.' });
      return;
    }
    if (req.user!.role !== 'admin' && req.user!.id !== Number(row.artist_id)) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }

    const resolved = row.signed_pdf_file ? resolvePrivateDoc(String(row.signed_pdf_file)) : null;
    if (!resolved) {
      res.status(404).json({ error: 'Signed PDF not uploaded yet.' });
      return;
    }

    const downloadName =
      String(row.signed_pdf_original_name || `${String(row.agreement_code)}-Signed.pdf`).replace(/["\r\n]/g, '');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Cache-Control', 'no-store, private');
    res.sendFile(resolved);
  });
}

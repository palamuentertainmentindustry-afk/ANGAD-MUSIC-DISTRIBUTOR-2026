import fs from 'node:fs';
import path from 'node:path';

export interface AudioInspectionResult {
  valid: boolean;
  error?: string;
  formatLabel: string;
  mimeType: string;
  sampleRate: number;
  bitDepth: number;
  channels: number;
  durationSeconds: number;
  qualityStatus: 'Studio Master Passed' | 'Approved Compressed' | 'Quality Warning';
  qualityNotes: string;
}

export function validateImageMagicBytes(filePath: string): { valid: boolean; format?: string } {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(12);
    const bytesRead = fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    if (bytesRead < 4) return { valid: false };

    // JPEG: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return { valid: true, format: 'JPEG' };
    }
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return { valid: true, format: 'PNG' };
    }
    // WEBP: RIFF....WEBP
    if (
      bytesRead >= 12 &&
      buf.toString('ascii', 0, 4) === 'RIFF' &&
      buf.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return { valid: true, format: 'WEBP' };
    }
    return { valid: false };
  } catch {
    return { valid: false };
  }
}

export function inspectAudioFile(
  filePath: string,
  originalName: string,
  mimeType: string,
  sizeBytes: number
): AudioInspectionResult {
  const ext = path.extname(originalName).toLowerCase();
  const fail = (error: string): AudioInspectionResult => ({
    valid: false,
    error,
    formatLabel: 'Invalid',
    mimeType,
    sampleRate: 0,
    bitDepth: 0,
    channels: 0,
    durationSeconds: 0,
    qualityStatus: 'Quality Warning',
    qualityNotes: error,
  });

  if (ext !== '.wav') {
    return fail('Audio Format must be WAV only (.wav). Other formats such as MP3/FLAC/M4A are not accepted.');
  }

  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(12);
    const headerRead = fs.readSync(fd, header, 0, 12, 0);
    if (
      headerRead < 12 ||
      header.toString('ascii', 0, 4) !== 'RIFF' ||
      header.toString('ascii', 8, 12) !== 'WAVE'
    ) {
      return fail('Invalid WAV binary header. Upload a genuine uncompressed Stereo WAV (.wav) file.');
    }

    let offset = 12;
    let audioFormat = 0;
    let channels = 0;
    let sampleRate = 0;
    let byteRate = 0;
    let bitDepth = 0;
    let dataSize = 0;
    const chunkHeader = Buffer.alloc(8);

    // Walk RIFF subchunks cleanly across the entire file without reading audio PCM payload into memory
    while (offset + 8 <= sizeBytes) {
      const read = fs.readSync(fd, chunkHeader, 0, 8, offset);
      if (read < 8) break;
      const chunkId = chunkHeader.toString('ascii', 0, 4);
      const chunkSize = chunkHeader.readUInt32LE(4);

      if (chunkId === 'fmt ' && chunkSize >= 16) {
        const fmtLen = Math.min(chunkSize, 40);
        const fmtBuf = Buffer.alloc(fmtLen);
        fs.readSync(fd, fmtBuf, 0, fmtLen, offset + 8);
        audioFormat = fmtBuf.readUInt16LE(0);
        channels = fmtBuf.readUInt16LE(2);
        sampleRate = fmtBuf.readUInt32LE(4);
        byteRate = fmtBuf.readUInt32LE(8);
        bitDepth = fmtBuf.readUInt16LE(14);
        // Handle WAVE_FORMAT_EXTENSIBLE (0xFFFE) validBitsPerSample if present
        if (audioFormat === 0xfffe && fmtLen >= 20) {
          const validBits = fmtBuf.readUInt16LE(18);
          if (validBits > 0) bitDepth = validBits;
        }
      } else if (chunkId === 'data') {
        dataSize = chunkSize;
        if (channels > 0 && sampleRate > 0) {
          break;
        }
      }

      const paddedChunk = chunkSize + (chunkSize % 2);
      if (paddedChunk <= 0 && chunkId !== 'data') break;
      offset += 8 + paddedChunk;
    }

    if (sampleRate === 0 || channels === 0 || bitDepth === 0) {
      return fail('WAV format metadata chunk is missing or corrupted.');
    }

    if (channels !== 2) {
      return fail(
        `Stereo WAV audio is required (2 channels). Uploaded file has ${channels} channel${channels === 1 ? '' : 's'}.`
      );
    }

    if (sampleRate < 44100) {
      return fail(
        `Sample Rate must be at least 44.1 kHz (44,100 Hz). Uploaded file is ${(sampleRate / 1000).toFixed(1)} kHz.`
      );
    }

    if (bitDepth < 16 || bitDepth > 24) {
      return fail(
        `Bit Depth must be between 16-bit and 24-bit. Uploaded file is ${bitDepth}-bit.`
      );
    }

    const effectiveByteRate = byteRate > 0 ? byteRate : sampleRate * channels * (bitDepth / 8);
    const effectiveDataBytes = dataSize > 0 ? dataSize : Math.max(0, sizeBytes - 44);
    const exactDuration = effectiveByteRate > 0 ? effectiveDataBytes / effectiveByteRate : 0;
    const durationSeconds = Math.round(exactDuration);

    if (exactDuration < 59.5) {
      return fail(
        `Minimum audio duration is 60 seconds (1 minute). Uploaded track is ${durationSeconds} seconds.`
      );
    }

    if (exactDuration > 360.5) {
      return fail(
        `Maximum audio duration is 6 minutes (360 seconds). Uploaded track is ${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s.`
      );
    }

    const srLabel = `${(sampleRate / 1000).toFixed(1).replace(/\.0$/, '')} kHz`;
    const mins = Math.floor(durationSeconds / 60);
    const secs = String(durationSeconds % 60).padStart(2, '0');
    const qualityNotes = `WAV · ${srLabel} · ${bitDepth}-bit · Stereo · ${mins}:${secs} · Studio Master Passed`;

    return {
      valid: true,
      formatLabel: 'WAV (Stereo PCM)',
      mimeType: mimeType || 'audio/wav',
      sampleRate,
      bitDepth,
      channels,
      durationSeconds,
      qualityStatus: 'Studio Master Passed',
      qualityNotes,
    };
  } catch {
    return fail('Unable to inspect uploaded WAV file.');
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore
      }
    }
  }
}

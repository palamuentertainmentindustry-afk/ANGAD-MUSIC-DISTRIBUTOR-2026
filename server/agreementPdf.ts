import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';

export interface AgreementPdfData {
  agreementCode: string;
  agreementDate: string; // DD/MM/YYYY
  status: string;
  artistName: string;
  artistEmail?: string;
  artistMobile?: string;
  singerName: string;
  songTitle: string;
  musicDirector: string;
  lyricist: string;
  composer: string;
  labelName: string;
  releaseDetails: {
    releaseTitle?: string;
    releaseType?: string;
    genre?: string;
    subgenre?: string;
    language?: string;
    releaseDate?: string;
    originalReleaseDate?: string;
    productionYear?: string;
    catalogueNumber?: string;
    upc?: string;
    isrc?: string;
    pLine?: string;
    cLine?: string;
    producer?: string;
    durationSeconds?: number;
    sampleRate?: number;
    bitDepth?: number;
    channels?: number;
    audioQualityStatus?: string;
  };
}

function formatDurationMMSS(secs?: number): string {
  const s = Number(secs || 0);
  if (!Number.isFinite(s) || s <= 0) return 'N/A';
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}:${String(rem).padStart(2, '0')} (${s}s)`;
}

function formatDateDisplay(isoOrDmy?: string): string {
  if (!isoOrDmy) return 'N/A';
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoOrDmy);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return isoOrDmy;
}

export function generateSongAgreementPdfBuffer(data: AgreementPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 42,
      info: {
        Title: `Single Song Distribution Agreement - ${data.songTitle} (${data.agreementCode})`,
        Author: 'ANGAD MUSIC DISTRIBUTOR - PALAMU ENTERTAINMENT INDUSTRY',
        Subject: `Song Agreement ${data.agreementCode}`,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - 84;
    const leftX = 42;

    // Header Banner
    doc
      .rect(leftX, 36, pageWidth, 82)
      .fillColor('#0F0F12')
      .fill();
    doc
      .rect(leftX, 36, pageWidth, 82)
      .lineWidth(1.5)
      .strokeColor('#D4AF37')
      .stroke();

    const logoPath = path.resolve(process.cwd(), 'public/assets/aistudio/20261126_143846_7ca479ff.jpg');
    if (fs.existsSync(logoPath)) {
      try {
        doc.image(logoPath, leftX + 12, 45, { fit: [64, 64] });
      } catch {
        // Ignore logo decode fallback gracefully
      }
    }

    const titleX = leftX + 88;
    doc
      .fillColor('#E5C158')
      .font('Helvetica-Bold')
      .fontSize(15)
      .text('ANGAD MUSIC DISTRIBUTOR', titleX, 48, { width: pageWidth - 220 });
    doc
      .fillColor('#F4F4F5')
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .text('PALAMU ENTERTAINMENT INDUSTRY', titleX, 68, { width: pageWidth - 220 });
    doc
      .fillColor('#A1A1AA')
      .font('Helvetica')
      .fontSize(8)
      .text('Support: +91 9939149838  |  palamuentertainmentindustry@gmail.com', titleX, 83, {
        width: pageWidth - 220,
      });

    // Right metadata box inside header
    doc
      .fillColor('#E5C158')
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .text('AGREEMENT ID', leftX + pageWidth - 155, 48, { width: 143, align: 'right' });
    doc
      .fillColor('#FFFFFF')
      .font('Courier-Bold')
      .fontSize(9.5)
      .text(data.agreementCode, leftX + pageWidth - 155, 60, { width: 143, align: 'right' });
    doc
      .fillColor('#D4D4D8')
      .font('Helvetica')
      .fontSize(8)
      .text(`Date: ${data.agreementDate}   |   Status: ${data.status}`, leftX + pageWidth - 190, 82, {
        width: 178,
        align: 'right',
      });

    // Document Title
    doc.y = 132;
    doc
      .fillColor('#111114')
      .font('Helvetica-Bold')
      .fontSize(13)
      .text('SINGLE SONG DIGITAL DISTRIBUTION & CONTENT LICENSE AGREEMENT', leftX, doc.y, {
        width: pageWidth,
        align: 'center',
      });
    doc
      .moveDown(0.35)
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor('#52525B')
      .text(
        `This Digital Distribution Agreement ("Agreement") is entered into on ${data.agreementDate} between PALAMU ENTERTAINMENT INDUSTRY (operating ANGAD MUSIC DISTRIBUTOR) and the Undersigned Artist / Rights Owner.`,
        leftX,
        doc.y,
        { width: pageWidth, align: 'center' }
      );

    // Section 1: Song & Artist Details Grid
    doc.moveDown(0.8);
    const sec1Y = doc.y;
    doc
      .rect(leftX, sec1Y, pageWidth, 18)
      .fillColor('#18181B')
      .fill();
    doc
      .fillColor('#E5C158')
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('1. SONG, ARTIST, CREDITS & RELEASE DETAILS', leftX + 8, sec1Y + 5);

    const rd = data.releaseDetails || {};
    const rows: Array<[string, string, string, string]> = [
      ['Agreement ID', data.agreementCode, 'Agreement Date', data.agreementDate],
      ['Song Title', data.songTitle || '—', 'Release / Album Title', rd.releaseTitle || data.songTitle || '—'],
      ['Artist Account Name', data.artistName || '—', 'Primary Singer / Vocalist', data.singerName || data.artistName || '—'],
      ['Music Director', data.musicDirector || '—', 'Lyricist / Author', data.lyricist || '—'],
      ['Composer', data.composer || '—', 'Music Producer', rd.producer || '—'],
      ['Record Label', data.labelName || 'Palamu Entertainment Industry', 'Release Format / Genre', `${rd.releaseType || 'Single'} · ${rd.genre || '—'}${rd.subgenre ? ` / ${rd.subgenre}` : ''}`],
      ['Language', rd.language || '—', 'Production Year', rd.productionYear || '—'],
      ['Main Release Date', formatDateDisplay(rd.releaseDate), 'Original Release Date', formatDateDisplay(rd.originalReleaseDate || rd.releaseDate)],
      ['Catalogue Number', rd.catalogueNumber || 'Assigned by Label', 'UPC / ISRC', `${rd.upc || 'Pending'} / ${rd.isrc || 'Pending'}`],
      ['P-Line (Phonographic)', rd.pLine || '—', 'C-Line (Composition)', rd.cLine || '—'],
      [
        'Audio Specifications',
        `${rd.sampleRate ? `${(rd.sampleRate / 1000).toFixed(1).replace(/\.0$/, '')} kHz` : 'WAV'} · ${rd.bitDepth ? `${rd.bitDepth}-bit` : 'PCM'} · ${rd.channels === 2 ? 'Stereo' : rd.channels || 'Stereo'} · ${formatDurationMMSS(rd.durationSeconds)}`,
        'QC Validation Status',
        rd.audioQualityStatus || 'Pending Review',
      ],
    ];

    let curY = sec1Y + 20;
    const col1W = 102;
    const col2W = pageWidth / 2 - col1W;
    const col3W = 102;
    const col4W = pageWidth / 2 - col3W;
    const rowH = 21;

    for (let i = 0; i < rows.length; i++) {
      const [k1, v1, k2, v2] = rows[i];
      doc
        .rect(leftX, curY, pageWidth, rowH)
        .fillColor(i % 2 === 0 ? '#FAFAFA' : '#F4F4F5')
        .fill();
      doc
        .rect(leftX, curY, pageWidth, rowH)
        .lineWidth(0.5)
        .strokeColor('#D4D4D8')
        .stroke();

      doc.fillColor('#52525B').font('Helvetica-Bold').fontSize(7.5).text(k1, leftX + 6, curY + 6, { width: col1W - 8 });
      doc.fillColor('#111114').font('Helvetica').fontSize(8).text(v1, leftX + col1W + 4, curY + 6, { width: col2W - 8 });

      doc.fillColor('#52525B').font('Helvetica-Bold').fontSize(7.5).text(k2, leftX + col1W + col2W + 6, curY + 6, { width: col3W - 8 });
      doc
        .fillColor('#111114')
        .font('Helvetica')
        .fontSize(8)
        .text(v2, leftX + col1W + col2W + col3W + 4, curY + 6, { width: col4W - 8 });

      curY += rowH;
    }

    // Section 2: Artist Declaration & Ownership Confirmation
    curY += 10;
    doc.rect(leftX, curY, pageWidth, 18).fillColor('#18181B').fill();
    doc
      .fillColor('#E5C158')
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('2. ARTIST DECLARATION & MUSIC OWNERSHIP CONFIRMATION', leftX + 8, curY + 5);
    curY += 23;

    const declarationText =
      `I, ${data.artistName} (Singer: ${data.singerName || data.artistName}), hereby solemnly declare and confirm that I am the sole and lawful owner or duly authorized rights holder of the sound recording and underlying musical/lyrical composition titled "${data.songTitle}". The submitted master audio, cover artwork, lyrics, and credits are 100% original and do not infringe upon any third-party copyright, sampled beat, unauthorized remix, or trademark. I accept full legal and financial responsibility for any copyright claim or strike arising from this work.`;

    doc.fillColor('#27272A').font('Helvetica').fontSize(8.2).text(declarationText, leftX, curY, {
      width: pageWidth,
      lineGap: 2,
    });
    curY = doc.y + 8;

    // Section 3: Terms & Conditions
    doc.rect(leftX, curY, pageWidth, 18).fillColor('#18181B').fill();
    doc
      .fillColor('#E5C158')
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('3. DISTRIBUTION TERMS & CONDITIONS', leftX + 8, curY + 5);
    curY += 23;

    const terms = [
      '1. Grant of Distribution Rights: Artist authorizes ANGAD MUSIC DISTRIBUTOR / PALAMU ENTERTAINMENT INDUSTRY to distribute, encode, monetize, and deliver the Song to selected DSPs, telecom caller tune networks, and social audio partners worldwide.',
      '2. Metadata & Quality Control: Release publishing timelines (including optional Fast Track QC requests) depend strictly on quality verification and partner store approval. Delivery status is marked LIVE only upon genuine partner confirmation.',
      '3. Royalties & Settlements: Net royalties received from verified partner reports are credited transparently to the Artist Ledger. Withdrawals require a Verified KYC profile and adhere to label payout minimums and tax/regulatory rules.',
      '4. Infringement & Takedown: Palamu Entertainment Industry reserves the right to hold royalties, suspend distribution, or issue immediate store takedowns if copyright disputes, artificial streaming, or policy violations are detected.',
      '5. Governing Law: This Agreement is governed by the laws of India with jurisdiction in Palamu, Jharkhand.',
    ];

    doc.fillColor('#27272A').font('Helvetica').fontSize(8);
    for (const term of terms) {
      doc.text(term, leftX, curY, { width: pageWidth, lineGap: 1.5 });
      curY = doc.y + 3;
    }

    // Section 4: Execution & Signatures
    const sigBoxTop = Math.max(curY + 8, 675);
    if (sigBoxTop > doc.page.height - 135) {
      doc.addPage();
    }
    const finalSigY = doc.y > doc.page.height - 140 ? 48 : Math.max(curY + 10, 680);
    const halfW = (pageWidth - 18) / 2;

    // Artist signature card
    doc.rect(leftX, finalSigY, halfW, 92).lineWidth(0.8).strokeColor('#A1A1AA').stroke();
    doc.fillColor('#111114').font('Helvetica-Bold').fontSize(8.5).text('ARTIST / RIGHTS OWNER SIGNATURE', leftX + 10, finalSigY + 10);
    doc.moveTo(leftX + 10, finalSigY + 54).lineTo(leftX + halfW - 10, finalSigY + 54).strokeColor('#71717A').stroke();
    doc.fillColor('#3F3F46').font('Helvetica').fontSize(7.8).text(`Name: ${data.artistName}`, leftX + 10, finalSigY + 60);
    doc.text(`Date: ${data.agreementDate}   |   ID: ${data.agreementCode}`, leftX + 10, finalSigY + 73);

    // Label signature card
    const rightX = leftX + halfW + 18;
    doc.rect(rightX, finalSigY, halfW, 92).lineWidth(0.8).strokeColor('#D4AF37').stroke();
    doc.fillColor('#111114').font('Helvetica-Bold').fontSize(8.5).text('FOR PALAMU ENTERTAINMENT INDUSTRY', rightX + 10, finalSigY + 10);
    doc.fillColor('#71717A').font('Helvetica').fontSize(7.5).text('ANGAD MUSIC DISTRIBUTOR (Authorized Signatory)', rightX + 10, finalSigY + 22);
    doc.moveTo(rightX + 10, finalSigY + 54).lineTo(rightX + halfW - 10, finalSigY + 54).strokeColor('#D4AF37').stroke();
    doc.fillColor('#3F3F46').font('Helvetica').fontSize(7.8).text(`Label: ${data.labelName || 'Palamu Entertainment Industry'}`, rightX + 10, finalSigY + 60);
    doc.text(`Contact: 9939149838  |  palamuentertainmentindustry@gmail.com`, rightX + 10, finalSigY + 73);

    doc.end();
  });
}

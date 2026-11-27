import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  FileText,
  Info,
  Layers,
  Music,
  Plus,
  Search,
  Trash2,
  Upload,
  UserPlus,
  Zap,
} from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout.tsx';
import { DateFieldDDMMYYYY } from '../components/DateFieldDDMMYYYY.tsx';
import { SafeImage } from '../components/SafeImage.tsx';
import { StatusText } from '../components/StatusText.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch, apiUploadWithProgress } from '../lib/api.ts';
import {
  ASSETS,
  COMPANY_INFO,
  SUPPORTED_STORES,
  formatBytes,
  formatDateDDMMYYYY,
  formatDuration,
  getLocalTodayIso,
} from '../lib/assets.ts';
import type { AppView, ArtistRoleCredit, ArtistSubAccount } from '../types.ts';

interface DuplicateMatchInfo {
  trackTitle: string;
  releaseTitle: string;
  releaseId: number;
}

interface ArtistSearchResult {
  name: string;
  source: string;
  detail: string;
  spotifyUrl: string;
}

interface DraftTrack {
  trackNumber: number;
  discNumber: number;
  title: string;
  primaryTrackType: string;
  songVersion: string;
  remixer: string;
  author: string;
  composer: string;
  musicDirector: string;
  producer: string;
  publisher: string;
  isrc: string;
  callerTuneStartTime: string;
  parentalAdvisory: 'Non-Explicit' | 'Explicit' | 'Clean / Edited';
  youtubeContentId: boolean;
  isInstrumental: boolean;
  vocalLanguage: string;
  artistRoles: ArtistRoleCredit[];
  lyricsText: string;
  lyricsFilename: string;
  lyricsUrl: string;
  uploadingLyrics: boolean;
  durationSeconds: number;
  audioFilename: string;
  audioUrl: string;
  audioMime: string;
  audioSizeBytes: number;
  audioSampleRate: number;
  audioBitDepth: number;
  audioChannels: number;
  audioQualityStatus: string;
  audioQualityNotes: string;
  audioSha256: string;
  duplicateDetected?: boolean;
  duplicateMatches?: DuplicateMatchInfo[];
  uploading: boolean;
  uploadProgress: number;
  uploadLoadedBytes: number;
  uploadTotalBytes: number;
  uploadSuccessMsg: string;
}

interface ClientWavInfo {
  sampleRate: number;
  bitDepth: number;
  channels: number;
  durationSeconds: number;
}

async function inspectWavFileClient(file: File): Promise<ClientWavInfo> {
  if (!file.name.toLowerCase().endsWith('.wav')) {
    throw new Error('Audio Format must be WAV Only (.wav). Other formats such as MP3/FLAC/M4A are not supported.');
  }
  if (file.size < 44) {
    throw new Error('Invalid or empty WAV file.');
  }

  const headerBuf = await file.slice(0, 12).arrayBuffer();
  const headerView = new DataView(headerBuf);
  const ascii = (view: DataView, start: number, len: number) =>
    Array.from({ length: len }, (_, i) => String.fromCharCode(view.getUint8(start + i))).join('');

  if (ascii(headerView, 0, 4) !== 'RIFF' || ascii(headerView, 8, 4) !== 'WAVE') {
    throw new Error('Invalid WAV header. Please upload a valid uncompressed Stereo WAV (.wav) file.');
  }

  let offset = 12;
  let audioFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let byteRate = 0;
  let bitDepth = 0;
  let dataSize = 0;

  while (offset + 8 <= file.size) {
    const chunkHdrBuf = await file.slice(offset, offset + 8).arrayBuffer();
    if (chunkHdrBuf.byteLength < 8) break;
    const chunkHdrView = new DataView(chunkHdrBuf);
    const chunkId = ascii(chunkHdrView, 0, 4);
    const chunkSize = chunkHdrView.getUint32(4, true);

    if (chunkId === 'fmt ' && chunkSize >= 16) {
      const fmtLen = Math.min(chunkSize, 40);
      const fmtBuf = await file.slice(offset + 8, offset + 8 + fmtLen).arrayBuffer();
      const fmtView = new DataView(fmtBuf);
      audioFormat = fmtView.getUint16(0, true);
      channels = fmtView.getUint16(2, true);
      sampleRate = fmtView.getUint32(4, true);
      byteRate = fmtView.getUint32(8, true);
      bitDepth = fmtView.getUint16(14, true);
      if (audioFormat === 0xfffe && fmtLen >= 20) {
        const validBits = fmtView.getUint16(18, true);
        if (validBits > 0) bitDepth = validBits;
      }
    } else if (chunkId === 'data') {
      dataSize = chunkSize;
      if (channels > 0 && sampleRate > 0) break;
    }

    const paddedChunk = chunkSize + (chunkSize % 2);
    if (paddedChunk <= 0 && chunkId !== 'data') break;
    offset += 8 + paddedChunk;
  }

  if (sampleRate === 0 || channels === 0 || bitDepth === 0) {
    throw new Error('WAV metadata chunk could not be read. Ensure the file is a standard PCM WAV.');
  }
  if (channels !== 2) {
    throw new Error(
      `Stereo Audio is required (2 channels). Selected file "${file.name}" has ${channels} channel${channels === 1 ? '' : 's'}.`
    );
  }
  if (sampleRate < 44100) {
    throw new Error(
      `Sample Rate must be at least 44.1 kHz (44,100 Hz). Selected file is ${(sampleRate / 1000).toFixed(1)} kHz.`
    );
  }
  if (bitDepth < 16 || bitDepth > 24) {
    throw new Error(`Bit Depth must be 16–24 bit. Selected file is ${bitDepth}-bit.`);
  }

  const effectiveByteRate = byteRate > 0 ? byteRate : sampleRate * channels * (bitDepth / 8);
  const effectiveDataBytes = dataSize > 0 ? dataSize : Math.max(0, file.size - 44);
  const exactDuration = effectiveByteRate > 0 ? effectiveDataBytes / effectiveByteRate : 0;
  const durationSeconds = Math.round(exactDuration);

  if (exactDuration < 59.5) {
    throw new Error(
      `Minimum audio duration is 60 seconds (1 minute). "${file.name}" is ${durationSeconds} seconds.`
    );
  }
  if (exactDuration > 360.5) {
    throw new Error(
      `Maximum audio duration is 6 minutes (360 seconds). "${file.name}" is ${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s.`
    );
  }

  return { sampleRate, bitDepth, channels, durationSeconds };
}

const GENRES = [
  'Bhojpuri',
  'Hindi / Bollywood',
  'Indian Pop',
  'Folk / Regional',
  'Hip-Hop / Rap',
  'Devotional / Bhakti',
  'Classical / Acoustic',
  'Electronic / Dance',
  'Lo-Fi / Instrumental',
];

const SUBGENRES = [
  'Romantic',
  'Sad / Melancholic',
  'Lok Geet / Traditional',
  'Dance / Party',
  'Bhajan / Aarti',
  'Sufi / Qawwali',
  'Desi Hip-Hop / Trap',
  'Acoustic Ballad',
  'DJ / Club Remix',
  'Ghazal / Semi-Classical',
  'Ambient / Chill',
  'Other',
];

const LANGUAGES = [
  'Hindi',
  'Bhojpuri',
  'Punjabi',
  'Maithili',
  'Magahi',
  'English',
  'Bengali',
  'Tamil',
  'Telugu',
  'Marathi',
  'Gujarati',
  'Other',
];

const PRIMARY_TRACK_TYPES = [
  'Original',
  'Remix',
  'Cover',
  'Live',
  'Acoustic',
  'Instrumental',
  'Radio Edit',
  'Extended Mix',
  'Mashup',
];

const ARTIST_ROLE_TYPES = [
  'Primary Artist',
  'Featured Artist',
  'Music Director',
  'Producer',
  'Composer',
  'Author / Lyricist',
  'Remixer',
  'Publisher',
  'Arranger',
  'Performer',
];

interface CreateReleasePageProps {
  onNavigate: (view: AppView) => void;
}

export function CreateReleasePage({ onNavigate }: CreateReleasePageProps) {
  const { token, user } = useAuth();
  const currentYear = String(new Date().getFullYear());
  const [todayLocalIso] = useState(() => getLocalTodayIso());
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Release Information
  const [coverUrl, setCoverUrl] = useState('');
  const [coverInfo, setCoverInfo] = useState<string>('');
  const [uploadingCover, setUploadingCover] = useState(false);

  const [title, setTitle] = useState('');
  const [releaseVersion, setReleaseVersion] = useState('');
  const [primaryArtistsList, setPrimaryArtistsList] = useState<string[]>(() => {
    const initial = user?.stage_name || user?.full_name || '';
    return initial ? [initial] : [];
  });
  const [primaryArtistInput, setPrimaryArtistInput] = useState('');
  const [featuredArtists, setFeaturedArtists] = useState('');
  const [variousArtists, setVariousArtists] = useState(false);

  // Search Database or Spotify + Add Artist
  const [searchQuery, setSearchQuery] = useState('');
  const [searchingArtists, setSearchingArtists] = useState(false);
  const [dbResults, setDbResults] = useState<ArtistSearchResult[]>([]);
  const [spotifyResults, setSpotifyResults] = useState<ArtistSearchResult[]>([]);
  const [spotifyConfigured, setSpotifyConfigured] = useState(false);
  const [searchPerformed, setSearchPerformed] = useState(false);

  const [showAddArtist, setShowAddArtist] = useState(false);
  const [newArtistName, setNewArtistName] = useState('');
  const [newArtistCountry, setNewArtistCountry] = useState(user?.country || 'India');
  const [newArtistGenre, setNewArtistGenre] = useState(GENRES[0]);
  const [newArtistSpotify, setNewArtistSpotify] = useState('');
  const [savingNewArtist, setSavingNewArtist] = useState(false);

  const [genre, setGenre] = useState(GENRES[0]);
  const [subgenre, setSubgenre] = useState(SUBGENRES[0]);
  const [language, setLanguage] = useState(LANGUAGES[0]);

  const [availableLabels, setAvailableLabels] = useState<string[]>([COMPANY_INFO.parentCompany]);
  const [labelName, setLabelName] = useState<string>(COMPANY_INFO.parentCompany);
  const [showAddLabel, setShowAddLabel] = useState(false);
  const [newLabelInput, setNewLabelInput] = useState('');
  const [savingLabel, setSavingLabel] = useState(false);

  const [releaseType, setReleaseType] = useState<'Single' | 'EP' | 'Album'>('Single');
  const [releaseDate, setReleaseDate] = useState(() => getLocalTodayIso());
  const [originalReleaseDate, setOriginalReleaseDate] = useState(() => getLocalTodayIso());
  const [productionYear, setProductionYear] = useState(currentYear);
  const [pLine, setPLine] = useState(`℗ ${currentYear} ${COMPANY_INFO.parentCompany}`);
  const [cLine, setCLine] = useState(`© ${currentYear} ${COMPANY_INFO.parentCompany}`);
  const [pLineTouched, setPLineTouched] = useState(false);
  const [cLineTouched, setCLineTouched] = useState(false);
  const [catalogueNumber, setCatalogueNumber] = useState('');
  const [upc, setUpc] = useState('');
  const [processingTier, setProcessingTier] = useState<'Standard' | 'Fast Track'>('Standard');
  const [releaseScheduleMode, setReleaseScheduleMode] = useState<'Scheduled' | 'Instant Request'>('Scheduled');

  const [subAccounts, setSubAccounts] = useState<ArtistSubAccount[]>([]);
  const [activeStores, setActiveStores] = useState<string[]>([...SUPPORTED_STORES]);
  const [targetStores, setTargetStores] = useState<string[]>([...SUPPORTED_STORES]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    current: number;
    total: number;
    percent: number;
    loadedBytes: number;
    totalBytes: number;
    filename: string;
  } | null>(null);
  const [bulkSuccessMsg, setBulkSuccessMsg] = useState<string | null>(null);

  const primaryArtistsJoined = primaryArtistsList.join(', ');

  const createEmptyTrack = (trackNum: number): DraftTrack => ({
    trackNumber: trackNum,
    discNumber: 1,
    title: '',
    primaryTrackType: 'Original',
    songVersion: 'Original',
    remixer: '',
    author: '',
    composer: '',
    musicDirector: '',
    producer: '',
    publisher: COMPANY_INFO.parentCompany,
    isrc: '',
    callerTuneStartTime: '00:30',
    parentalAdvisory: 'Non-Explicit',
    youtubeContentId: true,
    isInstrumental: false,
    vocalLanguage: language,
    artistRoles: primaryArtistsJoined ? [{ name: primaryArtistsJoined, role: 'Primary Artist' }] : [],
    lyricsText: '',
    lyricsFilename: '',
    lyricsUrl: '',
    uploadingLyrics: false,
    durationSeconds: 0,
    audioFilename: '',
    audioUrl: '',
    audioMime: '',
    audioSizeBytes: 0,
    audioSampleRate: 0,
    audioBitDepth: 0,
    audioChannels: 0,
    audioQualityStatus: '',
    audioQualityNotes: '',
    audioSha256: '',
    duplicateDetected: false,
    duplicateMatches: [],
    uploading: false,
    uploadProgress: 0,
    uploadLoadedBytes: 0,
    uploadTotalBytes: 0,
    uploadSuccessMsg: '',
  });

  const [tracks, setTracks] = useState<DraftTrack[]>(() => [createEmptyTrack(1)]);
  const [activeTrackIdx, setActiveTrackIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ activeNames: string[] }>('/api/platforms')
      .then((res) => {
        if (res.activeNames && res.activeNames.length > 0) {
          setActiveStores(res.activeNames);
          setTargetStores(res.activeNames);
        }
      })
      .catch(() => {});

    if (token) {
      apiFetch<{ profiles: ArtistSubAccount[] }>('/api/artist/sub-accounts', { token })
        .then((res) => setSubAccounts(res.profiles || []))
        .catch(() => {});

      apiFetch<{ labelNames: string[] }>('/api/artist/labels', { token })
        .then((res) => {
          if (res.labelNames && res.labelNames.length > 0) {
            setAvailableLabels(res.labelNames);
          }
        })
        .catch(() => {});
    }
  }, [token]);

  const syncDefaultLines = (nextYear: string, nextLabel: string) => {
    const cleanYear = /^\d{4}$/.test(nextYear.trim()) ? nextYear.trim() : currentYear;
    const cleanLabel = nextLabel.trim() || COMPANY_INFO.parentCompany;
    if (!pLineTouched) {
      setPLine(`℗ ${cleanYear} ${cleanLabel}`);
    }
    if (!cLineTouched) {
      setCLine(`© ${cleanYear} ${cleanLabel}`);
    }
  };

  const addPrimaryArtistChip = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setPrimaryArtistsList((prev) =>
      prev.some((p) => p.toLowerCase() === trimmed.toLowerCase()) ? prev : [...prev, trimmed]
    );
  };

  const removePrimaryArtistChip = (name: string) => {
    setPrimaryArtistsList((prev) => prev.filter((p) => p !== name));
  };

  const appendFeaturedArtist = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = featuredArtists
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!existing.some((e) => e.toLowerCase() === trimmed.toLowerCase())) {
      setFeaturedArtists([...existing, trimmed].join(', '));
    }
  };

  const handleArtistSearch = async () => {
    if (!token || searchQuery.trim().length < 2) {
      setError('Enter at least 2 characters or a Spotify Artist URL to search Database / Spotify.');
      return;
    }
    setError(null);
    setSearchingArtists(true);
    try {
      const res = await apiFetch<{
        databaseResults: ArtistSearchResult[];
        spotifyResults: ArtistSearchResult[];
        spotifyConfigured: boolean;
      }>(`/api/artist/artist-search?q=${encodeURIComponent(searchQuery.trim())}`, { token });
      setDbResults(res.databaseResults || []);
      setSpotifyResults(res.spotifyResults || []);
      setSpotifyConfigured(Boolean(res.spotifyConfigured));
      setSearchPerformed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Artist search failed.');
    } finally {
      setSearchingArtists(false);
    }
  };

  const handleSaveNewArtist = async () => {
    if (!token || newArtistName.trim().length < 2) {
      setError('Enter an Artist Name (min 2 characters) to add.');
      return;
    }
    setError(null);
    setSavingNewArtist(true);
    try {
      const res = await apiFetch<{ profile: ArtistSubAccount }>('/api/artist/sub-accounts', {
        method: 'POST',
        token,
        body: {
          artistName: newArtistName.trim(),
          country: newArtistCountry.trim() || 'India',
          genre: newArtistGenre,
          spotifyUrl: newArtistSpotify.trim(),
        },
      });
      setSubAccounts((prev) => [res.profile, ...prev]);
      addPrimaryArtistChip(res.profile.artist_name);
      setNewArtistName('');
      setNewArtistSpotify('');
      setShowAddArtist(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add artist.');
    } finally {
      setSavingNewArtist(false);
    }
  };

  const handleAddLabel = async () => {
    if (!token || newLabelInput.trim().length < 2) {
      setError('Enter a Label name (at least 2 characters).');
      return;
    }
    setError(null);
    setSavingLabel(true);
    try {
      const res = await apiFetch<{ labelName: string }>('/api/artist/labels', {
        method: 'POST',
        token,
        body: { labelName: newLabelInput.trim() },
      });
      const saved = res.labelName || newLabelInput.trim();
      setAvailableLabels((prev) => (prev.includes(saved) ? prev : [saved, ...prev]));
      setLabelName(saved);
      syncDefaultLines(productionYear, saved);
      setNewLabelInput('');
      setShowAddLabel(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add label.');
    } finally {
      setSavingLabel(false);
    }
  };

  const toggleStore = (store: string) => {
    setTargetStores((prev) => (prev.includes(store) ? prev.filter((s) => s !== store) : [...prev, store]));
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    setError(null);
    setCoverInfo('');
    setUploadingCover(true);

    let dimSummary = '';
    try {
      const objUrl = URL.createObjectURL(file);
      const dims = await new Promise<{ width: number; height: number }>((resolve) => {
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(objUrl);
          resolve({ width: img.naturalWidth, height: img.naturalHeight });
        };
        img.onerror = () => {
          URL.revokeObjectURL(objUrl);
          resolve({ width: 0, height: 0 });
        };
        img.src = objUrl;
      });
      if (dims.width > 0) {
        const isSquare = dims.width === dims.height;
        const meetsMin = dims.width >= 1400 && dims.height >= 1400;
        dimSummary = `${dims.width}×${dims.height}px (${formatBytes(file.size)})`;
        if (!isSquare || !meetsMin) {
          dimSummary += ' · Warning: 3000×3000px square artwork recommended for DSP stores';
        } else {
          dimSummary += ' · Store artwork specs met';
        }
      }
    } catch {
      dimSummary = '';
    }

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiFetch<{ url: string }>('/api/upload/artwork', {
        method: 'POST',
        token,
        body: formData,
        isFormData: true,
      });
      setCoverUrl(res.url);
      setCoverInfo(dimSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cover upload failed.');
    } finally {
      setUploadingCover(false);
    }
  };

  const inspectAudioAndUpload = async (
    file: File,
    onProgress?: (percent: number, loadedBytes: number, totalBytes: number) => void
  ) => {
    if (!token) throw new Error('Session expired.');

    const clientWav = await inspectWavFileClient(file);

    const formData = new FormData();
    formData.append('file', file);
    const res = await apiUploadWithProgress<{
      url: string;
      originalName: string;
      size: number;
      mimeType: string;
      formatLabel: string;
      sampleRate: number;
      bitDepth: number;
      channels: number;
      durationSeconds: number;
      qualityStatus: string;
      qualityNotes: string;
      audioSha256?: string;
      duplicateDetected?: boolean;
      duplicateMatches?: DuplicateMatchInfo[];
    }>('/api/upload/audio', {
      token,
      formData,
      onProgress,
    });

    const finalDuration = res.durationSeconds || clientWav.durationSeconds;
    const sr = res.sampleRate || clientWav.sampleRate;
    const bd = res.bitDepth || clientWav.bitDepth;
    const srLabel = `${(sr / 1000).toFixed(1).replace(/\.0$/, '')} kHz`;
    const uploadSuccessMsg = `WAV Upload Successful: "${res.originalName}" (${formatDuration(finalDuration)} · ${srLabel} · ${bd}-bit · Stereo)`;

    return {
      audioUrl: res.url,
      audioFilename: res.originalName,
      audioMime: res.mimeType || res.formatLabel,
      audioSizeBytes: res.size,
      audioSampleRate: sr,
      audioBitDepth: bd,
      audioChannels: res.channels || clientWav.channels,
      audioQualityStatus: res.qualityStatus,
      audioQualityNotes: res.qualityNotes,
      audioSha256: res.audioSha256 || '',
      duplicateDetected: Boolean(res.duplicateDetected),
      duplicateMatches: res.duplicateMatches || [],
      durationSeconds: finalDuration,
      suggestedTitle: res.originalName.replace(/\.[^/.]+$/, ''),
      uploadSuccessMsg,
    };
  };

  const handleTrackAudioUpload = async (idx: number, file: File | undefined) => {
    if (!file || !token) return;
    setError(null);
    setBulkSuccessMsg(null);
    setTracks((prev) =>
      prev.map((t, i) =>
        i === idx
          ? {
              ...t,
              uploading: true,
              uploadProgress: 0,
              uploadLoadedBytes: 0,
              uploadTotalBytes: file.size,
              uploadSuccessMsg: '',
            }
          : t
      )
    );
    try {
      const uploaded = await inspectAudioAndUpload(file, (percent, loadedBytes, totalBytes) => {
        setTracks((prev) =>
          prev.map((t, i) =>
            i === idx
              ? {
                  ...t,
                  uploadProgress: percent,
                  uploadLoadedBytes: loadedBytes,
                  uploadTotalBytes: totalBytes || file.size,
                }
              : t
          )
        );
      });
      setTracks((prev) =>
        prev.map((t, i) =>
          i === idx
            ? {
                ...t,
                audioUrl: uploaded.audioUrl,
                audioFilename: uploaded.audioFilename,
                audioMime: uploaded.audioMime,
                audioSizeBytes: uploaded.audioSizeBytes,
                audioSampleRate: uploaded.audioSampleRate,
                audioBitDepth: uploaded.audioBitDepth,
                audioChannels: uploaded.audioChannels,
                audioQualityStatus: uploaded.audioQualityStatus,
                audioQualityNotes: uploaded.audioQualityNotes,
                audioSha256: uploaded.audioSha256,
                duplicateDetected: uploaded.duplicateDetected,
                duplicateMatches: uploaded.duplicateMatches,
                durationSeconds: uploaded.durationSeconds || t.durationSeconds,
                title: t.title || uploaded.suggestedTitle,
                uploading: false,
                uploadProgress: 100,
                uploadLoadedBytes: file.size,
                uploadTotalBytes: file.size,
                uploadSuccessMsg: uploaded.uploadSuccessMsg,
              }
            : t
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'WAV upload failed.');
      setTracks((prev) =>
        prev.map((t, i) =>
          i === idx
            ? {
                ...t,
                uploading: false,
                uploadProgress: 0,
                uploadLoadedBytes: 0,
                uploadTotalBytes: 0,
              }
            : t
        )
      );
    }
  };

  const handleBulkAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files || []);
    e.target.value = '';
    if (fileList.length === 0 || !token) return;
    setError(null);
    setBulkSuccessMsg(null);
    setBulkUploading(true);
    try {
      const uploadedTracks: DraftTrack[] = [];
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        setBulkProgress({
          current: i + 1,
          total: fileList.length,
          percent: 0,
          loadedBytes: 0,
          totalBytes: file.size,
          filename: file.name,
        });
        const u = await inspectAudioAndUpload(file, (percent, loadedBytes, totalBytes) => {
          setBulkProgress({
            current: i + 1,
            total: fileList.length,
            percent,
            loadedBytes,
            totalBytes: totalBytes || file.size,
            filename: file.name,
          });
        });
        uploadedTracks.push({
          ...createEmptyTrack(1),
          title: u.suggestedTitle,
          audioUrl: u.audioUrl,
          audioFilename: u.audioFilename,
          audioMime: u.audioMime,
          audioSizeBytes: u.audioSizeBytes,
          audioSampleRate: u.audioSampleRate,
          audioBitDepth: u.audioBitDepth,
          audioChannels: u.audioChannels,
          audioQualityStatus: u.audioQualityStatus,
          audioQualityNotes: u.audioQualityNotes,
          audioSha256: u.audioSha256,
          duplicateDetected: u.duplicateDetected,
          duplicateMatches: u.duplicateMatches,
          durationSeconds: u.durationSeconds,
          uploadProgress: 100,
          uploadLoadedBytes: u.audioSizeBytes,
          uploadTotalBytes: u.audioSizeBytes,
          uploadSuccessMsg: u.uploadSuccessMsg,
        });
      }

      setTracks((prev) => {
        const base = prev.length === 1 && !prev[0].audioUrl && !prev[0].title.trim() ? [] : prev;
        const merged = [...base, ...uploadedTracks].map((item, idx) => ({
          ...item,
          trackNumber: idx + 1,
        }));
        if (merged.length > 1 && releaseType === 'Single') {
          setReleaseType(merged.length >= 4 ? 'Album' : 'EP');
        }
        setActiveTrackIdx(Math.max(0, merged.length - 1));
        return merged;
      });
      setBulkSuccessMsg(
        `Bulk WAV Upload Successful: ${uploadedTracks.length} track${uploadedTracks.length === 1 ? '' : 's'} inspected and uploaded.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk WAV upload failed.');
    } finally {
      setBulkUploading(false);
      setBulkProgress(null);
    }
  };

  const handleTrackLyricsUpload = async (idx: number, file: File | undefined) => {
    if (!file || !token) return;
    setError(null);
    setTracks((prev) => prev.map((t, i) => (i === idx ? { ...t, uploadingLyrics: true } : t)));
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiFetch<{ url: string; originalName: string }>('/api/upload/lyrics', {
        method: 'POST',
        token,
        body: formData,
        isFormData: true,
      });

      let textPreview = '';
      if (file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.lrc')) {
        textPreview = (await file.text()).slice(0, 15000);
      }

      setTracks((prev) =>
        prev.map((t, i) =>
          i === idx
            ? {
                ...t,
                lyricsUrl: res.url,
                lyricsFilename: res.originalName,
                lyricsText: t.lyricsText || textPreview,
                uploadingLyrics: false,
              }
            : t
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lyrics upload failed.');
      setTracks((prev) => prev.map((t, i) => (i === idx ? { ...t, uploadingLyrics: false } : t)));
    }
  };

  const addTrack = () => {
    setTracks((prev) => {
      const next = [...prev, createEmptyTrack(prev.length + 1)];
      setActiveTrackIdx(next.length - 1);
      return next;
    });
  };

  const removeTrack = (idx: number) => {
    if (tracks.length <= 1) return;
    setTracks((prev) => {
      const filtered = prev.filter((_, i) => i !== idx).map((t, i) => ({ ...t, trackNumber: i + 1 }));
      setActiveTrackIdx((cur) => Math.min(cur, filtered.length - 1));
      return filtered;
    });
  };

  const updateTrack = (idx: number, patch: Partial<DraftTrack>) => {
    setTracks((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };

  const addArtistRole = (trackIdx: number) => {
    setTracks((prev) =>
      prev.map((t, i) =>
        i === trackIdx
          ? { ...t, artistRoles: [...t.artistRoles, { name: '', role: 'Featured Artist' }] }
          : t
      )
    );
  };

  const updateArtistRole = (trackIdx: number, roleIdx: number, patch: Partial<ArtistRoleCredit>) => {
    setTracks((prev) =>
      prev.map((t, i) =>
        i === trackIdx
          ? {
              ...t,
              artistRoles: t.artistRoles.map((r, ri) => (ri === roleIdx ? { ...r, ...patch } : r)),
            }
          : t
      )
    );
  };

  const removeArtistRole = (trackIdx: number, roleIdx: number) => {
    setTracks((prev) =>
      prev.map((t, i) =>
        i === trackIdx
          ? { ...t, artistRoles: t.artistRoles.filter((_, ri) => ri !== roleIdx) }
          : t
      )
    );
  };

  const validateStep1 = (): string | null => {
    if (!title.trim()) return 'Release Title is required.';
    if (!variousArtists && primaryArtistsList.length === 0 && !primaryArtistInput.trim()) {
      return 'Add at least one Primary Artist (or enable Various Artists / Compilation).';
    }
    if (!labelName.trim()) return 'Label name is required.';
    if (!releaseDate || !originalReleaseDate) {
      return 'Enter valid Main Release Date and Original Release Date (DD/MM/YYYY).';
    }
    if (releaseDate < todayLocalIso) {
      return `Main Release Date cannot be earlier than today (${formatDateDDMMYYYY(todayLocalIso)}). Select today or a future date.`;
    }
    if (!/^\d{4}$/.test(productionYear.trim())) {
      return 'Production Year must be a valid 4-digit year (e.g. 2026).';
    }
    if (!pLine.trim() || !cLine.trim()) {
      return 'P-Line (℗) and C-Line (©) are required.';
    }
    return null;
  };

  const validateStep2 = (): string | null => {
    if (bulkUploading || tracks.some((t) => t.uploading || t.uploadingLyrics)) {
      return 'Please wait for WAV audio master or lyrics uploads to complete.';
    }
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      if (!t.title.trim()) {
        return `Track #${i + 1} requires a valid Track Title.`;
      }
      if (t.trackNumber < 1 || t.discNumber < 1) {
        return `Track "${t.title}" must have Track # and Disc # of 1 or higher.`;
      }
      if (t.callerTuneStartTime && !/^\d{1,2}:\d{2}(:\d{2})?$/.test(t.callerTuneStartTime.trim())) {
        return `Track "${t.title}" Caller Tune Start Time must use MM:SS format (e.g. 00:30).`;
      }
      if (t.audioUrl) {
        if (t.audioFilename && !t.audioFilename.toLowerCase().endsWith('.wav')) {
          return `Track "${t.title}" must use WAV format (.wav) only.`;
        }
        if (t.durationSeconds < 60 || t.durationSeconds > 360) {
          return `Track "${t.title}" duration (${t.durationSeconds}s) must be between 60 seconds (1 min) and 360 seconds (6 min).`;
        }
        if (t.audioChannels > 0 && t.audioChannels !== 2) {
          return `Track "${t.title}" must be Stereo audio (2 channels).`;
        }
        if (t.audioSampleRate > 0 && t.audioSampleRate < 44100) {
          return `Track "${t.title}" Sample Rate must be at least 44.1 kHz.`;
        }
        if (t.audioBitDepth > 0 && (t.audioBitDepth < 16 || t.audioBitDepth > 24)) {
          return `Track "${t.title}" Bit Depth must be between 16-bit and 24-bit.`;
        }
      }
    }
    if (targetStores.length === 0) {
      return 'Select at least one target distribution store before reviewing.';
    }
    return null;
  };

  const handleGoToStep2 = () => {
    // Capture typed primary artist input automatically if user didn't click "+ Add"
    if (primaryArtistInput.trim()) {
      addPrimaryArtistChip(primaryArtistInput.trim());
      setPrimaryArtistInput('');
    }
    const err = validateStep1();
    if (err) {
      setError(err);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setError(null);
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleGoToStep3 = () => {
    const err = validateStep2();
    if (err) {
      setError(err);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setError(null);
    setStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSuccessMsg(null);

    const err1 = validateStep1();
    if (err1) {
      setError(err1);
      setStep(1);
      return;
    }
    const err2 = validateStep2();
    if (err2) {
      setError(err2);
      setStep(2);
      return;
    }

    const effectivePrimary =
      primaryArtistsList.length > 0
        ? primaryArtistsList.join(', ')
        : primaryArtistInput.trim() || 'Various Artists';

    setSubmitting(true);
    try {
      await apiFetch('/api/artist/releases', {
        method: 'POST',
        token,
        body: {
          title,
          releaseVersion,
          releaseType,
          primaryArtist: effectivePrimary,
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
          copyrightOwner: labelName,
          copyrightYear: productionYear,
          catalogueNumber,
          musicDirector: tracks[0]?.musicDirector || '',
          producer: tracks[0]?.producer || '',
          processingTier,
          releaseScheduleMode,
          coverUrl,
          targetStores,
          tracks: tracks.map((t) => ({
            trackNumber: t.trackNumber,
            discNumber: t.discNumber,
            title: t.title,
            primaryTrackType: t.primaryTrackType,
            songVersion: t.songVersion || t.primaryTrackType,
            remixer: t.remixer,
            author: t.isInstrumental ? '' : t.author,
            lyricist: t.isInstrumental ? '' : t.author,
            composer: t.composer,
            musicDirector: t.musicDirector,
            producer: t.producer,
            publisher: t.publisher,
            isrc: t.isrc,
            callerTuneStartTime: t.callerTuneStartTime || '00:00',
            parentalAdvisory: t.isInstrumental ? 'Non-Explicit' : t.parentalAdvisory,
            explicit: !t.isInstrumental && t.parentalAdvisory === 'Explicit',
            youtubeContentId: t.youtubeContentId,
            isInstrumental: t.isInstrumental,
            vocalLanguage: t.isInstrumental ? 'Instrumental (No Vocals)' : t.vocalLanguage,
            artistRoles: t.artistRoles.filter((r) => r.name.trim()),
            lyricsText: t.isInstrumental ? '' : t.lyricsText,
            lyricsFilename: t.isInstrumental ? '' : t.lyricsFilename,
            lyricsUrl: t.isInstrumental ? '' : t.lyricsUrl,
            durationSeconds: t.durationSeconds,
            audioFilename: t.audioFilename,
            audioUrl: t.audioUrl,
            audioMime: t.audioMime,
            audioSizeBytes: t.audioSizeBytes,
            audioSampleRate: t.audioSampleRate,
            audioBitDepth: t.audioBitDepth,
            audioChannels: t.audioChannels,
            audioQualityStatus: t.audioQualityStatus,
            audioQualityNotes: t.audioQualityNotes,
            audioSha256: t.audioSha256,
          })),
        },
      });
      setSuccessMsg(
        processingTier === 'Fast Track'
          ? 'Release submitted under Fast Track Priority QC review. Actual store publishing depends on partner and platform approval.'
          : 'Release submitted successfully with complete metadata and entered Palamu Entertainment Industry QA.'
      );
      setTimeout(() => onNavigate('my-releases'), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit release.');
    } finally {
      setSubmitting(false);
    }
  };

  const activeTrack = tracks[activeTrackIdx] || tracks[0];

  return (
    <DashboardLayout currentView="create-release" onNavigate={onNavigate} title="Upload Music Release">
      {/* Studio Stepper Header */}
      <div className="mb-6 rounded-xl border border-zinc-800 bg-[#111114] p-4 sm:p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <p className="text-xs font-semibold text-[#E5C158] tracking-wide">
              STEP {step} OF 3 –{' '}
              {step === 1
                ? 'RELEASE INFORMATION'
                : step === 2
                  ? 'TRACK METADATA'
                  : 'TRACK REVIEW'}
            </p>
            <h2 className="font-display text-lg font-semibold text-zinc-100 mt-0.5">
              {step === 1
                ? 'Cover Art, Release Credits & Rights Details'
                : step === 2
                  ? 'WAV Master Audio, Track Credits, ISRC / UPC & Lyrics'
                  : 'Verify Complete Release & Track Submission'}
            </h2>
          </div>
          <span className="text-xs text-zinc-400">
            PALAMU ENTERTAINMENT INDUSTRY · Studio QA Workflow
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {[
            { num: 1 as const, label: 'Step 1 of 3 · Release Information' },
            { num: 2 as const, label: `Step 2 of 3 · Track Metadata (${tracks.length})` },
            { num: 3 as const, label: 'Step 3 of 3 · Track Review & Submit' },
          ].map((item) => {
            const isCurrent = step === item.num;
            const isDone = step > item.num;
            return (
              <button
                key={item.num}
                type="button"
                onClick={() => {
                  if (item.num < step) {
                    setError(null);
                    setStep(item.num);
                  } else if (item.num === 2 && step === 1) {
                    handleGoToStep2();
                  } else if (item.num === 3 && step === 2) {
                    handleGoToStep3();
                  }
                }}
                className={`px-3.5 py-2.5 min-h-[42px] rounded-lg border text-left text-xs font-medium flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                  isCurrent
                    ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-[#F5E6B3] font-semibold'
                    : isDone
                      ? 'bg-[#09090B] border-emerald-700/60 text-emerald-300'
                      : 'bg-[#09090B] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span className="truncate">{item.label}</span>
                {isDone && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-6 p-4 rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/8 flex items-start gap-3">
        <Info className="w-5 h-5 text-[#E5C158] shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs sm:text-sm text-zinc-200 leading-relaxed">
          Submissions enter <strong className="text-[#E5C158]">Pending Review</strong> inside Palamu Entertainment
          Industry&apos;s distribution queue. Audio masters and metadata are inspected before real distribution partner
          fulfillment—no store delivery or earnings are simulated.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-rose-950/40 border border-rose-800/60 text-sm text-rose-300">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="mb-6 p-4 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-sm text-emerald-300">
          {successMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* ============================================================
            STEP 1 OF 3 – RELEASE INFORMATION
            ============================================================ */}
        {step === 1 && (
          <section className="p-5 sm:p-6 rounded-xl border border-zinc-800 bg-[#111114] space-y-6">
            <h3 className="font-display text-base font-semibold text-zinc-100 border-b border-zinc-800 pb-3">
              Step 1 of 3 – Release Information
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* 1. Cover Art Upload */}
              <div className="lg:col-span-4 space-y-3">
                <span className="block text-xs font-medium text-zinc-300">1. Cover Art Upload</span>
                <div className="aspect-square max-w-[260px] rounded-xl overflow-hidden border border-zinc-800 bg-[#09090B]">
                  <SafeImage
                    src={coverUrl || ASSETS.releaseFallback}
                    fallbackSrc={ASSETS.releaseFallback}
                    alt="Release cover artwork preview"
                    className="w-full h-full object-cover"
                  />
                </div>
                <label className="inline-flex items-center gap-2 px-4 py-2 min-h-[42px] rounded-md text-xs font-medium bg-[#09090B] border border-zinc-700 hover:border-[#D4AF37] text-zinc-200 cursor-pointer">
                  <Upload className="w-4 h-4 text-[#D4AF37]" aria-hidden="true" />
                  <span>{uploadingCover ? 'Uploading Artwork...' : 'Upload Cover Art (JPG/PNG/WEBP)'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleCoverUpload}
                    className="sr-only"
                  />
                </label>
                <p className="text-[11px] text-zinc-500">Recommended 3000×3000px square artwork, max 8MB.</p>
                {coverInfo && <p className="text-[11px] text-[#E5C158] font-mono">{coverInfo}</p>}
              </div>

              {/* Release Information Fields */}
              <div className="lg:col-span-8 space-y-5">
                {/* 2. Release Title & 3. Version / Subtitle */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="rel-title">
                      2. Release Title *
                    </label>
                    <input
                      id="rel-title"
                      type="text"
                      required
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Song, EP, or album title"
                      className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="rel-version">
                      3. Version / Subtitle
                    </label>
                    <input
                      id="rel-version"
                      type="text"
                      value={releaseVersion}
                      onChange={(e) => setReleaseVersion(e.target.value)}
                      placeholder="e.g. Original, Deluxe, Unplugged, Slowed + Reverb"
                      className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                </div>

                {/* 4. Primary Artists, 5. Search Database or Spotify, 6. Add Artist, 7. Various Artists / Compilation */}
                <div className="p-4 rounded-xl bg-[#09090B] border border-zinc-800 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#E5C158]">
                      4. Primary Artists · 5. Search Database / Spotify · 6. Add Artist · 7. Compilation
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAddArtist((v) => !v)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[34px] rounded-md text-xs font-medium bg-[#111114] border border-[#D4AF37]/40 hover:border-[#D4AF37] text-[#E5C158] cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{showAddArtist ? 'Close Add Artist' : 'Add Artist'}</span>
                    </button>
                  </div>

                  {/* Selected Primary Artists list */}
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="rel-primary-input">
                      Primary Artists *
                    </label>
                    {primaryArtistsList.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 mb-2.5 text-xs">
                        {primaryArtistsList.map((artistName, idx) => (
                          <span
                            key={artistName}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#111114] border border-[#D4AF37]/35 text-zinc-100"
                          >
                            <span>
                              {idx + 1}. {artistName}
                            </span>
                            <button
                              type="button"
                              aria-label={`Remove primary artist ${artistName}`}
                              onClick={() => removePrimaryArtistChip(artistName)}
                              className="text-zinc-400 hover:text-rose-400 cursor-pointer"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        id="rel-primary-input"
                        type="text"
                        value={primaryArtistInput}
                        onChange={(e) => setPrimaryArtistInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addPrimaryArtistChip(primaryArtistInput);
                            setPrimaryArtistInput('');
                          }
                        }}
                        placeholder="Type Primary Artist name and click Add..."
                        className="flex-1 px-3.5 py-2.5 min-h-[42px] rounded-md bg-[#111114] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          addPrimaryArtistChip(primaryArtistInput);
                          setPrimaryArtistInput('');
                        }}
                        className="px-4 py-2 min-h-[42px] rounded-md text-xs font-semibold bg-zinc-900 border border-zinc-700 hover:border-[#D4AF37] text-zinc-100 shrink-0 cursor-pointer"
                      >
                        + Add Primary Artist
                      </button>
                    </div>

                    {subAccounts.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-[11px] text-zinc-500">Quick Pick Roster:</span>
                        {subAccounts.map((sa) => (
                          <button
                            key={sa.id}
                            type="button"
                            onClick={() => addPrimaryArtistChip(sa.artist_name)}
                            className="text-[11px] text-[#E5C158] hover:underline cursor-pointer"
                          >
                            + {sa.artist_name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 5. Search Database or Spotify */}
                  <div className="pt-2 border-t border-zinc-800/80 space-y-2.5">
                    <label className="block text-xs font-medium text-zinc-300" htmlFor="artist-db-search">
                      5. Search Database or Spotify
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          id="artist-db-search"
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleArtistSearch();
                            }
                          }}
                          placeholder="Search artist in Database or paste Spotify Artist URL..."
                          className="w-full pl-9 pr-3.5 py-2.5 min-h-[42px] rounded-md bg-[#111114] border border-zinc-800 text-xs sm:text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleArtistSearch}
                        disabled={searchingArtists}
                        className="px-4 py-2 min-h-[42px] rounded-md text-xs font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] disabled:opacity-60 shrink-0 cursor-pointer"
                      >
                        {searchingArtists ? 'Searching...' : 'Search'}
                      </button>
                      <a
                        href={`https://open.spotify.com/search/${encodeURIComponent(searchQuery.trim() || 'artists')}/artists`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[42px] rounded-md text-xs font-medium bg-[#111114] border border-zinc-700 hover:border-[#D4AF37] text-zinc-200 shrink-0"
                      >
                        <span>Spotify Lookup</span>
                        <ExternalLink className="w-3.5 h-3.5 text-[#D4AF37]" aria-hidden="true" />
                      </a>
                    </div>

                    {searchPerformed && (
                      <div className="p-3 rounded-lg bg-[#111114] border border-zinc-800 space-y-2 text-xs">
                        {dbResults.length === 0 && spotifyResults.length === 0 ? (
                          <p className="text-zinc-400">
                            No exact match in local artist database
                            {!spotifyConfigured
                              ? '. Paste a https://open.spotify.com/artist/... URL above to verify via Spotify, or click "Add Artist" to register a new artist profile.'
                              : ' or Spotify.'}
                          </p>
                        ) : (
                          <div className="divide-y divide-zinc-800/80">
                            {[...spotifyResults, ...dbResults].map((res, rIdx) => (
                              <div
                                key={`${res.name}-${rIdx}`}
                                className="py-2 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-2"
                              >
                                <div>
                                  <p className="font-medium text-zinc-100">{res.name}</p>
                                  <p className="text-[11px] text-zinc-500">
                                    {res.source}
                                    {res.detail ? ` · ${res.detail}` : ''}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => addPrimaryArtistChip(res.name)}
                                    className="px-2.5 py-1 rounded text-[11px] font-semibold bg-[#D4AF37] text-[#09090B] cursor-pointer"
                                  >
                                    + Primary
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => appendFeaturedArtist(res.name)}
                                    className="px-2.5 py-1 rounded text-[11px] font-medium bg-zinc-900 border border-zinc-700 text-zinc-200 cursor-pointer"
                                  >
                                    + Featured
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 6. Inline Add Artist Panel */}
                  {showAddArtist && (
                    <div className="p-4 rounded-lg bg-[#111114] border border-[#D4AF37]/40 space-y-3">
                      <p className="text-xs font-semibold text-[#E5C158]">6. Add New Artist Profile</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          type="text"
                          value={newArtistName}
                          onChange={(e) => setNewArtistName(e.target.value)}
                          placeholder="Artist / Band Stage Name *"
                          className="px-3 py-2 min-h-[40px] rounded bg-[#09090B] border border-zinc-800 text-xs text-zinc-100"
                        />
                        <input
                          type="text"
                          value={newArtistCountry}
                          onChange={(e) => setNewArtistCountry(e.target.value)}
                          placeholder="Country (e.g. India)"
                          className="px-3 py-2 min-h-[40px] rounded bg-[#09090B] border border-zinc-800 text-xs text-zinc-100"
                        />
                        <select
                          value={newArtistGenre}
                          onChange={(e) => setNewArtistGenre(e.target.value)}
                          className="px-3 py-2 min-h-[40px] rounded bg-[#09090B] border border-zinc-800 text-xs text-zinc-100"
                        >
                          {GENRES.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                        <input
                          type="url"
                          value={newArtistSpotify}
                          onChange={(e) => setNewArtistSpotify(e.target.value)}
                          placeholder="Spotify Artist URL (optional)"
                          className="px-3 py-2 min-h-[40px] rounded bg-[#09090B] border border-zinc-800 text-xs text-zinc-100"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowAddArtist(false)}
                          className="px-3 py-1.5 rounded text-xs text-zinc-400 hover:text-zinc-100 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={savingNewArtist}
                          onClick={handleSaveNewArtist}
                          className="px-4 py-1.5 rounded text-xs font-semibold bg-[#D4AF37] text-[#09090B] cursor-pointer"
                        >
                          {savingNewArtist ? 'Saving...' : 'Save & Attach Artist'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Featuring Artists & 7. Various Artists / Compilation */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-zinc-800/80">
                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="rel-featured">
                        Featuring Artists (Optional)
                      </label>
                      <input
                        id="rel-featured"
                        type="text"
                        value={featuredArtists}
                        onChange={(e) => setFeaturedArtists(e.target.value)}
                        placeholder="Comma-separated featured artists"
                        className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#111114] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                      />
                    </div>
                    <div>
                      <span className="block text-xs font-medium text-zinc-300 mb-1.5">
                        7. Various Artists / Compilation
                      </span>
                      <div className="inline-flex p-1 bg-[#111114] border border-zinc-800 rounded-lg gap-1 w-full sm:w-auto">
                        {[
                          { label: 'No (Standard)', val: false },
                          { label: 'Yes (Compilation)', val: true },
                        ].map((opt) => (
                          <button
                            key={opt.label}
                            type="button"
                            onClick={() => setVariousArtists(opt.val)}
                            className={`flex-1 sm:flex-initial px-3.5 py-2 min-h-[36px] rounded text-xs font-medium transition-colors cursor-pointer ${
                              variousArtists === opt.val
                                ? 'bg-[#D4AF37] text-[#09090B] font-semibold'
                                : 'text-zinc-400 hover:text-zinc-100'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 8. Genre, 9. Subgenre, Language */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="rel-genre">
                      8. Genre *
                    </label>
                    <select
                      id="rel-genre"
                      value={genre}
                      onChange={(e) => setGenre(e.target.value)}
                      className="w-full px-3 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                    >
                      {GENRES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="rel-subgenre">
                      9. Subgenre *
                    </label>
                    <select
                      id="rel-subgenre"
                      value={subgenre}
                      onChange={(e) => setSubgenre(e.target.value)}
                      className="w-full px-3 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                    >
                      {SUBGENRES.map((sg) => (
                        <option key={sg} value={sg}>
                          {sg}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="rel-lang">
                      Release Language *
                    </label>
                    <select
                      id="rel-lang"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full px-3 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                    >
                      {LANGUAGES.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 10. Label, 11. Add Label, 12. Format */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
                  <div className="sm:col-span-5">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <label className="block text-xs font-medium text-zinc-300" htmlFor="rel-label-select">
                        10. Label *
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowAddLabel((v) => !v)}
                        className="text-xs font-medium text-[#E5C158] hover:underline cursor-pointer"
                      >
                        11. + Add Label
                      </button>
                    </div>
                    <select
                      id="rel-label-select"
                      value={labelName}
                      onChange={(e) => {
                        setLabelName(e.target.value);
                        syncDefaultLines(productionYear, e.target.value);
                      }}
                      className="w-full px-3 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                    >
                      {availableLabels.map((lbl) => (
                        <option key={lbl} value={lbl}>
                          {lbl}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-7">
                    <span className="block text-xs font-medium text-zinc-300 mb-1.5">12. Format *</span>
                    <div className="inline-flex p-1 bg-[#09090B] border border-zinc-800 rounded-lg gap-1 w-full sm:w-auto">
                      {(['Single', 'EP', 'Album'] as const).map((fmt) => (
                        <button
                          key={fmt}
                          type="button"
                          onClick={() => setReleaseType(fmt)}
                          className={`flex-1 sm:flex-initial px-5 py-2 min-h-[36px] rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                            releaseType === fmt
                              ? 'bg-[#D4AF37] text-[#09090B]'
                              : 'text-zinc-400 hover:text-zinc-100'
                          }`}
                        >
                          {fmt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {showAddLabel && (
                  <div className="p-3.5 rounded-lg bg-[#09090B] border border-[#D4AF37]/40 flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
                    <input
                      type="text"
                      value={newLabelInput}
                      onChange={(e) => setNewLabelInput(e.target.value)}
                      placeholder="11. Enter new Record Label / Imprint name..."
                      className="flex-1 px-3.5 py-2 min-h-[40px] rounded bg-[#111114] border border-zinc-800 text-xs text-zinc-100"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowAddLabel(false)}
                        className="px-3 py-2 rounded text-xs text-zinc-400 hover:text-zinc-100 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={savingLabel}
                        onClick={handleAddLabel}
                        className="px-4 py-2 min-h-[40px] rounded text-xs font-semibold bg-[#D4AF37] text-[#09090B] cursor-pointer"
                      >
                        {savingLabel ? 'Saving...' : 'Save Label'}
                      </button>
                    </div>
                  </div>
                )}

                {/* 13. Main Release Date, 14. Original Release Date, 15. Production Year */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="rel-date">
                      13. Main Release Date *
                    </label>
                    <DateFieldDDMMYYYY
                      id="rel-date"
                      label="Main Release Date"
                      required
                      minIso={todayLocalIso}
                      value={releaseDate}
                      onChange={setReleaseDate}
                    />
                    <p className="text-[10px] text-zinc-500 mt-1">DD/MM/YYYY · Today or future date</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="rel-orig-date">
                      14. Original Release Date *
                    </label>
                    <DateFieldDDMMYYYY
                      id="rel-orig-date"
                      label="Original Release Date"
                      required
                      value={originalReleaseDate}
                      onChange={setOriginalReleaseDate}
                    />
                    <p className="text-[10px] text-zinc-500 mt-1">DD/MM/YYYY format</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="rel-prod-year">
                      15. Production Year *
                    </label>
                    <input
                      id="rel-prod-year"
                      type="text"
                      required
                      maxLength={4}
                      pattern="\d{4}"
                      value={productionYear}
                      onChange={(e) => {
                        setProductionYear(e.target.value);
                        syncDefaultLines(e.target.value, labelName);
                      }}
                      placeholder="2026"
                      className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm font-mono text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                </div>

                {/* 16. P Line, 17. C Line, 18. Catalogue Number */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="rel-pline">
                      16. P Line – ℗ *
                    </label>
                    <input
                      id="rel-pline"
                      type="text"
                      required
                      value={pLine}
                      onChange={(e) => {
                        setPLineTouched(true);
                        setPLine(e.target.value);
                      }}
                      placeholder="℗ 2026 Palamu Entertainment Industry"
                      className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="rel-cline">
                      17. C Line – © *
                    </label>
                    <input
                      id="rel-cline"
                      type="text"
                      required
                      value={cLine}
                      onChange={(e) => {
                        setCLineTouched(true);
                        setCLine(e.target.value);
                      }}
                      placeholder="© 2026 Palamu Entertainment Industry"
                      className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="rel-cat-no">
                      18. Catalogue Number
                    </label>
                    <input
                      id="rel-cat-no"
                      type="text"
                      value={catalogueNumber}
                      onChange={(e) => setCatalogueNumber(e.target.value)}
                      placeholder="e.g. PEI-2026-001"
                      className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm font-mono text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                </div>

                {/* Preserved Fast Track & Schedule Options */}
                <div className="pt-4 border-t border-zinc-800/80 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-[#E5C158]">Release Processing Speed</p>
                    <span className="text-[11px] text-zinc-400">Your Music, Our Priority</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setProcessingTier('Standard')}
                      className={`p-3.5 rounded-lg border text-left transition-colors cursor-pointer ${
                        processingTier === 'Standard'
                          ? 'bg-zinc-900 border-[#D4AF37]/60 text-zinc-100'
                          : 'bg-[#09090B] border-zinc-800 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-semibold text-zinc-100">Standard Queue</span>
                        {processingTier === 'Standard' && <Check className="w-4 h-4 text-[#E5C158] shrink-0" />}
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">
                        Regular label metadata &amp; master quality inspection queue. Store publishing depends on
                        partner review.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setProcessingTier('Fast Track')}
                      className={`p-3.5 rounded-lg border text-left transition-colors cursor-pointer ${
                        processingTier === 'Fast Track'
                          ? 'bg-[#D4AF37]/12 border-[#D4AF37] text-[#F5E6B3]'
                          : 'bg-[#09090B] border-zinc-800 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#E5C158]">
                          <Zap className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span>Fast Track Release – 4–5 Days*</span>
                        </span>
                        {processingTier === 'Fast Track' && <Check className="w-4 h-4 text-[#E5C158] shrink-0" />}
                      </div>
                      <p className="text-[11px] text-zinc-300 leading-relaxed">
                        Priority quality review. Eligible releases may be processed within 4–5 working days after
                        complete submission and QC approval. *Estimate, not a guaranteed live date.
                      </p>
                    </button>
                  </div>

                  <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-zinc-200">Release Schedule Mode</p>
                      <p className="text-[11px] text-zinc-500">
                        Choose Scheduled Launch or Instant Release Request after QC approval.
                      </p>
                    </div>
                    <div className="inline-flex p-1 bg-[#09090B] border border-zinc-800 rounded-lg gap-1">
                      {(['Scheduled', 'Instant Request'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => {
                            setReleaseScheduleMode(mode);
                            if (mode === 'Instant Request') {
                              setReleaseDate(todayLocalIso);
                            }
                          }}
                          className={`px-3.5 py-1.5 min-h-[34px] rounded text-xs font-medium transition-colors cursor-pointer ${
                            releaseScheduleMode === mode
                              ? 'bg-[#D4AF37] text-[#09090B] font-semibold'
                              : 'text-zinc-400 hover:text-zinc-100'
                          }`}
                        >
                          {mode === 'Instant Request' ? 'Instant Release Request' : 'Scheduled Release'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => onNavigate('artist-dashboard')}
                className="px-5 py-2.5 min-h-[44px] rounded-md text-xs sm:text-sm font-medium text-zinc-300 border border-zinc-800 hover:bg-zinc-900 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGoToStep2}
                className="inline-flex items-center gap-2 px-6 py-2.5 min-h-[44px] rounded-md text-xs sm:text-sm font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] transition-colors cursor-pointer"
              >
                <span>Next: Step 2 of 3 – Track Metadata</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </section>
        )}

        {/* ============================================================
            STEP 2 OF 3 – TRACK METADATA
            ============================================================ */}
        {step === 2 && activeTrack && (
          <div className="space-y-6">
            <section className="p-5 sm:p-6 rounded-xl border border-zinc-800 bg-[#111114] space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
                <div>
                  <h3 className="font-display text-base font-semibold text-zinc-100">
                    Step 2 of 3 – Track Metadata
                  </h3>
                  <p className="text-xs text-zinc-400">
                    WAV Only (.wav) · 1–6 Minutes (60s–360s, including 4, 5 &amp; 6 min tracks) · Stereo · Min 44.1 kHz · 16–24 bit.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <label className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-md text-xs font-semibold bg-[#D4AF37]/15 border border-[#D4AF37]/40 hover:border-[#D4AF37] text-[#E5C158] cursor-pointer">
                    <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{bulkUploading ? 'Uploading Bulk WAVs...' : 'Bulk WAV Upload'}</span>
                    <input
                      type="file"
                      multiple
                      accept=".wav,audio/wav,audio/x-wav,audio/wave"
                      onChange={handleBulkAudioUpload}
                      disabled={bulkUploading}
                      className="sr-only"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={addTrack}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-md text-xs font-semibold bg-[#09090B] border border-zinc-700 hover:border-[#D4AF37] text-zinc-200 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#D4AF37]" aria-hidden="true" />
                    <span>Add Track</span>
                  </button>
                </div>
              </div>

              {bulkProgress && (
                <div className="p-4 rounded-lg bg-[#09090B] border border-[#D4AF37]/50 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-[#E5C158]">
                      Uploading Track {bulkProgress.current} of {bulkProgress.total}: {bulkProgress.filename}
                    </span>
                    <span className="font-mono text-zinc-200 tabular-nums">
                      {bulkProgress.percent}% ({formatBytes(bulkProgress.loadedBytes)} / {formatBytes(bulkProgress.totalBytes)})
                    </span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-[#D4AF37] transition-all duration-150"
                      style={{ width: `${bulkProgress.percent}%` }}
                    />
                  </div>
                </div>
              )}

              {bulkSuccessMsg && !bulkProgress && (
                <div className="p-3.5 rounded-lg bg-emerald-950/40 border border-emerald-700/60 text-xs text-emerald-200 flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                  <span>{bulkSuccessMsg}</span>
                </div>
              )}

              {/* Multi-Track Selector Strip */}
              <div className="flex flex-wrap items-center gap-2">
                {tracks.map((tr, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActiveTrackIdx(i)}
                    className={`px-3.5 py-2 min-h-[38px] rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                      activeTrackIdx === i
                        ? 'bg-[#D4AF37] text-[#09090B] border-[#D4AF37] font-semibold'
                        : 'bg-[#09090B] border-zinc-800 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    Track #{tr.trackNumber}: {tr.title.trim() || 'Untitled'}
                  </button>
                ))}
              </div>

              {/* Active Track Form */}
              <div className="space-y-6 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-semibold text-[#E5C158]">
                      Track #{activeTrack.trackNumber.toString().padStart(2, '0')} · Disc {activeTrack.discNumber}
                    </span>
                    {activeTrack.audioQualityStatus && <StatusText status={activeTrack.audioQualityStatus} />}
                  </div>
                  {tracks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTrack(activeTrackIdx)}
                      className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove This Track</span>
                    </button>
                  )}
                </div>

                {/* 1. Audio Track – WAV Upload */}
                <div className="p-4 rounded-lg bg-[#09090B] border border-zinc-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="block text-xs font-semibold text-[#E5C158] mb-1">
                        1. Audio Track – WAV Upload Only *
                      </span>
                      <p className="text-[11px] text-zinc-400">
                        WAV Only (.wav) · Duration: 60 Seconds (1 Min) to 6 Minutes (360s) · Stereo · Min 44.1 kHz · 16–24 bit.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <label className="inline-flex items-center gap-2 px-4 py-2 min-h-[42px] rounded-md text-xs font-semibold bg-[#111114] border border-[#D4AF37]/50 hover:border-[#D4AF37] text-zinc-100 cursor-pointer">
                        <Upload className="w-3.5 h-3.5 text-[#D4AF37]" aria-hidden="true" />
                        <span>
                          {activeTrack.uploading
                            ? `Uploading WAV (${activeTrack.uploadProgress}%)...`
                            : activeTrack.audioFilename
                              ? `Master: ${activeTrack.audioFilename}`
                              : 'Upload WAV Master (.wav)'}
                        </span>
                        <input
                          type="file"
                          accept=".wav,audio/wav,audio/x-wav,audio/wave"
                          disabled={activeTrack.uploading}
                          onChange={(e) => {
                            const selected = e.target.files?.[0];
                            e.target.value = '';
                            handleTrackAudioUpload(activeTrackIdx, selected);
                          }}
                          className="sr-only"
                        />
                      </label>
                      {activeTrack.audioUrl && (
                        <audio controls src={activeTrack.audioUrl} className="h-9 max-w-[260px]" preload="metadata" />
                      )}
                    </div>
                  </div>

                  {activeTrack.uploading && (
                    <div className="p-3 rounded-md bg-[#111114] border border-[#D4AF37]/40 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="text-[#E5C158] font-medium">
                          {activeTrack.uploadProgress >= 100
                            ? 'Verifying WAV master & SHA-256 fingerprint...'
                            : 'Uploading WAV master (please wait)...'}
                        </span>
                        <span className="font-mono text-zinc-200 tabular-nums">
                          {activeTrack.uploadProgress}% ({formatBytes(activeTrack.uploadLoadedBytes)} /{' '}
                          {formatBytes(activeTrack.uploadTotalBytes)})
                        </span>
                      </div>
                      <div className="w-full h-2.5 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full bg-[#D4AF37] transition-all duration-150"
                          style={{ width: `${activeTrack.uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {activeTrack.uploadSuccessMsg && !activeTrack.uploading && (
                    <div className="p-3 rounded-md bg-emerald-950/40 border border-emerald-700/60 text-xs text-emerald-200 flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                      <span>{activeTrack.uploadSuccessMsg}</span>
                    </div>
                  )}

                  {activeTrack.audioUrl && (
                    <div className="space-y-2 pt-2 border-t border-zinc-800/80 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-zinc-300 tabular-nums">
                          <span>Duration: {formatDuration(activeTrack.durationSeconds)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatBytes(activeTrack.audioSizeBytes)}</span>
                          {activeTrack.audioSampleRate > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{(activeTrack.audioSampleRate / 1000).toFixed(1).replace(/\.0$/, '')} kHz</span>
                            </>
                          )}
                          {activeTrack.audioBitDepth > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{activeTrack.audioBitDepth}-bit</span>
                            </>
                          )}
                          {activeTrack.audioChannels > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>
                                {activeTrack.audioChannels === 2
                                  ? 'Stereo'
                                  : activeTrack.audioChannels === 1
                                    ? 'Mono'
                                    : `${activeTrack.audioChannels}ch`}
                              </span>
                            </>
                          )}
                        </div>
                        <span className="text-[11px] text-zinc-400">{activeTrack.audioQualityNotes}</span>
                      </div>
                      {activeTrack.duplicateDetected &&
                        activeTrack.duplicateMatches &&
                        activeTrack.duplicateMatches.length > 0 && (
                          <div className="p-3 rounded-md bg-amber-950/35 border border-amber-700/60 text-[11px] text-amber-200 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                            <div>
                              <p className="font-semibold">Duplicate Audio Detected (SHA-256 Master Match)</p>
                              <p className="text-amber-300/90 mt-0.5">
                                Matches catalog track(s):{' '}
                                {activeTrack.duplicateMatches
                                  .map((m) => `"${m.trackTitle}" in "${m.releaseTitle}"`)
                                  .join(', ')}
                                . Ensure exclusive rights before submitting.
                              </p>
                            </div>
                          </div>
                        )}
                    </div>
                  )}
                </div>

                {/* 2. Primary Track Type & 3. Instrumental – Yes / No */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                      2. Primary Track Type *
                    </label>
                    <select
                      value={activeTrack.primaryTrackType}
                      onChange={(e) =>
                        updateTrack(activeTrackIdx, {
                          primaryTrackType: e.target.value,
                          songVersion: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                    >
                      {PRIMARY_TRACK_TYPES.map((pt) => (
                        <option key={pt} value={pt}>
                          {pt}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <span className="block text-xs font-medium text-zinc-300 mb-1.5">
                      3. Instrumental – Yes / No
                    </span>
                    <div className="inline-flex p-1 bg-[#09090B] border border-zinc-800 rounded-lg gap-1 w-full sm:w-auto">
                      {[
                        { label: 'No (Vocal)', val: false },
                        { label: 'Yes (Instrumental)', val: true },
                      ].map((opt) => (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() =>
                            updateTrack(activeTrackIdx, {
                              isInstrumental: opt.val,
                              parentalAdvisory: opt.val ? 'Non-Explicit' : activeTrack.parentalAdvisory,
                            })
                          }
                          className={`flex-1 sm:flex-initial px-4 py-2 min-h-[36px] rounded text-xs font-medium transition-colors cursor-pointer ${
                            activeTrack.isInstrumental === opt.val
                              ? 'bg-[#D4AF37] text-[#09090B] font-semibold'
                              : 'text-zinc-400 hover:text-zinc-100'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 4. Track Title, Track #, Disc #, 5. Remixer */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                  <div className="sm:col-span-5">
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">4. Track Title *</label>
                    <input
                      type="text"
                      required
                      value={activeTrack.title}
                      onChange={(e) => updateTrack(activeTrackIdx, { title: e.target.value })}
                      placeholder="Track name"
                      className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">5. Remixer</label>
                    <input
                      type="text"
                      value={activeTrack.remixer}
                      onChange={(e) => updateTrack(activeTrackIdx, { remixer: e.target.value })}
                      placeholder="Remixer name (if any)"
                      className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">Track #</label>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={activeTrack.trackNumber}
                      onChange={(e) =>
                        updateTrack(activeTrackIdx, { trackNumber: Math.max(1, Number(e.target.value) || 1) })
                      }
                      className="w-full px-3 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm font-mono text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">Disc #</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={activeTrack.discNumber}
                      onChange={(e) =>
                        updateTrack(activeTrackIdx, { discNumber: Math.max(1, Number(e.target.value) || 1) })
                      }
                      className="w-full px-3 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm font-mono text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                </div>

                {/* 6. Author, 7. Composer, 8. Music Director, 9. Producer, 10. Publisher */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">6. Author</label>
                    <input
                      type="text"
                      disabled={activeTrack.isInstrumental}
                      value={activeTrack.isInstrumental ? '' : activeTrack.author}
                      onChange={(e) => updateTrack(activeTrackIdx, { author: e.target.value })}
                      placeholder={activeTrack.isInstrumental ? 'N/A (Instrumental)' : 'Lyricist / Author'}
                      className="w-full px-3 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 disabled:opacity-50 focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">7. Composer</label>
                    <input
                      type="text"
                      value={activeTrack.composer}
                      onChange={(e) => updateTrack(activeTrackIdx, { composer: e.target.value })}
                      placeholder="Music composer"
                      className="w-full px-3 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">8. Music Director</label>
                    <input
                      type="text"
                      value={activeTrack.musicDirector}
                      onChange={(e) => updateTrack(activeTrackIdx, { musicDirector: e.target.value })}
                      placeholder="Music director"
                      className="w-full px-3 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">9. Producer</label>
                    <input
                      type="text"
                      value={activeTrack.producer}
                      onChange={(e) => updateTrack(activeTrackIdx, { producer: e.target.value })}
                      placeholder="Audio producer"
                      className="w-full px-3 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">10. Publisher</label>
                    <input
                      type="text"
                      value={activeTrack.publisher}
                      onChange={(e) => updateTrack(activeTrackIdx, { publisher: e.target.value })}
                      placeholder="Publishing entity"
                      className="w-full px-3 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                </div>

                {/* 11. ISRC, 12. UPC, 13. Caller Tune Start Time, 14. Parental Advisory */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">11. ISRC</label>
                    <input
                      type="text"
                      value={activeTrack.isrc}
                      onChange={(e) => updateTrack(activeTrackIdx, { isrc: e.target.value })}
                      placeholder="Leave blank to assign"
                      className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm font-mono text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">12. UPC</label>
                    <input
                      type="text"
                      value={upc}
                      onChange={(e) => setUpc(e.target.value)}
                      placeholder="Leave blank to assign"
                      className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm font-mono text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                      13. Caller Tune Start Time
                    </label>
                    <input
                      type="text"
                      value={activeTrack.callerTuneStartTime}
                      onChange={(e) => updateTrack(activeTrackIdx, { callerTuneStartTime: e.target.value })}
                      placeholder="00:30"
                      className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm font-mono text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">14. Parental Advisory</label>
                    <select
                      disabled={activeTrack.isInstrumental}
                      value={activeTrack.isInstrumental ? 'Non-Explicit' : activeTrack.parentalAdvisory}
                      onChange={(e) =>
                        updateTrack(activeTrackIdx, {
                          parentalAdvisory: e.target.value as 'Non-Explicit' | 'Explicit' | 'Clean / Edited',
                        })
                      }
                      className="w-full px-3 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 disabled:opacity-50 focus:outline-none focus:border-[#D4AF37]"
                    >
                      <option value="Non-Explicit">Non-Explicit</option>
                      <option value="Explicit">Explicit</option>
                      <option value="Clean / Edited">Clean / Edited</option>
                    </select>
                  </div>
                </div>

                {/* 15. Lyrics Language & 16. YouTube Content ID – Yes / No */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">15. Lyrics Language</label>
                    <select
                      disabled={activeTrack.isInstrumental}
                      value={
                        activeTrack.isInstrumental ? 'Instrumental (No Vocals)' : activeTrack.vocalLanguage
                      }
                      onChange={(e) => updateTrack(activeTrackIdx, { vocalLanguage: e.target.value })}
                      className="w-full px-3 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 disabled:opacity-50 focus:outline-none focus:border-[#D4AF37]"
                    >
                      {activeTrack.isInstrumental ? (
                        <option value="Instrumental (No Vocals)">Instrumental (No Vocals)</option>
                      ) : (
                        LANGUAGES.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <span className="block text-xs font-medium text-zinc-300 mb-1.5">
                      16. YouTube Content ID – Yes / No
                    </span>
                    <div className="inline-flex p-1 bg-[#09090B] border border-zinc-800 rounded-lg gap-1 w-full sm:w-auto">
                      {[
                        { label: 'Yes (Enable)', val: true },
                        { label: 'No', val: false },
                      ].map((opt) => (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => updateTrack(activeTrackIdx, { youtubeContentId: opt.val })}
                          className={`flex-1 sm:flex-initial px-5 py-2 min-h-[36px] rounded text-xs font-medium transition-colors cursor-pointer ${
                            activeTrack.youtubeContentId === opt.val
                              ? 'bg-[#D4AF37] text-[#09090B] font-semibold'
                              : 'text-zinc-400 hover:text-zinc-100'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 17. Lyrics */}
                {!activeTrack.isInstrumental && (
                  <div className="p-4 rounded-lg bg-[#09090B] border border-zinc-800 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-xs font-medium text-zinc-200">
                        17. Lyrics (Text &amp; Optional Sync File)
                      </span>
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[34px] rounded text-xs font-medium bg-[#111114] border border-zinc-700 hover:border-[#D4AF37] text-zinc-200 cursor-pointer">
                        <FileText className="w-3.5 h-3.5 text-[#D4AF37]" aria-hidden="true" />
                        <span>
                          {activeTrack.uploadingLyrics
                            ? 'Uploading Lyrics...'
                            : activeTrack.lyricsFilename
                              ? `File: ${activeTrack.lyricsFilename}`
                              : 'Upload Lyrics (.TXT/.LRC/.SRT/.PDF)'}
                        </span>
                        <input
                          type="file"
                          accept=".txt,.lrc,.srt,.pdf,text/plain,application/pdf"
                          onChange={(e) => handleTrackLyricsUpload(activeTrackIdx, e.target.files?.[0])}
                          className="sr-only"
                        />
                      </label>
                    </div>
                    <textarea
                      rows={4}
                      value={activeTrack.lyricsText}
                      onChange={(e) => updateTrack(activeTrackIdx, { lyricsText: e.target.value })}
                      placeholder="Paste full song lyrics (or upload a .TXT/.LRC/.PDF lyrics sheet)..."
                      className="w-full px-3.5 py-2.5 rounded-md bg-[#111114] border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                )}

                {/* Additional Contributor Artist Roles */}
                <div className="p-4 rounded-lg bg-[#09090B] border border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-zinc-200">Additional Contributor Roles</span>
                    <button
                      type="button"
                      onClick={() => addArtistRole(activeTrackIdx)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#E5C158] hover:underline cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Role Credit</span>
                    </button>
                  </div>
                  {activeTrack.artistRoles.length === 0 ? (
                    <p className="text-[11px] text-zinc-500">
                      Add extra performer, arranger, or featured artist credits if needed.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {activeTrack.artistRoles.map((roleItem, rIdx) => (
                        <div key={rIdx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                          <input
                            type="text"
                            value={roleItem.name}
                            onChange={(e) => updateArtistRole(activeTrackIdx, rIdx, { name: e.target.value })}
                            placeholder="Artist / Contributor Full Name"
                            className="sm:col-span-6 px-3 py-2 min-h-[38px] rounded bg-[#111114] border border-zinc-800 text-xs text-zinc-100"
                          />
                          <select
                            value={roleItem.role}
                            onChange={(e) => updateArtistRole(activeTrackIdx, rIdx, { role: e.target.value })}
                            className="sm:col-span-5 px-3 py-2 min-h-[38px] rounded bg-[#111114] border border-zinc-800 text-xs text-zinc-100"
                          >
                            {ARTIST_ROLE_TYPES.map((roleType) => (
                              <option key={roleType} value={roleType}>
                                {roleType}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => removeArtistRole(activeTrackIdx, rIdx)}
                            aria-label="Remove role credit"
                            className="sm:col-span-1 p-2 text-zinc-500 hover:text-rose-400 flex items-center justify-center cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Target Distribution Stores */}
            <section className="p-5 sm:p-6 rounded-xl border border-zinc-800 bg-[#111114]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="font-display text-base font-semibold text-zinc-100 mb-1">
                    Target Distribution Stores ({targetStores.length} / {activeStores.length} Selected)
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Selected stores start as Queued for Partner and only show LIVE after confirmed partner delivery.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setTargetStores(targetStores.length === activeStores.length ? [] : [...activeStores])
                  }
                  className="text-xs font-medium text-[#E5C158] hover:underline self-start sm:self-center cursor-pointer"
                >
                  {targetStores.length === activeStores.length
                    ? 'Clear All'
                    : `Select All ${activeStores.length} Stores`}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {activeStores.map((store) => {
                  const selected = targetStores.includes(store);
                  return (
                    <button
                      key={store}
                      type="button"
                      onClick={() => toggleStore(store)}
                      className={`flex items-center justify-between gap-2 px-3.5 py-2.5 min-h-[44px] rounded-md text-xs font-medium border text-left transition-colors cursor-pointer ${
                        selected
                          ? 'bg-[#D4AF37]/12 border-[#D4AF37]/40 text-[#F5E6B3]'
                          : 'bg-[#09090B] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <span className="truncate">{store}</span>
                      {selected && <Check className="w-3.5 h-3.5 text-[#E5C158] shrink-0" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </section>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep(1);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-md text-xs sm:text-sm font-medium text-zinc-200 bg-[#111114] border border-zinc-800 hover:border-[#D4AF37] cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 text-[#D4AF37]" aria-hidden="true" />
                <span>Previous Step</span>
              </button>
              <button
                type="button"
                onClick={handleGoToStep3}
                className="inline-flex items-center gap-2 px-6 py-2.5 min-h-[44px] rounded-md text-xs sm:text-sm font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] transition-colors cursor-pointer"
              >
                <span>Next: Step 3 of 3 – Track Review</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* ============================================================
            STEP 3 OF 3 – TRACK REVIEW
            ============================================================ */}
        {step === 3 && (
          <div className="space-y-6">
            <section className="p-5 sm:p-6 rounded-xl border border-zinc-800 bg-[#111114] space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
                <div>
                  <h3 className="font-display text-base font-semibold text-zinc-100">
                    Step 3 of 3 – Track Review
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Review all release and track metadata carefully before final submission to Palamu Entertainment
                    Industry.
                  </p>
                </div>
                <span className="text-xs font-mono text-[#E5C158] tabular-nums">
                  {tracks.length} Track{tracks.length === 1 ? '' : 's'} · {targetStores.length} Stores ·{' '}
                  {processingTier}
                </span>
              </div>

              {/* Release Summary Header with Artwork */}
              <div className="flex flex-col md:flex-row gap-6 items-start">
                <div className="w-36 h-36 rounded-xl overflow-hidden border border-zinc-800 bg-[#09090B] shrink-0">
                  <SafeImage
                    src={coverUrl || ASSETS.releaseFallback}
                    fallbackSrc={ASSETS.releaseFallback}
                    alt={title || 'Release Cover'}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Items 1 – 15 Release Information Review */}
                <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 text-xs">
                  <div>
                    <span className="text-zinc-500 block">1. Release Title</span>
                    <span className="font-semibold text-zinc-100">{title || '—'}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">2. Version / Subtitle</span>
                    <span className="text-zinc-200">{releaseVersion || 'Original'}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">3. Primary Artist</span>
                    <span className="text-zinc-200">
                      {primaryArtistsJoined || primaryArtistInput.trim() || (variousArtists ? 'Various Artists' : '—')}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">4. Featuring Artist</span>
                    <span className="text-zinc-200">{featuredArtists || '—'}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">5. Various Artists</span>
                    <span className="text-zinc-200">{variousArtists ? 'Yes (Compilation)' : 'No'}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">6. Genre</span>
                    <span className="text-zinc-200">{genre}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">7. Subgenre</span>
                    <span className="text-zinc-200">{subgenre}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">8. Label</span>
                    <span className="text-zinc-200">{labelName}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">9. Format</span>
                    <span className="text-zinc-200">{releaseType}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">10. Main Release Date</span>
                    <span className="font-mono tabular-nums text-zinc-200">
                      {formatDateDDMMYYYY(releaseDate)}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">11. Original Release Date</span>
                    <span className="font-mono tabular-nums text-zinc-200">
                      {formatDateDDMMYYYY(originalReleaseDate)}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">12. Production Year</span>
                    <span className="font-mono tabular-nums text-zinc-200">{productionYear}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">13. P Line</span>
                    <span className="text-zinc-200">{pLine}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">14. C Line</span>
                    <span className="text-zinc-200">{cLine}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">15. Catalogue Number</span>
                    <span className="font-mono text-zinc-200">{catalogueNumber || 'Auto / Unassigned'}</span>
                  </div>
                </div>
              </div>

              {/* Target Stores Summary */}
              <div className="p-4 rounded-lg bg-[#09090B] border border-zinc-800 text-xs space-y-1.5">
                <span className="text-zinc-400 font-medium block">
                  Distribution Platforms ({targetStores.length} Selected) · {processingTier} · {releaseScheduleMode}
                </span>
                <p className="text-zinc-200 leading-relaxed">{targetStores.join(' · ')}</p>
              </div>

              {/* Items 16 – 31 Track Review Cards */}
              <div className="space-y-4">
                <h4 className="font-display text-sm font-semibold text-[#E5C158] flex items-center gap-2">
                  <Music className="w-4 h-4" aria-hidden="true" />
                  <span>Track Review ({tracks.length} Track{tracks.length === 1 ? '' : 's'})</span>
                </h4>

                {tracks.map((tr, tIdx) => (
                  <div key={tIdx} className="p-5 rounded-xl bg-[#09090B] border border-zinc-800 space-y-4 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-zinc-800">
                      <span className="font-mono font-semibold text-[#E5C158]">
                        Track #{tr.trackNumber} · Disc {tr.discNumber}
                      </span>
                      <span className="text-zinc-400 font-mono">
                        {tr.audioFilename || 'No audio file uploaded'}
                        {tr.durationSeconds > 0 ? ` · ${formatDuration(tr.durationSeconds)}` : ''}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3.5">
                      <div>
                        <span className="text-zinc-500 block">16. Primary Track Type</span>
                        <span className="text-zinc-200">{tr.primaryTrackType}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">17. Instrumental</span>
                        <span className="text-zinc-200">{tr.isInstrumental ? 'Yes' : 'No'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">18. YouTube Content ID</span>
                        <span className="text-zinc-200">{tr.youtubeContentId ? 'Yes' : 'No'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">19. Track Title</span>
                        <span className="font-semibold text-zinc-100">{tr.title || '—'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">20. Remixer</span>
                        <span className="text-zinc-200">{tr.remixer || '—'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">21. Author</span>
                        <span className="text-zinc-200">{tr.isInstrumental ? 'N/A (Instrumental)' : tr.author || '—'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">22. Composer</span>
                        <span className="text-zinc-200">{tr.composer || '—'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">23. Music Director</span>
                        <span className="text-zinc-200">{tr.musicDirector || '—'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">24. Producer</span>
                        <span className="text-zinc-200">{tr.producer || '—'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">25. Publisher</span>
                        <span className="text-zinc-200">{tr.publisher || '—'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">26. ISRC</span>
                        <span className="font-mono text-zinc-200">{tr.isrc || 'Auto / Pending'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">27. UPC</span>
                        <span className="font-mono text-zinc-200">{upc || 'Auto / Pending'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">28. Preview Start</span>
                        <span className="font-mono tabular-nums text-zinc-200">{tr.callerTuneStartTime || '00:00'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">29. Parental Advisory</span>
                        <span className="text-zinc-200">
                          {tr.isInstrumental ? 'Non-Explicit' : tr.parentalAdvisory}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">30. Lyrics Language</span>
                        <span className="text-zinc-200">
                          {tr.isInstrumental ? 'Instrumental (No Vocals)' : tr.vocalLanguage}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">Audio Quality Inspection</span>
                        <span className="text-zinc-200">{tr.audioQualityStatus || 'Pending Upload'}</span>
                      </div>
                    </div>

                    {/* 31. Lyrics Review */}
                    <div className="pt-3 border-t border-zinc-800/80">
                      <span className="text-zinc-500 block mb-1.5">31. Lyrics</span>
                      {tr.isInstrumental ? (
                        <p className="text-zinc-400">Instrumental track (no vocals / lyrics).</p>
                      ) : tr.lyricsText || tr.lyricsFilename ? (
                        <div className="space-y-1.5">
                          {tr.lyricsFilename && (
                            <p className="text-[#E5C158] font-mono">Attached File: {tr.lyricsFilename}</p>
                          )}
                          {tr.lyricsText && (
                            <pre className="p-3 rounded bg-[#111114] border border-zinc-800 text-zinc-300 whitespace-pre-wrap max-h-40 overflow-y-auto font-sans">
                              {tr.lyricsText}
                            </pre>
                          )}
                        </div>
                      ) : (
                        <p className="text-zinc-500">No lyrics entered.</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* 32. Previous Step & 33. Submit */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep(2);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-md text-xs sm:text-sm font-medium text-zinc-200 bg-[#111114] border border-zinc-800 hover:border-[#D4AF37] cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 text-[#D4AF37]" aria-hidden="true" />
                <span>32. Previous Step</span>
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-7 py-2.5 min-h-[44px] rounded-md text-xs sm:text-sm font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] disabled:opacity-60 transition-colors cursor-pointer"
              >
                <Check className="w-4 h-4" aria-hidden="true" />
                <span>{submitting ? 'Submitting Release...' : '33. Submit Release'}</span>
              </button>
            </div>
          </div>
        )}
      </form>
    </DashboardLayout>
  );
}

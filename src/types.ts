export type UserRole = 'artist' | 'admin';

export interface UserProfile {
  id: number;
  full_name: string;
  stage_name?: string;
  country?: string;
  mobile?: string;
  email: string;
  role: UserRole;
  avatar_url?: string;
  payout_method?: string;
  payout_details?: string;
  verification_status?: 'Unverified' | 'Pending Verification' | 'Verified' | 'Rejected';
  verification_doc_url?: string;
  verification_notes?: string;
  otp_verified?: number;
  account_protected?: number;
  bio?: string;
  created_at?: string;
}

export interface ArtistKycRecord {
  user_id: number;
  legal_name: string;
  mobile: string;
  email: string;
  full_address: string;
  aadhaar_masked: string;
  pan_masked: string;
  has_aadhaar_front: boolean;
  has_aadhaar_back: boolean;
  has_pan_card: boolean;
  notes: string;
  consent_accepted: boolean;
  consent_timestamp: string;
  kyc_status: 'Unverified' | 'Pending Verification' | 'Verified' | 'Rejected';
  reviewer_notes: string;
  reviewed_at: string;
  updated_at: string;
}

export interface AdminArtistKycDetail extends ArtistKycRecord {
  aadhaar_number: string;
  pan_number: string;
  legacy_doc_url: string;
}

export type AgreementStatus = 'Pending' | 'Sent' | 'Signed' | 'Approved';

export interface SongAgreementItem {
  id: number;
  agreement_code: string;
  release_id: number;
  track_id: number;
  artist_id: number;
  artist_name: string;
  singer_name: string;
  song_title: string;
  music_director: string;
  lyricist: string;
  composer: string;
  label_name: string;
  release_details: {
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
  agreement_date: string;
  status: AgreementStatus;
  sent_via: string;
  sent_at: string;
  has_signed_pdf: boolean;
  signed_pdf_original_name: string;
  signed_uploaded_at: string;
  approved_at: string;
  admin_notes: string;
  artist_mobile?: string;
  artist_email?: string;
  artist_verification_status?: string;
  release_status?: string;
  audio_quality_status?: string;
  created_at: string;
  updated_at: string;
}

export interface ArtistSubAccount {
  id: number;
  owner_user_id: number;
  artist_name: string;
  country: string;
  genre: string;
  bio: string;
  instagram_url: string;
  spotify_url: string;
  youtube_url: string;
  verification_status: string;
  created_at: string;
}

export type ReleaseStatus = 'Pending Review' | 'Approved' | 'Live' | 'Rejected';

export type PlatformDeliveryStatus =
  | 'Not Submitted'
  | 'Queued for Partner'
  | 'In Review'
  | 'LIVE'
  | 'Rejected'
  | 'Takedown';

export interface PlatformDeliveryItem {
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

export interface DistributionPlatformConfig {
  id: number;
  name: string;
  category: string;
  is_enabled: number;
  partner_notes: string;
  updated_at: string;
}

export interface ArtistRoleCredit {
  name: string;
  role: string;
}

export interface ArtistLabelItem {
  id: number;
  artist_id: number;
  label_name: string;
  created_at: string;
}

export interface TrackItem {
  id: number;
  release_id: number;
  artist_id: number;
  track_number: number;
  disc_number: number;
  title: string;
  song_version: string;
  primary_track_type?: string;
  remixer?: string;
  author?: string;
  music_director?: string;
  producer?: string;
  publisher?: string;
  caller_tune_start_time?: string;
  parental_advisory?: string;
  youtube_content_id?: number;
  isrc: string;
  duration_seconds: number;
  explicit: number;
  is_instrumental: number;
  vocal_language: string;
  composer: string;
  lyricist: string;
  artist_roles?: ArtistRoleCredit[];
  lyrics_text?: string;
  lyrics_filename?: string;
  lyrics_url?: string;
  audio_filename: string;
  audio_url: string;
  audio_mime?: string;
  audio_size_bytes?: number;
  audio_sample_rate?: number;
  audio_bit_depth?: number;
  audio_channels?: number;
  audio_quality_status?: string;
  audio_quality_notes?: string;
  audio_sha256?: string;
  status: string;
  created_at: string;
}

export interface ReleaseItem {
  id: number;
  artist_id: number;
  title: string;
  release_version?: string;
  release_type: 'Single' | 'EP' | 'Album';
  primary_artist: string;
  featured_artists: string;
  various_artists?: number;
  genre: string;
  subgenre?: string;
  language: string;
  release_date: string;
  original_release_date?: string;
  production_year?: string;
  label_name: string;
  upc: string;
  p_line?: string;
  c_line?: string;
  copyright_owner?: string;
  copyright_year?: string;
  catalogue_number?: string;
  music_director?: string;
  producer?: string;
  processing_tier?: 'Standard' | 'Fast Track';
  release_schedule_mode?: 'Scheduled' | 'Instant Request';
  status: ReleaseStatus;
  admin_notes: string;
  target_stores: string[];
  platform_deliveries?: PlatformDeliveryItem[];
  delivery_mode: string;
  cover_url: string;
  smart_link_slug?: string;
  smart_link_clicks?: number;
  track_count?: number;
  tracks?: TrackItem[];
  artist_account_name?: string;
  artist_email?: string;
  artist_mobile?: string;
  artist_country?: string;
  created_at: string;
  updated_at: string;
}

export interface ReleaseChangeRequest {
  id: number;
  release_id: number;
  release_title?: string;
  artist_id: number;
  artist_name?: string;
  artist_email?: string;
  request_type: 'Update' | 'Takedown';
  details: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Completed' | 'Rejected';
  admin_notes: string;
  created_at: string;
  updated_at: string;
}

export interface ArtistServiceRequest {
  id: number;
  artist_id: number;
  artist_name?: string;
  artist_email?: string;
  release_id: number | null;
  release_title?: string | null;
  service_type: string;
  budget_note: string;
  target_links: string;
  brief: string;
  status: 'Submitted' | 'In Review' | 'Active' | 'Completed' | 'Declined';
  admin_notes: string;
  created_at: string;
  updated_at: string;
}

export interface SupportChatMessage {
  id: number;
  session_key: string;
  user_id: number | null;
  sender_role: 'artist' | 'visitor' | 'admin';
  sender_name: string;
  message: string;
  created_at: string;
}

export interface LoginHistoryItem {
  id: number;
  user_id: number | null;
  role: string;
  identifier: string;
  login_method: string;
  ip_address: string;
  user_agent: string;
  status: string;
  created_at: string;
}

export interface SystemBackupItem {
  id: number;
  filename: string;
  size_bytes: number;
  trigger_type: string;
  created_at: string;
}

export interface SiteSettings {
  brand_tagline: string;
  announcement_banner: string;
  latest_update_text: string;
  whatsapp_number: string;
  support_phone: string;
  support_email: string;
}

export interface NotificationItem {
  id: number;
  user_id: number;
  title: string;
  message: string;
  category: 'release' | 'delivery' | 'royalty' | 'payout' | 'support' | 'security' | 'service';
  is_read: number;
  created_at: string;
}

export interface ArtistOverviewMetrics {
  totalSongs: number;
  liveSongs: number;
  pendingSongs: number;
  rejectedSongs: number;
  totalReleases: number;
  liveReleases: number;
  approvedReleases?: number;
  pendingReleases: number;
  rejectedReleases: number;
  verifiedEarnings: number;
  availableBalance: number;
  totalPaidOut: number;
  pendingPayouts: number;
  totalStreams?: number;
  liveStoreDeliveries?: number;
  totalStoreDeliveries?: number;
  unreadNotifications?: number;
}

export interface SmartLinkItem {
  id: number;
  release_id: number;
  artist_id: number;
  slug: string;
  headline: string;
  subtitle: string;
  spotify_url: string;
  apple_music_url: string;
  youtube_music_url: string;
  jiosaavn_url: string;
  gaana_url: string;
  wynk_url: string;
  amazon_music_url: string;
  hungama_music_url: string;
  deezer_url?: string;
  facebook_music_url: string;
  instagram_music_url: string;
  tiktok_music_url: string;
  airtel_music_url: string;
  vodafone_music_url: string;
  other_platforms_url?: string;
  clicks: number;
  release_title?: string;
  primary_artist?: string;
  featured_artists?: string;
  cover_url?: string;
  release_status?: string;
  release_date?: string;
  genre?: string;
  language?: string;
  label_name?: string;
  tracks?: TrackItem[];
  created_at: string;
}

export interface ArtistBalanceSummary {
  verifiedEarnings: number;
  totalPaidOut: number;
  pendingPayouts: number;
  availableBalance: number;
}

export interface RoyaltyEntry {
  id: number;
  artist_id: number;
  release_id: number | null;
  release_title?: string | null;
  artist_name?: string;
  artist_email?: string;
  store_name: string;
  period: string;
  entry_date?: string;
  streams: number;
  amount_inr: number;
  reference_note: string;
  status: string;
  created_at: string;
}

export interface PayoutRequest {
  id: number;
  artist_id: number;
  artist_name?: string;
  artist_email?: string;
  artist_mobile?: string;
  amount_inr: number;
  payment_method: string;
  account_summary: string;
  status: 'Requested' | 'Processing' | 'Paid' | 'Declined';
  admin_reference: string;
  created_at: string;
  updated_at: string;
}

export interface SupportTicket {
  id: number;
  user_id: number | null;
  name: string;
  email: string;
  phone: string;
  subject: string;
  category: string;
  message: string;
  status: 'Open' | 'In Progress' | 'Resolved';
  admin_reply: string;
  created_at: string;
  updated_at: string;
}

export type AppView =
  | 'home'
  | 'artist-auth'
  | 'admin-auth'
  | 'artist-dashboard'
  | 'create-release'
  | 'my-releases'
  | 'payments'
  | 'smart-links'
  | 'services'
  | 'account-security'
  | 'support'
  | 'admin-dashboard'
  | 'public-smart-link'
  | 'terms'
  | 'privacy'
  | 'copyright';

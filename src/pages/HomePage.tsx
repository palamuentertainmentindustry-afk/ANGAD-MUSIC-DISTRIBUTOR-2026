import { useEffect, useState } from 'react';
import { ArrowRight, Clock, Disc3, Link2, Mail, MessageCircle, Phone, ShieldCheck, Wallet, Zap } from 'lucide-react';
import { SafeImage } from '../components/SafeImage.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { ASSETS, COMPANY_INFO } from '../lib/assets.ts';
import type { AppView, SiteSettings } from '../types.ts';

interface HomePageProps {
  onNavigate: (view: AppView, opts?: { authMode?: 'login' | 'register' }) => void;
}

export function HomePage({ onNavigate }: HomePageProps) {
  const { user } = useAuth();
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactSubject, setContactSubject] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    apiFetch<{ settings: SiteSettings }>('/api/site-settings')
      .then((res) => setSiteSettings(res.settings))
      .catch(() => {});
  }, []);

  const handlePrimaryPortal = () => {
    if (user?.role === 'admin') {
      onNavigate('admin-dashboard');
    } else if (user?.role === 'artist') {
      onNavigate('artist-dashboard');
    } else {
      onNavigate('artist-auth', { authMode: 'login' });
    }
  };

  const handleInquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSubmitting(true);
    try {
      await apiFetch('/api/support', {
        method: 'POST',
        body: {
          name: contactName,
          email: contactEmail,
          phone: contactPhone,
          subject: contactSubject,
          category: 'Label Onboarding',
          message: contactMessage,
        },
      });
      setFeedback({
        type: 'success',
        text: 'Your inquiry has been logged with Palamu Entertainment Industry. Our A&R team will respond shortly.',
      });
      setContactName('');
      setContactEmail('');
      setContactPhone('');
      setContactSubject('');
      setContactMessage('');
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not send inquiry.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100">
      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 bg-[#09090B]/95 backdrop-blur-md border-b border-zinc-800/80">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-8 h-16 sm:h-[76px] flex items-center justify-between gap-3 sm:gap-8">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 shrink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded-lg cursor-pointer"
          >
            <SafeImage
              src={ASSETS.brandEmblem}
              alt="ANGAD MUSIC DISTRIBUTOR logo"
              className="w-11 h-11 sm:w-14 sm:h-14 rounded-lg object-contain bg-black border border-[#D4AF37]/45 p-0.5 shrink-0 shadow-[0_0_16px_rgba(212,175,55,0.16)]"
            />
            <span className="font-display text-xs sm:text-base lg:text-lg font-semibold tracking-tight text-zinc-100 whitespace-nowrap truncate">
              {COMPANY_INFO.brandName}
            </span>
          </button>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-400" aria-label="Primary">
            <a
              href="#capabilities"
              className="hover:text-[#E5C158] transition-colors whitespace-nowrap shrink-0"
            >
              Capabilities
            </a>
            <a
              href="#royalties"
              className="hover:text-[#E5C158] transition-colors whitespace-nowrap shrink-0"
            >
              Royalties
            </a>
            <a
              href="#smart-links"
              className="hover:text-[#E5C158] transition-colors whitespace-nowrap shrink-0"
            >
              Smart Links
            </a>
            <a
              href="#support-desk"
              className="hover:text-[#E5C158] transition-colors whitespace-nowrap shrink-0"
            >
              Support
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handlePrimaryPortal}
              className="px-4 py-2 min-h-[40px] rounded-md text-xs sm:text-sm font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {user ? 'Open Workspace' : 'Artist Portal'}
            </button>
          </div>
        </div>
      </header>

      {/* Optional Admin Announcement Strip */}
      {siteSettings?.announcement_banner && (
        <div className="border-b border-[#D4AF37]/30 bg-[#141310] px-5 py-2.5 text-center text-xs text-[#F5E6B3]">
          {siteSettings.announcement_banner}
        </div>
      )}

      {/* Hero Split */}
      <section className="max-w-[1320px] mx-auto px-5 sm:px-8 pt-10 pb-14 lg:pt-16 lg:pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-between py-2">
            <div>
              <p className="text-xs font-medium tracking-wider text-[#D4AF37] uppercase mb-4">
                {siteSettings?.brand_tagline || COMPANY_INFO.parentCompany}
              </p>
              <h1
                className="font-display font-semibold tracking-tight text-zinc-50 leading-[1.08] mb-6"
                style={{ fontSize: 'clamp(2.25rem, 4vw, 3.65rem)', textWrap: 'balance' }}
              >
                Independent Music Distribution Built for Serious Catalogs.
              </h1>
              <p className="text-base sm:text-lg text-zinc-400 leading-relaxed max-w-xl mb-8">
                Submit studio masters, manage release metadata and ISRC/UPC identifiers, publish custom Smart Links, and
                track verified INR royalty settlements under one transparent label workspace.
              </p>

              <div className="flex flex-wrap items-center gap-5 mb-8">
                <button
                  type="button"
                  onClick={() => onNavigate('artist-auth', { authMode: 'register' })}
                  className="inline-flex items-center gap-2 px-6 py-3 min-h-[44px] rounded-md text-sm font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] transition-colors whitespace-nowrap cursor-pointer"
                >
                  <span>Create Artist Account</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('artist-auth', { authMode: 'login' })}
                  className="text-sm font-medium text-zinc-200 hover:text-[#E5C158] underline underline-offset-4 decoration-zinc-700 hover:decoration-[#E5C158] transition-colors min-h-[44px] px-2 cursor-pointer"
                >
                  Artist Sign In
                </button>
                <span className="text-zinc-700" aria-hidden="true">
                  ·
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('admin-auth')}
                  className="text-sm font-medium text-zinc-400 hover:text-zinc-100 transition-colors min-h-[44px] px-2 cursor-pointer"
                >
                  Admin Login
                </button>
              </div>
            </div>

            <div className="pt-6 border-t border-zinc-800/80 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-zinc-400">
              <span>Single, EP & Album Intake</span>
              <span aria-hidden="true">·</span>
              <span>Human Metadata QA</span>
              <span aria-hidden="true">·</span>
              <span>Verified INR Payout Ledger</span>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="relative h-full min-h-[300px] lg:min-h-[460px] rounded-xl overflow-hidden border border-zinc-800 bg-[#121215]">
              <SafeImage
                src={ASSETS.heroStudio}
                alt="Mastering console inside Palamu Entertainment Industry studio"
                className="w-full h-full lg:h-full object-cover"
              />
              <div
                className="absolute inset-0 bg-gradient-to-t from-[#09090B]/90 via-[#09090B]/20 to-transparent"
                aria-hidden="true"
              />
              <div className="absolute bottom-0 inset-x-0 p-6 flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-[#E5C158] mb-1">Label Operations Studio</p>
                  <p className="text-sm text-zinc-200 max-w-md">
                    Every release undergoes audio, artwork, and ownership verification before partner fulfillment.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4-Column Operational Strip below Hero Split */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-zinc-800 rounded-xl bg-[#111114] divide-y sm:divide-y-0 sm:divide-x divide-zinc-800">
          <div className="p-6">
            <p className="font-mono text-2xl font-semibold text-[#E5C158] tabular-nums mb-1">100%</p>
            <p className="text-sm font-medium text-zinc-100">Master Ownership</p>
            <p className="text-xs text-zinc-400 mt-1">Artists retain full creative rights and transparent reporting.</p>
          </div>
          <div className="p-6">
            <p className="font-mono text-2xl font-semibold text-zinc-100 tabular-nums mb-1">ISRC / UPC</p>
            <p className="text-sm font-medium text-zinc-100">Catalog Identifiers</p>
            <p className="text-xs text-zinc-400 mt-1">Assigned and tracked per release and per individual track.</p>
          </div>
          <div className="p-6">
            <p className="font-mono text-2xl font-semibold text-zinc-100 tabular-nums mb-1">Manual QA</p>
            <p className="text-sm font-medium text-zinc-100">Label Verification</p>
            <p className="text-xs text-zinc-400 mt-1">Real review workflow by Palamu Entertainment Industry.</p>
          </div>
          <div className="p-6">
            <p className="font-mono text-2xl font-semibold text-zinc-100 tabular-nums mb-1">₹500 Min</p>
            <p className="text-sm font-medium text-zinc-100">Verified Payouts</p>
            <p className="text-xs text-zinc-400 mt-1">Withdraw verified royalty balances via UPI or Bank Transfer.</p>
          </div>
        </div>
      </section>

      {/* FAST MUSIC DISTRIBUTION Showcase */}
      <section id="fast-distribution" className="border-t border-zinc-800/80 bg-[#0D0D10]">
        <div className="max-w-[1320px] mx-auto px-5 sm:px-8 py-14 lg:py-16">
          <div className="rounded-xl border border-[#D4AF37]/35 bg-gradient-to-br from-[#141310] via-[#111114] to-[#09090B] p-6 sm:p-10">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
              <div className="lg:col-span-7 space-y-5">
                <div className="flex items-center gap-2.5 text-xs font-semibold tracking-wider text-[#E5C158] uppercase">
                  <Zap className="w-4 h-4 text-[#D4AF37] shrink-0" aria-hidden="true" />
                  <span>Your Music, Our Priority</span>
                </div>

                <h2
                  className="font-display font-semibold tracking-tight text-zinc-50 leading-[1.12]"
                  style={{ fontSize: 'clamp(1.75rem, 3.2vw, 2.75rem)', textWrap: 'balance' }}
                >
                  FAST MUSIC DISTRIBUTION – 4–5 DAYS*
                </h2>

                <p className="text-sm sm:text-base text-zinc-300 leading-relaxed max-w-2xl">
                  Fast-track release processing with priority quality review. Eligible releases may be processed within
                  4–5 working days after complete submission and QC approval. Actual store publishing time depends on
                  partner and platform approval.
                </p>

                <p className="text-xs text-[#E5C158]/90 font-medium">
                  *Timeline is an estimate, not a guaranteed live date.
                </p>

                <div className="pt-2 flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={() =>
                      user?.role === 'artist'
                        ? onNavigate('create-release')
                        : onNavigate('artist-auth', { authMode: 'register' })
                    }
                    className="inline-flex items-center gap-2 px-5 py-3 min-h-[44px] rounded-md text-sm font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] transition-colors cursor-pointer"
                  >
                    <span>Select Fast Track in Release Intake</span>
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="lg:col-span-5 border border-zinc-800 rounded-xl bg-[#09090B]/90 divide-y divide-zinc-800/80">
                <div className="p-5 flex items-start gap-3.5">
                  <span className="font-mono text-sm font-semibold text-[#E5C158] tabular-nums shrink-0 mt-0.5">
                    01
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">Complete Metadata &amp; Master Submission</p>
                    <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                      Submit verified WAV/FLAC audio, 3000×3000px artwork, P-Line/C-Line rights, and select Fast Track
                      Release inside the intake form.
                    </p>
                  </div>
                </div>
                <div className="p-5 flex items-start gap-3.5">
                  <span className="font-mono text-sm font-semibold text-[#E5C158] tabular-nums shrink-0 mt-0.5">
                    02
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                      <span>Priority QC Review (4–5 Working Days*)</span>
                      <Clock className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" aria-hidden="true" />
                    </p>
                    <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                      Eligible releases receive prioritized manual inspection from Palamu Entertainment Industry before
                      partner handoff.
                    </p>
                  </div>
                </div>
                <div className="p-5 flex items-start gap-3.5">
                  <span className="font-mono text-sm font-semibold text-[#E5C158] tabular-nums shrink-0 mt-0.5">
                    03
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">Partner &amp; Store Publishing Approval</p>
                    <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                      Each DSP updates to LIVE only after real distribution partner confirmation—never simulated.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities Section */}
      <section id="capabilities" className="max-w-[1320px] mx-auto px-5 sm:px-8 py-14 border-t border-zinc-800/80">
        <div className="max-w-2xl mb-10">
          <p className="text-xs font-medium text-[#D4AF37] mb-2">Platform Architecture</p>
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-100">
            Four Core Pillars of Your Distribution Workspace
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 p-7 rounded-xl border border-zinc-800 bg-[#111114] flex flex-col justify-between gap-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-xl font-semibold text-zinc-100 mb-2">
                  01. Studio Release & Master Intake
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed max-w-xl">
                  Upload WAV, FLAC, or MP3 audio masters (Single, EP, Album &amp; Bulk Upload) alongside cover artwork,
                  automatic audio quality validation, duplicate SHA-256 checking, and release scheduling. Track separate
                  delivery status across Spotify, YouTube Music, Apple Music, Amazon Music, JioSaavn, Instagram Music,
                  Facebook Music, Deezer, Hungama Music, Gaana, Wynk Music, TikTok Music, Airtel Music, Vodafone Music,
                  and Other Available Platforms—marking LIVE only after partner confirmation.
                </p>
              </div>
              <Disc3 className="w-6 h-6 text-[#D4AF37] shrink-0" aria-hidden="true" />
            </div>
            <div className="pt-4 border-t border-zinc-800/80 flex flex-wrap gap-x-6 gap-y-2 text-xs text-zinc-400">
              <span>15+ Global, Social & Telco Stores</span>
              <span aria-hidden="true">·</span>
              <span>Per-platform delivery status</span>
              <span aria-hidden="true">·</span>
              <span>Partner-verified LIVE tracking</span>
            </div>
          </div>

          <div
            id="smart-links"
            className="p-7 rounded-xl border border-zinc-800 bg-[#111114] flex flex-col justify-between gap-6"
          >
            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <h3 className="font-display text-xl font-semibold text-zinc-100">02. Smart Links</h3>
                <Link2 className="w-5 h-5 text-[#D4AF37] shrink-0" aria-hidden="true" />
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Generate custom shareable release pages routing fans directly to Spotify, Apple Music, YouTube Music,
                JioSaavn, Gaana, Wynk, and Amazon Music with live click tracking.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('artist-auth', { authMode: 'register' })}
              className="text-left text-xs font-semibold text-[#E5C158] hover:underline cursor-pointer"
            >
              Claim your artist link →
            </button>
          </div>

          <div
            id="royalties"
            className="p-7 rounded-xl border border-zinc-800 bg-[#111114] flex flex-col justify-between gap-6"
          >
            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <h3 className="font-display text-xl font-semibold text-zinc-100">03. Verified Royalty Ledger</h3>
                <Wallet className="w-5 h-5 text-[#D4AF37] shrink-0" aria-hidden="true" />
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Zero inflated or simulated numbers. Balances reflect only verified store statements entered by label
                accounting, with full payout request and UTR reference history.
              </p>
            </div>
            <p className="text-xs text-zinc-500">INR accounting · UPI & Bank Transfer</p>
          </div>

          <div className="md:col-span-2 p-7 rounded-xl border border-zinc-800 bg-[#111114] flex flex-col justify-between gap-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-xl font-semibold text-zinc-100 mb-2">
                  04. Dedicated Label Administration & Honest Store Pipeline
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed max-w-xl">
                  Separate secure Administrator Console for Palamu Entertainment Industry to audit submissions, mark
                  releases Live with verified store links or reject with actionable notes, credit real royalty reports,
                  and resolve artist support tickets.
                </p>
              </div>
              <ShieldCheck className="w-6 h-6 text-[#D4AF37] shrink-0" aria-hidden="true" />
            </div>
            <div className="pt-4 border-t border-zinc-800/80 flex items-center justify-between gap-4">
              <span className="text-xs text-zinc-400">Role-isolated authentication for Artists and Admins</span>
              <button
                type="button"
                onClick={() => onNavigate('admin-auth')}
                className="text-xs font-semibold text-[#E5C158] hover:underline whitespace-nowrap cursor-pointer"
              >
                Admin Console →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Support & Direct Label Contact */}
      <section id="support-desk" className="max-w-[1320px] mx-auto px-5 sm:px-8 py-14 border-t border-zinc-800/80">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-5 space-y-6">
            <div>
              <p className="text-xs font-medium text-[#D4AF37] mb-2">Artist & Label Desk</p>
              <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-100 mb-3">
                Direct Support from Palamu Entertainment Industry
              </h2>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Questions about release clearances, ISRC assignments, copyright claims, or royalty payouts? Reach our
                distribution desk directly or submit a tracked support ticket.
              </p>
            </div>

            <div className="space-y-4 pt-4 border-t border-zinc-800/80">
              <a
                href={`tel:+91${siteSettings?.support_phone || COMPANY_INFO.phone}`}
                className="flex items-center gap-3 text-sm text-zinc-200 hover:text-[#E5C158] transition-colors"
              >
                <Phone className="w-4 h-4 text-[#D4AF37] shrink-0" aria-hidden="true" />
                <span className="font-mono tabular-nums">{siteSettings?.support_phone || COMPANY_INFO.phone}</span>
              </a>
              <a
                href={`https://wa.me/${siteSettings?.whatsapp_number || COMPANY_INFO.whatsapp}?text=${encodeURIComponent(
                  'Hello ANGAD MUSIC DISTRIBUTOR / PALAMU ENTERTAINMENT INDUSTRY support team.'
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 text-sm text-zinc-200 hover:text-emerald-400 transition-colors"
              >
                <MessageCircle className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                <span>WhatsApp Support (+91 {siteSettings?.support_phone || COMPANY_INFO.phone})</span>
              </a>
              <a
                href={`mailto:${siteSettings?.support_email || COMPANY_INFO.email}`}
                className="flex items-center gap-3 text-sm text-zinc-200 hover:text-[#E5C158] transition-colors break-all"
              >
                <Mail className="w-4 h-4 text-[#D4AF37] shrink-0" aria-hidden="true" />
                <span>{siteSettings?.support_email || COMPANY_INFO.email}</span>
              </a>
            </div>
          </div>

          <div className="lg:col-span-7">
            <form
              onSubmit={handleInquirySubmit}
              className="p-6 sm:p-8 rounded-xl border border-zinc-800 bg-[#111114] space-y-4"
            >
              <h3 className="font-display text-lg font-semibold text-zinc-100">Send an Inquiry</h3>

              {feedback && (
                <div
                  className={`p-3.5 rounded-md text-sm border ${
                    feedback.type === 'success'
                      ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                      : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                  }`}
                >
                  {feedback.text}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="home-name">
                    Full Name
                  </label>
                  <input
                    id="home-name"
                    type="text"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Your name"
                    className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="home-email">
                    Email Address
                  </label>
                  <input
                    id="home-email"
                    type="email"
                    required
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="artist@example.com"
                    className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="home-phone">
                    Mobile Number
                  </label>
                  <input
                    id="home-phone"
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+91 9939149838"
                    className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="home-subject">
                    Subject
                  </label>
                  <input
                    id="home-subject"
                    type="text"
                    required
                    value={contactSubject}
                    onChange={(e) => setContactSubject(e.target.value)}
                    placeholder="Release inquiry or label partnership"
                    className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="home-message">
                  Message
                </label>
                <textarea
                  id="home-message"
                  rows={3}
                  required
                  value={contactMessage}
                  onChange={(e) => setContactMessage(e.target.value)}
                  placeholder="Describe your release or question..."
                  className="w-full px-3.5 py-2.5 rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 min-h-[44px] rounded-md text-sm font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] disabled:opacity-60 transition-colors cursor-pointer"
                >
                  {submitting ? 'Submitting...' : 'Submit Inquiry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="border-t border-zinc-800/80 bg-[#09090B]">
        <div className="max-w-[1320px] mx-auto px-5 sm:px-8 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-zinc-500">
          <div>
            <span className="font-medium text-zinc-300">{COMPANY_INFO.brandName}</span>
            <span className="mx-2" aria-hidden="true">
              ·
            </span>
            <span>{COMPANY_INFO.parentCompany}</span>
            <span className="mx-2" aria-hidden="true">
              ·
            </span>
            <span className="font-mono">{COMPANY_INFO.phone}</span>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <button
              type="button"
              onClick={() => onNavigate('artist-auth', { authMode: 'register' })}
              className="hover:text-zinc-200 transition-colors cursor-pointer"
            >
              Artist Sign Up
            </button>
            <button
              type="button"
              onClick={() => onNavigate('artist-auth', { authMode: 'login' })}
              className="hover:text-zinc-200 transition-colors cursor-pointer"
            >
              Artist Login
            </button>
            <button
              type="button"
              onClick={() => onNavigate('admin-auth')}
              className="hover:text-[#E5C158] transition-colors cursor-pointer"
            >
              Admin Login
            </button>
            <button
              type="button"
              onClick={() => onNavigate('support')}
              className="hover:text-zinc-200 transition-colors cursor-pointer"
            >
              Support &amp; FAQ
            </button>
            <button
              type="button"
              onClick={() => onNavigate('terms')}
              className="hover:text-zinc-200 transition-colors cursor-pointer"
            >
              Terms
            </button>
            <button
              type="button"
              onClick={() => onNavigate('privacy')}
              className="hover:text-zinc-200 transition-colors cursor-pointer"
            >
              Privacy
            </button>
            <button
              type="button"
              onClick={() => onNavigate('copyright')}
              className="hover:text-zinc-200 transition-colors cursor-pointer"
            >
              Copyright Policy
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

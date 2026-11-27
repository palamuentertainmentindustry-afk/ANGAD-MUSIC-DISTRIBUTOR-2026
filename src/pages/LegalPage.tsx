import { ArrowLeft, FileText, Lock, ShieldCheck } from 'lucide-react';
import { SafeImage } from '../components/SafeImage.tsx';
import { ASSETS, COMPANY_INFO } from '../lib/assets.ts';
import type { AppView } from '../types.ts';

interface LegalPageProps {
  section: 'terms' | 'privacy' | 'copyright';
  onNavigate: (view: AppView) => void;
}

export function LegalPage({ section, onNavigate }: LegalPageProps) {
  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 flex flex-col">
      <header className="border-b border-zinc-800/80 px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100 min-h-[44px] cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Back to Home</span>
        </button>
        <div className="flex items-center gap-2.5">
          <SafeImage
            src={ASSETS.brandEmblem}
            alt="ANGAD MUSIC DISTRIBUTOR logo"
            className="w-9 h-9 rounded-md object-contain bg-black border border-[#D4AF37]/40 p-0.5 shrink-0"
          />
          <span className="font-display text-xs sm:text-sm font-semibold text-zinc-100 whitespace-nowrap">
            {COMPANY_INFO.brandName}
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-[960px] w-full mx-auto px-5 sm:px-8 py-8 sm:py-12 space-y-6">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#111114] border border-zinc-800 rounded-lg w-fit">
          {[
            { id: 'terms' as const, label: 'Terms of Distribution', icon: FileText },
            { id: 'privacy' as const, label: 'Privacy Policy', icon: Lock },
            { id: 'copyright' as const, label: 'Copyright Policy', icon: ShieldCheck },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = section === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onNavigate(tab.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 min-h-[38px] rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  active ? 'bg-[#D4AF37] text-[#09090B] font-semibold' : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <article className="p-6 sm:p-8 rounded-xl border border-zinc-800 bg-[#111114] space-y-5 leading-relaxed text-sm text-zinc-300">
          {section === 'terms' && (
            <>
              <div>
                <h1 className="font-display text-2xl font-semibold text-zinc-100 mb-1">
                  Terms of Digital Music Distribution
                </h1>
                <p className="text-xs text-zinc-400">
                  {COMPANY_INFO.brandName} · Operated by {COMPANY_INFO.parentCompany}
                </p>
              </div>
              <section className="space-y-2">
                <h2 className="font-display text-base font-semibold text-[#E5C158]">1. Distribution Authorization</h2>
                <p>
                  By submitting releases, audio masters, lyrics, artwork, P-Line, and C-Line declarations through ANGAD
                  MUSIC DISTRIBUTOR, you authorize Palamu Entertainment Industry to inspect quality, assign or validate
                  UPC/ISRC metadata, and coordinate distribution with selected streaming and telecom stores including
                  Spotify, Apple Music, YouTube Music, JioSaavn, Gaana, Wynk Music, Amazon Music, Hungama Music,
                  Facebook Music, Instagram Music, TikTok Music, Airtel Music, and Vodafone Music.
                </p>
              </section>
              <section className="space-y-2">
                <h2 className="font-display text-base font-semibold text-[#E5C158]">2. Real Fulfillment &amp; No Fake Delivery</h2>
                <p>
                  All submissions start in Pending Review. Store statuses remain Queued for Partner or In Review until
                  a real distribution partner confirms live availability with a confirmation reference ID. No store
                  delivery, stream count, or earning figure is simulated.
                </p>
              </section>
              <section className="space-y-2">
                <h2 className="font-display text-base font-semibold text-[#E5C158]">3. Royalties &amp; Payouts</h2>
                <p>
                  Royalty payouts are credited strictly upon verified store statements. Minimum payout threshold is
                  ₹500.00 of verified available balance via UPI, Bank Transfer (IMPS/NEFT), or PayPal. Fraudulent
                  streaming, artificial bot traffic, or unauthorized samples result in withholding and catalog removal.
                </p>
              </section>
            </>
          )}

          {section === 'privacy' && (
            <>
              <div>
                <h1 className="font-display text-2xl font-semibold text-zinc-100 mb-1">Privacy Policy</h1>
                <p className="text-xs text-zinc-400">
                  {COMPANY_INFO.brandName} · {COMPANY_INFO.parentCompany}
                </p>
              </div>
              <section className="space-y-2">
                <h2 className="font-display text-base font-semibold text-[#E5C158]">1. Information Collected</h2>
                <p>
                  We collect your artist registration details (Full Name, Country, Mobile Number, Email Address), catalog
                  metadata (track titles, credits, P-Line, C-Line, lyrics, audio masters, artwork), payout destination
                  information (UPI ID or Bank Account &amp; IFSC), and support communications solely to operate music
                  distribution and royalty accounting.
                </p>
              </section>
              <section className="space-y-2">
                <h2 className="font-display text-base font-semibold text-[#E5C158]">2. Data Security &amp; Access</h2>
                <p>
                  Account passwords are hashed using cryptographic scrypt salting. Session tokens are signed and
                  verified server-side. We never sell artist contact data or private banking details to unauthorized
                  third parties.
                </p>
              </section>
              <section className="space-y-2">
                <h2 className="font-display text-base font-semibold text-[#E5C158]">3. Account &amp; Contact Inquiries</h2>
                <p>
                  To update or remove personal account information, reach our label compliance team at{' '}
                  <span className="text-[#E5C158]">{COMPANY_INFO.email}</span> or call{' '}
                  <span className="font-mono text-zinc-100">{COMPANY_INFO.phone}</span>.
                </p>
              </section>
            </>
          )}

          {section === 'copyright' && (
            <>
              <div>
                <h1 className="font-display text-2xl font-semibold text-zinc-100 mb-1">
                  Copyright &amp; Takedown Policy
                </h1>
                <p className="text-xs text-zinc-400">
                  {COMPANY_INFO.brandName} · {COMPANY_INFO.parentCompany}
                </p>
              </div>
              <section className="space-y-2">
                <h2 className="font-display text-base font-semibold text-[#E5C158]">1. Ownership Warranty</h2>
                <p>
                  Uploading artists warrant that they hold 100% necessary master recording rights (P-Line) and musical
                  composition / lyric permissions (C-Line) for all territories covered by the release. Unlicensed beats,
                  uncleared remixes, or copyrighted sound recordings from third parties are strictly prohibited.
                </p>
              </section>
              <section className="space-y-2">
                <h2 className="font-display text-base font-semibold text-[#E5C158]">2. Submitting a Copyright Notice</h2>
                <p>
                  Rights holders may submit infringement or takedown notices with proof of ownership, affected track
                  title, UPC/ISRC, and contact details to{' '}
                  <span className="text-[#E5C158]">{COMPANY_INFO.email}</span> or helpline{' '}
                  <span className="font-mono text-zinc-100">{COMPANY_INFO.phone}</span>. Verified takedowns are acted on
                  promptly across active partner channels.
                </p>
              </section>
            </>
          )}
        </article>
      </main>
    </div>
  );
}

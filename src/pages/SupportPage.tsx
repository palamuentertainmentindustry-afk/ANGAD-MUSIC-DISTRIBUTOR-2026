import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  LifeBuoy,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  Search,
  Send,
} from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout.tsx';
import { StatusText } from '../components/StatusText.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { COMPANY_INFO, formatDateDDMMYYYY } from '../lib/assets.ts';
import type { AppView, SupportChatMessage, SupportTicket } from '../types.ts';

interface SupportPageProps {
  onNavigate: (view: AppView) => void;
}

const DISTRIBUTOR_FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'What audio file quality is required for store distribution?',
    a: 'We recommend 16-bit or 24-bit Stereo WAV or FLAC masters recorded at 44.1 kHz or 48 kHz with a minimum duration of 15 seconds. Our uploader automatically inspects binary audio headers, sample rate, bit depth, channels, and duration before submission.',
  },
  {
    q: 'What cover artwork specifications do streaming stores enforce?',
    a: 'Upload a sharp square image (3000×3000px recommended, minimum 1400×1400px) in JPG, PNG, or WEBP format under 8MB. Do not include store logos, URLs, blurry upscales, or promotional pricing text on the cover.',
  },
  {
    q: 'What are P-Line, C-Line, and Catalogue Numbers?',
    a: 'The P-Line (℗ Year Owner) declares sound recording ownership, while the C-Line (© Year Owner) declares artwork and packaging copyright. A Catalogue Number (e.g., PEI-2026-001) helps organize label discography across releases.',
  },
  {
    q: 'When does a release show LIVE on Spotify, Apple Music, or Indian telecom/social stores?',
    a: 'Every submitted track begins in Pending Review. After Palamu Entertainment Industry completes QA and receives real partner delivery confirmation and confirmation IDs for each store (including Spotify, YouTube Music, Apple Music, Amazon Music, JioSaavn, Instagram Music, Facebook Music, Deezer, Hungama, Gaana, Wynk, TikTok, Airtel, Vodafone, and Other Available Platforms), our admin team updates that store to LIVE.',
  },
  {
    q: 'How are royalties credited and withdrawn?',
    a: 'Royalties are credited only from verified DSP reporting statements posted by label accounting. Once your verified available balance reaches ₹500.00, you can submit a withdrawal request via UPI, IMPS/NEFT, or PayPal and track UTR settlement in Payment History.',
  },
  {
    q: 'How do copyright claims, takedowns, or Instrumental tracks work?',
    a: 'Check "Instrumental Track" for vocal-free masters so lyricist/explicit metadata stays clean. If you ever need an emergency copyright takedown or ownership dispute review, request a Takedown from My Releases or email palamuentertainmentindustry@gmail.com.',
  },
];

export function SupportPage({ onNavigate }: SupportPageProps) {
  const { token, user } = useAuth();
  const isArtist = Boolean(token && user?.role === 'artist');

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [name, setName] = useState(user?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.mobile || '');
  const [category, setCategory] = useState('Release Review');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Complaint Tracking State
  const [trackId, setTrackId] = useState('');
  const [trackEmail, setTrackEmail] = useState(user?.email || '');
  const [trackedTicket, setTrackedTicket] = useState<SupportTicket | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);

  // Live Chat State (DB-backed)
  const [chatSessionKey, setChatSessionKey] = useState<string>(() =>
    isArtist && user ? `artist-${user.id}` : `guest-${Math.random().toString(36).slice(2, 10)}`
  );
  const [chatMessages, setChatMessages] = useState<SupportChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSenderName, setChatSenderName] = useState(user?.full_name || '');
  const [sendingChat, setSendingChat] = useState(false);

  const loadChat = async (activeKey?: string) => {
    const keyToLoad = isArtist && user ? `artist-${user.id}` : activeKey || chatSessionKey;
    try {
      const res = await apiFetch<{ messages: SupportChatMessage[]; sessionKey?: string }>(
        `/api/support/chat?sessionKey=${encodeURIComponent(keyToLoad)}`,
        { token }
      );
      setChatMessages(res.messages || []);
      if (res.sessionKey) setChatSessionKey(res.sessionKey);
    } catch {
      // ignore polling hiccup
    }
  };

  useEffect(() => {
    if (isArtist && user) {
      setChatSessionKey(`artist-${user.id}`);
    }
  }, [isArtist, user]);

  useEffect(() => {
    if (isArtist && token) {
      apiFetch<{ tickets: SupportTicket[] }>('/api/artist/support', { token })
        .then((res) => setTickets(res.tickets))
        .catch(() => {});
    }
    loadChat();
    const timer = setInterval(() => loadChat(), 10000);
    return () => clearInterval(timer);
  }, [isArtist, token, chatSessionKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<{ ticket: SupportTicket }>('/api/support', {
        method: 'POST',
        token,
        body: { name, email, phone, category, subject, message },
      });
      if (isArtist) {
        setTickets((prev) => [res.ticket, ...prev]);
      }
      setSubject('');
      setMessage('');
      setTrackId(String(res.ticket.id));
      setTrackEmail(res.ticket.email);
      setFeedback({
        type: 'success',
        text: `Support ticket #${res.ticket.id} submitted to ${COMPANY_INFO.parentCompany}. Save Ticket #${res.ticket.id} for complaint tracking.`,
      });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Failed to submit ticket.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleTrackTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setTrackError(null);
    setTrackedTicket(null);
    setTracking(true);
    try {
      const res = await apiFetch<{ ticket: SupportTicket }>(
        `/api/support/track?ticketId=${encodeURIComponent(trackId.trim())}&email=${encodeURIComponent(trackEmail.trim())}`
      );
      setTrackedTicket(res.ticket);
    } catch (err) {
      setTrackError(err instanceof Error ? err.message : 'Ticket not found.');
    } finally {
      setTracking(false);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    setSendingChat(true);
    try {
      const res = await apiFetch<{ chatMessage: SupportChatMessage; sessionKey: string }>('/api/support/chat', {
        method: 'POST',
        token,
        body: {
          sessionKey: chatSessionKey,
          senderName: chatSenderName || user?.full_name || 'Guest Artist',
          message: chatInput,
        },
      });
      if (res.sessionKey) setChatSessionKey(res.sessionKey);
      setChatMessages((prev) => [...prev, res.chatMessage]);
      setChatInput('');
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Could not send chat message.' });
    } finally {
      setSendingChat(false);
    }
  };

  const content = (
    <div className="space-y-8">
      {/* Direct Company Contact Strip (Phone, WhatsApp, Email) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <a
          href={`tel:+91${COMPANY_INFO.phone}`}
          className="p-5 rounded-xl border border-zinc-800 bg-[#111114] hover:border-[#D4AF37]/50 transition-colors flex items-center gap-4"
        >
          <div className="w-11 h-11 rounded-lg bg-[#D4AF37]/12 border border-[#D4AF37]/30 flex items-center justify-center shrink-0">
            <Phone className="w-5 h-5 text-[#E5C158]" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs text-zinc-400">Label Support Helpline</p>
            <p className="font-mono text-base font-semibold text-zinc-100 tabular-nums">{COMPANY_INFO.phone}</p>
          </div>
        </a>

        <a
          href={`https://wa.me/${COMPANY_INFO.whatsapp}?text=${encodeURIComponent(
            'Hello Palamu Entertainment Industry / ANGAD MUSIC DISTRIBUTOR support team, I need assistance.'
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-5 rounded-xl border border-zinc-800 bg-[#111114] hover:border-emerald-500/50 transition-colors flex items-center gap-4"
        >
          <div className="w-11 h-11 rounded-lg bg-emerald-500/12 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <MessageCircle className="w-5 h-5 text-emerald-400" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs text-zinc-400">WhatsApp Label Desk</p>
            <p className="font-mono text-base font-semibold text-zinc-100 tabular-nums">+91 {COMPANY_INFO.phone}</p>
          </div>
        </a>

        <a
          href={`mailto:${COMPANY_INFO.email}`}
          className="p-5 rounded-xl border border-zinc-800 bg-[#111114] hover:border-[#D4AF37]/50 transition-colors flex items-center gap-4 min-w-0"
        >
          <div className="w-11 h-11 rounded-lg bg-[#D4AF37]/12 border border-[#D4AF37]/30 flex items-center justify-center shrink-0">
            <Mail className="w-5 h-5 text-[#E5C158]" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-zinc-400">Official Support Email</p>
            <p className="text-xs sm:text-sm font-semibold text-zinc-100 truncate">{COMPANY_INFO.email}</p>
          </div>
        </a>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-lg border text-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Live Chat & Complaint Tracking Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Live Chat with Label Support */}
        <section className="lg:col-span-7 rounded-xl border border-zinc-800 bg-[#111114] flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <MessageSquare className="w-4 h-4 text-[#E5C158]" aria-hidden="true" />
              <h2 className="font-display text-base font-semibold text-zinc-100">Live Label Support Chat</h2>
            </div>
            <span className="font-mono text-[11px] text-zinc-500">Direct Team Thread</span>
          </div>

          <div className="p-5 flex-1 min-h-[240px] max-h-[320px] overflow-y-auto space-y-3 bg-[#09090B]">
            {chatMessages.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-12">
                Start a live support conversation with Palamu Entertainment Industry. Replies from our Admin Support Desk
                appear right here.
              </p>
            ) : (
              chatMessages.map((m) => (
                <div
                  key={m.id}
                  className={`p-3 rounded-lg text-xs max-w-[85%] ${
                    m.sender_role === 'admin'
                      ? 'bg-[#D4AF37]/12 border border-[#D4AF37]/30 text-zinc-100 mr-auto'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-200 ml-auto'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-1 text-[10px] text-zinc-400">
                    <span className={m.sender_role === 'admin' ? 'text-[#E5C158] font-semibold' : 'font-medium'}>
                      {m.sender_name}
                    </span>
                    <span className="font-mono">{m.created_at.slice(11, 16)}</span>
                  </div>
                  <p className="leading-relaxed">{m.message}</p>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleSendChat} className="p-4 border-t border-zinc-800 flex flex-wrap sm:flex-nowrap gap-2.5">
            {!isArtist && (
              <input
                type="text"
                value={chatSenderName}
                onChange={(e) => setChatSenderName(e.target.value)}
                placeholder="Your Name"
                className="w-full sm:w-36 px-3 py-2 min-h-[42px] rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100"
              />
            )}
            <input
              type="text"
              required
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Write a message to support team..."
              className="flex-1 min-w-[180px] px-3.5 py-2 min-h-[42px] rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
            />
            <button
              type="submit"
              disabled={sendingChat}
              className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[42px] rounded-md text-xs font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] disabled:opacity-60 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{sendingChat ? 'Sending...' : 'Send'}</span>
            </button>
          </form>
        </section>

        {/* Complaint & Ticket Tracking Lookup */}
        <section className="lg:col-span-5 p-6 rounded-xl border border-zinc-800 bg-[#111114] space-y-4 self-start">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-[#E5C158]" aria-hidden="true" />
            <h2 className="font-display text-base font-semibold text-zinc-100">Complaint Tracking</h2>
          </div>
          <p className="text-xs text-zinc-400">
            Track the live status and official label reply for any support or copyright ticket using your Ticket # and
            Email.
          </p>

          <form onSubmit={handleTrackTicket} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">Ticket Number (#)</label>
              <input
                type="number"
                min={1}
                required
                value={trackId}
                onChange={(e) => setTrackId(e.target.value)}
                placeholder="e.g. 1"
                className="w-full px-3.5 py-2.5 min-h-[42px] rounded-md bg-[#09090B] border border-zinc-800 text-sm font-mono text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">Ticket Email</label>
              <input
                type="email"
                required
                value={trackEmail}
                onChange={(e) => setTrackEmail(e.target.value)}
                placeholder="artist@example.com"
                className="w-full px-3.5 py-2.5 min-h-[42px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100"
              />
            </div>
            <button
              type="submit"
              disabled={tracking}
              className="w-full py-2.5 min-h-[42px] rounded-md text-xs font-semibold bg-zinc-900 border border-zinc-700 hover:border-[#D4AF37] text-zinc-100 cursor-pointer"
            >
              {tracking ? 'Checking Status...' : 'Track Complaint Status'}
            </button>
          </form>

          {trackError && <p className="text-xs text-rose-400">{trackError}</p>}

          {trackedTicket && (
            <div className="p-4 rounded-lg bg-[#09090B] border border-zinc-800 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-zinc-100">
                  #{trackedTicket.id} · {trackedTicket.subject}
                </span>
                <StatusText status={trackedTicket.status} />
              </div>
              <p className="text-zinc-400">
                {trackedTicket.category} · Submitted {formatDateDDMMYYYY(trackedTicket.created_at.slice(0, 10))}
              </p>
              {trackedTicket.admin_reply && (
                <p className="pt-2 border-t border-zinc-800 text-[#E5C158]">
                  Reply: {trackedTicket.admin_reply}
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleSubmit}
          className={`${isArtist ? 'lg:col-span-6' : 'lg:col-span-12 max-w-2xl'} p-6 rounded-xl border border-zinc-800 bg-[#111114] space-y-4`}
        >
          <h2 className="font-display text-base font-semibold text-zinc-100">Submit a Support Ticket</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Your Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Mobile Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Topic Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
              >
                <option value="Release Review">Release Review</option>
                <option value="ISRC / UPC Inquiry">ISRC / UPC Inquiry</option>
                <option value="Royalties & Payouts">Royalties &amp; Payouts</option>
                <option value="Smart Links">Smart Links</option>
                <option value="Takedown / Copyright">Takedown / Copyright</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">Subject</label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Brief summary of your request"
              className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">Message</label>
            <textarea
              rows={4}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Include release title, UPC/ISRC, or payout details if applicable..."
              className="w-full px-3.5 py-2.5 rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-md text-xs sm:text-sm font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] disabled:opacity-60 cursor-pointer"
          >
            <Send className="w-4 h-4" aria-hidden="true" />
            <span>{submitting ? 'Sending...' : 'Submit Ticket'}</span>
          </button>
        </form>

        {isArtist && (
          <div className="lg:col-span-6 rounded-xl border border-zinc-800 bg-[#111114] overflow-hidden self-start">
            <div className="px-6 py-4 border-b border-zinc-800">
              <h2 className="font-display text-base font-semibold text-zinc-100">Your Support Tickets</h2>
            </div>

            {tickets.length === 0 ? (
              <div className="p-10 text-center">
                <LifeBuoy className="w-8 h-8 text-zinc-600 mx-auto mb-3" aria-hidden="true" />
                <p className="text-sm font-medium text-zinc-200 mb-1">No support tickets yet</p>
                <p className="text-xs text-zinc-400">Any tickets you open will show status and replies here.</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/80">
                {tickets.map((t) => (
                  <div key={t.id} className="p-5 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-zinc-100">{t.subject}</p>
                        <p className="text-xs text-zinc-500">
                          #{t.id} · {t.category} · <span className="font-mono">{t.created_at.slice(0, 10)}</span>
                        </p>
                      </div>
                      <StatusText status={t.status} />
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">{t.message}</p>
                    {t.admin_reply && (
                      <div className="p-3 rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-200">
                        <span className="font-semibold text-[#E5C158]">Label Reply: </span>
                        {t.admin_reply}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Frequently Asked Questions */}
      <section className="rounded-xl border border-zinc-800 bg-[#111114] overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-base font-semibold text-zinc-100">Distribution &amp; Royalty FAQ</h2>
          <div className="flex items-center gap-4 text-xs text-zinc-400">
            <button type="button" onClick={() => onNavigate('terms')} className="hover:text-[#E5C158] cursor-pointer">
              Terms
            </button>
            <button type="button" onClick={() => onNavigate('privacy')} className="hover:text-[#E5C158] cursor-pointer">
              Privacy Policy
            </button>
            <button
              type="button"
              onClick={() => onNavigate('copyright')}
              className="hover:text-[#E5C158] cursor-pointer"
            >
              Copyright Policy
            </button>
          </div>
        </div>
        <div className="divide-y divide-zinc-800/80">
          {DISTRIBUTOR_FAQS.map((item, idx) => {
            const isOpen = openFaqIdx === idx;
            return (
              <div key={item.q}>
                <button
                  type="button"
                  onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                  className="w-full px-6 py-4 flex items-center justify-between gap-4 text-left hover:bg-zinc-900/40 cursor-pointer"
                >
                  <span className="text-sm font-medium text-zinc-100">{item.q}</span>
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4 text-[#E5C158] shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                  )}
                </button>
                {isOpen && (
                  <div className="px-6 pb-4 text-xs sm:text-sm text-zinc-400 leading-relaxed">{item.a}</div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );

  if (isArtist) {
    return (
      <DashboardLayout currentView="support" onNavigate={onNavigate} title="Artist Support & FAQ">
        {content}
      </DashboardLayout>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100">
      <header className="border-b border-zinc-800/80 px-5 sm:px-8 h-16 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </button>
        <span className="font-display text-sm font-semibold text-zinc-100">{COMPANY_INFO.brandName}</span>
      </header>
      <main className="max-w-[1100px] mx-auto px-5 sm:px-8 py-10">
        <h1 className="font-display text-2xl font-semibold text-zinc-100 mb-6">
          Palamu Entertainment Industry Support &amp; FAQ
        </h1>
        {content}
      </main>
    </div>
  );
}

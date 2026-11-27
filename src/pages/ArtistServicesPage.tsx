import { useEffect, useState } from 'react';
import { Disc3, Film, ListMusic, Megaphone, Palette, Send, Sparkles, Youtube } from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout.tsx';
import { StatusText } from '../components/StatusText.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import type { AppView, ArtistServiceRequest, ReleaseItem } from '../types.ts';

interface ArtistServicesPageProps {
  onNavigate: (view: AppView) => void;
}

const SERVICE_CATALOG = [
  {
    name: 'Song Promotion',
    desc: 'Targeted release launch campaigns across digital audio platforms and regional social audiences.',
    icon: Megaphone,
  },
  {
    name: 'YouTube Promotion',
    desc: 'Channel optimization, music video discovery, and Shorts promotion managed with transparent metrics.',
    icon: Youtube,
  },
  {
    name: 'Playlist Promotion',
    desc: 'Editorial & independent playlist pitching aligned to your genre, subgenre, and language.',
    icon: ListMusic,
  },
  {
    name: 'Music Video Distribution',
    desc: 'Official music video delivery and metadata setup for partner video networks.',
    icon: Film,
  },
  {
    name: 'Artist Branding',
    desc: 'Press bio, artist identity kit, and verified DSP profile readiness.',
    icon: Sparkles,
  },
  {
    name: 'Cover Design Service',
    desc: 'Custom 3000×3000px store-compliant release cover artwork crafted for your single or album.',
    icon: Palette,
  },
] as const;

export function ArtistServicesPage({ onNavigate }: ArtistServicesPageProps) {
  const { token } = useAuth();
  const [services, setServices] = useState<ArtistServiceRequest[]>([]);
  const [releases, setReleases] = useState<ReleaseItem[]>([]);
  const [selectedService, setSelectedService] = useState<string>(SERVICE_CATALOG[0].name);
  const [releaseId, setReleaseId] = useState('');
  const [budgetNote, setBudgetNote] = useState('');
  const [targetLinks, setTargetLinks] = useState('');
  const [brief, setBrief] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      apiFetch<{ services: ArtistServiceRequest[] }>('/api/artist/services', { token }),
      apiFetch<{ releases: ReleaseItem[] }>('/api/artist/releases', { token }),
    ])
      .then(([sRes, rRes]) => {
        setServices(sRes.services);
        setReleases(rRes.releases);
      })
      .catch(() => {});
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setFeedback(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<{ service: ArtistServiceRequest }>('/api/artist/services', {
        method: 'POST',
        token,
        body: {
          serviceType: selectedService,
          releaseId: releaseId ? Number(releaseId) : null,
          budgetNote,
          targetLinks,
          brief,
        },
      });
      setServices((prev) => [res.service, ...prev]);
      setBrief('');
      setTargetLinks('');
      setBudgetNote('');
      setFeedback({
        type: 'success',
        text: `${selectedService} request submitted to Palamu Entertainment Industry.`,
      });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Could not submit request.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout currentView="services" onNavigate={onNavigate} title="Artist Services">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {SERVICE_CATALOG.map((item) => {
          const Icon = item.icon;
          const active = selectedService === item.name;
          return (
            <button
              key={item.name}
              type="button"
              onClick={() => setSelectedService(item.name)}
              className={`p-5 rounded-xl border text-left transition-colors cursor-pointer ${
                active
                  ? 'bg-[#D4AF37]/12 border-[#D4AF37] text-[#F5E6B3]'
                  : 'bg-[#111114] border-zinc-800 hover:border-zinc-700 text-zinc-200'
              }`}
            >
              <Icon className={`w-5 h-5 mb-3 ${active ? 'text-[#E5C158]' : 'text-[#D4AF37]'}`} aria-hidden="true" />
              <h2 className="font-display text-sm font-semibold text-zinc-100 mb-1">{item.name}</h2>
              <p className="text-xs text-zinc-400 leading-relaxed">{item.desc}</p>
            </button>
          );
        })}
      </div>

      {feedback && (
        <div
          className={`mb-6 p-4 rounded-lg border text-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-6 p-6 rounded-xl border border-zinc-800 bg-[#111114] space-y-4 self-start"
        >
          <h2 className="font-display text-base font-semibold text-zinc-100">
            Request: <span className="text-[#E5C158]">{selectedService}</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-300 mb-1">Service Category</label>
              <select
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value)}
                className="w-full px-3 py-2.5 min-h-[42px] rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100"
              >
                {SERVICE_CATALOG.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-300 mb-1">Linked Release (Optional)</label>
              <select
                value={releaseId}
                onChange={(e) => setReleaseId(e.target.value)}
                className="w-full px-3 py-2.5 min-h-[42px] rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100"
              >
                <option value="">General Artist Campaign</option>
                {releases.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-300 mb-1">Reference / Video / Audio Link</label>
              <input
                type="text"
                value={targetLinks}
                onChange={(e) => setTargetLinks(e.target.value)}
                placeholder="YouTube, Spotify, or Drive reference link"
                className="w-full px-3.5 py-2.5 min-h-[42px] rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-300 mb-1">Preferred Budget / Timeline</label>
              <input
                type="text"
                value={budgetNote}
                onChange={(e) => setBudgetNote(e.target.value)}
                placeholder="e.g. Launch week / Standard package"
                className="w-full px-3.5 py-2.5 min-h-[42px] rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-300 mb-1">Campaign Brief &amp; Creative Requirements *</label>
            <textarea
              rows={4}
              required
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Describe your target audience, artwork concept, YouTube link, or branding goals..."
              className="w-full px-3.5 py-2.5 rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[42px] rounded-md text-xs font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] disabled:opacity-60 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{submitting ? 'Submitting...' : 'Submit Service Request'}</span>
          </button>
        </form>

        <div className="lg:col-span-6 rounded-xl border border-zinc-800 bg-[#111114] overflow-hidden self-start">
          <div className="px-6 py-4 border-b border-zinc-800">
            <h2 className="font-display text-base font-semibold text-zinc-100">Your Service Orders</h2>
          </div>
          {services.length === 0 ? (
            <div className="p-10 text-center">
              <Disc3 className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
              <p className="text-sm font-medium text-zinc-200">No service orders yet</p>
              <p className="text-xs text-zinc-400 mt-1">
                Submit promotion, music video distribution, branding, or cover art requests on the left.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/80">
              {services.map((s) => (
                <div key={s.id} className="p-5 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-zinc-100">{s.service_type}</p>
                      <p className="text-xs text-zinc-400">
                        {s.release_title ? `Release: ${s.release_title}` : 'General Campaign'} ·{' '}
                        <span className="font-mono">{s.created_at.slice(0, 10)}</span>
                      </p>
                    </div>
                    <StatusText status={s.status} />
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed">{s.brief}</p>
                  {s.admin_notes && (
                    <div className="p-3 rounded bg-[#09090B] border border-zinc-800 text-xs text-zinc-200">
                      <span className="font-semibold text-[#E5C158]">Label Note: </span>
                      {s.admin_notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

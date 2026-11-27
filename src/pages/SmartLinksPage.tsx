import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Link2, Save } from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout.tsx';
import { SafeImage } from '../components/SafeImage.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { ASSETS } from '../lib/assets.ts';
import type { AppView, SmartLinkItem } from '../types.ts';

interface SmartLinksPageProps {
  onNavigate: (view: AppView, opts?: { smartLinkSlug?: string }) => void;
}

export function SmartLinksPage({ onNavigate }: SmartLinksPageProps) {
  const { token } = useAuth();
  const [links, setLinks] = useState<SmartLinkItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Editable fields
  const [slug, setSlug] = useState('');
  const [headline, setHeadline] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [appleMusicUrl, setAppleMusicUrl] = useState('');
  const [youtubeMusicUrl, setYoutubeMusicUrl] = useState('');
  const [jiosaavnUrl, setJiosaavnUrl] = useState('');
  const [gaanaUrl, setGaanaUrl] = useState('');
  const [wynkUrl, setWynkUrl] = useState('');
  const [amazonMusicUrl, setAmazonMusicUrl] = useState('');
  const [hungamaMusicUrl, setHungamaMusicUrl] = useState('');
  const [deezerUrl, setDeezerUrl] = useState('');
  const [facebookMusicUrl, setFacebookMusicUrl] = useState('');
  const [instagramMusicUrl, setInstagramMusicUrl] = useState('');
  const [tiktokMusicUrl, setTiktokMusicUrl] = useState('');
  const [airtelMusicUrl, setAirtelMusicUrl] = useState('');
  const [vodafoneMusicUrl, setVodafoneMusicUrl] = useState('');
  const [otherPlatformsUrl, setOtherPlatformsUrl] = useState('');

  const selectLink = (item: SmartLinkItem) => {
    setSelectedId(item.release_id);
    setSlug(item.slug);
    setHeadline(item.headline || item.release_title || '');
    setSubtitle(item.subtitle || item.primary_artist || '');
    setSpotifyUrl(item.spotify_url || '');
    setAppleMusicUrl(item.apple_music_url || '');
    setYoutubeMusicUrl(item.youtube_music_url || '');
    setJiosaavnUrl(item.jiosaavn_url || '');
    setGaanaUrl(item.gaana_url || '');
    setWynkUrl(item.wynk_url || '');
    setAmazonMusicUrl(item.amazon_music_url || '');
    setHungamaMusicUrl(item.hungama_music_url || '');
    setDeezerUrl(item.deezer_url || '');
    setFacebookMusicUrl(item.facebook_music_url || '');
    setInstagramMusicUrl(item.instagram_music_url || '');
    setTiktokMusicUrl(item.tiktok_music_url || '');
    setAirtelMusicUrl(item.airtel_music_url || '');
    setVodafoneMusicUrl(item.vodafone_music_url || '');
    setOtherPlatformsUrl(item.other_platforms_url || '');
  };

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    apiFetch<{ smartLinks: SmartLinkItem[] }>('/api/artist/smart-links', { token })
      .then((res) => {
        setLinks(res.smartLinks);
        if (res.smartLinks.length > 0) {
          selectLink(res.smartLinks[0]);
        }
      })
      .catch((err) => {
        setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load Smart Links.' });
      })
      .finally(() => setLoading(false));
  }, [token]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedId) return;
    setFeedback(null);
    setSaving(true);
    try {
      const res = await apiFetch<{ smartLink: SmartLinkItem }>(`/api/artist/smart-links/${selectedId}`, {
        method: 'PUT',
        token,
        body: {
          slug,
          headline,
          subtitle,
          spotifyUrl,
          appleMusicUrl,
          youtubeMusicUrl,
          jiosaavnUrl,
          gaanaUrl,
          wynkUrl,
          amazonMusicUrl,
          hungamaMusicUrl,
          deezerUrl,
          facebookMusicUrl,
          instagramMusicUrl,
          tiktokMusicUrl,
          airtelMusicUrl,
          vodafoneMusicUrl,
          otherPlatformsUrl,
        },
      });
      setLinks((prev) => prev.map((l) => (l.release_id === selectedId ? { ...l, ...res.smartLink } : l)));
      setSlug(res.smartLink.slug);
      setFeedback({ type: 'success', text: 'Smart Link configuration updated and published.' });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Could not update Smart Link.' });
    } finally {
      setSaving(false);
    }
  };

  const copyShareUrl = (targetSlug: string) => {
    const shareUrl = `${window.location.origin}/s/${targetSlug}`;
    navigator.clipboard?.writeText(shareUrl).catch(() => {});
    setCopiedSlug(targetSlug);
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  const activeLink = links.find((l) => l.release_id === selectedId) || null;

  return (
    <DashboardLayout currentView="smart-links" onNavigate={onNavigate} title="Smart Links">
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

      {loading ? (
        <div className="h-48 rounded-xl bg-[#111114] border border-zinc-800 animate-pulse" />
      ) : links.length === 0 ? (
        <div className="p-12 rounded-xl border border-zinc-800 bg-[#111114] text-center">
          <Link2 className="w-9 h-9 text-zinc-600 mx-auto mb-3" aria-hidden="true" />
          <h2 className="font-display text-base font-semibold text-zinc-100 mb-1">No Smart Links created yet</h2>
          <p className="text-xs text-zinc-400 max-w-md mx-auto mb-5">
            Every release you submit automatically receives a shareable Smart Link page where you can attach verified
            store URLs.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('create-release')}
            className="px-4 py-2 min-h-[40px] rounded-md text-xs font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] cursor-pointer"
          >
            Create Release
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Release Selector */}
          <div className="lg:col-span-4 rounded-xl border border-zinc-800 bg-[#111114] overflow-hidden self-start">
            <div className="px-5 py-4 border-b border-zinc-800">
              <h2 className="font-display text-sm font-semibold text-zinc-100">Your Release Links</h2>
            </div>
            <div className="divide-y divide-zinc-800/70">
              {links.map((item) => {
                const isSelected = item.release_id === selectedId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectLink(item)}
                    className={`w-full px-5 py-4 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                      isSelected ? 'bg-[#D4AF37]/10' : 'hover:bg-zinc-900/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <SafeImage
                        src={item.cover_url || ASSETS.releaseFallback}
                        fallbackSrc={ASSETS.releaseFallback}
                        alt={item.release_title || 'Release cover'}
                        className="w-10 h-10 rounded object-cover border border-zinc-800 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className={`text-sm font-medium truncate ${isSelected ? 'text-[#E5C158]' : 'text-zinc-100'}`}>
                          {item.release_title}
                        </p>
                        <p className="text-xs font-mono text-zinc-500 truncate">/s/{item.slug}</p>
                      </div>
                    </div>
                    <span className="font-mono text-xs text-zinc-400 tabular-nums shrink-0">
                      {item.clicks} clicks
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Editor */}
          {activeLink && (
            <form
              onSubmit={handleSave}
              className="lg:col-span-8 p-6 rounded-xl border border-zinc-800 bg-[#111114] space-y-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-zinc-800">
                <div>
                  <h2 className="font-display text-base font-semibold text-zinc-100">{activeLink.release_title}</h2>
                  <p className="text-xs font-mono text-zinc-400 mt-0.5">
                    Public URL: {window.location.origin}/s/{slug}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => copyShareUrl(activeLink.slug)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-md text-xs font-medium bg-[#09090B] border border-zinc-800 hover:border-[#D4AF37] text-zinc-200 cursor-pointer"
                  >
                    {copiedSlug === activeLink.slug ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-[#D4AF37]" />
                    )}
                    <span>{copiedSlug === activeLink.slug ? 'Copied' : 'Copy Link'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('public-smart-link', { smartLinkSlug: activeLink.slug })}
                    className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-md text-xs font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open Page</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Custom Slug</label>
                  <input
                    type="text"
                    required
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm font-mono text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Page Headline</label>
                  <input
                    type="text"
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Subtitle / Credits Line</label>
                <input
                  type="text"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div className="pt-2 border-t border-zinc-800/80">
                <p className="text-xs font-medium text-zinc-300 mb-3">
                  Store URLs (Only stores with valid https:// URLs appear on the public Smart Link page)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { label: 'Spotify URL', value: spotifyUrl, setter: setSpotifyUrl },
                    { label: 'Apple Music URL', value: appleMusicUrl, setter: setAppleMusicUrl },
                    { label: 'YouTube Music URL', value: youtubeMusicUrl, setter: setYoutubeMusicUrl },
                    { label: 'JioSaavn URL', value: jiosaavnUrl, setter: setJiosaavnUrl },
                    { label: 'Gaana URL', value: gaanaUrl, setter: setGaanaUrl },
                    { label: 'Wynk Music URL', value: wynkUrl, setter: setWynkUrl },
                    { label: 'Amazon Music URL', value: amazonMusicUrl, setter: setAmazonMusicUrl },
                    { label: 'Hungama Music URL', value: hungamaMusicUrl, setter: setHungamaMusicUrl },
                    { label: 'Deezer URL', value: deezerUrl, setter: setDeezerUrl },
                    { label: 'Facebook Music URL', value: facebookMusicUrl, setter: setFacebookMusicUrl },
                    { label: 'Instagram Music URL', value: instagramMusicUrl, setter: setInstagramMusicUrl },
                    { label: 'TikTok Music URL', value: tiktokMusicUrl, setter: setTiktokMusicUrl },
                    { label: 'Airtel Music URL', value: airtelMusicUrl, setter: setAirtelMusicUrl },
                    { label: 'Vodafone Music URL', value: vodafoneMusicUrl, setter: setVodafoneMusicUrl },
                    { label: 'Other Available Platforms URL', value: otherPlatformsUrl, setter: setOtherPlatformsUrl },
                  ].map((field) => (
                    <div key={field.label}>
                      <label className="block text-xs text-zinc-400 mb-1">{field.label}</label>
                      <input
                        type="url"
                        value={field.value}
                        onChange={(e) => field.setter(e.target.value)}
                        placeholder="https://..."
                        className="w-full px-3.5 py-2 min-h-[40px] rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#D4AF37]"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-md text-xs sm:text-sm font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] disabled:opacity-60 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Saving...' : 'Save Smart Link'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}

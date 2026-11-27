import { useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink, Music2 } from 'lucide-react';
import { SafeImage } from '../components/SafeImage.tsx';
import { apiFetch } from '../lib/api.ts';
import { ASSETS, COMPANY_INFO, formatDateDDMMYYYY, formatDuration } from '../lib/assets.ts';
import type { AppView, SmartLinkItem } from '../types.ts';

interface PublicSmartLinkPageProps {
  slug: string;
  onNavigate: (view: AppView) => void;
}

export function PublicSmartLinkPage({ slug, onNavigate }: PublicSmartLinkPageProps) {
  const [link, setLink] = useState<SmartLinkItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch<{ smartLink: SmartLinkItem }>(`/api/public/smart-link/${encodeURIComponent(slug)}`)
      .then((res) => setLink(res.smartLink))
      .catch((err) => setError(err instanceof Error ? err.message : 'Smart Link not found.'))
      .finally(() => setLoading(false));
  }, [slug]);

  const stores = link
    ? [
        { name: 'Spotify', url: link.spotify_url },
        { name: 'Apple Music', url: link.apple_music_url },
        { name: 'YouTube Music', url: link.youtube_music_url },
        { name: 'JioSaavn', url: link.jiosaavn_url },
        { name: 'Gaana', url: link.gaana_url },
        { name: 'Wynk Music', url: link.wynk_url },
        { name: 'Amazon Music', url: link.amazon_music_url },
        { name: 'Hungama Music', url: link.hungama_music_url },
        { name: 'Deezer', url: link.deezer_url || '' },
        { name: 'Facebook Music', url: link.facebook_music_url },
        { name: 'Instagram Music', url: link.instagram_music_url },
        { name: 'TikTok Music', url: link.tiktok_music_url },
        { name: 'Airtel Music', url: link.airtel_music_url },
        { name: 'Vodafone Music', url: link.vodafone_music_url },
        { name: 'Other Available Platforms', url: link.other_platforms_url || '' },
      ].filter((s) => Boolean(s.url))
    : [];

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 flex flex-col">
      <header className="px-5 sm:px-8 h-16 border-b border-zinc-800/80 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="inline-flex items-center gap-2 text-xs sm:text-sm text-zinc-400 hover:text-zinc-100 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{COMPANY_INFO.brandName}</span>
        </button>
        <span className="text-xs text-zinc-500">{COMPANY_INFO.parentCompany}</span>
      </header>

      <main className="flex-1 flex items-center justify-center px-5 py-10">
        {loading ? (
          <div className="w-full max-w-[440px] h-96 rounded-2xl bg-[#111114] border border-zinc-800 animate-pulse" />
        ) : error || !link ? (
          <div className="w-full max-w-[440px] p-8 rounded-2xl border border-zinc-800 bg-[#111114] text-center">
            <Music2 className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
            <h1 className="font-display text-lg font-semibold text-zinc-100 mb-1">Smart Link Unavailable</h1>
            <p className="text-xs text-zinc-400 mb-5">{error || 'This release link does not exist.'}</p>
            <button
              type="button"
              onClick={() => onNavigate('home')}
              className="px-4 py-2 min-h-[40px] rounded-md text-xs font-semibold bg-[#D4AF37] text-[#09090B] cursor-pointer"
            >
              Return Home
            </button>
          </div>
        ) : (
          <div className="w-full max-w-[460px] rounded-2xl border border-zinc-800 bg-[#111114] overflow-hidden">
            <div className="p-6 sm:p-8 text-center border-b border-zinc-800/80">
              <div className="w-52 h-52 mx-auto rounded-xl overflow-hidden border border-[#D4AF37]/30 mb-5 bg-[#09090B]">
                <SafeImage
                  src={link.cover_url || ASSETS.releaseFallback}
                  fallbackSrc={ASSETS.releaseFallback}
                  alt={link.release_title || link.headline}
                  className="w-full h-full object-cover"
                />
              </div>
              <h1 className="font-display text-2xl font-semibold text-zinc-100 mb-1">
                {link.headline || link.release_title}
              </h1>
              <p className="text-sm text-[#E5C158]">{link.subtitle || link.primary_artist}</p>
              <p className="text-xs text-zinc-500 mt-2">
                {link.genre} · {link.language} · {formatDateDDMMYYYY(link.release_date)}
              </p>
            </div>

            <div className="p-6 space-y-3">
              {stores.length === 0 ? (
                <div className="p-5 rounded-lg bg-[#09090B] border border-zinc-800 text-center">
                  <p className="text-xs text-zinc-300 font-medium mb-1">Store Links Pending</p>
                  <p className="text-xs text-zinc-500">
                    The artist or label has not attached live streaming store URLs for this release yet.
                  </p>
                </div>
              ) : (
                stores.map((store) => (
                  <a
                    key={store.name}
                    href={store.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-between px-4 py-3 min-h-[48px] rounded-lg bg-[#09090B] border border-zinc-800 hover:border-[#D4AF37] text-sm font-medium text-zinc-100 transition-colors"
                  >
                    <span>Listen on {store.name}</span>
                    <ExternalLink className="w-4 h-4 text-[#D4AF37]" />
                  </a>
                ))
              )}

              {link.tracks && link.tracks.length > 0 && (
                <div className="pt-4 border-t border-zinc-800/80">
                  <p className="text-xs font-medium text-zinc-400 mb-2">Tracklist</p>
                  <div className="space-y-1.5">
                    {link.tracks.map((t) => (
                      <div key={t.id} className="flex items-center justify-between text-xs text-zinc-300">
                        <span>
                          <span className="font-mono text-zinc-500 mr-2">{t.track_number}.</span>
                          {t.title}
                        </span>
                        <span className="font-mono text-zinc-500 tabular-nums">
                          {formatDuration(t.duration_seconds)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

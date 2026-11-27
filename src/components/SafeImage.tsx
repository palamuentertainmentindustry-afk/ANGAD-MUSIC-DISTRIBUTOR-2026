import { useState } from 'react';
import { Disc3 } from 'lucide-react';

interface SafeImageProps {
  src?: string | null;
  fallbackSrc?: string;
  alt: string;
  className?: string;
}

export function SafeImage({ src, fallbackSrc, alt, className = '' }: SafeImageProps) {
  const [failed, setFailed] = useState(false);
  const resolvedSrc = !failed && src ? src : fallbackSrc;

  if (!resolvedSrc || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-zinc-900 via-[#12110E] to-black border border-zinc-800 text-[#D4AF37]/70 ${className}`}
        role="img"
        aria-label={alt}
      >
        <Disc3 className="w-7 h-7 opacity-80" aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

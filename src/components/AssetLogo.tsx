/* Asset logos. Real logos load from their public CDNs as plain <img> (small
   icons render reliably without the image optimiser); the chain metric has
   its own drawn glyph. */

export function AssetLogo({ src, symbol, size = 32 }: { src: string | null; symbol: string; size?: number }) {
  if (!src) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-board text-amber"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <rect x="3" y="13" width="4" height="7" rx="1" />
          <rect x="10" y="8" width="4" height="12" rx="1" />
          <rect x="17" y="4" width="4" height="16" rx="1" />
        </svg>
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={symbol}
      width={size}
      height={size}
      loading="lazy"
      className="shrink-0 rounded-full bg-card object-cover ring-1 ring-line"
      style={{ width: size, height: size }}
    />
  );
}

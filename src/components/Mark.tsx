/*
 * The Olaz mark, from the owner's artwork (scripts/brand/olaz-mark-master.webp,
 * rendered by `npm run brand`). It is one colour, so it is drawn as a CSS mask
 * filled with the current text colour: ink on paper, chalk on the board.
 */

const MARK = "/brand/olaz-mark.webp";

export function Mark({ size = 32, className = "", tone = "paper" }: { size?: number; className?: string; tone?: "paper" | "board" }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 ${tone === "board" ? "bg-chalk" : "bg-ink"} ${className}`}
      style={{
        width: size,
        height: size,
        WebkitMaskImage: `url(${MARK})`,
        maskImage: `url(${MARK})`,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}

/** Square badge: the mark on its own plate, used as an avatar. */
export function MarkBadge({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    // Small fixed-size image: a plain <img> renders reliably where next/image can come up blank.
    <img src="/brand/olaz-badge.webp" alt="" width={size} height={size} className={`shrink-0 rounded-md ${className}`} style={{ width: size, height: size }} />
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Mark size={30} />
      <span className="font-display text-[26px] leading-none font-extrabold tracking-[0.02em] uppercase">Olaz</span>
    </span>
  );
}

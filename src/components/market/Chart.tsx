"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type Point = { t: number; p: number };

/**
 * Price line for a round: the dashed line is the lock price, the shaded band
 * is the round itself. Hover shows the value under the pointer.
 */
export function RoundChart({
  points,
  lock,
  from,
  to,
  roundStart,
  height = 240,
  format,
  tone = "paper",
  label,
}: {
  points: Point[];
  lock: number | null;
  from: number;
  to: number;
  roundStart?: number;
  height?: number;
  format: (v: number) => string;
  tone?: "paper" | "board";
  label?: string;
}) {
  const [hover, setHover] = useState<Point | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(800);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 560 ? Math.round(height * 0.75) : height;
  const pad = { l: 8, r: 72, t: 14, b: 22 };
  const dark = tone === "board";

  const geo = useMemo(() => {
    const vals = points.map((p) => p.p);
    if (lock !== null) vals.push(lock);
    if (vals.length === 0) return null;
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    if (hi === lo) {
      hi += Math.abs(hi) * 0.001 || 1;
      lo -= Math.abs(lo) * 0.001 || 1;
    }
    const span = hi - lo;
    lo -= span * 0.12;
    hi += span * 0.12;
    const x = (t: number) => pad.l + ((t - from) / (to - from)) * (W - pad.l - pad.r);
    const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
    return { lo, hi, x, y };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, lock, from, to, H, W]);

  if (!geo || points.length === 0) {
    return (
      <div ref={box} className={`flex items-center justify-center rounded-md px-4 text-center text-sm ${dark ? "text-chalk/50" : "text-ink-3"}`} style={{ height: H }}>
        {label ?? "Reading the feed…"}
      </div>
    );
  }
  const { x, y, lo, hi } = geo;
  const long = to - from > 36 * 3600_000;
  const stamp = (t: number) =>
    long
      ? new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : new Date(t).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  const last = points[points.length - 1];
  const above = lock === null || last.p >= lock;
  const lineColor = lock === null ? (dark ? "#efede6" : "#111714") : above ? (dark ? "#3fcf86" : "#0f8a4f") : dark ? "#ff6b4f" : "#d8432b";
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p.p).toFixed(1)}`).join(" ");
  const ticks = [lo + (hi - lo) * 0.2, lo + (hi - lo) * 0.5, lo + (hi - lo) * 0.8];

  return (
    <div ref={box}>
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full touch-none select-none"
      onPointerMove={(e) => {
        const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const t = from + ((e.clientX - rect.left) / rect.width * W - pad.l) / (W - pad.l - pad.r) * (to - from);
        let best = points[0];
        for (const p of points) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
        setHover(best);
      }}
      onPointerLeave={() => setHover(null)}
      role="img"
      aria-label="Price chart"
    >
      {roundStart !== undefined ? (
        <rect x={x(roundStart)} y={pad.t} width={Math.max(0, x(Math.min(to, roundStart + (to - roundStart))) - x(roundStart))} height={H - pad.t - pad.b} fill={dark ? "rgba(244,180,40,0.06)" : "rgba(244,180,40,0.10)"} />
      ) : null}
      {ticks.map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={dark ? "rgba(239,237,230,0.07)" : "rgba(17,23,20,0.07)"} />
          <text x={W - pad.r + 6} y={y(v) + 4} fontSize="11" fontFamily="var(--font-mono)" fill={dark ? "rgba(239,237,230,0.45)" : "#767e7a"}>
            {format(v)}
          </text>
        </g>
      ))}
      {lock !== null ? (
        <g>
          <line x1={pad.l} x2={W - pad.r} y1={y(lock)} y2={y(lock)} stroke="#f4b428" strokeWidth="1.5" strokeDasharray="6 5" />
          <rect x={W - pad.r + 2} y={y(lock) - 9} width={pad.r - 4} height="18" rx="3" fill="#f4b428" />
          <text x={W - pad.r + 6} y={y(lock) + 4} fontSize="10.5" fontWeight="600" fontFamily="var(--font-mono)" fill="#111714">
            {format(lock)}
          </text>
        </g>
      ) : null}
      <path d={d} fill="none" stroke={lineColor} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last.t)} cy={y(last.p)} r="4" fill={lineColor} />
      {hover ? (
        <g>
          <line x1={x(hover.t)} x2={x(hover.t)} y1={pad.t} y2={H - pad.b} stroke={dark ? "rgba(239,237,230,0.3)" : "rgba(17,23,20,0.25)"} />
          <circle cx={x(hover.t)} cy={y(hover.p)} r="4" fill={lineColor} />
          <text x={Math.min(x(hover.t) + 8, W - pad.r - 150)} y={pad.t + 12} fontSize="12" fontFamily="var(--font-mono)" fill={dark ? "#efede6" : "#111714"}>
            {format(hover.p)} · {long ? new Date(hover.t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : stamp(hover.t)}
          </text>
        </g>
      ) : null}
      <text x={pad.l} y={H - 6} fontSize="10.5" fontFamily="var(--font-mono)" fill={dark ? "rgba(239,237,230,0.45)" : "#767e7a"}>
        {stamp(from)}
      </text>
      <text x={W - pad.r} y={H - 6} textAnchor="end" fontSize="10.5" fontFamily="var(--font-mono)" fill={dark ? "rgba(239,237,230,0.45)" : "#767e7a"}>
        {stamp(to)}
      </text>
    </svg>
    </div>
  );
}

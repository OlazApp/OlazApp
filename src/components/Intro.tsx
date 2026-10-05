"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { INTRO_KEY } from "@/components/providers/useLocal";
import { FEE_PCT } from "@/lib/rounds";

const STEPS = [
  {
    title: "Pick a market",
    body: "ETH, BTC and SOL, Robinhood Chain tokens, stock tokens and chain activity. Each runs back-to-back rounds of 5 minutes, 15 minutes or an hour.",
    art: "pick",
  },
  {
    title: "Call it UP or DOWN",
    body: "Your stake joins the next round's pool before it locks. The lock price is the real price at the round's first second.",
    art: "call",
  },
  {
    title: "The feed decides",
    body: "At the end, the close price comes from the same source: OKX candles, the token's Uniswap pool oracle, or a Chainlink feed on Robinhood Chain.",
    art: "settle",
  },
  {
    title: "Winners split the pot",
    body: `The right side shares everything staked, less a ${FEE_PCT}% fee. Ties and one-sided rounds refund in full. Today this runs on practice ETH; real settlement starts when the contracts ship.`,
    art: "claim",
  },
] as const;

function Art({ kind }: { kind: (typeof STEPS)[number]["art"] }) {
  return (
    <svg viewBox="0 0 320 150" className="h-full w-full" aria-hidden="true">
      <rect width="320" height="150" fill="#121915" />
      {kind === "pick" &&
        [0, 1, 2].map((i) => (
          <g key={i} transform={`translate(24 ${22 + i * 38})`}>
            <rect width="272" height="30" rx="4" fill={i === 1 ? "#26302a" : "#1b241f"} stroke={i === 1 ? "#f4b428" : "none"} />
            <circle cx="18" cy="15" r="8" fill={["#627eea", "#f4b428", "#3fcf86"][i]} />
            <rect x="36" y="11" width={[80, 110, 64][i]} height="8" rx="2" fill="#efede6" opacity="0.8" />
            {["5m", "15m", "1h"].map((f, j) => (
              <text key={f} x={190 + j * 28} y="19" fontSize="10" fontFamily="monospace" fill={j === i ? "#f4b428" : "#efede6"} opacity={j === i ? 1 : 0.5}>
                {f}
              </text>
            ))}
          </g>
        ))}
      {kind === "call" && (
        <g>
          <rect x="34" y="40" width="116" height="70" rx="6" fill="#0f8a4f" />
          <text x="92" y="84" textAnchor="middle" fontSize="26" fontWeight="800" fill="#fff" fontFamily="sans-serif">UP</text>
          <rect x="170" y="40" width="116" height="70" rx="6" fill="#26302a" stroke="#d8432b" />
          <text x="228" y="84" textAnchor="middle" fontSize="26" fontWeight="800" fill="#ff6b4f" fontFamily="sans-serif">DOWN</text>
        </g>
      )}
      {kind === "settle" && (
        <g>
          <line x1="20" x2="300" y1="88" y2="88" stroke="#f4b428" strokeDasharray="6 5" strokeWidth="2" />
          <path d="M20 96 L60 92 L90 100 L120 84 L150 88 L180 70 L210 76 L240 58 L270 64 L300 44" fill="none" stroke="#3fcf86" strokeWidth="3" />
          <circle cx="300" cy="44" r="5" fill="#3fcf86" />
          <text x="22" y="120" fontSize="11" fontFamily="monospace" fill="#f4b428">lock</text>
          <text x="262" y="30" fontSize="11" fontFamily="monospace" fill="#3fcf86">close</text>
        </g>
      )}
      {kind === "claim" && (
        <g>
          <rect x="30" y="46" width="180" height="22" rx="3" fill="#3fcf86" />
          <rect x="30" y="78" width="110" height="22" rx="3" fill="#ff6b4f" />
          <text x="38" y="61" fontSize="11" fontWeight="700" fontFamily="monospace" fill="#121915">UP POOL</text>
          <text x="38" y="93" fontSize="11" fontWeight="700" fontFamily="monospace" fill="#121915">DOWN POOL</text>
          <text x="236" y="70" fontSize="30" fontWeight="800" fontFamily="sans-serif" fill="#efede6">×1.58</text>
          <text x="238" y="92" fontSize="10" fontFamily="monospace" fill="#efede6" opacity="0.6">after fee</text>
        </g>
      )}
    </svg>
  );
}

/** First-visit walkthrough. Shown once per browser, reopened from Settings. */
export function Intro() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        if (window.localStorage.getItem(INTRO_KEY) !== "1") setOpen(true);
      } catch {
        // Storage blocked: skip the intro rather than show it on every page.
      }
    }, 600);
    const reopen = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener("olaz:intro", reopen);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("olaz:intro", reopen);
    };
  }, []);

  const close = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(INTRO_KEY, "1");
    } catch {
      // fine
    }
  };

  if (!open) return null;
  const s = STEPS[step];
  return createPortal(
    <div className="fixed inset-0 z-[72] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="How Olaz works">
      <div className="absolute inset-0 bg-board/60" onClick={close} />
      <div className="relative w-full max-w-md overflow-hidden rounded-t-xl border border-line-2 bg-card sm:rounded-lg" data-testid="intro">
        <div className="relative aspect-[32/15]">
          <Art kind={s.art} />
          <button type="button" onClick={close} aria-label="Close" className="absolute top-2 right-2 cursor-pointer rounded-md bg-board/70 p-1.5 text-chalk">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-5">
          <p className="label">
            Step {step + 1} of {STEPS.length}
          </p>
          <h2 className="h-display mt-1.5 text-[32px]">{s.title}</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{s.body}</p>
          <div className="mt-5 flex items-center justify-between gap-3">
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-ink" : "w-1.5 bg-line-2"}`} />
              ))}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={close} className="btn btn-ghost h-10 px-4 text-sm">
                Skip
              </button>
              <button type="button" onClick={() => (step + 1 < STEPS.length ? setStep(step + 1) : close())} className="btn btn-ink h-10 px-5 text-sm">
                {step + 1 < STEPS.length ? "Next" : "Start predicting"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

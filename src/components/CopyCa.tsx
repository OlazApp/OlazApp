"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { BRAND, CHAIN, TOKEN, shortAddress } from "@/config/brand";

export function useCopyCa() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // Until the contract is published there is nothing worth copying.
  const live = TOKEN.isLive;
  const copy = async () => {
    if (!live) return;
    try {
      await navigator.clipboard.writeText(BRAND.ca);
    } catch {
      // Older browsers and some embedded views refuse the async clipboard.
      const area = document.createElement("textarea");
      area.value = BRAND.ca;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1600);
  };
  return { copied, copy, live };
}

/**
 * Navbar copy button: a compact ticket with "CA" and the short address. One
 * tap copies the full address. Disabled ("at launch") until a real CA is set.
 */
export function CopyCaTag({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const { copied, copy, live } = useCopyCa();
  return (
    <button
      type="button"
      onClick={copy}
      disabled={!live}
      title={live ? `Copy ${BRAND.ca}` : "The contract address is published at launch"}
      aria-label={live ? "Copy contract address" : "Contract address not published yet"}
      data-testid="ca-tag"
      className={`flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-md border border-dashed border-line-2 bg-card px-2.5 font-mono text-[11.5px] font-medium text-ink transition-colors enabled:hover:border-ink disabled:cursor-default ${className}`}
    >
      <span className="rounded-[3px] bg-ink px-1 text-[9.5px] leading-4 font-semibold tracking-[0.08em] text-amber">CA</span>
      <span className={compact ? "hidden sm:inline" : ""}>
        {!live ? "At launch" : copied ? "Copied" : shortAddress(BRAND.ca, 5, 4)}
      </span>
      {!live ? null : copied ? <Check className="size-3.5 text-up" strokeWidth={3} /> : <Copy className="size-3.5 text-ink-3" />}
    </button>
  );
}

/** Full contract block: chain, the whole address and a copy button. */
export function CopyCaBlock({ className = "", tone = "paper" }: { className?: string; tone?: "paper" | "board" }) {
  const { copied, copy, live } = useCopyCa();
  const dark = tone === "board";
  return (
    <div className={`rounded-lg border p-4 ${dark ? "border-chalk/15 bg-board-2 text-chalk" : "border-line-2 bg-card text-ink"} ${className}`}>
      <p className={`font-mono text-[10.5px] tracking-[0.08em] uppercase ${dark ? "text-chalk/55" : "text-ink-3"}`}>
        {BRAND.symbol} contract · {CHAIN.name}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <code className={`min-w-0 flex-1 font-mono text-[12.5px] leading-snug ${live ? "break-all" : "break-words"}`} data-testid="ca-full">
          {live ? BRAND.ca : "Published at launch. Only trust the address shown here."}
        </code>
        <button type="button" onClick={copy} disabled={!live} className="btn btn-accent h-9 px-3.5 text-sm" data-testid="ca-copy">
          {copied ? <Check className="size-4" strokeWidth={3} /> : <Copy className="size-4" />}
          {!live ? "Not live yet" : copied ? "Copied" : "Copy CA"}
        </button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { ArrowDownUp, ArrowUpRight } from "lucide-react";
import { BRAND, CHAIN, PONS, TOKEN, explorerToken, isAddress, shortAddress } from "@/config/brand";
import { MarkBadge } from "@/components/Mark";
import { NavWallet, useWalletModal } from "@/components/wallet/WalletButton";
import { useWallet } from "@/components/wallet/WalletProvider";
import { rpc } from "@/lib/rpc";
import {
  formatUnits,
  loadMarket,
  parseUnits,
  plan,
  quote,
  tokenBalance,
  waitForReceipt,
  withSlippage,
  type Market,
} from "@/lib/pons";

const TOUR_KEY = "olaz.tour.done";

const TOUR = [
  { target: "swap-head", text: `This is where you buy or sell ${BRAND.symbol}. Slippage tolerance sits in the corner.` },
  { target: "swap-send", text: "You pay: type an amount. Your real wallet balance is shown above it." },
  { target: "swap-flip", text: "Flip the direction to sell back to ETH." },
  { target: "swap-receive", text: "You get: a quote read straight from the chain, fees included." },
  { target: "swap-cta", text: `The big button connects your wallet and moves it to ${CHAIN.name}, chain ${CHAIN.id}.` },
  { target: "swap-stats", text: "Network, gas and the contract are listed here. Always check the contract before you swap." },
];

function readFlag() {
  try {
    return window.localStorage.getItem(TOUR_KEY) === "1";
  } catch {
    return false;
  }
}
function writeFlag() {
  try {
    window.localStorage.setItem(TOUR_KEY, "1");
  } catch {
    // Tour simply shows again next time.
  }
}

/** ETH and token balances in base units, re-read whenever `tick` changes. */
function useBalances(address: string | null, tick: number) {
  const [value, setValue] = useState<{ eth: bigint | null; token: bigint | null }>({ eth: null, token: null });
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    const load = () => {
      rpc<string>("eth_getBalance", [address, "latest"])
        .then((hex) => !cancelled && setValue((v) => ({ ...v, eth: BigInt(hex) })))
        .catch(() => {});
      if (isAddress(BRAND.ca)) {
        tokenBalance(BRAND.ca, address)
          .then((raw) => !cancelled && setValue((v) => ({ ...v, token: raw })))
          .catch(() => {});
      }
    };
    load();
    const timer = window.setInterval(load, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [address, tick]);
  return address ? value : { eth: null, token: null };
}

/** Where the token trades right now (curve or pool), refreshed every 30 s. */
function useMarket(tick: number) {
  const [market, setMarket] = useState<Market | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!TOKEN.isLive) return;
    let cancelled = false;
    const load = () =>
      loadMarket(BRAND.ca)
        .then((m) => {
          if (cancelled) return;
          setMarket(m);
          setFailed(false);
        })
        .catch(() => !cancelled && setFailed(true));
    load();
    const timer = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [tick]);
  return { market, failed };
}

const SLIPPAGES = [50, 100, 300];
/** Left in the wallet on a max buy so the swap itself can pay for gas. */
const GAS_RESERVE = 20_000_000_000_000n; // 0.00002 ETH

export function SwapScreen() {
  const [reverse, setReverse] = useState(false);
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<number | null>(null);

  const { address, chainId, onRobinhoodChain, switchNetwork, switching, sendTransaction, refreshBalance } = useWallet();
  const { open } = useWalletModal();
  const [tick, setTick] = useState(0);
  const balances = useBalances(address, tick);
  const { market, failed: marketFailed } = useMarket(tick);
  const [slippage, setSlippage] = useState(100);
  const [quoted, setQuoted] = useState<{ key: string; out: bigint } | null>(null);
  const [quoteFailedKey, setQuoteFailedKey] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);

  const buying = !reverse;
  const amountIn = parseUnits(amount);
  const tradable = market?.venue === "curve" || market?.venue === "pool";
  const quoteKey = `${buying}:${amountIn}:${market?.venue}`;

  // Debounced quote straight from the chain; stale answers are dropped by key.
  useEffect(() => {
    if (!market || !tradable || !amountIn) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      quote(market, buying, amountIn, address ?? "0x000000000000000000000000000000000000dEaD")
        .then((out) => {
          if (cancelled) return;
          setQuoted({ key: quoteKey, out });
        })
        .catch(() => !cancelled && setQuoteFailedKey(quoteKey));
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [market, tradable, amountIn, buying, address, quoteKey]);

  const out = amountIn && quoted?.key === quoteKey ? quoted.out : null;
  const quoteError = amountIn && out === null && quoteFailedKey === quoteKey ? "No quote for this amount right now." : null;
  const sendBalanceRaw = buying ? balances.eth : balances.token;
  const short = amountIn !== null && sendBalanceRaw !== null && amountIn + (buying ? GAS_RESERVE : 0n) > sendBalanceRaw;

  const fillMax = () => {
    if (sendBalanceRaw === null) return;
    const max = buying ? (sendBalanceRaw > GAS_RESERVE ? sendBalanceRaw - GAS_RESERVE : 0n) : sendBalanceRaw;
    setAmount(formatUnits(max, 18, 18).replace(/,/g, ""));
  };

  const trade = async () => {
    if (!market || !address || !amountIn) return;
    setTradeError(null);
    setLastTx(null);
    try {
      setStage("Quoting…");
      // Re-quote right before signing: curve prices move with every buy.
      const fresh = await quote(market, buying, amountIn, address);
      const txs = await plan(market, buying, amountIn, withSlippage(fresh, slippage), address);
      for (const [i, tx] of txs.entries()) {
        const step = txs.length > 1 ? ` (${i + 1}/${txs.length})` : "";
        setStage(`${tx.label}${step}: confirm in wallet…`);
        const hash = await sendTransaction(tx);
        setStage(`${tx.label}${step}: waiting for block…`);
        await waitForReceipt(hash);
        if (i === txs.length - 1) setLastTx(hash);
      }
      setAmount("");
    } catch (cause) {
      setTradeError(cause instanceof Error ? cause.message : "The swap did not go through.");
    } finally {
      setStage(null);
      setTick((n) => n + 1);
      refreshBalance();
    }
  };

  useEffect(() => {
    // A short pause so the tour opens after the page has drawn.
    const t = window.setTimeout(() => {
      if (!readFlag()) setStep(0);
    }, 500);
    return () => window.clearTimeout(t);
  }, []);

  // Keep the highlighted part on screen while the tour runs.
  useEffect(() => {
    if (step === null) return;
    document.getElementById(TOUR[step].target)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [step]);

  const endTour = () => {
    setStep(null);
    writeFlag();
  };

  const wrong = address !== null && chainId !== null && !onRobinhoodChain;
  const sendToken = reverse ? BRAND.ticker : "ETH";
  const receiveToken = reverse ? "ETH" : BRAND.ticker;
  const show = (v: bigint | null) => (v === null ? null : formatUnits(v, 18, 4));
  const sendBalance = show(sendBalanceRaw);
  const receiveBalance = show(buying ? balances.token : balances.eth);
  const ring = (id: string) =>
    step !== null && TOUR[step].target === id ? "ring-2 ring-amber-deep ring-offset-2 ring-offset-card" : "";

  return (
    <div className="relative">
      <main className="mx-auto grid max-w-[1180px] grid-cols-1 gap-8 px-4 pt-8 pb-12 sm:px-6 lg:grid-cols-[1fr_440px] lg:gap-12">
        <div className="min-w-0 lg:pt-4">
          <p className="label">{BRAND.symbol} · {CHAIN.name}</p>
          <h1 className="h-display mt-3 text-[54px] sm:text-[72px]">Swap {BRAND.ticker}</h1>
          <p className="mt-3 max-w-md text-[17px] text-ink-2">
            Trade ETH for {BRAND.symbol} on {CHAIN.name}. Quotes and swaps go straight to the chain from your own wallet.
          </p>

          <div className="panel mt-7 max-w-md p-5">
            <p className="label">Where it trades</p>
            <p className="h-display mt-2 text-[28px]" data-testid="swap-venue">
              {!TOKEN.isLive
                ? "Opens at launch"
                : marketFailed && !market
                  ? "Could not read the market"
                  : !market
                    ? "Reading the market…"
                    : market.venue === "curve"
                      ? "Pons bonding curve"
                      : market.venue === "pool"
                        ? "Uniswap v4 pool"
                        : market.venue === "graduating"
                          ? "Graduating"
                          : market.reason}
            </p>
            {TOKEN.isLive && market?.venue === "curve" ? (
              <div className="mt-3">
                <div className="flex justify-between font-mono text-[11px] text-ink-2">
                  <span>To graduation</span>
                  <span>{Math.round((market.progress ?? 0) * 100)}%</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-line">
                  <div className="h-full bg-amber" style={{ width: `${Math.min(100, Math.round((market.progress ?? 0) * 100))}%` }} />
                </div>
              </div>
            ) : null}
            <p className="mt-3 text-sm leading-relaxed text-ink-2">
              {TOKEN.isLive
                ? `${BRAND.symbol} launched on Pons. Until it graduates, swaps go through its bonding curve; after that, through its Uniswap v4 pool. Quotes include the launch fees.`
                : `Swaps open the moment the contract is published. Until then this page connects your wallet, moves it to ${CHAIN.name} and shows your real ETH balance.`}
            </p>
            <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4 text-xs" id="swap-stats">
              <div className={`rounded-md ${ring("swap-stats")}`}>
                <dt className="text-ink-3">Network</dt>
                <dd className="mt-0.5 font-semibold">{CHAIN.name}</dd>
                <dd className="text-ink-3">chain id {CHAIN.id}</dd>
              </div>
              <div>
                <dt className="text-ink-3">Gas</dt>
                <dd className="mt-0.5 font-semibold">{CHAIN.nativeSymbol}</dd>
                <dd className="text-ink-3">paid per swap</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-ink-3">Contract</dt>
                {isAddress(BRAND.ca) ? (
                  <dd>
                    <a href={explorerToken(BRAND.ca)} target="_blank" rel="noreferrer" className="mt-0.5 block truncate font-mono font-semibold text-up underline">
                      {shortAddress(BRAND.ca, 4, 4)}
                    </a>
                  </dd>
                ) : (
                  <dd className="mt-0.5 font-semibold">At launch</dd>
                )}
              </div>
            </dl>
            <a
              href={CHAIN.explorer}
              target="_blank"
              rel="noreferrer"
              className="mt-4 flex items-center gap-2 font-mono text-[11px] tracking-[0.06em] text-up uppercase hover:underline"
            >
              Explore {CHAIN.name} on Blockscout <ArrowUpRight className="size-3.5" />
            </a>
          </div>

          <button type="button" onClick={() => setStep(0)} className="btn btn-ghost mt-5 h-10 px-4 text-sm">
            Show me around
          </button>
        </div>

        <div className="relative w-full">
          <div className="panel p-4 sm:p-5">
            <div id="swap-head" className={`flex items-center justify-between gap-2 rounded-lg ${ring("swap-head")}`}>
              <h2 className="h-display text-[28px]">Swap</h2>
              <span className="flex items-center gap-1 font-mono text-[11px]">
                <span className="text-ink-3">Slippage</span>
                {SLIPPAGES.map((bps) => (
                  <button
                    key={bps}
                    type="button"
                    onClick={() => setSlippage(bps)}
                    className={`cursor-pointer rounded border px-1.5 py-0.5 font-semibold ${slippage === bps ? "border-ink bg-ink text-chalk" : "border-transparent text-ink-2 hover:border-line-2"}`}
                  >
                    {bps / 100}%
                  </button>
                ))}
              </span>
            </div>

            <div id="swap-send" className={`mt-4 rounded-xl ${ring("swap-send")}`}>
              <div className="rounded-md border border-line-2 bg-paper px-4 pt-2.5 pb-3">
                <div className="flex justify-between text-xs font-semibold text-ink-2">
                  <span>You pay</span>
                  <span className="flex gap-2">
                    <span>Balance: {sendBalance ?? "–"}</span>
                    {TOKEN.isLive && sendBalanceRaw !== null ? (
                      <button type="button" onClick={fillMax} className="cursor-pointer font-bold text-up underline">
                        Max
                      </button>
                    ) : null}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    inputMode="decimal"
                    placeholder="0"
                    value={amount}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9.]/g, "");
                      const dot = v.indexOf(".");
                      setAmount(dot < 0 ? v : v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, ""));
                    }}
                    className="min-w-0 flex-1 bg-transparent font-mono text-[28px] font-semibold outline-none placeholder:text-ink-3"
                    aria-label={`Amount of ${sendToken} to send`}
                  />
                  <TokenBadge token={sendToken} />
                </div>
              </div>
            </div>

            <div className="relative z-10 -my-3 flex justify-center">
              <button
                id="swap-flip"
                type="button"
                onClick={() => setReverse((v) => !v)}
                aria-label="Flip direction"
                className={`flex size-10 cursor-pointer items-center justify-center rounded-md border border-line-2 bg-card transition-transform hover:rotate-180 ${ring("swap-flip")}`}
              >
                <ArrowDownUp className="size-4" strokeWidth={2.5} />
              </button>
            </div>

            <div id="swap-receive" className={`rounded-xl ${ring("swap-receive")}`}>
              <div className="rounded-md border border-line-2 bg-paper-2 px-4 pt-2.5 pb-3">
                <div className="flex justify-between text-xs font-semibold text-ink-2">
                  <span>You get</span>
                  <span>Balance: {receiveBalance ?? "–"}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className={`min-w-0 flex-1 truncate font-mono text-[28px] font-semibold ${out ? "text-ink" : "text-ink-3"}`} data-testid="swap-out">
                    {out !== null ? formatUnits(out, 18, buying ? 2 : 6) : "0"}
                  </span>
                  <TokenBadge token={receiveToken} />
                </div>
              </div>
              <p className="mt-1.5 px-1 text-xs text-ink-3">
                {!TOKEN.isLive
                  ? "Quotes open at launch"
                  : quoteError
                    ? quoteError
                    : out !== null
                      ? `At least ${formatUnits(withSlippage(out, slippage), 18, buying ? 2 : 6)} after ${slippage / 100}% slippage`
                      : "Fees included in the quote"}
              </p>
            </div>

            <div id="swap-cta" className={`mt-4 rounded-xl ${ring("swap-cta")}`}>
              {!address ? (
                <button type="button" onClick={open} className="btn btn-ink h-12 w-full text-base" data-testid="swap-connect">
                  Connect wallet
                </button>
              ) : wrong ? (
                <button type="button" onClick={switchNetwork} disabled={switching} className="btn btn-accent h-12 w-full text-base">
                  {switching ? "Confirm in wallet…" : `Switch to ${CHAIN.name}`}
                </button>
              ) : !TOKEN.isLive ? (
                <button type="button" disabled className="btn btn-accent h-12 w-full text-base">
                  Swaps open at launch
                </button>
              ) : market && market.venue === "unavailable" ? (
                <a href={PONS.page(BRAND.ca)} target="_blank" rel="noreferrer" className="btn btn-accent h-12 w-full text-base">
                  Trade on Pons ↗
                </a>
              ) : (
                <button
                  type="button"
                  onClick={trade}
                  disabled={!tradable || !amountIn || short || out === null || out === 0n || stage !== null}
                  className="btn btn-accent h-12 w-full text-base"
                  data-testid="swap-submit"
                >
                  {stage ??
                    (!tradable
                      ? "Trading paused"
                      : !amountIn
                        ? "Enter an amount"
                        : short
                          ? `Not enough ${buying ? "ETH" : BRAND.ticker}`
                          : out === null
                            ? "Getting a quote…"
                            : buying
                              ? `Buy ${BRAND.ticker}`
                              : `Sell ${BRAND.ticker}`)}
                </button>
              )}
            </div>

            {tradeError ? (
              <p role="alert" className="mt-3 rounded-lg border border-down bg-down-soft px-3 py-2 text-xs leading-relaxed text-down">
                {tradeError}
              </p>
            ) : null}
            {lastTx ? (
              <a
                href={`${CHAIN.explorer}/tx/${lastTx}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 block text-center font-mono text-xs font-semibold text-up underline"
                data-testid="swap-done"
              >
                Swap confirmed · view transaction ↗
              </a>
            ) : null}

            {address ? (
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
                <span className="font-mono text-[11px] text-ink-3">Connected wallet</span>
                <NavWallet compact />
              </div>
            ) : null}
          </div>

          {step !== null ? (
            <div
              role="dialog"
              aria-label="Guided tour"
              className="fixed inset-x-3 bottom-[76px] z-30 mx-auto max-w-[360px] rounded-lg bg-board p-4 text-sm text-chalk shadow-xl md:right-6 md:bottom-6 md:left-auto md:mx-0 md:w-[340px]"
              style={{ animation: "rise 0.25s ease-out" }}
            >
              <p className="leading-relaxed font-medium">{TOUR[step].text}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="font-mono text-[11px] font-semibold">
                  {step + 1} / {TOUR.length}
                </span>
                <div className="flex gap-2">
                  <button type="button" onClick={endTour} className="btn h-8 border-chalk/25 px-3 text-xs text-chalk">
                    Skip
                  </button>
                  <button
                    type="button"
                    onClick={() => (step + 1 < TOUR.length ? setStep(step + 1) : endTour())}
                    className="btn btn-accent h-8 px-3 text-xs"
                  >
                    {step + 1 < TOUR.length ? "Next" : "Done"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function TokenBadge({ token }: { token: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-line-2 bg-card py-1 pr-3 pl-1 text-sm font-semibold">
      {token === "ETH" ? (
        <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
          <circle cx="12" cy="12" r="12" fill="#627eea" />
          <path d="M12 3.5 6.8 12.2 12 15.3l5.2-3.1z M12 16.3 6.8 13.2 12 20.5l5.2-7.3z" fill="#fff" />
        </svg>
      ) : (
        <MarkBadge size={24} />
      )}
      {token}
    </span>
  );
}

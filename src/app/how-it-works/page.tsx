import type { Metadata } from "next";
import Link from "next/link";
import { ASSETS, CATEGORIES } from "@/config/markets";
import { CHAIN } from "@/config/brand";
import { FEE_PCT, MAX_STAKE, MIN_STAKE, START_BALANCE } from "@/lib/rounds";
import { ONCHAIN_MARKETS, ROUNDS_CONTRACT, roundsLive } from "@/config/onchain";

export const metadata: Metadata = {
  title: "How it works",
  description: "Rounds, price sources, parimutuel payouts, practice mode and the on-chain round contract.",
};

const H2 = "h-display text-[34px] sm:text-[40px]";

export default function HowItWorks() {
  return (
    <main className="mx-auto max-w-[920px] px-4 pt-8 pb-8 sm:px-6">
      <p className="label">The rulebook</p>
      <h1 className="h-display mt-2 text-[56px] sm:text-[80px]">How it works</h1>
      <p className="mt-4 text-[17px] leading-relaxed text-ink-2">
        Olaz runs short prediction rounds on {CHAIN.name}. You read the market, call whether a value will be higher or lower at the end of the round, and the
        price source settles it. It is a market of opinions with a public rulebook, not a house you play against: every stake goes into a shared pot and the
        side that read the move correctly takes it.
      </p>

      <section className="mt-12">
        <h2 className={H2}>The loop</h2>
        <ol className="mt-4 border-t border-ink">
          {[
            [
              "Pick a market",
              "An asset and a round length: 5 minutes, 15 minutes or 1 hour. Rounds start on UTC boundaries (:00, :05, :15…), back to back, around the clock.",
            ],
            ["Take UP or DOWN", "Your stake joins the next round, which is open until it locks at the boundary. You can add to your side, never take both."],
            ["The round runs", "At lock, the price to beat is fixed from the source. Nothing can be added once a round is running."],
            [
              "It settles",
              "At the end, the closing value is read from the same source. Close above lock: UP wins. Below: DOWN wins. Equal: everyone is refunded.",
            ],
            ["Claim", "Winners claim their share of the pot. Losing stakes are what winners are paid with."],
          ].map(([t, d], i) => (
            <li key={t} className="grid grid-cols-[48px_1fr] gap-3 border-b border-line py-4">
              <span className="h-display text-[34px] text-ink-3">{i + 1}</span>
              <div>
                <p className="text-[17px] font-semibold">{t}</p>
                <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12">
        <h2 className={H2}>Payouts: one pot per round</h2>
        <p className="mt-3 text-[15.5px] leading-relaxed text-ink-2">
          Payouts are parimutuel. All stakes in a round go into one pot. When the round is decided, {FEE_PCT}% of the pot is the protocol fee and the rest is
          split across the winning side in proportion to each stake. The multiplier on the board is exactly that: pot after fee divided by the stakes on that
          side, so it moves while the round is open and is fixed the moment it locks.
        </p>
        <div className="board mt-5 p-5 font-mono text-[13.5px] leading-relaxed">
          <p className="text-chalk/55">Example</p>
          <p className="mt-2">UP pool 0.30 · DOWN pool 0.10 · pot 0.40</p>
          <p>Fee {FEE_PCT}% → 0.388 to share</p>
          <p className="mt-2 text-[#3fcf86]">UP wins: each 0.01 on UP returns 0.388 × 0.01 / 0.30 = 0.01293</p>
          <p className="text-[#ff6b4f]">DOWN wins: each 0.01 on DOWN returns 0.388 × 0.01 / 0.10 = 0.0388</p>
          <p className="mt-2 text-amber">Tie, empty side or unreadable price: every stake back, no fee.</p>
        </div>
      </section>

      <section className="mt-12">
        <h2 className={H2}>Where prices come from</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-t border-ink text-left text-[14px]">
            <thead>
              <tr className="border-b border-line">
                <th className="label py-2 font-medium">Market</th>
                <th className="label py-2 font-medium">Source</th>
                <th className="label py-2 font-medium">Lock / close</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map((c) => (
                <tr key={c.id} className="border-b border-line align-top">
                  <td className="py-3 pr-3 font-medium">
                    {c.label}
                    <span className="block text-[12.5px] font-normal text-ink-3">
                      {ASSETS.filter((a) => a.category === c.id)
                        .map((a) => a.symbol)
                        .join(", ")}
                    </span>
                  </td>
                  <td className="py-3 pr-3 text-ink-2">
                    {c.id === "crypto"
                      ? "OKX spot candles"
                      : c.id === "chain"
                        ? "Uniswap v3 pool oracle on Robinhood Chain + OKX ETH-USDT"
                        : c.id === "stocks"
                          ? "Chainlink feeds on Robinhood Chain"
                          : "Robinhood Chain block headers"}
                  </td>
                  <td className="py-3 text-ink-2">
                    {c.id === "crypto"
                      ? "Open of the 1-minute candle at the boundary"
                      : c.id === "chain"
                        ? "30-second time-weighted average ending at the boundary"
                        : c.id === "stocks"
                          ? "Last published answer at or before the boundary; 24/5 hours, hourly rounds only"
                          : "Blocks produced in the round vs the window before"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[13.5px] text-ink-3">
          NFT floor markets are not listed: there is no free, verifiable floor source on this chain yet. Weekly range markets on ETH, BTC and SOL use the same
          OKX candles.
        </p>
      </section>

      <section className="mt-12" id="practice">
        <h2 className={H2}>Practice mode</h2>
        <p className="mt-3 text-[15.5px] leading-relaxed text-ink-2">
          Every market can also be played with practice ETH (pETH). Sign in once with your wallet (a free signature, no transaction) and your address gets{" "}
          {START_BALANCE} pETH. Stakes run from {MIN_STAKE} to {MAX_STAKE} pETH per round. Positions settle against the real prices above with the real payout
          rules, and the leaderboard only lists wallets that actually played. pETH has no value and cannot be withdrawn.
        </p>
      </section>

      <section className="mt-12" id="contracts">
        <h2 className={H2}>Real ETH rounds</h2>
        <p className="mt-3 text-[15.5px] leading-relaxed text-ink-2">
          One contract, OlazRounds, runs the same rules on {CHAIN.name} with real ETH. It has no owner: its markets, the {FEE_PCT}% fee, the stake limits and
          the fee recipient were fixed when it was deployed, and nobody can move the stakes it holds.
        </p>
        <ul className="mt-4 border-t border-ink">
          {[
            [
              "Markets",
              `${ONCHAIN_MARKETS.length} markets: ETH and the chain tokens at 5 minutes, 15 minutes and 1 hour, and the four stocks hourly. BTC, SOL, chain pace and the weekly ranges have no price the contract can read on this chain, so they stay practice-only.`,
            ],
            [
              "Prices the contract reads itself",
              "ETH: the 60-second time-weighted average of the Uniswap v3 WETH/USDG pool, ending at each boundary. Chain tokens: their own WETH pool combined with that WETH price. Stocks: the Chainlink round that was current at each boundary, which the contract checks against the feed; a price older than four hours refunds the round.",
            ],
            [
              "Settlement",
              "Anyone can settle a round once it ends, and a keeper does it within seconds. Nobody can choose the result: the contract reads the prices itself. A round with one side empty refunds as soon as it locks.",
            ],
            [
              "Claims and safety rails",
              `Claim any time after settlement. Stakes run from ${MIN_STAKE} to ${MAX_STAKE} ETH per entry and each round has a cap on its pot. If a pool's history no longer reaches a round a day after it ended, the round refunds; any round nobody could settle for seven days can be voided by anyone, so stakes are never stuck.`,
            ],
          ].map(([t, d]) => (
            <li key={t} className="border-b border-line py-3.5">
              <p className="font-semibold">{t}</p>
              <p className="mt-0.5 text-[14.5px] text-ink-2">{d}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[14px] text-ink-3">
          {roundsLive() ? (
            <>
              Contract:{" "}
              <a href={`${CHAIN.explorer}/address/${ROUNDS_CONTRACT}`} target="_blank" rel="noreferrer" className="font-mono break-all underline">
                {ROUNDS_CONTRACT}
              </a>
              {" "}
              (
              <a href={`${CHAIN.explorer}/address/${ROUNDS_CONTRACT}?tab=contract`} target="_blank" rel="noreferrer" className="underline">
                source verified
              </a>
              ). It has not been audited: stake only what you can afford to lose.
            </>
          ) : (
            "The contract is not deployed yet. Until it is, nothing on this site asks you to send ETH."
          )}{" "}
          See the{" "}
          <Link href="/terms" className="underline">
            terms
          </Link>
          .
        </p>
      </section>
    </main>
  );
}

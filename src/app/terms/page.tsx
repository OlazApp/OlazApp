import type { Metadata } from "next";
import { BRAND, CHAIN } from "@/config/brand";
import { FEE_PCT } from "@/lib/rounds";

export const metadata: Metadata = { title: "Terms", description: `Terms of use for ${BRAND.name}.` };

const sections: [string, string[]][] = [
  [
    "What this site is",
    [
      `${BRAND.name} is a website that runs short UP/DOWN prediction rounds and weekly range markets on ${CHAIN.name}. It reads public price sources and shows them as they are.`,
      "Positions can use practice ETH (pETH) kept by this site, which has no monetary value, cannot be bought, sold or withdrawn, and may be reset. Once the OlazRounds contract is deployed, listed markets also accept real ETH, held and paid out by that contract alone.",
    ],
  ],
  [
    "Your wallet",
    [
      "Connecting a wallet shares your public address. Signing in asks for one free message signature to prove you control that address; it sends no transaction.",
      "You are responsible for your keys, devices and every transaction you approve in your wallet, including swaps on the swap page, which go directly to on-chain contracts.",
    ],
  ],
  [
    "Rounds and settlement",
    [
      "Rounds, lock and close values, and outcomes follow the rules published on each market page and on How it works. Prices come from third-party sources (OKX, Uniswap pool oracles, Chainlink feeds, the chain RPC) that can be delayed or wrong.",
      `Decided rounds carry a ${FEE_PCT}% fee on the pot. Ties, one-sided rounds and rounds whose price could not be read refund every stake in full.`,
      "For real-ETH rounds, the contract code and on-chain state take precedence over anything shown on this site. The contract has no owner and has not been audited; a bug could lose the stakes it holds. Stake only what you can afford to lose.",
      "Pool and feed prices can be pushed by large trades or arrive late. Each round's pot is capped to limit that risk, but it is not removed.",
    ],
  ],
  [
    "Acceptable use",
    [
      "Do not attack, overload or try to manipulate the site, its storage or the practice ledger, and do not impersonate other traders. Display names that are abusive or misleading may be removed.",
      "Do not use the site where prediction markets are restricted for you by law or sanctions.",
    ],
  ],
  [
    "No advice, no affiliation",
    [
      "Nothing here is financial, investment or legal advice. Markets move fast and you can lose what you stake.",
      `${BRAND.name} is an independent project on ${CHAIN.name} and is not affiliated with or endorsed by Robinhood Markets, Inc.`,
    ],
  ],
  ["Changes", ["These terms may change as the product moves on-chain. The date below shows the latest version."]],
];

export default function Terms() {
  return (
    <main className="mx-auto max-w-[820px] px-4 pt-8 pb-8 sm:px-6">
      <h1 className="h-display text-[56px] sm:text-[72px]">Terms</h1>
      <p className="label mt-2">Last updated 5 October 2026</p>
      {sections.map(([title, paras], i) => (
        <section key={title} className="mt-8 border-t border-line pt-5">
          <h2 className="text-[19px] font-semibold">
            {i + 1}. {title}
          </h2>
          {paras.map((p) => (
            <p key={p.slice(0, 20)} className="mt-2.5 text-[15px] leading-relaxed text-ink-2">
              {p}
            </p>
          ))}
        </section>
      ))}
    </main>
  );
}

# Olaz

**Predict. Win. Repeat.** Short UP/DOWN rounds on Robinhood Chain, staked in ETH, settled by a contract that reads its own prices. Fully open source: the website, the contract, the settlement bot and the integration scripts are all in this repository.

Website: [olaz.app](https://olaz.app) · X: [@olaz](https://x.com/olaz) · Contract: [`0xee42017b063ccFBEAE06A319a629D2A023dAFd10`](https://robinhoodchain.blockscout.com/address/0xee42017b063ccFBEAE06A319a629D2A023dAFd10?tab=contract) (source verified)

## The problem

Calling a short-term move (will ETH be higher in five minutes?) is one of the simplest views a trader can have, and one of the worst-served:

- **You play against the house.** Most short-round products are run by an operator who sets the odds, holds the money and decides the result. When the operator wins, you lose.
- **The price is a black box.** "We used our price feed" is the whole explanation. Nobody outside can check which price, at which second, or whether it was moved.
- **Your stake is not yours until they say so.** Withdrawals wait on someone's approval, and a round that goes wrong is settled however the operator decides.
- **You cannot check the software.** Closed apps ask you to trust code you will never see.

## The solution

Olaz turns each round into a public rule that a contract enforces, and publishes every line that runs it:

- **Players against players.** Every stake in a round goes into one pot. The side that called it right splits the pot in proportion to stake, after a 3% fee on decided rounds. There is no house position.
- **The contract reads the price itself.** ETH and Robinhood Chain tokens are priced from Uniswap v3 pool oracles (60-second time-weighted averages ending at the round's first and last second). Stocks use the Chainlink round that was current at each boundary, which the contract checks on chain. Nobody, including us, can pick the result.
- **Rules that cannot change.** The contract has no owner. Markets, fee, stake limits (0.0005 to 0.25 ETH per entry), per-round pot caps and the fee recipient were fixed at deployment.
- **No stuck money.** Ties, one-sided rounds and stale prices refund in full without fee. If a price can no longer be read a day after a round, it refunds; any round nobody settled for seven days can be voided by anyone.
- **Anyone can settle, anyone can check.** Settlement is a public function and our keeper is in this repository. So is the website: run it yourself, read it, or prove the deployed contract is this source.

## How a round works

```
           entries open                 locked: price to beat fixed            settled: anyone calls settle()
  ───────────[ round r-1 is live ]────────────[ round r is live ]────────────┬──────────────────────────────
             take UP or DOWN in round r      no new entries                   close > lock  → UP wins
                                                                             close < lock  → DOWN wins
                                                                             equal / empty side / stale → refund
```

Rounds are cut from the clock: round `r` of a 5-minute market runs from `r × 300` to `(r + 1) × 300` seconds (unix time), so everyone agrees on which round is which without asking anyone.

## What you can try

Live now:

- **Real-ETH rounds** on 19 markets: ETH and four Robinhood Chain tokens at 5 minutes, 15 minutes and 1 hour; NVDA, TSLA, AAPL and GOOGL hourly. Settle and claim from your positions page.
- **Practice mode** for every market, including BTC, SOL and chain activity (which have no on-chain price the contract could read), with weekly range markets and a leaderboard of wallets that actually played.
- Wallet connection (browser wallets via EIP-6963, WalletConnect when configured), market comments, a wallet-only chat, headlines, watchlist and notifications.
- **No website needed:** read a market, enter, list and claim your rounds with the scripts in `examples/`.

Coming later:

- A swap page for $OLAZ that switches on by itself once the token contract is published.
- NFT floor markets, once a verifiable floor source exists on Robinhood Chain.

## Run it locally

Requires Node.js 20 or newer. Download ZIP or fork this repository, then:

```bash
npm install
npm run build
npm start            # http://localhost:4850
```

Every environment variable is optional; without them the site uses public endpoints and explains what is missing instead of failing. Put them in a local env file or in your host's settings:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_ROBINHOOD_RPC_URL` / `ROBINHOOD_RPC_URL` | Your own Robinhood Chain RPC for the browser / the server |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Project id from cloud.reown.com, enables WalletConnect |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, or `KV_REDIS_URL` / `REDIS_URL` | Storage for practice accounts, comments and chat (a local file is used when unset) |
| `CHAT_KEY_PREFIX` | Key prefix when sharing one Redis (default `olaz:`) |

**The contract** (requires [Foundry](https://book.getfoundry.sh)):

```bash
cd contracts
./setup.sh           # fetches forge-std
forge test           # unit and fuzz tests
forge test --match-contract Fork --evm-version cancun --fork-url https://rpc.mainnet.chain.robinhood.com
```

**Prove the deployed contract is this source, and use it without the website:**

```bash
cd contracts && forge build && cd ../examples && npm install
node verify-deployment.mjs                                     # MATCH + the deployed constructor arguments
node read-round.mjs eth-5m                                     # pools, live round, last result
node enter.mjs eth-5m up 0.001 --dry-run --from 0xYourAddress  # simulate, sends nothing
PRIVATE_KEY=0x... node enter.mjs eth-5m up 0.001               # real entry
PRIVATE_KEY=0x... node claim.mjs                               # claim everything settled
```

**Run a keeper** (settles ended rounds; it has no special rights and only pays gas):

```bash
cd keeper
cp keeper.conf.example keeper.conf      # set ROUNDS_CONTRACT
docker compose build
docker compose run --rm --user root -v "$PWD/keys:/out" keeper node make-key.mjs   # creates keys/keeper.key, prints the address to fund
sudo chown 1000:1000 keys/keeper.key && chmod 400 keys/keeper.key
docker compose up -d
```

Keep private keys in your shell or in `keeper/keys/` (ignored by git), never in a file you commit.

## Add the network to your wallet

Connecting through the site adds it automatically. To add it by hand:

| Field | Value |
| --- | --- |
| Network name | Robinhood Chain |
| Chain ID | 4663 |
| RPC URL | https://rpc.mainnet.chain.robinhood.com |
| Currency symbol | ETH |
| Block explorer | https://robinhoodchain.blockscout.com |

## Project layout

```
src/
  app/                    pages and API routes (board, market, weekly, positions, news, chat, ...)
  components/             UI: board, market and entry panels, on-chain positions, wallet dialog
  config/brand.ts         name, links, token contract address, chain settings
  config/markets.ts       assets, round lengths and practice price sources
  config/onchain.ts       the round contract and the 19 markets it was deployed with
  lib/onchain/            contract calls, wallet history, settlement hints, pool reads
  lib/rounds.ts           round clock and parimutuel payout maths
  lib/feeds/              Uniswap v3 oracle, Chainlink, OKX, block headers, market stats, headlines
  lib/practice/           practice balances, entries, settlement and claims
contracts/                OlazRounds.sol (Foundry) with unit, fuzz and mainnet-fork tests
keeper/                   settlement bot (Docker)
examples/                 read, enter, claim and verify-deployment scripts (viem)
scripts/                  brand image renderer, constructor-argument encoder
```

## Contracts

| | Address |
| --- | --- |
| OlazRounds | [`0xee42017b063ccFBEAE06A319a629D2A023dAFd10`](https://robinhoodchain.blockscout.com/address/0xee42017b063ccFBEAE06A319a629D2A023dAFd10?tab=contract), block 80279800, source verified |
| $OLAZ token | Published at launch. Only trust the address shown on olaz.app and [@olaz](https://x.com/olaz). |

## Security and status

- The contract has **not been audited**. Stake only what you can afford to lose.
- Pool and feed prices can be pushed by large trades or arrive late. Per-round pot caps (25 ETH for ETH, 1 to 5 ETH for tokens, 5 ETH for stocks) limit what manipulation could win; they do not remove the risk.
- Found a vulnerability? Please reach us privately on [@olaz](https://x.com/olaz) before opening a public issue.

## Contributing

Issues and pull requests are welcome. Please run `npm run lint`, `npx tsc --noEmit` and, for contract changes, `forge test` before opening a pull request. The deployed contract cannot be changed; contract pull requests are for a future version.

## License

MIT, see `LICENSE`.

---

Not affiliated with Robinhood Markets, Inc. Nothing here is financial advice.

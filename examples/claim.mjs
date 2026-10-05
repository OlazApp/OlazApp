// Lists a wallet's rounds and claims everything that is settled and unclaimed.
//   PRIVATE_KEY=0x... node claim.mjs
//   node claim.mjs --address 0xYourAddress      (list only)
import { CONFIG, CONTRACT, OUTCOME, abi, arg, eth, publicClient, walletFromEnv } from "./lib.mjs";

const wallet = arg("address") ? null : walletFromEnv();
const address = arg("address") || wallet.account.address;
const count = Number(await publicClient.readContract({ address: CONTRACT, abi, functionName: "entryCount", args: [address] }));
const rows = count ? await publicClient.readContract({ address: CONTRACT, abi, functionName: "entries", args: [address, 0n, BigInt(Math.min(count, 200))] }) : [];

const claimable = [];
for (const e of rows) {
  const index = Number(e.key >> 64n);
  const round = Number(e.key & 0xffffffffffffffffn);
  const id = CONFIG.markets[index]?.id ?? `#${index}`;
  const state = e.claimed ? "claimed" : OUTCOME[e.outcome];
  console.log(`${id.padEnd(12)} round ${round}  ${e.side === 1 ? "UP  " : "DOWN"} ${eth(e.stake)} ETH  ${state.padEnd(7)} payout ${eth(e.payout)}`);
  if (!e.claimed && e.outcome !== 0 && e.payout > 0n) claimable.push(e.key);
}
console.log(`${claimable.length} to claim`);
if (wallet && claimable.length) {
  const { request } = await publicClient.simulateContract({ address: CONTRACT, abi, functionName: "claim", args: [claimable], account: wallet.account });
  const hash = await wallet.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`${receipt.status}: ${hash}`);
}

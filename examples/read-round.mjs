// Reads a market straight from the contract: the open round's pool, the live
// round, and the last settled result.
//   node read-round.mjs eth-5m
import { CONTRACT, abi, publicClient, market, openRound, toUsd, eth, OUTCOME } from "./lib.mjs";

const m = market(process.argv[2] || "eth-5m");
const open = openRound(m);
const read = (round) => publicClient.readContract({ address: CONTRACT, abi, functionName: "getRound", args: [BigInt(m.index), BigInt(round)] });
const [next, live] = await Promise.all([read(open), read(open - 1)]);

const mult = (r, side) => {
  const pot = Number(r.up + r.down);
  const mine = Number(side === "up" ? r.up : r.down);
  return mine > 0 && r.up > 0n && r.down > 0n ? ((pot * 0.97) / mine).toFixed(2) + "x" : "-";
};
console.log(`${m.id} (market ${m.index}) on ${CONTRACT}`);
console.log(`open round ${open}: closes in ${open * m.durationSeconds - Math.floor(Date.now() / 1000)} s`);
console.log(`  UP ${eth(next.up)} ETH (pays ${mult(next, "up")}) | DOWN ${eth(next.down)} ETH (pays ${mult(next, "down")})`);
console.log(`live round ${open - 1}: UP ${eth(live.up)} | DOWN ${eth(live.down)}`);

for (let r = open - 2; r > open - 50; r--) {
  const past = await read(r);
  if (past.outcome === 0) continue;
  console.log(`last settled round ${r}: ${OUTCOME[past.outcome]} (lock ${toUsd(m, past.lockValue)?.toFixed(6) ?? "-"} -> close ${toUsd(m, past.closeValue)?.toFixed(6) ?? "-"} USD)`);
  break;
}

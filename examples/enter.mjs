// Takes a side in the next round of a market.
//   PRIVATE_KEY=0x... node enter.mjs eth-5m up 0.001
//   node enter.mjs eth-5m up 0.001 --dry-run --from 0xYourAddress   (simulates only, sends nothing)
import { parseEther } from "viem";
import { CONTRACT, SIDE, abi, arg, flag, market, openRound, publicClient, walletFromEnv } from "./lib.mjs";

const [, , id, sideText = "up", amount = "0.001"] = process.argv;
const m = market(id || "eth-5m");
const side = SIDE[sideText];
if (!side) throw new Error('Side must be "up" or "down".');
const round = openRound(m);
const value = parseEther(amount);
const args = [BigInt(m.index), BigInt(round), side];

if (flag("dry-run")) {
  const from = arg("from");
  if (!from) throw new Error("--dry-run needs --from <address>");
  await publicClient.simulateContract({ address: CONTRACT, abi, functionName: "enter", args, value, account: from });
  console.log(`OK: ${from} could enter ${m.id} round ${round} ${sideText.toUpperCase()} with ${amount} ETH (nothing sent).`);
} else {
  const wallet = walletFromEnv();
  const { request } = await publicClient.simulateContract({ address: CONTRACT, abi, functionName: "enter", args, value, account: wallet.account });
  const hash = await wallet.writeContract(request);
  console.log(`sent ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`${receipt.status}: ${m.id} round ${round} ${sideText.toUpperCase()} ${amount} ETH`);
}

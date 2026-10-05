// Proves the deployed contract is this repository's source: builds nothing
// itself, but compares the deployment transaction's input with the bytecode
// Foundry produced in ../contracts/out, then decodes the constructor arguments.
//   (cd ../contracts && ./setup.sh && forge build) && node verify-deployment.mjs
import { readFileSync } from "node:fs";
import { decodeAbiParameters } from "viem";
import { CONFIG, publicClient } from "./lib.mjs";

const artifact = JSON.parse(readFileSync(new URL("../contracts/out/OlazRounds.sol/OlazRounds.json", import.meta.url), "utf8"));
const built = artifact.bytecode.object.toLowerCase();
const tx = await publicClient.getTransaction({ hash: CONFIG.deployTx });
const input = tx.input.toLowerCase();
const receipt = await publicClient.getTransactionReceipt({ hash: CONFIG.deployTx });
const fail = (why) => {
  console.log(`MISMATCH: ${why}`);
  process.exit(1);
};

// The transaction must be a plain contract creation that succeeded and created
// exactly the address everyone uses, and that address must still hold code.
if (tx.to !== null) fail("the transaction is not a contract creation.");
if (receipt.status !== "success") fail("the deployment transaction failed.");
if (receipt.contractAddress?.toLowerCase() !== CONFIG.contract.toLowerCase()) fail(`it created ${receipt.contractAddress}, not ${CONFIG.contract}.`);
const code = await publicClient.getCode({ address: CONFIG.contract });
if (!code || code === "0x") fail(`${CONFIG.contract} holds no code.`);
// Creation input = this build's bytecode followed by the ABI-encoded constructor arguments, nothing else.
if (!input.startsWith(built)) fail("the deployed creation code differs from this build.");
console.log(`deployment ${CONFIG.deployTx} created ${receipt.contractAddress}`);
console.log("MATCH: the contract at that address was created from exactly this repository's build.");

const [treasury, weth, pool, markets] = decodeAbiParameters(
  [
    { type: "address" },
    { type: "address" },
    { type: "address" },
    { type: "tuple[]", components: [{ type: "bytes32" }, { type: "uint8" }, { type: "address" }, { type: "bool" }, { type: "uint32" }, { type: "uint32" }, { type: "uint128" }] },
  ],
  `0x${input.slice(built.length)}`,
);
if (markets.length !== CONFIG.markets.length) fail(`the contract has ${markets.length} markets, markets.json lists ${CONFIG.markets.length}.`);
markets.forEach((m, i) => {
  const label = Buffer.from(m[0].slice(2), "hex").toString("utf8").replace(/\0+$/, "");
  if (label !== CONFIG.markets[i].id) fail(`market ${i} is "${label}" on chain, "${CONFIG.markets[i].id}" in markets.json.`);
});
console.log(`treasury ${treasury}\nWETH ${weth}\nWETH/USDG pool ${pool}\nmarkets ${markets.length}, ids match markets.json`);

// Creates keys/keeper.key (mode 400) and prints only the address to fund.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";

const path = "/out/keeper.key";
mkdirSync("/out", { recursive: true });
if (!existsSync(path)) writeFileSync(path, generatePrivateKey() + "\n", { mode: 0o400 });
console.log(privateKeyToAccount(readFileSync(path, "utf8").trim()).address);

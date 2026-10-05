// Prints the OlazRounds constructor arguments from src/config/onchain.ts.
// Usage: node scripts/onchain-args.mjs <treasury> > contracts/test/fork-args.hex
import { constructorArgs } from "../src/config/onchain.ts";

const treasury = process.argv[2] || "0x000000000000000000000000000000000000fee5";
process.stdout.write(constructorArgs(treasury));

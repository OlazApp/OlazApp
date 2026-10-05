import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

const enc = new TextEncoder();
const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** EIP-191 personal_sign recovery. Returns the lowercase signer address. */
export function recoverSigner(message: string, signature: string): string | null {
  const sig = signature.replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{130}$/.test(sig)) return null;
  const body = enc.encode(message);
  const prefix = enc.encode(`\x19Ethereum Signed Message:\n${body.length}`);
  const digest = keccak_256(new Uint8Array([...prefix, ...body]));
  let v = Number.parseInt(sig.slice(128, 130), 16);
  if (v >= 27) v -= 27;
  if (v !== 0 && v !== 1) return null;
  // noble's "recovered" layout is the recovery byte first, then r and s.
  const recovered = new Uint8Array(65);
  recovered[0] = v;
  for (let i = 0; i < 64; i++) recovered[i + 1] = Number.parseInt(sig.slice(i * 2, i * 2 + 2), 16);
  try {
    const pub = secp256k1.recoverPublicKey(recovered, digest, { prehash: false });
    const point = secp256k1.Point.fromBytes(pub).toBytes(false);
    return `0x${hex(keccak_256(point.slice(1)).slice(-20))}`;
  } catch {
    return null;
  }
}


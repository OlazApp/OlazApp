/**
 * Just enough Solidity ABI encoding for the swap calls, without a library.
 * Values are hex strings without the 0x prefix, always whole 32-byte words.
 */

export type Part = { head: string } | { tail: string };

const WORD = 64;

export function word(value: bigint | number | boolean) {
  const n = typeof value === "boolean" ? (value ? 1n : 0n) : BigInt(value);
  if (n < 0n) return (2n ** 256n + n).toString(16).padStart(WORD, "0");
  return n.toString(16).padStart(WORD, "0");
}

export function address(value: string) {
  return value.slice(2).toLowerCase().padStart(WORD, "0");
}

/** A static value that sits in the head as one or more words. */
export const fixed = (hex: string): Part => ({ head: hex });
/** A dynamic value: an offset in the head, its encoding in the tail. */
export const dynamic = (hex: string): Part => ({ tail: hex });

/** Encodes a list of arguments (or a tuple's fields) with head/tail layout. */
export function encode(parts: Part[]) {
  const headSize = parts.reduce((size, part) => size + ("head" in part ? part.head.length / 2 : 32), 0);
  let head = "";
  let tail = "";
  for (const part of parts) {
    if ("head" in part) {
      head += part.head;
    } else {
      head += word(headSize + tail.length / 2);
      tail += part.tail;
    }
  }
  return head + tail;
}

/** `bytes`: length word followed by the data, right-padded to a word. */
export function bytes(hex: string) {
  const data = hex.startsWith("0x") ? hex.slice(2) : hex;
  const padded = data.padEnd(Math.ceil(data.length / WORD) * WORD, "0");
  return word(data.length / 2) + padded;
}

/** `bytes[]`: length word followed by the elements as dynamic values. */
export function bytesArray(items: string[]) {
  return word(items.length) + encode(items.map((item) => dynamic(bytes(item))));
}

/** Reads the 32-byte word at `index` of a hex result as an unsigned integer. */
export function readWord(result: string, index: number) {
  const data = result.startsWith("0x") ? result.slice(2) : result;
  const chunk = data.slice(index * WORD, (index + 1) * WORD);
  return chunk ? BigInt(`0x${chunk}`) : 0n;
}

export function readAddress(result: string, index: number) {
  return `0x${readWord(result, index).toString(16).padStart(40, "0")}`;
}

/** Signed read for int24 and friends, which arrive sign-extended to 256 bits. */
export function readInt(result: string, index: number) {
  const value = readWord(result, index);
  return value >= 2n ** 255n ? value - 2n ** 256n : value;
}

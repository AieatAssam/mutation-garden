export interface RandomResult {
  readonly value: number;
  readonly nextState: number;
}

/** One Mulberry32 draw from a serializable unsigned 32-bit state. */
export function nextRandom(state: number): RandomResult {
  if (!Number.isInteger(state) || state < 0 || state > 0xffff_ffff) {
    throw new RangeError('RNG state must be an unsigned 32-bit integer');
  }

  const nextState = (state + 0x6d2b79f5) >>> 0;
  let valueBits = nextState;
  valueBits = Math.imul(valueBits ^ (valueBits >>> 15), valueBits | 1);
  valueBits ^= valueBits + Math.imul(valueBits ^ (valueBits >>> 7), valueBits | 61);
  const value = ((valueBits ^ (valueBits >>> 14)) >>> 0) / 0x1_0000_0000;

  return { value, nextState };
}

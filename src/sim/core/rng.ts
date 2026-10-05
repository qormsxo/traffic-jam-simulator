export type Rng = {
  next(): number;
};

/** 같은 시드면 같은 난수열을 만듦 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;

  return {
    /** 0 이상 1 미만 난수를 하나 뽑음 */
    next() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

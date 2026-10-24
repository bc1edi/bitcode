// Fee for a transaction of `vbytes` at `rate` sat/vB, rounded up.
export function feeFor(vbytes, rate) {
  if (vbytes <= 0 || rate <= 0) throw new RangeError('vbytes and rate must be positive');
  return Math.ceil(vbytes * rate);
}

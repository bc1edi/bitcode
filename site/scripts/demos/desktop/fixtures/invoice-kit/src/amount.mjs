const SATS_PER_BTC = 100_000_000;

// Parses a BTC amount such as "0.0015" and returns satoshis.
export function btcToSats(btc) {
  const value = Number(btc);
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`Invalid amount: ${btc}`);
  return Math.floor(value * SATS_PER_BTC);
}

export function satsToBtc(sats) {
  if (!Number.isInteger(sats) || sats < 0) throw new RangeError(`Invalid sats: ${sats}`);
  return (sats / SATS_PER_BTC).toFixed(8);
}

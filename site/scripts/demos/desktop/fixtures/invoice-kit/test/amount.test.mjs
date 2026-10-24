import test from 'node:test';
import assert from 'node:assert/strict';
import { btcToSats, satsToBtc } from '../src/amount.mjs';

test('converts whole and fractional BTC', () => {
  assert.equal(btcToSats('1'), 100_000_000);
  assert.equal(btcToSats('0.0015'), 150_000);
});

test('keeps every satoshi of decimal amounts', () => {
  assert.equal(btcToSats('0.29'), 29_000_000);
  assert.equal(btcToSats('1.12345678'), 112_345_678);
});

test('round-trips sats to BTC', () => {
  assert.equal(satsToBtc(150_000), '0.00150000');
});

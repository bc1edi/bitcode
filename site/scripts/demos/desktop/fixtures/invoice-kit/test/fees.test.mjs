import test from 'node:test';
import assert from 'node:assert/strict';
import { feeFor } from '../src/fees.mjs';

test('rounds fees up to a whole satoshi', () => {
  assert.equal(feeFor(141, 2.5), 353);
});

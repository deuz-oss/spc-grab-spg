import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exceptionNoteProblem } from './exceptionNote';

test('a few letters are refused, counted after trimming (B7)', () => {
  assert.equal(exceptionNoteProblem('  ada  '), 'Tulis apa yang dicek dan hasilnya, minimal 10 karakter (sekarang 3).');
  assert.match(exceptionNoteProblem(undefined) ?? '', /sekarang 0/);
});

test('a real note passes', () => {
  assert.equal(exceptionNoteProblem('Sudah telepon SPG, pintu masuk venue pindah'), null);
  assert.equal(exceptionNoteProblem('1234567890'), null);
});

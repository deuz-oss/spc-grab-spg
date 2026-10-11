import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from './html';

test('markup in a name is shown as text', () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(escapeHtml("Sari & Co's"), 'Sari &amp; Co&#39;s');
});

test('ordinary names are unchanged', () => {
  assert.equal(escapeHtml('Sari Wulandari · Tunjungan Plaza · Di venue'), 'Sari Wulandari · Tunjungan Plaza · Di venue');
});

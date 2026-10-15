import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// app.json lists Android permissions explicitly, so nothing a library needs is added for us.
const app = JSON.parse(readFileSync(new URL('../../app.json', import.meta.url), 'utf8'));
const permissions: string[] = app.expo.android.permissions;

test('background location task has every permission it needs on Android', () => {
  // expo-task-manager schedules a persisted job for each batch of background locations; without
  // RECEIVE_BOOT_COMPLETED Android 16 rejects it and the app crashes on the first GPS fix of a shift
  // (pilot phone test, 15 Oct 2026).
  for (const p of [
    'ACCESS_FINE_LOCATION',
    'ACCESS_BACKGROUND_LOCATION',
    'FOREGROUND_SERVICE',
    'FOREGROUND_SERVICE_LOCATION',
    'POST_NOTIFICATIONS',
    'RECEIVE_BOOT_COMPLETED',
  ]) {
    assert.ok(permissions.includes(`android.permission.${p}`), `app.json is missing android.permission.${p}`);
  }
});

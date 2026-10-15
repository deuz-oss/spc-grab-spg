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

test('no microphone or draw-over-other-apps permission (photos only; SPG personal data, UU PDP)', () => {
  // expo-image-picker adds RECORD_AUDIO for video and the Expo template adds SYSTEM_ALERT_WINDOW; neither is used.
  const blocked: string[] = app.expo.android.blockedPermissions ?? [];
  for (const p of ['RECORD_AUDIO', 'SYSTEM_ALERT_WINDOW']) {
    assert.ok(blocked.includes(`android.permission.${p}`), `app.json does not block android.permission.${p}`);
    assert.ok(!permissions.includes(`android.permission.${p}`), `app.json requests android.permission.${p}`);
  }
});

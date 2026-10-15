import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { appVersionLabel } from '../utils/appVersion';

/** e.g. "1.0.0 (build 4)" on Android/iOS, "1.0.0 (web)" in the browser. */
export const APP_VERSION = appVersionLabel(
  Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? null,
  Application.nativeBuildVersion,
);

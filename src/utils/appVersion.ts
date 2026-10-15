/**
 * Which APK is on this phone. Every EAS build bumps the Android versionCode (eas.json autoIncrement) while the
 * version name stays 1.0.0, so the build number is what tells two pilot APKs apart. Pure — unit-tested in Node.
 */
export function appVersionLabel(version: string | null, build: string | null): string {
  const v = version || '?';
  return build ? `${v} (build ${build})` : `${v} (web)`;
}

/**
 * Dynamic layer over app.json. Sentry source-map upload at build time only once the
 * project is set up on EAS (SENTRY_ORG / SENTRY_PROJECT, secret SENTRY_AUTH_TOKEN).
 */
module.exports = ({ config }) => {
  const { SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN } = process.env;
  const sentryPlugin =
    SENTRY_ORG && SENTRY_PROJECT && SENTRY_AUTH_TOKEN
      ? [['@sentry/react-native/expo', { organization: SENTRY_ORG, project: SENTRY_PROJECT }]]
      : [];
  return { ...config, plugins: [...(config.plugins ?? []), ...sentryPlugin] };
};

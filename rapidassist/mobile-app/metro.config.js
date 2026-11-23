const { getDefaultConfig } = require('expo/metro-config');
const { validateReleaseApiOrigin } = require('./scripts/release-api-origin');

/**
 * Metro configuration for Expo.
 * https://docs.expo.dev/guides/customizing-metro/
 */
const config = getDefaultConfig(__dirname);
config.transformer.babelTransformerPath = require.resolve('./metro.transformer');
const getTransformOptions = config.transformer.getTransformOptions;
config.transformer.getTransformOptions = (entryFiles, options, getDependencies) => {
  if (!options.dev) {
    validateReleaseApiOrigin(process.env.EXPO_PUBLIC_API_URL);
    if (/^(1|true|yes|on)$/i.test(process.env.EXPO_NO_CLIENT_ENV_VARS || '')) {
      throw new Error('Release builds must enable Expo client environment variable inlining. Unset EXPO_NO_CLIENT_ENV_VARS.');
    }
  }
  return getTransformOptions(entryFiles, options, getDependencies);
};

module.exports = config;

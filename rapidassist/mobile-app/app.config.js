const base = require("./app.json").expo;

module.exports = () => {
  const iosUrlScheme = process.env.GOOGLE_IOS_URL_SCHEME?.trim();
  const androidMapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim();
  return {
    ...base,
    android: { ...base.android, ...(androidMapsKey ? { config: { ...base.android.config, googleMaps: { apiKey: androidMapsKey } } } : {}) },
    extra: { ...base.extra, googleMapsAndroidConfigured: Boolean(androidMapsKey) },
    plugins: [
      ...(base.plugins || []),
      ...(iosUrlScheme
        ? [["@react-native-google-signin/google-signin", { iosUrlScheme }]]
        : [])
    ]
  };
};

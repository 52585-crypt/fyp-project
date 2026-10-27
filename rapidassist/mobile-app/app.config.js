const base = require("./app.json").expo;

module.exports = () => {
  const iosUrlScheme = process.env.GOOGLE_IOS_URL_SCHEME?.trim();
  return {
    ...base,
    plugins: [
      ...(base.plugins || []),
      ...(iosUrlScheme
        ? [["@react-native-google-signin/google-signin", { iosUrlScheme }]]
        : [])
    ]
  };
};

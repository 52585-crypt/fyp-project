const { withAppBuildGradle } = require('expo/config-plugins');

const marker = '// RapidAssist API bundle inputs';
const gradle = `
${marker}
// Re-run Expo bundling and its release validation when the API environment changes.
tasks.withType(com.facebook.react.tasks.BundleHermesCTask).configureEach {
    inputs.files(rootProject.fileTree(projectRoot) {
        include '.env', '.env.*'
        exclude '.env.example'
    })
    ['EXPO_PUBLIC_API_URL', 'EXPO_NO_DOTENV', 'EXPO_NO_CLIENT_ENV_VARS', 'NODE_ENV'].each { name ->
        inputs.property(name, providers.environmentVariable(name).orElse(''))
    }
}
`;

module.exports = (config) => withAppBuildGradle(config, (config) => {
  if (!config.modResults.contents.includes(marker)) {
    config.modResults.contents += gradle;
  }
  return config;
});

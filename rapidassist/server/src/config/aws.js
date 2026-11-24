const { fromLoginCredentials } = require("@aws-sdk/credential-providers");

const AWS_LOGIN_PROFILE = "rapidassist";
const DEFAULT_AWS_REGION = "ap-south-1";

function createAwsClientConfig(region = process.env.AWS_REGION || DEFAULT_AWS_REGION) {
  const config = { region };
  if (process.env.NODE_ENV !== "production") {
    config.credentials = fromLoginCredentials({ profile: AWS_LOGIN_PROFILE });
  }
  return config;
}

module.exports = { AWS_LOGIN_PROFILE, DEFAULT_AWS_REGION, createAwsClientConfig };

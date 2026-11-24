const { STSClient, GetCallerIdentityCommand } = require("@aws-sdk/client-sts");
const { RekognitionClient, DetectFacesCommand } = require("@aws-sdk/client-rekognition");
const sharp = require("sharp");
const { AWS_LOGIN_PROFILE, DEFAULT_AWS_REGION, createAwsClientConfig } = require("../src/config/aws");
const { loadServerEnv } = require("../src/config/env");

const EXPECTED_ACCOUNT = "376821938519";
const EXPECTED_LOCAL_ARN = `arn:aws:iam::${EXPECTED_ACCOUNT}:user/rapidassist-dev`;
const REQUEST_TIMEOUT_MS = 10_000;
const AUTH_ERRORS = new Set([
  "CredentialsProviderError", "ExpiredToken", "ExpiredTokenException",
  "InvalidClientTokenId", "InvalidSignatureException", "SignatureDoesNotMatch",
  "UnrecognizedClientException", "InvalidAccessKeyId", "InvalidToken",
  "MissingAuthenticationToken", "MissingAuthenticationTokenException", "TokenRefreshRequired"
]);
const PERMISSION_ERRORS = new Set([
  "AccessDenied", "AccessDeniedException", "UnauthorizedException", "UnauthorizedOperation", "ForbiddenException"
]);

function describeAwsFailure(operation, error, usesLoginProfile) {
  const name = error?.name;
  const code = error?.Code || error?.code;
  if (AUTH_ERRORS.has(name) || AUTH_ERRORS.has(code) || error?.$metadata?.httpStatusCode === 401) {
    const expired = [name, code].some(value => value === "ExpiredToken" || value === "ExpiredTokenException")
      || (name === "CredentialsProviderError" && /\bexpired\b/i.test(error.message));
    const remedy = usesLoginProfile
      ? `Run aws login --profile ${AWS_LOGIN_PROFILE} and retry.`
      : "Check the AWS credential provider for this process and retry.";
    return `AUTHENTICATION FAIL (${operation}): ${expired ? "AWS credentials expired." : "AWS credentials are missing or invalid."} ${remedy}`;
  }
  if (PERMISSION_ERRORS.has(name) || PERMISSION_ERRORS.has(code) || error?.$metadata?.httpStatusCode === 403) {
    const remedy = operation === "DetectFaces"
      ? "The configured identity needs rekognition:DetectFaces in the configured AWS region."
      : "Check the AWS endpoint and applicable access controls.";
    return `PERMISSION FAIL (${operation}): ${remedy}`;
  }
  const service = operation === "DetectFaces" ? "REKOGNITION" : "STS";
  if (operation === "DetectFaces" && ["InvalidImageFormatException", "InvalidParameterException", "ImageTooLargeException"].includes(name)) {
    return "REKOGNITION FAIL (DetectFaces): AWS rejected the generated PNG probe. Check the probe image and SDK request.";
  }
  return `${service} FAIL (${operation}): The AWS request failed or timed out. Check service availability and connectivity, then retry.`;
}

async function runAwsCheck({ config, sts, rekognition, report = console.log }) {
  if (config.region !== DEFAULT_AWS_REGION) {
    report(`CONFIGURATION FAIL: Set AWS_REGION to ${DEFAULT_AWS_REGION} for RapidAssist.`);
    return false;
  }
  report(`CONFIGURATION PASS: AWS region ${DEFAULT_AWS_REGION}.`);

  let identity;
  try {
    identity = await sts.send(new GetCallerIdentityCommand({}), {
      abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    report(describeAwsFailure("GetCallerIdentity", error, Boolean(config.credentials)));
    return false;
  }

  if (identity.Account !== EXPECTED_ACCOUNT) {
    report(`IDENTITY FAIL: STS returned a different account from ${EXPECTED_ACCOUNT}.`);
    return false;
  }
  if (!identity.Arn || identity.Arn.endsWith(":root")
    || (config.credentials && identity.Arn !== EXPECTED_LOCAL_ARN)) {
    report(`IDENTITY FAIL: Use the intended non-root AWS identity. The local ${AWS_LOGIN_PROFILE} profile must use rapidassist-dev.`);
    return false;
  }
  report(`IDENTITY PASS: STS verified account ${EXPECTED_ACCOUNT}${config.credentials ? " and IAM user rapidassist-dev" : ""}.`);

  // A generated blank image verifies DetectFaces access without transmitting a face or identity document.
  const bytes = await sharp({ create: { width: 300, height: 200, channels: 3, background: "white" } })
    .png().toBuffer();
  try {
    const result = await rekognition.send(new DetectFacesCommand({
      Image: { Bytes: bytes },
      Attributes: ["DEFAULT"]
    }), { abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    report(`REKOGNITION PASS: DetectFaces accepted the synthetic PNG (${result.FaceDetails?.length ?? 0} faces).`);
    return true;
  } catch (error) {
    report(describeAwsFailure("DetectFaces", error, Boolean(config.credentials)));
    return false;
  }
}

async function main() {
  loadServerEnv({ development: true });
  const config = createAwsClientConfig();
  const sts = new STSClient({ ...config, maxAttempts: 1 });
  const rekognition = new RekognitionClient({ ...config, maxAttempts: 1 });
  try {
    process.exitCode = await runAwsCheck({ config, sts, rekognition }) ? 0 : 1;
  } finally {
    sts.destroy();
    rekognition.destroy();
  }
}

if (require.main === module) {
  main().catch(() => {
    console.error("HEALTH CHECK FAIL: Unable to initialize the AWS check or generate its synthetic PNG.");
    process.exitCode = 1;
  });
}

module.exports = { runAwsCheck };

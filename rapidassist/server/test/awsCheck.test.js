const assert = require("node:assert/strict");
const { test } = require("node:test");
const sharp = require("sharp");
const { runAwsCheck } = require("../scripts/checkAws");

const identity = { Account: "376821938519", Arn: "arn:aws:iam::376821938519:user/rapidassist-dev" };

async function check({ region = "ap-south-1", caller = identity, stsError, rekognitionError } = {}) {
  const messages = [];
  const calls = [];
  const sts = {
    async send(command) {
      calls.push(command.constructor.name);
      if (stsError) throw stsError;
      return caller;
    }
  };
  const rekognition = {
    async send(command) {
      calls.push(command.constructor.name);
      assert.deepEqual(command.input.Attributes, ["DEFAULT"]);
      const { width, height, format } = await sharp(command.input.Image.Bytes).metadata();
      assert.deepEqual({ width, height, format }, { width: 300, height: 200, format: "png" });
      if (rekognitionError) throw rekognitionError;
      return { FaceDetails: [] };
    }
  };
  const passed = await runAwsCheck({
    config: { region, credentials: async () => {} },
    sts, rekognition, report: message => messages.push(message)
  });
  return { passed, calls, messages };
}

test("checks STS once and verifies DetectFaces using only a generated PNG", async () => {
  const { passed, calls, messages } = await check();
  assert.equal(passed, true);
  assert.deepEqual(calls, ["GetCallerIdentityCommand", "DetectFacesCommand"]);
  assert.match(messages.at(-1), /REKOGNITION PASS.*0 faces/);
});

test("rejects a wrong region, account, or login identity before calling Rekognition", async () => {
  for (const [options, calls, reason] of [
    [{ region: "us-east-1" }, [], /CONFIGURATION FAIL/],
    [{ caller: { ...identity, Account: "000000000000" } }, ["GetCallerIdentityCommand"], /IDENTITY FAIL.*account/],
    [{ caller: { ...identity, Arn: "arn:aws:iam::376821938519:root" } }, ["GetCallerIdentityCommand"], /IDENTITY FAIL.*non-root/]
  ]) {
    const result = await check(options);
    assert.equal(result.passed, false);
    assert.deepEqual(result.calls, calls);
    assert.match(result.messages.at(-1), reason);
  }
});

test("distinguishes expired credentials, denied permission, and service errors without logging raw errors", async () => {
  for (const [stage, name, reason] of [
    ["stsError", "CredentialsProviderError", /AUTHENTICATION FAIL.*missing or invalid.*aws login --profile rapidassist/],
    ["stsError", "ExpiredToken", /AUTHENTICATION FAIL.*expired.*aws login --profile rapidassist/],
    ["rekognitionError", "ExpiredTokenException", /AUTHENTICATION FAIL.*DetectFaces.*expired/],
    ["rekognitionError", "AccessDeniedException", /PERMISSION FAIL.*rekognition:DetectFaces/],
    ["rekognitionError", "InternalServerError", /REKOGNITION FAIL.*service availability/],
    ["rekognitionError", "InvalidImageFormatException", /REKOGNITION FAIL.*generated PNG/]
  ]) {
    const error = Object.assign(new Error("private SDK error information"), { name });
    const result = await check({ [stage]: error });
    assert.equal(result.passed, false);
    assert.match(result.messages.at(-1), reason);
    assert.doesNotMatch(result.messages.join("\n"), /private SDK error information/);
  }
});

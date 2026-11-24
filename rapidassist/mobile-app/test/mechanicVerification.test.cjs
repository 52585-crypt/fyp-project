const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");

function load(file, mocks = {}) {
  const source = fs.readFileSync(path.join(__dirname, "../src/verification", file), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", outputText)((name) => mocks[name] ?? require(name), module, module.exports);
  return module.exports;
}

const pending = { verificationStatus: "pending", reviewState: "awaiting_review", submissionId: "mock-submission",
  reviewNote: null, reviewedAt: null };

test("uses the backend review state alongside verification status for display, submission and dispatch", () => {
  const { verificationPresentation, canSubmitVerification, canAcceptServiceRequests } = load("verification.ts");
  const variants = [
    [{ ...pending, reviewState: null, submissionId: null }, "Verification required", true, false],
    [pending, "Pending review", false, false],
    [{ ...pending, verificationStatus: "verified", reviewState: "approved" }, "Approved", false, true],
    [{ ...pending, verificationStatus: "verified", reviewState: null }, "Approved", false, true],
    [{ ...pending, verificationStatus: "rejected", reviewState: "rejected" }, "Rejected", false, false],
    [{ ...pending, reviewState: "resubmission_requested" }, "Resubmission required", true, false]
  ];
  for (const [value, title, submit, accept] of variants) {
    assert.equal(verificationPresentation(value).title, title);
    assert.equal(canSubmitVerification(value), submit);
    assert.equal(canAcceptServiceRequests(value), accept);
  }
  assert.equal(canAcceptServiceRequests(null), false);
});

test("uses the shared client for consented evidence and retains only mechanic-facing status fields", async () => {
  const calls = [];
  const response = { ok: true, verification: { ...pending, identityMatch: { score: 99 } } };
  const { getMechanicVerification, submitMechanicVerification } = load("verification.api.ts", { "../config/api": { api: {
    get: async (...args) => { calls.push(args); return { data: response }; },
    post: async (...args) => { calls.push(args); return { data: response }; }
  } } });
  const draft = { biometricConsent: true, profilePhoto: "data:image/jpeg;base64,/9j/", profilePhotoLeft: "data:image/jpeg;base64,/9j/L",
    profilePhotoRight: "data:image/jpeg;base64,/9j/R", cnicFront: "data:image/png;base64,iVBORw0KGgo=" };
  await assert.rejects(submitMechanicVerification("token", { ...draft, biometricConsent: false }), /consent/);
  for (const missing of ["profilePhoto", "profilePhotoLeft", "profilePhotoRight", "cnicFront"]) {
    await assert.rejects(submitMechanicVerification("token", { ...draft, [missing]: null }), /all four verification photos/);
  }
  assert.equal(calls.length, 0);
  assert.deepEqual(await getMechanicVerification("token"), pending);
  assert.deepEqual(await submitMechanicVerification("token", draft), pending);
  assert.deepEqual(calls, [
    ["/api/mechanic-verification", { headers: { Authorization: "Bearer token" } }],
    ["/api/mechanic-verification", draft, { headers: { Authorization: "Bearer token" }, timeout: 90_000 }]
  ]);
  response.verification.identityMatch.status = "mismatch";
  assert.deepEqual(await getMechanicVerification("token"), { ...pending, matchResult: "mismatch" });
  response.verification.identityMatch.status = "matched";
  assert.deepEqual(await getMechanicVerification("token"), { ...pending, matchResult: "matched" });
  response.verification.identityMatch.status = "manual_review";
  assert.deepEqual(await getMechanicVerification("token"), pending);
});

test("preserves actionable API failures and reconciles ambiguous submissions", async () => {
  const error = Object.assign(new Error("CNIC front contains no detectable face."), { response: { status: 422 } });
  const { submitMechanicVerification } = load("verification.api.ts", { "../config/api": { api: {
    post: async () => { throw error; }
  } } });
  await assert.rejects(submitMechanicVerification("token", {
    biometricConsent: true, profilePhoto: "a", profilePhotoLeft: "l", profilePhotoRight: "r", cnicFront: "b"
  }), failure => failure === error);
  const { shouldCheckSubmissionStatus } = load("verification.ts");
  assert.equal(shouldCheckSubmissionStatus(error), false);
  assert.equal(shouldCheckSubmissionStatus(new Error("Network unavailable")), true);
  assert.equal(shouldCheckSubmissionStatus({ response: { status: 409 } }), true);
  assert.equal(shouldCheckSubmissionStatus({ response: { status: 503 } }), true);
});

test("the shared verification provider retries after a network failure, prevents duplicate posts and recovers a lost success response", async () => {
  const unsubmitted = { ...pending, submissionId: null, reviewState: null };
  const states = [], refs = [];
  let stateIndex = 0, refIndex = 0;
  let serverStatus = unsubmitted;
  let posts = 0;
  const { VerificationProvider } = load("VerificationProvider.tsx", {
    react: {
      ...React,
      useState(initial) {
        const index = stateIndex++;
        if (!(index in states)) states[index] = initial;
        return [states[index], (value) => { states[index] = value; }];
      },
      useRef(initial) {
        const index = refIndex++;
        return refs[index] ?? (refs[index] = { current: initial });
      },
      useCallback: (callback) => callback
    },
    "expo-router": {},
    "./verification": load("verification.ts"),
    "./verification.api": {
      getMechanicVerification: async (token) => {
        assert.equal(token, "provider-token");
        return serverStatus;
      },
      submitMechanicVerification: async (token, draft) => {
        assert.equal(token, "provider-token");
        assert.equal(draft.biometricConsent, true);
        if (++posts === 2) serverStatus = pending;
        throw new Error("Network unavailable");
      }
    }
  });
  const context = () => {
    stateIndex = refIndex = 0;
    return VerificationProvider({ token: "provider-token" }).props.value;
  };
  const draft = { biometricConsent: true, profilePhoto: "selfie", profilePhotoLeft: "left", profilePhotoRight: "right", cnicFront: "cnic" };
  await context().refresh();
  const contextBeforeRetry = context();
  const outcomes = await Promise.allSettled([contextBeforeRetry.submit(draft), contextBeforeRetry.submit(draft)]);
  assert.equal(outcomes[0].status, "rejected");
  assert.equal(outcomes[1].value, false);
  assert.equal(posts, 1);
  assert.equal(context().status.submissionId, null);
  assert.equal(await context().submit(draft), true);
  assert.equal(context().status.submissionId, pending.submissionId);
  assert.equal(posts, 2);
});

function picker(platform, result, granted = true) {
  const calls = [];
  const { selectVerificationImage } = load("verificationImage.ts", {
    "react-native": { Platform: { OS: platform } },
    "expo-image-picker": {
      CameraType: { front: "front", back: "back" },
      requestCameraPermissionsAsync: async () => { calls.push("permission"); return { granted }; },
      launchCameraAsync: async (options) => { calls.push(["camera", options]); return result; },
      launchImageLibraryAsync: async (options) => { calls.push(["library", options]); return result; }
    }
  });
  return { selectVerificationImage, calls };
}

test("Android requests camera access, uses the front camera and accepts actual JPEG bytes", async () => {
  const result = { canceled: false, assets: [{ base64: "/9j/AAAA", mimeType: "image/png", width: 120, height: 120 }] };
  const android = picker("android", result);
  assert.equal(await android.selectVerificationImage("camera", "profile"), "data:image/jpeg;base64,/9j/AAAA");
  assert.equal(android.calls[0], "permission");
  assert.equal(android.calls[1][1].cameraType, "front");
  assert.equal(android.calls[1][1].exif, false);
  await assert.rejects(picker("android", result, false).selectVerificationImage("camera", "profile"), /Allow camera access/);
  for (const kind of ["profileLeft", "profileRight"]) {
    const turned = picker("android", result);
    await turned.selectVerificationImage("camera", kind);
    assert.equal(turned.calls[1][1].cameraType, "front", `${kind} selfie uses the front camera`);
  }
  const cnic = picker("android", result);
  await cnic.selectVerificationImage("camera", "cnic");
  assert.equal(cnic.calls[1][1].cameraType, "back");
  assert.equal(await picker("android", { canceled: true }).selectVerificationImage("library", "cnic"), null);
});

test("Web opens the picker immediately, keeps canceled selections and rejects unsupported or oversized bytes", async () => {
  const web = picker("web", { canceled: false, assets: [{ base64: "iVBORw0KGgo=", width: 80, height: 80 }] });
  const image = web.selectVerificationImage("library", "cnic");
  assert.equal(web.calls[0][0], "library");
  assert.equal(await image, "data:image/png;base64,iVBORw0KGgo=");
  assert.equal(await picker("web", { canceled: true }).selectVerificationImage("camera", "profile"), null);
  await assert.rejects(picker("web", { canceled: false, assets: [{ base64: "R0lGODlh" }] })
    .selectVerificationImage("library", "cnic"), /JPEG or PNG/);
  await assert.rejects(picker("web", { canceled: false, assets: [{ base64: "/9j/" + "A".repeat(6_000_000) }] })
    .selectVerificationImage("library", "cnic"), /4 MB/);
  await assert.rejects(picker("web", { canceled: false, assets: [{ base64: "iVBORw0KGgo=", width: 79, height: 80 }] })
    .selectVerificationImage("library", "cnic"), /80 × 80/);
});

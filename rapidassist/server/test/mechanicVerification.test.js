const { test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { Readable } = require("node:stream");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const sharp = require("sharp");
const { createApp } = require("../src/app");
const { User } = require("../src/models/User");
const { AdminActivityLog } = require("../src/models/AdminActivityLog");
const { ServiceRequest } = require("../src/models/ServiceRequest");
const { createMechanicVerificationService } = require("../src/services/mechanicVerification");
const { signAccessToken } = require("../src/utils/jwt");

const face = { BoundingBox: { Left: 0.25, Top: 0.25, Width: 0.4, Height: 0.4 } };
const fixture = sharp({
  create: { width: 300, height: 200, channels: 3, background: "white" }
}).png().toBuffer().then(bytes => `data:image/png;base64,${bytes.toString("base64")}`);

async function submission(overrides = {}) {
  return { submissionId: "test-submission", biometricConsent: true, profilePhoto: await fixture,
    profilePhotoLeft: await fixture, profilePhotoRight: await fixture, cnicFront: await fixture, ...overrides };
}

const passedFaceChecks = { status: "passed", provider: "test-face-checker", yaw: { front: 0.01, left: -0.3, right: 0.3 },
  samePersonDistance: { left: 0.3, right: 0.32 }, duplicate: { found: false, distance: null }, error: null, checkedAt: new Date() };

/** Stand-in for the local face-api checks (the real models are exercised in faceChecks.test.js). */
function fakeFaceChecker(result = { rejectMessage: null, faceChecks: passedFaceChecks, descriptor: Array(128).fill(0.01) }) {
  const calls = [];
  const checker = async (selfies, options) => { calls.push({ selfies, options }); return result; };
  return Object.assign(checker, { calls });
}

function mockAws({ detections = [[face], [face], [face]], score = 99.9, failAt, errorName = "AccessDeniedException", faceChecker = fakeFaceChecker() } = {}) {
  const operations = [];
  const objects = new Map();
  const aws = {
    async send(command) {
      const { input } = command;
      const operation = command.constructor.name;
      operations.push(operation);
      if (failAt?.(operation, input)) throw Object.assign(new Error("private AWS details"), { name: errorName });
      if (operation === "DetectFacesCommand") return { FaceDetails: detections.shift() || [face] };
      if (operation === "CompareFacesCommand") {
        assert.equal(input.SimilarityThreshold, 0);
        assert.equal((await sharp(input.SourceImage.Bytes).metadata()).width, 300);
        assert.ok((await sharp(input.TargetImage.Bytes).metadata()).width < 300);
        return { FaceMatches: score === null ? [] : [{ Similarity: score }] };
      }
      if (operation === "PutObjectCommand") {
        assert.equal(input.ServerSideEncryption, "AES256");
        assert.equal(input.ACL, undefined);
        assert.match(input.Key, /^mechanic-verification\//);
        objects.set(input.Key, Buffer.from(input.Body));
        return { VersionId: "test-version" };
      }
      if (operation === "DeleteObjectCommand") {
        if (objects.has(input.Key)) assert.equal(input.VersionId, "test-version");
        objects.delete(input.Key);
        return {};
      }
      if (operation === "GetObjectCommand") {
        assert.equal(input.VersionId, "test-version");
        return { Body: Readable.from([objects.get(input.Key)]) };
      }
      throw new Error(`Unexpected mock operation: ${operation}`);
    }
  };
  return { service: createMechanicVerificationService({ rekognition: aws, s3: aws, bucket: "mock", faceChecker }), operations, objects, faceChecker };
}

test("requires consent, validates format and size, and makes no AWS calls for invalid input", async () => {
  const { service, operations } = mockAws();
  await assert.rejects(service.submit(await submission({ biometricConsent: "true" })), /explicit biometric/i);
  await assert.rejects(service.submit(await submission({ profilePhoto: "data:image/gif;base64,AAAA" })), { statusCode: 415 });
  await assert.rejects(service.submit(await submission({ profilePhoto: (await fixture).replace("png", "jpeg") })), { statusCode: 415 });
  await assert.rejects(service.submit(await submission({ cnicFront: `data:image/png;base64,${"A".repeat(6_000_000)}` })), { statusCode: 413 });
  assert.deepEqual(operations, []);
});

test("rejects missing and multiple faces in either original without storing images", async () => {
  for (const detections of [[[], [face]], [[face], []], [[face, face], [face]], [[face], [face, face]]]) {
    const { service, operations } = mockAws({ detections });
    await assert.rejects(service.submit(await submission()), error => error.statusCode === 422
      && /no detectable face|multiple faces/.test(error.message));
    assert.deepEqual(operations, ["DetectFacesCommand", "DetectFacesCommand"]);
  }
});

test("accepts a one-face CNIC crop and retains a low similarity for manual review", async () => {
  const { service, objects } = mockAws({ detections: [[face], [face, face], [face]], score: 24.5 });
  const result = await service.submit(await submission({
    cnicPortraitRegion: { left: 0.1, top: 0.1, width: 0.6, height: 0.6 }
  }));
  assert.equal(result.matchStatus, "mismatch");
  assert.equal(result.score, 24.5);
  assert.equal(objects.size, 4);
  assert.deepEqual(await service.deleteImages(Object.values(result.images)), []);
  assert.equal(objects.size, 0);
});

test("records a match at the existing threshold and stores both normalized images", async () => {
  const { service, operations, objects } = mockAws({ score: 90 });
  const result = await service.submit(await submission());
  assert.equal(result.matchStatus, "matched");
  assert.equal(result.score, 90);
  assert.deepEqual(operations, [
    "DetectFacesCommand", "DetectFacesCommand", "DetectFacesCommand",
    "CompareFacesCommand", "PutObjectCommand", "PutObjectCommand", "PutObjectCommand", "PutObjectCommand"
  ]);
  assert.equal(objects.size, 4);
});

test("retains evidence and records a mismatch when Rekognition returns no face matches", async () => {
  const { service, objects } = mockAws({ score: null });
  const result = await service.submit(await submission());
  assert.equal(result.matchStatus, "mismatch");
  assert.equal(result.score, null);
  assert.equal(objects.size, 4);
});

test("sanitizes AWS failures and removes partial S3 uploads", async () => {
  for (const [failAt, publicCode, errorName] of [
    [operation => operation === "DetectFacesCommand", "VERIFICATION_CREDENTIALS_UNAVAILABLE", "CredentialsProviderError"],
    [operation => operation === "DetectFacesCommand", "VERIFICATION_AI_UNAVAILABLE"],
    [operation => operation === "CompareFacesCommand", "VERIFICATION_AI_UNAVAILABLE"],
    [(operation, input) => operation === "PutObjectCommand" && input.Key.endsWith("/cnic.jpg"), "VERIFICATION_STORAGE_UNAVAILABLE"]
  ]) {
    const { service, operations, objects } = mockAws({ failAt, errorName });
    await assert.rejects(service.submit(await submission()), error => error.statusCode === 503
      && error.publicCode === publicCode && !error.message.includes("private AWS details"));
    if (operations.includes("PutObjectCommand")) {
      // Every image uploaded before the failure (profile, head-turned left and right) is deleted again.
      assert.equal(operations.filter(operation => operation === "DeleteObjectCommand").length,
        operations.filter(operation => operation === "PutObjectCommand").length - 1);
    }
    assert.equal(objects.size, 0);
  }
});

test("verification survives concurrent submissions and decisions and gates dispatch until approval", async (t) => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "mechanic-verification-test-secret";
  const database = await MongoMemoryServer.create();
  const { service, objects } = mockAws({ score: 32 });
  let server;
  try {
    await mongoose.connect(database.getUri());
    server = createApp({ mechanicVerification: service }).listen(0, "127.0.0.1");
    await once(server, "listening");
    const [mechanic, admin] = await User.create([
      { name: "Mechanic", phone: "0000000000", role: "mechanic", verificationStatus: "pending",
        authProvider: "google", googleId: "kyc-google-fixture", email: "mechanic@example.com",
        profilePictureUrl: "https://example.com/avatar.jpg",
        mechanicProfile: { serviceCategory: "mechanic", selfieUrl: await fixture, idCardFrontUrl: await fixture, idCardBackUrl: await fixture } },
      { name: "Admin", phone: "0000000001", role: "admin", passwordHash: "test" }
    ]);
    const own = "/api/mechanic-verification";
    const review = `/api/admin/providers/${mechanic.id}/verification`;
    function api(user, path, method = "GET", body, origin) {
      return fetch(`http://127.0.0.1:${server.address().port}${path}`, {
        method,
        headers: {
          ...(user ? { Authorization: `Bearer ${signAccessToken({ sub: user.id, role: user.role })}` } : {}),
          "Content-Type": "application/json",
          ...(origin ? { Origin: origin } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    }

    const body = await submission();
    const failedWrite = t.mock.method(User, "findOneAndUpdate", () => ({
      select: () => Promise.reject(new mongoose.Error.ValidationError())
    }));
    try {
      assert.equal((await api(mechanic, own, "POST", body)).status, 400);
      assert.equal(await User.countDocuments({ "mechanicVerification.submissionId": { $exists: true } }), 0);
      assert.equal(objects.size, 0);
    } finally {
      failedWrite.mock.restore();
    }
    const uploads = await Promise.all([api(mechanic, own, "POST", body), api(mechanic, own, "POST", body)]);
    assert.deepEqual(uploads.map(response => response.status).sort(), [201, 409]);
    const uploaded = uploads.find(response => response.status === 201);
    const first = (await uploaded.json()).verification;
    assert.equal(first.verificationStatus, "pending");
    assert.equal(first.identityMatch.status, "mismatch");
    assert.equal(Object.hasOwn(first.identityMatch, "score"), false);
    const adminVerification = await (await api(admin, review)).json();
    assert.equal(adminVerification.verification.identityMatch.score, 32);
    assert.equal(first.images, undefined);
    const saved = await User.findById(mechanic.id).select("+mechanicVerification");
    assert.equal(Object.hasOwn(saved.toSafeJSON().mechanicProfile.identityMatch, "score"), false);
    assert.equal(saved.mechanicVerification.consent.version, "mechanic-face-verification-v2");
    // Face checks are admin-only: stored under mechanicVerification, never in the provider's own JSON or status.
    assert.equal(saved.mechanicVerification.faceChecks.status, "passed");
    assert.equal(saved.toSafeJSON().mechanicProfile.faceChecks, undefined);
    assert.equal(first.faceChecks, undefined);
    assert.equal((await User.findById(mechanic.id)).faceDescriptor, undefined, "face template is never selected by default");
    assert.equal((await User.findById(mechanic.id).select("+faceDescriptor")).faceDescriptor.length, 128);
    assert.equal(adminVerification.verification.faceChecks.status, "passed");
    assert.deepEqual(adminVerification.verification.images, ["profile", "profileLeft", "profileRight", "cnic"]);
    const leftSelfie = await api(admin, `${review}/images/profileLeft?submissionId=${first.submissionId}`);
    assert.equal(leftSelfie.status, 200);
    assert.equal(leftSelfie.headers.get("content-type"), "image/jpeg");
    assert.equal(leftSelfie.headers.get("cache-control"), "no-store");
    assert.equal((await api(mechanic, `${review}/images/profileLeft?submissionId=${first.submissionId}`)).status, 403);
    assert.ok(saved.mechanicVerification.consent.grantedAt);
    assert.equal(objects.size, 4);
    for (const field of ["selfieUrl", "idCardFrontUrl", "idCardBackUrl"]) assert.equal(saved.mechanicProfile[field], null);
    assert.match(saved.mechanicVerification.images.cnic.key, /\/cnic.jpg$/);
    assert.equal((await api(mechanic, own, "POST", body)).status, 409);
    const webOrigin = "http://localhost:8081";
    const webStatus = await api(mechanic, own, "GET", undefined, webOrigin);
    assert.equal(webStatus.headers.get("access-control-allow-origin"), webOrigin);
    const webVerification = (await webStatus.json()).verification;
    assert.equal(webVerification.submissionId, first.submissionId);
    assert.equal(Object.hasOwn(webVerification.identityMatch, "score"), false);

    const expiresAt = new Date(Date.now() + 60_000);
    const job = await ServiceRequest.create({
      userId: admin._id, category: "mechanic", status: "searching_provider", pickupLocation: { lat: 31.52, lng: 74.35 },
      dispatch: { enabled: true, state: "offered", offerId: "test-offer", offeredProviderId: mechanic._id, expiresAt }
    });
    function reserveOffer() {
      return User.updateOne({ _id: mechanic._id }, { $set: { providerState: {
        isOnline: true, currentLocation: { lat: 31.52, lng: 74.35, updatedAt: new Date() }, reservedRequestId: job._id,
        reservedOfferId: "test-offer", reservedUntil: expiresAt
      } } });
    }
    await reserveOffer();
    for (const origin of [undefined, webOrigin]) {
      const blocked = await api(mechanic, `/api/requests/${job.id}/accept`, "PATCH", { offerId: "test-offer" }, origin);
      assert.equal(blocked.status, 409);
      assert.match((await blocked.json()).message, /verified/);
    }

    const evidence = `${review}/images/cnic?submissionId=${first.submissionId}`;
    assert.equal((await api(null, evidence)).status, 401);
    assert.equal((await api(mechanic, evidence)).status, 403);
    const image = await api(admin, evidence);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("cache-control"), "no-store");
    assert.ok((await image.arrayBuffer()).byteLength > 0);
    assert.equal((await api(mechanic, review, "PATCH", { status: "verified", submissionId: first.submissionId })).status, 403);
    assert.equal((await api(null, review, "PATCH", { status: "verified", submissionId: first.submissionId })).status, 401);
    assert.equal((await api(admin, review, "PATCH", { status: "verified", submissionId: "stale" })).status, 409);
    for (const [status, action, note] of [
      ["rejected", "verification.reject", undefined],
      ["pending", "verification.resubmit", "   "]
    ]) {
      const response = await api(admin, review, "PATCH", { status, submissionId: first.submissionId, note });
      assert.equal(response.status, 400);
      const entry = await AdminActivityLog.findOne({ requestId: response.headers.get("x-request-id") });
      assert.equal(entry.action, action);
      assert.equal(entry.result, "failed");
      assert.equal((await User.findById(mechanic.id).select("+mechanicVerification")).mechanicVerification.reviewState, "awaiting_review");
    }
    assert.equal((await api(admin, review, "PATCH", { status: "rejected", submissionId: first.submissionId, note: "CNIC is blurry." })).status, 200);
    const rejected = (await (await api(mechanic, own)).json()).verification;
    assert.equal(rejected.reviewState, "rejected");
    assert.equal(rejected.reviewNote, "CNIC is blurry.");
    const accept = () => api(mechanic, `/api/requests/${job.id}/accept`, "PATCH", { offerId: "test-offer" });
    // Exercise the atomic status gate with an otherwise eligible reservation.
    await reserveOffer();
    assert.equal((await accept()).status, 409);
    assert.equal((await api(mechanic, own, "POST", body)).status, 409);
    assert.equal((await api(admin, review, "PATCH", { status: "pending", submissionId: first.submissionId, note: "Send clearer photos." })).status, 200);
    const retryStatus = (await (await api(mechanic, own)).json()).verification;
    assert.equal(retryStatus.reviewState, "resubmission_requested");
    assert.equal(retryStatus.reviewNote, "Send clearer photos.");
    assert.equal((await api(mechanic, own, "POST", { ...body, biometricConsent: false })).status, 400);
    const newPhotos = await sharp({ create: { width: 300, height: 200, channels: 3, background: "blue" } }).png().toBuffer();
    const newData = `data:image/png;base64,${newPhotos.toString("base64")}`;
    const replacement = await api(mechanic, own, "POST", { ...body, profilePhoto: newData, cnicFront: newData });
    assert.equal(replacement.status, 201);
    const second = (await replacement.json()).verification;
    assert.notEqual(first.submissionId, second.submissionId);
    assert.equal(objects.size, 4);
    assert.equal((await api(admin, evidence)).status, 404);
    const newRecord = await User.findById(mechanic.id).select("+mechanicVerification");
    assert.ok(newRecord.mechanicVerification.consent.grantedAt > saved.mechanicVerification.consent.grantedAt);
    const approve = () => api(admin, review, "PATCH", { status: "verified", submissionId: second.submissionId });
    const decisions = await Promise.all([approve(), approve()]);
    assert.deepEqual(decisions.map(response => response.status).sort(), [200, 409]);
    const approved = decisions.find(response => response.status === 200);
    assert.equal((await approved.json()).verification.verificationStatus, "verified");
    assert.equal((await User.findById(mechanic.id)).isCertified, true);
    assert.equal((await (await api(mechanic, own, "GET", undefined, webOrigin)).json()).verification.reviewState, "approved");

    const availability = () => api(mechanic, "/api/requests/provider/availability", "PATCH", {
      isOnline: true, location: { lat: 31.52, lng: 74.35 }
    });
    assert.equal((await availability()).status, 200);
    const accepted = await accept();
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).request.status, "provider_assigned");
    assert.equal((await api(admin, review, "PATCH", { status: "pending", submissionId: second.submissionId, note: "Submit updated photos." })).status, 409);

    assert.equal((await api(admin, `/api/requests/${job.id}/status`, "PATCH", { status: "cancelled" })).status, 200);
    let signalWrite, allowWrite;
    const writeStarted = new Promise(resolve => { signalWrite = resolve; });
    const resumeWrite = new Promise(resolve => { allowWrite = resolve; });
    const findOneAndUpdate = User.findOneAndUpdate;
    const intercepted = t.mock.method(User, "findOneAndUpdate", function (filter, update, options) {
      if (update.$set?.["providerState.isOnline"] !== true) return findOneAndUpdate.call(this, filter, update, options);
      signalWrite();
      return resumeWrite.then(() => findOneAndUpdate.call(this, filter, update, options));
    });
    const staleAvailability = availability();
    try {
      await Promise.race([writeStarted, staleAvailability.then(() => assert.fail("Availability did not reach its write"))]);
      assert.equal((await api(admin, review, "PATCH", { status: "pending", submissionId: second.submissionId, note: "Submit updated photos." })).status, 200);
    } finally {
      allowWrite();
      intercepted.mock.restore();
    }
    assert.equal((await staleAvailability).status, 403);
    assert.equal((await User.findById(mechanic.id)).providerState.isOnline, false);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    await database.stop();
  }
});

test("requires both head-turn selfies and makes no AWS calls without them", async () => {
  for (const missing of ["profilePhotoLeft", "profilePhotoRight"]) {
    const { service, operations, faceChecker } = mockAws();
    await assert.rejects(service.submit(await submission({ [missing]: undefined })), { statusCode: 400 });
    assert.deepEqual(operations, []);
    assert.equal(faceChecker.calls.length, 0);
  }
});

test("a failed head-turn check rejects before any AWS call or upload", async () => {
  const faceChecker = fakeFaceChecker({
    rejectMessage: "Head-turn check failed. Turn your head clearly to the left and to the right.", faceChecks: null, descriptor: undefined
  });
  const { service, operations, objects } = mockAws({ faceChecker });
  await assert.rejects(service.submit(await submission()), {
    statusCode: 422, publicCode: "FACE_LIVENESS_FAILED", message: /Head-turn check failed/
  });
  assert.deepEqual(operations, [], "no Rekognition call and no S3 upload for a still photo");
  assert.equal(objects.size, 0);
});

test("passes the three normalized selfies to the face checker and excludes the submitting provider", async () => {
  const { service, faceChecker } = mockAws();
  const result = await service.submit(await submission({ mechanicId: "provider-under-review" }));
  assert.equal(faceChecker.calls.length, 1);
  const [{ selfies, options }] = faceChecker.calls;
  for (const key of ["front", "left", "right"]) assert.match(selfies[key], /^data:image\/jpeg;base64,/);
  assert.deepEqual(options, { excludeUserId: "provider-under-review" });
  assert.equal(result.faceChecks.status, "passed");
  assert.equal(result.faceDescriptor.length, 128);
  assert.deepEqual(Object.keys(result.images).sort(), ["cnic", "profile", "profileLeft", "profileRight"]);
});

test("a face-model failure does not block verification and leaves no face template", async () => {
  const faceChecker = fakeFaceChecker({
    rejectMessage: null, descriptor: undefined,
    faceChecks: { status: "error", provider: "test-face-checker", error: "model crashed", checkedAt: new Date() }
  });
  const { service } = mockAws({ faceChecker });
  const result = await service.submit(await submission());
  assert.equal(result.faceChecks.status, "error");
  assert.equal(result.faceDescriptor, undefined);
  assert.equal(result.matchStatus, "matched");
});

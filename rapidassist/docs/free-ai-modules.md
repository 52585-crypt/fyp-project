# Free AI Modules (pre-trained, run locally)

Both features run on the backend (`rapidassist/server`) with pre-trained models. They need no paid API and no API keys.
They were first built on branch `claude/gifted-cannon-yv316h` (commit `d426273`). On this branch they are integrated
with the existing provider verification flow (AWS Rekognition + private S3) and the admin login.

## 1. Provider liveness (head-turn) + duplicate face check

- **Model:** face-api.js (`@vladmandic/face-api`, tiny face detector, 68-point landmarks, face recognition model).
  The models are committed in `server/assets/face-models` (6.5 MB).
- **Where:** `server/src/services/faceVerification.service.js` (models, yaw, descriptors) and
  `server/src/services/providerFaceChecks.js` (liveness + duplicate lookup + one log line per check). They are called
  from `createMechanicVerificationService().submit()` (`server/src/services/mechanicVerification.js`) for
  `POST /api/mechanic-verification`.
- **Flow:** a provider registers (no selfies), then submits identity verification: **three selfies** (looking straight,
  head turned left, head turned right) plus the CNIC front, with biometric consent (`mechanic-face-verification-v2`).
  1. All four images are validated and normalised.
  2. **Local face checks run first**, before any paid AWS call or upload:
     - **Head-turn score (yaw):** the nose tip's position between the jaw edges. 0° ≈ 0.02, 15° ≈ 0.15, 30° ≈ 0.32,
       45° ≈ 0.47. The straight selfie must be ≤ `FACE_MAX_FRONT_YAW` (0.10). Each turned selfie must differ from it by
       ≥ `FACE_MIN_TURN_YAW` (0.12), and the two turns must go in opposite directions. A printed photo or a phone screen
       cannot turn its head, so it fails: HTTP 422, `FACE_LIVENESS_FAILED`, "Head-turn check failed…".
     - **Same person:** the turned selfies must match the straight one (descriptor distance < `FACE_SAME_PERSON_DISTANCE`, 0.6).
     - **Duplicate account:** the straight selfie is compared with every other provider's stored face template. Distance
       < `FACE_DUPLICATE_DISTANCE` (0.45) is accepted but marked `flagged`, and the admin panel shows a red
       **"Possible duplicate account"** warning naming the matched provider.
  3. The existing AWS Rekognition comparison (selfie vs CNIC portrait) runs, and the images are stored in private S3:
     `profile`, `profileLeft`, `profileRight` and `cnic`.
- **Storage and privacy:**
  - The results are stored in `mechanicVerification.faceChecks`. `mechanicVerification` is `select: false` and only
    admin routes read it. The provider's own responses never contain it, because a duplicate result names another provider.
  - The 128-number face template is stored in `user.faceDescriptor` (`select: false`) and is never sent to any client.
    It is cleared when a submission's face check could not run.
  - Admins see the selfies only in the provider detail view, each image fetched through
    `GET /api/admin/providers/:id/verification/images/:kind` (admin login, `Cache-Control: no-store`).
- **If the models crash,** verification is not blocked: the status becomes `error`, and the admin reviews the selfies manually.
- **Tuning:** every check logs one line, for example
  `[face-check] rejected {"reason":…,"yaw":{"front":…,"left":…,"right":…},"distances":…,"thresholds":…}` (numbers only).
  Adjust `FACE_MAX_FRONT_YAW` / `FACE_MIN_TURN_YAW` from real selfies. Do not loosen them so far that one still photo passes.
- **Verified with:** Pointing'04 head-pose photos through the real API, with the real models and mocked AWS:
  - real head turns: passed;
  - one still photo used three times: 422;
  - the same person on a second account: flagged (distance 0.285);
  - a different person: passed (nearest distance 0.706).

## 2. Vehicle problem from a photo (CLIP, zero-shot)

- **Model:** `Xenova/clip-vit-base-patch32` (8-bit quantized, ≈ 109 MB) via `@huggingface/transformers`. No training:
  the photo is compared with text prompts such as "a photo of a flat car tyre".
- **Where:** `server/src/services/vehicleIssueClassifier.service.js`, `POST /api/ai/vehicle-issue`. Customer login is
  required, it has its own AI rate limit, and the body is `{ image: "data:image/jpeg;base64,…" }`.
- **Mobile:** the "Not sure what's wrong?" photo card on the problem-and-fare screen (`app/(user)/request/estimate.tsx`,
  `src/ai/PhotoIssueCard.tsx`, `src/ai/vehicleIssue.api.ts`). It pre-selects the service (and the mechanic issue); the
  customer can still change both. It sits next to the existing Groq text assistant.
- The model downloads once from huggingface.co into `server/assets/hf-models` (git-ignored) and then works offline.
  `npm run dev` ignores `assets/` so that this download cannot restart the server and corrupt the cache.
  If it was ever interrupted, delete `assets/hf-models/Xenova/clip-vit-base-patch32` and restart.
- **Timing:** about 0.3 s per photo on a laptop CPU once loaded. The first request after start waits for the model to load.

All thresholds can be tuned in `.env` (see `server/.env.example`). `AI_PRELOAD=false` skips loading the models at start-up.

## Known limitations

- **Head-turn liveness stops still photos and screens. It does not stop a replayed video**, or someone who controls the
  camera feed. Admins still make the final decision.
- Providers may also pick verification selfies from the photo library (that also covers Expo Web, where there is no
  camera). Allowing camera-only capture for the two head-turn selfies on Android would make photo-library reuse harder.
- **Old app versions:** builds that send only one selfie are rejected with 400 until they are updated.

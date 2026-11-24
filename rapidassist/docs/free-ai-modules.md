# Free AI Modules (pre-trained, run locally)

Both features run on the backend (`rapidassist/server`) with pre-trained models.
There are no paid APIs and no API keys.

## 1. Provider liveness (head-turn) + duplicate face check

- **Model:** face-api.js (`@vladmandic/face-api`) using the tiny face detector, the 68-point landmarks and the face recognition model.
  The models live in `server/assets/face-models` (6.5 MB, committed).
- **Where:** `server/src/services/faceVerification.service.js`, `server/src/services/providerFaceChecks.js`,
  called from `POST /api/auth/register` for providers.
- **Sign-up flow:** the provider takes 3 selfies: looking straight, head turned left, head turned right.
  1. **Head-turn score (yaw):** the position of the nose tip between the two jaw edges.
     Calibrated on the Pointing'04 head-pose images: 0° gives ~0.02, 15° gives ~0.15, 30° gives ~0.32, 45° gives ~0.47.
     The straight selfie must be ≤ 0.10. Each turned selfie must differ from it by ≥ 0.12, and the two turns must be in opposite directions.
     A printed photo or a phone screen cannot turn its head, so it fails.
  2. **Same person:** the turned selfies must match the straight one (descriptor distance < 0.6).
  3. **Duplicate account:** the straight selfie is compared with every registered provider.
     If the distance is < 0.45 the account is created but marked `faceChecks.status = "flagged"`,
     and the admin panel shows a red "Possible duplicate account" warning.
- If the models crash, sign-up is not blocked. The status becomes `error` and the admin reviews the provider manually.
- The face descriptor is stored in `user.faceDescriptor` (`select: false`) and is never sent to clients.

## 2. Vehicle problem from a photo (CLIP, zero-shot)

- **Model:** `Xenova/clip-vit-base-patch32` (8-bit quantized, ~90 MB) via `@huggingface/transformers`.
  No training is needed: the photo is compared with text prompts such as "a photo of a flat car tyre".
- **Where:** `server/src/services/vehicleIssueClassifier.service.js`, `POST /api/ai/vehicle-issue` (login required).
- **Mobile:** the "Not sure what's wrong?" card on the Create Request screen. It auto-selects the service
  (and the mechanic issue). The user can still change it.
- The model is downloaded once from huggingface.co into `server/assets/hf-models` (git-ignored), then it works offline.
- Takes about 0.1 s per photo on CPU. Sample results: accident photos → Car Towing, tyre photos → Mechanic / Tyre,
  an undamaged car → "No visible problem" (the user chooses), a person → "Not a vehicle photo".

All thresholds can be tuned in `.env` (see `server/.env.example`).

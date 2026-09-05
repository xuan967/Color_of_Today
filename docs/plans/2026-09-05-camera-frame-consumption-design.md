# Camera Frame Consumption Stability Design

## Problem

The preview content alternates between portrait and landscape while the ArkUI page remains portrait. Runtime evidence also shows `all buffer are using`, `EGL_BAD_PARAMETER`, and an ArkTS exception at `refreshCameraControls()`.

Two independent faults combine into one unstable startup:

1. `PhotoSession.getZoomRatioRange()` can fail and return `undefined` on the emulator. The UI indexes that value without validation. Because the exception is thrown from `frameStart`, it escapes through the native callback and makes camera startup look failed even though preview frames continue.
2. The renderer calls `OH_NativeImage_UpdateSurfaceImage()` on every display loop. The API contract requires the call only after an `OH_OnFrameAvailableListener` notification. On failed updates the renderer currently replaces the transform with an identity matrix, so successful and failed iterations use different orientations.

## First-principles invariant

The producer-consumer path must be one-way and monotonic:

`camera produces frame -> listener marks frame pending -> EGL thread consumes pending frame once -> successful consume replaces cached texture transform -> renderer displays cached valid state`

A missing frame, unsupported capability, or callback exception must not mutate the last valid visual state.

## Design

### ArkTS boundary

- Treat zoom and focus as optional capabilities.
- Validate zoom range length, finiteness, positivity, and ordering before publishing it to UI state; otherwise return `[1, 1]` and log the fallback.
- Check `isFocusModeSupported(FOCUS_MODE_AUTO)` before setting autofocus.
- Wrap camera-to-UI callback invocation so a UI exception is logged and contained instead of becoming a pending N-API exception or rejecting session startup.
- Let first-frame state transition complete even when optional controls are unavailable.

### NativeImage boundary

- Register `OH_OnFrameAvailableListener` after creating `OH_NativeImage` and unregister it before destruction.
- The listener only increments an atomic notification counter. It must not call any NativeImage API.
- The EGL render thread consumes at most once when the notification counter advances.
- Cache the last successfully acquired 2x2 transform matrix. A failed/no-op update retains it.
- Draw the cached texture on display iterations without a new camera frame.
- Log listener registration, first notification, first successful consume, and rate-limited failure counters. Do not log per frame.
- Do not enable `OH_NativeImage_SetDropBufferMode`, because this project targets API 12 while that API starts at API 17.

## Geometry

Surface geometry remains driven by ArkUI area size. The fix does not change application orientation or repeatedly resize the XComponent. Cover cropping is calculated from the cached camera transform and the stable surface dimensions.

## Verification

- Build the debug HAP for ArkTS, arm64-v8a, and x86_64.
- Verify no unguarded indexing of camera capability arrays.
- Verify `UpdateSurfaceImage` is reachable only after a frame notification.
- On emulator, confirm preview orientation remains stable and `pipeline exception` no longer appears.
- Confirm unsupported autofocus and zoom degrade to disabled/no-op behavior without an error overlay.


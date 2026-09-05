# Camera Pipeline Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make camera startup, front/back switching, mirroring, preview geometry, and captured-image geometry deterministic on HarmonyOS API 12 devices.

**Architecture:** `XComponentController` owns the display Surface lifecycle and passes its 64-bit ID to a restartable native renderer. CameraService owns only Camera Kit resources and switches by camera facing. The render target's measured pixel size is the single geometry source used for preview sampling, framebuffer capture, ArkUI display, and photo metadata.

**Tech Stack:** HarmonyOS NEXT API 12, ArkTS/ArkUI, Camera Kit, NAPI, C++17, EGL, OpenGL ES 3, OH_NativeImage/NativeWindow, Hvigor.

**Spec:** `docs/plans/2026-09-05-camera-pipeline-design.md`

## Global Constraints

- Keep `compatibleSdkVersion` and `targetSdkVersion` at `5.0.0(12)`.
- Add no third-party dependencies.
- Preserve the real-time OpenGL color-isolation filter, watermark, gallery, and SaveButton flow.
- Do not replace the preview pipeline with CameraPicker or add PhotoOutput.
- Clearly distinguish build/static verification from physical-device verification.

---

### Task 1: Make the native display Surface lifecycle restartable and 64-bit safe

**Files:**
- Modify: `entry/src/main/cpp/types/libentry/index.d.ts`
- Modify: `entry/src/main/cpp/napi_init.cpp`
- Modify: `entry/src/main/ets/pages/Index.ets`

**Interfaces:**
- Produces: `startRenderer(surfaceId: bigint): boolean`
- Produces: `setSurfaceGeometry(width: number, height: number): void`
- Removes: the `attachXComponent()` and `initFromSurfaceId(number)` startup paths

- [ ] **Step 1: Record failing static assertions**

  Run `rg -n "napi_get_value_uint32.*surface|initFromSurfaceId\(Number|attachXComponent|libraryname" entry/src/main` and confirm the old startup paths and 32-bit decode are present.

- [ ] **Step 2: Introduce the controller-owned Surface lifecycle**

  Add a `CameraPreviewController extends XComponentController` in `Index.ets`. Its `onSurfaceCreated(surfaceId: string)` must call `colorFilter.startRenderer(BigInt(surfaceId))`; `onSurfaceChanged` must pass `rect.surfaceWidth` and `rect.surfaceHeight`; `onSurfaceDestroyed` must stop the camera and release the renderer through callbacks owned by `Index`.

- [ ] **Step 3: Decode the ID without precision loss**

  Replace `InitFromSurfaceId` with `StartRenderer`. Decode using `napi_get_value_bigint_uint64`, reject lossy or zero values, create the NativeWindow with the exact `uint64_t`, and pair it with `OH_NativeWindow_DestroyNativeWindow` after the render thread stops.

- [ ] **Step 4: Make all failure exits settle and reset state**

  Ensure EGL and renderer initialization failures set `g_running=false`, set `g_settled=true`, publish a useful error, wake waiters, clean partial resources, and allow a later `startRenderer` call. Serialize start/stop so a new thread cannot race a joining old thread.

- [ ] **Step 5: Verify the interface and build**

  Run the static assertion again; expected result: no old startup path and no Surface ID `uint32` decode. Run the project HAP build; expected result: success for arm64-v8a and x86_64.

---

### Task 2: Make camera selection and switching match front/back semantics

**Files:**
- Modify: `entry/src/main/ets/service/CameraService.ets`
- Modify: `entry/src/main/ets/pages/Index.ets`

**Interfaces:**
- Produces: `start(context, surfaceId, targetAspect, onPreviewSize): Promise<string | null>`
- Produces: `switchFacing(context, targetAspect, onPreviewSize): Promise<string | null>`
- Produces: `getFacing(): camera.CameraPosition`

- [ ] **Step 1: Record the failing selection rule**

  Confirm `switchTo` uses `(currentIndex + 1) % devices.length`, which cannot guarantee a change from rear to front on multi-camera devices.

- [ ] **Step 2: Select devices by facing**

  Build a usable device list containing one preferred back and one preferred front device. Default to back. Switching must search explicitly for the opposite `CameraPosition`, and `canSwitch()` must require both positions rather than merely two array elements.

- [ ] **Step 3: Choose a geometry-compatible profile**

  Score preview profiles by the difference between the rotated portrait aspect and the measured target aspect, then by pixel count under the existing performance ceiling. Reject zero dimensions and log the chosen camera position/profile.

- [ ] **Step 4: Make resource cleanup complete**

  Stop and release the session, release PreviewOutput, and close CameraInput with independent guarded operations. Clear each field even when another release throws. Do not leave `started=true` on a partial open.

- [ ] **Step 5: Recover from failed switching**

  Save the old facing before teardown. If opening the requested facing fails, attempt to reopen the prior facing on the same consumer Surface and return an error describing whether recovery succeeded. Update mirror and zoom only after success.

- [ ] **Step 6: Build and inspect deprecation output**

  Run Hvigor and confirm there are no new CameraService compile errors. Existing unrelated deprecation warnings may remain documented.

---

### Task 3: Remove non-uniform image scaling and duplicate mirroring

**Files:**
- Modify: `entry/src/main/cpp/include/gl_renderer.h`
- Modify: `entry/src/main/cpp/gl_renderer.cpp`
- Modify: `entry/src/main/cpp/napi_init.cpp`
- Modify: `entry/src/main/ets/pages/Index.ets`

**Interfaces:**
- Consumes: measured XComponent surface width/height and CameraService preview width/height
- Produces: framebuffer capture whose `width / height` equals the rendered target ratio

- [ ] **Step 1: Record duplicate mirroring and fixed capture ratio**

  Confirm `uMirror` flips X in both shaders and the capture overlay uses a hard-coded `aspectRatio(9 / 16)`.

- [ ] **Step 2: Apply mirror exactly once**

  Remove mirroring from the vertex shader and keep it in the fragment texture-coordinate transform. Rear uses `0`, front uses `1`.

- [ ] **Step 3: Snapshot render parameters safely**

  Protect hue, threshold, boost, mirror, preview size, and surface size behind one parameter mutex. At the start of `DrawFrame`, copy them to local values and use only that snapshot for the frame.

- [ ] **Step 4: Compute cover sampling from effective dimensions**

  Use the camera buffer dimensions after the NativeImage rotation transform. Scale only texture coordinates and never rely on `SCALE_TO_WINDOW` for content aspect correction. Keep buffer geometry equal to measured XComponent pixels.

- [ ] **Step 5: Drive the capture overlay from captured dimensions**

  Store `captureAspect = frame.width / frame.height` in ArkUI state and use it for `captureOverlay`. Retain `ImageFit.Cover` so cropping remains proportional. Record the final snapshot dimensions rather than an assumed preview profile size.

- [ ] **Step 6: Verify geometry invariants**

  Check that preview target, framebuffer, returned PixelMap, snapshot node, and recorded metadata all derive from measured dimensions. Build both ABIs.

---

### Task 4: Fix active-color metadata and lifecycle edge cases

**Files:**
- Modify: `entry/src/main/ets/service/CaptureService.ets`
- Modify: `entry/src/main/ets/pages/Index.ets`
- Modify: `entry/src/main/ets/pages/Gallery.ets`

**Interfaces:**
- Produces: `recordPhoto(localPath, albumUri, width, height, color): Promise<void>`

- [ ] **Step 1: Pass the captured color explicitly**

  Change `recordPhoto` to consume the `ColorPreset` captured at shutter time. Persist its name and hex instead of calling `DailyColorManager.getColor()`.

- [ ] **Step 2: Guard asynchronous page teardown**

  Track page activity and prevent late permission, renderer, camera, snapshot, or database completions from mutating a disappeared page. Clear focus/zoom/echo timers during teardown.

- [ ] **Step 3: Allow startup retry**

  Replace the permanent `pipelineStarted` latch with a shared in-flight Promise/state. On failure, clear it and show a retry action; on Surface recreation, start again only after the new renderer reports ready.

- [ ] **Step 4: Keep gallery color display honest**

  Use the active color where the gallery is describing the current session; retain each photo's stored color for historical data.

- [ ] **Step 5: Build and run static consistency checks**

  Run `rg` for `recordPhoto(` and confirm every call supplies the active color and actual output dimensions. Run Hvigor; expected result: BUILD SUCCESSFUL.

---

### Task 5: Final verification and architecture handoff

**Files:**
- Modify: `README.md`
- Create: `docs/camera-pipeline.md`

**Interfaces:**
- Documents: ownership, data flow, state transitions, error recovery, and device test matrix

- [ ] **Step 1: Run clean static checks**

  Run `git diff --check`, search for lossy Surface ID conversions, duplicate mirror operations, array-index camera switching, and fixed capture aspect assumptions.

- [ ] **Step 2: Run the full HAP build**

  Use the repository's configured DevEco/Hvigor command with `DEVECO_SDK_HOME` pointing to the SDK root. Expected: signed or unsigned debug HAP builds successfully with both configured ABIs.

- [ ] **Step 3: Perform device validation when a target is connected**

  Install and launch the HAP, then verify: repeated cold starts on 香芋紫; rear→front→rear switching at least five cycles; correct front mirror; page leave/re-enter; and round/circular subjects remain circular in preview, capture overlay, saved JPEG, and gallery.

- [ ] **Step 4: Capture bounded failure evidence if a device case fails**

  Collect only bounded `ColorFilter` and Camera Kit hilog lines plus screenshot dimensions. Record device/API/profile/surface dimensions without exposing unrelated logs.

- [ ] **Step 5: Document residual limitations**

  State whether physical-device validation was available, list remaining deprecated ArkUI APIs separately from camera correctness, and identify any device-specific profile behavior.

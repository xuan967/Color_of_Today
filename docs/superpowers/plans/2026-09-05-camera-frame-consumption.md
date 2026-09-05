# Camera Frame Consumption Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop camera-only portrait/landscape oscillation and prevent optional camera capabilities from turning a valid preview into an initialization failure.

**Architecture:** Camera frames are consumed only after a NativeImage frame-available notification, and the last successful transform remains authoritative between frames. ArkTS treats zoom/focus as optional and contains exceptions at the camera callback boundary.

**Tech Stack:** HarmonyOS NEXT API 12, ArkTS Camera Kit, ArkUI XComponent, HarmonyOS NativeImage, OpenGL ES/EGL, C++ atomics.

**Spec:** `docs/plans/2026-09-05-camera-frame-consumption-design.md`

## Global Constraints

- Keep compatible and target behavior valid for HarmonyOS API 12.
- Do not use `OH_NativeImage_SetDropBufferMode`; it starts at API 17.
- Do not change the page or window orientation policy.
- A failed/no-new-frame update must retain the last valid texture transform.
- Frame callbacks must not call other NativeImage APIs.

---

### Task 1: Contain optional camera capability failures

**Files:**
- Modify: `entry/src/main/ets/service/CameraService.ets`
- Modify: `entry/src/main/ets/pages/Index.ets`

**Interfaces:**
- Consumes: `PhotoSession.getZoomRatioRange(): Array<number>` and `PhotoSession.isFocusModeSupported(mode): boolean`
- Produces: `CameraService.zoomRange(): Array<number>` that always returns exactly two safe values; callback dispatch that never leaks UI exceptions into Camera Kit.

- [ ] **Step 1: Harden the zoom range contract**

Store the Cameralk returned value in a nullable local, validate two finite positive ordered numbers, and otherwise log `zoom unavailable; fallback=1..1` and return `[1, 1]`.

- [ ] **Step 2: Gate autofocus**

Call `isFocusModeSupported(camera.FocusMode.FOCUS_MODE_AUTO)` before `setFocusMode` and `setFocusPoint`; log a one-line capability fallback when unsupported.

- [ ] **Step 3: Isolate callbacks**

Dispatch `onPreviewSize`, `onFirstFrame`, and `onRuntimeError` through private safe wrapper methods with `try/catch`. Include the operation ID and callback name in failures.

- [ ] **Step 4: Make UI control refresh non-fatal**

Apply the safe zoom tuple to state inside a guarded method and move the `PREVIEWING` transition ahead of optional control refresh so preview success cannot be reversed by control metadata.

- [ ] **Step 5: Compile ArkTS**

Run the module debug HAP build. Expected: ArkTS compilation completes without errors.

### Task 2: Consume NativeImage frames only when notified

**Files:**
- Modify: `entry/src/main/cpp/include/gl_renderer.h`
- Modify: `entry/src/main/cpp/gl_renderer.cpp`

**Interfaces:**
- Consumes: `OH_NativeImage_SetOnFrameAvailableListener`, `OH_NativeImage_UnsetOnFrameAvailableListener`, `OH_NativeImage_UpdateSurfaceImage`, `OH_NativeImage_GetTransformMatrixV2`
- Produces: atomic notification/consumption counters and a cached last-valid texture transform used by `DrawFrame()`.

- [ ] **Step 1: Add listener state**

Add atomic `frameAvailableSequence_`, render-thread-only `consumedFrameSequence_`, cached `textureTransform_[4]`, and flags/counters for listener registration and rate-limited diagnostics.

- [ ] **Step 2: Register and release the listener safely**

Immediately after NativeImage creation, register a static callback whose only action is incrementing the atomic sequence. Before destroying NativeImage, unset the listener and record its return code.

- [ ] **Step 3: Gate texture updates**

In `DrawFrame()`, call `UpdateSurfaceImage` only when the available sequence differs from the consumed sequence. On success, update the cached transform and consumed sequence. On failure, keep both cached transform and visual orientation unchanged and rate-limit error logs.

- [ ] **Step 4: Render cached state**

Initialize the cached transform to identity once during `Init()`, not once per frame. Cover calculation and shader uniforms always consume this cached matrix.

- [ ] **Step 5: Compile both native ABIs**

Run the module debug HAP build. Expected: arm64-v8a and x86_64 C++ compilation and linking complete without errors.

### Task 3: Regression verification and documentation

**Files:**
- Modify: `docs/camera-pipeline.md`

**Interfaces:**
- Consumes: `[TodayColor][CameraService]`, `[TodayColor][CameraUI]`, and `[ColorFilter]` logs
- Produces: a repeatable emulator verification sequence and diagnostic interpretation.

- [ ] **Step 1: Run static invariants**

Search for every `OH_NativeImage_UpdateSurfaceImage` call and confirm it is guarded by the frame notification sequence. Search for every zoom range index and confirm validation precedes access.

- [ ] **Step 2: Build the complete debug HAP**

Run `hvigorw assembleHap --mode module -p module=entry@default -p product=default -p buildMode=debug --no-daemon`. Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 3: Update diagnostics documentation**

Document the frame notification/consume invariant, safe capability fallbacks, and the expected absence of repeated buffer-consumption errors.

- [ ] **Step 4: Review and commit**

Run `git diff --check` on the explicit source/document list, stage only those files, and commit with `fix: consume camera frames on notification`.


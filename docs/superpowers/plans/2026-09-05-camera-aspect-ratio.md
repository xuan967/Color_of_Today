# Camera Aspect-Ratio Preservation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the full-screen camera preview fill the page without letterboxing or non-uniform stretching.

**Architecture:** Request an explicit immersive XComponent SurfaceRect, make `onSurfaceChanged` the sole Native geometry source, retain shader cover cropping, and use proportional compositor cropping as a safety net. Geometry logs provide runtime proof that component, Surface, EGL, and camera ratios agree.

**Tech Stack:** HarmonyOS NEXT API 12, ArkTS/ArkUI XComponent, NativeWindow, EGL, OpenGL ES 3

**Spec:** `docs/plans/2026-09-05-camera-aspect-ratio-design.md`

## Global Constraints

- Compatible with HarmonyOS API 12.
- Fill the camera viewport with no empty bands.
- Preserve image geometry; crop excess edges instead of stretching.
- Do not make the bottom black control overlay participate in Surface measurement.
- Preserve user-owned and generated working-tree changes outside the scoped files.

---

### Task 1: Establish one authoritative Surface geometry path

**Files:**
- Modify: `entry/src/main/ets/pages/Index.ets`

**Interfaces:**
- Consumes: `XComponentController.setXComponentSurfaceRect(rect: SurfaceRect): void`
- Produces: `onSurfaceChanged` as the sole caller of `colorFilter.setSurfaceGeometry(widthPx, heightPx)`

- [ ] **Step 1: Replace the duplicate Native geometry update**

In `onAreaChange`, calculate the component pixel size and call:

```ts
this.xcController.setXComponentSurfaceRect({
  surfaceWidth: wPx,
  surfaceHeight: hPx,
  offsetX: 0,
  offsetY: 0
});
```

Do not call `colorFilter.setSurfaceGeometry` from `onAreaChange`. Keep `onSurfaceChanged` as the only Native geometry writer.

- [ ] **Step 2: Add bounded geometry diagnostics**

Log the component vp/px area and requested SurfaceRect only when its width or height changes. Retain the existing actual SurfaceRect log in the controller.

- [ ] **Step 3: Compile ArkTS**

Run the module HAP build and expect the ArkTS compiler to accept the API 12 SurfaceRect call.

### Task 2: Prevent compositor stretching

**Files:**
- Modify: `entry/src/main/cpp/napi_init.cpp`
- Modify: `entry/src/main/cpp/gl_renderer.cpp`
- Modify: `docs/camera-pipeline.md`

**Interfaces:**
- Consumes: `OH_NativeWindow_NativeWindowSetScalingModeV2`
- Produces: proportional compositor crop and ratio-rich first-frame logs

- [ ] **Step 1: Change the display scaling mode**

Replace `OH_SCALING_MODE_SCALE_TO_WINDOW_V2` with `OH_SCALING_MODE_SCALE_CROP_V2`, check its return code, and log the selected behavior.

- [ ] **Step 2: Extend first-frame geometry logs**

Include `surfaceAspect` and rotated `bufferAspect` in the existing first GL frame record so runtime evidence can verify the cover calculation.

- [ ] **Step 3: Document the invariant**

Document that the shader and compositor both preserve aspect ratio, with edge cropping as the no-letterbox trade-off.

- [ ] **Step 4: Build all configured ABIs**

Run:

```powershell
$env:DEVECO_SDK_HOME='D:\local\DevEcoStudio\sdk'
& 'D:\local\DevEcoStudio\tools\hvigor\bin\hvigorw.bat' assembleHap --mode module -p module=entry@default -p product=default -p buildMode=debug --no-daemon
```

Expected: `BUILD SUCCESSFUL`, including ArkTS and both configured Native ABIs.

### Task 3: Review and commit the focused change

**Files:**
- Review: `entry/src/main/ets/pages/Index.ets`
- Review: `entry/src/main/cpp/napi_init.cpp`
- Review: `entry/src/main/cpp/gl_renderer.cpp`
- Review: `docs/camera-pipeline.md`

**Interfaces:**
- Consumes: build output and Git diff
- Produces: a focused source commit

- [ ] **Step 1: Scan for forbidden stretch paths**

Run `rg` and verify `OH_SCALING_MODE_SCALE_TO_WINDOW_V2` and the duplicate `onAreaChange` Native geometry call are absent.

- [ ] **Step 2: Check the scoped diff**

Run `git diff --check` on the four implementation files and verify no whitespace or conflict-marker errors.

- [ ] **Step 3: Commit only scoped files**

Stage the two design/plan documents and four implementation/documentation files explicitly. Do not stage generated `.hvigor`, `.cxx`, `build`, or IDE files.


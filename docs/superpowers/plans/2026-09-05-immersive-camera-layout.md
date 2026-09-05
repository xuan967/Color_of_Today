# Immersive Camera Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the camera proportionally across the full immersive window, move the color HUD to the top safe area, and place camera controls inside one opaque black bottom overlay.

**Architecture:** EntryAbility owns immersive system-bar configuration, while `Index.ets` layers a full-window XComponent beneath safe-area-aware overlays. The native renderer keeps the complete API 12 NativeImage transform and applies cover in display coordinates before texture transformation.

**Tech Stack:** HarmonyOS NEXT API 12, ArkTS/ArkUI Stack and Window APIs, Camera Kit, NativeImage, OpenGL ES 3/EGL, C++.

**Spec:** `docs/plans/2026-09-05-immersive-camera-layout-design.md`

## Global Constraints

- Keep compatibility with HarmonyOS API 12.
- Do not use `OH_NativeImage_GetBufferMatrix`, which starts at API 15.
- Camera imagery must be proportional cover; non-uniform stretching is forbidden.
- The opaque bottom control panel is an overlay and must never change XComponent height.
- Keep the frame-notification consumption and cached-transform behavior from commit `88b7607`.
- Preserve unrelated DevEco-generated working-tree changes.

---

### Task 1: Enable an immersive app window

**Files:**
- Modify: `entry/src/main/ets/entryability/EntryAbility.ets`

**Interfaces:**
- Consumes: `window.WindowStage.getMainWindowSync()`, `Window.setWindowLayoutFullScreen(true)`, `Window.setWindowSystemBarProperties(...)`
- Produces: a full-window ArkUI layout under transparent visible system bars.

- [ ] **Step 1: Inspect the existing window lifecycle**

Confirm content loading occurs in `onWindowStageCreate` and keep data warmup independent of window configuration.

- [ ] **Step 2: Add immersive configuration**

Import the Window API, obtain the main window after stage creation, call `setWindowLayoutFullScreen(true)`, and set both bar colors to `#00000000` with light content colors appropriate for a camera background.

- [ ] **Step 3: Isolate window failures**

Wrap each Promise in `try/catch`; log `[TodayColor][Window] immersive ...` success or the numeric error code. Window styling failure must not prevent `loadContent('pages/Index')`.

- [ ] **Step 4: Compile ArkTS**

Run the module debug HAP build. Expected: EntryAbility compiles for API 12.

### Task 2: Build full-window preview with fixed overlay zones

**Files:**
- Modify: `entry/src/main/ets/pages/Index.ets`

**Interfaces:**
- Consumes: full-window layout supplied by EntryAbility and existing camera phase/data state.
- Produces: full-window `XComponent`, top HUD overlay, and opaque bottom control overlay.

- [ ] **Step 1: Keep the preview independent**

Keep XComponent as the first child of the root Stack with `width('100%')` and `height('100%')`. Do not wrap it in a Column whose siblings consume height.

- [ ] **Step 2: Position the top HUD**

Place the color capsule and echo line in a top-positioned Column. Use a conservative top inset that clears the status/cutout area on API 12, keep the text centered, and retain the palette click action.

- [ ] **Step 3: Replace the floating capsule control bar**

Change the bottom Row container into a full-width, fixed-height opaque `Color.Black` panel positioned at the window bottom. Preserve the three control hit targets and add bottom padding for the gesture/navigation area.

- [ ] **Step 4: Keep overlays out of capture output**

Confirm camera controls remain siblings above XComponent and that `captureOverlay` still contains only the captured image and watermark.

- [ ] **Step 5: Check compact phone geometry**

Verify the black panel has enough fixed height for a 74vp shutter plus top/bottom padding and that the top HUD cannot overlap it on short displays.

### Task 3: Correct native texture transform and cover ordering

**Files:**
- Modify: `entry/src/main/cpp/include/gl_renderer.h`
- Modify: `entry/src/main/cpp/gl_renderer.cpp`

**Interfaces:**
- Consumes: `OH_NativeImage_GetTransformMatrixV2(image, matrix)` and existing surface/buffer dimensions.
- Produces: cached `float textureTransform_[16]`, shader uniform `mat4 uTexMatrix`, and display-axis proportional cover.

- [ ] **Step 1: Cache the full matrix**

Replace the four-element transform cache with a 16-element identity matrix. On each successful frame consumption, copy all 16 values only when `GetTransformMatrixV2` succeeds.

- [ ] **Step 2: Update the shader contract**

Replace `vec4 uTexLin` with `mat4 uTexMatrix`. Calculate `displayUV = (vUV - 0.5) * uCover + 0.5`, then calculate texture coordinates from `uTexMatrix * vec4(displayUV, 0.0, 1.0)`.

- [ ] **Step 3: Preserve pad in texture space**

Apply the existing optional pad mapping after the full matrix transform. If allocation dimensions cannot be queried, keep the default `[0,1]` spans.

- [ ] **Step 4: Upload the complete matrix**

Use `glUniformMatrix4fv` and keep the cover factors computed from surface size, camera buffer size, and the cached matrix rotation axes. Extend the first-frame log with the relevant matrix terms and pad values.

- [ ] **Step 5: Compile both ABIs**

Run the module debug HAP build. Expected: arm64-v8a and x86_64 compile and link without errors.

### Task 4: Verify geometry and document behavior

**Files:**
- Modify: `docs/camera-pipeline.md`

**Interfaces:**
- Consumes: `[TodayColor][Window]`, `[TodayColor][CameraUI]`, and `[ColorFilter]` logs.
- Produces: documented immersive layout and transform ordering for future debugging.

- [ ] **Step 1: Run static invariant searches**

Confirm no `uTexLin` remains, the cache has 16 elements, cover is applied before the matrix in shader code, and the bottom panel is not a layout sibling of XComponent.

- [ ] **Step 2: Build the debug HAP**

Run `hvigorw assembleHap --mode module -p module=entry@default -p product=default -p buildMode=debug --no-daemon`. Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 3: Update pipeline documentation**

Document transparent system bars, safe overlay placement, complete TransformMatrixV2 use, and display-coordinate cover ordering.

- [ ] **Step 4: Perform runtime visual checks**

On emulator, verify no top preview black band, color/echo text at the top, opaque bottom control panel, stable orientation, and circular objects remaining circular. Repeat front/back switch where supported.

- [ ] **Step 5: Review and commit**

Run `git diff --check` on the explicit source/document list, stage only those files, and commit with `fix: render immersive full-screen camera`.

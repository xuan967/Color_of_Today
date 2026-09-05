# Camera Emulator Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the camera preview fill the page without distortion, drive UI success from the first preview frame, degrade accurately on emulator camera limitations, and add correlated lifecycle diagnostics.

**Architecture:** `Index.ets` owns a single camera UI phase and operation counter. `CameraService.ets` reports device capability and first-frame events. The existing Native renderer remains the geometry owner below ArkTS, but receives an operation ID and emits bounded lifecycle logs.

**Tech Stack:** HarmonyOS NEXT API 12, ArkTS/ArkUI, Camera Kit PhotoSession, NAPI, EGL, OpenGL ES 3, OH_NativeImage, Hvigor.

**Spec:** `docs/plans/2026-09-05-camera-emulator-diagnostics-design.md`

## Global Constraints

- XComponent fills the page and uses proportional center-crop; no stretching and no layout-created black band.
- Preview success is confirmed by `PreviewOutput.frameStart`.
- Unsupported emulator camera facing is reported as capability absence, not a generic failure.
- Logs are correlated and event-based; never log every rendered frame or full device identifiers.
- Preserve all unrelated DevEco cache, IDE, and build-tree changes already present in the working tree.

---

### Task 1: Camera operation and capability contract

**Files:**
- Modify: `entry/src/main/ets/service/CameraService.ets`

**Interfaces:**
- Consumes: Camera Kit `CameraManager`, `PhotoSession`, `PreviewOutput`.
- Produces: `CameraStartCallbacks`, `CameraCapability`, operation-aware `start` and `switchTo` methods.

- [ ] **Step 1: Define explicit callbacks and capability result**

```ts
export interface CameraStartCallbacks {
  onPreviewSize: (width: number, height: number) => void;
  onFirstFrame: () => void;
  onRuntimeError: (message: string) => void;
}

export interface CameraCapability {
  canSwitchFacing: boolean;
  reason: string;
}
```

- [ ] **Step 2: Enumerate usable facing capability**

For every camera, query supported scene modes and `NORMAL_PHOTO` preview profiles. Log position, type, supported-mode result and profile count. `canSwitchFacing` is true only when both front and back have at least one usable profile.

- [ ] **Step 3: Register bounded Camera callbacks**

Register named callbacks on `PreviewOutput` for `frameStart`, `frameEnd`, and `error`, and on `PhotoSession` for `error`. Remove them before releasing resources. Fire `onFirstFrame` only once per open.

- [ ] **Step 4: Add operation-aware stage logs**

Log manager enumeration, profile selection, input open, session begin/add/commit/start, switch target, recovery, and independent cleanup using `[TodayColor][CameraService][op=N]`.

- [ ] **Step 5: Build the ArkTS module**

Run:

```powershell
$env:DEVECO_SDK_HOME='D:\local\DevEcoStudio\sdk'
& 'D:\local\DevEcoStudio\tools\hvigor\bin\hvigorw.bat' assembleHap --mode module -p module=entry@default -p product=default -p buildMode=debug --no-daemon
```

Expected: CameraService compiles without ArkTS type errors.

### Task 2: Explicit UI phase and full-screen preview

**Files:**
- Modify: `entry/src/main/ets/pages/Index.ets`

**Interfaces:**
- Consumes: Task 1 `CameraStartCallbacks`, `CameraCapability`.
- Produces: one authoritative UI phase and full-screen XComponent geometry.

- [ ] **Step 1: Replace loose UI inference with a phase**

```ts
enum CameraUiPhase {
  IDLE,
  RENDERER_STARTING,
  CAMERA_OPENING,
  PREVIEWING,
  SWITCHING,
  ERROR
}
```

Add a monotonically increasing operation ID. Centralize phase changes in `setCameraPhase()` and clear the error whenever entering `PREVIEWING`.

- [ ] **Step 2: Guard asynchronous callbacks**

Every start/retry/switch captures its operation ID. Ignore callbacks when the page is inactive or their ID no longer matches the active operation.

- [ ] **Step 3: Drive success from the first frame**

Keep the loading overlay after `session.start()` until `onFirstFrame`. On first frame, set `PREVIEWING`, clear `camError`, refresh switch capability and zoom state.

- [ ] **Step 4: Make XComponent full-screen**

Change the preview to `.width('100%').height('100%')`. Remove `.aspectRatio(9 / 16)` and the preview container's `.padding({ top: 46 })`. Continue sending actual pixel dimensions from `onAreaChange`.

- [ ] **Step 5: Make overlays phase-derived**

Show loading only for renderer/camera opening or switching. Show error only in `ERROR`. When switching is unsupported, keep previewing and show the capability reason as a Toast.

- [ ] **Step 6: Build the ArkTS module**

Run the Task 1 Hvigor command. Expected: BUILD SUCCESSFUL or only pre-existing warnings.

### Task 3: Correlated Native lifecycle diagnostics

**Files:**
- Modify: `entry/src/main/cpp/types/libentry/index.d.ts`
- Modify: `entry/oh_modules/libentry.so/index.d.ts`
- Modify: `entry/src/main/cpp/napi_init.cpp`
- Modify: `entry/src/main/cpp/egl_core.cpp`
- Modify: `entry/src/main/cpp/gl_renderer.cpp`
- Modify: `entry/src/main/cpp/include/gl_renderer.h`

**Interfaces:**
- Consumes: `startRenderer(surfaceId: bigint, operationId: number)`.
- Produces: correlated logs for Native renderer start, initialization, geometry, first rendered frame, capture and shutdown.

- [ ] **Step 1: Extend the NAPI contract**

Update both declaration files and NAPI parsing so `startRenderer` accepts operation ID as its second argument. Store it atomically for log correlation.

- [ ] **Step 2: Log renderer lifecycle**

Log Surface ID creation request, NativeWindow result, EGL initialization, NativeImage consumer Surface, geometry changes, first rendered frame, failure reason and final cleanup. Never log every frame.

- [ ] **Step 3: Log EGL failure boundaries**

Add logs around display/context/config/window-surface creation and `RecreateSurface`, including EGL error codes on failure.

- [ ] **Step 4: Log GL initialization boundaries**

Log shader compile/program link, texture/NativeImage creation, first valid transform dimensions and capture completion. Add a per-renderer `firstFrameLogged_` flag reset by `Init`/`Release`.

- [ ] **Step 5: Compile both Native ABIs**

Run the Hvigor command. Expected: arm64-v8a and x86_64 native compilation succeed.

### Task 4: Documentation and verification

**Files:**
- Modify: `docs/camera-pipeline.md`

**Interfaces:**
- Consumes: final UI state, Camera callbacks and Native logs.
- Produces: reproducible debugging guide.

- [ ] **Step 1: Document states and log filters**

Document the first-frame success rule, full-screen cover geometry, simulator limitation behavior and filters for `TodayColor` / `ColorFilter`.

- [ ] **Step 2: Run static checks**

Run:

```powershell
rg -n "aspectRatio\(9 / 16\)|padding\(\{ top: 46 \}\)" entry/src/main/ets/pages/Index.ets
git diff --check
```

Expected: no preview layout matches and no whitespace errors.

- [ ] **Step 3: Run full build**

Run the Task 1 Hvigor command. Expected: `BUILD SUCCESSFUL` for ArkTS, arm64-v8a, x86_64 and unsigned HAP packaging.

- [ ] **Step 4: Probe the emulator**

Run bounded `hdc list targets -v`. If a single Connected target exists, inspect boot status and bounded `hilog -z 100`; otherwise report the target as offline without claiming runtime verification.

- [ ] **Step 5: Preserve generated changes and commit only source files**

Stage only the explicit files in Tasks 1–4. Do not stage `.hvigor`, `.idea`, `entry/.cxx`, `entry/build`, or unrelated generated changes.


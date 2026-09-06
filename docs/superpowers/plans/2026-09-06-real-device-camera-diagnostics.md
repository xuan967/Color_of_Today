# Real-device Camera Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured Native renderer diagnostics and prevent a pre-enumeration camera state from being reported as “no camera”.

**Architecture:** The Native renderer owns a mutex-protected status snapshot and exposes it through one read-only N-API function. ArkUI samples that status at bounded lifecycle checkpoints, while CameraService separately tracks whether device enumeration actually occurred.

**Tech Stack:** HarmonyOS NEXT API 12, ArkTS, N-API, C++17, EGL, OpenGL ES 3, OH_NativeImage

**Spec:** `docs/plans/2026-09-06-real-device-camera-diagnostics-design.md`

## Global Constraints

- Keep the existing camera/rendering behavior unchanged in this diagnostic pass.
- Use `[TodayColor][CameraUI]`, `[TodayColor][CameraService]`, `[TodayColor][NativeRenderer]`, and `[TodayColor][EGL]` prefixes.
- Do not log Surface IDs, device identifiers, file paths, credentials, or per-frame events.
- Target HarmonyOS API 12 and ArkTS static typing.

---

### Task 1: Native renderer status bridge

**Files:**
- Modify: `entry/src/main/cpp/napi_init.cpp`
- Modify: `entry/src/main/cpp/egl_core.cpp`
- Modify: `entry/src/main/cpp/include/egl_core.h`
- Modify: `entry/src/main/cpp/gl_renderer.cpp`
- Modify: `entry/src/main/cpp/types/libentry/index.d.ts`

**Interfaces:**
- Produces: `getRendererStatus(): RendererStatus`
- Produces: `RendererStatus { operationId, stage, message, eglError, running, ready }`

- [ ] **Step 1: Define the fixed ArkTS renderer status interface**

```ts
export interface RendererStatus {
  operationId: number;
  stage: string;
  message: string;
  eglError: number;
  running: boolean;
  ready: boolean;
}
export const getRendererStatus: () => RendererStatus;
```

- [ ] **Step 2: Add a mutex-protected Native status snapshot**

Maintain stage, message, and EGL error independently from `g_running`/`g_ok`; update it only at lifecycle boundaries.

- [ ] **Step 3: Export the snapshot through N-API**

Create an object with the six fixed fields and register `getRendererStatus` beside `isRendererReady`.

- [ ] **Step 4: Normalize Native log tags and record failure stages**

Use `TodayColorNative` as the HiLog tag and include `[TodayColor][NativeRenderer]` or `[TodayColor][EGL]` in every message.

- [ ] **Step 5: Build the module**

Run: `hvigorw assembleHap --mode module -p module=entry@default -p product=default -p buildMode=debug --no-daemon`

Expected: Native and ArkTS compilation complete; signing may remain environment-dependent.

### Task 2: ArkUI lifecycle diagnostics

**Files:**
- Modify: `entry/src/main/ets/pages/Index.ets`

**Interfaces:**
- Consumes: `colorFilter.getRendererStatus(): RendererStatus`
- Produces: bounded status logs at renderer request, poll completion, and timeout

- [ ] **Step 1: Add one formatter for renderer status**

Format only operation ID, stage, message, EGL error, running, and ready.

- [ ] **Step 2: Log lifecycle checkpoints**

Record XComponent surface creation/change/destruction, renderer request result, readiness poll result, camera Surface availability, and timeout status.

- [ ] **Step 3: Preserve user-facing error text**

Keep technical information in logs and continue showing a short retry message on screen.

- [ ] **Step 4: Run ArkTS build validation**

Run the same module build and expect no ArkTS type or N-API declaration errors.

### Task 3: Camera enumeration state and final verification

**Files:**
- Modify: `entry/src/main/ets/service/CameraService.ets`
- Modify: `entry/src/main/ets/pages/Index.ets`

**Interfaces:**
- Produces: `hasEnumeratedDevices(): boolean`
- Consumes: enumeration state in `switchUnavailableReason()`

- [ ] **Step 1: Track CameraManager enumeration completion**

Set the flag immediately after `getSupportedCameras()` returns, including an empty result; reset it only when a new manager discovery starts.

- [ ] **Step 2: Correct the switch-unavailable reason**

Return `相机管线尚未就绪` before enumeration, and reserve `当前设备没有可用摄像头` for a completed empty enumeration.

- [ ] **Step 3: Add bounded enumeration diagnostics**

Log manager acquisition, enumeration completion, device capability results, chosen default index, and camera Surface validity using the active operation ID.

- [ ] **Step 4: Verify source diff and build**

Run `git diff --check` and the debug HAP build. Confirm no unrelated `.idea` deletions are included in the implementation commit.

# Camera UI Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the camera page into a compact system-camera layout with a recognizable daily-color signature.

**Architecture:** Keep the XComponent as the full-screen first Stack child and add only non-interactive visual scrims above it. Restyle the existing top HUD, grid toggle, and opaque bottom control panel without changing camera lifecycle, capture, focus, zoom, or aspect-ratio code.

**Tech Stack:** HarmonyOS NEXT API 12, ArkTS, ArkUI declarative components

**Spec:** `docs/plans/2026-09-05-camera-ui-refinement-design.md`

## Global Constraints

- Keep HarmonyOS API 12 compatibility.
- Keep the camera XComponent full-screen and independent from overlays.
- Keep the bottom controls inside one opaque black panel.
- Preserve aspect ratio and do not introduce `ImageFit.Fill` or stretch scaling.
- Preserve all existing camera interactions and state handling.
- Do not stage generated build or IDE files.

---

### Task 1: Refine the top camera HUD

**Files:**
- Modify: `entry/src/main/ets/pages/Index.ets:712-764`

**Interfaces:**
- Consumes: `today.hex`, `today.name`, `echoLine`, `echoReady`, `gridOn`, `paletteOpen`
- Produces: a compact top overlay with unchanged palette and grid actions

- [ ] **Step 1: Add a non-interactive top scrim**

Insert a full-width 176vp Column before the HUD:

```ts
Column()
  .width('100%')
  .height(176)
  .linearGradient({
    direction: GradientDirection.Bottom,
    colors: [['rgba(0,0,0,0.58)', 0], ['rgba(0,0,0,0)', 1]]
  })
  .position({ x: 0, y: 0 })
  .hitTestBehavior(HitTestMode.None)
```

- [ ] **Step 2: Tighten the daily-color capsule and echo line**

Use 17fp medium text, a 12vp color dot, a `rgba(20,20,20,0.58)` capsule, a subtle white border, and top padding around 58vp. Keep the existing `paletteOpen = true` action. Limit the echo to one line and secondary white.

- [ ] **Step 3: Turn the grid icon into a utility button**

Wrap the existing line drawing in a 42vp circular dark surface at the top-right. Keep `gridOn` opacity and the existing toggle action.

- [ ] **Step 4: Inspect interaction layering**

Verify the scrim uses `HitTestMode.None`, while the capsule and grid button remain clickable above it.

### Task 2: Refine the bottom camera controls

**Files:**
- Modify: `entry/src/main/ets/pages/Index.ets:766-844`

**Interfaces:**
- Consumes: `latestThumb`, `photoCount`, `today.hex`, `capBusy`, `canSwitch`
- Produces: a 140vp opaque black panel with balanced camera controls

- [ ] **Step 1: Add a preview-to-panel transition**

Add a 32vp non-interactive gradient directly above the panel, from transparent to black.

- [ ] **Step 2: Normalize side controls**

Use 52vp thumbnail and switch surfaces, 12–26vp corner radii, consistent `rgba(255,255,255,0.42)` borders, and 60vp layout footprints.

- [ ] **Step 3: Build the two-ring shutter**

Replace the dark filled Column with a clickable 78vp Stack containing:

```ts
Circle({ width: 78, height: 78 })
  .fill('rgba(0,0,0,0)')
  .stroke(Color.White)
  .strokeWidth(2.5)
Circle({ width: 64, height: 64 })
  .fill(Color.White)
```

Apply the existing busy scale animation and `doCapture()` action to the Stack.

- [ ] **Step 4: Reduce panel height**

Set the panel to 140vp, keep it full-width and opaque black, and balance top/bottom padding around system navigation.

### Task 3: Verify behavior and commit

**Files:**
- Review: `entry/src/main/ets/pages/Index.ets`
- Review: `docs/plans/2026-09-05-camera-ui-refinement-design.md`

**Interfaces:**
- Consumes: final ArkUI source and HAP build output
- Produces: a focused UI commit

- [ ] **Step 1: Run static invariants**

Verify the XComponent remains `100% × 100%`, all decorative scrims use `HitTestMode.None`, the panel remains a positioned Stack sibling, and no `ImageFit.Fill` was introduced.

- [ ] **Step 2: Build the HAP**

Run:

```powershell
$env:DEVECO_SDK_HOME='D:\local\DevEcoStudio\sdk'
& 'D:\local\DevEcoStudio\tools\hvigor\bin\hvigorw.bat' assembleHap --mode module -p module=entry@default -p product=default -p buildMode=debug --no-daemon
```

Expected: `BUILD SUCCESSFUL` with ArkTS and both configured Native ABIs.

- [ ] **Step 3: Review the scoped diff**

Run `git diff --check` for `entry/src/main/ets/pages/Index.ets` and confirm no conflict markers or whitespace errors.

- [ ] **Step 4: Commit the UI source only**

Stage `entry/src/main/ets/pages/Index.ets` explicitly and commit it. Leave generated `.hvigor`, `.cxx`, `build`, and IDE files untouched.


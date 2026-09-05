# Camera UI Refinement Design

## Goal

Refine the camera page into a system-camera-style interface while retaining the app's distinctive daily-color identity. The live preview remains the dominant surface; controls provide context without visually reducing the shooting area.

## Current issues

- The top content reads as a tall black header rather than an overlay, so the preview feels vertically boxed in.
- The color title, echo text, and grid control do not share a clear alignment system.
- The grid control has a small visual target and appears detached from the other controls.
- The bottom panel is taller than necessary and the preview-to-panel boundary is abrupt.
- The shutter lacks the familiar solid inner disc and outer-ring hierarchy of a camera control.
- Side controls use slightly different visual weights.

## Direction

Use a “system camera skeleton + daily color signature” direction.

- The camera remains full-screen behind the top overlay.
- A transparent-to-clear top scrim protects status and text contrast without becoming a header block.
- The daily color capsule is compact and centered; its live color dot is the sole chromatic signature.
- The echo line is secondary, shorter, and quieter.
- The grid toggle becomes a 42vp circular utility button aligned with the top information group.
- The bottom controls remain inside one opaque black panel, reduced to 140vp.
- A short transparent-to-black transition sits immediately above the panel.
- The shutter becomes a white solid inner disc with a fine white outer ring.
- Thumbnail and camera-switch controls share a 52vp footprint and consistent borders.

## Visual tokens

- Camera black: `#FF000000`
- Scrim black: `rgba(0,0,0,0.58)`
- Utility surface: `rgba(20,20,20,0.58)`
- Primary white: `#FFFFFFFF`
- Secondary white: `rgba(255,255,255,0.72)`
- Daily accent: the active `today.hex` value

Typography uses the platform sans-serif for predictable HarmonyOS rendering:

- Display role: daily color name, 17fp, medium weight.
- Body role: echo line, 12fp, regular weight.
- Utility role: count and transient zoom labels, 11–13fp, medium weight.

## Layout

```text
┌────────────────────────────────────┐
│ system status                      │
│          ● Daily color ›       ◫   │
│           short echo line          │  top scrim over live preview
│                                    │
│                                    │
│            LIVE CAMERA             │
│                                    │
│                                    │
│ · · · transparent → black · · ·    │
├────────────────────────────────────┤
│   thumbnail      shutter     flip  │  140vp opaque black panel
└────────────────────────────────────┘
```

## Interaction and states

- Tapping the color capsule continues to open the palette.
- Tapping the grid utility toggles the grid and visually increases its opacity.
- Shutter press retains the existing scale feedback and capture flow.
- Camera switching retains disabled opacity and existing error handling.
- Loading and error states remain centered over the preview and stay above the decorative scrims.

## Geometry invariant

This is a UI-only refinement. The XComponent remains full-screen and independent from the bottom panel. The existing aspect-preserving shader cover and NativeWindow crop behavior remain unchanged; the new overlays must not participate in Surface measurement.

## Validation

- Compile ArkTS and both configured Native ABIs.
- Confirm the XComponent remains the first full-screen Stack child.
- Confirm top/bottom scrims use `HitTestMode.None`.
- Confirm the bottom black panel is a Stack overlay and remains outside capture output.
- Verify no `ImageFit.Fill` or stretch scaling is introduced.


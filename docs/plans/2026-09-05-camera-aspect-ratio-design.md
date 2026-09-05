# Camera Aspect-Ratio Preservation Design

## Problem

The filtered camera frame is rendered into a full-screen XComponent. The shader already performs an aspect-preserving cover crop, but the display NativeWindow is configured with `OH_SCALING_MODE_SCALE_TO_WINDOW_V2`. The XComponent also publishes display geometry from both `onSurfaceChanged` and `onAreaChange`. In an immersive window those dimensions can differ because `SurfaceRect` and the ArkUI component area do not necessarily include the same safe-area pixels. A mismatched buffer and window can therefore be stretched non-uniformly by the compositor.

## Selected behavior

Use the same behavior as a system camera preview:

- Fill the visible camera area with no letterboxing.
- Preserve the camera image aspect ratio.
- Crop excess content symmetrically when the camera and display aspect ratios differ.
- Never stretch width and height independently.

Alternatives rejected:

- `contain`: preserves the full frame but creates black/empty bands.
- `scale-to-window`: fills the window but distorts people and circular objects when ratios differ.

## Architecture

The ArkUI component area determines the requested immersive `SurfaceRect`. Only the controller's `onSurfaceChanged` callback is authoritative for the Native display buffer size. `onAreaChange` may request the full-screen rect and update interaction coordinates, but it must not write Native geometry directly.

The GLES shader remains responsible for the primary aspect-preserving cover calculation between the rotated camera buffer and the EGL surface. The display NativeWindow uses `OH_SCALING_MODE_SCALE_CROP_V2` as a compositor safety net, so a temporary size mismatch is cropped proportionally instead of stretched.

## Data flow

1. ArkUI reports the full XComponent area.
2. The page requests an explicit pixel SurfaceRect at `(0, 0)`.
3. `onSurfaceChanged` reports the actual SurfaceRect pixels.
4. Native recreates the EGLSurface and renders a buffer at that exact size.
5. The shader cover-crops the rotated camera frame into the EGL buffer.
6. The compositor either displays it 1:1 or proportionally crops a transient mismatch.

## Diagnostics

Log component area, requested SurfaceRect, actual SurfaceRect, EGLSurface dimensions, camera buffer dimensions, both aspect ratios, and cover factors. Repeated identical geometry should not generate duplicate noise.

## Compatibility and risk

The design uses API 12 interfaces only. The expected visual trade-off is a small amount of edge cropping on devices whose screen ratio differs from the selected camera profile. There should be no empty band and no geometric distortion.


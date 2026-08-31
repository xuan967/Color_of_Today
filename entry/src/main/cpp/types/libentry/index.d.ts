export interface CaptureBuffer {
  data: ArrayBuffer;
  width: number;
  height: number;
}

export const attachXComponent: () => boolean;
export const initFromSurfaceId: (surfaceId: number) => boolean;
export const isRendererReady: () => boolean;
export const getCameraSurfaceId: () => number;
export const setSurfaceGeometry: (widthPx: number, heightPx: number) => void;
export const setColor: (hue: number, threshold: number, satBoost: number) => void;
export const setMirror: (mirror: number) => void;
export const setPreviewSize: (w: number, h: number) => void;
export const captureFrame: () => CaptureBuffer | null;
export const releaseRenderer: () => void;

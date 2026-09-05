export interface CaptureBuffer {
  data: ArrayBuffer;
  width: number;
  height: number;
}

export const startRenderer: (surfaceId: bigint) => boolean;
export const isRendererReady: () => boolean;
export const getCameraSurfaceId: () => string;
export const setSurfaceGeometry: (widthPx: number, heightPx: number) => void;
export const setColor: (hue: number, threshold: number, satBoost: number) => void;
export const setMirror: (mirror: number) => void;
export const setPreviewSize: (w: number, h: number) => void;
export const captureFrame: () => CaptureBuffer | null;
export const releaseRenderer: () => void;

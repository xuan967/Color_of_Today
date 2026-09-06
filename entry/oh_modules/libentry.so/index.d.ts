export interface CaptureBuffer {
  data: ArrayBuffer;
  width: number;
  height: number;
}

export interface RendererStatus {
  operationId: number;
  stage: string;
  message: string;
  eglError: number;
  running: boolean;
  ready: boolean;
}

export const startRenderer: (surfaceId: bigint, operationId: number) => boolean;
export const isRendererReady: () => boolean;
export const getRendererStatus: () => RendererStatus;
export const getCameraSurfaceId: () => string;
export const setSurfaceGeometry: (widthPx: number, heightPx: number) => void;
export const setColor: (hue: number, threshold: number, satBoost: number) => void;
export const setMirror: (mirror: number) => void;
export const setPreviewSize: (w: number, h: number) => void;
export const captureFrame: () => CaptureBuffer | null;
export const releaseRenderer: () => void;

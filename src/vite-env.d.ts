/// <reference types="vite/client" />

type NativePdfPayload = {
  name: string;
  size: number;
  lastModified: number;
  data: ArrayBuffer;
};

interface Window {
  estudioPdf?: {
    openPdfDialog: () => Promise<NativePdfPayload | null>;
    writeClipboardText: (text: string) => Promise<boolean>;
    setNativeFullscreen: (fullscreen: boolean) => Promise<boolean>;
    getNativeFullscreen: () => Promise<boolean>;
    onNativeFullscreenChange: (callback: (fullscreen: boolean) => void) => () => void;
    onOpenPdfFromMenu: (callback: () => void) => () => void;
  };
}

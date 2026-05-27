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
    onOpenPdfFromMenu: (callback: () => void) => () => void;
  };
}

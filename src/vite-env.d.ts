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
    onOpenPdfFromMenu: (callback: () => void) => () => void;
  };
}

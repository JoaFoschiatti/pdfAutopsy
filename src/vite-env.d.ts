/// <reference types="vite/client" />

type NativeMarkdownPayload = {
  name: string;
  size: number;
  lastModified: number;
  content: string;
};

interface Window {
  mdAutopsy?: {
    openMarkdownDialog: () => Promise<NativeMarkdownPayload | null>;
    writeClipboardText: (text: string) => Promise<boolean>;
    setNativeFullscreen: (fullscreen: boolean) => Promise<boolean>;
    getNativeFullscreen: () => Promise<boolean>;
    onNativeFullscreenChange: (callback: (fullscreen: boolean) => void) => () => void;
    onOpenMarkdownFromMenu: (callback: () => void) => () => void;
  };
}

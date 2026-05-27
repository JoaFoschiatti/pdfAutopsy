import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  optimizeDeps: {
    include: ["pdfjs-dist", "react-pdf"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          pdf: ["pdfjs-dist", "react-pdf"],
          react: ["react", "react-dom"],
          icons: ["lucide-react"],
        },
      },
    },
  },
});

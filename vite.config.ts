import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  optimizeDeps: {
    include: ["react-markdown", "remark-gfm", "remark-math", "rehype-katex", "katex"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          markdown: ["react-markdown", "remark-gfm", "remark-math", "rehype-katex", "katex"],
          react: ["react", "react-dom"],
          icons: ["lucide-react"],
        },
      },
    },
  },
});

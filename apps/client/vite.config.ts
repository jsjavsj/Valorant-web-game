import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "PUMPWORKS_");
  return {
    esbuild: { jsx: "automatic" },
    server: {
      strictPort: true,
      proxy: { "/health": env.PUMPWORKS_SERVER_URL || "http://127.0.0.1:2567" },
    },
  };
});

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  use: {
    baseURL: "http://127.0.0.1:5173",
    launchOptions: {
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
  webServer: [
    {
      command: "node apps/server/dist/index.js",
      url: "http://127.0.0.1:2567/health",
    },
    {
      command: "pnpm --filter @pumpworks/client dev --host 127.0.0.1",
      url: "http://127.0.0.1:5173",
    },
  ],
});

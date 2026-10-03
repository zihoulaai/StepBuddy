import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Task 8：MVP 单页诊断工作台的 Vite/vitest 配置。
 *
 * - server.proxy：本地 api 默认 PORT=3000（apps/api/src/index.ts），dev 下同源转发
 *   /v1 → 避免跨域；MVP 单机场景，api 不加 CORS。
 * - test：jsdom + RTL；显式 import（globals:false，与其他工作区一致）。
 */
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/v1": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    include: ["test/**/*.test.{ts,tsx}"],
    setupFiles: ["./test/setup.ts"],
  },
});

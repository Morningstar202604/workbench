import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// 测试专用配置：jsdom 环境 + 全局 DOM 断言。
// 与 vite.config.ts 分开，避免把 tauri 特有设置带进测试。
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      reporter: ["text", "lcov"],
      include: ["src/lib/**", "src/ui.tsx", "src/ErrorBoundary.tsx"],
    },
  },
});

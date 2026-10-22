import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    rolldownOptions: {
      output: {
        // 图表库单独成块：ECharts 只被懒加载的页面用到，但之前它落在多个
        // 页面共享的 aggregate 块里（544 KB），任何业务代码改动都会让这个
        // 大块的哈希失效、用户重下一次完整的图表库。拆出去后业务共享块
        // 只有几十 KB，图表库能长期命中缓存。
        advancedChunks: {
          groups: [
            {
              name: "echarts",
              test: /[\\/]node_modules[\\/](echarts|zrender)[\\/]/,
            },
          ],
        },
      },
    },
  },
});

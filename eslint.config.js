import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // 构建产物、生成代码与依赖不参与检查
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "src-tauri/**",
      "src/generated/**",
      "docs/**",
      // 覆盖率报告是测试产物（含 v8 生成的 js），不是源码
      "coverage/**",
      // 审计/截图临时目录
      "audit-shots/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      sonarjs,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // 认知复杂度：圈复杂度只数分支，不区分嵌套深度。一个 8 层嵌套的
      // if 和 8 个并列 if 圈复杂度相同，但人读起来的难度差一个量级。
      // 15 是 SonarQube 的默认阈值，与已有 complexity≤10 互补。
      "sonarjs/cognitive-complexity": ["error", 15],
      // 本项目未启用 React Compiler（构建链里没有 babel-plugin-react-compiler），
      // 该规则只用于提示「编译器会跳过 memo 化」，此处恒为噪音。
      // TanStack Virtual 的 useVirtualizer 是它唯一命中点。
      "react-hooks/incompatible-library": "off",
      // 未使用变量：忽略以 _ 开头的占位参数
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // 与 tsconfig 的 strict 保持一致，禁止隐式 any
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
      "prefer-const": "error",
      "no-var": "error",
    },
  },
  // 测试文件放宽：允许 any 与非空断言，console 检查关闭
  {
    files: ["**/*.{test,spec}.{ts,tsx}", "src/test/**", "scripts/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  }
);

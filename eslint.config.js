import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
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
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
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

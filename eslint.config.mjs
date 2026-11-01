import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import nextVitals from "eslint-config-next/core-web-vitals";

const webFiles = ["apps/web/**/*.{ts,tsx}"];

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/next-env.d.ts",
      "playwright-report/**",
      "test-results/**",
      "sample-docs/**",
      "supabase/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" }],
      "no-console": "off",
    },
  },
  // Next.js, React hooks and jsx-a11y rules for the web app only.
  ...nextVitals.map((c) => ({ ...c, files: webFiles })),
  {
    files: webFiles,
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    settings: { next: { rootDir: "apps/web" }, react: { version: "19" } },
  },
  {
    files: ["apps/worker/src/executor/snapshot.ts"],
    languageOptions: { globals: { ...globals.browser } },
  },
);

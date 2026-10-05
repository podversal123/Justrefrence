import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    // Server-only code (src/server/**) relies on the `server-only` package,
    // which throws if it detects a browser-like global (`window`) — jsdom
    // defines one, node doesn't. Default to "node"; component tests that
    // need a DOM can opt in per-file with a `// @vitest-environment jsdom`
    // docblock comment at the top of the test file.
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/integration/**/*.test.{ts,tsx}"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    css: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
});

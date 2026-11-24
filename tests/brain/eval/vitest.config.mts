import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Brain eval harness (network + LLM). Not part of `pnpm vitest run`.
 *   CAPTURE=1    pnpm exec vitest run --config tests/brain/eval/vitest.config.ts capture   # freeze golden channels
 *   BRAIN_EVAL=1 pnpm exec vitest run --config tests/brain/eval/vitest.config.ts llm       # run plans + LLM judge
 *                pnpm exec vitest run --config tests/brain/eval/vitest.config.ts agreement # judge vs founder labels
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../../src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/brain/eval/**/*.eval.ts"],
    testTimeout: 900_000,
    hookTimeout: 900_000,
    fileParallelism: false,
  },
});

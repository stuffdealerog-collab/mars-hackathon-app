import { configDefaults, defineConfig } from "vitest/config";

// Agent/session worktrees live under .claude/; never pick up their copies of the tests.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, ".claude/**"],
  },
});

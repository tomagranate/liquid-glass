import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "src/**/*.browser.test.ts",
      "src/**/*.browser.test.tsx",
    ],
    browser: {
      enabled: false,
      provider: "playwright",
      headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
});

import path from "node:path";
import { defineConfig } from "vitest/config";

const root = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(root, "./src"),
      "@convex": path.resolve(root, "./convex"),
    },
  },
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts", "src/lib/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});

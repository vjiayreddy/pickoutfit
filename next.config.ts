import type { NextConfig } from "next";
import { createRequire } from "node:module";
import path from "node:path";
import { withEve } from "eve/next";

const require = createRequire(import.meta.url);
const eveRoot = path.dirname(require.resolve("eve/package.json"));

/** Turbopack treats absolute alias targets as project-relative (`./Users/...`). */
function eveDist(subpath: string): string {
  return `./${path.relative(process.cwd(), path.join(eveRoot, subpath))}`;
}

const nextConfig: NextConfig = {
  // Turbopack often fails to resolve Eve's package.json "exports" subpaths through pnpm.
  transpilePackages: ["eve"],
  turbopack: {
    resolveAlias: {
      "eve/client": eveDist("dist/src/client/index.js"),
      "eve/react": eveDist("dist/src/react/index.js"),
    },
  },
};

/** Mounts the stylist agent in `agent/` on this origin at `/eve/v1/*`. */
export default withEve(nextConfig);

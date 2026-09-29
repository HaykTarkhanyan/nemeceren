// Neon services for the nemeceren project (aged-violet-98333413, branch main).
// Apply from this folder with `neon deploy --no-env-pull` (see README.md). `neon config plan`
// shows what would change first. The CLI finds the repo-root .neon link file by walking up.
//
// Free plan only: do not add aiGateway, buckets, dataApi or triggers here without asking Hayk.
// No function `env` is declared: the function only needs the variables Neon injects
// (DATABASE_URL, NEON_AUTH_BASE_URL, NEON_AUTH_JWKS_URL), so no `--env` file is needed.
//
// Trusted domains for auth are not a neon.ts setting. They are set once with
// `neon neon-auth domain add https://hayktarkhanyan.github.io` (localhost is pre-approved).
import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  auth: true,
  functions: {
    // The slug "api" is permanent: it is part of the invocation URL.
    api: {
      name: "nemeceren progress API",
      source: "src/index.ts",
    },
  },
});

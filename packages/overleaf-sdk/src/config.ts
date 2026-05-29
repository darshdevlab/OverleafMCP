import { z } from "zod";
import { readStoredAuthSync } from "./auth-store.js";
import type { OverleafConfig } from "./types.js";

const envSchema = z.object({
  OVERLEAF_BASE_URL: z.string().url().optional(),
  OVERLEAF_GIT_HOST: z.string().min(1).optional(),
  OVERLEAF_SESSION: z.string().min(1).optional(),
  OVERLEAF_GIT_TOKEN: z.string().min(1).optional(),
  OVERLEAF_EMAIL: z.string().email().optional(),
  OVERLEAF_WORKSPACE_ROOT: z.string().min(1).optional(),
  OVERLEAF_GIT_AUTHOR_NAME: z.string().min(1).optional(),
  OVERLEAF_GIT_AUTHOR_EMAIL: z.string().email().optional()
});

export function loadConfigFromEnv(env: NodeJS.ProcessEnv = process.env): OverleafConfig {
  const parsed = envSchema.parse(env);
  const storedAuth = readStoredAuthSync();
  const sessionCookie = parsed.OVERLEAF_SESSION ?? storedAuth.sessionCookie;
  const hasSession = Boolean(sessionCookie);
  const hasGit = Boolean(parsed.OVERLEAF_GIT_TOKEN);

  const authMode = hasSession && hasGit ? "hybrid" : hasSession ? "session" : hasGit ? "git" : "session";

  return {
    baseUrl: parsed.OVERLEAF_BASE_URL ?? "https://www.overleaf.com",
    gitHost: parsed.OVERLEAF_GIT_HOST ?? "git.overleaf.com",
    workspaceRoot: parsed.OVERLEAF_WORKSPACE_ROOT ?? "/tmp/overleafmcp",
    gitAuthorName: parsed.OVERLEAF_GIT_AUTHOR_NAME ?? "OverleafMCP",
    gitAuthorEmail: parsed.OVERLEAF_GIT_AUTHOR_EMAIL ?? "mcp@overleaf.local",
    authMode,
    credentials: {
      sessionCookie,
      gitToken: parsed.OVERLEAF_GIT_TOKEN,
      gitUsername: parsed.OVERLEAF_EMAIL
    }
  };
}

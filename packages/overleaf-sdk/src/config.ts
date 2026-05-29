import { z } from "zod";
import type { OverleafConfig } from "./types.js";

const envSchema = z.object({
  OVERLEAF_BASE_URL: z.string().url().optional(),
  OVERLEAF_SESSION: z.string().min(1).optional(),
  OVERLEAF_GIT_TOKEN: z.string().min(1).optional(),
  OVERLEAF_EMAIL: z.string().email().optional()
});

export function loadConfigFromEnv(env: NodeJS.ProcessEnv = process.env): OverleafConfig {
  const parsed = envSchema.parse(env);
  const hasSession = Boolean(parsed.OVERLEAF_SESSION);
  const hasGit = Boolean(parsed.OVERLEAF_GIT_TOKEN);

  const authMode = hasSession && hasGit ? "hybrid" : hasSession ? "session" : hasGit ? "git" : "session";

  return {
    baseUrl: parsed.OVERLEAF_BASE_URL ?? "https://www.overleaf.com",
    authMode,
    credentials: {
      sessionCookie: parsed.OVERLEAF_SESSION,
      gitToken: parsed.OVERLEAF_GIT_TOKEN,
      gitUsername: parsed.OVERLEAF_EMAIL
    }
  };
}

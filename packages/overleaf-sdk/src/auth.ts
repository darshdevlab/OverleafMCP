import type { OverleafConfig } from "./types.js";

export interface SecretRedactor {
  redact(value: string): string;
}

export class DefaultSecretRedactor implements SecretRedactor {
  redact(value: string): string {
    if (!value) {
      return value;
    }

    if (value.length <= 8) {
      return "[redacted]";
    }

    return `${value.slice(0, 4)}...[redacted]...${value.slice(-4)}`;
  }
}

export function assertAuthForMode(config: OverleafConfig, required: "session" | "git" | "hybrid"): void {
  const { sessionCookie, gitToken } = config.credentials;

  if (required === "session" && !sessionCookie) {
    throw new Error("This operation requires OVERLEAF_SESSION.");
  }

  if (required === "git" && !gitToken) {
    throw new Error("This operation requires OVERLEAF_GIT_TOKEN.");
  }

  if (required === "hybrid" && (!sessionCookie || !gitToken)) {
    throw new Error("This operation requires both OVERLEAF_SESSION and OVERLEAF_GIT_TOKEN.");
  }
}

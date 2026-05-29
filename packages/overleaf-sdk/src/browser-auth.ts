import path from "node:path";
import os from "node:os";
import { chromium } from "playwright";
import { writeStoredAuth } from "./auth-store.js";

export function browserProfileDir(): string {
  return path.join(os.homedir(), ".overleafmcp", "browser-profile");
}

export async function loginWithBrowser(baseUrl: string, timeoutMs = 5 * 60 * 1000): Promise<string> {
  const context = await chromium.launchPersistentContext(browserProfileDir(), {
    headless: false
  });

  try {
    const page = await context.newPage();
    const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
    await page.goto(`${normalizedBaseUrl}/login`, { waitUntil: "domcontentloaded" });

    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const cookies = await context.cookies();
      const sessionCookie = cookies.find((cookie) => cookie.name === "overleaf_session2")?.value;
      const isAuthenticated = sessionCookie
        ? await isAuthenticatedSession(normalizedBaseUrl, sessionCookie)
        : false;

      if (isAuthenticated && sessionCookie) {
        await writeStoredAuth({
          sessionCookie,
          baseUrl,
          updatedAt: new Date().toISOString()
        });
        return sessionCookie;
      }

      await page.waitForTimeout(1500);
    }

    throw new Error("Timed out waiting for Overleaf login to complete in the browser.");
  } finally {
    await context.close();
  }
}

async function isAuthenticatedSession(baseUrl: string, sessionCookie: string): Promise<boolean> {
  const response = await fetch(`${baseUrl}/project`, {
    headers: {
      Cookie: `overleaf_session2=${sessionCookie}`
    },
    redirect: "follow"
  });

  const finalUrl = response.url;
  const body = await response.text();
  return !finalUrl.includes("/login") && body.includes("ol-prefetchedProjectsBlob");
}

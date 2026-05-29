import path from "node:path";
import os from "node:os";
import { chromium } from "playwright";
import { writeStoredAuth } from "./auth-store.js";

function browserProfileDir(): string {
  return path.join(os.homedir(), ".overleafmcp", "browser-profile");
}

export async function loginWithBrowser(baseUrl: string, timeoutMs = 5 * 60 * 1000): Promise<string> {
  const context = await chromium.launchPersistentContext(browserProfileDir(), {
    headless: false
  });

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(`${baseUrl.replace(/\/$/, "")}/login`, { waitUntil: "domcontentloaded" });

    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const cookies = await context.cookies();
      const sessionCookie = cookies.find((cookie) => cookie.name === "overleaf_session2")?.value;
      if (sessionCookie) {
        await writeStoredAuth({
          sessionCookie,
          baseUrl,
          updatedAt: new Date().toISOString()
        });
        return sessionCookie;
      }

      await page.waitForTimeout(1000);
    }

    throw new Error("Timed out waiting for Overleaf login to complete in the browser.");
  } finally {
    await context.close();
  }
}

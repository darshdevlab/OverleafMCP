import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface StoredAuth {
  sessionCookie?: string;
  updatedAt?: string;
  baseUrl?: string;
}

function authDirectory(): string {
  return path.join(os.homedir(), ".overleafmcp");
}

export function authFilePath(): string {
  return path.join(authDirectory(), "auth.json");
}

export function readStoredAuthSync(): StoredAuth {
  try {
    const raw = fs.readFileSync(authFilePath(), "utf-8");
    return JSON.parse(raw) as StoredAuth;
  } catch {
    return {};
  }
}

export async function writeStoredAuth(auth: StoredAuth): Promise<void> {
  await fs.promises.mkdir(authDirectory(), { recursive: true, mode: 0o700 });
  await fs.promises.writeFile(authFilePath(), JSON.stringify(auth, null, 2), { mode: 0o600 });
}

export async function clearStoredAuth(): Promise<void> {
  try {
    await fs.promises.rm(authFilePath(), { force: true });
  } catch {
    return;
  }
}

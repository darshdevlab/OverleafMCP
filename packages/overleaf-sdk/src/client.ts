import AdmZip from "adm-zip";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertAuthForMode } from "./auth.js";
import type {
  CompileProjectInput,
  CreateFileInput,
  CreateProjectInput,
  DeleteFileInput,
  DownloadPdfInput,
  ListFilesInput,
  OverleafConfig,
  OverleafProjectSummary,
  ReadFileInput,
  SyncProjectInput,
  UpdateFileInput,
  UploadFilesInput,
  UploadProjectArchiveInput
} from "./types.js";

const execFileAsync = promisify(execFile);

interface DashboardProjectBlob {
  projects?: Array<{
    id: string;
    name: string;
    trashed?: boolean;
    archived?: boolean;
  }>;
}

interface DashboardTagBlob {
  _id: string;
  name: string;
  color?: string;
  project_ids?: string[];
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractMetaContent(html: string, metaName: string): string | null {
  const pattern = new RegExp(`<meta[^>]+name=["']${metaName}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i");
  const match = html.match(pattern);
  return match ? decodeHtmlEntities(match[1]) : null;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function copyPath(sourcePath: string, destinationPath: string): Promise<void> {
  const stat = await fs.stat(sourcePath);
  if (stat.isDirectory()) {
    await fs.mkdir(destinationPath, { recursive: true });
    const entries = await fs.readdir(sourcePath);
    for (const entry of entries) {
      await copyPath(path.join(sourcePath, entry), path.join(destinationPath, entry));
    }
    return;
  }

  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.copyFile(sourcePath, destinationPath);
}

async function listFilesRecursively(rootPath: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentPath: string): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".git") {
        continue;
      }

      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        results.push(path.relative(rootPath, fullPath));
      }
    }
  }

  await walk(rootPath);
  return results.sort();
}

async function removeDirectoryContents(rootPath: string): Promise<void> {
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".git") {
      continue;
    }
    await fs.rm(path.join(rootPath, entry.name), { recursive: true, force: true });
  }
}

export class OverleafClient {
  private readonly baseUrl: string;

  constructor(private readonly config: OverleafConfig) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
  }

  async listProjects(): Promise<OverleafProjectSummary[]> {
    assertAuthForMode(this.config, "session");
    const response = await this.fetchWithSession("/");
    const html = await response.text();
    const projectsBlob = extractMetaContent(html, "ol-prefetchedProjectsBlob");
    const tagsBlob = extractMetaContent(html, "ol-tags");

    if (!projectsBlob) {
      throw new Error("Unable to load Overleaf projects. Check OVERLEAF_SESSION.");
    }

    const projectData = JSON.parse(projectsBlob) as DashboardProjectBlob;
    const tags = tagsBlob ? (JSON.parse(tagsBlob) as DashboardTagBlob[]) : [];
    const tagsByProjectId = new Map<string, string[]>();

    for (const tag of tags) {
      for (const projectId of tag.project_ids ?? []) {
        const current = tagsByProjectId.get(projectId) ?? [];
        current.push(tag.name);
        tagsByProjectId.set(projectId, current);
      }
    }

    return (projectData.projects ?? [])
      .filter((project) => !project.trashed && !project.archived)
      .map((project) => ({
        id: project.id,
        name: project.name,
        tags: (tagsByProjectId.get(project.id) ?? []).sort()
      }));
  }

  async createProject(input: CreateProjectInput): Promise<{ projectId: string; warnings?: string[] }> {
    assertAuthForMode(this.config, "session");
    const csrfToken = await this.getDashboardCsrfToken();
    const body = new URLSearchParams();
    body.set("projectName", input.name);
    if (input.templateId) {
      body.set("template", input.templateId);
    }

    const response = await fetch(`${this.baseUrl}/project/new`, {
      method: "POST",
      headers: {
        Cookie: this.cookieHeader(),
        Accept: "application/json",
        "x-csrf-token": csrfToken
      },
      body
    });

    if (!response.ok) {
      throw new Error(`createProject failed with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as { project_id?: string };
    if (!payload.project_id) {
      throw new Error("createProject did not return a project_id.");
    }

    const warnings =
      input.tags && input.tags.length > 0
        ? ["Project tags were requested but are not implemented yet in the TypeScript transport layer."]
        : undefined;

    return { projectId: payload.project_id, warnings };
  }

  async listFiles(input: ListFilesInput): Promise<{ files: string[] }> {
    assertAuthForMode(this.config, "git");
    const repoPath = await this.ensureManagedRepo(input.projectId);
    const files = await listFilesRecursively(repoPath);
    const extension = input.extension;
    return {
      files: extension ? files.filter((filePath) => filePath.endsWith(extension)) : files
    };
  }

  async readFile(input: ReadFileInput): Promise<{ path: string; content: string }> {
    assertAuthForMode(this.config, "git");
    const repoPath = await this.ensureManagedRepo(input.projectId);
    const resolvedPath = this.resolveRepoPath(repoPath, input.path);
    const content = await fs.readFile(resolvedPath, "utf-8");
    return { path: input.path, content };
  }

  async createFile(input: CreateFileInput): Promise<{ path: string; committed: boolean }> {
    assertAuthForMode(this.config, "git");
    const repoPath = await this.ensureManagedRepo(input.projectId);
    const resolvedPath = this.resolveRepoPath(repoPath, input.path);
    if (await exists(resolvedPath)) {
      throw new Error(`File already exists: ${input.path}`);
    }

    await ensureDirectory(path.dirname(resolvedPath));
    await fs.writeFile(resolvedPath, input.content, "utf-8");
    await this.commitAndPush(repoPath, `Create ${input.path}`);
    return { path: input.path, committed: true };
  }

  async updateFile(input: UpdateFileInput): Promise<{ path: string; committed: boolean }> {
    assertAuthForMode(this.config, "git");
    const repoPath = await this.ensureManagedRepo(input.projectId);
    const resolvedPath = this.resolveRepoPath(repoPath, input.path);
    await ensureDirectory(path.dirname(resolvedPath));
    await fs.writeFile(resolvedPath, input.content, "utf-8");
    await this.commitAndPush(repoPath, `Update ${input.path}`);
    return { path: input.path, committed: true };
  }

  async deleteFile(input: DeleteFileInput): Promise<{ path: string; committed: boolean }> {
    assertAuthForMode(this.config, "git");
    const repoPath = await this.ensureManagedRepo(input.projectId);
    const resolvedPath = this.resolveRepoPath(repoPath, input.path);
    await fs.rm(resolvedPath, { force: true, recursive: true });
    await this.commitAndPush(repoPath, `Delete ${input.path}`);
    return { path: input.path, committed: true };
  }

  async uploadFiles(input: UploadFilesInput): Promise<{ uploaded: string[]; committed: boolean }> {
    assertAuthForMode(this.config, "git");
    const repoPath = await this.ensureManagedRepo(input.projectId);
    const uploaded: string[] = [];

    for (const sourcePath of input.paths) {
      const absoluteSource = path.resolve(sourcePath);
      if (!(await exists(absoluteSource))) {
        throw new Error(`Upload source not found: ${sourcePath}`);
      }
      const destination = path.join(repoPath, path.basename(absoluteSource));
      await copyPath(absoluteSource, destination);
      uploaded.push(path.relative(repoPath, destination));
    }

    await this.commitAndPush(repoPath, "Upload project files");
    return { uploaded, committed: true };
  }

  async uploadProjectArchive(input: UploadProjectArchiveInput): Promise<{ projectId: string; projectName: string }> {
    assertAuthForMode(this.config, "hybrid");
    const archivePath = path.resolve(input.archivePath);
    if (!(await exists(archivePath))) {
      throw new Error(`Archive not found: ${input.archivePath}`);
    }

    const projectName = input.projectName ?? path.basename(archivePath, path.extname(archivePath));
    const { projectId } = await this.createProject({ name: projectName });
    const repoPath = await this.ensureManagedRepo(projectId);
    await removeDirectoryContents(repoPath);
    await this.extractArchive(archivePath, repoPath);
    await this.commitAndPush(repoPath, `Upload archive for ${projectName}`);
    return { projectId, projectName };
  }

  async compileProject(input: CompileProjectInput): Promise<{ status: string; outputFiles: unknown[] }> {
    assertAuthForMode(this.config, "session");
    const csrfToken = await this.getProjectCsrfToken(input.projectId);
    const response = await fetch(`${this.baseUrl}/project/${input.projectId}/compile?auto_compile=true`, {
      method: "POST",
      headers: {
        Cookie: this.cookieHeader(),
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        check: "silent",
        draft: false,
        incrementalCompilesEnabled: true,
        stopOnFirstError: false
      })
    });

    if (!response.ok) {
      throw new Error(`compileProject failed with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as { status?: string; outputFiles?: unknown[] };
    return {
      status: payload.status ?? "unknown",
      outputFiles: payload.outputFiles ?? []
    };
  }

  async downloadPdf(input: DownloadPdfInput): Promise<{ outputPath: string }> {
    assertAuthForMode(this.config, "session");
    const compileResult = await this.compileProject({ projectId: input.projectId });
    const outputFile = (compileResult.outputFiles as Array<{ path?: string; url?: string }>).find(
      (file) => file.path === "output.pdf" && typeof file.url === "string"
    );

    if (!outputFile?.url) {
      throw new Error(`No output.pdf returned from compile. Status was ${compileResult.status}.`);
    }

    const pdfUrl = outputFile.url.startsWith("http") ? outputFile.url : `${this.baseUrl}${outputFile.url}`;
    const response = await fetch(pdfUrl, {
      headers: {
        Cookie: this.cookieHeader()
      }
    });

    if (!response.ok) {
      throw new Error(`downloadPdf failed with HTTP ${response.status}`);
    }

    const outputPath = input.outputPath
      ? path.resolve(input.outputPath)
      : path.join(os.tmpdir(), `${input.projectId}-output.pdf`);
    await ensureDirectory(path.dirname(outputPath));
    const pdfBytes = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(outputPath, pdfBytes);
    return { outputPath };
  }

  async syncPull(input: SyncProjectInput): Promise<{ localPath: string }> {
    assertAuthForMode(this.config, "git");
    const localPath = path.resolve(input.localPath);
    const gitDir = path.join(localPath, ".git");
    await ensureDirectory(path.dirname(localPath));

    if (await exists(gitDir)) {
      await this.configureLocalGitRemote(localPath, input.projectId);
      await this.runGit(["-C", localPath, "pull", "--ff-only"]);
      return { localPath };
    }

    if (await exists(localPath)) {
      const entries = await fs.readdir(localPath);
      if (entries.length > 0) {
        throw new Error(`syncPull target must be empty or a git repository: ${localPath}`);
      }
    } else {
      await ensureDirectory(localPath);
    }

    await this.runGit(["clone", this.gitRemoteUrl(input.projectId), localPath]);
    await this.configureGitIdentity(localPath);
    return { localPath };
  }

  async syncPush(input: SyncProjectInput): Promise<{ localPath: string; pushed: boolean }> {
    assertAuthForMode(this.config, "git");
    const localPath = path.resolve(input.localPath);
    const gitDir = path.join(localPath, ".git");
    if (!(await exists(gitDir))) {
      throw new Error(`syncPush requires a local git repository at ${localPath}`);
    }

    await this.configureLocalGitRemote(localPath, input.projectId);
    await this.configureGitIdentity(localPath);
    const status = await this.runGit(["-C", localPath, "status", "--porcelain"]);
    if (!status.stdout.trim()) {
      return { localPath, pushed: false };
    }

    await this.runGit(["-C", localPath, "add", "-A"]);
    await this.runGit(["-C", localPath, "commit", "-m", "Sync changes from OverleafMCP"]);
    await this.runGit(["-C", localPath, "push", "origin", "HEAD"]);
    return { localPath, pushed: true };
  }

  private async fetchWithSession(resourcePath: string): Promise<Response> {
    const response = await fetch(`${this.baseUrl}${resourcePath}`, {
      headers: {
        Cookie: this.cookieHeader()
      },
      redirect: "follow"
    });

    if (!response.ok) {
      throw new Error(`Request failed for ${resourcePath} with HTTP ${response.status}`);
    }

    return response;
  }

  private cookieHeader(): string {
    const sessionCookie = this.config.credentials.sessionCookie;
    if (!sessionCookie) {
      throw new Error("OVERLEAF_SESSION is required.");
    }
    return `overleaf_session2=${sessionCookie}`;
  }

  private async getDashboardCsrfToken(): Promise<string> {
    const response = await this.fetchWithSession("/");
    const html = await response.text();
    const csrfToken = extractMetaContent(html, "ol-csrfToken");
    if (!csrfToken) {
      throw new Error("Unable to find dashboard CSRF token.");
    }
    return csrfToken;
  }

  private async getProjectCsrfToken(projectId: string): Promise<string> {
    const response = await this.fetchWithSession(`/project/${projectId}`);
    const html = await response.text();
    const csrfToken = extractMetaContent(html, "ol-csrfToken");
    if (!csrfToken) {
      throw new Error(`Unable to find CSRF token for project ${projectId}.`);
    }
    return csrfToken;
  }

  private async ensureManagedRepo(projectId: string): Promise<string> {
    const repoPath = path.join(this.config.workspaceRoot, "repos", projectId);
    const gitDir = path.join(repoPath, ".git");
    await ensureDirectory(path.dirname(repoPath));

    if (await exists(gitDir)) {
      await this.configureLocalGitRemote(repoPath, projectId);
      await this.configureGitIdentity(repoPath);
      await this.runGit(["-C", repoPath, "pull", "--ff-only"]);
      return repoPath;
    }

    await this.runGit(["clone", this.gitRemoteUrl(projectId), repoPath]);
    await this.configureGitIdentity(repoPath);
    return repoPath;
  }

  private async configureLocalGitRemote(repoPath: string, projectId: string): Promise<void> {
    await this.runGit(["-C", repoPath, "remote", "set-url", "origin", this.gitRemoteUrl(projectId)]);
  }

  private gitRemoteUrl(projectId: string): string {
    const token = this.config.credentials.gitToken;
    if (!token) {
      throw new Error("OVERLEAF_GIT_TOKEN is required.");
    }
    return `https://git:${token}@${this.config.gitHost}/${projectId}`;
  }

  private async configureGitIdentity(repoPath: string): Promise<void> {
    await this.runGit(["-C", repoPath, "config", "user.name", this.config.gitAuthorName]);
    await this.runGit(["-C", repoPath, "config", "user.email", this.config.gitAuthorEmail]);
  }

  private async commitAndPush(repoPath: string, message: string): Promise<void> {
    await this.configureGitIdentity(repoPath);
    await this.runGit(["-C", repoPath, "add", "-A"]);
    const status = await this.runGit(["-C", repoPath, "status", "--porcelain"]);
    if (!status.stdout.trim()) {
      return;
    }
    await this.runGit(["-C", repoPath, "commit", "-m", message]);
    await this.runGit(["-C", repoPath, "push", "origin", "HEAD"]);
  }

  private async extractArchive(archivePath: string, destinationRoot: string): Promise<void> {
    const zip = new AdmZip(archivePath);
    for (const entry of zip.getEntries()) {
      const entryPath = path.normalize(entry.entryName);
      const destination = path.resolve(destinationRoot, entryPath);
      if (!destination.startsWith(path.resolve(destinationRoot))) {
        throw new Error(`Unsafe zip entry detected: ${entry.entryName}`);
      }

      if (entry.isDirectory) {
        await ensureDirectory(destination);
        continue;
      }

      await ensureDirectory(path.dirname(destination));
      await fs.writeFile(destination, entry.getData());
    }
  }

  private resolveRepoPath(repoPath: string, relativePath: string): string {
    const resolvedPath = path.resolve(repoPath, relativePath);
    if (!resolvedPath.startsWith(path.resolve(repoPath))) {
      throw new Error(`Path escapes repository root: ${relativePath}`);
    }
    return resolvedPath;
  }

  private async runGit(args: string[]): Promise<{ stdout: string; stderr: string }> {
    try {
      return await execFileAsync("git", args, { maxBuffer: 10 * 1024 * 1024 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`git ${args.join(" ")} failed: ${message}`);
    }
  }
}

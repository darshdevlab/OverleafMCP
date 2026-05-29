import AdmZip from "adm-zip";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "playwright";
import type { Page } from "playwright";
import WebSocket, { RawData } from "ws";
import { assertAuthForMode } from "./auth.js";
import { clearStoredAuth } from "./auth-store.js";
import { browserProfileDir, loginWithBrowser } from "./browser-auth.js";
import type {
  AssignProjectTagsInput,
  CloneProjectInput,
  CompileProjectInput,
  CreateFileInput,
  CreateProjectInput,
  CreateTagInput,
  DeleteFileInput,
  DeleteProjectInput,
  DeleteTagInput,
  DownloadPdfInput,
  EditTagInput,
  ListFilesInput,
  OverleafConfig,
  OverleafProjectSummary,
  OverleafTagSummary,
  ReadFileInput,
  RemoveProjectTagsInput,
  SyncProjectInput,
  UpdateFileInput,
  UploadFilesInput,
  UploadProjectArchiveInput
} from "./types.js";

const execFileAsync = promisify(execFile);

type ProjectEntityType = "folder" | "file" | "doc";

interface ProjectTreeFolder {
  _id: string;
  name: string;
  folders: ProjectTreeFolder[];
  fileRefs: ProjectTreeFile[];
  docs: ProjectTreeFile[];
}

interface ProjectTreeFile {
  _id: string;
  name: string;
}

interface ProjectEntity {
  id: string;
  name: string;
  type: ProjectEntityType;
  path: string;
  parentFolderId: string | null;
}

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

function websocketBaseUrl(baseUrl: string): string {
  return normalizeBaseUrl(baseUrl).replace(/^http:/, "ws:").replace(/^https:/, "wss:");
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

function flattenProjectTree(root: ProjectTreeFolder): ProjectEntity[] {
  const entities: ProjectEntity[] = [];

  function walk(folder: ProjectTreeFolder, parentPath: string, parentFolderId: string | null): void {
    for (const childFolder of folder.folders ?? []) {
      const childPath = parentPath ? `${parentPath}/${childFolder.name}` : childFolder.name;
      entities.push({
        id: childFolder._id,
        name: childFolder.name,
        type: "folder",
        path: childPath,
        parentFolderId: folder._id ?? parentFolderId
      });
      walk(childFolder, childPath, childFolder._id);
    }

    for (const fileRef of folder.fileRefs ?? []) {
      const childPath = parentPath ? `${parentPath}/${fileRef.name}` : fileRef.name;
      entities.push({
        id: fileRef._id,
        name: fileRef.name,
        type: "file",
        path: childPath,
        parentFolderId: folder._id ?? parentFolderId
      });
    }

    for (const doc of folder.docs ?? []) {
      const childPath = parentPath ? `${parentPath}/${doc.name}` : doc.name;
      entities.push({
        id: doc._id,
        name: doc.name,
        type: "doc",
        path: childPath,
        parentFolderId: folder._id ?? parentFolderId
      });
    }
  }

  walk(root, "", root._id ?? null);
  return entities.sort((left, right) => left.path.localeCompare(right.path));
}

export class OverleafClient {
  private readonly baseUrl: string;

  constructor(private readonly config: OverleafConfig) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
  }

  async authStatus(): Promise<{
    baseUrl: string;
    sessionAuthenticated: boolean;
    gitAuthenticated: boolean;
    sessionMode: "browser-or-env" | "not-configured";
  }> {
    return {
      baseUrl: this.baseUrl,
      sessionAuthenticated: Boolean(this.config.credentials.sessionCookie),
      gitAuthenticated: Boolean(this.config.credentials.gitToken),
      sessionMode: this.config.credentials.sessionCookie ? "browser-or-env" : "not-configured"
    };
  }

  async authLogin(): Promise<{ sessionAuthenticated: true }> {
    const sessionCookie = await loginWithBrowser(this.baseUrl);
    this.config.credentials.sessionCookie = sessionCookie;
    return { sessionAuthenticated: true };
  }

  async authLogout(): Promise<{ sessionAuthenticated: false }> {
    await clearStoredAuth();
    this.config.credentials.sessionCookie = undefined;
    return { sessionAuthenticated: false };
  }

  async listProjects(): Promise<OverleafProjectSummary[]> {
    assertAuthForMode(this.config, "session");
    const { projectData, tags } = await this.getDashboardData();

    return (projectData.projects ?? [])
      .filter((project) => !project.trashed && !project.archived)
      .map((project) => ({
        id: project.id,
        name: project.name,
        tags: tags.filter((tag) => (tag.project_ids ?? []).includes(project.id)).map((tag) => tag.name).sort()
      }));
  }

  async listTags(): Promise<OverleafTagSummary[]> {
    assertAuthForMode(this.config, "session");
    const tags = await this.getTags();
    return tags.map((tag) => ({
      id: tag._id,
      name: tag.name,
      color: tag.color,
      projectIds: [...(tag.project_ids ?? [])].sort()
    }));
  }

  async createTag(input: CreateTagInput): Promise<OverleafTagSummary> {
    assertAuthForMode(this.config, "session");
    const tag = await this.createTagRecord(input.name, input.color);
    return this.toTagSummary(tag);
  }

  async editTag(input: EditTagInput): Promise<{ tagId: string; updated: true }> {
    assertAuthForMode(this.config, "session");
    const csrfToken = await this.getDashboardCsrfToken();
    const response = await fetch(`${this.baseUrl}/tag/${input.tagId}/edit`, {
      method: "POST",
      headers: {
        Cookie: this.cookieHeader(),
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        name: input.name,
        color: input.color
      })
    });

    if (!response.ok) {
      throw new Error(`editTag failed with HTTP ${response.status}`);
    }

    return { tagId: input.tagId, updated: true };
  }

  async deleteTag(input: DeleteTagInput): Promise<{ tagId: string; deleted: true }> {
    assertAuthForMode(this.config, "session");
    const csrfToken = await this.getDashboardCsrfToken();
    const response = await fetch(`${this.baseUrl}/tag/${input.tagId}`, {
      method: "DELETE",
      headers: {
        Cookie: this.cookieHeader(),
        Accept: "application/json",
        "x-csrf-token": csrfToken
      }
    });

    if (!response.ok) {
      throw new Error(`deleteTag failed with HTTP ${response.status}`);
    }

    return { tagId: input.tagId, deleted: true };
  }

  async assignProjectTags(input: AssignProjectTagsInput): Promise<{ projectId: string; tagIds: string[] }> {
    assertAuthForMode(this.config, "session");
    const tagIds = await this.resolveTagIds(input.tags);
    await this.addProjectToTagIds(input.projectId, tagIds);
    return { projectId: input.projectId, tagIds };
  }

  async removeProjectTags(input: RemoveProjectTagsInput): Promise<{ projectId: string; removedTagIds: string[] }> {
    assertAuthForMode(this.config, "session");
    const existingTags = await this.getTags();
    const tagIds = new Set<string>();

    for (const tagId of input.tagIds ?? []) {
      tagIds.add(tagId);
    }

    for (const tagName of input.tagNames ?? []) {
      const tag = existingTags.find((candidate) => candidate.name === tagName);
      if (tag) {
        tagIds.add(tag._id);
      }
    }

    const removedTagIds: string[] = [];
    for (const tagId of tagIds) {
      await this.removeProjectFromTag(tagId, input.projectId);
      removedTagIds.push(tagId);
    }

    return { projectId: input.projectId, removedTagIds: removedTagIds.sort() };
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

    if (input.tags && input.tags.length > 0) {
      await this.assignProjectTags({ projectId: payload.project_id, tags: input.tags });
    }

    return { projectId: payload.project_id };
  }

  async cloneProject(input: CloneProjectInput): Promise<{ projectId: string; name: string }> {
    assertAuthForMode(this.config, "session");
    const csrfToken = await this.getDashboardCsrfToken();
    const tagIds = input.tags && input.tags.length > 0 ? await this.resolveTagIds(input.tags) : [];
    const response = await fetch(`${this.baseUrl}/Project/${input.projectId}/clone`, {
      method: "POST",
      headers: {
        Cookie: this.cookieHeader(),
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        projectName: input.projectName,
        tags: tagIds.map((id) => ({ id }))
      })
    });

    if (!response.ok) {
      throw new Error(`cloneProject failed with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as { project_id?: string; name?: string };
    if (!payload.project_id) {
      throw new Error("cloneProject did not return a project_id.");
    }

    return {
      projectId: payload.project_id,
      name: payload.name ?? input.projectName
    };
  }

  async listFiles(input: ListFilesInput): Promise<{ files: string[] }> {
    if (this.hasGitToken()) {
      const repoPath = await this.ensureManagedRepo(input.projectId);
      const files = await listFilesRecursively(repoPath);
      const extension = input.extension;
      return { files: extension ? files.filter((filePath) => filePath.endsWith(extension)) : files };
    }

    assertAuthForMode(this.config, "session");
    const files = await this.getProjectEntities(input.projectId);
    const extension = input.extension;
    return { files: extension ? files.filter((filePath) => filePath.endsWith(extension)) : files };
  }

  async readFile(input: ReadFileInput): Promise<{ path: string; content: string }> {
    if (this.hasGitToken()) {
      const repoPath = await this.ensureManagedRepo(input.projectId);
      const resolvedPath = this.resolveRepoPath(repoPath, input.path);
      const content = await fs.readFile(resolvedPath, "utf-8");
      return { path: input.path, content };
    }

    assertAuthForMode(this.config, "session");
    const zip = await this.downloadProjectZip(input.projectId);
    const entry = zip.getEntry(input.path);
    if (!entry) {
      throw new Error(`File not found in project archive: ${input.path}`);
    }
    return { path: input.path, content: entry.getData().toString("utf-8") };
  }

  async createFile(input: CreateFileInput): Promise<{ path: string; committed: boolean }> {
    if (this.hasGitToken()) {
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

    assertAuthForMode(this.config, "session");
    await this.sessionCreateOrUpdateFile(input.projectId, input.path, input.content, false);
    return { path: input.path, committed: true };
  }

  async updateFile(input: UpdateFileInput): Promise<{ path: string; committed: boolean }> {
    if (this.hasGitToken()) {
      const repoPath = await this.ensureManagedRepo(input.projectId);
      const resolvedPath = this.resolveRepoPath(repoPath, input.path);
      await ensureDirectory(path.dirname(resolvedPath));
      await fs.writeFile(resolvedPath, input.content, "utf-8");
      await this.commitAndPush(repoPath, `Update ${input.path}`);
      return { path: input.path, committed: true };
    }

    assertAuthForMode(this.config, "session");
    await this.browserUpdateTextFile(input.projectId, input.path, input.content);
    return { path: input.path, committed: true };
  }

  async deleteFile(input: DeleteFileInput): Promise<{ path: string; committed: boolean }> {
    if (this.hasGitToken()) {
      const repoPath = await this.ensureManagedRepo(input.projectId);
      const resolvedPath = this.resolveRepoPath(repoPath, input.path);
      await fs.rm(resolvedPath, { force: true, recursive: true });
      await this.commitAndPush(repoPath, `Delete ${input.path}`);
      return { path: input.path, committed: true };
    }

    assertAuthForMode(this.config, "session");
    const tree = await this.getProjectTree(input.projectId);
    const entity = flattenProjectTree(tree).find((candidate) => candidate.path === input.path);
    if (!entity || entity.type === "folder") {
      throw new Error(`File not found: ${input.path}`);
    }
    await this.deleteEntity(input.projectId, entity.id, entity.type);
    return { path: input.path, committed: true };
  }

  async uploadFiles(input: UploadFilesInput): Promise<{ uploaded: string[]; committed: boolean }> {
    if (this.hasGitToken()) {
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

    assertAuthForMode(this.config, "session");
    const uploaded: string[] = [];
    const tree = await this.getProjectTree(input.projectId);
    const rootFolderId = tree._id;
    for (const sourcePath of input.paths) {
      const absoluteSource = path.resolve(sourcePath);
      if (!(await exists(absoluteSource))) {
        throw new Error(`Upload source not found: ${sourcePath}`);
      }
      const uploadedPaths = await this.uploadLocalPathToProject(input.projectId, absoluteSource, rootFolderId, "");
      uploaded.push(...uploadedPaths);
    }
    return { uploaded, committed: true };
  }

  async uploadProjectArchive(input: UploadProjectArchiveInput): Promise<{ projectId: string; projectName: string }> {
    assertAuthForMode(this.config, "session");
    const archivePath = path.resolve(input.archivePath);
    if (!(await exists(archivePath))) {
      throw new Error(`Archive not found: ${input.archivePath}`);
    }

    const projectName = input.projectName ?? path.basename(archivePath, path.extname(archivePath));
    if (!this.hasGitToken()) {
      return await this.uploadProjectArchiveDirect(archivePath, projectName);
    }

    const { projectId } = await this.createProject({ name: projectName });
    const repoPath = await this.ensureManagedRepo(projectId);
    await removeDirectoryContents(repoPath);
    await this.extractArchive(archivePath, repoPath);
    await this.commitAndPush(repoPath, `Upload archive for ${projectName}`);
    return { projectId, projectName };
  }

  async deleteProject(input: DeleteProjectInput): Promise<{ projectId: string; deleted: true }> {
    assertAuthForMode(this.config, "session");
    const csrfToken = await this.getProjectCsrfToken(input.projectId);
    const trashResponse = await fetch(`${this.baseUrl}/project/${input.projectId}/trash`, {
      method: "POST",
      headers: {
        Cookie: this.cookieHeader(),
        Accept: "application/json",
        "x-csrf-token": csrfToken
      }
    });

    if (!trashResponse.ok) {
      throw new Error(`deleteProject trash step failed with HTTP ${trashResponse.status}`);
    }

    const deleteResponse = await fetch(`${this.baseUrl}/Project/${input.projectId}`, {
      method: "DELETE",
      headers: {
        Cookie: this.cookieHeader(),
        Accept: "application/json",
        "x-csrf-token": csrfToken
      }
    });

    if (!deleteResponse.ok) {
      throw new Error(`deleteProject failed with HTTP ${deleteResponse.status}`);
    }

    return { projectId: input.projectId, deleted: true };
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

  private hasGitToken(): boolean {
    return Boolean(this.config.credentials.gitToken);
  }

  private async sessionCreateOrUpdateFile(
    projectId: string,
    filePath: string,
    content: string,
    overwrite: boolean
  ): Promise<void> {
    const tree = await this.getProjectTree(projectId);
    const entities = flattenProjectTree(tree);
    const existing = entities.find((candidate) => candidate.path === filePath);
    if (existing && existing.type === "folder") {
      throw new Error(`A folder already exists at ${filePath}`);
    }
    if (existing && !overwrite) {
      throw new Error(`File already exists: ${filePath}`);
    }
    if (!existing && overwrite) {
      throw new Error(`File does not exist: ${filePath}`);
    }
    if (existing) {
      await this.deleteEntity(projectId, existing.id, existing.type);
    }

    const parentPath = path.posix.dirname(filePath) === "." ? "" : path.posix.dirname(filePath);
    const parentFolderId = await this.ensureProjectFolder(projectId, tree, parentPath);
    await this.uploadBufferToFolder(projectId, parentFolderId, path.posix.basename(filePath), Buffer.from(content, "utf-8"));
  }

  private async uploadLocalPathToProject(
    projectId: string,
    sourcePath: string,
    parentFolderId: string,
    prefix: string
  ): Promise<string[]> {
    const stat = await fs.stat(sourcePath);
    if (stat.isFile()) {
      const content = await fs.readFile(sourcePath);
      const uploadedPath = prefix ? `${prefix}/${path.basename(sourcePath)}` : path.basename(sourcePath);
      await this.uploadBufferToFolder(projectId, parentFolderId, path.basename(sourcePath), content);
      return [uploadedPath];
    }

    const folderName = path.basename(sourcePath);
    const nextPrefix = prefix ? `${prefix}/${folderName}` : folderName;
    const createdFolderId = await this.createFolder(projectId, parentFolderId, folderName);
    const entries = await fs.readdir(sourcePath);
    const uploaded: string[] = [];
    for (const entry of entries) {
      const childUploaded = await this.uploadLocalPathToProject(
        projectId,
        path.join(sourcePath, entry),
        createdFolderId,
        nextPrefix
      );
      uploaded.push(...childUploaded);
    }
    return uploaded;
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
      throw new Error("No Overleaf session is configured. Use browser login first.");
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

  private async getDashboardData(): Promise<{ projectData: DashboardProjectBlob; tags: DashboardTagBlob[] }> {
    const response = await this.fetchWithSession("/");
    const html = await response.text();
    const projectsBlob = extractMetaContent(html, "ol-prefetchedProjectsBlob");
    const tagsBlob = extractMetaContent(html, "ol-tags");

    if (!projectsBlob) {
      throw new Error("Unable to load Overleaf projects. Check session authentication.");
    }

    return {
      projectData: JSON.parse(projectsBlob) as DashboardProjectBlob,
      tags: tagsBlob ? (JSON.parse(tagsBlob) as DashboardTagBlob[]) : []
    };
  }

  private async getTags(): Promise<DashboardTagBlob[]> {
    const response = await fetch(`${this.baseUrl}/tag`, {
      headers: {
        Cookie: this.cookieHeader(),
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`getTags failed with HTTP ${response.status}`);
    }

    return (await response.json()) as DashboardTagBlob[];
  }

  private async createTagRecord(name: string, color?: string): Promise<DashboardTagBlob> {
    const csrfToken = await this.getDashboardCsrfToken();
    const response = await fetch(`${this.baseUrl}/tag`, {
      method: "POST",
      headers: {
        Cookie: this.cookieHeader(),
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({ name, color })
    });

    if (!response.ok) {
      throw new Error(`createTag failed with HTTP ${response.status}`);
    }

    return (await response.json()) as DashboardTagBlob;
  }

  private async resolveTagIds(
    tags: Array<{
      id?: string;
      name?: string;
      color?: string;
    }>
  ): Promise<string[]> {
    const existingTags = await this.getTags();
    const resolvedTagIds = new Set<string>();

    for (const tag of tags) {
      if (tag.id) {
        resolvedTagIds.add(tag.id);
        continue;
      }

      if (!tag.name) {
        throw new Error("Each tag reference must include either an id or a name.");
      }

      const existing = existingTags.find((candidate) => candidate.name === tag.name);
      if (existing) {
        resolvedTagIds.add(existing._id);
        continue;
      }

      const created = await this.createTagRecord(tag.name, tag.color);
      resolvedTagIds.add(created._id);
    }

    return [...resolvedTagIds].sort();
  }

  private async addProjectToTagIds(projectId: string, tagIds: string[]): Promise<void> {
    if (tagIds.length === 0) {
      return;
    }

    const csrfToken = await this.getDashboardCsrfToken();
    for (const tagId of tagIds) {
      const response = await fetch(`${this.baseUrl}/tag/${tagId}/projects`, {
        method: "POST",
        headers: {
          Cookie: this.cookieHeader(),
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken
        },
        body: JSON.stringify({
          projectIds: [projectId]
        })
      });

      if (!response.ok) {
        throw new Error(`assignProjectTags failed with HTTP ${response.status} for tag ${tagId}`);
      }
    }
  }

  private async removeProjectFromTag(tagId: string, projectId: string): Promise<void> {
    const csrfToken = await this.getDashboardCsrfToken();
    const response = await fetch(`${this.baseUrl}/tag/${tagId}/project/${projectId}`, {
      method: "DELETE",
      headers: {
        Cookie: this.cookieHeader(),
        Accept: "application/json",
        "x-csrf-token": csrfToken
      }
    });

    if (!response.ok) {
      throw new Error(`removeProjectFromTag failed with HTTP ${response.status} for tag ${tagId}`);
    }
  }

  private toTagSummary(tag: DashboardTagBlob): OverleafTagSummary {
    return {
      id: tag._id,
      name: tag.name,
      color: tag.color,
      projectIds: [...(tag.project_ids ?? [])].sort()
    };
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

  private async getProjectEntities(projectId: string): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/project/${projectId}/entities`, {
      headers: {
        Cookie: this.cookieHeader(),
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`getProjectEntities failed with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as { entities?: Array<{ path?: string; type?: string }> };
    return (payload.entities ?? [])
      .filter((entity) => entity.type === "doc" || entity.type === "file")
      .map((entity) => entity.path ?? "")
      .filter(Boolean)
      .sort();
  }

  private async getProjectTree(projectId: string): Promise<ProjectTreeFolder> {
    const handshakeResponse = await this.fetchWithSession(`/socket.io/1/?projectId=${projectId}&t=${Date.now()}`);
    const handshakeText = await handshakeResponse.text();
    const socketId = handshakeText.split(":")[0];
    if (!socketId) {
      throw new Error("Unable to establish Overleaf project socket session.");
    }

    const wsUrl = `${websocketBaseUrl(this.baseUrl)}/socket.io/1/websocket/${socketId}?projectId=${projectId}`;

    return await new Promise<ProjectTreeFolder>((resolve, reject) => {
      const socket = new WebSocket(wsUrl, {
        headers: {
          Cookie: this.cookieHeader()
        }
      });

      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error("Timed out waiting for Overleaf project tree."));
      }, 30000);

      socket.on("message", (message: RawData) => {
        const text = message.toString();
        if (text.startsWith("7:")) {
          clearTimeout(timeout);
          socket.close();
          reject(new Error("Overleaf project socket authentication failed."));
          return;
        }

        if (!text.startsWith("5:")) {
          return;
        }

        try {
          const parsed = JSON.parse(text.slice(2).replace(/^:+/, "")) as {
            name?: string;
            args?: Array<{ project?: { rootFolder?: ProjectTreeFolder[] } }>;
          };

          if (parsed.name !== "joinProjectResponse") {
            return;
          }

          const rootFolder = parsed.args?.[0]?.project?.rootFolder?.[0];
          if (!rootFolder) {
            throw new Error("Project tree response did not include a root folder.");
          }

          clearTimeout(timeout);
          socket.close();
          resolve(rootFolder);
        } catch (error) {
          clearTimeout(timeout);
          socket.close();
          reject(error);
        }
      });

      socket.on("error", (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private async createFolder(projectId: string, parentFolderId: string, name: string): Promise<string> {
    const csrfToken = await this.getProjectCsrfToken(projectId);
    const response = await fetch(`${this.baseUrl}/project/${projectId}/folder`, {
      method: "POST",
      headers: {
        Cookie: this.cookieHeader(),
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        parent_folder_id: parentFolderId,
        name
      })
    });

    if (!response.ok) {
      throw new Error(`createFolder failed with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as { _id?: string };
    if (!payload._id) {
      throw new Error(`createFolder did not return an entity id for ${name}`);
    }
    return payload._id;
  }

  private async uploadBufferToFolder(
    projectId: string,
    folderId: string,
    fileName: string,
    fileContent: Buffer
  ): Promise<void> {
    const csrfToken = await this.getProjectCsrfToken(projectId);
    const form = new FormData();
    form.set("relativePath", "null");
    form.set("name", fileName);
    form.set("type", "application/octet-stream");
    form.set("qqfile", new Blob([fileContent]), fileName);

    const response = await fetch(`${this.baseUrl}/project/${projectId}/upload?folder_id=${folderId}`, {
      method: "POST",
      headers: {
        Cookie: this.cookieHeader(),
        Accept: "application/json",
        "x-csrf-token": csrfToken
      },
      body: form
    });

    if (!response.ok) {
      throw new Error(`uploadBufferToFolder failed with HTTP ${response.status}`);
    }
  }

  private async deleteEntity(projectId: string, entityId: string, entityType: ProjectEntityType): Promise<void> {
    const csrfToken = await this.getProjectCsrfToken(projectId);
    const response = await fetch(`${this.baseUrl}/project/${projectId}/${entityType}/${entityId}`, {
      method: "DELETE",
      headers: {
        Cookie: this.cookieHeader(),
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({})
    });

    if (!response.ok) {
      throw new Error(`deleteEntity failed with HTTP ${response.status}`);
    }
  }

  private async ensureProjectFolder(projectId: string, tree: ProjectTreeFolder, folderPath: string): Promise<string> {
    if (!folderPath) {
      return tree._id;
    }

    const segments = folderPath.split("/").filter(Boolean);
    let currentFolder = tree;

    for (const segment of segments) {
      const nextFolder = (currentFolder.folders ?? []).find((folder) => folder.name === segment);
      if (nextFolder) {
        currentFolder = nextFolder;
        continue;
      }

      const newFolderId = await this.createFolder(projectId, currentFolder._id, segment);
      const createdFolder: ProjectTreeFolder = {
        _id: newFolderId,
        name: segment,
        folders: [],
        fileRefs: [],
        docs: []
      };
      currentFolder.folders = currentFolder.folders ?? [];
      currentFolder.folders.push(createdFolder);
      currentFolder = createdFolder;
    }

    return currentFolder._id;
  }

  private async downloadProjectZip(projectId: string): Promise<AdmZip> {
    const response = await fetch(`${this.baseUrl}/project/${projectId}/download/zip`, {
      headers: {
        Cookie: this.cookieHeader()
      }
    });

    if (!response.ok) {
      throw new Error(`downloadProjectZip failed with HTTP ${response.status}`);
    }

    return new AdmZip(Buffer.from(await response.arrayBuffer()));
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
      throw new Error("OVERLEAF_GIT_TOKEN is required for Git-based operations.");
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

  private async uploadProjectArchiveDirect(
    archivePath: string,
    projectName: string
  ): Promise<{ projectId: string; projectName: string }> {
    const csrfToken = await this.getDashboardCsrfToken();
    const form = new FormData();
    form.set("name", projectName);
    form.set("qqfile", new Blob([await fs.readFile(archivePath)]), path.basename(archivePath));

    const response = await fetch(`${this.baseUrl}/project/new/upload`, {
      method: "POST",
      headers: {
        Cookie: this.cookieHeader(),
        Accept: "application/json",
        "x-csrf-token": csrfToken
      },
      body: form
    });

    if (!response.ok) {
      throw new Error(`uploadProjectArchiveDirect failed with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as { success?: boolean; project_id?: string; error?: string };
    if (!payload.success || !payload.project_id) {
      throw new Error(`uploadProjectArchiveDirect did not return a project_id${payload.error ? `: ${payload.error}` : "."}`);
    }

    return { projectId: payload.project_id, projectName };
  }

  private async browserUpdateTextFile(projectId: string, filePath: string, content: string): Promise<void> {
    const context = await chromium.launchPersistentContext(browserProfileDir(), {
      headless: true
    });

    try {
      const page = await context.newPage();
      await page.goto(`${this.baseUrl}/project/${projectId}`, {
        waitUntil: "domcontentloaded",
        timeout: 120000
      });
      await page.waitForTimeout(8000);
      await this.openProjectFileInBrowser(page, filePath);
      await page.waitForTimeout(1500);
      await page.click(".cm-content");
      await page.keyboard.press("Meta+A");
      await page.keyboard.insertText(content);
      await page.waitForTimeout(8000);
    } finally {
      await context.close();
    }
  }

  private async openProjectFileInBrowser(page: Page, filePath: string): Promise<void> {
    const normalizedPath = filePath.replace(/^\/+/, "");
    const segments = normalizedPath.split("/").filter(Boolean);
    if (segments.length === 0) {
      throw new Error(`Invalid file path: ${filePath}`);
    }

    for (const folderName of segments.slice(0, -1)) {
      const folderButton = page.locator("button").filter({ hasText: folderName }).first();
      const textContent = await folderButton.textContent();
      if (textContent?.includes("chevron_right")) {
        await folderButton.click();
        await page.waitForTimeout(500);
      }
    }

    await page.getByText(segments.at(-1) ?? normalizedPath, { exact: true }).first().click();
  }
}

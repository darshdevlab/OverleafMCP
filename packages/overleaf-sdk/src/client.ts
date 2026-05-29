import { assertAuthForMode } from "./auth.js";
import type {
  CompileProjectInput,
  CreateFileInput,
  CreateProjectInput,
  DeleteFileInput,
  DownloadPdfInput,
  OverleafConfig,
  OverleafProjectSummary,
  SyncProjectInput,
  UpdateFileInput,
  UploadFilesInput,
  UploadProjectArchiveInput
} from "./types.js";

function notImplemented(operation: string): never {
  throw new Error(
    `${operation} is not implemented yet. The public SDK contract is in place, but the Overleaf transport adapter still needs to be built.`
  );
}

export class OverleafClient {
  constructor(private readonly config: OverleafConfig) {}

  async listProjects(): Promise<OverleafProjectSummary[]> {
    assertAuthForMode(this.config, "session");
    return notImplemented("listProjects");
  }

  async createProject(_input: CreateProjectInput): Promise<{ projectId: string }> {
    assertAuthForMode(this.config, "session");
    return notImplemented("createProject");
  }

  async createFile(_input: CreateFileInput): Promise<void> {
    assertAuthForMode(this.config, "git");
    return notImplemented("createFile");
  }

  async updateFile(_input: UpdateFileInput): Promise<void> {
    assertAuthForMode(this.config, "git");
    return notImplemented("updateFile");
  }

  async deleteFile(_input: DeleteFileInput): Promise<void> {
    assertAuthForMode(this.config, "git");
    return notImplemented("deleteFile");
  }

  async uploadFiles(_input: UploadFilesInput): Promise<void> {
    assertAuthForMode(this.config, "session");
    return notImplemented("uploadFiles");
  }

  async uploadProjectArchive(_input: UploadProjectArchiveInput): Promise<{ projectId: string }> {
    assertAuthForMode(this.config, "session");
    return notImplemented("uploadProjectArchive");
  }

  async compileProject(_input: CompileProjectInput): Promise<{ status: "queued" | "success" }> {
    assertAuthForMode(this.config, "session");
    return notImplemented("compileProject");
  }

  async downloadPdf(_input: DownloadPdfInput): Promise<{ outputPath?: string }> {
    assertAuthForMode(this.config, "session");
    return notImplemented("downloadPdf");
  }

  async syncPull(_input: SyncProjectInput): Promise<void> {
    assertAuthForMode(this.config, "git");
    return notImplemented("syncPull");
  }

  async syncPush(_input: SyncProjectInput): Promise<void> {
    assertAuthForMode(this.config, "git");
    return notImplemented("syncPush");
  }
}

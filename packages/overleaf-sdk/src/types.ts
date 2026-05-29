export type OverleafAuthMode = "session" | "git" | "hybrid";

export interface OverleafCredentials {
  sessionCookie?: string;
  gitToken?: string;
  gitUsername?: string;
}

export interface OverleafConfig {
  baseUrl: string;
  authMode: OverleafAuthMode;
  credentials: OverleafCredentials;
}

export interface ProjectTagInput {
  name: string;
  color?: string;
}

export interface CreateProjectInput {
  name: string;
  templateId?: string;
  tags?: ProjectTagInput[];
}

export interface CreateFileInput {
  projectId: string;
  path: string;
  content: string;
}

export interface UpdateFileInput extends CreateFileInput {}

export interface DeleteFileInput {
  projectId: string;
  path: string;
}

export interface UploadFilesInput {
  projectId: string;
  paths: string[];
}

export interface UploadProjectArchiveInput {
  archivePath: string;
}

export interface CompileProjectInput {
  projectId: string;
}

export interface DownloadPdfInput {
  projectId: string;
  outputPath?: string;
}

export interface SyncProjectInput {
  projectId: string;
  localPath: string;
}

export interface OverleafProjectSummary {
  id: string;
  name: string;
  tags: string[];
}

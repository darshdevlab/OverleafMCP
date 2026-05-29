import { z } from "zod";

export const toolSchemas = {
  listProjects: {
    name: "overleaf_list_projects",
    description: "List Overleaf projects visible to the authenticated user.",
    inputSchema: z.object({})
  },
  createProject: {
    name: "overleaf_create_project",
    description: "Create an Overleaf project, optionally from a template, and optionally attach tags.",
    inputSchema: z.object({
      name: z.string().min(1),
      templateId: z.string().min(1).optional(),
      tags: z
        .array(
          z.object({
            name: z.string().min(1),
            color: z.string().min(1).optional()
          })
        )
        .optional()
    })
  },
  createFile: {
    name: "overleaf_create_file",
    description: "Create a file in an Overleaf project using the Git-backed workflow.",
    inputSchema: z.object({
      projectId: z.string().min(1),
      path: z.string().min(1),
      content: z.string()
    })
  },
  updateFile: {
    name: "overleaf_update_file",
    description: "Update a file in an Overleaf project using the Git-backed workflow.",
    inputSchema: z.object({
      projectId: z.string().min(1),
      path: z.string().min(1),
      content: z.string()
    })
  },
  deleteFile: {
    name: "overleaf_delete_file",
    description: "Delete a file from an Overleaf project using the Git-backed workflow.",
    inputSchema: z.object({
      projectId: z.string().min(1),
      path: z.string().min(1)
    })
  },
  uploadFiles: {
    name: "overleaf_upload_files",
    description: "Upload one or more files into an existing Overleaf project.",
    inputSchema: z.object({
      projectId: z.string().min(1),
      paths: z.array(z.string().min(1)).min(1)
    })
  },
  uploadProjectArchive: {
    name: "overleaf_upload_project_archive",
    description: "Create a new Overleaf project by uploading an archive such as a zip file.",
    inputSchema: z.object({
      archivePath: z.string().min(1)
    })
  },
  compileProject: {
    name: "overleaf_compile_project",
    description: "Trigger project compilation.",
    inputSchema: z.object({
      projectId: z.string().min(1)
    })
  },
  downloadPdf: {
    name: "overleaf_download_pdf",
    description: "Download a compiled PDF for a project.",
    inputSchema: z.object({
      projectId: z.string().min(1),
      outputPath: z.string().min(1).optional()
    })
  },
  syncPull: {
    name: "overleaf_sync_pull",
    description: "Pull project changes from Overleaf into a local workspace.",
    inputSchema: z.object({
      projectId: z.string().min(1),
      localPath: z.string().min(1)
    })
  },
  syncPush: {
    name: "overleaf_sync_push",
    description: "Push local workspace changes to Overleaf.",
    inputSchema: z.object({
      projectId: z.string().min(1),
      localPath: z.string().min(1)
    })
  }
} as const;

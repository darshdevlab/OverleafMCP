import { z } from "zod";

export const toolSchemas = {
  authStatus: {
    name: "overleaf_auth_status",
    description: "Report whether Overleaf session auth and Git auth are currently configured.",
    inputSchema: z.object({})
  },
  authLogin: {
    name: "overleaf_auth_login",
    description: "Open a browser window, let the user log into Overleaf, and capture the session cookie locally.",
    inputSchema: z.object({})
  },
  authLogout: {
    name: "overleaf_auth_logout",
    description: "Clear the locally stored Overleaf session.",
    inputSchema: z.object({})
  },
  listProjects: {
    name: "overleaf_list_projects",
    description: "List Overleaf projects visible to the authenticated user.",
    inputSchema: z.object({})
  },
  listTags: {
    name: "overleaf_list_tags",
    description: "List Overleaf organization tags visible to the authenticated user.",
    inputSchema: z.object({})
  },
  createTag: {
    name: "overleaf_create_tag",
    description: "Create an Overleaf organization tag.",
    inputSchema: z.object({
      name: z.string().min(1),
      color: z.string().min(1).optional()
    })
  },
  editTag: {
    name: "overleaf_edit_tag",
    description: "Rename or recolor an existing Overleaf organization tag.",
    inputSchema: z.object({
      tagId: z.string().min(1),
      name: z.string().min(1),
      color: z.string().min(1).optional()
    })
  },
  deleteTag: {
    name: "overleaf_delete_tag",
    description: "Delete an Overleaf organization tag.",
    inputSchema: z.object({
      tagId: z.string().min(1)
    })
  },
  assignProjectTags: {
    name: "overleaf_assign_project_tags",
    description: "Assign one or more tags to an Overleaf project. Tags can be referenced by id or created by name.",
    inputSchema: z.object({
      projectId: z.string().min(1),
      tags: z
        .array(
          z.object({
            id: z.string().min(1).optional(),
            name: z.string().min(1).optional(),
            color: z.string().min(1).optional()
          })
        )
        .min(1)
    })
  },
  removeProjectTags: {
    name: "overleaf_remove_project_tags",
    description: "Remove one or more tags from an Overleaf project by tag id or tag name.",
    inputSchema: z.object({
      projectId: z.string().min(1),
      tagIds: z.array(z.string().min(1)).optional(),
      tagNames: z.array(z.string().min(1)).optional()
    })
  },
  listFiles: {
    name: "overleaf_list_files",
    description: "List files in an Overleaf project via the Git-backed workflow.",
    inputSchema: z.object({
      projectId: z.string().min(1),
      extension: z.string().min(1).optional()
    })
  },
  readFile: {
    name: "overleaf_read_file",
    description: "Read a file from an Overleaf project via the Git-backed workflow.",
    inputSchema: z.object({
      projectId: z.string().min(1),
      path: z.string().min(1)
    })
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
    description: "Create a file in an Overleaf project using session-first transport and Git when configured.",
    inputSchema: z.object({
      projectId: z.string().min(1),
      path: z.string().min(1),
      content: z.string()
    })
  },
  updateFile: {
    name: "overleaf_update_file",
    description: "Update a file in an Overleaf project using session-first transport and Git when configured.",
    inputSchema: z.object({
      projectId: z.string().min(1),
      path: z.string().min(1),
      content: z.string()
    })
  },
  deleteFile: {
    name: "overleaf_delete_file",
    description: "Delete a file from an Overleaf project using session-first transport and Git when configured.",
    inputSchema: z.object({
      projectId: z.string().min(1),
      path: z.string().min(1)
    })
  },
  uploadFiles: {
    name: "overleaf_upload_files",
    description: "Upload one or more files into an existing Overleaf project using session-first transport and Git when configured.",
    inputSchema: z.object({
      projectId: z.string().min(1),
      paths: z.array(z.string().min(1)).min(1)
    })
  },
  uploadProjectArchive: {
    name: "overleaf_upload_project_archive",
    description: "Create a new Overleaf project by uploading an archive such as a zip file.",
    inputSchema: z.object({
      archivePath: z.string().min(1),
      projectName: z.string().min(1).optional()
    })
  },
  deleteProject: {
    name: "overleaf_delete_project",
    description: "Delete an Overleaf project that the authenticated user can administer.",
    inputSchema: z.object({
      projectId: z.string().min(1)
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

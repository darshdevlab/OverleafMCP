# Security Policy

## Threat Model

This project handles high-value credentials:

- Overleaf session cookies
- Overleaf Git tokens
- project contents that may include unpublished research

Any implementation work must assume these are sensitive and avoid expanding blast radius.

## Baseline Requirements

- Do not log secrets.
- Do not persist secrets by default.
- Prefer user-supplied credentials over browser login automation.
- Prefer Git-based file operations when possible because they are easier to audit and diff.
- Require explicit user configuration for destructive operations.
- Validate project and file paths before write, upload, delete, or sync operations.

## Public Release Requirements

Before publishing a production release:

- add secret redaction tests
- add input validation tests for file and project operations
- add transport-level timeouts and retry limits
- document all unsupported workflows
- publish a clear statement on what auth material is required

## Reporting

If you discover a security issue, do not publish credentials or reproduction material that exposes a live account. Open a private report through the repository security process once the public repository exists.

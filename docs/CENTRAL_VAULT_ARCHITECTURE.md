# Raymond Central Vault

## Purpose

One central deployment control plane for repositories owned by `raymondsondo0`. Project repositories do not store GitHub PATs, Cloudflare tokens, or InfinityFree FTP credentials.

## Architecture

1. A project repository runs its small caller workflow with GitHub Actions OIDC permission.
2. The workflow requests a short-lived OIDC identity token with audience `raymond-vault`.
3. The Cloudflare Worker at `https://raymond-ai-engine.raymondsondo0.workers.dev/vault/deploy` validates the token signature against GitHub's published JWKS, issuer, audience, expiration, repository owner, branch, and matching request payload.
4. The Worker uses a GitHub App installation token scoped only to the central `artificial` repository to send a `repository_dispatch`.
5. The central workflow creates a temporary read-only GitHub App token for the requesting repository, checks out the exact commit, validates opt-in configuration, runs PHP and JavaScript syntax checks, then deploys to an isolated folder on InfinityFree.
6. The default remote path is `<FTP_SERVER_DIR>/<repository-name>/`. The workflow does not clean the remote destination before upload.

## One-time central setup

### Cloudflare Worker secrets

Set these secrets on the `raymond-ai-engine` Worker:

- `RAYMOND_GITHUB_APP_ID`
- `RAYMOND_GITHUB_APP_PRIVATE_KEY`

The private key is never placed in source code or returned to project workflows.

### Central repository Actions secrets

Set these secrets once in `raymondsondo0-a11y/artificial`:

- `RAYMOND_GITHUB_APP_ID`
- `RAYMOND_GITHUB_APP_PRIVATE_KEY`
- `FTP_SERVER`
- `FTP_USERNAME`
- `FTP_PASSWORD`
- `FTP_SERVER_DIR`

Set `FTP_SERVER_DIR` to the base folder, for example `/htdocs/projects` (without a trailing slash). Each repository gets its own subfolder.

### GitHub App permissions and installation

Create one GitHub App owned by the user account and install it on all repositories (or the repositories you select). Grant repository permissions:

- Contents: Read and write (needed for dispatching the central event and reading project files)
- Metadata: Read-only

The Worker requests a temporary installation token limited to the central `artificial` repository with Contents: write. The central workflow requests a separate temporary token limited to the source repository with Contents: read.

## Enable a project

Copy `templates/raymond-vault-deploy.yml` into the project's `.github/workflows/` folder and add `raymond-vault.json` at the project root:

```json
{
  "deploy": true,
  "publish_dir": "."
}
```

Set `publish_dir` to the website folder, such as `public`, `htdocs`, or `.`. The project must be owned by `raymondsondo0` and deploy from `main` or `master`.

No repository secrets are required in the project repository. A new repository only needs the caller workflow and opt-in config.

## Safety boundaries

- OIDC tokens are short-lived and validated cryptographically.
- Only repositories owned by `raymondsondo0` and main/master refs are accepted.
- The central deployment workflow checks the opt-in file before publishing.
- FTP credentials remain only in central repository secrets.
- Each project publishes to a separate subdirectory; it does not overwrite the domain root.
- The workflow does not use destructive clean-slate deployment.
- This pipeline performs syntax checks, not full browser, database, or end-to-end tests. Add project-specific tests as needed.

## Current status

The Worker route and central workflow are source changes. They are not ready to deploy until the GitHub App is created/installed and the one-time central secrets are configured. The caller workflow is a template and must be copied into each repository that should deploy.

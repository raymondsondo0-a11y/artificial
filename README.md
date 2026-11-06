# Raymond AI Command Center

Raymond AI is a cloud-hosted command center powered by Cloudflare Workers AI. It is designed to work from a phone or computer without keeping a personal PC switched on.

## Live features

- Responsive browser dashboard served by the Cloudflare Worker.
- Protected AI chat endpoint at `/chat`.
- Protected project-file generation endpoint at `/generate`.
- Generated files are path-validated, size-limited, previewable, and downloadable individually or as a ZIP.
- GitHub Actions deploys Worker and static dashboard changes.

## Endpoints

- `GET /` — dashboard.
- `GET /health` — service health.
- `POST /chat` — AI planning/chat.
- `POST /generate` — generate a small project file bundle.

Both POST endpoints require `Authorization: Bearer <RAYMOND_AI_ACCESS_KEY>` and JSON body `{"prompt":"..."}`.

## GitHub Actions secrets

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `RAYMOND_AI_ACCESS_KEY`

The private access key is stored as a Worker secret by the deployment workflow and is never committed to this repository.

## Important limitations

AI project generation still returns downloadable files; it is not yet wired to commit the generated bundle automatically into a selected repository. The Central Vault deployment path is scaffolded for repositories that opt in, but it requires the one-time GitHub App and central FTP credentials before it can run. The current checks are PHP and JavaScript syntax checks, not full end-to-end tests. Generated code should be reviewed before use. Workers AI usage is subject to Cloudflare's current service limits and free allocation.

## Raymond Central Vault

A central deployment pipeline is now scaffolded in this repository:

- `POST /vault/deploy` validates GitHub Actions OIDC identities for repositories owned by `raymondsondo0-a11y`.
- The Worker uses a GitHub App installation token scoped to this central repository to queue a deployment event.
- `.github/workflows/vault-deploy.yml` checks out the requesting repository using a short-lived, read-only GitHub App token, validates `raymond-vault.json`, runs PHP/JavaScript syntax checks, and uploads to an isolated InfinityFree subdirectory.
- `templates/raymond-vault-deploy.yml` is the secretless caller workflow to copy into each project.
- `templates/raymond-vault.json` is the deployment opt-in example.

### One-time central credentials

Only the central `artificial` repository needs these Actions secrets:

- `RAYMOND_GITHUB_APP_ID`
- `RAYMOND_GITHUB_APP_PRIVATE_KEY`
- `FTP_SERVER`
- `FTP_USERNAME`
- `FTP_PASSWORD`
- `FTP_SERVER_DIR`

The Cloudflare deployment workflow copies the GitHub App ID/private key into encrypted Worker secrets. New project repositories do not need copies of these credentials. See [Central Vault setup](docs/CENTRAL_VAULT_ARCHITECTURE.md).

The vault is not active until the GitHub App is created and installed, and the central secrets are configured. Each project must opt in with `raymond-vault.json` and the caller workflow. Deployments go to separate project subdirectories; the domain root is not overwritten.

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

Project generation currently returns downloadable files. It does not yet commit generated projects to GitHub, run their build/tests, or deploy them to InfinityFree. Those steps require a separate authenticated execution and hosting integration. Generated code must be reviewed before use. Workers AI usage is subject to Cloudflare's current service limits and free allocation.

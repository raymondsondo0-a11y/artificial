# Raymond AI

Raymond AI is being built as a cloud-based command center. The initial milestone is a protected Cloudflare Workers AI endpoint. GitHub Actions deploys the worker; the user's computer does not need to stay on.

## Current milestone

- Cloudflare Worker with a Workers AI binding.
- Health endpoint at `/health`.
- Protected chat endpoint at `/chat`.
- GitHub Actions deployment on changes to the worker files.

## Required GitHub Actions secrets

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The Worker also requires a runtime secret named `RAYMOND_AI_ACCESS_KEY`. It is intentionally not stored in this repository. Configure it as a Worker secret before using the chat endpoint.

## Important

This first milestone provides AI responses only. It does not yet create files, run tests, or deploy websites to InfinityFree. Those capabilities will be added as separate, testable milestones. Workers AI usage is subject to Cloudflare's current free allocation and service limits.

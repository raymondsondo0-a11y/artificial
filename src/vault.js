const APP_OWNER = "raymondsondo0-a11y";
const CENTRAL_REPO = "artificial";
const OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const OIDC_AUDIENCE = "raymond-vault";

function b64urlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - padded.length % 4) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function decodePart(value) {
  return JSON.parse(new TextDecoder().decode(b64urlDecode(value)));
}

function pemToBytes(pem) {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  return Uint8Array.from(atob(body), c => c.charCodeAt(0));
}

async function verifyGitHubOidc(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed GitHub OIDC token.");
  const header = decodePart(parts[0]);
  const claims = decodePart(parts[1]);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported OIDC token algorithm.");
  if (claims.iss !== OIDC_ISSUER || !(claims.aud === OIDC_AUDIENCE || (Array.isArray(claims.aud) && claims.aud.includes(OIDC_AUDIENCE)))) {
    throw new Error("OIDC issuer or audience is not trusted.");
  }
  const now = Math.floor(Date.now() / 1000);
  if (!claims.exp || claims.exp <= now || (claims.nbf && claims.nbf > now + 30)) throw new Error("OIDC token is expired or not active.");
  const jwksResponse = await fetch(OIDC_ISSUER + "/.well-known/jwks");
  if (!jwksResponse.ok) throw new Error("Could not load GitHub's signing keys.");
  const jwks = await jwksResponse.json();
  const jwk = jwks.keys?.find(key => key.kid === header.kid && key.alg === "RS256");
  if (!jwk) throw new Error("GitHub signing key was not found.");
  const publicKey = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    b64urlDecode(parts[2]),
    new TextEncoder().encode(parts[0] + "." + parts[1])
  );
  if (!valid) throw new Error("GitHub OIDC signature is invalid.");
  return claims;
}

async function createGitHubAppJwt(appId, privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);
  const enc = value => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const header = enc({ alg: "RS256", typ: "JWT" });
  const payload = enc({ iat: now - 60, exp: now + 540, iss: appId });
  const unsigned = header + "." + payload;
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToBytes(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return unsigned + "." + sig;
}

async function githubRequest(path, token, options = {}) {
  const response = await fetch("https://api.github.com" + path, {
    ...options,
    headers: {
      "accept": "application/vnd.github+json",
      "authorization": "Bearer " + token,
      "x-github-api-version": "2022-11-28",
      "user-agent": "Raymond-Central-Vault",
      ...(options.headers || {})
    }
  });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("GitHub API " + response.status + ": " + (data?.message || "request failed"));
  return data;
}

export async function handleVaultDeploy(request, env) {
  if (request.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "POST required." }), { status: 405, headers: { "content-type": "application/json" } });
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return new Response(JSON.stringify({ ok: false, error: "GitHub Actions OIDC token required." }), { status: 401, headers: { "content-type": "application/json" } });

  try {
    if (!env.RAYMOND_GITHUB_APP_ID || !env.RAYMOND_GITHUB_APP_PRIVATE_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "Central vault is not configured yet. Add the GitHub App ID and private key as Cloudflare Worker secrets." }), { status: 503, headers: { "content-type": "application/json" } });
    }
    const claims = await verifyGitHubOidc(match[1]);
    if (claims.repository_owner !== "raymondsondo0-a11y" || typeof claims.repository !== "string" || !claims.repository.startsWith("raymondsondo0-a11y/")) {
      return new Response(JSON.stringify({ ok: false, error: "This repository owner is not authorized for Raymond Vault." }), { status: 403, headers: { "content-type": "application/json" } });
    }
    if (!["refs/heads/main", "refs/heads/master"].includes(claims.ref)) {
      return new Response(JSON.stringify({ ok: false, error: "Vault deployments are allowed only from main or master." }), { status: 403, headers: { "content-type": "application/json" } });
    }
    const body = await request.json().catch(() => ({}));
    if (body.repository !== claims.repository || body.ref !== claims.ref || body.sha !== claims.sha) {
      return new Response(JSON.stringify({ ok: false, error: "Request details do not match the signed GitHub identity." }), { status: 403, headers: { "content-type": "application/json" } });
    }
    const repoName = claims.repository.split("/")[1];
    if (!/^[A-Za-z0-9_.-]{1,100}$/.test(repoName) || repoName === CENTRAL_REPO) {
      return new Response(JSON.stringify({ ok: false, error: "This repository cannot be deployed through the vault." }), { status: 403, headers: { "content-type": "application/json" } });
    }

    const appJwt = await createGitHubAppJwt(env.RAYMOND_GITHUB_APP_ID, env.RAYMOND_GITHUB_APP_PRIVATE_KEY);
    const installation = await githubRequest("/users/" + APP_OWNER + "/installation", appJwt);
    const installationToken = await githubRequest("/app/installations/" + installation.id + "/access_tokens", appJwt, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        repositories: [CENTRAL_REPO],
        permissions: { contents: "write" }
      })
    });
    await githubRequest("/repos/" + APP_OWNER + "/" + CENTRAL_REPO + "/dispatches", installationToken.token, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event_type: "raymond-vault-deploy",
        client_payload: {
          source_repo: claims.repository,
          source_repo_name: repoName,
          source_ref: claims.ref,
          source_sha: claims.sha,
          repository_id: claims.repository_id,
          requested_at: new Date().toISOString()
        }
      })
    });
    return new Response(JSON.stringify({
      ok: true,
      accepted: true,
      repository: claims.repository,
      commit: claims.sha,
      message: "Deployment request accepted by Raymond Central Vault. The central workflow will test before publishing."
    }), { headers: { "content-type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error?.message || error) }), { status: 401, headers: { "content-type": "application/json" } });
  }
}

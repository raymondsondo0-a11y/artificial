const MODEL = "@cf/meta/llama-3.2-1b-instruct";
const MAX_PROMPT_LENGTH = 6000;
const MAX_FILES = 8;
const MAX_FILE_BYTES = 30000;
const MAX_TOTAL_BYTES = 100000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization"
    }
  });
}

function authorized(request, env) {
  const key = env.RAYMOND_AI_ACCESS_KEY;
  return Boolean(key && request.headers.get("authorization") === `Bearer ${key}`);
}

function safePath(path) {
  if (typeof path !== "string" || !path.trim() || path.length > 160) return false;
  if (path.startsWith("/") || path.includes("\\") || path.split("/").some(part => !part || part === "." || part === "..")) return false;
  return /^[a-zA-Z0-9._/-]+$/.test(path);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type, authorization",
          "access-control-max-age": "86400"
        }
      });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, service: "Raymond AI Engine", model: MODEL, status: "online" });
    }

    if (request.method === "GET" && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    if (!["/chat", "/generate"].includes(url.pathname) || request.method !== "POST") {
      return json({ ok: false, error: "Route not found." }, 404);
    }

    if (!env.RAYMOND_AI_ACCESS_KEY) {
      return json({ ok: false, error: "The engine is not configured. Add the RAYMOND_AI_ACCESS_KEY Worker secret." }, 503);
    }
    if (!authorized(request, env)) {
      return json({ ok: false, error: "Unauthorized. Check your private access key." }, 401);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "Request body must be valid JSON." }, 400);
    }

    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) return json({ ok: false, error: "Please enter a command." }, 400);
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return json({ ok: false, error: `Command is too long. Maximum is ${MAX_PROMPT_LENGTH} characters.` }, 413);
    }

    if (url.pathname === "/chat") {
      try {
        const result = await env.AI.run(MODEL, {
          messages: [
            { role: "system", content: "You are Raymond AI, a practical website-building assistant. Understand the user's goal and provide a concise, useful implementation plan. Do not claim files were created, tests passed, or a website was deployed unless confirmed by an external system. Explain missing details and limitations honestly." },
            { role: "user", content: prompt }
          ],
          max_tokens: 1200
        });
        const answer = result?.response || result?.result || "";
        return json({ ok: true, model: MODEL, answer: typeof answer === "string" ? answer : JSON.stringify(answer) });
      } catch (error) {
        return json({ ok: false, error: "The AI request failed. Check Workers AI allocation and binding.", detail: String(error?.message || error) }, 502);
      }
    }

    try {
      const result = await env.AI.run(MODEL, {
        messages: [
          {
            role: "system",
            content: [
              "You are Raymond AI's project file generator.",
              "Return ONLY valid JSON. No markdown fences, no explanation outside JSON.",
              'Required shape: {"project_name":"short-name","summary":"brief summary","files":[{"path":"index.html","content":"complete file contents"}],"run_instructions":["step one"]}.',
              "Generate a small, complete, useful first version of the requested project, not just a plan.",
              "Include all essential source files and sensible responsive styling. Prefer plain HTML, CSS and JavaScript unless the user requests a framework.",
              "Maximum 8 files. Prefer 3-5 files for a first version. Keep each file concise. Every file must contain its complete contents, not placeholders or ellipses.",
              "Do not put Markdown code fences inside file contents. Escape JSON strings correctly. Do not put backslashes before HTML angle brackets.",
              "run_instructions must be a JSON array of short strings.",
              "Do not include secrets, API keys, passwords, or unsafe destructive commands.",
              "Use relative paths only. Never use ../, absolute paths, or backslashes.",
              "If critical information is missing, make reasonable safe assumptions and state them in summary or run_instructions.",
              "Do not claim that the project has been tested, committed, or deployed."
            ].join(" ")
          },
          { role: "user", content: prompt }
        ],
        max_tokens: 5000
      });

      const raw = result?.response || result?.result || "";
      let parsed;
      try {
        const text = typeof raw === "string" ? raw : JSON.stringify(raw);
        const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        return json({ ok: false, error: "The model did not return valid project-file JSON. Try a smaller or more specific project request.", model: MODEL, raw: typeof raw === "string" ? raw : JSON.stringify(raw) }, 502);
      }

      if (!Array.isArray(parsed.files) || parsed.files.length < 1 || parsed.files.length > MAX_FILES) {
        return json({ ok: false, error: `Generated project must contain between 1 and ${MAX_FILES} files.` }, 502);
      }

      let total = 0;
      const files = [];
      const seen = new Set();
      for (const file of parsed.files) {
        if (!safePath(file?.path) || typeof file.content !== "string" || seen.has(file.path)) {
          return json({ ok: false, error: "The model returned an unsafe or invalid file path/content. No files were exported." }, 502);
        }
        const size = new TextEncoder().encode(file.content).length;
        if (size > MAX_FILE_BYTES) return json({ ok: false, error: `File ${file.path} exceeds the ${MAX_FILE_BYTES}-byte safety limit.` }, 502);
        total += size;
        if (total > MAX_TOTAL_BYTES) return json({ ok: false, error: "The generated project exceeds the total export size limit." }, 502);
        seen.add(file.path);
        files.push({ path: file.path, content: file.content });
      }

      return json({
        ok: true,
        model: MODEL,
        project_name: String(parsed.project_name || "raymond-ai-project").slice(0, 80),
        summary: String(parsed.summary || "Generated project files."),
        files,
        run_instructions: Array.isArray(parsed.run_instructions) ? parsed.run_instructions.slice(0, 8).map(x => String(x).slice(0, 300)) : [],
        execution_status: "generated_not_tested_not_deployed"
      });
    } catch (error) {
      return json({ ok: false, error: "Project generation failed. Check Workers AI availability and free allocation.", detail: String(error?.message || error) }, 502);
    }
  }
};

const MODEL = "@cf/meta/llama-3.2-1b-instruct";
const MAX_PROMPT_LENGTH = 6000;

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
      return json({
        ok: true,
        service: "Raymond AI Engine",
        model: MODEL,
        status: "online"
      });
    }

    if (url.pathname !== "/chat" || request.method !== "POST") {
      return json({ ok: false, error: "Route not found." }, 404);
    }

    // Require a private dashboard key before accepting public requests.
    if (!env.RAYMOND_AI_ACCESS_KEY) {
      return json({
        ok: false,
        error: "The engine is not configured yet. Add the RAYMOND_AI_ACCESS_KEY Worker secret."
      }, 503);
    }

    const authorization = request.headers.get("authorization") || "";
    if (authorization !== `Bearer ${env.RAYMOND_AI_ACCESS_KEY}`) {
      return json({ ok: false, error: "Unauthorized." }, 401);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "Request body must be valid JSON." }, 400);
    }

    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return json({ ok: false, error: "Please enter a command." }, 400);
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return json({ ok: false, error: `Command is too long. Maximum is ${MAX_PROMPT_LENGTH} characters.` }, 413);
    }

    try {
      const result = await env.AI.run(MODEL, {
        messages: [
          {
            role: "system",
            content: "You are Raymond AI, a practical website-building assistant. Understand the user's goal, ask for missing essential details, and provide clear implementation plans. Do not claim that files were created, tests passed, or a website was deployed unless an external execution system confirms it. When asked to build a website, return a concise implementation plan and identify the files and features required. Be honest about limitations."
          },
          { role: "user", content: prompt }
        ],
        max_tokens: 1200
      });

      const answer = result?.response || result?.result || "";
      return json({
        ok: true,
        model: MODEL,
        answer: typeof answer === "string" ? answer : JSON.stringify(answer)
      });
    } catch (error) {
      return json({
        ok: false,
        error: "The AI request failed. Check the Workers AI binding and free allocation.",
        detail: String(error?.message || error)
      }, 502);
    }
  }
};

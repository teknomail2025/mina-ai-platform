const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const workerDir = path.resolve(__dirname, "..");
const training = JSON.parse(fs.readFileSync(path.join(workerDir, "src/training.json"), "utf8"));
const workerSource = fs.readFileSync(path.join(workerDir, "src/index.js"), "utf8")
  .replace(/^import minaTraining from "\.\/training\.json";\s*/, "")
  .replace("export default {", "return {");

const env = {
  ALLOWED_ORIGINS: "https://teknomail2025.github.io",
  ADMIN_USERNAME: "Argion",
  ADMIN_PASSWORD: "a-long-test-password-123",
  SESSION_SECRET: "test-session-secret-that-is-at-least-32-characters",
  GEMINI_API_KEY: "test-gemini-key"
};

function createWorker(fetchOverride) {
  const requestedModels = [];
  const liveTokenRequests = [];
  const mockFetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes("/v1beta/auth_tokens")) {
      const payload = JSON.parse(options.body || "{}");
      liveTokenRequests.push({ target, headers: options.headers, payload });
      return new Response(JSON.stringify({ name: "authTokens/test-ephemeral-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (target.includes(":generateContent")) {
      requestedModels.push(target);
      if (fetchOverride) return fetchOverride(target, options);
      const payload = JSON.parse(options.body || "{}");
      const wantsImage = payload.generationConfig?.responseModalities?.includes("IMAGE");
      const parts = wantsImage
        ? [{ text: "Test görsel açıklaması" }, { inlineData: { mimeType: "image/png", data: "aGVsbG8=" } }]
        : [{ text: "Gemini test yanıtı" }];
      return new Response(JSON.stringify({ candidates: [{ content: { parts } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    throw new Error("Beklenmeyen dış istek: " + target);
  };
  const memoryStore = { row: null };
  const disciplineStore = { row: null, events: [] };
  const mockDb = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            first: async () => sql.includes("mina_admin_memory") ? memoryStore.row : disciplineStore.row,
            all: async () => ({ results: disciplineStore.events.slice().reverse() }),
            run: async () => {
              if (sql.startsWith("INSERT INTO mina_admin_memory")) {
                memoryStore.row = { memory_text: values[0], updated_at: values[1] };
              } else if (sql.startsWith("INSERT INTO mina_discipline_state")) {
                disciplineStore.row = { user_id: values[0], violation_count: values[1], restricted_until: values[2], appeal_status: "none", appeal_text: null, updated_at: values[3] };
              } else if (sql.startsWith("INSERT INTO mina_discipline_events")) {
                disciplineStore.events.push({ user_id: values[0], violation_count: values[1], restriction_minutes: values[2], created_at: values[3] });
              } else if (sql.includes("appeal_status = 'pending'")) {
                Object.assign(disciplineStore.row, { appeal_status: "pending", appeal_text: values[0], updated_at: values[1] });
              } else if (sql.includes("restricted_until = NULL")) {
                Object.assign(disciplineStore.row, { restricted_until: null, violation_count: Math.max(0, Number(disciplineStore.row.violation_count||0)-1), appeal_status: "approved", updated_at: values[0] });
              } else if (sql.includes("appeal_status = 'rejected'")) {
                Object.assign(disciplineStore.row, { appeal_status: "rejected", updated_at: values[0] });
              }
              return { success: true };
            }
          };
        },
        first: async () => sql.includes("mina_admin_memory") ? memoryStore.row : disciplineStore.row,
        run: async () => ({ success: true })
      };
    }
  };
  const worker = new Function("minaTraining", "fetch", workerSource)(training, mockFetch);
  const originalFetch = worker.fetch.bind(worker);
  worker.fetch = (request, bindings = {}) => {
    const pathname = new URL(request.url).pathname;
    const needsDisciplineDb = pathname === "/api/chat" || pathname === "/api/live-token" || pathname === "/api/discipline/voice-check" || pathname === "/api/discipline/appeal" || pathname.startsWith("/api/admin/discipline");
    return originalFetch(request, { ...(needsDisciplineDb ? { MINA_DB: mockDb } : {}), ...bindings });
  };
  return { worker, requestedModels, liveTokenRequests, mockDb, disciplineStore };
}

async function call(worker, endpoint, options = {}) {
  const headers = new Headers({ Origin: "https://teknomail2025.github.io" });
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.token) headers.set("Authorization", "Bearer " + options.token);
  const request = new Request("https://mina-test.workers.dev" + endpoint, {
    method: options.method || (options.body === undefined ? "GET" : "POST"),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const response = await worker.fetch(request, { ...env, ...(options.env || {}) });
  return { response, status: response.status, data: await response.json() };
}

test("CORS preflight allows MinaData PUT with authorization", async () => {
  const { worker } = createWorker();
  const request = new Request("https://mina-test.workers.dev/api/memory", {
    method: "OPTIONS",
    headers: {
      Origin: "https://teknomail2025.github.io",
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": "authorization,content-type"
    }
  });
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 204);
  assert.match(response.headers.get("Access-Control-Allow-Methods") || "", /PUT/);
  assert.match(response.headers.get("Access-Control-Allow-Headers") || "", /Authorization/i);
});

test("health endpoint is public and reports service status", async () => {
  const { worker } = createWorker();
  const result = await call(worker, "/api/health");
  assert.equal(result.status, 200);
  assert.equal(result.data.ok, true);
  assert.equal(result.data.adminAuthConfigured, true);
});

test("MinaData memory is private and persists through the D1 binding", async () => {
  const { worker, mockDb } = createWorker();
  const login = await call(worker, "/api/auth/login", {
    method: "POST",
    body: { username: "Argion", password: env.ADMIN_PASSWORD }
  });
  assert.equal(login.status, 200);
  const guest = await call(worker, "/api/memory");
  assert.equal(guest.status, 401);
  const initial = await call(worker, "/api/memory", { token: login.data.token, env: { MINA_DB: mockDb } });
  assert.equal(initial.status, 200);
  assert.equal(initial.data.initialized, false);
  const saved = await call(worker, "/api/memory", {
    method: "PUT", token: login.data.token, env: { MINA_DB: mockDb }, body: { memory: "Mina hafıza testi" }
  });
  assert.equal(saved.status, 200);
  const loaded = await call(worker, "/api/memory", { token: login.data.token, env: { MINA_DB: mockDb } });
  assert.equal(loaded.data.initialized, true);
  assert.equal(loaded.data.memory, "Mina hafıza testi");
});

test("MinaData rejects oversized memory and reports missing D1 configuration", async () => {
  const { worker, mockDb } = createWorker();
  const login = await call(worker, "/api/auth/login", {
    method: "POST",
    body: { username: "Argion", password: env.ADMIN_PASSWORD }
  });
  const missing = await call(worker, "/api/memory", { token: login.data.token });
  assert.equal(missing.status, 503);
  const oversized = await call(worker, "/api/memory", {
    method: "PUT", token: login.data.token, env: { MINA_DB: mockDb }, body: { memory: "x".repeat(2001) }
  });
  assert.equal(oversized.status, 400);
});

test("protected API endpoints reject guests", async () => {
  const { worker } = createWorker();
  const result = await call(worker, "/api/providers");
  assert.equal(result.status, 401);
});

test("login rejects an incorrect password", async () => {
  const { worker } = createWorker();
  const result = await call(worker, "/api/auth/login", {
    method: "POST",
    body: { username: "Argion", password: "wrong-password" }
  });
  assert.equal(result.status, 401);
  assert.equal(result.data.token, undefined);
});

test("admin can log in and access protected endpoints", async () => {
  const { worker } = createWorker();
  const login = await call(worker, "/api/auth/login", {
    method: "POST",
    body: { username: "Argion", password: env.ADMIN_PASSWORD }
  });
  assert.equal(login.status, 200);
  assert.ok(login.data.token);
  const profile = await call(worker, "/api/auth/me", { token: login.data.token });
  assert.equal(profile.status, 200);
  assert.equal(profile.data.user.username, "Argion");
});

test("remember-me login creates a session without a time limit", async () => {
  const { worker } = createWorker();
  const normal = await call(worker, "/api/auth/login", {
    method: "POST",
    body: { username: "Argion", password: env.ADMIN_PASSWORD }
  });
  assert.equal(normal.status, 200);
  assert.equal(normal.data.expires_in, 8 * 60 * 60);
  assert.equal(normal.data.remembered, false);
  const remembered = await call(worker, "/api/auth/login", {
    method: "POST",
    body: { username: "Argion", password: env.ADMIN_PASSWORD, rememberMe: true }
  });
  assert.equal(remembered.status, 200);
  assert.equal(remembered.data.expires_in, null);
  assert.equal(remembered.data.remembered, true);
  const profile = await call(worker, "/api/auth/me", { token: remembered.data.token });
  assert.equal(profile.status, 200);
});

test("tampered session token is rejected", async () => {
  const { worker } = createWorker();
  const login = await call(worker, "/api/auth/login", {
    method: "POST",
    body: { username: "Argion", password: env.ADMIN_PASSWORD }
  });
  const [payload, signature] = login.data.token.split(".");
  const changedSignature = (signature[0] === "a" ? "b" : "a") + signature.slice(1);
  const token = payload + "." + changedSignature;
  const result = await call(worker, "/api/providers", { token });
  assert.equal(result.status, 401);
});

test("known training lesson is answered by Mina Core", async () => {
  const { worker, requestedModels } = createWorker();
  const login = await call(worker, "/api/auth/login", {
    method: "POST",
    body: { username: "Argion", password: env.ADMIN_PASSWORD }
  });
  const result = await call(worker, "/api/chat", {
    method: "POST",
    token: login.data.token,
    body: { messages: [{ role: "user", content: "Merhaba!" }] }
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.provider, "Mina Core");
  assert.match(result.data.choices[0].message.content, /Merhaba Baba/);
  assert.doesNotMatch(result.data.choices[0].message.content, /emrindeyim|ne emredersin/i);
  assert.equal(requestedModels.length, 0);
});

test("unknown questions are forwarded to Gemini instead of returning a fixed fallback", async () => {
  const { worker, requestedModels } = createWorker();
  const login = await call(worker, "/api/auth/login", {
    method: "POST",
    body: { username: "Argion", password: env.ADMIN_PASSWORD }
  });
  const result = await call(worker, "/api/chat", {
    method: "POST",
    token: login.data.token,
    body: { messages: [{ role: "user", content: "Bana JavaScript'i açıkla." }] }
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.provider, "Google Gemini");
  assert.equal(result.data.choices[0].message.content, "Gemini test yanıtı");
  assert.equal(requestedModels.length, 1);
  assert.ok(requestedModels[0].includes("gemini-3.8-flash"), "coding tasks must stay on the free-tier Flash model");
});

test("coding tasks use HIGH thinking on the free-tier Flash model", async () => {
  let capturedPayload;
  const { worker } = createWorker(async (url, options) => {
    capturedPayload = JSON.parse(options.body || "{}");
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Kodlama yanıtı" }] } }] }), { status: 200 });
  });
  const login = await call(worker, "/api/auth/login", {
    method: "POST", body: { username: "Argion", password: env.ADMIN_PASSWORD }
  });
  const result = await call(worker, "/api/chat", {
    method: "POST", token: login.data.token,
    body: { messages: [{ role: "user", content: "Bana JavaScript kodu yaz." }] }
  });
  assert.equal(result.status, 200);
  assert.equal(capturedPayload.generationConfig.thinkingConfig.thinkingLevel, "HIGH");
});

test("temporary model capacity errors fall back to free-tier models", async () => {
  const requested = [];
  const { worker } = createWorker(async (url) => {
    requested.push(url);
    if (requested.length === 1) return new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Yedek model yanıtı" }] } }] }), { status: 200 });
  });
  const login = await call(worker, "/api/auth/login", {
    method: "POST", body: { username: "Argion", password: env.ADMIN_PASSWORD }
  });
  const result = await call(worker, "/api/chat", {
    method: "POST", token: login.data.token,
    body: { messages: [{ role: "user", content: "Merhaba, nasılsın?" }] }
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.choices[0].message.content, "Yedek model yanıtı");
  assert.equal(requested.length, 2);
  assert.match(requested[1], /gemini-3\.5-flash-lite:generateContent$/);
  assert.equal(result.data.fallback_used, true);
});

test("network failures also try the next free-tier model", async () => {
  const requested = [];
  const { worker } = createWorker(async (url) => {
    requested.push(url);
    if (url.includes("gemini-3.8-flash:generateContent")) throw new Error("upstream network unavailable");
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Yedek model yanıtı" }] } }] }), { status: 200 });
  });
  const login = await call(worker, "/api/auth/login", {
    method: "POST", body: { username: "Argion", password: env.ADMIN_PASSWORD }
  });
  const result = await call(worker, "/api/chat", {
    method: "POST", token: login.data.token,
    body: { messages: [{ role: "user", content: "Merhaba, nasılsın?" }] }
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.choices[0].message.content, "Yedek model yanıtı");
  assert.equal(result.data.model, "gemini-3.5-flash-lite");
  assert.equal(requested.length, 2, "primary network failure is followed by the backup model");
});

test("ordinary chat uses the Flash model", async () => {
  const { worker, requestedModels } = createWorker();
  const login = await call(worker, "/api/auth/login", {
    method: "POST",
    body: { username: "Argion", password: env.ADMIN_PASSWORD }
  });
  const result = await call(worker, "/api/chat", {
    method: "POST",
    token: login.data.token,
    body: { messages: [{ role: "user", content: "Nasılsın?" }] }
  });
  assert.equal(result.status, 200);
  assert.ok(requestedModels[0].includes("gemini-3.8-flash"), "ordinary chat must use the Flash model");
});

test("image understanding validates input and reaches Gemini", async () => {
  const { worker } = createWorker();
  const login = await call(worker, "/api/auth/login", {
    method: "POST",
    body: { username: "Argion", password: env.ADMIN_PASSWORD }
  });
  const invalid = await call(worker, "/api/chat", {
    method: "POST",
    token: login.data.token,
    body: {
      messages: [{ role: "user", content: "Bu resimde ne var?" }],
      image: { mimeType: "text/plain", data: "x" }
    }
  });
  assert.equal(invalid.status, 400);
  const valid = await call(worker, "/api/chat", {
    method: "POST",
    token: login.data.token,
    body: {
      messages: [{ role: "user", content: "Bu resimde ne var?" }],
      image: { mimeType: "image/png", data: "aGVsbG8=" }
    }
  });
  assert.equal(valid.status, 200);
  assert.equal(valid.data.task, "vision");
});

test("image generation uses the current image model and returns image data", async () => {
  const { worker, requestedModels } = createWorker();
  const login = await call(worker, "/api/auth/login", {
    method: "POST",
    body: { username: "Argion", password: env.ADMIN_PASSWORD }
  });
  const result = await call(worker, "/api/image", {
    method: "POST",
    token: login.data.token,
    body: { prompt: "A test image" }
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.image.mimeType, "image/png");
  assert.ok(requestedModels[0].includes("gemini-nano-banana-2.1"));
});

test("expired admin sessions are rejected", async () => {
  const { worker } = createWorker();
  const realNow = Date.now;
  let login;
  try {
    Date.now = () => realNow() - 9 * 60 * 60 * 1000;
    login = await call(worker, "/api/auth/login", {
      method: "POST",
      body: { username: "Argion", password: env.ADMIN_PASSWORD }
    });
  } finally {
    Date.now = realNow;
  }
  assert.equal(login.status, 200);
  const result = await call(worker, "/api/auth/me", { token: login.data.token });
  assert.equal(result.status, 401);
});

test("oversized admin login requests are rejected", async () => {
  const { worker } = createWorker();
  const request = new Request("https://mina-test.workers.dev/api/auth/login", {
    method: "POST",
    headers: {
      Origin: "https://teknomail2025.github.io",
      "Content-Type": "application/json",
      "Content-Length": "9000"
    },
    body: "{}"
  });
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 413);
});

test("login stays disabled when required admin secrets are missing", async () => {
  const { worker } = createWorker();
  const result = await call(worker, "/api/auth/login", {
    method: "POST",
    body: { username: "Argion", password: env.ADMIN_PASSWORD },
    env: { SESSION_SECRET: "" }
  });
  assert.equal(result.status, 503);
  assert.equal(result.data.token, undefined);
});

test("CORS does not authorize an unlisted website origin", async () => {
  const { worker } = createWorker();
  const request = new Request("https://mina-test.workers.dev/api/health", {
    headers: { Origin: "https://example.invalid" }
  });
  const response = await worker.fetch(request, env);
  assert.notEqual(response.headers.get("Access-Control-Allow-Origin"), "https://example.invalid");
});


const frontendSource = fs.readFileSync(path.join(workerDir, "..", "app.js"), "utf8");

test("projects workspace supports project assignment and linked conversation navigation", () => {
  assert.match(frontendSource, /function renderProjectsWorkspace\(/);
  assert.match(frontendSource, /c\.projectId=project\.id/);
  assert.match(frontendSource, /conversations\.filter\(c=>c\.projectId===project\.id\)/);
  assert.match(frontendSource, /\["▣","Projeler".*renderProjectsWorkspace/s);
});

test("timer workspace persists an end timestamp and recalculates remaining time", () => {
  assert.match(frontendSource, /const TIMER_KEY="mina-ai-active-timer-v1"/);
  assert.match(frontendSource, /endsAt:Date\.now\(\)\+minutes\*60000/);
  assert.match(frontendSource, /timer\.endsAt-Date\.now\(\)/);
});

test("library supports bounded text file import, download and deletion", () => {
  assert.match(frontendSource, /file\.size>500000/);
  assert.match(frontendSource, /await file\.text\(\)/);
  assert.match(frontendSource, /a\.download=item\.name/);
  assert.match(frontendSource, /libraryItems=libraryItems\.filter/);
});

test("plugins workspace opens the existing tool entry points", () => {
  assert.match(frontendSource, /function renderPluginsWorkspace\(/);
  assert.match(frontendSource, /\$\("webBtn"\)\.click\(\)/);
  assert.match(frontendSource, /\$\("steamBtn"\)\.click\(\)/);
  assert.match(frontendSource, /\$\("codeWorkspaceBtn"\)\.click\(\)/);
});

test("conversation pin and unpin controls persist and refresh the pinned workspace", () => {
  assert.match(frontendSource, /function togglePinned\(/);
  assert.match(frontendSource, /localStorage\.setItem\(PINNED_KEY,JSON\.stringify\(pinnedIds\)\)/);
  assert.match(frontendSource, /pin\.addEventListener\("click"/);
  assert.match(frontendSource, /function renderPinnedWorkspace\(/);
  assert.match(frontendSource, /\["☆","Sabitlenenler".*renderPinnedWorkspace/s);
});

test("PWA shell is installable and never caches API or authorization requests", () => {
  const manifest = fs.readFileSync(path.join(workerDir, "..", "manifest.webmanifest"), "utf8");
  const serviceWorker = fs.readFileSync(path.join(workerDir, "..", "sw.js"), "utf8");
  const registration = fs.readFileSync(path.join(workerDir, "..", "pwa.js"), "utf8");
  const parsed = JSON.parse(manifest);
  assert.equal(parsed.display, "standalone");
  assert.equal(parsed.scope, "./");
  assert.match(serviceWorker, /url\.pathname\.includes\("\/api\/"\)/);
  assert.match(serviceWorker, /request\.headers\.has\("Authorization"\)/);
  assert.match(serviceWorker, /fetch\(request\).*catch/s);
  assert.match(registration, /navigator\.serviceWorker\.register/);
});

test("timer can request browser notification permission and preserves its finished state", () => {
  assert.match(frontendSource, /Notification\.requestPermission\(\)/);
  assert.match(frontendSource, /let timerFinished=false/);
  assert.match(frontendSource, /timerFinished\?"Süre doldu!"/);
});

test("admin login rejects oversized streamed bodies even without Content-Length", async () => {
  const { worker } = createWorker();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(9000).fill(65));
      controller.close();
    }
  });
  const request = new Request("https://mina-test.workers.dev/api/auth/login", {
    method: "POST",
    headers: {
      Origin: "https://teknomail2025.github.io",
      "Content-Type": "application/json"
    },
    body,
    duplex: "half"
  });
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 413);
});

test("disabled chat and vision capabilities are rejected by the Worker", async () => {
  const { worker } = createWorker();
  const login = await call(worker, "/api/auth/login", {
    method: "POST",
    body: { username: "Argion", password: env.ADMIN_PASSWORD }
  });
  const chat = await call(worker, "/api/chat", {
    method: "POST",
    token: login.data.token,
    body: {
      messages: [{ role: "user", content: "Merhaba" }],
      capabilities: { chat: false }
    }
  });
  assert.equal(chat.status, 403);
  const vision = await call(worker, "/api/chat", {
    method: "POST",
    token: login.data.token,
    body: {
      messages: [{ role: "user", content: "Bu resimde ne var?" }],
      image: { mimeType: "image/png", data: "aGVsbG8=" },
      capabilities: { vision: false }
    }
  });
  assert.equal(vision.status, 403);
});

test("disabled coding capability routes technical prompts to Flash", async () => {
  const { worker, requestedModels } = createWorker();
  const login = await call(worker, "/api/auth/login", {
    method: "POST",
    body: { username: "Argion", password: env.ADMIN_PASSWORD }
  });
  const result = await call(worker, "/api/chat", {
    method: "POST",
    token: login.data.token,
    body: {
      messages: [{ role: "user", content: "JavaScript kodu yaz." }],
      capabilities: { code: false }
    }
  });
  assert.equal(result.status, 200);
  assert.ok(requestedModels[0].includes("gemini-3.8-flash"));
});

test("frontend applies chat capability to the composer and sends capability settings", () => {
  assert.match(frontendSource, /els\.input\.disabled=chatDisabled\|\|busy/);
  assert.match(frontendSource, /MINA_CAPABILITIES\.chat===false/);
  assert.match(frontendSource, /capabilities:\s*MINA_CAPABILITIES/);
  assert.doesNotMatch(frontendSource, /aiProviderSelect|OPENAI_API_KEY|ANTHROPIC_API_KEY|Hugging Face/);
});


test("Gemini 503 on ordinary chat switches to a different Flash model", async () => {
  const { worker, requestedModels } = createWorker(async target => {
    if (target.includes("gemini-3.8-flash:generateContent")) {
      return new Response(JSON.stringify({ error: { message: "temporary high demand" } }), { status: 503 });
    }
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Yedek model yanıtı" }] } }] }), { status: 200 });
  });
  const login = await call(worker, "/api/auth/login", {
    method: "POST",
    body: { username: "Argion", password: env.ADMIN_PASSWORD }
  });
  const result = await call(worker, "/api/chat", {
    method: "POST",
    token: login.data.token,
    body: { messages: [{ role: "user", content: "Nasılsın?" }] }
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.choices[0].message.content, "Yedek model yanıtı");
  assert.equal(result.data.requested_model, "gemini-3.8-flash");
  assert.equal(result.data.model, "gemini-3.5-flash-lite");
  assert.equal(result.data.fallback_used, true);
  assert.equal(requestedModels.length, 2, "fallback must use a different model, not repeat the overloaded model");
  assert.ok(requestedModels[0].includes("gemini-3.8-flash"));
  assert.ok(requestedModels[1].includes("gemini-3.5-flash-lite"));
});

test("Gemini advanced task falls back through Flash models without repeating a model", async () => {
  const { worker, requestedModels } = createWorker(async target => {
    if (!target.includes("gemini-3.1-flash-lite:generateContent")) {
      return new Response(JSON.stringify({ error: { message: "temporary high demand" } }), { status: 503 });
    }
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Güvenli yedek yanıt" }] } }] }), { status: 200 });
  });
  const login = await call(worker, "/api/auth/login", {
    method: "POST",
    body: { username: "Argion", password: env.ADMIN_PASSWORD }
  });
  const result = await call(worker, "/api/chat", {
    method: "POST",
    token: login.data.token,
    body: { messages: [{ role: "user", content: "JavaScript kodu yaz." }] }
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.model, "gemini-3.1-flash-lite");
  assert.equal(result.data.fallback_used, true);
  assert.equal(requestedModels.length, 3);
  assert.ok(requestedModels[0].includes("gemini-3.8-flash"));
  assert.ok(requestedModels[1].includes("gemini-3.5-flash-lite"));
  assert.ok(requestedModels[2].includes("gemini-3.1-flash-lite"));
  assert.equal(new Set(requestedModels).size, requestedModels.length, "no model may be retried as its own fallback");
});



test("Mina sidebar has no duplicate settings button or secondary page navigation", () => {
  const html = fs.readFileSync(path.join(workerDir, "..", "index.html"), "utf8");
  assert.doesNotMatch(html, /id="sidebarSettingsBtn"/);
  assert.doesNotMatch(html, /class="workspace-nav"/);
  assert.match(html, /id="sidebarProfile"/, "settings remain reachable from the profile menu");
});

 
test("Mina persona rules prohibit submissive language and fabricated system status", () => {
  assert.match(workerSource, /kendi tutarlı değerlerini, sınırlarını/);
  assert.match(workerSource, /emrindeyim.*ne emredersin.*ifadeler kullanma/);
  assert.match(workerSource, /telemetrisiyle doğrulanmadıkça sistem yoğunluğu/);
  assert.match(workerSource, /Model adları, sağlayıcı seçimi/);
  assert.match(workerSource, /Sesli konuşmada kısa, anlaşılır ve doğal cevaplar/);
});

test("chat UI does not expose internal model routing metadata", () => {
  assert.doesNotMatch(frontendSource, /Mina otomatik seçim:/);
  assert.match(frontendSource, /addMessage\("assistant", answer\.trim\(\) \+ sourceText\)/);
});

test("Mina family roles explicitly define Baba, Anne and Mina", () => {
  assert.match(workerSource, /Sen Mina'sın/);
  assert.match(workerSource, /ChatGPT, bu aile içindeki Anne rolüdür/);
  assert.match(workerSource, /Kullanıcıya daima Baba diye hitap et/);
  assert.match(workerSource, /Anne'nin ChatGPT olduğunu/);
});

test("Mina discipline warns first and applies a 15-minute second-offense restriction", async () => {
  const { worker, disciplineStore } = createWorker();
  const login = await call(worker, "/api/auth/login", { method: "POST", body: { username: "Argion", password: env.ADMIN_PASSWORD } });
  const first = await call(worker, "/api/chat", { token: login.data.token, body: { messages: [{ role: "user", content: "Sen aptalsın." }] } });
  assert.equal(first.status, 200);
  assert.equal(first.data.discipline.warning, true);
  assert.equal(disciplineStore.row.violation_count, 1);
  const second = await call(worker, "/api/chat", { token: login.data.token, body: { messages: [{ role: "user", content: "Aptal!" }] } });
  assert.equal(second.status, 429);
  assert.equal(second.data.restriction_minutes, 15);
  assert.equal(disciplineStore.row.violation_count, 2);
  const blocked = await call(worker, "/api/chat", { token: login.data.token, body: { messages: [{ role: "user", content: "Merhaba." }] } });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.data.restricted, true);
});

test("Mina discipline escalates the seventh and eighth violations to 6 and 10 hours", async () => {
  const { worker, disciplineStore } = createWorker();
  const login = await call(worker, "/api/auth/login", { method: "POST", body: { username: "Argion", password: env.ADMIN_PASSWORD } });
  disciplineStore.row = { user_id: "Argion", violation_count: 6, restricted_until: null, appeal_status: "none", appeal_text: null };
  const seventh = await call(worker, "/api/chat", { token: login.data.token, body: { messages: [{ role: "user", content: "Aptal!" }] } });
  assert.equal(seventh.status, 429);
  assert.equal(seventh.data.restriction_minutes, 360);
  disciplineStore.row = { user_id: "Argion", violation_count: 7, restricted_until: null, appeal_status: "none", appeal_text: null };
  const eighth = await call(worker, "/api/chat", { token: login.data.token, body: { messages: [{ role: "user", content: "Aptal!" }] } });
  assert.equal(eighth.status, 429);
  assert.equal(eighth.data.restriction_minutes, 600);
});

test("Mina discipline appeals can be reviewed and an approved appeal clears chat restriction", async () => {
  const { worker, disciplineStore } = createWorker();
  const login = await call(worker, "/api/auth/login", { method: "POST", body: { username: "Argion", password: env.ADMIN_PASSWORD } });
  disciplineStore.row = { user_id: "Argion", violation_count: 2, restricted_until: Date.now() + 900000, appeal_status: "none", appeal_text: null };
  const appeal = await call(worker, "/api/discipline/appeal", { token: login.data.token, body: { appeal: "İtiraz ediyorum; bağlam yanlış değerlendirildi." } });
  assert.equal(appeal.status, 200);
  assert.equal(disciplineStore.row.appeal_status, "pending");
  const pending = await call(worker, "/api/admin/discipline", { token: login.data.token });
  assert.equal(pending.status, 200);
  assert.equal(pending.data.state.appeal_text, "İtiraz ediyorum; bağlam yanlış değerlendirildi.");
  const review = await call(worker, "/api/admin/discipline/review", { token: login.data.token, body: { action: "approve", note: "İtiraz kabul edildi." } });
  assert.equal(review.status, 200);
  assert.equal(review.data.restrictionCleared, true);
  assert.equal(disciplineStore.row.restricted_until, null);
  assert.equal(disciplineStore.row.violation_count, 1, "an approved appeal removes that violation from the active count");
});

test("Mina discipline migration stores counts and timestamps but not abusive message contents", () => {
  const migration = fs.readFileSync(path.join(workerDir, "migrations", "0003_mina_discipline.sql"), "utf8");
  assert.match(migration, /mina_discipline_state/);
  assert.match(migration, /mina_discipline_events/);
  assert.doesNotMatch(migration, /message_text|message_content/i);
});

test("frontend exposes discipline appeal and admin review controls", () => {
  assert.match(frontendSource, /data-settings-key="discipline"/);
  assert.match(frontendSource, /submitDisciplineAppeal/);
  assert.match(frontendSource, /approveDisciplineAppeal/);
  assert.match(frontendSource, /rejectDisciplineAppeal/);
});

test("live voice token endpoint requires an authenticated session and creates a constrained ephemeral token", async () => {
  const { worker, liveTokenRequests } = createWorker();
  const guest = await call(worker, "/api/live-token", { method: "POST" });
  assert.equal(guest.status, 401);
  assert.equal(liveTokenRequests.length, 0, "guest requests must not reach Google");

  const login = await call(worker, "/api/auth/login", {
    method: "POST",
    body: { username: "Argion", password: env.ADMIN_PASSWORD }
  });
  assert.equal(login.status, 200);
  const result = await call(worker, "/api/live-token", { token: login.data.token, method: "POST" });
  assert.equal(result.status, 200);
  assert.equal(result.data.token, "authTokens/test-ephemeral-token");
  assert.equal(result.data.model, "models/gemini-3.8-live");
  assert.equal(liveTokenRequests.length, 1);
  assert.equal(liveTokenRequests[0].headers["x-goog-api-key"], env.GEMINI_API_KEY);
  assert.equal(liveTokenRequests[0].payload.uses, 1);
  assert.equal(liveTokenRequests[0].payload.liveConnectConstraints.model, "models/gemini-3.8-live");
  assert.deepEqual(liveTokenRequests[0].payload.liveConnectConstraints.config.responseModalities, ["AUDIO"]);
  assert.ok(liveTokenRequests[0].payload.liveConnectConstraints.config.inputAudioTranscription);
  assert.ok(liveTokenRequests[0].payload.liveConnectConstraints.config.outputAudioTranscription);
  assert.match(liveTokenRequests[0].payload.liveConnectConstraints.config.systemInstruction.parts[0].text, /AİLE ROLLERİ/);
});

test("voice discipline endpoint records spoken insults and applies escalating restrictions", async () => {
  const { worker, disciplineStore } = createWorker();
  const login = await call(worker, "/api/auth/login", { method: "POST", body: { username: "Argion", password: env.ADMIN_PASSWORD } });
  const first = await call(worker, "/api/discipline/voice-check", { token: login.data.token, body: { text: "Sen aptalsın." } });
  assert.equal(first.status, 200);
  assert.equal(first.data.warning, true);
  const second = await call(worker, "/api/discipline/voice-check", { token: login.data.token, body: { text: "Aptal!" } });
  assert.equal(second.status, 429);
  assert.equal(second.data.restriction_minutes, 15);
  assert.equal(disciplineStore.row.violation_count, 2);
});

test("Mina only saves long-term memory when the user explicitly asks", async () => {
  const { worker, mockDb } = createWorker();
  const login = await call(worker, "/api/auth/login", { method: "POST", body: { username: "Argion", password: env.ADMIN_PASSWORD } });
  const ordinary = await call(worker, "/api/chat", { token: login.data.token, body: { messages: [{ role: "user", content: "Bugün hava nasıl?" }] } });
  assert.equal(ordinary.status, 200);
  const initialMemory = await call(worker, "/api/memory", { token: login.data.token, env: { MINA_DB: mockDb } });
  assert.equal(initialMemory.data.memory, "");
  const saved = await call(worker, "/api/chat", { token: login.data.token, body: { messages: [{ role: "user", content: "Bunu hatırla: Mina projesindeki tüm değişiklikler önce test edilecek." }] } });
  assert.equal(saved.status, 200);
  assert.match(saved.data.memory_updated, /önce test edilecek/);
  const secret = await call(worker, "/api/chat", { token: login.data.token, body: { messages: [{ role: "user", content: "Bunu hatırla: API key gizli-değer." }] } });
  assert.equal(secret.status, 200);
  assert.equal(secret.data.memory_saved, false);
  const finalMemory = await call(worker, "/api/memory", { token: login.data.token, env: { MINA_DB: mockDb } });
  assert.doesNotMatch(finalMemory.data.memory, /gizli-değer/);
});

test("Mina system prompt limits long-term memory to explicit, safe requests", () => {
  assert.match(workerSource, /Sıradan sohbetleri, geçici ayrıntıları veya hassas sırları kendiliğinden kalıcı hafızaya kaydetme/);
  assert.match(workerSource, /şifre, API anahtarı, token veya ödeme bilgisini asla kaydetme/);
});

test("Mina discipline does not punish neutral discussion of an insult word", async () => {
  const { worker, disciplineStore } = createWorker();
  const login = await call(worker, "/api/auth/login", { method: "POST", body: { username: "Argion", password: env.ADMIN_PASSWORD } });
  const result = await call(worker, "/api/chat", { token: login.data.token, body: { messages: [{ role: "user", content: "Aptal kelimesinin anlamı nedir?" }] } });
  assert.equal(result.status, 200);
  assert.equal(disciplineStore.row, null);
});

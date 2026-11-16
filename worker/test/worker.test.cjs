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

function createWorker() {
  const requestedModels = [];
  const mockFetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes(":generateContent")) {
      requestedModels.push(target);
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
  const worker = new Function("minaTraining", "fetch", workerSource)(training, mockFetch);
  return { worker, requestedModels };
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

test("health endpoint is public and reports service status", async () => {
  const { worker } = createWorker();
  const result = await call(worker, "/api/health");
  assert.equal(result.status, 200);
  assert.equal(result.data.ok, true);
  assert.equal(result.data.adminAuthConfigured, true);
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
  assert.match(result.data.choices[0].message.content, /Merhaba/);
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
  assert.ok(requestedModels[0].includes("gemini-3.1-pro-preview"), "coding tasks must use the Pro model");
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
  assert.match(frontendSource, /projectsNav.*renderProjectsWorkspace/s);
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

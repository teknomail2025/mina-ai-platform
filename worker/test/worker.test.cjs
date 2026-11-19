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
      liveTokenRequests.push({ url: target, headers: options.headers, payload });
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
        ? [{ text: "Test görsel açıklaması" }, { inlineData: { mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/z9sAAAAASUVORK5CYII=" } }]
        : [{ text: "Gemini test yanıtı" }];
      return new Response(JSON.stringify({ candidates: [{ content: { parts } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    throw new Error("Beklenmeyen dış istek: " + target);
  };
  const memoryStore = { row: null };
  const preferencesStore = { row: null };
  const workspaceStore = { row: null };
  const disciplineStore = { row: null, events: [] };
  const usageStore = new Map();
  const r2Objects = new Map();
  const mockR2 = {
    async put(key,value,options={}) {
      const bytes=value instanceof Uint8Array?value:new Uint8Array(value);
      r2Objects.set(key,{bytes:new Uint8Array(bytes),httpMetadata:options.httpMetadata||{},customMetadata:options.customMetadata||{},size:bytes.byteLength,uploaded:new Date()});
    },
    async get(key) {
      const item=r2Objects.get(key);if(!item)return null;
      return {body:new Response(item.bytes).body,size:item.size,httpMetadata:item.httpMetadata,customMetadata:item.customMetadata,arrayBuffer:async()=>item.bytes.buffer.slice(item.bytes.byteOffset,item.bytes.byteOffset+item.bytes.byteLength)};
    },
    async head(key) { const item=r2Objects.get(key);return item?{size:item.size,customMetadata:item.customMetadata}:null; },
    async delete(keys) { for(const key of (Array.isArray(keys)?keys:[keys]))r2Objects.delete(key); },
    async list(options={}) {
      const all=[...r2Objects.entries()].filter(([key])=>!options.prefix||key.startsWith(options.prefix)).map(([key,item])=>({key,size:item.size,uploaded:item.uploaded,customMetadata:item.customMetadata}));
      return {objects:all,truncated:false,cursor:undefined};
    }
  };
  const usageKey = (userId, type, day) => [userId, type, day].join("|");
  const mockDb = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            first: async () => {
              if (sql.startsWith("INSERT INTO mina_daily_usage") && sql.includes("'file_bytes'")) {
                const key=usageKey(values[0],"file_bytes",values[1]);
                const row=usageStore.get(key)||{used:0};
                if(row.used+values[2]>values[4])return null;
                row.used+=values[2];usageStore.set(key,row);return {used:row.used};
              }
              if (sql.startsWith("INSERT INTO mina_daily_usage")) {
                const key=usageKey(values[0],values[1],values[2]);
                const row=usageStore.get(key)||{used:0};
                if(row.used>=values[4])return null;
                row.used+=1;usageStore.set(key,row);return {used:row.used};
              }
              if (sql.startsWith("SELECT used FROM mina_daily_usage") && sql.includes("'file_bytes'")) return usageStore.get(usageKey(values[0],"file_bytes",values[1]))||null;
              if (sql.startsWith("SELECT used FROM mina_daily_usage")) return usageStore.get(usageKey(values[0],values[1],values[2]))||null;
              return sql.includes("mina_admin_memory") ? memoryStore.row : sql.includes("mina_admin_preferences") ? preferencesStore.row : sql.includes("mina_admin_workspace") ? workspaceStore.row : disciplineStore.row;
            },
            all: async () => ({ results: disciplineStore.events.slice().reverse() }),
            run: async () => {
              if (sql.startsWith("UPDATE mina_daily_usage") && sql.includes("used - ?")) {
                const row=usageStore.get(usageKey(values[2],"file_bytes",values[3]));
                if(row)row.used=Math.max(0,row.used-values[0]);
              } else if (sql.startsWith("UPDATE mina_daily_usage")) {
                const row=usageStore.get(usageKey(values[1],values[2],values[3]));
                if(row)row.used=Math.max(0,row.used-1);
              } else if (sql.startsWith("INSERT INTO mina_admin_workspace")) {
                if (!workspaceStore.row && values[2] === 0) workspaceStore.row = { data_json: values[0], version: 1, updated_at: values[1] };
                else if (workspaceStore.row && workspaceStore.row.version === values[2]) workspaceStore.row = { data_json: values[0], version: workspaceStore.row.version + 1, updated_at: values[1] };
                else return { success: true, meta: { changes: 0 } };
                return { success: true, meta: { changes: 1 } };
              } else if (sql.startsWith("INSERT INTO mina_admin_memory")) {
                memoryStore.row = { memory_text: values[0], updated_at: values[1] };
              } else if (sql.startsWith("INSERT INTO mina_admin_preferences")) {
                preferencesStore.row = { preferences_json: values[0], updated_at: values[1] };
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
              return { success: true, meta: { changes: 1 } };
            }
          };
        },
        first: async () => sql.startsWith("SELECT used FROM mina_daily_usage") ? usageStore.get(usageKey(...values))||null : sql.includes("mina_admin_memory") ? memoryStore.row : sql.includes("mina_admin_preferences") ? preferencesStore.row : sql.includes("mina_admin_workspace") ? workspaceStore.row : disciplineStore.row,
        run: async () => ({ success: true })
      };
    }
  };
  const worker = new Function("minaTraining", "fetch", workerSource)(training, mockFetch);
  const originalFetch = worker.fetch.bind(worker);
  worker.fetch = (request, bindings = {}) => {
    const pathname = new URL(request.url).pathname;
    const needsDisciplineDb = pathname === "/api/files" || pathname === "/api/chat" || pathname === "/api/image" || pathname === "/api/usage" || pathname === "/api/live-minute" || pathname === "/api/live-token" || pathname === "/api/workspace" || pathname === "/api/preferences" || pathname === "/api/discipline/voice-check" || pathname === "/api/discipline/appeal" || pathname.startsWith("/api/admin/discipline");
    return originalFetch(request, { ...(needsDisciplineDb ? { MINA_DB: mockDb } : {}), MINA_FILES: mockR2, ...bindings });
  };
  return { worker, requestedModels, liveTokenRequests, mockDb, disciplineStore, usageStore, usageKey, mockR2, r2Objects };
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
  assert.match(response.headers.get("Access-Control-Allow-Methods") || "", /DELETE/);
  assert.match(response.headers.get("Access-Control-Allow-Headers") || "", /Authorization/i);
});

test("health endpoint is public and reports service status", async () => {
  const { worker } = createWorker();
  const result = await call(worker, "/api/health");
  assert.equal(result.status, 200);
  assert.equal(result.data.ok, true);
  assert.equal(result.data.adminAuthConfigured, true);
});

test("Mina preferences are private and sync through the D1 binding", async () => {
  const { worker } = createWorker();
  const login = await call(worker, "/api/auth/login", { method: "POST", body: { username: "Argion", password: env.ADMIN_PASSWORD } });
  assert.equal(login.status, 200);
  const guest = await call(worker, "/api/preferences");
  assert.equal(guest.status, 401);
  const initial = await call(worker, "/api/preferences", { token: login.data.token });
  assert.equal(initial.status, 200);
  assert.equal(initial.data.initialized, false);
  const preferences = { theme: "light", language: "tr", interfaceLanguage: "en" };
  const saved = await call(worker, "/api/preferences", { method: "PUT", token: login.data.token, body: { preferences } });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.data.preferences, preferences);
  const loaded = await call(worker, "/api/preferences", { token: login.data.token });
  assert.equal(loaded.status, 200);
  assert.equal(loaded.data.initialized, true);
  assert.deepEqual(loaded.data.preferences, preferences);
  const invalid = await call(worker, "/api/preferences", { method: "PUT", token: login.data.token, body: { preferences: { ...preferences, theme: "neon" } } });
  assert.equal(invalid.status, 400);
});

test("workspace data is private, versioned, and rejects stale device writes", async () => {
  const { worker, mockDb } = createWorker();
  const login = await call(worker, "/api/auth/login", { method: "POST", body: { username: "Argion", password: env.ADMIN_PASSWORD } });
  assert.equal(login.status, 200);
  const guest = await call(worker, "/api/workspace");
  assert.equal(guest.status, 401);
  const initial = await call(worker, "/api/workspace", { token: login.data.token, env: { MINA_DB: mockDb } });
  assert.equal(initial.status, 200);
  assert.equal(initial.data.initialized, false);
  assert.equal(initial.data.version, 0);
  const data = {
    conversations: [{ id: "chat-1", title: "Test sohbet", messages: [{ role: "user", content: "Merhaba" }] }],
    projects: [{ id: "project-1", name: "Mina", createdAt: 123 }],
    pinnedIds: ["chat-1"],
    libraryItems: [{ id: "file-1", name: "not.txt", content: "test", createdAt: 123 }]
  };
  const saved = await call(worker, "/api/workspace", { method: "PUT", token: login.data.token, env: { MINA_DB: mockDb }, body: { version: 0, data } });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.version, 1);
  const loaded = await call(worker, "/api/workspace", { token: login.data.token, env: { MINA_DB: mockDb } });
  assert.equal(loaded.data.initialized, true);
  assert.deepEqual(loaded.data.data, data);
  const stale = await call(worker, "/api/workspace", { method: "PUT", token: login.data.token, env: { MINA_DB: mockDb }, body: { version: 0, data: { ...data, projects: [] } } });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.conflict, true);
  const invalid = await call(worker, "/api/workspace", { method: "PUT", token: login.data.token, env: { MINA_DB: mockDb }, body: { version: 1, data: { ...data, libraryItems: [{ id: "x", name: "large.txt", content: "x".repeat(500001) }] } } });
  assert.equal(invalid.status, 400);
});

test("workspace API enforces payload size and D1 configuration", async () => {
  const { worker, mockDb } = createWorker();
  const login = await call(worker, "/api/auth/login", { method: "POST", body: { username: "Argion", password: env.ADMIN_PASSWORD } });
  const missing = await call(worker, "/api/workspace", { token: login.data.token, env: { MINA_DB: null } });
  assert.equal(missing.status, 503);
  const oversized = await call(worker, "/api/workspace", { method: "PUT", token: login.data.token, env: { MINA_DB: mockDb }, body: { version: 0, data: { conversations: [], projects: [], pinnedIds: [], libraryItems: [{ id: "x", name: "huge", content: "x".repeat(500001) }] } } });
  assert.equal(oversized.status, 400);
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

test("remember-me login creates a 30-day session", async () => {
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
  assert.equal(remembered.data.expires_in, 30 * 24 * 60 * 60);
  const rememberedPayload = JSON.parse(Buffer.from(remembered.data.token.split(".")[0], "base64url").toString("utf8"));
  assert.equal(rememberedPayload.remembered, true);
  assert.equal(rememberedPayload.exp - rememberedPayload.iat, 30 * 24 * 60 * 60);
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
  assert.match(requested[0], /gemini-3\.5-flash-lite:generateContent$/);
  assert.match(requested[1], /gemini-3\.1-flash-lite:generateContent$/);
  assert.equal(result.data.fallback_used, true);
});

test("network failures also try the next free-tier model", async () => {
  const requested = [];
  const { worker } = createWorker(async (url) => {
    requested.push(url);
    if (url.includes("gemini-3.5-flash-lite:generateContent")) throw new Error("upstream network unavailable");
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
  assert.equal(result.data.model, "gemini-3.1-flash-lite");
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
  assert.ok(requestedModels[0].includes("gemini-3.5-flash-lite"), "ordinary chat must use the faster Flash-Lite model");
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
      image: { mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/z9sAAAAASUVORK5CYII=" }
    }
  });
  assert.equal(valid.status, 200);
  assert.equal(valid.data.task, "vision");
});

test("daily usage endpoint reports server-side counters and limits", async () => {
  const { worker } = createWorker();
  const login = await call(worker, "/api/auth/login", { method: "POST", body: { username: "Argion", password: env.ADMIN_PASSWORD } });
  const result = await call(worker, "/api/usage", { token: login.data.token });
  assert.equal(result.status, 200);
  assert.equal(result.data.timezone, "Europe/Istanbul");
  assert.deepEqual(result.data.usage.chat, { used: 0, limit: 5, remaining: 5 });
  assert.deepEqual(result.data.usage.image_generation, { used: 0, limit: 5, remaining: 5 });
  assert.deepEqual(result.data.usage.image_analysis, { used: 0, limit: 5, remaining: 5 });
  assert.deepEqual(result.data.usage.live_minutes, { used: 0, limit: 10, remaining: 10 });
  assert.deepEqual(result.data.usage.files, { usedBytes: 0, limitBytes: 104857600, remainingBytes: 104857600 });
});

test("image generation enforces five successful requests per Istanbul day", async () => {
  const { worker, requestedModels } = createWorker();
  const login = await call(worker, "/api/auth/login", { method: "POST", body: { username: "Argion", password: env.ADMIN_PASSWORD } });
  for (let i=0;i<5;i++) {
    const result=await call(worker,"/api/image",{token:login.data.token,body:{prompt:"A test image "+i}});
    assert.equal(result.status,200);
  }
  const blocked=await call(worker,"/api/image",{token:login.data.token,body:{prompt:"One more image"}});
  assert.equal(blocked.status,429);
  assert.equal(blocked.data.quota.remaining,0);
  assert.equal(requestedModels.length,5);
});

test("normal AI requests are limited to five per Istanbul day", async () => {
  const { worker, requestedModels } = createWorker();
  const login = await call(worker, "/api/auth/login", { method: "POST", body: { username: "Argion", password: env.ADMIN_PASSWORD } });
  for (let i=0;i<5;i++) {
    const result=await call(worker,"/api/chat",{token:login.data.token,body:{messages:[{role:"user",content:"Create a fresh idea number "+i}]}});
    assert.equal(result.status,200);
  }
  const blocked=await call(worker,"/api/chat",{token:login.data.token,body:{messages:[{role:"user",content:"Create one more fresh idea"}]}});
  assert.equal(blocked.status,429);
  assert.equal(blocked.data.quota.remaining,0);
  assert.equal(requestedModels.length,5);
});

test("image analysis has its own five-request daily quota", async () => {
  const { worker, requestedModels } = createWorker();
  const login = await call(worker, "/api/auth/login", { method: "POST", body: { username: "Argion", password: env.ADMIN_PASSWORD } });
  const image={mimeType:"image/png",data:"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/z9sAAAAASUVORK5CYII="};
  for (let i=0;i<5;i++) {
    const result=await call(worker,"/api/chat",{token:login.data.token,body:{messages:[{role:"user",content:"Describe this image"}],image}});
    assert.equal(result.status,200);
  }
  const blocked=await call(worker,"/api/chat",{token:login.data.token,body:{messages:[{role:"user",content:"Describe this image again"}],image}});
  assert.equal(blocked.status,429);
  assert.equal(blocked.data.quota.type,"image_analysis");
  assert.equal(requestedModels.length,5);
});

test("Live voice is limited to ten server-counted minutes per Istanbul day", async () => {
  const { worker }=createWorker();
  const login=await call(worker,"/api/auth/login",{method:"POST",body:{username:"Argion",password:env.ADMIN_PASSWORD}});
  for(let minute=0;minute<10;minute++){
    const result=await call(worker,"/api/live-minute",{token:login.data.token,body:{}});
    assert.equal(result.status,200);
    assert.equal(result.data.usedMinutes,minute+1);
  }
  const blocked=await call(worker,"/api/live-minute",{token:login.data.token,body:{}});
  assert.equal(blocked.status,429);
  assert.equal(blocked.data.quota.remaining,0);
});

test("daily 100 MB file quota is enforced at R2 upload time", async () => {
  const { worker, usageStore, usageKey }=createWorker();
  const login=await call(worker,"/api/auth/login",{method:"POST",body:{username:"Argion",password:env.ADMIN_PASSWORD}});
  const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  usageStore.set(usageKey("Argion","file_bytes",day),{used:100*1024*1024});
  const result=await call(worker,"/api/files",{method:"POST",token:login.data.token,body:{name:"notes.txt",data:Buffer.from("one more byte").toString("base64")}});
  assert.equal(result.status,429);
  assert.equal(result.data.fileQuota.remainingBytes,0);
  assert.equal(usageStore.get(usageKey("Argion","file_bytes",day)).used,100*1024*1024);
});

test("failed document processing refunds chat usage but keeps uploaded-byte quota", async () => {
  const { worker }=createWorker(async()=>new Response(JSON.stringify({error:{message:"temporary failure"}}),{status:503}));
  const login=await call(worker,"/api/auth/login",{method:"POST",body:{username:"Argion",password:env.ADMIN_PASSWORD}});
  const content="label start:\\n    return";
  const uploaded=await call(worker,"/api/files",{method:"POST",token:login.data.token,body:{name:"main.rpy",data:Buffer.from(content).toString("base64")}});
  assert.equal(uploaded.status,201);
  const result=await call(worker,"/api/chat",{token:login.data.token,body:{
    messages:[{role:"user",content:"Review this script"}],
    fileAttachment:{name:"main.rpy"},
    storedFileId:uploaded.data.id
  }});
  assert.equal(result.status,502);
  const usage=await call(worker,"/api/usage",{token:login.data.token});
  assert.equal(usage.data.usage.chat.used,0);
  assert.equal(usage.data.usage.files.usedBytes,new TextEncoder().encode(content).byteLength);
});

test("chat accepts a validated temporary text attachment and accounts its original bytes", async () => {
  let capturedPayload;
  const { worker } = createWorker(async (url, options) => {
    capturedPayload=JSON.parse(options.body||"{}");
    return new Response(JSON.stringify({candidates:[{content:{parts:[{text:"Dosya incelendi."}]}}]}),{status:200});
  });
  const login=await call(worker,"/api/auth/login",{method:"POST",body:{username:"Argion",password:env.ADMIN_PASSWORD}});
  const content="label start:\\n    return";
  const uploaded=await call(worker,"/api/files",{token:login.data.token,method:"POST",body:{name:"script.rpy",data:Buffer.from(content).toString("base64")}});
  assert.equal(uploaded.status,201);
  const result=await call(worker,"/api/chat",{token:login.data.token,body:{
    messages:[{role:"user",content:"Bu Ren'Py dosyasını incele."}],
    fileAttachment:{name:"script.rpy"},
    storedFileId:uploaded.data.id
  }});
  assert.equal(result.status,200);
  assert.ok(capturedPayload.contents[0].parts[1].text.includes("script.rpy"));
  assert.ok(capturedPayload.contents[0].parts[1].text.includes(content));
  assert.ok(!capturedPayload.contents[0].parts[1].text.includes("CLIENT-SUPPLIED"));
  const usage=await call(worker,"/api/usage",{token:login.data.token});
  assert.equal(usage.data.usage.files.usedBytes,new TextEncoder().encode(content).byteLength);
});

test("chat rejects client-supplied text content and requires the R2 source file", async () => {
  const { worker, requestedModels }=createWorker();
  const login=await call(worker,"/api/auth/login",{method:"POST",body:{username:"Argion",password:env.ADMIN_PASSWORD}});
  const original="trusted stored source";
  const uploaded=await call(worker,"/api/files",{token:login.data.token,method:"POST",body:{name:"source.txt",data:Buffer.from(original).toString("base64")}});
  assert.equal(uploaded.status,201);
  const result=await call(worker,"/api/chat",{token:login.data.token,body:{
    messages:[{role:"user",content:"Read the file"}],
    fileAttachment:{name:"source.txt",content:"forged client content"},
    storedFileId:uploaded.data.id
  }});
  assert.equal(result.status,400);
  assert.equal(requestedModels.length,0);
});

test("file upload rejects files larger than 10 MB", async () => {
  const { worker, r2Objects }=createWorker();
  const login=await call(worker,"/api/auth/login",{method:"POST",body:{username:"Argion",password:env.ADMIN_PASSWORD}});
  const result=await call(worker,"/api/files",{token:login.data.token,method:"POST",body:{
    name:"large.txt",data:Buffer.alloc(10*1024*1024+1,120).toString("base64")
  }});
  assert.equal(result.status,400);
  assert.equal(r2Objects.size,0);
});

test("chat sends a validated, stored PDF attachment to Gemini as application/pdf", async () => {
  let capturedPayload;
  const { worker }=createWorker(async(url,options)=>{
    capturedPayload=JSON.parse(options.body||"{}");
    return new Response(JSON.stringify({candidates:[{content:{parts:[{text:"PDF incelendi."}]}}]}),{status:200});
  });
  const login=await call(worker,"/api/auth/login",{method:"POST",body:{username:"Argion",password:env.ADMIN_PASSWORD}});
  const pdf=Buffer.from("%PDF-1.4\\n%%EOF").toString("base64");
  const uploaded=await call(worker,"/api/files",{token:login.data.token,method:"POST",body:{name:"report.pdf",data:pdf}});
  assert.equal(uploaded.status,201);
  const result=await call(worker,"/api/chat",{token:login.data.token,body:{
    messages:[{role:"user",content:"PDF dosyasını özetle."}],
    document:{mimeType:"application/pdf"},
    storedFileId:uploaded.data.id
  }});
  assert.equal(result.status,200);
  assert.equal(capturedPayload.contents[0].parts[1].inlineData.mimeType,"application/pdf");
  assert.equal(capturedPayload.contents[0].parts[1].inlineData.data,pdf);
});

test("image generation requires an authenticated session", async () => {
  const { worker, requestedModels } = createWorker();
  const result = await call(worker, "/api/image", { body: { prompt: "A test image" } });
  assert.equal(result.status, 401);
  assert.equal(requestedModels.length, 0);
});

test("image generation uses Nano Banana 2.1 with explicit 1K square output and validates returned PNG", async () => {
  let capturedPayload;
  const { worker, requestedModels } = createWorker(async (url, options) => {
    capturedPayload = JSON.parse(options.body || "{}");
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [
      { text: "Test görsel açıklaması" },
      { inlineData: { mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/z9sAAAAASUVORK5CYII=" } }
    ] } }] }), { status: 200 });
  });
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
  assert.equal(result.data.image.data, "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/z9sAAAAASUVORK5CYII=");
  assert.ok(requestedModels[0].includes("gemini-nano-banana-2.1"));
  assert.deepEqual(capturedPayload.generationConfig.responseModalities, ["TEXT", "IMAGE"]);
  assert.deepEqual(capturedPayload.generationConfig.imageConfig, { aspectRatio: "1:1", imageSize: "1K" });
});

test("image generation rejects malformed provider image bytes", async () => {
  const { worker } = createWorker(async () => new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "aGVsbG8=" } }] } }]
  }), { status: 200 }));
  const login = await call(worker, "/api/auth/login", {
    method: "POST",
    body: { username: "Argion", password: env.ADMIN_PASSWORD }
  });
  const result = await call(worker, "/api/image", {
    method: "POST",
    token: login.data.token,
    body: { prompt: "A test image" }
  });
  assert.equal(result.status, 502);
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

test("chat UI supports 10 MB PDF DOCX TXT and Ren'Py attachments", () => {
  const html=fs.readFileSync(path.join(workerDir,"..","index.html"),"utf8");
  assert.match(html,/\.pdf/);
  assert.match(html,/\.docx/);
  assert.match(html,/\.rpy/);
  assert.match(html,/mammoth@1\.9\.0/);
  assert.match(frontendSource,/f\.size>10\*1024\*1024/);
  assert.match(frontendSource,/mammoth\.extractRawText/);
  assert.match(frontendSource,/kind==="pdf"/);
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
  assert.match(frontendSource, /persistWorkspaceCollection\(PINNED_KEY,pinnedIds\)/);
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
      image: { mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/z9sAAAAASUVORK5CYII=" },
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


test("Gemini 503 on ordinary chat switches to a different Flash-Lite model", async () => {
  const { worker, requestedModels } = createWorker(async target => {
    if (target.includes("gemini-3.5-flash-lite:generateContent")) {
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
  assert.equal(result.data.requested_model, "gemini-3.5-flash-lite");
  assert.equal(result.data.model, "gemini-3.1-flash-lite");
  assert.equal(result.data.fallback_used, true);
  assert.equal(requestedModels.length, 2, "fallback must use a different model, not repeat the overloaded model");
  assert.ok(requestedModels[0].includes("gemini-3.5-flash-lite"));
  assert.ok(requestedModels[1].includes("gemini-3.1-flash-lite"));
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
  assert.ok(frontendSource.includes('addMessage("assistant", answer.trim() + sourceText + retentionText'));
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
  assert.equal(liveTokenRequests[0].url, "https://generativelanguage.googleapis.com/v1beta/auth_tokens");
  assert.equal(liveTokenRequests[0].payload.uses, 1);
  assert.ok(liveTokenRequests[0].payload.expireTime);
  assert.ok(liveTokenRequests[0].payload.newSessionExpireTime);
  const setup = liveTokenRequests[0].payload.bidiGenerateContentSetup;
  assert.equal(setup.model, "models/gemini-3.8-live");
  assert.deepEqual(setup.generationConfig.responseModalities, ["AUDIO"]);
  assert.equal(setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, "Aoede");
  assert.ok(setup.inputAudioTranscription);
  assert.ok(setup.outputAudioTranscription);
  assert.ok(setup.sessionResumption);
  assert.deepEqual(setup.realtimeInputConfig.automaticActivityDetection, { disabled: false });
  assert.match(setup.systemInstruction.parts[0].text, /AİLE ROLLERİ/);
  assert.equal(liveTokenRequests[0].payload.authToken, undefined);
  assert.equal(liveTokenRequests[0].payload.liveConnectConstraints, undefined);
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

test("chat loads durable D1 memory into Gemini system context and reports generation diagnostics", async () => {
  let capturedPayload;
  const { worker, mockDb } = createWorker(async (url, options) => {
    capturedPayload = JSON.parse(options.body || "{}");
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "Hafızanı dikkate alarak yanıtlıyorum." }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 42, candidatesTokenCount: 12, thoughtsTokenCount: 3 }
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  const login = await call(worker, "/api/auth/login", { method: "POST", body: { username: "Argion", password: env.ADMIN_PASSWORD } });
  const saved = await call(worker, "/api/memory", { method: "PUT", token: login.data.token, env: { MINA_DB: mockDb }, body: { memory: "Mina değişiklikleri yayımlamadan önce test etmelidir." } });
  assert.equal(saved.status, 200);
  const result = await call(worker, "/api/chat", {
    token: login.data.token,
    body: { messages: [{ role: "user", content: "Mina projesinde nelere dikkat edelim?" }] }
  });
  assert.equal(result.status, 200);
  const systemPrompt = capturedPayload.systemInstruction.parts[0].text;
  const userPrompt = capturedPayload.contents[0].parts[0].text;
  assert.match(systemPrompt, /KALICI KULLANICI HAFIZASI \(D1\)/);
  assert.match(systemPrompt, /Mina değişiklikleri yayımlamadan önce test etmelidir/);
  assert.equal(userPrompt, "Mina projesinde nelere dikkat edelim?");
  assert.equal(result.data.generation.finish_reason, "STOP");
  assert.equal(result.data.generation.prompt_tokens, 42);
  assert.equal(result.data.generation.output_tokens, 12);
  assert.ok(result.data.generation.duration_ms >= 0);
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


test("Wrangler declares isolated Worker Preview settings", () => {
  const config = fs.readFileSync(path.join(workerDir, "wrangler.toml"), "utf8");
  assert.match(config, /^preview_urls = true$/m);
  assert.match(config, /^\[previews\.vars\]$/m);
  assert.match(config, /^\[\[previews\.d1_databases\]\]$/m);
  assert.match(config, /^database_name = "mina-ai-db-preview"$/m);
  assert.match(config, /^database_id = "[0-9a-f-]{36}"$/m);
  assert.match(config, /^\[\[previews\.r2_buckets\]\]$/m);
  assert.match(config, /^bucket_name = "mina-temporary-files-preview"$/m);
  assert.doesNotMatch(config, /^previews = \{\}$/m);
});

test("temporary R2 files require login, retain original bytes, and can be downloaded and deleted", async () => {
  const { worker, r2Objects } = createWorker();
  const guest = await call(worker, "/api/files", { method: "POST", body: { name: "hello.txt", data: "aGVsbG8=" } });
  assert.equal(guest.status, 401);
  const login = await call(worker, "/api/auth/login", { method: "POST", body: { username: "Argion", password: env.ADMIN_PASSWORD } });
  const uploaded = await call(worker, "/api/files", { token: login.data.token, method: "POST", body: { name: "hello.txt", data: "aGVsbG8=" } });
  assert.equal(uploaded.status, 201);
  assert.equal(uploaded.data.name, "hello.txt");
  assert.equal(uploaded.data.size, 5);
  assert.equal(uploaded.data.expiresAt-uploaded.data.uploadedAt, 24*60*60*1000);
  assert.equal(r2Objects.size, 1);
  const listed = await call(worker, "/api/files", { token: login.data.token });
  assert.equal(listed.status, 200);
  assert.equal(listed.data.files.length, 1);
  const downloaded = await worker.fetch(new Request("https://mina-test.workers.dev"+uploaded.data.downloadPath,{headers:{Origin:"https://teknomail2025.github.io",Authorization:"Bearer "+login.data.token}}),{...env});
  assert.equal(downloaded.status, 200);
  assert.equal(await downloaded.text(), "hello");
  assert.match(downloaded.headers.get("Content-Disposition"), /hello.txt/);
  const removed = await call(worker, uploaded.data.downloadPath, { method: "DELETE", token: login.data.token });
  assert.equal(removed.status, 200);
  assert.equal(r2Objects.size, 0);
});

test("expired R2 files cannot be downloaded and are removed on access", async () => {
  const { worker, mockR2, r2Objects }=createWorker();
  const login=await call(worker,"/api/auth/login",{method:"POST",body:{username:"Argion",password:env.ADMIN_PASSWORD}});
  const id="123e4567-e89b-42d3-a456-426614174000";
  await mockR2.put("Argion/"+id,Uint8Array.of(65),{customMetadata:{owner:"Argion",fileName:"expired.txt",expiresAt:String(Date.now()-1)}});
  const result=await call(worker,"/api/files/"+id,{token:login.data.token});
  assert.equal(result.status,404);
  assert.equal(r2Objects.has("Argion/"+id),false);
});

test("temporary file endpoint rejects invalid types, malformed base64 and oversized content", async () => {
  const { worker } = createWorker();
  const login = await call(worker, "/api/auth/login", { method: "POST", body: { username: "Argion", password: env.ADMIN_PASSWORD } });
  for (const body of [
    { name: "malware.exe", data: "aGVsbG8=" },
    { name: "bad.txt", data: "not base64!" },
    { name: "../secret.txt", data: "aGVsbG8=" }
  ]) {
    const result = await call(worker, "/api/files", { token: login.data.token, method: "POST", body });
    assert.equal(result.status, 400);
  }
});

test("scheduled cleanup deletes expired R2 objects and keeps live files", async () => {
  const { worker, mockR2, r2Objects } = createWorker();
  await mockR2.put("Argion/expired",Uint8Array.of(1),{customMetadata:{owner:"Argion",expiresAt:String(Date.now()-1000)}});
  await mockR2.put("Argion/live",Uint8Array.of(2),{customMetadata:{owner:"Argion",expiresAt:String(Date.now()+60000)}});
  await mockR2.put("unrelated/keep",Uint8Array.of(3),{customMetadata:{expiresAt:String(Date.now()-1000)}});
  await worker.scheduled({}, {...env,MINA_FILES:mockR2});
  assert.equal(r2Objects.has("Argion/expired"), false);
  assert.equal(r2Objects.has("Argion/live"), true);
  assert.equal(r2Objects.has("unrelated/keep"), true);
});

test("file quota uses the original uploaded binary size rather than extracted text size", () => {
  assert.ok(workerSource.includes("env.MINA_FILES.get(key)"));
  assert.ok(workerSource.includes("attachmentBytes=Number(storedAttachment.size)"));
  assert.ok(workerSource.includes("new Uint8Array(await storedAttachment.arrayBuffer())"));
  assert.ok(frontendSource.includes("storedFileId:storedFile?.id"));
  assert.ok(frontendSource.includes("rawBase64:await fileToBase64(f)"));
  assert.ok(frontendSource.includes("m.fileId"));
});

test("chat attachment quota is based on the stored original R2 object size", async () => {
  const { worker, mockR2, usageStore, usageKey } = createWorker();
  const login = await call(worker, "/api/auth/login", { method: "POST", body: { username: "Argion", password: env.ADMIN_PASSWORD } });
  const uploaded = await call(worker, "/api/files", { token: login.data.token, method: "POST", body: { name: "source.txt", data: "aGVsbG8gd29ybGQ=" } });
  assert.equal(uploaded.status, 201);
  const result = await call(worker, "/api/chat", {
    token: login.data.token,
    body: {
      messages: [{ role: "user", content: "Bu dosyayı özetle." }],
      fileAttachment: { name: "source.txt" },
      storedFileId: uploaded.data.id
    }
  });
  assert.equal(result.status, 200);
  assert.ok([...usageStore.entries()].some(([key,value])=>key.includes("|file_bytes|")&&value.used===11));
});

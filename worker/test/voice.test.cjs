const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("voice moderation preserves every completed utterance and checks them in order", async () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "voice.js"), "utf8");
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id, hidden: true, disabled: false, textContent: "", text: "", dataset: {},
      handlers: {}, addEventListener(name, callback) { (this.handlers[name] ||= []).push(callback); }
    });
    return elements.get(id);
  };
  let socket;
  let firstModerationResolve;
  const moderationRequests = [];
  const fetch = async (url, options = {}) => {
    if (String(url).endsWith("/api/live-token")) {
      return { ok: true, status: 200, json: async () => ({ token: "ephemeral-test-token", model: "models/gemini-3.8-live" }) };
    }
    if (String(url).endsWith("/api/discipline/voice-check")) {
      const payload = JSON.parse(options.body);
      moderationRequests.push(payload.text);
      if (moderationRequests.length === 1) {
        return new Promise(resolve => { firstModerationResolve = () => resolve({ status: 200, json: async () => ({ ok: true }) }); });
      }
      return { status: 200, json: async () => ({ ok: true }) };
    }
    throw new Error("Unexpected fetch: " + url);
  };
  class FakeWebSocket {
    static OPEN = 1;
    constructor(url) { this.url = url; this.readyState = 1; socket = this; }
    send(value) { this.lastSent = value; }
    close() { this.readyState = 3; this.onclose?.(); }
  }
  class FakeAudioContext {
    constructor() { this.sampleRate = 48000; this.currentTime = 0; this.destination = {}; }
    async resume() {}
    async close() {}
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createScriptProcessor() { return { connect() {}, disconnect() {}, onaudioprocess: null }; }
    createGain() { return { gain: { value: 1 }, connect() {} }; }
  }
  const window = { MINA_API_BASE: "https://mina.test", MinaI18n: { t: value => value }, WebSocket: FakeWebSocket, AudioContext: FakeAudioContext, addEventListener() {} };
  const document = { getElementById: element };
  const navigator = { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } };
  const context = {
    window, document, navigator, fetch, WebSocket: FakeWebSocket,
    AudioContext: FakeAudioContext, setTimeout, clearTimeout, console,
    btoa: value => Buffer.from(value, "binary").toString("base64"),
    atob: value => Buffer.from(value, "base64").toString("binary")
  };
  vm.runInNewContext(source, context, { filename: "voice.js" });
  for (const handler of element("voiceModeBtn").handlers.click) await handler();
  for (let i = 0; i < 20 && !socket; i++) await new Promise(resolve => setImmediate(resolve));
  assert.ok(socket, "voice startup must create the WebSocket");
  socket.onopen();
  socket.onmessage({ data: JSON.stringify({ setupComplete: {} }) });
  socket.onmessage({ data: JSON.stringify({ serverContent: { inputTranscription: { text: "İlk " } } }) });
  socket.onmessage({ data: JSON.stringify({ serverContent: { inputTranscription: { text: "konuşma" } } }) });
  socket.onmessage({ data: JSON.stringify({ serverContent: { turnComplete: true } }) });
  for (let i = 0; i < 20 && moderationRequests.length === 0; i++) await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(moderationRequests, ["İlk konuşma"]);
  socket.onmessage({ data: JSON.stringify({ serverContent: { inputTranscription: { text: "İkinci konuşma" } } }) });
  socket.onmessage({ data: JSON.stringify({ serverContent: { turnComplete: true } }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(moderationRequests, ["İlk konuşma"], "second utterance must wait rather than be silently dropped");
  firstModerationResolve();
  for (let i = 0; i < 20 && moderationRequests.length < 2; i++) await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(moderationRequests, ["İlk konuşma", "İkinci konuşma"]);
  for (const handler of element("liveVoiceClose").handlers.click) await handler();
});

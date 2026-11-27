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
  let microphoneConstraints;
  let audioContext;
  let processor;
  let microphoneStopped = false;
  const moderationRequests = [];
  const fetch = async (url, options = {}) => {
    if (String(url).endsWith("/api/live-token")) {
      return { ok: true, status: 200, json: async () => ({ token: "ephemeral-test-token", model: "models/gemini-3.8-live" }) };
    }
    if (String(url).endsWith("/api/live-minute")) {
      return { ok: true, status: 200, json: async () => ({ ok: true, usedMinutes: 1, remainingMinutes: 9 }) };
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
    constructor(url) { this.url = url; this.readyState = 1; this.sent = []; socket = this; }
    send(value) { this.lastSent = value; this.sent.push(value); }
    close() { this.readyState = 3; this.onclose?.(); }
  }
  class FakeAudioContext {
    constructor() { this.sampleRate = 48000; this.currentTime = 0; this.destination = {}; audioContext = this; }
    async resume() {}
    async close() { this.closed = true; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createScriptProcessor() { processor = { connect() {}, disconnect() {}, onaudioprocess: null }; return processor; }
    createGain() { return { gain: { value: 1 }, connect() {} }; }
  }
  const window = { MINA_API_BASE: "https://mina.test", MinaI18n: { t: value => value }, WebSocket: FakeWebSocket, AudioContext: FakeAudioContext, addEventListener() {} };
  const document = { getElementById: element };
  const microphoneTrack = { enabled: true, stop() { microphoneStopped = true; } };
  const microphoneStream = { getTracks: () => [microphoneTrack], getAudioTracks: () => [microphoneTrack] };
  const navigator = { mediaDevices: { getUserMedia: async constraints => { microphoneConstraints = constraints; return microphoneStream; } } };
  const context = {
    window, document, navigator, fetch, WebSocket: FakeWebSocket,
    AudioContext: FakeAudioContext, setTimeout, clearTimeout, setInterval, clearInterval, console,
    btoa: value => Buffer.from(value, "binary").toString("base64"),
    atob: value => Buffer.from(value, "base64").toString("binary")
  };
  vm.runInNewContext(source, context, { filename: "voice.js" });
  for (const handler of element("voiceModeBtn").handlers.click) await handler();
  for (let i = 0; i < 20 && !socket; i++) await new Promise(resolve => setImmediate(resolve));
  assert.ok(socket, "voice startup must create the WebSocket");
  assert.equal(socket.url, "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=ephemeral-test-token");
  socket.onopen();
  const setupFrame = JSON.parse(socket.lastSent);
  assert.equal(setupFrame.setup.model, "models/gemini-3.8-live");
  assert.deepEqual(setupFrame.setup.generationConfig.responseModalities, ["AUDIO"]);
  assert.ok(setupFrame.setup.inputAudioTranscription);
  assert.ok(setupFrame.setup.outputAudioTranscription);
  socket.onmessage({ data: JSON.stringify({ setupComplete: {} }) });
  for (let i = 0; i < 20 && !processor; i++) await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(JSON.parse(JSON.stringify(microphoneConstraints)), { audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  assert.ok(processor, "live voice must connect the microphone processor after setup and quota approval");
  for (const handler of element("liveVoiceMute").handlers.click) handler();
  assert.equal(element("liveVoiceStatus").textContent, "Mikrofon kapalı");
  assert.equal(microphoneTrack.enabled, false, "muting must disable microphone capture at the device track");
  processor.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(2048).fill(0.25) } });
  assert.equal(socket.sent.length, 1, "muting must stop audio frames from being sent");
  for (const handler of element("liveVoiceMute").handlers.click) handler();
  assert.equal(microphoneTrack.enabled, true, "unmuting must enable microphone capture again");
  processor.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(2048).fill(0.25) } });
  const audioFrame = JSON.parse(socket.lastSent);
  assert.equal(audioFrame.realtimeInput.audio.mimeType, "audio/pcm;rate=16000");
  assert.ok(audioFrame.realtimeInput.audio.data);
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
  assert.equal(microphoneStopped, true, "ending voice chat must stop microphone tracks");
  assert.equal(audioContext.closed, true, "ending voice chat must close the audio context");
  assert.equal(element("liveVoice").hidden, true);
});

test("closing live voice while microphone permission is pending stops the late stream", async () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "voice.js"), "utf8");
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id, hidden: true, disabled: false, textContent: "", text: "", dataset: {},
      handlers: {}, addEventListener(name, callback) { (this.handlers[name] ||= []).push(callback); }
    });
    return elements.get(id);
  };
  let resolvePermission;
  let socketCount = 0;
  let microphoneStopped = false;
  const track = { enabled: true, stop() { microphoneStopped = true; } };
  class FakeWebSocket { constructor() { socketCount++; } }
  class FakeAudioContext { async resume() {} async close() {} }
  const fetch = async () => ({ ok: true, status: 200, json: async () => ({ token: "short-lived-test-token", model: "models/gemini-live" }) });
  const window = { MINA_API_BASE: "https://mina.test", MinaI18n: { t: value => value }, WebSocket: FakeWebSocket, AudioContext: FakeAudioContext, addEventListener() {} };
  const document = { getElementById: element };
  const navigator = { mediaDevices: { getUserMedia: () => new Promise(resolve => { resolvePermission = resolve; }) } };
  const context = { window, document, navigator, fetch, WebSocket: FakeWebSocket, AudioContext: FakeAudioContext, setTimeout, clearTimeout, setInterval, clearInterval, console, btoa: value => Buffer.from(value, "binary").toString("base64"), atob: value => Buffer.from(value, "base64").toString("binary") };
  vm.runInNewContext(source, context, { filename: "voice.js" });
  for (const handler of element("voiceModeBtn").handlers.click) handler();
  for (let i = 0; i < 20 && !resolvePermission; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof resolvePermission, "function", "startup must request microphone access");
  for (const handler of element("liveVoiceClose").handlers.click) await handler();
  assert.equal(element("liveVoice").hidden, true);
  resolvePermission({ getTracks: () => [track], getAudioTracks: () => [track] });
  for (let i = 0; i < 20 && !microphoneStopped; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(microphoneStopped, true, "a stream arriving after close must be stopped immediately");
  assert.equal(socketCount, 0, "a closed voice session must not connect to the provider after permission resolves");
});

test("muting while microphone permission is pending disables the track when it arrives", async () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "voice.js"), "utf8");
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id, hidden: true, disabled: false, textContent: "", text: "", dataset: {},
      handlers: {}, addEventListener(name, callback) { (this.handlers[name] ||= []).push(callback); }
    });
    return elements.get(id);
  };
  let resolvePermission;
  let socketCount = 0;
  const track = { enabled: true, stopped: false, stop() { this.stopped = true; } };
  class FakeWebSocket { constructor() { socketCount++; } }
  class FakeAudioContext { async resume() {} async close() {} }
  const fetch = async () => ({ ok: true, json: async () => ({ token: "short-lived-test-token", model: "models/gemini-live" }) });
  const window = { MINA_API_BASE: "https://mina.test", MinaI18n: { t: value => value }, WebSocket: FakeWebSocket, AudioContext: FakeAudioContext, addEventListener() {} };
  const document = { getElementById: element };
  const navigator = { mediaDevices: { getUserMedia: () => new Promise(resolve => { resolvePermission = resolve; }) } };
  const context = { window, document, navigator, fetch, WebSocket: FakeWebSocket, AudioContext: FakeAudioContext, setTimeout, clearTimeout, setInterval, clearInterval, console, btoa: value => Buffer.from(value, "binary").toString("base64"), atob: value => Buffer.from(value, "base64").toString("binary") };
  vm.runInNewContext(source, context, { filename: "voice.js" });
  for (const handler of element("voiceModeBtn").handlers.click) handler();
  for (let i = 0; i < 20 && !resolvePermission; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof resolvePermission, "function", "startup must request microphone access");
  for (const handler of element("liveVoiceMute").handlers.click) handler();
  assert.equal(element("liveVoiceStatus").textContent, "Mikrofon kapalı");
  resolvePermission({ getTracks: () => [track], getAudioTracks: () => [track] });
  for (let i = 0; i < 20 && socketCount === 0; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(socketCount, 1, "voice startup may continue after the microphone stream arrives");
  assert.equal(track.enabled, false, "a mute chosen before permission resolves must disable device capture immediately");
  for (const handler of element("liveVoiceClose").handlers.click) await handler();
  assert.equal(track.stopped, true, "closing must stop the microphone track");
});

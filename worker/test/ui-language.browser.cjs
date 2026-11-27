const assert = require("node:assert/strict");
const { chromium } = require("playwright");

let stage = "launching Chromium";
const watchdog = setTimeout(() => {
  console.error("Browser UI language test timed out at stage: " + stage);
  process.exit(1);
}, 120000);

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]
  });
  const page = await browser.newPage();
  stage = "opening the app and signing in";
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(30000);
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.addInitScript(() => { window.MINA_API_BASE = "http://127.0.0.1:8787"; });

  const untranslatedTurkishUi = () => page.evaluate(() => {
    const turkish = /[çğıöşüÇĞİÖŞÜ]/;
    const found = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const value = node.nodeValue.trim();
      if (!value || !turkish.test(value)) continue;
      if (node.parentElement.closest("script,style,code,pre,textarea,input,.bubble,[data-i18n-ignore]")) continue;
      found.push(value);
    }
    for (const element of document.querySelectorAll("[placeholder],[title],[aria-label],[aria-description],[aria-roledescription],[alt],[data-prompt],[data-tooltip]")) {
      if (element.closest("[data-i18n-ignore]")) continue;
      for (const name of ["placeholder", "title", "aria-label", "aria-description", "aria-roledescription", "alt", "data-prompt", "data-tooltip"]) {
        const value = element.getAttribute(name);
        if (value && turkish.test(value)) found.push(name + ": " + value);
      }
    }
    return [...new Set(found)];
  });
  const openSettings = async () => {
    if (!(await page.locator("#workspaceDialog").isHidden())) await closeDialog();
    await page.locator("#sidebarProfile").click();
    await page.locator('[data-settings-section="language"]').click();
    await page.locator("#minaUiLanguageSelect").waitFor();
  };
  const closeDialog = async () => {
    await page.locator("#workspaceDialogClose").click();
    await page.waitForFunction(() => document.getElementById("workspaceDialog").hidden, null, { timeout: 15000 });
  };

  try {
    await page.goto("http://127.0.0.1:8000/", { waitUntil: "networkidle" });
    await page.locator("#minaLogin").waitFor({ state: "visible" });
    assert.equal(await page.locator(".mina-login-card .eyebrow").innerText(), "ÖZEL YÖNETİCİ ALANI");
    assert.equal(await page.locator("#minaLoginSubmit").innerText(), "Giriş yap");
    await page.locator("#minaUsername").fill("Argion");
    await page.locator("#minaPassword").fill("ci-test-password-at-least-12");
    await page.locator("#minaLoginSubmit").click();
    await page.locator("body.mina-authenticated").waitFor();
    stage = "testing Gemini Live voice transport with isolated browser fakes";
    const liveTokenRequests = [];
    const liveMinuteRequests = [];
    await page.route("http://127.0.0.1:8787/api/live-token", async route => {
      liveTokenRequests.push(route.request().method());
      await page.evaluate(() => window.__voiceTest.events.push("token-request"));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ token: "ephemeral-ci-live-token", model: "models/gemini-live-test" }) });
    });
    await page.route("http://127.0.0.1:8787/api/live-minute", async route => {
      liveMinuteRequests.push(route.request().method());
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ used: liveMinuteRequests.length, limit: 10, remaining: 10 - liveMinuteRequests.length }) });
    });
    await page.evaluate(() => {
      window.__voiceTest = { sockets: [], sent: [], audioFrames: [], played: 0, context: null, processor: null, track: null, constraints: null, events: [] };
      class FakeAudioContext {
        constructor() { this.sampleRate = 48000; this.currentTime = 0; this.destination = {}; window.__voiceTest.context = this; }
        async resume() {}
        async close() { this.closed = true; }
        createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
        createScriptProcessor() {
          const node = { onaudioprocess: null, connect() {}, disconnect() {} };
          window.__voiceTest.processor = node;
          return node;
        }
        createGain() { return { gain: { value: 1 }, connect() {} }; }
        createBuffer(_channels, length, rate) { const samples = new Float32Array(length); return { duration: length / rate, getChannelData: () => samples }; }
        createBufferSource() { return { connect() {}, start() { window.__voiceTest.played++; }, stop() {}, onended: null }; }
      }
      class FakeWebSocket {
        static OPEN = 1;
        constructor(url) {
          this.url = url; this.readyState = 0;
          window.__voiceTest.sockets.push(this);
          setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 0);
        }
        send(raw) {
          const message = JSON.parse(raw);
          window.__voiceTest.sent.push(message);
          if (message.realtimeInput?.audio) window.__voiceTest.audioFrames.push(message.realtimeInput.audio);
          if (message.setup) setTimeout(() => this.onmessage?.({ data: JSON.stringify({ setupComplete: {} }) }), 0);
        }
        close() { this.readyState = 3; this.onclose?.(); }
      }
      const track = { enabled: true, stopped: false, stop() { this.stopped = true; } };
      window.__voiceTest.track = track;
      window.__voiceTest.originalMediaDevices = navigator.mediaDevices;
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: { getUserMedia: async constraints => {
          window.__voiceTest.events.push("microphone-permission");
          window.__voiceTest.constraints = constraints;
          return { getTracks: () => [track], getAudioTracks: () => [track] };
        } }
      });
      window.AudioContext = FakeAudioContext;
      window.WebSocket = FakeWebSocket;
    });
    await page.locator("#toolsToggle").click();
    await page.locator("#voiceModeBtn").click();
    await page.waitForFunction(() => document.getElementById("liveVoiceStatus")?.textContent === "Seni dinliyorum…", null, { timeout: 15000 });
    await page.waitForFunction(() => !!window.__voiceTest?.processor, null, { timeout: 10000 });
    assert.deepEqual(liveTokenRequests, ["POST"], "Live voice must request an ephemeral provider token");
    assert.deepEqual(await page.evaluate(() => window.__voiceTest.events), ["microphone-permission", "token-request"], "the short-lived Live token must be requested only after microphone permission resolves");
    assert.ok(liveMinuteRequests.length >= 1, "Live voice must reserve its first server-counted minute before streaming");
    const liveSetup = await page.evaluate(() => window.__voiceTest.sent.find(message => message.setup)?.setup);
    assert.equal(liveSetup.model, "models/gemini-live-test");
    assert.match(await page.evaluate(() => window.__voiceTest.sockets[0].url), /BidiGenerateContentConstrained\?access_token=ephemeral-ci-live-token$/, "browser must use the constrained Live endpoint and ephemeral token");
    assert.deepEqual(liveSetup.generationConfig.responseModalities, ["AUDIO"]);
    assert.ok(liveSetup.inputAudioTranscription && liveSetup.outputAudioTranscription);
    assert.equal(await page.evaluate(() => window.__voiceTest.constraints.audio.echoCancellation), true);
    await page.evaluate(() => {
      const socket = window.__voiceTest.sockets[0];
      socket.onmessage({ data: JSON.stringify({ serverContent: {
        outputTranscription: { text: "Merhaba Baba" },
        modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm", data: "AAAAAA==" } }] }
      } }) });
      window.__voiceTest.processor.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(4096).fill(0.25) } });
    });
    await page.waitForFunction(() => window.__voiceTest.audioFrames.length === 1, null, { timeout: 10000 });
    assert.equal(await page.locator("#liveVoiceTranscript").innerText(), "Mina: Merhaba Baba");
    assert.equal(await page.evaluate(() => window.__voiceTest.played), 1, "provider PCM audio must be scheduled for playback");
    const firstFrame = await page.evaluate(() => window.__voiceTest.audioFrames[0]);
    assert.equal(firstFrame.mimeType, "audio/pcm;rate=16000");
    assert.match(firstFrame.data, /^[A-Za-z0-9+/]+=*$/);
    await page.locator("#liveVoiceMute").click();
    assert.equal(await page.evaluate(() => window.__voiceTest.track.enabled), false, "mute must disable the microphone track");
    await page.evaluate(() => window.__voiceTest.processor.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(4096).fill(0.25) } }));
    assert.equal(await page.evaluate(() => window.__voiceTest.audioFrames.length), 1, "muted microphone must not send audio frames");
    await page.locator("#liveVoiceMute").click();
    assert.equal(await page.evaluate(() => window.__voiceTest.track.enabled), true, "unmute must re-enable the microphone track");
    await page.evaluate(() => window.__voiceTest.processor.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(4096).fill(0.25) } }));
    assert.equal(await page.evaluate(() => window.__voiceTest.audioFrames.length), 2, "unmuted microphone must resume audio frames");
    await page.locator("#liveVoiceClose").click();
    await page.waitForFunction(() => document.getElementById("liveVoice").hidden);
    assert.equal(await page.evaluate(() => window.__voiceTest.track.stopped), true, "closing Live voice must stop microphone tracks");
    assert.equal(await page.evaluate(() => window.__voiceTest.context.closed), true, "closing Live voice must close the audio context");
    assert.equal(await page.evaluate(() => window.__voiceTest.sockets[0].readyState), 3, "closing Live voice must close the provider socket");
    await page.evaluate(() => Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: window.__voiceTest.originalMediaDevices }));

    stage = "checking camera capture and image analysis requests";
    const imageAnalysisRequests = [];
    await page.route("http://127.0.0.1:8787/api/chat", async route => {
      imageAnalysisRequests.push(JSON.parse(route.request().postData() || "{}"));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ choices: [{ message: { role: "assistant", content: "Görseli inceledim." } }] })
      });
    });
    await page.locator("#toolsToggle").click();
    await page.locator("#cameraBtn").click();
    await page.waitForFunction(() => document.getElementById("cameraStatus")?.textContent === "Hazır. Fotoğrafı çekebilirsin.", null, { timeout: 15000 });
    await page.locator("#cameraCaptureBtn").click();
    await page.waitForFunction(() => document.getElementById("cameraDialog").hidden);
    assert.equal(await page.locator("#fileChip").isVisible(), true, "camera capture must attach a photo to the composer");
    assert.ok((await page.locator("#fileName").innerText()).includes("Kameradan çekilen fotoğraf"));
    await page.locator("#messageInput").fill("What is in this photo?");
    const cameraAnalysisResponse = page.waitForResponse("http://127.0.0.1:8787/api/chat");
    await page.locator("#sendBtn").click();
    await cameraAnalysisResponse;
    await page.waitForFunction(() => document.getElementById("messageInput")?.disabled === false, null, { timeout: 15000 });
    assert.equal(imageAnalysisRequests.length, 1, "camera photo must be sent to image analysis");
    assert.equal(imageAnalysisRequests[0].image.mimeType, "image/jpeg");
    assert.match(imageAnalysisRequests[0].image.data, /^[A-Za-z0-9+/]+=*$/);
    const capturedJpeg = Buffer.from(imageAnalysisRequests[0].image.data, "base64");
    assert.deepEqual([...capturedJpeg.subarray(0, 3)], [0xff, 0xd8, 0xff], "camera payload must contain actual JPEG bytes, not an empty or mislabeled image");
    assert.ok(capturedJpeg.byteLength > 100 && capturedJpeg.byteLength <= 8 * 1024 * 1024, "captured JPEG must be non-empty and within the Worker image limit");
    assert.ok(imageAnalysisRequests[0].messages.some(message => message.content.includes("What is in this photo?")));

    const uploadedPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/z9sAAAAASUVORK5CYII=", "base64");
    await page.locator("#imageInput").setInputFiles({ name: "analysis-test.png", mimeType: "image/png", buffer: uploadedPng });
    await page.waitForFunction(() => document.getElementById("fileName")?.textContent === "🖼 analysis-test.png", null, { timeout: 10000 });
    await page.locator("#messageInput").fill("Please analyze the uploaded photo.");
    const uploadedAnalysisResponse = page.waitForResponse("http://127.0.0.1:8787/api/chat");
    await page.locator("#sendBtn").click();
    await uploadedAnalysisResponse;
    await page.waitForFunction(() => document.getElementById("messageInput")?.disabled === false, null, { timeout: 15000 });
    assert.equal(imageAnalysisRequests.length, 2, "uploaded photo must be sent to image analysis");
    assert.equal(imageAnalysisRequests[1].image.mimeType, "image/png");
    assert.equal(Buffer.from(imageAnalysisRequests[1].image.data, "base64").toString("base64"), uploadedPng.toString("base64"));

    stage = "checking MP4 video attachment upload and chat payload";
    assert.match(await page.locator("#fileInput").getAttribute("accept"), /\.mp4/);
    assert.match(await page.locator("#fileInput").getAttribute("accept"), /\.webm/);
    const videoUploads = [];
    await page.route("http://127.0.0.1:8787/api/files", async route => {
      if (route.request().method() !== "POST") return route.continue();
      videoUploads.push(JSON.parse(route.request().postData() || "{}"));
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ saved: true, id: "11111111-1111-4111-8111-111111111111", name: "browser-video.mp4", size: 16 })
      });
    });
    const videoBytes = Buffer.from([0,0,0,24,0x66,0x74,0x79,0x70,0x69,0x73,0x6f,0x6d,0,0,0,0]);
    await page.locator("#fileInput").setInputFiles({ name: "browser-video.mp4", mimeType: "video/mp4", buffer: videoBytes });
    await page.waitForFunction(() => document.getElementById("fileName")?.textContent === "🎬 browser-video.mp4", null, { timeout: 10000 });
    await page.locator("#messageInput").fill("Summarize this video.");
    const videoAnalysisResponse = page.waitForResponse("http://127.0.0.1:8787/api/chat");
    await page.locator("#sendBtn").click();
    await videoAnalysisResponse;
    await page.waitForFunction(() => document.getElementById("messageInput")?.disabled === false, null, { timeout: 15000 });
    assert.equal(videoUploads.length, 1, "video must be stored before the chat analysis request");
    assert.equal(videoUploads[0].name, "browser-video.mp4");
    assert.equal(Buffer.from(videoUploads[0].data, "base64").toString("base64"), videoBytes.toString("base64"));
    assert.equal(imageAnalysisRequests.length, 3, "video prompt must be sent through the chat analysis endpoint");
    assert.deepEqual(imageAnalysisRequests[2].video, { name: "browser-video.mp4", mimeType: "video/mp4" });
    assert.equal(imageAnalysisRequests[2].storedFileId, "11111111-1111-4111-8111-111111111111");
    assert.ok(imageAnalysisRequests[2].messages.some(message => message.content.includes("Summarize this video.")));

    stage = "checking daily quota guidance";
    await page.route("http://127.0.0.1:8787/api/chat", async route => {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: "Günlük yapay zekâ istek limitin doldu. Yarın tekrar deneyebilirsin.", quota: { type: "chat", used: 5, limit: 5, remaining: 0, day: "2026-11-27" } })
      });
    });
    await page.locator("#messageInput").fill("Quota message test");
    const quotaResponse = page.waitForResponse("http://127.0.0.1:8787/api/chat");
    await page.locator("#sendBtn").click();
    await quotaResponse;
    await page.waitForFunction(() => document.getElementById("messageInput")?.disabled === false, null, { timeout: 15000 });
    const quotaMessage = await page.locator(".message.assistant .bubble").last().innerText();
    assert.match(quotaMessage, /5\/5/);
    assert.match(quotaMessage, /2026-11-27/);
    assert.doesNotMatch(quotaMessage, /Cloudflare Worker ve Gemini API anahtarını kontrol et/i);

    await page.locator("#sidebarProfile").click();
    assert.equal(await page.locator(".profile-menu-heading span").innerText(), "Hesap ve ayarlar");
    await page.locator('[data-settings-section="language"]').click();
    await page.locator("#minaUiLanguageSelect").waitFor();
    await closeDialog();
    stage = "checking English settings and dynamic UI";

    await openSettings();
    await page.waitForFunction(() => ["Chats, projects and library synced to the cloud.", "Chats, projects and library loaded from the cloud.", "Sohbetler, projeler ve kitaplık bulutla eşitlendi.", "Sohbetler, projeler ve kitaplık buluttan yüklendi."].includes(document.getElementById("workspaceSyncStatus")?.textContent), null, { timeout: 15000 });
    assert.equal(await page.locator("#minaUiLanguageSelect").inputValue(), "tr");
    assert.equal(await page.locator("#minaLanguageSelect").inputValue(), "auto");
    await page.locator("#minaLanguageSelect").selectOption("en");
    await page.locator("#minaUiLanguageSelect").selectOption("en");
    await page.waitForFunction(() => document.documentElement.lang === "en", null, { timeout: 15000 });
    await page.waitForFunction(() => {
      const status = document.getElementById("minaUsageStatus")?.textContent || "";
      return status.includes("Chat") && status.includes("Image generation") && status.includes("Image analysis") && status.includes("Live voice") && status.includes("Files");
    }, null, { timeout: 15000 });
    assert.ok((await page.locator("#minaManifestLink").getAttribute("href")).endsWith("manifest.en.webmanifest"));
    assert.equal(await page.locator('meta[name="description"]').getAttribute("content"), "Mina AI - bilingual AI assistant");

    assert.equal(await page.locator(".profile-menu-heading span").innerText(), "Account and settings");
    assert.equal(await page.locator("#minaLanguageSelect").inputValue(), "en");
    assert.equal(await page.locator("#messageInput").getAttribute("placeholder"), "Ask Mina something...");
    assert.equal(await page.locator("#messageInput").getAttribute("aria-label"), "Your message");
    assert.equal(await page.locator("#minaUiLanguageSelect option[value=tr]").innerText(), "Turkish");
    assert.equal(await page.locator("#minaLanguageSelect option[value=auto]").innerText(), "Detect automatically (recommended)");
    assert.equal(await page.locator("#minaThemeSelect option[value=dark]").innerText(), "Dark theme");
    assert.equal(await page.evaluate(() => window.MinaI18n.t("Gemini servisine bağlanılamadı: test", "en")), "Could not connect to the Gemini service: test");
    assert.equal(await page.evaluate(() => window.MinaI18n.t("Could not connect to the Gemini service: test", "tr")), "Gemini servisine bağlanılamadı: test");
    assert.equal(await page.locator("#minaMemoryEditor").getAttribute("placeholder"), "Write the information you want Mina to remember…");
    const settingsText = await page.locator(".settings-main").innerText();
    for (const expected of [
      "Language & communication", "Interface language", "Mina's response language",
      "Account & security", "Appearance", "Voice & microphone", "Memory",
      "Chats & data", "Notifications", "Devices & sync", "System status",
      "Session security · SESSION_SECRET", "Account preferences, MinaData memory, chats, projects, pinned chats and the library are securely synced with your admin account. Local data is never automatically deleted when sync conflicts occur.",
      "Mina manages her own preferences", "Interface and communication language", "Mina's core approach"
    ]) assert.ok(settingsText.includes(expected), "Missing English settings text: " + expected);
    assert.deepEqual(await untranslatedTurkishUi(), [], "English interface must not contain untranslated Turkish UI text");

    await page.evaluate(() => {
      Object.defineProperty(window, "Notification", {
        configurable: true,
        value: class FakeNotification {
          static permission = "default";
          static requestPermission = async () => "granted";
          constructor() {}
        }
      });
      window.__dialogMessages = [];
      window.confirm = message => { window.__dialogMessages.push({ type: "confirm", message }); return false; };
      window.prompt = message => { window.__dialogMessages.push({ type: "prompt", message }); return "Cloud Sync Test Project"; };
      const bubble = document.createElement("div");
      bubble.className = "bubble";
      const image = document.createElement("img");
      image.alt = "Mina tarafından üretilen görsel";
      bubble.append(image);
      document.body.append(bubble);
      window.MinaI18n.apply(bubble);
    });
    assert.equal(await page.locator(".bubble img").getAttribute("alt"), "Image generated by Mina");

    await page.locator("#minaThemeSelect").selectOption("light");
    await page.waitForFunction(() => document.getElementById("preferencesSyncStatus").textContent === "Settings synced to the cloud.", null, { timeout: 15000 });
    await page.evaluate(() => {
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => { window.__micTrackStopped = true; } }] }) }
      });
    });
    await page.locator("#checkMicPermission").click();
    await page.waitForFunction(() => document.getElementById("micPermissionStatus").textContent === "Permission granted");
    assert.equal(await page.locator("#micTestStatus").innerText(), "Microphone access succeeded. Test complete; the microphone has been turned off.");
    assert.equal(await page.evaluate(() => window.__micTrackStopped), true, "microphone tracks must be stopped after permission testing");
    await page.locator("#minaMemoryEditor").fill("Mina cross-device memory test");
    await page.locator("#saveMinaMemory").click();
    await page.waitForFunction(() => document.getElementById("memorySaveStatus").textContent === "MinaData memory was securely saved to your account.", null, { timeout: 15000 });
    await page.locator("#generateSessionSecret").click();
    const generatedSecretLength = await page.locator("#generatedSessionSecret").inputValue().then(value => value.length);
    assert.ok(generatedSecretLength >= 60, "session secret generator must create a cryptographically strong value");
    assert.equal(await page.locator("#sessionSecretOutput").isHidden(), false);
    await page.evaluate(() => { document.getElementById("generatedSessionSecret").value = ""; });
    const exportPromise = page.waitForEvent("download");
    await page.locator("#exportMinaData").click();
    const exportDownload = await exportPromise;
    assert.equal(exportDownload.suggestedFilename(), "mina-ai-verilerim.json");
    const exportStream = await exportDownload.createReadStream();
    let exportContent = "";
    for await (const chunk of exportStream) exportContent += chunk.toString("utf8");
    const exportedData = JSON.parse(exportContent);
    assert.equal(exportedData.memory, "Mina cross-device memory test");
    assert.equal(await page.locator("#dataExportStatus").innerText(), "Mina’s local data has been exported.");
    await page.locator("#requestNotificationPermission").click();
    assert.equal(await page.locator("#notificationPermissionStatus").innerText(), "Permission granted");
    await page.locator("#refreshMinaHealth").click();
    await page.waitForFunction(() => document.getElementById("minaApiStatus").textContent === "Connected", null, { timeout: 15000 });
    assert.equal(await page.locator("#minaProviderStatus").innerText(), "Ready");
    await closeDialog();
    await page.locator("#clearChatsBtn").click();
    await page.locator("#addProjectBtn").click();
    const dialogsEn = await page.evaluate(() => window.__dialogMessages);
    assert.ok(dialogsEn.some(item => item.message === "Do you want to permanently delete all chat history?"));
    assert.ok(dialogsEn.some(item => item.message === "New project name:"));
    await page.waitForFunction(() => document.getElementById("workspaceSyncStatus")?.textContent === "Chats, projects and library synced to the cloud.", null, { timeout: 15000 });
    assert.ok((await page.evaluate(() => JSON.parse(localStorage.getItem("mina-ai-projects-v1") || "[]"))).some(project => project.name === "Cloud Sync Test Project"), "new project must remain in local storage after cloud sync");
    await page.locator("#toolsToggle").click();
    assert.equal(await page.locator("#fileToolBtn").innerText(), "📎 Attach file");
    assert.equal(await page.locator("#webBtn").innerText(), "🌐 Search the web");
    assert.equal(await page.locator("#toolsToggle").getAttribute("aria-label"), "Close tools");
    await page.locator("#toolsToggle").click();

    await page.locator("#sidebarProfile").click();
    assert.equal(await page.locator(".profile-menu-heading span").innerText(), "Account and settings");
    await page.locator('[data-settings-section="language"]').click();
    await page.locator("#minaUiLanguageSelect").waitFor();
    await page.locator("#minaUiLanguageSelect").selectOption("tr");
    await page.waitForFunction(() => document.documentElement.lang === "tr", null, { timeout: 15000 });
    await page.waitForFunction(() => document.getElementById("preferencesSyncStatus").textContent === "Ayarlar bulutla eşitlendi.", null, { timeout: 15000 });
    assert.ok((await page.locator("#minaManifestLink").getAttribute("href")).endsWith("manifest.webmanifest"));
    assert.equal(await page.locator('meta[name="description"]').getAttribute("content"), "Mina AI - Türkçe yapay zekâ sohbet platformu");
    assert.equal(await page.locator(".profile-menu-heading span").innerText(), "Hesap ve ayarlar");
    assert.equal(await page.locator("#minaLanguageSelect").inputValue(), "en", "Mina response language must remain independent of interface language");
    assert.equal(await page.locator("#messageInput").getAttribute("placeholder"), "Mina'ya bir şey sor...");
    assert.equal(await page.locator("#messageInput").getAttribute("aria-label"), "Mesajın");
    assert.equal(await page.locator("#minaUiLanguageSelect option[value=tr]").innerText(), "Türkçe");
    assert.equal(await page.locator("#minaLanguageSelect option[value=auto]").innerText(), "Otomatik algıla (önerilen)");
    assert.equal(await page.locator("#minaThemeSelect option[value=dark]").innerText(), "Koyu tema");
    assert.equal(await page.locator(".suggestion").first().getAttribute("data-prompt"), "Bana yeni başlayanlar için Python öğrenme planı hazırla.");
    assert.equal(await page.locator(".bubble img").getAttribute("alt"), "Mina tarafından üretilen görsel");
    await page.locator("#requestNotificationPermission").click();
    assert.equal(await page.locator("#notificationPermissionStatus").innerText(), "İzin verildi");
    assert.deepEqual(pageErrors, [], "Browser runtime must not produce uncaught JavaScript errors");

    await closeDialog();
    await page.evaluate(() => {
      localStorage.setItem("mina-ai-conversations-v1", JSON.stringify([{
        id: "i18n-runtime-test",
        title: "Ayarlar",
        messages: [{ role: "assistant", content: "Test response remains unchanged." }]
      }]));
      localStorage.removeItem("mina-ai-theme-v1");
      localStorage.removeItem("mina-ai-language-v1");
      localStorage.removeItem("mina-ai-ui-language-v1");
      localStorage.removeItem("mina-ai-user-memory-v1");
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("body.mina-authenticated").waitFor();
    await openSettings();
    await page.waitForFunction(() => ["Ayarlar bulutla eşitlendi.", "Settings synced to the cloud."].includes(document.getElementById("preferencesSyncStatus").textContent), null, { timeout: 15000 });
    assert.equal(await page.locator("#minaThemeSelect").inputValue(), "light", "theme must restore from D1 after local preference deletion");
    assert.equal(await page.locator("#minaLanguageSelect").inputValue(), "en", "response language must restore from D1");
    assert.equal(await page.locator("#minaUiLanguageSelect").inputValue(), "tr", "interface language must restore from D1");
    assert.equal(await page.locator("#minaMemoryEditor").inputValue(), "Mina cross-device memory test", "MinaData memory must restore from D1 after local cache deletion");
    await page.evaluate(() => { window.confirm = () => true; });
    await page.locator("#clearMinaMemory").click();
    await page.waitForFunction(() => document.getElementById("memorySaveStatus").textContent === "MinaData hafızası silindi.", null, { timeout: 15000 });
    assert.equal(await page.locator("#minaMemoryEditor").inputValue(), "", "clearing MinaData must clear the editor");
    await closeDialog();

    await page.evaluate(() => localStorage.setItem("mina-ai-conversations-v1", JSON.stringify([{
      id: "i18n-runtime-test",
      title: "Ayarlar",
      messages: [{ role: "assistant", content: "Test response remains unchanged." }]
    }])));
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("body.mina-authenticated").waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem("mina-ai-ui-language-v1")), "tr");
    assert.equal(await page.locator(".message-actions button").first().getAttribute("aria-label"), "Yanıtı kopyala");
    assert.equal(await page.locator(".bubble").innerText(), "Test response remains unchanged.");
    assert.equal(await page.locator(".conversation-item").innerText(), "Ayarlar", "User-created conversation titles must not be translated");

    await openSettings();
    await page.locator("#minaUiLanguageSelect").selectOption("en");
    await page.waitForFunction(() => document.documentElement.lang === "en", null, { timeout: 15000 });
    await page.waitForFunction(() => document.getElementById("preferencesSyncStatus").textContent === "Settings synced to the cloud.", null, { timeout: 15000 });
    await closeDialog();
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("body.mina-authenticated").waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem("mina-ai-ui-language-v1")), "en");
    assert.ok((await page.locator("#minaManifestLink").getAttribute("href")).endsWith("manifest.en.webmanifest"));
    assert.equal(await page.locator(".profile-menu-heading span").innerText(), "Account and settings");
    await openSettings();
    assert.equal(await page.locator("#minaUiLanguageSelect").inputValue(), "en", "Interface language must persist after reload");
    assert.equal(await page.locator("#minaLanguageSelect").inputValue(), "en", "Response language must persist independently");
    assert.equal(await page.locator("#minaMemoryEditor").inputValue(), "", "cleared MinaData memory must remain cleared after reload");
    await page.locator("#minaUiLanguageSelect").selectOption("tr");
    await page.waitForFunction(() => document.documentElement.lang === "tr", null, { timeout: 15000 });
    assert.deepEqual(pageErrors, [], "Browser runtime must not produce uncaught JavaScript errors");

    stage = "verifying workspace restore from cloud";
    await closeDialog();
    await page.evaluate(() => {
      for (const key of ["mina-ai-conversations-v1", "mina-ai-projects-v1", "mina-ai-pinned-v1", "mina-ai-library-v1"]) localStorage.removeItem(key);
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("body.mina-authenticated").waitFor();
    await openSettings();
    await page.waitForFunction(() => ["Chats, projects and library loaded from the cloud.", "Chats, projects and library synced to the cloud."].includes(document.getElementById("workspaceSyncStatus")?.textContent), null, { timeout: 15000 });
    const restoredProjects = await page.evaluate(() => JSON.parse(localStorage.getItem("mina-ai-projects-v1") || "[]"));
    assert.ok(restoredProjects.some(project => project.name === "Cloud Sync Test Project"), "project must restore from D1 after local workspace data is cleared");
    const restoredConversations = await page.evaluate(() => JSON.parse(localStorage.getItem("mina-ai-conversations-v1") || "[]"));
    assert.ok(restoredConversations.some(conversation => conversation.id === "i18n-runtime-test"), "conversation must restore from D1 after local workspace data is cleared");
    await closeDialog();
    const remoteChange = await page.evaluate(async () => {
      const token = sessionStorage.getItem("mina-admin-session-v1") || localStorage.getItem("mina-admin-session-v1");
      const version = Number(localStorage.getItem("mina-ai-workspace-version-v1"));
      const data = {
        conversations: JSON.parse(localStorage.getItem("mina-ai-conversations-v1") || "[]"),
        projects: [...JSON.parse(localStorage.getItem("mina-ai-projects-v1") || "[]"), { id: "remote-device-project", name: "Remote Device Project" }],
        pinnedIds: JSON.parse(localStorage.getItem("mina-ai-pinned-v1") || "[]"),
        libraryItems: JSON.parse(localStorage.getItem("mina-ai-library-v1") || "[]")
      };
      const response = await fetch("http://127.0.0.1:8787/api/workspace", { method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ version, data }) });
      return response.status;
    });
    assert.equal(remoteChange, 200, "simulated second device update must save to D1");
    await page.evaluate(() => { window.prompt = () => "Local Conflict Project"; window.confirm = () => true; });
    await page.locator("#addProjectBtn").click();
    await page.waitForTimeout(1300);
    await openSettings();
    await page.locator("#syncWorkspaceNow").click();
    await page.waitForFunction(() => ["Cihazlarda farklı değişiklikler var. Yerel veriler korundu; eşitleme çakışması çözülmeli.", "There are different changes on your devices. Local data is preserved; the sync conflict must be resolved."].includes(document.getElementById("workspaceSyncStatus")?.textContent), null, { timeout: 15000 });
    assert.equal(await page.locator("#syncWorkspaceUpload").isHidden(), false, "conflict must offer an explicit local upload choice");
    assert.equal(await page.locator("#syncWorkspaceDownload").isHidden(), false, "conflict must offer an explicit cloud restore choice");
    const backupPromise = page.waitForEvent("download");
    await page.locator("#syncWorkspaceUpload").click();
    const conflictBackup = await backupPromise;
    assert.equal(conflictBackup.suggestedFilename(), "mina-calisma-alani-yedek.json");
    await page.waitForFunction(() => ["Bu cihazdaki veriler buluta aktarıldı.", "This device's data was uploaded to the cloud."].includes(document.getElementById("workspaceSyncStatus")?.textContent), null, { timeout: 15000 });
    assert.equal(await page.locator("#syncWorkspaceUpload").isHidden(), true, "resolved conflict must hide resolution actions");
    const uploadedWorkspace = await page.evaluate(async () => {
      const token = sessionStorage.getItem("mina-admin-session-v1") || localStorage.getItem("mina-admin-session-v1");
      const response = await fetch("http://127.0.0.1:8787/api/workspace", { headers: { Authorization: "Bearer " + token } });
      return (await response.json()).data;
    });
    assert.ok(uploadedWorkspace.projects.some(project => project.name === "Local Conflict Project"), "explicit local upload must save this device's data");
    assert.ok(!uploadedWorkspace.projects.some(project => project.name === "Remote Device Project"), "explicit local upload must replace the remote snapshot only after confirmation");
    assert.deepEqual(pageErrors, [], "workspace restore and conflict resolution must not produce browser runtime errors");

    stage = "checking localized sign-in errors";
    await closeDialog();
    await page.evaluate(() => window.MinaI18n.setLanguage("en"));
    await page.locator("#minaLogoutBtn").click();
    await page.locator("#minaLogin").waitFor({ state: "visible" });
    await page.locator("#minaUsername").fill("Argion");
    await page.locator("#minaPassword").fill("incorrect-password-for-i18n-test");
    await page.locator("#minaLoginSubmit").click();
    await page.waitForFunction(() => document.getElementById("minaLoginError").textContent === "Incorrect username or password.", null, { timeout: 15000 });
    assert.deepEqual(pageErrors, [], "Localized authentication errors must not produce browser runtime errors");
  } finally {
    await browser.close();
    clearTimeout(watchdog);
  }
})().catch(error => {
  clearTimeout(watchdog);
  console.error(error);
  process.exitCode = 1;
});

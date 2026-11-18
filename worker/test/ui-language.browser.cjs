const assert = require("node:assert/strict");
const { chromium } = require("playwright");

let stage = "launching Chromium";
const watchdog = setTimeout(() => {
  console.error("Browser UI language test timed out at stage: " + stage);
  process.exit(1);
}, 120000);

(async () => {
  const browser = await chromium.launch({ headless: true });
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
    assert.deepEqual(pageErrors, [], "workspace restore must not produce browser runtime errors");

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

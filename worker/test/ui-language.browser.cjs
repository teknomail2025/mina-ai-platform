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
    await page.locator("#sidebarSettingsBtn").click();
    await page.locator("#minaUiLanguageSelect").waitFor();
  };
  const closeDialog = async () => {
    await page.locator("#workspaceDialogClose").click();
    await page.waitForFunction(() => document.getElementById("workspaceDialog").hidden, null, { timeout: 15000 });
  };
  const openDiscover = async () => {
    await page.locator("#discoverNav").click();
    await page.locator(".discover-card").first().waitFor();
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
    stage = "checking English settings and dynamic UI";

    await openSettings();
    assert.equal(await page.locator("#minaUiLanguageSelect").inputValue(), "tr");
    assert.equal(await page.locator("#minaLanguageSelect").inputValue(), "auto");
    await page.locator("#minaLanguageSelect").selectOption("en");
    await page.locator("#minaUiLanguageSelect").selectOption("en");
    await page.waitForFunction(() => document.documentElement.lang === "en", null, { timeout: 15000 });
    assert.ok((await page.locator("#minaManifestLink").getAttribute("href")).endsWith("manifest.en.webmanifest"));
    assert.equal(await page.locator('meta[name="description"]').getAttribute("content"), "Mina AI - bilingual AI assistant");

    assert.equal(await page.locator(".sidebar-settings-copy strong").innerText(), "Settings");
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
      "Session security · SESSION_SECRET", "A shared Mina account and cross-device sync",
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
      window.prompt = message => { window.__dialogMessages.push({ type: "prompt", message }); return null; };
      const bubble = document.createElement("div");
      bubble.className = "bubble";
      const image = document.createElement("img");
      image.alt = "Mina tarafından üretilen görsel";
      bubble.append(image);
      document.body.append(bubble);
      window.MinaI18n.apply(bubble);
    });
    assert.equal(await page.locator(".bubble img").getAttribute("alt"), "Image generated by Mina");

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
    await page.locator("#toolsToggle").click();
    assert.equal(await page.locator("#fileToolBtn").innerText(), "📎 Attach file");
    assert.equal(await page.locator("#webBtn").innerText(), "🌐 Search the web");
    assert.equal(await page.locator("#toolsToggle").getAttribute("aria-label"), "Close tools");
    await page.locator("#toolsToggle").click();

    await page.locator("#sidebarProfile").click();
    assert.equal(await page.locator(".profile-menu-heading").innerText(), "Account and settings");
    assert.equal(await page.locator('[data-settings-section="language"]').innerText(), "Language & communication");
    await page.locator("#sidebarProfile").click();

    await openDiscover();
    assert.equal(await page.locator("#workspaceDialogTitle").innerText(), "Discover");
    assert.ok((await page.locator("#workspaceDialogContent").innerText()).includes("Mina’s workspaces in one place."));
    assert.equal(await page.locator(".suggestion").first().getAttribute("data-prompt"), "Prepare a Python learning plan for a beginner.");
    await page.locator(".discover-card").nth(0).click();
    assert.equal(await page.locator("#workspaceDialogTitle").innerText(), "Pinned");
    assert.ok((await page.locator("#workspaceDialogContent").innerText()).includes("No pinned chats yet"));
    await closeDialog();

    await openDiscover();
    await page.locator(".discover-card").nth(1).click();
    assert.equal(await page.locator("#workspaceDialogTitle").innerText(), "Projects");
    assert.ok((await page.locator("#workspaceDialogContent").innerText()).includes("No projects have been created yet."));
    await page.evaluate(() => { window.prompt = message => { window.__dialogMessages.push({ type: "prompt", message }); return "Ayarlar"; }; });
    await page.locator("#workspaceDialogContent button").first().click();
    await page.waitForFunction(() => document.querySelector("#workspaceDialogContent .workspace-item strong")?.textContent === "Ayarlar");
    assert.equal(await page.locator("#projectsList .mini-item").innerText(), "▣ Ayarlar", "User-created project names must not be translated");
    await closeDialog();

    await page.evaluate(() => localStorage.setItem("mina-ai-active-timer-v1", JSON.stringify({ endsAt: Date.now() + 120000, minutes: 25 })));
    await openDiscover();
    await page.locator(".discover-card").nth(2).click();
    assert.equal(await page.locator("#workspaceDialogTitle").innerText(), "Timers");
    assert.ok((await page.locator("#workspaceDialogContent").innerText()).includes("25-minute timer is running."));
    await page.evaluate(() => window.MinaI18n.setLanguage("tr"));
    await page.waitForFunction(() => document.querySelector("#workspaceDialogContent").innerText.includes("25 dakikalık sayaç devam ediyor."), null, { timeout: 15000 });
    await page.evaluate(() => window.MinaI18n.setLanguage("en"));
    await page.waitForFunction(() => document.querySelector("#workspaceDialogContent").innerText.includes("25-minute timer is running."), null, { timeout: 15000 });
    await closeDialog();

    await openDiscover();
    await page.locator(".discover-card").nth(3).click();
    assert.equal(await page.locator("#workspaceDialogTitle").innerText(), "Library");
    assert.ok((await page.locator("#workspaceDialogContent").innerText()).includes("The library is empty."));
    await closeDialog();

    await openDiscover();
    await page.locator(".discover-card").nth(4).click();
    assert.equal(await page.locator("#workspaceDialogTitle").innerText(), "Integrations");
    assert.ok((await page.locator("#workspaceDialogContent").innerText()).includes("Tools currently available in Mina."));
    await closeDialog();

    await openSettings();
    await page.locator("#minaUiLanguageSelect").selectOption("tr");
    await page.waitForFunction(() => document.documentElement.lang === "tr", null, { timeout: 15000 });
    assert.ok((await page.locator("#minaManifestLink").getAttribute("href")).endsWith("manifest.webmanifest"));
    assert.equal(await page.locator('meta[name="description"]').getAttribute("content"), "Mina AI - Türkçe yapay zekâ sohbet platformu");
    assert.equal(await page.locator(".sidebar-settings-copy strong").innerText(), "Ayarlar");
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
    await closeDialog();
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("body.mina-authenticated").waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem("mina-ai-ui-language-v1")), "en");
    assert.ok((await page.locator("#minaManifestLink").getAttribute("href")).endsWith("manifest.en.webmanifest"));
    assert.equal(await page.locator(".sidebar-settings-copy strong").innerText(), "Settings");
    await openSettings();
    assert.equal(await page.locator("#minaUiLanguageSelect").inputValue(), "en", "Interface language must persist after reload");
    assert.equal(await page.locator("#minaLanguageSelect").inputValue(), "en", "Response language must persist independently");
    await page.locator("#minaUiLanguageSelect").selectOption("tr");
    await page.waitForFunction(() => document.documentElement.lang === "tr", null, { timeout: 15000 });
    assert.deepEqual(pageErrors, [], "Browser runtime must not produce uncaught JavaScript errors");

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

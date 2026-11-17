const assert = require("node:assert/strict");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.addInitScript(() => { window.MINA_API_BASE = "http://127.0.0.1:8787"; });

  try {
    await page.goto("http://127.0.0.1:8000/", { waitUntil: "networkidle" });
    await page.locator("#minaLogin").waitFor({ state: "visible" });
    assert.equal(await page.locator(".mina-login-card .eyebrow").innerText(), "PRIVATE ADMIN AREA");
    await page.locator("#minaUsername").fill("Argion");
    await page.locator("#minaPassword").fill("ci-test-password-at-least-12");
    await page.locator("#minaLoginSubmit").click();
    await page.locator("body.mina-authenticated").waitFor();
    await page.locator("#sidebarSettingsBtn").click();
    await page.locator("#minaUiLanguageSelect").waitFor();

    assert.equal(await page.locator("#minaUiLanguageSelect").inputValue(), "tr");
    await page.locator("#minaLanguageSelect").selectOption("en");
    await page.locator("#minaUiLanguageSelect").selectOption("en");
    await page.waitForFunction(() => document.documentElement.lang === "en");
    assert.equal(await page.locator(".sidebar-settings-copy strong").innerText(), "Settings");
    assert.equal(await page.locator("#minaLanguageSelect").inputValue(), "en");
    assert.equal(await page.locator("#messageInput").getAttribute("placeholder"), "Ask Mina something...");
    assert.equal(await page.locator("#minaMemoryEditor").getAttribute("placeholder"), "Write the information you want Mina to remember…");

    await page.locator("#workspaceDialogClose").click();
    await page.waitForFunction(() => document.getElementById("workspaceDialog").hidden);
    await page.locator("#sidebarSettingsBtn").click();
    await page.locator("#minaUiLanguageSelect").waitFor();
    assert.equal(await page.locator("#minaUiLanguageSelect").inputValue(), "en");
    assert.equal(await page.locator("#minaLanguageSelect").inputValue(), "en");

    await page.locator("#minaUiLanguageSelect").selectOption("tr");
    await page.waitForFunction(() => document.documentElement.lang === "tr");
    assert.equal(await page.locator(".sidebar-settings-copy strong").innerText(), "Ayarlar");
    assert.equal(await page.locator("#minaLanguageSelect").inputValue(), "en");
    assert.equal(await page.locator("#messageInput").getAttribute("placeholder"), "Mina'ya bir şey sor...");

    await page.locator("#workspaceDialogClose").click();
    await page.waitForFunction(() => document.getElementById("workspaceDialog").hidden);
    await page.locator("#discoverNav").click();
    assert.equal(await page.locator("#workspaceDialogTitle").innerText(), "Keşfet");
    assert.equal((await page.locator("#workspaceDialogContent").innerText()).includes("Mina'nın çalışma alanları tek yerde."), true);

    await page.evaluate(() => localStorage.setItem("mina-ai-conversations-v1", JSON.stringify([{
      id: "i18n-runtime-test",
      title: "New chat",
      messages: [{ role: "assistant", content: "Test response remains unchanged." }]
    }])));
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("body.mina-authenticated").waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem("mina-ai-ui-language-v1")), "tr");
    assert.equal(await page.locator(".message-actions button").first().getAttribute("aria-label"), "Yanıtı kopyala");
    assert.equal(await page.locator(".bubble").innerText(), "Test response remains unchanged.");

    await page.locator("#sidebarSettingsBtn").click();
    await page.locator("#minaUiLanguageSelect").waitFor();
    await page.locator("#minaUiLanguageSelect").selectOption("en");
    await page.waitForFunction(() => document.documentElement.lang === "en");
    await page.locator("#workspaceDialogClose").click();
    await page.locator("#discoverNav").click();
    assert.equal(await page.locator("#workspaceDialogTitle").innerText(), "Discover");
    assert.equal((await page.locator("#workspaceDialogContent").innerText()).includes("Mina’s workspaces in one place."), true);

    await page.locator("#workspaceDialogClose").click();
    await page.locator("#sidebarSettingsBtn").click();
    await page.locator("#minaUiLanguageSelect").waitFor();
    await page.locator("#minaUiLanguageSelect").selectOption("tr");
    await page.waitForFunction(() => document.documentElement.lang === "tr");
    assert.deepEqual(pageErrors, [], "Browser runtime must not produce uncaught JavaScript errors");
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

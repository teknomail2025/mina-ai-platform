const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
test("camera capture requests video only after explicit action and never streams audio", () => {
  assert.match(html, /id="cameraBtn"/);
  assert.match(html, /id="cameraVideo"[^>]*autoplay muted playsinline/);
  assert.match(app, /getUserMedia\(\{[\s\S]*?audio:\s*false[\s\S]*?video:/);
  assert.match(app, /facingMode:\s*\{\s*ideal:\s*"environment"/);
});
test("camera capture attaches a still image only after the user presses capture", () => {
  assert.match(app, /cameraCaptureBtn.*captureCameraFrame/);
  assert.match(app, /canvas\.toDataURL\("image\/jpeg",\s*0\.86\)/);
  assert.match(app, /attachedFile\s*=\s*\{\s*kind:\s*"image"/);
  assert.match(html, /Görüntü yalnızca sen çekim yaptığında sohbete eklenir/);
});
test("camera tracks are stopped on close, capture, page exit and tab hiding", () => {
  assert.match(app, /cameraStream\.getTracks\(\)\.forEach\(track\s*=>\s*track\.stop\(\)\)/);
  assert.match(app, /pagehide",\s*stopCamera/);
  assert.match(app, /visibilitychange"[\s\S]*?if\s*\(document\.hidden\)\s*stopCamera/);
});
test("camera dialog has mobile-friendly constrained video layout", () => {
  assert.match(css, /\.camera-dialog-card video\{[\s\S]*?max-height:65vh/);
  assert.match(css, /\.camera-dialog\[hidden\]\{display:none\}/);
});

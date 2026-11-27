const test = require("node:test");
const assert = require("node:assert/strict");
const { createCameraController, readImageFile } = require("../../media.js");

function createHarness({ dataUrl = "data:image/jpeg;base64,aGVsbG8=", mediaDevices } = {}) {
  const tracks = [];
  const stream = { getTracks: () => tracks };
  const track = { stopped: false, stop() { this.stopped = true; } };
  tracks.push(track);
  const dialog = { hidden: true };
  const status = { textContent: "" };
  const captureButton = { disabled: true };
  const video = {
    srcObject: null, videoWidth: 4000, videoHeight: 2000,
    async play() {},
  };
  let canvas;
  const document = {
    createElement(name) {
      assert.equal(name, "canvas");
      canvas = {
        width: 0, height: 0,
        getContext: () => ({ drawImage(...args) { canvas.drawArgs = args; } }),
        toDataURL(type, quality) { canvas.output = { type, quality }; return dataUrl; },
      };
      return canvas;
    },
  };
  const attachments = [];
  const controller = createCameraController({
    dialog, video, status, captureButton,
    mediaDevices: mediaDevices || { getUserMedia: async () => stream },
    document, translate: value => value, onCapture: file => attachments.push(file),
  });
  return { controller, dialog, video, status, captureButton, track, stream, attachments, get canvas() { return canvas; } };
}

test("camera opens with video-only constraints and closing always stops the stream", async () => {
  let constraints;
  const harness = createHarness({ mediaDevices: { getUserMedia: async value => { constraints = value; return { getTracks: () => [harness.track] }; } } });
  await harness.controller.open();
  assert.deepEqual(constraints, { video: { facingMode: { ideal: "environment" } }, audio: false });
  assert.equal(harness.dialog.hidden, false);
  assert.equal(harness.captureButton.disabled, false);
  assert.equal(harness.status.textContent, "Hazır. Fotoğrafı çekebilirsin.");
  harness.controller.close();
  assert.equal(harness.track.stopped, true);
  assert.equal(harness.video.srcObject, null);
  assert.equal(harness.dialog.hidden, true);
  assert.equal(harness.captureButton.disabled, true);
});

test("a permission request resolving after close is stopped and cannot revive the preview", async () => {
  let resolvePermission;
  const harness = createHarness({ mediaDevices: { getUserMedia: () => new Promise(resolve => { resolvePermission = resolve; }) } });
  const opening = harness.controller.open();
  harness.controller.close();
  resolvePermission(harness.stream);
  await opening;
  assert.equal(harness.track.stopped, true);
  assert.equal(harness.video.srcObject, null);
  assert.equal(harness.dialog.hidden, true);
  assert.equal(harness.captureButton.disabled, true);
});

test("opening the camera again stops the previous active stream", async () => {
  const firstTrack = { stopped: false, stop() { this.stopped = true; } };
  const secondTrack = { stopped: false, stop() { this.stopped = true; } };
  let calls = 0;
  const harness = createHarness({ mediaDevices: { getUserMedia: async () => ({ getTracks: () => [calls++ === 0 ? firstTrack : secondTrack] }) } });
  await harness.controller.open();
  await harness.controller.open();
  assert.equal(firstTrack.stopped, true);
  assert.equal(secondTrack.stopped, false);
  harness.controller.close();
  assert.equal(secondTrack.stopped, true);
});

test("camera denial is reported without retaining a stream", async () => {
  const error = new Error("denied");
  error.name = "NotAllowedError";
  const harness = createHarness({ mediaDevices: { getUserMedia: async () => { throw error; } } });
  await harness.controller.open();
  assert.equal(harness.status.textContent, "Kamera izni reddedildi. Tarayıcı ayarlarından kamera iznini aç.");
  assert.equal(harness.captureButton.disabled, true);
  assert.equal(harness.video.srcObject, null);
});

test("captured photo is downscaled, attached as JPEG and closes the camera", async () => {
  const harness = createHarness();
  await harness.controller.open();
  assert.equal(harness.controller.capture(), true);
  assert.deepEqual({ width: harness.canvas.width, height: harness.canvas.height }, { width: 1920, height: 960 });
  assert.deepEqual(harness.canvas.output, { type: "image/jpeg", quality: 0.88 });
  assert.deepEqual(harness.attachments, [{ kind: "image", name: "mina-camera-capture.jpg", mimeType: "image/jpeg", data: "data:image/jpeg;base64,aGVsbG8=" }]);
  assert.equal(harness.track.stopped, true);
  assert.equal(harness.dialog.hidden, true);
});

test("camera capture rejects a photo over 8 MB and keeps the preview available", async () => {
  const tooLarge = "data:image/jpeg;base64," + "A".repeat(11_184_812);
  const harness = createHarness({ dataUrl: tooLarge });
  await harness.controller.open();
  assert.equal(harness.controller.capture(), false);
  assert.equal(harness.status.textContent, "Fotoğraf 8 MB sınırını aşıyor. Daha düşük çözünürlükle yeniden dene.");
  assert.equal(harness.attachments.length, 0);
  assert.equal(harness.dialog.hidden, false);
  assert.equal(harness.track.stopped, false);
});

test("photo analysis accepts supported image formats and preserves the image attachment payload", async () => {
  for (const [type, name] of [["image/jpeg", "photo.jpg"], ["image/png", "photo.png"], ["image/webp", "photo.webp"]]) {
    class FakeReader {
      readAsDataURL() { this.result = `data:${type};base64,aGVsbG8=`; queueMicrotask(() => this.onload()); }
    }
    assert.deepEqual(await readImageFile({ name, type, size: 5 }, FakeReader), {
      kind: "image", name, mimeType: type, data: `data:${type};base64,aGVsbG8=`,
    });
  }
});

test("photo analysis rejects oversized, unsupported and unreadable image files", async () => {
  class FakeReader {
    readAsDataURL() { queueMicrotask(() => this.onerror()); }
  }
  await assert.rejects(readImageFile({ name: "large.jpg", type: "image/jpeg", size: 8 * 1024 * 1024 + 1 }, FakeReader), /8 MB/);
  await assert.rejects(readImageFile({ name: "payload.svg", type: "image/svg+xml", size: 10 }, FakeReader), /görsel biçimi/);
  await assert.rejects(readImageFile({ name: "broken.png", type: "image/png", size: 10 }, FakeReader), /okunamadı/);
});

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MinaMedia = factory();
})(globalThis, function () {
  function createCameraController({ dialog, video, status, captureButton, mediaDevices, document, translate, onCapture }) {
    let stream = null;
    let requestId = 0;
    const t = typeof translate === "function" ? translate : value => value;

    function close() {
      requestId++;
      stream?.getTracks().forEach(track => track.stop());
      stream = null;
      video.srcObject = null;
      dialog.hidden = true;
      captureButton.disabled = true;
    }

    async function open() {
      const currentRequestId = ++requestId;
      stream?.getTracks().forEach(track => track.stop());
      stream = null;
      video.srcObject = null;
      dialog.hidden = false;
      captureButton.disabled = true;
      status.textContent = t("Kamera hazırlanıyor…");
      try {
        if (!mediaDevices?.getUserMedia) throw new Error("Bu tarayıcı kamera erişimini desteklemiyor. Resim ekle seçeneğini kullanabilirsin.");
        const nextStream = await mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (currentRequestId !== requestId || dialog.hidden) {
          nextStream.getTracks().forEach(track => track.stop());
          return;
        }
        stream = nextStream;
        video.srcObject = nextStream;
        await video.play();
        if (currentRequestId !== requestId || dialog.hidden) return;
        captureButton.disabled = false;
        status.textContent = t("Hazır. Fotoğrafı çekebilirsin.");
      } catch (error) {
        if (currentRequestId !== requestId) return;
        stream?.getTracks().forEach(track => track.stop());
        stream = null;
        video.srcObject = null;
        captureButton.disabled = true;
        status.textContent = error?.name === "NotAllowedError"
          ? t("Kamera izni reddedildi. Tarayıcı ayarlarından kamera iznini aç.")
          : t("Kamera açılamadı: ") + (error?.message || t("Bilinmeyen hata"));
      }
    }

    function capture() {
      if (!video.videoWidth || !video.videoHeight) {
        status.textContent = t("Kamera görüntüsü henüz hazır değil.");
        return false;
      }
      const scale = Math.min(1, 1920 / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        status.textContent = t("Fotoğraf hazırlanamadı.");
        return false;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/jpeg", 0.88);
      const base64 = data.split(",")[1] || "";
      if (Math.ceil(base64.length * 0.75) > 8 * 1024 * 1024) {
        status.textContent = t("Fotoğraf 8 MB sınırını aşıyor. Daha düşük çözünürlükle yeniden dene.");
        return false;
      }
      close();
      onCapture({ kind: "image", name: "mina-camera-capture.jpg", mimeType: "image/jpeg", data });
      return true;
    }

    return { open, close, capture };
  }

  function readImageFile(file, FileReaderConstructor) {
    if (!file) return Promise.resolve(null);
    if (file.size > 8 * 1024 * 1024) return Promise.reject(new Error("Resim en fazla 8 MB olabilir."));
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return Promise.reject(new Error("Bu görsel biçimi desteklenmiyor."));
    const Reader = FileReaderConstructor || root.FileReader;
    if (!Reader) return Promise.reject(new Error("Resim okunamadı."));
    return new Promise((resolve, reject) => {
      const reader = new Reader();
      reader.onload = () => {
        if (typeof reader.result !== "string" || !reader.result.startsWith("data:" + file.type + ";base64,")) {
          reject(new Error("Resim okunamadı."));
          return;
        }
        resolve({ kind: "image", name: file.name, mimeType: file.type, data: reader.result });
      };
      reader.onerror = () => reject(new Error("Resim okunamadı."));
      reader.readAsDataURL(file);
    });
  }

  return { createCameraController, readImageFile };
});

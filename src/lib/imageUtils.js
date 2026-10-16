// Client-side image compression utility
// Resizes and compresses images via HTML5 Canvas before storage & API submission
// Prevents HTTP 413 (Payload Too Large) on Vercel, Nginx, and cloud hosting platforms

export async function compressImageFile(file, maxDimension = 768, quality = 0.75) {
  if (!file) return null;
  if (typeof window === "undefined") return null;

  return new Promise((resolve) => {
    // If not an image, resolve null
    if (file.type && !file.type.startsWith("image/")) {
      resolve(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = String(e.target?.result || "");
      if (!dataUrl) {
        resolve(null);
        return;
      }

      // If already small (< 60 KB), keep as is
      if (dataUrl.length < 80_000) {
        resolve(dataUrl);
        return;
      }

      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(dataUrl);
            return;
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, width, height);

          // Compress to compact JPEG
          const compressed = canvas.toDataURL("image/jpeg", quality);
          resolve(compressed);
        } catch (_) {
          resolve(dataUrl);
        }
      };

      img.onerror = () => {
        resolve(dataUrl);
      };

      img.src = dataUrl;
    };

    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

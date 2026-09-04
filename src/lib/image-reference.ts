import { z } from "zod";

const bundledImage = /^\/images\/[a-zA-Z0-9/_ .-]+\.(?:png|jpe?g|webp|avif)$/i;
const uploadedImage = /^\/api\/images\/[a-f0-9-]{36}\.(?:jpg|png|webp)$/;

export function imageReferenceSchema(maxLength: number, required = false) {
  return z.string().trim().max(maxLength).refine((value) => {
    if (!value) return !required;
    if ((bundledImage.test(value) && !value.includes("..")) || uploadedImage.test(value)) return true;
    // Existing records may use a public HTTPS image. The admin UI no longer accepts URLs,
    // so these can be preserved until an administrator uploads a local replacement.
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, required ? "Choose an image from your device." : "Choose a valid image.");
}

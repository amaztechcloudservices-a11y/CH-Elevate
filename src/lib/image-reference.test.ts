import { expect, it } from "vitest";
import { imageReferenceSchema } from "./image-reference";

it("accepts generated uploads and safe legacy images while rejecting unsafe references", () => {
  const optional = imageReferenceSchema(500);
  const uploaded = "/api/images/11111111-1111-4111-8111-111111111111.webp";
  expect(optional.safeParse(uploaded).success).toBe(true);
  expect(optional.safeParse("/images/legacy-banner.jpg").success).toBe(true);
  expect(optional.safeParse("https://cdn.example.test/banner.png").success).toBe(true);
  for (const value of ["javascript:alert(1)", "data:image/svg+xml,test", "/api/images/../secret.png", "/images/../secret.png", "//example.test/image.png"]) {
    expect(optional.safeParse(value).success).toBe(false);
  }
  expect(imageReferenceSchema(500, true).safeParse("").success).toBe(false);
});

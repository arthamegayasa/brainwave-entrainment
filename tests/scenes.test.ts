import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_SCENE, PICKABLE_SCENES, SCENE_SPECS, isPickableScene, scenePainting } from "../src/ui/scenes";

/** Pixel width of a WebP file (lossy VP8, lossless VP8L, or extended VP8X). */
function webpWidth(bytes: Buffer): number {
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error("not a WebP file");
  }
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8X") return bytes.readUIntLE(24, 3) + 1;
  if (chunk === "VP8L") return (bytes.readUInt16LE(21) & 0x3fff) + 1;
  if (chunk === "VP8 ") return bytes.readUInt16LE(26) & 0x3fff;
  throw new Error(`unknown WebP chunk ${chunk}`);
}

const painting = (id: string, size: 768 | 1536) =>
  readFileSync(new URL(`../public${scenePainting(id, size)}`, import.meta.url));

// Invariant: every Scene a Clinician or the Admin can pick renders everywhere
// it shows — the 768 px painting in the Library, the Mini-player, and Media
// controls, the 1536 px one with its live layers in the Player.
describe("Scene catalog", () => {
  for (const scene of PICKABLE_SCENES) {
    it(`${scene.id}: has a 768 px and a 1536 px painting and a SceneSpec`, () => {
      expect(webpWidth(painting(scene.id, 768))).toBe(768);
      expect(webpWidth(painting(scene.id, 1536))).toBe(1536);
      expect(SCENE_SPECS[scene.id]).toBeDefined();
    });
  }

  it("offers the default Scene in the picker", () => {
    expect(isPickableScene(DEFAULT_SCENE)).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { bandForHz } from "../src/ui/bands";

// bandForHz is pure — no localStorage shim needed.
describe("bandForHz (quick-260714-a8a)", () => {
  it("maps frequencies below 4 Hz to delta", () => {
    expect(bandForHz(0.5)).toBe("delta");
    expect(bandForHz(3.9)).toBe("delta");
  });

  it("maps 4–8 Hz to theta (4 belongs to theta)", () => {
    expect(bandForHz(4)).toBe("theta");
    expect(bandForHz(7.9)).toBe("theta");
  });

  it("maps 8–13 Hz to alpha (8 belongs to alpha)", () => {
    expect(bandForHz(8)).toBe("alpha");
    expect(bandForHz(12.9)).toBe("alpha");
  });

  it("maps 13–30 Hz to beta (13 belongs to beta)", () => {
    expect(bandForHz(13)).toBe("beta");
    expect(bandForHz(29.9)).toBe("beta");
  });

  it("maps 30 Hz and above to gamma", () => {
    expect(bandForHz(30)).toBe("gamma");
    expect(bandForHz(40)).toBe("gamma");
  });
});

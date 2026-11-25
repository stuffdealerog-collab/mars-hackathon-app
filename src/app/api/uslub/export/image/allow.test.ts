import { describe, expect, it } from "vitest";
import { exportImageUrl } from "./allow";

describe("exportImageUrl", () => {
  it("accepts a post picture on fal.media over https", () => {
    expect(exportImageUrl("https://v3.fal.media/files/zebra/abc.jpeg")).toBe("https://v3.fal.media/files/zebra/abc.jpeg");
    expect(exportImageUrl("https://fal.media/files/x.png")).toBe("https://fal.media/files/x.png");
  });

  it("refuses everything else: other hosts, look-alikes, plain http, credentials, ports", () => {
    for (const bad of [
      "http://v3.fal.media/files/x.jpg",
      "https://fal.media.evil.com/x.jpg",
      "https://evilfal.media/x.jpg",
      "https://user:pw@v3.fal.media/x.jpg",
      "https://v3.fal.media:8443/x.jpg",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/x.jpg",
      "javascript:alert(1)",
      "",
      "x".repeat(3000),
    ])
      expect(exportImageUrl(bad)).toBeNull();
  });
});

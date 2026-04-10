import { beforeEach, describe, expect, it } from "vitest";
import { recordDownloadCountClick } from "./downloadCount";

describe("recordDownloadCountClick", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("records the first click for a slug/version within an hour", () => {
    expect(recordDownloadCountClick("weather", "1.0.0", 0)).toBe(true);
    expect(recordDownloadCountClick("weather", "1.0.0", 1_000)).toBe(false);
  });

  it("allows the same slug/version again after the hour bucket changes", () => {
    expect(recordDownloadCountClick("weather", "1.0.0", 0)).toBe(true);
    expect(recordDownloadCountClick("weather", "1.0.0", 3_600_001)).toBe(true);
  });

  it("tracks different versions independently", () => {
    expect(recordDownloadCountClick("weather", "1.0.0", 0)).toBe(true);
    expect(recordDownloadCountClick("weather", "1.1.0", 1_000)).toBe(true);
  });
});

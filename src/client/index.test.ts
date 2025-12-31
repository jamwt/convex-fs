import { describe, test, expect } from "vitest";
import { buildDownloadUrl, parseDownloadUrl } from "./index.js";

describe("buildDownloadUrl and parseDownloadUrl", () => {
  test("round-trip without path", () => {
    const siteUrl = "https://example.convex.site";
    const prefix = "/fs";
    const blobId = "abc123";

    const url = buildDownloadUrl(siteUrl, prefix, blobId);
    const parsed = parseDownloadUrl(url);

    expect(parsed.blobId).toBe(blobId);
    expect(parsed.path).toBeUndefined();
  });

  test("round-trip with path", () => {
    const siteUrl = "https://example.convex.site";
    const prefix = "/fs";
    const blobId = "abc123";
    const path = "/images/photo.jpg";

    const url = buildDownloadUrl(siteUrl, prefix, blobId, path);
    const parsed = parseDownloadUrl(url);

    expect(parsed.blobId).toBe(blobId);
    expect(parsed.path).toBe(path);
  });

  test("round-trip with special characters in path", () => {
    const siteUrl = "https://example.convex.site";
    const prefix = "/fs";
    const blobId = "xyz789";
    const path = "/users/john doe/my file (1).jpg";

    const url = buildDownloadUrl(siteUrl, prefix, blobId, path);
    const parsed = parseDownloadUrl(url);

    expect(parsed.blobId).toBe(blobId);
    expect(parsed.path).toBe(path);
  });

  test("buildDownloadUrl produces correct URL format", () => {
    const url = buildDownloadUrl(
      "https://example.convex.site",
      "/fs",
      "abc123",
      "/test.jpg",
    );
    expect(url).toBe(
      "https://example.convex.site/fs/blobs/abc123?path=%2Ftest.jpg",
    );
  });
});

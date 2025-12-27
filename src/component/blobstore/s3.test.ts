import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createS3BlobStore } from "./s3.js";

const TEST_CONFIG = {
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
  endpoint: "https://test-bucket.s3.us-east-1.amazonaws.com",
  region: "us-east-1",
};

describe("createS3BlobStore", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("put", () => {
    it("sends PUT request with body", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 200 }));
      globalThis.fetch = mockFetch;

      const store = createS3BlobStore(TEST_CONFIG);
      const data = new Uint8Array([1, 2, 3, 4, 5]);

      await store.put("test-key", data);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const request = mockFetch.mock.calls[0][0] as Request;
      expect(request.method).toBe("PUT");
      expect(request.url).toContain("/test-key");
      expect(request.headers.get("Authorization")).toContain(
        "AWS4-HMAC-SHA256",
      );
    });

    it("sets Content-Type header when provided", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 200 }));
      globalThis.fetch = mockFetch;

      const store = createS3BlobStore(TEST_CONFIG);
      const data = new Uint8Array([1, 2, 3]);

      await store.put("test-key", data, { contentType: "image/png" });

      const request = mockFetch.mock.calls[0][0] as Request;
      expect(request.headers.get("Content-Type")).toBe("image/png");
    });

    it("throws on non-2xx response", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(
          new Response("Forbidden", { status: 403, statusText: "Forbidden" }),
        );
      globalThis.fetch = mockFetch;

      const store = createS3BlobStore(TEST_CONFIG);

      await expect(store.put("test-key", new Uint8Array([1]))).rejects.toThrow(
        "Failed to put blob: 403 Forbidden",
      );
    });
  });

  describe("get", () => {
    it("returns blob on success", async () => {
      const responseData = new Uint8Array([10, 20, 30]);
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(responseData, {
          status: 200,
          headers: { "Content-Type": "application/octet-stream" },
        }),
      );
      globalThis.fetch = mockFetch;

      const store = createS3BlobStore(TEST_CONFIG);
      const result = await store.get("test-key");

      expect(result).toBeInstanceOf(Blob);
      const arrayBuffer = await result!.arrayBuffer();
      expect(new Uint8Array(arrayBuffer)).toEqual(responseData);
    });

    it("returns null on 404", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(new Response("Not Found", { status: 404 }));
      globalThis.fetch = mockFetch;

      const store = createS3BlobStore(TEST_CONFIG);
      const result = await store.get("nonexistent-key");

      expect(result).toBeNull();
    });

    it("throws on other errors", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response("Internal Server Error", {
          status: 500,
          statusText: "Internal Server Error",
        }),
      );
      globalThis.fetch = mockFetch;

      const store = createS3BlobStore(TEST_CONFIG);

      await expect(store.get("test-key")).rejects.toThrow(
        "Failed to get blob: 500 Internal Server Error",
      );
    });
  });

  describe("head", () => {
    it("returns metadata on success", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(null, {
          status: 200,
          headers: {
            "Content-Type": "text/plain",
            "Content-Length": "1234",
          },
        }),
      );
      globalThis.fetch = mockFetch;

      const store = createS3BlobStore(TEST_CONFIG);
      const result = await store.head("test-key");

      expect(result).toEqual({
        contentType: "text/plain",
        contentLength: 1234,
      });

      const request = mockFetch.mock.calls[0][0] as Request;
      expect(request.method).toBe("HEAD");
    });

    it("returns null on 404", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 404 }));
      globalThis.fetch = mockFetch;

      const store = createS3BlobStore(TEST_CONFIG);
      const result = await store.head("nonexistent-key");

      expect(result).toBeNull();
    });

    it("handles missing Content-Type header", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(null, {
          status: 200,
          headers: {
            "Content-Length": "500",
          },
        }),
      );
      globalThis.fetch = mockFetch;

      const store = createS3BlobStore(TEST_CONFIG);
      const result = await store.head("test-key");

      expect(result).toEqual({
        contentType: undefined,
        contentLength: 500,
      });
    });
  });

  describe("exists", () => {
    it("returns true when blob exists", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(null, {
          status: 200,
          headers: { "Content-Length": "100" },
        }),
      );
      globalThis.fetch = mockFetch;

      const store = createS3BlobStore(TEST_CONFIG);
      const result = await store.exists("test-key");

      expect(result).toBe(true);
    });

    it("returns false when blob does not exist", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 404 }));
      globalThis.fetch = mockFetch;

      const store = createS3BlobStore(TEST_CONFIG);
      const result = await store.exists("nonexistent-key");

      expect(result).toBe(false);
    });
  });

  describe("delete", () => {
    it("sends DELETE request", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 204 }));
      globalThis.fetch = mockFetch;

      const store = createS3BlobStore(TEST_CONFIG);
      await store.delete("test-key");

      const request = mockFetch.mock.calls[0][0] as Request;
      expect(request.method).toBe("DELETE");
      expect(request.url).toContain("/test-key");
    });

    it("does not throw on 404 (idempotent)", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 404 }));
      globalThis.fetch = mockFetch;

      const store = createS3BlobStore(TEST_CONFIG);

      await expect(store.delete("nonexistent-key")).resolves.toBeUndefined();
    });

    it("throws on other errors", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(
          new Response("Forbidden", { status: 403, statusText: "Forbidden" }),
        );
      globalThis.fetch = mockFetch;

      const store = createS3BlobStore(TEST_CONFIG);

      await expect(store.delete("test-key")).rejects.toThrow(
        "Failed to delete blob: 403 Forbidden",
      );
    });
  });

  describe("generateUploadUrl", () => {
    it("generates presigned URL with PUT method", async () => {
      const store = createS3BlobStore(TEST_CONFIG);
      const url = await store.generateUploadUrl("test-key");

      expect(url).toContain("test-bucket.s3.us-east-1.amazonaws.com");
      expect(url).toContain("test-key");
      expect(url).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
      expect(url).toContain("X-Amz-Credential=");
      expect(url).toContain("X-Amz-Signature=");
    });

    it("includes expiration in URL", async () => {
      const store = createS3BlobStore(TEST_CONFIG);
      const url = await store.generateUploadUrl("test-key", {
        expiresIn: 7200,
      });

      expect(url).toContain("X-Amz-Expires=7200");
    });

    it("uses default expiration of 3600 seconds", async () => {
      const store = createS3BlobStore(TEST_CONFIG);
      const url = await store.generateUploadUrl("test-key");

      expect(url).toContain("X-Amz-Expires=3600");
    });
  });

  describe("generateDownloadUrl", () => {
    it("generates presigned URL", async () => {
      const store = createS3BlobStore(TEST_CONFIG);
      const url = await store.generateDownloadUrl("test-key");

      expect(url).toContain("test-bucket.s3.us-east-1.amazonaws.com");
      expect(url).toContain("test-key");
      expect(url).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
      expect(url).toContain("X-Amz-Signature=");
    });

    it("includes custom expiration", async () => {
      const store = createS3BlobStore(TEST_CONFIG);
      const url = await store.generateDownloadUrl("test-key", {
        expiresIn: 300,
      });

      expect(url).toContain("X-Amz-Expires=300");
    });
  });

  describe("URL encoding", () => {
    it("properly encodes keys with special characters", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 200 }));
      globalThis.fetch = mockFetch;

      const store = createS3BlobStore(TEST_CONFIG);
      await store.put("key with spaces", new Uint8Array([1]));

      const request = mockFetch.mock.calls[0][0] as Request;
      expect(request.url).toContain("key%20with%20spaces");
    });
  });

  describe("endpoint handling", () => {
    it("trims trailing slash from endpoint", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 200 }));
      globalThis.fetch = mockFetch;

      const store = createS3BlobStore({
        ...TEST_CONFIG,
        endpoint: "https://bucket.s3.amazonaws.com/",
      });
      await store.put("test-key", new Uint8Array([1]));

      const request = mockFetch.mock.calls[0][0] as Request;
      expect(request.url).toBe("https://bucket.s3.amazonaws.com/test-key");
    });
  });
});

/**
 * Tests for the test blobstore implementation.
 * These verify that the in-memory test store works correctly,
 * which is used by the ConvexFS client in convex-test scenarios.
 */
import { describe, test, expect } from "vitest";
import { createTestBlobStore } from "./test.js";

describe("createTestBlobStore", () => {
  describe("put and get", () => {
    test("stores and retrieves data", async () => {
      const store = createTestBlobStore();

      const testData = new TextEncoder().encode("hello world");
      await store.put("blob-1", testData, { contentType: "text/plain" });

      const result = await store.get("blob-1");
      expect(result).not.toBeNull();

      const retrieved = new Uint8Array(await result!.arrayBuffer());
      expect(retrieved).toEqual(testData);
    });

    test("stores contentType correctly", async () => {
      const store = createTestBlobStore();

      await store.put("blob-1", new Uint8Array([1, 2, 3]), {
        contentType: "application/json",
      });

      const result = await store.get("blob-1");
      expect(result!.type).toBe("application/json");
    });

    test("returns null for non-existent blob", async () => {
      const store = createTestBlobStore();

      const result = await store.get("nonexistent");
      expect(result).toBeNull();
    });

    test("handles empty data", async () => {
      const store = createTestBlobStore();

      await store.put("empty", new Uint8Array(0), {
        contentType: "text/plain",
      });

      const result = await store.get("empty");
      expect(result).not.toBeNull();
      expect(result!.size).toBe(0);
    });

    test("handles binary data with all byte values", async () => {
      const store = createTestBlobStore();

      // Create array with all possible byte values
      const binaryData = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        binaryData[i] = i;
      }

      await store.put("binary", binaryData, {
        contentType: "application/octet-stream",
      });

      const result = await store.get("binary");
      const retrieved = new Uint8Array(await result!.arrayBuffer());
      expect(retrieved).toEqual(binaryData);
    });

    test("overwrites existing blob", async () => {
      const store = createTestBlobStore();

      await store.put("blob-1", new TextEncoder().encode("first"), {
        contentType: "text/plain",
      });

      await store.put("blob-1", new TextEncoder().encode("second"), {
        contentType: "text/plain",
      });

      const result = await store.get("blob-1");
      const text = new TextDecoder().decode(await result!.arrayBuffer());
      expect(text).toBe("second");
    });
  });

  describe("put with ReadableStream", () => {
    test("stores data from stream", async () => {
      const store = createTestBlobStore();

      const chunks = [
        new Uint8Array([1, 2, 3]),
        new Uint8Array([4, 5, 6]),
        new Uint8Array([7, 8, 9]),
      ];

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      });

      await store.put("stream-blob", stream, {
        contentType: "application/octet-stream",
      });

      const result = await store.get("stream-blob");
      const retrieved = new Uint8Array(await result!.arrayBuffer());
      expect(retrieved).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    });

    test("stores contentType from stream upload", async () => {
      const store = createTestBlobStore();

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1]));
          controller.close();
        },
      });

      await store.put("stream-blob", stream, {
        contentType: "image/png",
      });

      const result = await store.get("stream-blob");
      expect(result!.type).toBe("image/png");
    });

    test("handles empty stream", async () => {
      const store = createTestBlobStore();

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      });

      await store.put("empty-stream", stream, {
        contentType: "text/plain",
      });

      const result = await store.get("empty-stream");
      expect(result).not.toBeNull();
      expect(result!.size).toBe(0);
    });

    test("handles large stream", async () => {
      const store = createTestBlobStore();

      // Create 1MB of data in chunks
      const chunkSize = 64 * 1024; // 64KB chunks
      const totalSize = 1024 * 1024; // 1MB total
      const numChunks = totalSize / chunkSize;

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (let i = 0; i < numChunks; i++) {
            const chunk = new Uint8Array(chunkSize);
            for (let j = 0; j < chunkSize; j++) {
              chunk[j] = (i * chunkSize + j) % 256;
            }
            controller.enqueue(chunk);
          }
          controller.close();
        },
      });

      await store.put("large-stream", stream, {
        contentType: "application/octet-stream",
      });

      const result = await store.get("large-stream");
      expect(result!.size).toBe(totalSize);

      // Spot check some values
      const data = new Uint8Array(await result!.arrayBuffer());
      expect(data[0]).toBe(0);
      expect(data[255]).toBe(255);
      expect(data[256]).toBe(0);
    });
  });

  describe("delete", () => {
    test("deletes existing blob", async () => {
      const store = createTestBlobStore();

      await store.put("to-delete", new Uint8Array([1, 2, 3]), {
        contentType: "text/plain",
      });

      const result = await store.delete("to-delete");
      expect(result.status).toBe("deleted");

      const afterDelete = await store.get("to-delete");
      expect(afterDelete).toBeNull();
    });

    test("returns not_found for non-existent blob", async () => {
      const store = createTestBlobStore();

      const result = await store.delete("nonexistent");
      expect(result.status).toBe("not_found");
    });
  });

  describe("generateDownloadUrl", () => {
    test("generates test URL format", async () => {
      const store = createTestBlobStore();

      const url = await store.generateDownloadUrl("blob-123");
      expect(url).toBe("test://blob-123");
    });
  });

  describe("generateUploadUrl", () => {
    test("throws not supported error", async () => {
      const store = createTestBlobStore();

      await expect(store.generateUploadUrl("blob-123")).rejects.toThrow(
        /not support/i,
      );
    });
  });

  describe("_blobs accessor", () => {
    test("exposes internal map for test assertions", async () => {
      const store = createTestBlobStore();

      await store.put("test-blob", new Uint8Array([1, 2, 3]), {
        contentType: "text/plain",
      });

      expect(store._blobs.has("test-blob")).toBe(true);
      expect(store._blobs.get("test-blob")?.contentType).toBe("text/plain");
    });
  });
});

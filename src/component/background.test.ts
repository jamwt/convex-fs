/// <reference types="vite/client" />
import { describe, test, expect, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema.js";
import { internal } from "./_generated/api.js";

const modules = import.meta.glob("./**/*.ts");

function initConvexTest() {
  return convexTest(schema, modules);
}

// Test config using test storage
const testConfig = {
  storage: { type: "test" as const },
  blobGracePeriod: 1, // 1 second - short for tests
};

// Time constants
const ONE_HOUR_MS = 60 * 60 * 1000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// ============================================================================
// Test Helpers
// ============================================================================

async function storeConfig(
  ctx: { db: any },
  config: typeof testConfig & { freezeGc?: boolean },
) {
  await ctx.db.insert("config", {
    key: "storage",
    value: config,
  });
}

async function createExpiredUpload(
  ctx: { db: any },
  blobId: string,
  expiredAgoMs: number,
) {
  await ctx.db.insert("uploads", {
    blobId,
    expiresAt: Date.now() - expiredAgoMs,
    contentType: "text/plain",
    size: 100,
  });
}

async function createOrphanedBlob(
  ctx: { db: any },
  blobId: string,
  orphanedAgoMs: number,
) {
  await ctx.db.insert("blobs", {
    blobId,
    metadata: { contentType: "text/plain", size: 100 },
    refCount: 0,
    updatedAt: Date.now() - orphanedAgoMs,
  });
}

async function createActiveBlob(
  ctx: { db: any },
  blobId: string,
  refCount: number = 1,
) {
  await ctx.db.insert("blobs", {
    blobId,
    metadata: { contentType: "text/plain", size: 100 },
    refCount,
    updatedAt: Date.now(),
  });
}

async function countUploads(ctx: { db: any }): Promise<number> {
  const uploads = await ctx.db.query("uploads").collect();
  return uploads.length;
}

async function countBlobs(ctx: { db: any }): Promise<number> {
  const blobs = await ctx.db.query("blobs").collect();
  return blobs.length;
}

// ============================================================================
// Upload GC (UGC) Tests
// ============================================================================

describe("Upload GC (UGC)", () => {
  describe("findExpiredUploads", () => {
    test("returns uploads older than threshold", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createExpiredUpload(ctx, "old-1", TWO_HOURS_MS);
        await createExpiredUpload(ctx, "old-2", TWO_HOURS_MS);
      });

      const expired = await t.query(internal.background.findExpiredUploads, {
        threshold: Date.now() - ONE_HOUR_MS,
        limit: 100,
      });

      expect(expired).toHaveLength(2);
      expect(expired.map((e) => e.blobId).sort()).toEqual(["old-1", "old-2"]);
    });

    test("does not return uploads newer than threshold", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        // Create one expired and one fresh upload
        await createExpiredUpload(ctx, "old", TWO_HOURS_MS);
        await ctx.db.insert("uploads", {
          blobId: "fresh",
          expiresAt: Date.now() + ONE_HOUR_MS, // expires in the future
          contentType: "text/plain",
          size: 100,
        });
      });

      const expired = await t.query(internal.background.findExpiredUploads, {
        threshold: Date.now() - ONE_HOUR_MS,
        limit: 100,
      });

      expect(expired).toHaveLength(1);
      expect(expired[0].blobId).toBe("old");
    });

    test("respects limit parameter", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        for (let i = 0; i < 10; i++) {
          await createExpiredUpload(ctx, `upload-${i}`, TWO_HOURS_MS);
        }
      });

      const expired = await t.query(internal.background.findExpiredUploads, {
        threshold: Date.now() - ONE_HOUR_MS,
        limit: 5,
      });

      expect(expired).toHaveLength(5);
    });
  });

  describe("gcExpiredUploads", () => {
    test("deletes expired uploads from DB", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await storeConfig(ctx, testConfig);
        await createExpiredUpload(ctx, "expired-1", TWO_HOURS_MS);
        await createExpiredUpload(ctx, "expired-2", TWO_HOURS_MS);
      });

      await t.action(internal.background.gcExpiredUploads, {});

      await t.run(async (ctx) => {
        expect(await countUploads(ctx)).toBe(0);
      });
    });

    test("skips when no config exists", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createExpiredUpload(ctx, "expired", TWO_HOURS_MS);
      });

      // Should not throw, just return early
      await t.action(internal.background.gcExpiredUploads, {});

      await t.run(async (ctx) => {
        // Upload should still exist (GC didn't run)
        expect(await countUploads(ctx)).toBe(1);
      });
    });

    test("skips when freezeGc is true", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await storeConfig(ctx, { ...testConfig, freezeGc: true });
        await createExpiredUpload(ctx, "expired", TWO_HOURS_MS);
      });

      await t.action(internal.background.gcExpiredUploads, {});

      await t.run(async (ctx) => {
        // Upload should still exist (GC is frozen)
        expect(await countUploads(ctx)).toBe(1);
      });
    });

    test("handles missing blobs gracefully (upload abandoned before blob written)", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await storeConfig(ctx, testConfig);
        // Create upload record but NO blob in storage (simulates abandoned upload)
        await createExpiredUpload(ctx, "abandoned", TWO_HOURS_MS);
      });

      // Should not throw - missing blob is OK (status: "not_found")
      await t.action(internal.background.gcExpiredUploads, {});

      await t.run(async (ctx) => {
        // Upload record should still be cleaned up
        expect(await countUploads(ctx)).toBe(0);
      });
    });

    test("cleans up all uploads across multiple scheduled batches (150 items)", async () => {
      vi.useFakeTimers();
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await storeConfig(ctx, testConfig);
        // Create 150 expired uploads (exceeds batch size of 100)
        for (let i = 0; i < 150; i++) {
          await createExpiredUpload(ctx, `upload-${i}`, TWO_HOURS_MS);
        }
      });

      // Run GC - it should self-schedule to handle remaining items
      await t.action(internal.background.gcExpiredUploads, {});

      // Wait for all scheduled functions to complete
      await t.finishAllScheduledFunctions(() => vi.runAllTimers());

      await t.run(async (ctx) => {
        expect(await countUploads(ctx)).toBe(0);
      });

      vi.useRealTimers();
    });
  });
});

// ============================================================================
// Blob GC (BGC) Tests
// ============================================================================

describe("Blob GC (BGC)", () => {
  describe("findOrphanedBlobs", () => {
    test("returns blobs with refCount=0 older than threshold", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createOrphanedBlob(ctx, "orphan-1", ONE_DAY_MS);
        await createOrphanedBlob(ctx, "orphan-2", ONE_DAY_MS);
      });

      const orphaned = await t.query(internal.background.findOrphanedBlobs, {
        threshold: Date.now() - ONE_HOUR_MS,
        limit: 100,
      });

      expect(orphaned).toHaveLength(2);
    });

    test("does not return blobs with refCount > 0", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createOrphanedBlob(ctx, "orphan", ONE_DAY_MS);
        await createActiveBlob(ctx, "active", 1);
      });

      const orphaned = await t.query(internal.background.findOrphanedBlobs, {
        threshold: Date.now() - ONE_HOUR_MS,
        limit: 100,
      });

      expect(orphaned).toHaveLength(1);
      expect(orphaned[0].blobId).toBe("orphan");
    });

    test("does not return recently orphaned blobs (within grace period)", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createOrphanedBlob(ctx, "old-orphan", ONE_DAY_MS);
        await createOrphanedBlob(ctx, "fresh-orphan", 1000); // 1 second ago
      });

      const orphaned = await t.query(internal.background.findOrphanedBlobs, {
        threshold: Date.now() - ONE_HOUR_MS,
        limit: 100,
      });

      expect(orphaned).toHaveLength(1);
      expect(orphaned[0].blobId).toBe("old-orphan");
    });

    test("respects limit parameter", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        for (let i = 0; i < 10; i++) {
          await createOrphanedBlob(ctx, `blob-${i}`, ONE_DAY_MS);
        }
      });

      const orphaned = await t.query(internal.background.findOrphanedBlobs, {
        threshold: Date.now() - ONE_HOUR_MS,
        limit: 5,
      });

      expect(orphaned).toHaveLength(5);
    });
  });

  describe("gcOrphanedBlobs", () => {
    test("deletes orphaned blobs from DB", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await storeConfig(ctx, { ...testConfig, blobGracePeriod: 1 });
        await createOrphanedBlob(ctx, "orphan-1", ONE_DAY_MS);
        await createOrphanedBlob(ctx, "orphan-2", ONE_DAY_MS);
      });

      await t.action(internal.background.gcOrphanedBlobs, {});

      await t.run(async (ctx) => {
        expect(await countBlobs(ctx)).toBe(0);
      });
    });

    test("respects configured blobGracePeriod", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        // Grace period of 1 hour (3600 seconds)
        await storeConfig(ctx, { ...testConfig, blobGracePeriod: 3600 });
        // Orphaned 30 minutes ago - should NOT be deleted
        await createOrphanedBlob(ctx, "recent", 30 * 60 * 1000);
        // Orphaned 2 hours ago - should be deleted
        await createOrphanedBlob(ctx, "old", TWO_HOURS_MS);
      });

      await t.action(internal.background.gcOrphanedBlobs, {});

      await t.run(async (ctx) => {
        expect(await countBlobs(ctx)).toBe(1);
        const remaining = await ctx.db.query("blobs").collect();
        expect(remaining[0].blobId).toBe("recent");
      });
    });

    test("skips when no config exists", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createOrphanedBlob(ctx, "orphan", ONE_DAY_MS);
      });

      await t.action(internal.background.gcOrphanedBlobs, {});

      await t.run(async (ctx) => {
        expect(await countBlobs(ctx)).toBe(1);
      });
    });

    test("skips when freezeGc is true", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await storeConfig(ctx, { ...testConfig, freezeGc: true });
        await createOrphanedBlob(ctx, "orphan", ONE_DAY_MS);
      });

      await t.action(internal.background.gcOrphanedBlobs, {});

      await t.run(async (ctx) => {
        expect(await countBlobs(ctx)).toBe(1);
      });
    });

    test("handles missing blobs gracefully (already deleted from storage)", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await storeConfig(ctx, { ...testConfig, blobGracePeriod: 1 });
        // Create blob record but NO blob in storage
        await createOrphanedBlob(ctx, "missing", ONE_DAY_MS);
      });

      // Should not throw - missing blob is OK (status: "not_found")
      await t.action(internal.background.gcOrphanedBlobs, {});

      await t.run(async (ctx) => {
        // Blob record should still be cleaned up
        expect(await countBlobs(ctx)).toBe(0);
      });
    });

    test("cleans up all orphaned blobs across multiple scheduled batches (150 items)", async () => {
      vi.useFakeTimers();
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await storeConfig(ctx, { ...testConfig, blobGracePeriod: 1 });
        // Create 150 orphaned blobs (exceeds batch size of 100)
        for (let i = 0; i < 150; i++) {
          await createOrphanedBlob(ctx, `blob-${i}`, ONE_DAY_MS);
        }
      });

      await t.action(internal.background.gcOrphanedBlobs, {});
      await t.finishAllScheduledFunctions(() => vi.runAllTimers());

      await t.run(async (ctx) => {
        expect(await countBlobs(ctx)).toBe(0);
      });

      vi.useRealTimers();
    });
  });
});

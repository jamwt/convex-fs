/// <reference types="vite/client" />
import { describe, test, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema.js";
import { api, internal } from "./_generated/api.js";

const modules = import.meta.glob("./**/*.ts");

function initConvexTest() {
  return convexTest(schema, modules);
}

// Default metadata for test files
const defaultMetadata = { contentType: "text/plain", size: 100 };

// Helper to create a source object for transact operations
function makeSource(path: string, blobId: string, metadata = defaultMetadata) {
  return { path, blobId, ...metadata };
}

// Helper to create a file directly in the database (simulating committed state)
async function createFile(
  ctx: { db: any },
  path: string,
  blobId: string,
  metadata: { contentType: string; size: number } = defaultMetadata,
) {
  const now = Date.now();
  await ctx.db.insert("blobs", {
    blobId,
    metadata,
    refCount: 1,
    updatedAt: now,
  });
  await ctx.db.insert("files", {
    path,
    blobId,
  });
}

// Helper to get blob by blobId
async function getBlob(ctx: { db: any }, blobId: string) {
  return await ctx.db
    .query("blobs")
    .withIndex("blobId", (q: any) => q.eq("blobId", blobId))
    .unique();
}

// Helper to get file by path
async function getFile(ctx: { db: any }, path: string) {
  return await ctx.db
    .query("files")
    .withIndex("path", (q: any) => q.eq("path", path))
    .unique();
}

// ============================================================================
// commitFilesInternal CAS Tests
// ============================================================================

describe("commitFilesInternal", () => {
  describe("basis: undefined (no check, overwrite)", () => {
    test("creates new file when path doesn't exist", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        // No existing file at /new.txt
        await ctx.db.insert("uploads", {
          blobId: "blob-1",
          expiresAt: Date.now() + 3600000,
          contentType: "text/plain",
          size: 100,
        });
      });

      await t.mutation(internal.ops.commitFilesInternal, {
        files: [
          {
            path: "/new.txt",
            blobId: "blob-1",
            basis: undefined,
            metadata: { contentType: "text/plain", size: 100 },
          },
        ],
      });

      await t.run(async (ctx) => {
        const file = await getFile(ctx, "/new.txt");
        expect(file).not.toBeNull();
        expect(file!.blobId).toBe("blob-1");

        const blob = await getBlob(ctx, "blob-1");
        expect(blob).not.toBeNull();
        expect(blob!.refCount).toBe(1);
      });
    });

    test("overwrites existing file without checking basis", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/existing.txt", "old-blob");
      });

      await t.mutation(internal.ops.commitFilesInternal, {
        files: [
          {
            path: "/existing.txt",
            blobId: "new-blob",
            basis: undefined,
            metadata: { contentType: "text/plain", size: 200 },
          },
        ],
      });

      await t.run(async (ctx) => {
        const file = await getFile(ctx, "/existing.txt");
        expect(file!.blobId).toBe("new-blob");

        // Old blob should have refCount decremented
        const oldBlob = await getBlob(ctx, "old-blob");
        expect(oldBlob!.refCount).toBe(0);

        // New blob should have refCount 1
        const newBlob = await getBlob(ctx, "new-blob");
        expect(newBlob!.refCount).toBe(1);
      });
    });
  });

  describe("basis: null (must not exist)", () => {
    test("creates new file when path doesn't exist", async () => {
      const t = initConvexTest();

      await t.mutation(internal.ops.commitFilesInternal, {
        files: [
          {
            path: "/new.txt",
            blobId: "blob-1",
            basis: null,
            metadata: { contentType: "text/plain", size: 100 },
          },
        ],
      });

      await t.run(async (ctx) => {
        const file = await getFile(ctx, "/new.txt");
        expect(file).not.toBeNull();
        expect(file!.blobId).toBe("blob-1");
      });
    });

    test("throws CAS conflict when file already exists", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/existing.txt", "existing-blob");
      });

      await expect(
        t.mutation(internal.ops.commitFilesInternal, {
          files: [
            {
              path: "/existing.txt",
              blobId: "new-blob",
              basis: null,
              metadata: { contentType: "text/plain", size: 100 },
            },
          ],
        }),
      ).rejects.toThrow(
        'CAS conflict for path "/existing.txt": expected basis "null", found "existing-blob"',
      );
    });
  });

  describe("basis: string (must match blobId)", () => {
    test("updates file when basis matches current blobId", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/file.txt", "current-blob");
      });

      await t.mutation(internal.ops.commitFilesInternal, {
        files: [
          {
            path: "/file.txt",
            blobId: "new-blob",
            basis: "current-blob",
            metadata: { contentType: "text/plain", size: 200 },
          },
        ],
      });

      await t.run(async (ctx) => {
        const file = await getFile(ctx, "/file.txt");
        expect(file!.blobId).toBe("new-blob");
      });
    });

    test("throws CAS conflict when basis doesn't match", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/file.txt", "current-blob");
      });

      await expect(
        t.mutation(internal.ops.commitFilesInternal, {
          files: [
            {
              path: "/file.txt",
              blobId: "new-blob",
              basis: "wrong-blob",
              metadata: { contentType: "text/plain", size: 100 },
            },
          ],
        }),
      ).rejects.toThrow(
        'CAS conflict for path "/file.txt": expected basis "wrong-blob", found "current-blob"',
      );
    });

    test("throws CAS conflict when file doesn't exist but basis expects it", async () => {
      const t = initConvexTest();

      await expect(
        t.mutation(internal.ops.commitFilesInternal, {
          files: [
            {
              path: "/nonexistent.txt",
              blobId: "new-blob",
              basis: "expected-blob",
              metadata: { contentType: "text/plain", size: 100 },
            },
          ],
        }),
      ).rejects.toThrow(
        'CAS conflict for path "/nonexistent.txt": expected basis "expected-blob", found "null"',
      );
    });
  });
});

// ============================================================================
// transact Source Predicate Tests
// ============================================================================

describe("transact source predicates", () => {
  // Dummy config for tests (not actually used by transact mutation)
  const config = {
    storage: {
      type: "bunny" as const,
      apiKey: "test",
      storageZoneName: "test",
      cdnHostname: "test.b-cdn.net",
    },
  };

  test("throws when source file not found", async () => {
    const t = initConvexTest();

    await expect(
      t.mutation(api.ops.transact, {
        config,
        ops: [
          {
            op: "delete",
            source: makeSource("/nonexistent.txt", "some-blob"),
          },
        ],
      }),
    ).rejects.toThrow('Source file not found: "/nonexistent.txt"');
  });

  test("throws when source blobId has changed", async () => {
    const t = initConvexTest();

    await t.run(async (ctx) => {
      await createFile(ctx, "/file.txt", "current-blob");
    });

    await expect(
      t.mutation(api.ops.transact, {
        config,
        ops: [
          {
            op: "delete",
            source: makeSource("/file.txt", "stale-blob"),
          },
        ],
      }),
    ).rejects.toThrow(
      'Source file changed: "/file.txt" expected blobId "stale-blob", found "current-blob"',
    );
  });

  test("succeeds when source path and blobId match", async () => {
    const t = initConvexTest();

    await t.run(async (ctx) => {
      await createFile(ctx, "/file.txt", "correct-blob");
    });

    await t.mutation(api.ops.transact, {
      config,
      ops: [
        {
          op: "delete",
          source: makeSource("/file.txt", "correct-blob"),
        },
      ],
    });

    await t.run(async (ctx) => {
      const file = await getFile(ctx, "/file.txt");
      expect(file).toBeNull();
    });
  });
});

// ============================================================================
// transact Dest Predicate Tests (move/copy)
// ============================================================================

describe("transact dest predicates", () => {
  const config = {
    storage: {
      type: "bunny" as const,
      apiKey: "test",
      storageZoneName: "test",
      cdnHostname: "test.b-cdn.net",
    },
  };

  describe("basis: undefined (no check, allow overwrite)", () => {
    test("move overwrites existing dest file", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/source.txt", "source-blob");
        await createFile(ctx, "/dest.txt", "dest-blob");
      });

      await t.mutation(api.ops.transact, {
        config,
        ops: [
          {
            op: "move",
            source: makeSource("/source.txt", "source-blob"),
            dest: { path: "/dest.txt", basis: undefined },
          },
        ],
      });

      await t.run(async (ctx) => {
        // Source should be gone
        const sourceFile = await getFile(ctx, "/source.txt");
        expect(sourceFile).toBeNull();

        // Dest should now point to source blob
        const destFile = await getFile(ctx, "/dest.txt");
        expect(destFile!.blobId).toBe("source-blob");

        // Old dest blob refCount should be decremented
        const destBlob = await getBlob(ctx, "dest-blob");
        expect(destBlob!.refCount).toBe(0);
      });
    });

    test("copy overwrites existing dest file", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/source.txt", "source-blob");
        await createFile(ctx, "/dest.txt", "dest-blob");
      });

      await t.mutation(api.ops.transact, {
        config,
        ops: [
          {
            op: "copy",
            source: makeSource("/source.txt", "source-blob"),
            dest: { path: "/dest.txt", basis: undefined },
          },
        ],
      });

      await t.run(async (ctx) => {
        // Source should still exist
        const sourceFile = await getFile(ctx, "/source.txt");
        expect(sourceFile!.blobId).toBe("source-blob");

        // Dest should now point to source blob
        const destFile = await getFile(ctx, "/dest.txt");
        expect(destFile!.blobId).toBe("source-blob");

        // Source blob refCount should be incremented (copy)
        const sourceBlob = await getBlob(ctx, "source-blob");
        expect(sourceBlob!.refCount).toBe(2);

        // Old dest blob refCount should be decremented
        const destBlob = await getBlob(ctx, "dest-blob");
        expect(destBlob!.refCount).toBe(0);
      });
    });
  });

  describe("basis: null (dest must not exist)", () => {
    test("move succeeds when dest doesn't exist", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/source.txt", "source-blob");
      });

      await t.mutation(api.ops.transact, {
        config,
        ops: [
          {
            op: "move",
            source: makeSource("/source.txt", "source-blob"),
            dest: { path: "/dest.txt", basis: null },
          },
        ],
      });

      await t.run(async (ctx) => {
        const sourceFile = await getFile(ctx, "/source.txt");
        expect(sourceFile).toBeNull();

        const destFile = await getFile(ctx, "/dest.txt");
        expect(destFile!.blobId).toBe("source-blob");
      });
    });

    test("move throws when dest exists", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/source.txt", "source-blob");
        await createFile(ctx, "/dest.txt", "existing-blob");
      });

      await expect(
        t.mutation(api.ops.transact, {
          config,
          ops: [
            {
              op: "move",
              source: makeSource("/source.txt", "source-blob"),
              dest: { path: "/dest.txt", basis: null },
            },
          ],
        }),
      ).rejects.toThrow(
        'Dest conflict at "/dest.txt": expected no file, found blobId "existing-blob"',
      );
    });

    test("copy succeeds when dest doesn't exist", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/source.txt", "source-blob");
      });

      await t.mutation(api.ops.transact, {
        config,
        ops: [
          {
            op: "copy",
            source: makeSource("/source.txt", "source-blob"),
            dest: { path: "/dest.txt", basis: null },
          },
        ],
      });

      await t.run(async (ctx) => {
        const sourceFile = await getFile(ctx, "/source.txt");
        expect(sourceFile!.blobId).toBe("source-blob");

        const destFile = await getFile(ctx, "/dest.txt");
        expect(destFile!.blobId).toBe("source-blob");

        // RefCount should be 2 (source + dest)
        const blob = await getBlob(ctx, "source-blob");
        expect(blob!.refCount).toBe(2);
      });
    });

    test("copy throws when dest exists", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/source.txt", "source-blob");
        await createFile(ctx, "/dest.txt", "existing-blob");
      });

      await expect(
        t.mutation(api.ops.transact, {
          config,
          ops: [
            {
              op: "copy",
              source: makeSource("/source.txt", "source-blob"),
              dest: { path: "/dest.txt", basis: null },
            },
          ],
        }),
      ).rejects.toThrow(
        'Dest conflict at "/dest.txt": expected no file, found blobId "existing-blob"',
      );
    });
  });

  describe("basis: string (dest must match blobId)", () => {
    test("move succeeds when dest blobId matches basis", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/source.txt", "source-blob");
        await createFile(ctx, "/dest.txt", "expected-blob");
      });

      await t.mutation(api.ops.transact, {
        config,
        ops: [
          {
            op: "move",
            source: makeSource("/source.txt", "source-blob"),
            dest: { path: "/dest.txt", basis: "expected-blob" },
          },
        ],
      });

      await t.run(async (ctx) => {
        const destFile = await getFile(ctx, "/dest.txt");
        expect(destFile!.blobId).toBe("source-blob");
      });
    });

    test("move throws when dest blobId doesn't match basis", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/source.txt", "source-blob");
        await createFile(ctx, "/dest.txt", "actual-blob");
      });

      await expect(
        t.mutation(api.ops.transact, {
          config,
          ops: [
            {
              op: "move",
              source: makeSource("/source.txt", "source-blob"),
              dest: { path: "/dest.txt", basis: "wrong-blob" },
            },
          ],
        }),
      ).rejects.toThrow(
        'Dest conflict at "/dest.txt": expected blobId "wrong-blob", found "actual-blob"',
      );
    });

    test("move throws when dest doesn't exist but basis expects it", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/source.txt", "source-blob");
      });

      await expect(
        t.mutation(api.ops.transact, {
          config,
          ops: [
            {
              op: "move",
              source: makeSource("/source.txt", "source-blob"),
              dest: { path: "/dest.txt", basis: "expected-blob" },
            },
          ],
        }),
      ).rejects.toThrow(
        'Dest conflict at "/dest.txt": expected blobId "expected-blob", found null',
      );
    });
  });
});

// ============================================================================
// transact Operations and RefCount Tests
// ============================================================================

describe("transact operations", () => {
  const config = {
    storage: {
      type: "bunny" as const,
      apiKey: "test",
      storageZoneName: "test",
      cdnHostname: "test.b-cdn.net",
    },
  };

  describe("delete operation", () => {
    test("deletes file and decrements blob refCount", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/file.txt", "blob-1");
      });

      await t.mutation(api.ops.transact, {
        config,
        ops: [
          {
            op: "delete",
            source: makeSource("/file.txt", "blob-1"),
          },
        ],
      });

      await t.run(async (ctx) => {
        const file = await getFile(ctx, "/file.txt");
        expect(file).toBeNull();

        const blob = await getBlob(ctx, "blob-1");
        expect(blob!.refCount).toBe(0);
      });
    });

    test("handles multiple deletes atomically", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/file1.txt", "blob-1");
        await createFile(ctx, "/file2.txt", "blob-2");
      });

      await t.mutation(api.ops.transact, {
        config,
        ops: [
          { op: "delete", source: makeSource("/file1.txt", "blob-1") },
          { op: "delete", source: makeSource("/file2.txt", "blob-2") },
        ],
      });

      await t.run(async (ctx) => {
        expect(await getFile(ctx, "/file1.txt")).toBeNull();
        expect(await getFile(ctx, "/file2.txt")).toBeNull();
      });
    });
  });

  describe("move operation", () => {
    test("moves file by updating path", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/old-path.txt", "blob-1");
      });

      await t.mutation(api.ops.transact, {
        config,
        ops: [
          {
            op: "move",
            source: makeSource("/old-path.txt", "blob-1"),
            dest: { path: "/new-path.txt", basis: null },
          },
        ],
      });

      await t.run(async (ctx) => {
        expect(await getFile(ctx, "/old-path.txt")).toBeNull();

        const newFile = await getFile(ctx, "/new-path.txt");
        expect(newFile!.blobId).toBe("blob-1");

        // RefCount should stay at 1 (move doesn't copy)
        const blob = await getBlob(ctx, "blob-1");
        expect(blob!.refCount).toBe(1);
      });
    });
  });

  describe("copy operation", () => {
    test("copies file by creating new file record and incrementing refCount", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/source.txt", "blob-1");
      });

      await t.mutation(api.ops.transact, {
        config,
        ops: [
          {
            op: "copy",
            source: makeSource("/source.txt", "blob-1"),
            dest: { path: "/dest.txt", basis: null },
          },
        ],
      });

      await t.run(async (ctx) => {
        // Both files should exist
        const sourceFile = await getFile(ctx, "/source.txt");
        const destFile = await getFile(ctx, "/dest.txt");
        expect(sourceFile!.blobId).toBe("blob-1");
        expect(destFile!.blobId).toBe("blob-1");

        // RefCount should be 2
        const blob = await getBlob(ctx, "blob-1");
        expect(blob!.refCount).toBe(2);
      });
    });

    test("multiple copies increment refCount correctly", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/source.txt", "blob-1");
      });

      // First copy
      await t.mutation(api.ops.transact, {
        config,
        ops: [
          {
            op: "copy",
            source: makeSource("/source.txt", "blob-1"),
            dest: { path: "/copy1.txt", basis: null },
          },
        ],
      });

      // Second copy
      await t.mutation(api.ops.transact, {
        config,
        ops: [
          {
            op: "copy",
            source: makeSource("/source.txt", "blob-1"),
            dest: { path: "/copy2.txt", basis: null },
          },
        ],
      });

      await t.run(async (ctx) => {
        const blob = await getBlob(ctx, "blob-1");
        expect(blob!.refCount).toBe(3); // original + 2 copies
      });
    });
  });

  describe("atomic transactions", () => {
    test("all operations in a transaction succeed or fail together", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/file1.txt", "blob-1");
        // Note: /file2.txt doesn't exist
      });

      // Transaction with valid and invalid ops should fail entirely
      await expect(
        t.mutation(api.ops.transact, {
          config,
          ops: [
            // Valid: delete existing file
            { op: "delete", source: makeSource("/file1.txt", "blob-1") },
            // Invalid: source doesn't exist
            { op: "delete", source: makeSource("/file2.txt", "blob-2") },
          ],
        }),
      ).rejects.toThrow('Source file not found: "/file2.txt"');

      // file1.txt should still exist (transaction rolled back)
      await t.run(async (ctx) => {
        const file = await getFile(ctx, "/file1.txt");
        expect(file).not.toBeNull();
        expect(file!.blobId).toBe("blob-1");
      });
    });
  });
});

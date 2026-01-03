/// <reference types="vite/client" />
import { describe, test, expect } from "vitest";
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import schema from "./schema.js";
import { api, internal } from "./_generated/api.js";
import type { ConflictErrorData, ConflictCode } from "./types.js";
import { isConflictError } from "./types.js";

const modules = import.meta.glob("./**/*.ts");

function initConvexTest() {
  return convexTest(schema, modules);
}

/**
 * Helper to assert a promise rejects with a ConvexError containing conflict data.
 */
async function expectConflictError(
  promise: Promise<unknown>,
  expectedCode: ConflictCode,
  expectedPath: string,
): Promise<ConflictErrorData> {
  try {
    await promise;
    expect.fail("Expected promise to reject with ConvexError");
  } catch (e) {
    expect(e).toBeInstanceOf(ConvexError);
    let data = (e as ConvexError<ConflictErrorData>).data;
    // convex-test serializes ConvexError data as JSON string
    if (typeof data === "string") {
      data = JSON.parse(data) as ConflictErrorData;
    }
    expect(isConflictError(data)).toBe(true);
    expect(data.code).toBe(expectedCode);
    expect(data.path).toBe(expectedPath);
    return data;
  }
  throw new Error("Unreachable");
}

// Default metadata for test files
const defaultMetadata = { contentType: "text/plain", size: 100 };

// Helper to create a source object for transact operations
function makeSource(
  path: string,
  blobId: string,
  metadata = defaultMetadata,
  attributes?: { expiresAt?: number },
) {
  return { path, blobId, ...metadata, attributes };
}

// Helper to create a file directly in the database (simulating committed state)
async function createFile(
  ctx: { db: any },
  path: string,
  blobId: string,
  metadata: { contentType: string; size: number } = defaultMetadata,
  attributes?: { expiresAt?: number },
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
    attributes,
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

    const data = await expectConflictError(
      t.mutation(api.ops.transact.transact, {
        config,
        ops: [
          {
            op: "delete",
            source: makeSource("/nonexistent.txt", "some-blob"),
          },
        ],
      }),
      "SOURCE_NOT_FOUND",
      "/nonexistent.txt",
    );
    expect(data.expected).toBe("some-blob");
    expect(data.found).toBe(null);
  });

  test("throws when source blobId has changed", async () => {
    const t = initConvexTest();

    await t.run(async (ctx) => {
      await createFile(ctx, "/file.txt", "current-blob");
    });

    const data = await expectConflictError(
      t.mutation(api.ops.transact.transact, {
        config,
        ops: [
          {
            op: "delete",
            source: makeSource("/file.txt", "stale-blob"),
          },
        ],
      }),
      "SOURCE_CHANGED",
      "/file.txt",
    );
    expect(data.expected).toBe("stale-blob");
    expect(data.found).toBe("current-blob");
  });

  test("succeeds when source path and blobId match", async () => {
    const t = initConvexTest();

    await t.run(async (ctx) => {
      await createFile(ctx, "/file.txt", "correct-blob");
    });

    await t.mutation(api.ops.transact.transact, {
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

      await t.mutation(api.ops.transact.transact, {
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

      await t.mutation(api.ops.transact.transact, {
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

      await t.mutation(api.ops.transact.transact, {
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

      const data = await expectConflictError(
        t.mutation(api.ops.transact.transact, {
          config,
          ops: [
            {
              op: "move",
              source: makeSource("/source.txt", "source-blob"),
              dest: { path: "/dest.txt", basis: null },
            },
          ],
        }),
        "DEST_EXISTS",
        "/dest.txt",
      );
      expect(data.expected).toBe(null);
      expect(data.found).toBe("existing-blob");
    });

    test("copy succeeds when dest doesn't exist", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/source.txt", "source-blob");
      });

      await t.mutation(api.ops.transact.transact, {
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

      const data = await expectConflictError(
        t.mutation(api.ops.transact.transact, {
          config,
          ops: [
            {
              op: "copy",
              source: makeSource("/source.txt", "source-blob"),
              dest: { path: "/dest.txt", basis: null },
            },
          ],
        }),
        "DEST_EXISTS",
        "/dest.txt",
      );
      expect(data.expected).toBe(null);
      expect(data.found).toBe("existing-blob");
    });
  });

  describe("basis: string (dest must match blobId)", () => {
    test("move succeeds when dest blobId matches basis", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/source.txt", "source-blob");
        await createFile(ctx, "/dest.txt", "expected-blob");
      });

      await t.mutation(api.ops.transact.transact, {
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

      const data = await expectConflictError(
        t.mutation(api.ops.transact.transact, {
          config,
          ops: [
            {
              op: "move",
              source: makeSource("/source.txt", "source-blob"),
              dest: { path: "/dest.txt", basis: "wrong-blob" },
            },
          ],
        }),
        "DEST_CHANGED",
        "/dest.txt",
      );
      expect(data.expected).toBe("wrong-blob");
      expect(data.found).toBe("actual-blob");
    });

    test("move throws when dest doesn't exist but basis expects it", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/source.txt", "source-blob");
      });

      const data = await expectConflictError(
        t.mutation(api.ops.transact.transact, {
          config,
          ops: [
            {
              op: "move",
              source: makeSource("/source.txt", "source-blob"),
              dest: { path: "/dest.txt", basis: "expected-blob" },
            },
          ],
        }),
        "DEST_NOT_FOUND",
        "/dest.txt",
      );
      expect(data.expected).toBe("expected-blob");
      expect(data.found).toBe(null);
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

      await t.mutation(api.ops.transact.transact, {
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

      await t.mutation(api.ops.transact.transact, {
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

      await t.mutation(api.ops.transact.transact, {
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

      await t.mutation(api.ops.transact.transact, {
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
      await t.mutation(api.ops.transact.transact, {
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
      await t.mutation(api.ops.transact.transact, {
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
      const data = await expectConflictError(
        t.mutation(api.ops.transact.transact, {
          config,
          ops: [
            // Valid: delete existing file
            { op: "delete", source: makeSource("/file1.txt", "blob-1") },
            // Invalid: source doesn't exist
            { op: "delete", source: makeSource("/file2.txt", "blob-2") },
          ],
        }),
        "SOURCE_NOT_FOUND",
        "/file2.txt",
      );
      expect(data.operationIndex).toBe(2);

      // file1.txt should still exist (transaction rolled back)
      await t.run(async (ctx) => {
        const file = await getFile(ctx, "/file1.txt");
        expect(file).not.toBeNull();
        expect(file!.blobId).toBe("blob-1");
      });
    });
  });

  // ============================================================================
  // Journal Semantics Tests
  // Operations are applied in order, allowing chained/dependent operations
  // ============================================================================

  describe("journal semantics", () => {
    test("delete then move to same path with basis:null succeeds", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/target.txt", "old-blob");
        await createFile(ctx, "/source.txt", "new-blob");
      });

      // Delete /target.txt, then move /source.txt to /target.txt
      // This would fail with upfront validation since /target.txt exists
      await t.mutation(api.ops.transact.transact, {
        config,
        ops: [
          { op: "delete", source: makeSource("/target.txt", "old-blob") },
          {
            op: "move",
            source: makeSource("/source.txt", "new-blob"),
            dest: { path: "/target.txt", basis: null },
          },
        ],
      });

      await t.run(async (ctx) => {
        // Source should be gone
        expect(await getFile(ctx, "/source.txt")).toBeNull();

        // Target should now have new-blob
        const target = await getFile(ctx, "/target.txt");
        expect(target).not.toBeNull();
        expect(target!.blobId).toBe("new-blob");

        // Old blob refCount should be 0
        const oldBlob = await getBlob(ctx, "old-blob");
        expect(oldBlob!.refCount).toBe(0);
      });
    });

    test("chained moves: A -> B -> C", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/a.txt", "blob-1");
      });

      // Move /a.txt to /b.txt, then move /b.txt to /c.txt
      // Second op references path created by first op
      await t.mutation(api.ops.transact.transact, {
        config,
        ops: [
          {
            op: "move",
            source: makeSource("/a.txt", "blob-1"),
            dest: { path: "/b.txt", basis: null },
          },
          {
            op: "move",
            source: makeSource("/b.txt", "blob-1"),
            dest: { path: "/c.txt", basis: null },
          },
        ],
      });

      await t.run(async (ctx) => {
        expect(await getFile(ctx, "/a.txt")).toBeNull();
        expect(await getFile(ctx, "/b.txt")).toBeNull();

        const cFile = await getFile(ctx, "/c.txt");
        expect(cFile).not.toBeNull();
        expect(cFile!.blobId).toBe("blob-1");
      });
    });

    test("copy creates file that can be used as source in next op", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/original.txt", "blob-1");
      });

      // Copy /original.txt to /copy.txt, then copy /copy.txt to /copy2.txt
      await t.mutation(api.ops.transact.transact, {
        config,
        ops: [
          {
            op: "copy",
            source: makeSource("/original.txt", "blob-1"),
            dest: { path: "/copy.txt", basis: null },
          },
          {
            op: "copy",
            source: makeSource("/copy.txt", "blob-1"),
            dest: { path: "/copy2.txt", basis: null },
          },
        ],
      });

      await t.run(async (ctx) => {
        // All three files should exist
        expect(await getFile(ctx, "/original.txt")).not.toBeNull();
        expect(await getFile(ctx, "/copy.txt")).not.toBeNull();
        expect(await getFile(ctx, "/copy2.txt")).not.toBeNull();

        // Blob refCount should be 3
        const blob = await getBlob(ctx, "blob-1");
        expect(blob!.refCount).toBe(3);
      });
    });

    test("copy then delete source", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/source.txt", "blob-1");
      });

      // Copy /source.txt to /backup.txt, then delete /source.txt
      await t.mutation(api.ops.transact.transact, {
        config,
        ops: [
          {
            op: "copy",
            source: makeSource("/source.txt", "blob-1"),
            dest: { path: "/backup.txt", basis: null },
          },
          { op: "delete", source: makeSource("/source.txt", "blob-1") },
        ],
      });

      await t.run(async (ctx) => {
        // Source should be gone
        expect(await getFile(ctx, "/source.txt")).toBeNull();

        // Backup should exist
        const backup = await getFile(ctx, "/backup.txt");
        expect(backup).not.toBeNull();
        expect(backup!.blobId).toBe("blob-1");

        // Blob refCount should be 1 (copy added 1, delete removed 1)
        const blob = await getBlob(ctx, "blob-1");
        expect(blob!.refCount).toBe(1);
      });
    });

    test("swap two files using temp path", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/a.txt", "blob-a");
        await createFile(ctx, "/b.txt", "blob-b");
      });

      // Swap /a.txt and /b.txt using /temp.txt as intermediate
      // 1. Move /a.txt to /temp.txt
      // 2. Move /b.txt to /a.txt
      // 3. Move /temp.txt to /b.txt
      await t.mutation(api.ops.transact.transact, {
        config,
        ops: [
          {
            op: "move",
            source: makeSource("/a.txt", "blob-a"),
            dest: { path: "/temp.txt", basis: null },
          },
          {
            op: "move",
            source: makeSource("/b.txt", "blob-b"),
            dest: { path: "/a.txt", basis: null },
          },
          {
            op: "move",
            source: makeSource("/temp.txt", "blob-a"),
            dest: { path: "/b.txt", basis: null },
          },
        ],
      });

      await t.run(async (ctx) => {
        // /a.txt should now have blob-b
        const aFile = await getFile(ctx, "/a.txt");
        expect(aFile!.blobId).toBe("blob-b");

        // /b.txt should now have blob-a
        const bFile = await getFile(ctx, "/b.txt");
        expect(bFile!.blobId).toBe("blob-a");

        // /temp.txt should not exist
        expect(await getFile(ctx, "/temp.txt")).toBeNull();
      });
    });

    test("multiple operations on same path in sequence", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/file.txt", "blob-1");
        await createFile(ctx, "/other.txt", "blob-2");
      });

      // 1. Delete /file.txt
      // 2. Move /other.txt to /file.txt
      // 3. Delete /file.txt again (now with blob-2)
      await t.mutation(api.ops.transact.transact, {
        config,
        ops: [
          { op: "delete", source: makeSource("/file.txt", "blob-1") },
          {
            op: "move",
            source: makeSource("/other.txt", "blob-2"),
            dest: { path: "/file.txt", basis: null },
          },
          { op: "delete", source: makeSource("/file.txt", "blob-2") },
        ],
      });

      await t.run(async (ctx) => {
        // Both files should be gone
        expect(await getFile(ctx, "/file.txt")).toBeNull();
        expect(await getFile(ctx, "/other.txt")).toBeNull();

        // Both blobs should have refCount 0
        expect((await getBlob(ctx, "blob-1"))!.refCount).toBe(0);
        expect((await getBlob(ctx, "blob-2"))!.refCount).toBe(0);
      });
    });

    test("later operation failure rolls back earlier operations", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/file1.txt", "blob-1");
        await createFile(ctx, "/file2.txt", "blob-2");
        // Note: /file3.txt doesn't exist
      });

      // Op 1: delete /file1.txt (valid)
      // Op 2: delete /file2.txt (valid)
      // Op 3: delete /file3.txt (invalid - doesn't exist)
      const data = await expectConflictError(
        t.mutation(api.ops.transact.transact, {
          config,
          ops: [
            { op: "delete", source: makeSource("/file1.txt", "blob-1") },
            { op: "delete", source: makeSource("/file2.txt", "blob-2") },
            { op: "delete", source: makeSource("/file3.txt", "blob-3") },
          ],
        }),
        "SOURCE_NOT_FOUND",
        "/file3.txt",
      );
      expect(data.operationIndex).toBe(3);

      // All files should still exist (rolled back)
      await t.run(async (ctx) => {
        expect(await getFile(ctx, "/file1.txt")).not.toBeNull();
        expect(await getFile(ctx, "/file2.txt")).not.toBeNull();

        // RefCounts should be unchanged
        expect((await getBlob(ctx, "blob-1"))!.refCount).toBe(1);
        expect((await getBlob(ctx, "blob-2"))!.refCount).toBe(1);
      });
    });

    test("error message includes operation number", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/file1.txt", "blob-1");
      });

      // Op 1 is valid, Op 2 fails
      const data = await expectConflictError(
        t.mutation(api.ops.transact.transact, {
          config,
          ops: [
            { op: "delete", source: makeSource("/file1.txt", "blob-1") },
            { op: "delete", source: makeSource("/nonexistent.txt", "blob-x") },
          ],
        }),
        "SOURCE_NOT_FOUND",
        "/nonexistent.txt",
      );
      expect(data.operationIndex).toBe(2);
      expect(data.message).toMatch(/Operation 2:/);
    });

    test("circular rename: A -> B, B -> A", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/a.txt", "blob-a");
        await createFile(ctx, "/b.txt", "blob-b");
      });

      // This is tricky: we need to use overwrite semantics (basis: undefined)
      // 1. Move /a.txt to /b.txt (overwrites /b.txt)
      // 2. But now we can't move the original /b.txt because it's gone!

      // So circular rename isn't directly possible without a temp file
      // Let's verify the overwrite case works correctly though
      await t.mutation(api.ops.transact.transact, {
        config,
        ops: [
          {
            op: "move",
            source: makeSource("/a.txt", "blob-a"),
            dest: { path: "/b.txt" }, // basis: undefined = overwrite
          },
        ],
      });

      await t.run(async (ctx) => {
        expect(await getFile(ctx, "/a.txt")).toBeNull();

        const bFile = await getFile(ctx, "/b.txt");
        expect(bFile!.blobId).toBe("blob-a");

        // Old blob-b should have refCount 0 (was overwritten)
        expect((await getBlob(ctx, "blob-b"))!.refCount).toBe(0);
      });
    });
  });
});

// ============================================================================
// registerPendingUpload Tests
// ============================================================================
//
// Note: The previous getBlob, getFile, writeFile, and uploadBlob actions have
// been moved to the client layer (ConvexFS class) to support large files by
// running in the caller's execution context. The component now only provides
// registerPendingUpload for recording upload metadata.
// ============================================================================

describe("registerPendingUpload", () => {
  const config = {
    storage: { type: "test" as const },
  };

  test("creates upload record with correct metadata", async () => {
    const t = initConvexTest();

    const blobId = "test-blob-id";
    await t.mutation(api.transfer.registerPendingUpload, {
      config,
      blobId,
      contentType: "application/json",
      size: 1234,
    });

    // Verify upload record was created with correct metadata
    const upload = await t.run(async (ctx) => {
      return await ctx.db
        .query("uploads")
        .withIndex("blobId", (q: any) => q.eq("blobId", blobId))
        .unique();
    });

    expect(upload).not.toBeNull();
    expect(upload!.blobId).toBe(blobId);
    expect(upload!.contentType).toBe("application/json");
    expect(upload!.size).toBe(1234);
    expect(upload!.expiresAt).toBeGreaterThan(Date.now());
  });

  test("sets expiration time for GC", async () => {
    const t = initConvexTest();

    const blobId = "expiring-blob";
    const before = Date.now();

    await t.mutation(api.transfer.registerPendingUpload, {
      config,
      blobId,
      contentType: "text/plain",
      size: 100,
    });

    const after = Date.now();

    const upload = await t.run(async (ctx) => {
      return await ctx.db
        .query("uploads")
        .withIndex("blobId", (q: any) => q.eq("blobId", blobId))
        .unique();
    });

    // Default TTL is 4 hours (14400 seconds)
    const expectedMinExpiry = before + 14400 * 1000;
    const expectedMaxExpiry = after + 14400 * 1000;

    expect(upload!.expiresAt).toBeGreaterThanOrEqual(expectedMinExpiry);
    expect(upload!.expiresAt).toBeLessThanOrEqual(expectedMaxExpiry);
  });
});

// ============================================================================
// clearAllFiles Tests
// ============================================================================

describe("clearAllFiles", () => {
  test("throws by default when allowClearAllFiles is not set", async () => {
    const t = initConvexTest();

    // Store config without allowClearAllFiles flag
    await t.run(async (ctx) => {
      await ctx.db.insert("config", {
        key: "storage",
        value: {
          storage: { type: "test" as const },
        },
      });
    });

    await expect(
      t.action(internal.ops.basics.clearAllFiles, {}),
    ).rejects.toThrow(/clearAllFiles is disabled/);
  });
});

// ============================================================================
// File Attributes Tests
// ============================================================================

describe("file attributes", () => {
  const config = {
    storage: {
      type: "bunny" as const,
      apiKey: "test",
      storageZoneName: "test",
      cdnHostname: "test.b-cdn.net",
    },
  };

  describe("commitFiles with attributes", () => {
    test("creates file with expiresAt attribute", async () => {
      const t = initConvexTest();
      const expiresAt = Date.now() + 3600000; // 1 hour from now

      await t.run(async (ctx) => {
        await ctx.db.insert("uploads", {
          blobId: "blob-1",
          expiresAt: Date.now() + 3600000,
          contentType: "text/plain",
          size: 100,
        });
      });

      await t.mutation(api.ops.transact.commitFiles, {
        config,
        files: [
          {
            path: "/test.txt",
            blobId: "blob-1",
            attributes: { expiresAt },
          },
        ],
      });

      await t.run(async (ctx) => {
        const file = await getFile(ctx, "/test.txt");
        expect(file).not.toBeNull();
        expect(file!.attributes).toEqual({ expiresAt });
      });
    });

    test("creates file without attributes when not specified", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await ctx.db.insert("uploads", {
          blobId: "blob-1",
          expiresAt: Date.now() + 3600000,
          contentType: "text/plain",
          size: 100,
        });
      });

      await t.mutation(api.ops.transact.commitFiles, {
        config,
        files: [
          {
            path: "/test.txt",
            blobId: "blob-1",
          },
        ],
      });

      await t.run(async (ctx) => {
        const file = await getFile(ctx, "/test.txt");
        expect(file).not.toBeNull();
        expect(file!.attributes).toBeUndefined();
      });
    });

    test("overwrite clears attributes when not specified", async () => {
      const t = initConvexTest();
      const expiresAt = Date.now() + 3600000;

      // Create existing file with attributes
      await t.run(async (ctx) => {
        await createFile(ctx, "/test.txt", "old-blob", defaultMetadata, {
          expiresAt,
        });
        // Create upload for new blob
        await ctx.db.insert("uploads", {
          blobId: "new-blob",
          expiresAt: Date.now() + 3600000,
          contentType: "text/plain",
          size: 200,
        });
      });

      // Overwrite without specifying attributes
      await t.mutation(api.ops.transact.commitFiles, {
        config,
        files: [
          {
            path: "/test.txt",
            blobId: "new-blob",
          },
        ],
      });

      await t.run(async (ctx) => {
        const file = await getFile(ctx, "/test.txt");
        expect(file!.blobId).toBe("new-blob");
        expect(file!.attributes).toBeUndefined();
      });
    });

    test("overwrite can set new attributes", async () => {
      const t = initConvexTest();
      const oldExpiresAt = Date.now() + 3600000;
      const newExpiresAt = Date.now() + 7200000;

      // Create existing file with attributes
      await t.run(async (ctx) => {
        await createFile(ctx, "/test.txt", "old-blob", defaultMetadata, {
          expiresAt: oldExpiresAt,
        });
        // Create upload for new blob
        await ctx.db.insert("uploads", {
          blobId: "new-blob",
          expiresAt: Date.now() + 3600000,
          contentType: "text/plain",
          size: 200,
        });
      });

      // Overwrite with new attributes
      await t.mutation(api.ops.transact.commitFiles, {
        config,
        files: [
          {
            path: "/test.txt",
            blobId: "new-blob",
            attributes: { expiresAt: newExpiresAt },
          },
        ],
      });

      await t.run(async (ctx) => {
        const file = await getFile(ctx, "/test.txt");
        expect(file!.blobId).toBe("new-blob");
        expect(file!.attributes).toEqual({ expiresAt: newExpiresAt });
      });
    });
  });

  describe("setAttributes operation", () => {
    test("sets expiresAt on existing file", async () => {
      const t = initConvexTest();
      const expiresAt = Date.now() + 3600000;

      await t.run(async (ctx) => {
        await createFile(ctx, "/test.txt", "blob-1");
      });

      await t.mutation(api.ops.transact.transact, {
        config,
        ops: [
          {
            op: "setAttributes",
            source: makeSource("/test.txt", "blob-1"),
            attributes: { expiresAt },
          },
        ],
      });

      await t.run(async (ctx) => {
        const file = await getFile(ctx, "/test.txt");
        expect(file!.attributes).toEqual({ expiresAt });
      });
    });

    test("clears expiresAt with null", async () => {
      const t = initConvexTest();
      const expiresAt = Date.now() + 3600000;

      await t.run(async (ctx) => {
        await createFile(ctx, "/test.txt", "blob-1", defaultMetadata, {
          expiresAt,
        });
      });

      await t.mutation(api.ops.transact.transact, {
        config,
        ops: [
          {
            op: "setAttributes",
            source: makeSource("/test.txt", "blob-1", defaultMetadata, {
              expiresAt,
            }),
            attributes: { expiresAt: null },
          },
        ],
      });

      await t.run(async (ctx) => {
        const file = await getFile(ctx, "/test.txt");
        expect(file!.attributes).toBeUndefined();
      });
    });

    test("preserves expiresAt when undefined", async () => {
      const t = initConvexTest();
      const expiresAt = Date.now() + 3600000;

      await t.run(async (ctx) => {
        await createFile(ctx, "/test.txt", "blob-1", defaultMetadata, {
          expiresAt,
        });
      });

      await t.mutation(api.ops.transact.transact, {
        config,
        ops: [
          {
            op: "setAttributes",
            source: makeSource("/test.txt", "blob-1", defaultMetadata, {
              expiresAt,
            }),
            attributes: {}, // No expiresAt key - should preserve
          },
        ],
      });

      await t.run(async (ctx) => {
        const file = await getFile(ctx, "/test.txt");
        expect(file!.attributes).toEqual({ expiresAt });
      });
    });

    test("throws SOURCE_NOT_FOUND when file doesn't exist", async () => {
      const t = initConvexTest();

      await expectConflictError(
        t.mutation(api.ops.transact.transact, {
          config,
          ops: [
            {
              op: "setAttributes",
              source: makeSource("/nonexistent.txt", "blob-1"),
              attributes: { expiresAt: Date.now() + 3600000 },
            },
          ],
        }),
        "SOURCE_NOT_FOUND",
        "/nonexistent.txt",
      );
    });

    test("throws SOURCE_CHANGED when blobId doesn't match", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/test.txt", "actual-blob");
      });

      await expectConflictError(
        t.mutation(api.ops.transact.transact, {
          config,
          ops: [
            {
              op: "setAttributes",
              source: makeSource("/test.txt", "wrong-blob"),
              attributes: { expiresAt: Date.now() + 3600000 },
            },
          ],
        }),
        "SOURCE_CHANGED",
        "/test.txt",
      );
    });
  });

  describe("move clears attributes", () => {
    test("destination has no attributes after move", async () => {
      const t = initConvexTest();
      const expiresAt = Date.now() + 3600000;

      await t.run(async (ctx) => {
        await createFile(ctx, "/source.txt", "blob-1", defaultMetadata, {
          expiresAt,
        });
      });

      await t.mutation(api.ops.transact.transact, {
        config,
        ops: [
          {
            op: "move",
            source: makeSource("/source.txt", "blob-1", defaultMetadata, {
              expiresAt,
            }),
            dest: { path: "/dest.txt", basis: null },
          },
        ],
      });

      await t.run(async (ctx) => {
        expect(await getFile(ctx, "/source.txt")).toBeNull();
        const destFile = await getFile(ctx, "/dest.txt");
        expect(destFile).not.toBeNull();
        expect(destFile!.blobId).toBe("blob-1");
        expect(destFile!.attributes).toBeUndefined();
      });
    });
  });

  describe("copy clears attributes", () => {
    test("destination has no attributes after copy", async () => {
      const t = initConvexTest();
      const expiresAt = Date.now() + 3600000;

      await t.run(async (ctx) => {
        await createFile(ctx, "/source.txt", "blob-1", defaultMetadata, {
          expiresAt,
        });
      });

      await t.mutation(api.ops.transact.transact, {
        config,
        ops: [
          {
            op: "copy",
            source: makeSource("/source.txt", "blob-1", defaultMetadata, {
              expiresAt,
            }),
            dest: { path: "/dest.txt", basis: null },
          },
        ],
      });

      await t.run(async (ctx) => {
        // Source still has attributes
        const sourceFile = await getFile(ctx, "/source.txt");
        expect(sourceFile!.attributes).toEqual({ expiresAt });

        // Dest has no attributes
        const destFile = await getFile(ctx, "/dest.txt");
        expect(destFile).not.toBeNull();
        expect(destFile!.blobId).toBe("blob-1");
        expect(destFile!.attributes).toBeUndefined();
      });
    });

    test("copy overwrite clears dest attributes", async () => {
      const t = initConvexTest();
      const sourceExpiresAt = Date.now() + 3600000;
      const destExpiresAt = Date.now() + 7200000;

      await t.run(async (ctx) => {
        await createFile(ctx, "/source.txt", "blob-1", defaultMetadata, {
          expiresAt: sourceExpiresAt,
        });
        await createFile(ctx, "/dest.txt", "blob-2", defaultMetadata, {
          expiresAt: destExpiresAt,
        });
      });

      await t.mutation(api.ops.transact.transact, {
        config,
        ops: [
          {
            op: "copy",
            source: makeSource("/source.txt", "blob-1", defaultMetadata, {
              expiresAt: sourceExpiresAt,
            }),
            dest: { path: "/dest.txt", basis: "blob-2" },
          },
        ],
      });

      await t.run(async (ctx) => {
        const destFile = await getFile(ctx, "/dest.txt");
        expect(destFile!.blobId).toBe("blob-1");
        expect(destFile!.attributes).toBeUndefined();
      });
    });
  });

  describe("stat returns attributes", () => {
    test("includes attributes in response", async () => {
      const t = initConvexTest();
      const expiresAt = Date.now() + 3600000;

      await t.run(async (ctx) => {
        await createFile(ctx, "/test.txt", "blob-1", defaultMetadata, {
          expiresAt,
        });
      });

      const result = await t.query(api.ops.basics.stat, {
        config,
        path: "/test.txt",
      });

      expect(result).not.toBeNull();
      expect(result!.attributes).toEqual({ expiresAt });
    });

    test("returns undefined attributes when not set", async () => {
      const t = initConvexTest();

      await t.run(async (ctx) => {
        await createFile(ctx, "/test.txt", "blob-1");
      });

      const result = await t.query(api.ops.basics.stat, {
        config,
        path: "/test.txt",
      });

      expect(result).not.toBeNull();
      expect(result!.attributes).toBeUndefined();
    });
  });

  describe("list returns attributes", () => {
    test("includes attributes for each file", async () => {
      const t = initConvexTest();
      const expiresAt1 = Date.now() + 3600000;
      const expiresAt2 = Date.now() + 7200000;

      await t.run(async (ctx) => {
        await createFile(ctx, "/a.txt", "blob-1", defaultMetadata, {
          expiresAt: expiresAt1,
        });
        await createFile(ctx, "/b.txt", "blob-2", defaultMetadata, {
          expiresAt: expiresAt2,
        });
        await createFile(ctx, "/c.txt", "blob-3"); // No attributes
      });

      const result = await t.query(api.ops.basics.list, {
        config,
        paginationOpts: { numItems: 10, cursor: null },
      });

      expect(result.page).toHaveLength(3);

      const fileA = result.page.find((f: any) => f.path === "/a.txt");
      const fileB = result.page.find((f: any) => f.path === "/b.txt");
      const fileC = result.page.find((f: any) => f.path === "/c.txt");

      expect(fileA!.attributes).toEqual({ expiresAt: expiresAt1 });
      expect(fileB!.attributes).toEqual({ expiresAt: expiresAt2 });
      expect(fileC!.attributes).toBeUndefined();
    });
  });
});

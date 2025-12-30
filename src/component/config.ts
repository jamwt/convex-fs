/**
 * Config storage for background jobs.
 *
 * Components can't access env vars, so we store config in the database
 * when it's first provided via client operations.
 */

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server.js";
import { configValidator, storageConfigValidator } from "./validators.js";
import stringify from "fast-json-stable-stringify";

async function sha256Hex(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function checksum(obj: unknown): Promise<string> {
  // stable stringify => deterministic for JSON-y values
  const stable = stringify(obj);
  return sha256Hex(stable);
}

// Validator matching the config table schema
const storedConfigValidator = v.object({
  storage: storageConfigValidator,
  downloadUrlTtl: v.optional(v.number()),
  blobGracePeriod: v.optional(v.number()),
  freezeGc: v.optional(v.boolean()),
});

/**
 * Get stored config by key.
 */
export const getConfig = internalQuery({
  args: { key: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      key: v.string(),
      value: storedConfigValidator,
    }),
  ),
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("config")
      .withIndex("key", (q) => q.eq("key", args.key))
      .unique();

    if (!doc) return null;
    return { key: doc.key, value: doc.value };
  },
});

/**
 * Store or update config.
 * Called by prepareUpload to ensure config is available for GC.
 *
 * Updates all client-provided config values, but preserves the dashboard-only
 * `freezeGc` field (which can only be set manually via the Convex dashboard).
 */
export const ensureConfigStored = internalMutation({
  args: { config: configValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Use "storage" as the key for config
    const existing = await ctx.db
      .query("config")
      .withIndex("key", (q) => q.eq("key", "storage"))
      .unique();

    const newValue = {
      storage: args.config.storage,
      downloadUrlTtl: args.config.downloadUrlTtl,
      blobGracePeriod: args.config.blobGracePeriod,
    };

    const newChecksum = await checksum(newValue);

    if (!existing) {
      await ctx.db.insert("config", {
        key: "storage",
        value: newValue,
        checksum: newChecksum,
      });
    } else {
      // Delete the freezeGc field if it exists
      if (existing.value.freezeGc) {
        delete existing.value.freezeGc;
      }
      // Only update if there are actual changes (deep equal, ignoring undefined fields in newValue)
      if (existing.checksum !== newChecksum) {
        await ctx.db.patch(existing._id, {
          value: newValue,
          checksum: newChecksum,
        });
      }
    }

    return null;
  },
});

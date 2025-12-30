"use client";

/**
 * React hooks for the ConvexFS component.
 *
 * @example
 * ```typescript
 * // In your React component
 * import { usePaginatedQuery } from "@convex/fs/react";
 * import { api } from "./convex/_generated/api";
 *
 * function FileList({ prefix }: { prefix: string }) {
 *   const { results, status, loadMore } = usePaginatedQuery(
 *     api.files.list,  // your wrapper query
 *     { prefix },
 *     { initialNumItems: 20 },
 *   );
 *
 *   return (
 *     <div>
 *       {results.map((file) => (
 *         <div key={file.path}>{file.path} ({file.size} bytes)</div>
 *       ))}
 *       {status === "CanLoadMore" && (
 *         <button onClick={() => loadMore(20)}>Load more</button>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 *
 * Your wrapper query should look like:
 * ```typescript
 * // convex/files.ts
 * import { query } from "./_generated/server";
 * import { paginationOptsValidator } from "convex/server";
 * import { v } from "convex/values";
 * import { fs } from "./fs";
 *
 * export const list = query({
 *   args: {
 *     prefix: v.optional(v.string()),
 *     paginationOpts: paginationOptsValidator,
 *   },
 *   handler: async (ctx, args) => {
 *     return await fs.list(ctx, args);
 *   },
 * });
 * ```
 */

// Re-export usePaginatedQuery from convex-helpers for use with fs.list
// This hook automatically handles endCursor for reactive pagination
export { usePaginatedQuery } from "convex-helpers/react";

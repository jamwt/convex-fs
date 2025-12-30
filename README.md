# ConvexFS

<p align="center">
  <img src="docs/src/assets/convexfs-logo.png" alt="ConvexFS Logo" width="200" />
</p>

<p align="center">
  <strong>Virtual filesystem semantics for Convex, backed by Bunny.net Edge Storage</strong>
</p>

---

ConvexFS is a [Convex component](https://convex.dev/components) that provides
filesystem-like operations for managing files in your Convex application.
Instead of dealing with raw blob storage, you work with familiar concepts like
paths, files, and directories—while getting the performance benefits of a global
CDN.

## Features

- **Path-based file management** — Organize files with familiar filesystem paths
- **Atomic transactions** — Move, copy, and delete files with preconditions to
  prevent data races
- **Reference-counted blobs** — Efficient storage with automatic deduplication
- **Signed CDN URLs** — Secure, time-limited download links served from
  Bunny.net's global edge network
- **Soft deletes & disaster recovery** — Configurable grace periods let you
  recover from accidental deletions
- **Flexible authentication** — Bring your own auth logic for uploads and
  downloads

## Status

**Alpha** — This project is in active development. APIs may change before 1.0.

## Documentation

For installation instructions, guides, and API reference, visit:

**[convexfs.dev](https://convexfs.dev)**

## License

Apache-2.0

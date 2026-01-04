# ConvexFS

<p align="center">
  <img src="https://convexfs.dev/_astro/convexfs-logo.BFeIv6hE_rAku0.webp" alt="ConvexFS Logo" width="200" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/convex-fs"><img src="https://img.shields.io/npm/v/convex-fs.svg" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/convex-fs"><img src="https://img.shields.io/npm/dw/convex-fs.svg" alt="npm downloads" /></a>
  <a href="https://github.com/jamwt/convex-fs/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/convex-fs.svg" alt="license" /></a>
  <a href="https://github.com/jamwt/convex-fs/actions/workflows/test.yml"><img src="https://github.com/jamwt/convex-fs/actions/workflows/test.yml/badge.svg" alt="build status" /></a>
  <a href="https://convexfs.dev"><img src="https://img.shields.io/badge/docs-convexfs.dev-blue.svg" alt="docs" /></a>
</p>

<p align="center">
  <strong>Virtual filesystem for Convex, backed by Bunny.net Edge Storage & CDN</strong>
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
- **File expiration** — Set automatic expiration times on files for temporary
  uploads, time-limited sharing, or session-scoped content
- **Custom CDN parameters** — Pass parameters to Bunny.net edge rules for
  on-the-fly transformations like custom download filenames and image
  optimization

## Example app

The repository includes a runnable example app that allows you to curate a
[photo gallery](./example).

## Status

**Alpha** — This project is in active development. APIs may change before 1.0.

## Documentation

For installation instructions, guides, and API reference, visit:

**[convexfs.dev](https://convexfs.dev)**

## License

Apache-2.0

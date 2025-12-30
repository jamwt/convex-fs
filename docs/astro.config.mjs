// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightVideos from "starlight-videos";

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      plugins: [starlightVideos()],
      title: "ConvexFS",
      logo: {
        src: "./src/assets/convexfs-logo.png",
        alt: "ConvexFS",
      },
      customCss: ["./src/styles/custom.css"],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/jamwt/convex-fs",
        },
      ],
      sidebar: [
        {
          label: "Getting Started",
          items: [
            // Each item here is one entry in the navigation menu.
            { label: "1. Introduction", slug: "get-started/introduction" },
            { label: "2. Storage/CDN Setup", slug: "get-started/setup-bunny" },
            { label: "3. Example App", slug: "get-started/example-app" },
          ],
        },
        {
          label: "Using ConvexFS",
          items: [
            // Each item here is one entry in the navigation menu.
            { label: "Installing & configuring", slug: "guides/app-setup" },
            { label: "Uploading files", slug: "guides/uploading-files" },
            { label: "Serving files", slug: "guides/serving-files" },
            {
              label: "Filesystem operations",
              slug: "guides/filesystem-operations",
            },
            {
              label: "Transactions & atomicity",
              slug: "guides/transactions-atomicity",
            },
            { label: "Authn & authz", slug: "guides/authn-authz" },
            {
              label: "Advanced configuration",
              slug: "guides/advanced-configuration",
            },
            {
              label: "Prod/Dev/CI environments",
              slug: "guides/prod-dev-environments",
            },
            {
              label: "Admin tools & disaster recovery",
              slug: "guides/admin-tools",
            },
          ],
        },
        {
          label: "Reference",
          autogenerate: { directory: "reference" },
        },
      ],
    }),
  ],
});

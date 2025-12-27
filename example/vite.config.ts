import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  envDir: "../",
  plugins: [react()],
  resolve: {
    conditions: ["@convex-dev/component-source"],
  },
});

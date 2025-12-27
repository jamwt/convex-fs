/// <reference types="vite/client" />
import { test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema.js";
import component from "@convex/fs/test";

const modules = import.meta.glob("./**/*.*s");

export function initConvexTest() {
  const t = convexTest(schema, modules);
  component.register(t);
  return t;
}

test("setup", () => {});

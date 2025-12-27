import { defineApp } from "convex/server";
import fs from "@convex/fs/convex.config.js";

const app = defineApp();
app.use(fs);

export default app;

import { defineApp } from "convex/server";
import component from "@convex-dev/crons/convex.config.js";

const app = defineApp();
app.use(component, { name: "crons" });

export default app;

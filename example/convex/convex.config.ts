import { defineApp } from "convex/server";
import component from "../../src/component/convex.config";

const app = defineApp();
app.use(component, { name: "crons" });

export default app;

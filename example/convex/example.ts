import { v } from "convex/values";
import { internalMutation, components } from "./_generated/server.js";
import { internal } from "./_generated/api";
import { defineCrons } from "../../src/client";

const crons = defineCrons(components.crons);

export const logStuff = internalMutation({
  args: {
    message: v.string(),
  },
  handler: async (ctx, args) => {
    console.log(args.message);
  },
});

export const registerDailyCron = internalMutation({
  handler: async (ctx) => {
    if ((await crons.get(ctx, { name: "daily" })) === null) {
      await crons.register(
        ctx,
        { kind: "cron", cronspec: "0 0 * * *" },
        internal.example.logStuff,
        {
          message: "daily cron",
        },
        "daily"
      );
    }
  },
});

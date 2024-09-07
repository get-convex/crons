import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { components } from "./_generated/server";
import { internal } from "./_generated/api";
import { createFunctionHandle } from "convex/server";

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
    const existingCron = await ctx.runQuery(components.crons.index.getByName, {
      name: "daily",
    });
    if (existingCron === null) {
      await ctx.runMutation(components.crons.index.registerCron, {
        name: "daily",
        cronspec: "0 0 * * *",
        functionHandle: await createFunctionHandle(internal.example.logStuff),
        args: { message: "daily cron" },
      });
    }
  },
});

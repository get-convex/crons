import {
  createFunctionHandle,
  Expand,
  FunctionArgs,
  FunctionHandle,
  FunctionReference,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  SchedulableFunctionReference,
} from "convex/server";
import { api } from "../component/_generated/api.js";
import { CronInfo, Schedule } from "../component/public.js";
import { GenericId } from "convex/values";

export type { CronInfo };

// XXX add more functions for different types of schedules

// Implementation of crons in user space.
//
// Supports intervals in ms as well as cron schedules with the same format as
// the unix `cron` command:
//
//  *  *  *  *  *  *
//  ┬  ┬  ┬  ┬  ┬  ┬
//  │  │  │  │  │  |
//  │  │  │  │  │  └── day of week (0 - 7, 1L - 7L) (0 or 7 is Sun)
//  │  │  │  │  └───── month (1 - 12)
//  │  │  │  └──────── day of month (1 - 31, L)
//  │  │  └─────────── hour (0 - 23)
//  │  └────────────── minute (0 - 59)
//  └───────────────── second (0 - 59, optional)
//
// Crons can be registered at runtime via the `register` function.
//
// If you'd like to statically define cronjobs like in the built-in `crons.ts`
// Convex feature you can do so via an init script that idempotently registers a
// cron with a given name. e.g., in an `init.ts` file that gets run on every
// deploy via `convex dev --run init`:
//
// const crons = new Crons(components.crons);
// ...
// if ((await crons.get(ctx, { name: "daily" })) === null) {
//   await crons.register(
//     ctx,
//     { kind: "cron", cronspec: "0 0 * * *" },
//     internal.example.logStuff,
//     { message: "daily cron" },
//     "daily"
//   );
// }
export class Crons {
  constructor(private component: UseApi<typeof api>) {}

  /**
   * Schedule a mutation or action to run on a cron schedule or interval.
   *
   * @param ctx - The mutation context from the calling Convex mutation.
   * @param schedule - Either a cron specification string or an interval in
   *        milliseconds. For intervals, ms must be >= 1000.
   * @param func - A function reference to the mutation or action to schedule.
   * @param args - The arguments to the function.
   * @param name - Optional unique name for the cron. Will throw if a name is
   *        provided and a cron with the same name already exists.
   * @returns A string identifier for the cron job.
   */
  async register<F extends SchedulableFunctionReference>(
    ctx: RunMutationCtx,
    schedule: Schedule,
    func: F,
    args: FunctionArgs<F>,
    name?: string
  ): Promise<string> {
    return ctx.runMutation(this.component.public.register, {
      name,
      schedule,
      functionHandle: await createFunctionHandle(func),
      args,
    });
  }

  /**
   * List all user space cron jobs.
   *
   * @returns List of `cron` table rows.
   */
  async list(ctx: RunQueryCtx): Promise<CronInfo[]> {
    const crons = await ctx.runQuery(this.component.public.list, {});
    return crons.map((cron) => ({
      ...cron,
      functionHandle: cron.functionHandle as FunctionHandle<
        "mutation" | "action"
      >,
    }));
  }

  /**
   * Get an existing cron job by id or name.
   *
   * @param identifier - Either the ID or name of the cron job.
   * @returns Cron job document.
   */
  async get(
    ctx: RunQueryCtx,
    identifier: { id: string } | { name: string }
  ): Promise<CronInfo | null> {
    const cron = await ctx.runQuery(this.component.public.get, { identifier });
    if (cron === null) {
      return null;
    }
    return {
      ...cron,
      functionHandle: cron.functionHandle as FunctionHandle<
        "mutation" | "action"
      >,
    };
  }

  /**
   * Delete and deschedule a cron job by id or name.
   *
   * @param identifier - Either the ID or name of the cron job.
   */
  async del(
    ctx: RunMutationCtx,
    identifier: { id: string } | { name: string }
  ): Promise<null> {
    return ctx.runMutation(this.component.public.del, { identifier });
  }
}

/* Type utils follow */

type RunQueryCtx = {
  runQuery: GenericQueryCtx<GenericDataModel>["runQuery"];
};
type RunMutationCtx = {
  runMutation: GenericMutationCtx<GenericDataModel>["runMutation"];
};

export type OpaqueIds<T> =
  T extends GenericId<infer _T>
    ? string
    : T extends (infer U)[]
      ? OpaqueIds<U>[]
      : T extends object
        ? { [K in keyof T]: OpaqueIds<T[K]> }
        : T;

export type UseApi<API> = Expand<{
  [mod in keyof API]: API[mod] extends FunctionReference<
    infer FType,
    "public",
    infer FArgs,
    infer FReturnType,
    infer FComponentPath
  >
    ? FunctionReference<
        FType,
        "internal",
        OpaqueIds<FArgs>,
        OpaqueIds<FReturnType>,
        FComponentPath
      >
    : UseApi<API[mod]>;
}>;

import {
  createFunctionHandle,
  Expand,
  FunctionArgs,
  FunctionReference,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  SchedulableFunctionReference,
} from "convex/server";
import { Schedule } from "../component/public.js";
import { GenericId } from "convex/values";

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
// if ((await crons.get(ctx, { name: "daily" })) === null) {
//   await crons.register(
//     ctx,
//     { kind: "cron", cronspec: "0 0 * * *" },
//     internal.example.logStuff,
//     { message: "daily cron" },
//     "daily"
//   );
// }
export function defineCrons(component: UseApi<typeof api>) {
  return {
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
    register: async <F extends SchedulableFunctionReference>(
      ctx: RunMutationCtx,
      schedule: Schedule,
      func: F,
      args: FunctionArgs<F>,
      name?: string
    ) =>
      ctx.runMutation(component.public.register, {
        name,
        schedule,
        functionHandle: await createFunctionHandle(func),
        args,
      }),

    /**
     * List all user space cron jobs.
     *
     * @returns List of `cron` table rows.
     */
    list: async (ctx: RunQueryCtx) => ctx.runQuery(component.public.list, {}),

    /**
     * Get an existing cron job by id or name.
     *
     * @param identifier - Either the ID or name of the cron job.
     * @returns Cron job document.
     */
    get: async (
      ctx: RunQueryCtx,
      identifier: { id: string } | { name: string }
    ) => {
      return ctx.runQuery(component.public.get, { identifier });
    },

    /**
     * Delete and deschedule a cron job by id or name.
     *
     * @param identifier - Either the ID or name of the cron job.
     */
    del: async (
      ctx: RunMutationCtx,
      identifier: { id: string } | { name: string }
    ) => ctx.runMutation(component.public.del, { identifier }),
  };
}

/* Type utils follow */

type RunQueryCtx = {
  runQuery: GenericQueryCtx<GenericDataModel>["runQuery"];
};
type RunMutationCtx = {
  runMutation: GenericMutationCtx<GenericDataModel>["runMutation"];
};

// TODO: Copy in a concrete API from example/_generated/server.d.ts once your API is stable.
import { api } from "../component/_generated/api.js"; // the component's public api

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

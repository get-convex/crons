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
import { GenericId } from "convex/values";

// Implementation of crons in user space.
//
// The API returned by this function provides a thin wrapper around the
// crons component's public API.
export function defineCrons(component: UseApi<typeof api>) {
  return {
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
    list: async (ctx: RunQueryCtx) => ctx.runQuery(component.public.list, {}),
    get: async (
      ctx: RunQueryCtx,
      identifier: { id: string } | { name: string }
    ) => {
      return ctx.runQuery(component.public.get, { identifier });
    },
    del: async (
      ctx: RunMutationCtx,
      identifier: { id: string } | { name: string }
    ) => {
      return ctx.runMutation(component.public.del, { identifier });
    },
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
import { Schedule } from "../component/public.js";

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

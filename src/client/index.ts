import {
  createFunctionHandle,
  Expand,
  FunctionReference,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";
import { GenericId } from "convex/values";

export function defineCrons(component: UseApi<typeof api>) {
  return {
    registerCron: async <
      F extends FunctionReference<"mutation" | "action", "internal">,
    >(
      ctx: RunMutationCtx,
      cronspec: string,
      func: F,
      args: F extends FunctionReference<
        "mutation" | "action",
        "internal",
        infer Args
      >
        ? Args
        : never,
      name?: string
    ) =>
      ctx.runMutation(component.public.registerCron, {
        name,
        cronspec,
        functionHandle: await createFunctionHandle(func),
        args,
      }),
    registerInterval: async <
      F extends FunctionReference<"mutation" | "action", "internal">,
    >(
      ctx: RunMutationCtx,
      ms: number,
      func: F,
      args: F extends FunctionReference<
        "mutation" | "action",
        "internal",
        infer Args
      >
        ? Args
        : never,
      name?: string
    ) =>
      ctx.runMutation(component.public.registerInterval, {
        name,
        ms,
        functionHandle: await createFunctionHandle(func),
        args,
      }),
    list: async (ctx: RunQueryCtx) => ctx.runQuery(component.public.list, {}),
    get: async (
      ctx: RunQueryCtx,
      // TODO type safety for id
      identifier: { id: string } | { name: string }
    ) => {
      if ("id" in identifier) {
        return ctx.runQuery(component.public.get, { id: identifier.id });
      } else {
        return ctx.runQuery(component.public.getByName, {
          name: identifier.name,
        });
      }
    },
    del: async (
      ctx: RunMutationCtx,
      // TODO type safety for id
      identifier: { id: string } | { name: string }
    ) => {
      if ("id" in identifier) {
        return ctx.runMutation(component.public.del, { id: identifier.id });
      } else {
        return ctx.runMutation(component.public.delByName, {
          name: identifier.name,
        });
      }
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

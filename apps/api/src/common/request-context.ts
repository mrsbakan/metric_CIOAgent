import { AsyncLocalStorage } from "async_hooks";
import type { TenantContext } from "@cio-agent/shared/types";

export interface RequestContext {
  trace_id:       string;
  tenant_context: TenantContext | null;
}

export const requestStorage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return requestStorage.getStore();
}

export function getTraceId(): string {
  return requestStorage.getStore()?.trace_id ?? "unknown";
}

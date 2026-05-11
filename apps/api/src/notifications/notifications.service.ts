import { Injectable } from "@nestjs/common";
import type { WebSocket } from "ws";

export interface PushPayload {
  type:    "approval_requested" | "approval_resolved" | "agent_completed" | "agent_failed";
  data:    Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  // tenantId → Set of connected WebSocket clients
  private readonly clients = new Map<string, Set<WebSocket>>();

  register(tenantId: string, client: WebSocket): void {
    let set = this.clients.get(tenantId);
    if (!set) {
      set = new Set();
      this.clients.set(tenantId, set);
    }
    set.add(client);
  }

  unregister(tenantId: string, client: WebSocket): void {
    this.clients.get(tenantId)?.delete(client);
  }

  push(tenantId: string, payload: PushPayload): void {
    const message = JSON.stringify({ event: "notification", data: payload });
    this.clients.get(tenantId)?.forEach((ws) => {
      if (ws.readyState === 1 /* OPEN */) {
        ws.send(message);
      }
    });
  }
}

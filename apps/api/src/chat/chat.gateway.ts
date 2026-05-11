import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import { Inject, Logger } from "@nestjs/common";
import { Server, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import { verifyAccessToken } from "@cio-agent/auth/jwt";
import { AgentRunner, type AgentRunInput } from "@cio-agent/agent-core";
import { NotificationsService } from "../notifications/notifications.service.js";

interface AuthenticatedSocket extends WebSocket {
  tenantId:             string;
  userId:               string;
  roleId:               string;
  userType:             string;
  accountApplicationId: string;
  isReady:              boolean;
}

interface ChatMessagePayload {
  message:    string;
  ipAddress?: string;
}

@WebSocketGateway({ path: "/v1/chat/connect" })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    @Inject("AGENT_RUNNER")  private readonly runner:  AgentRunner,
    private readonly notifications: NotificationsService,
  ) {}

  handleConnection(client: WebSocket, req: IncomingMessage): void {
    const ws  = client as AuthenticatedSocket;
    ws.isReady = false;

    // Extract JWT from ?token= query param (browsers can't set WS headers)
    const url   = new URL(req.url ?? "/", "http://localhost");
    const token = url.searchParams.get("token");

    if (!token) {
      client.close(4001, "Missing token");
      return;
    }

    // Async verification — messages arriving before this resolves are rejected via isReady flag
    void verifyAccessToken(token)
      .then((payload) => {
        ws.tenantId             = payload.tenant_id;
        ws.userId               = payload.sub;
        ws.roleId               = payload.role_id;
        ws.userType             = payload.user_type ?? "standard";
        ws.accountApplicationId = payload.account_application_id;
        ws.isReady              = true;

        this.notifications.register(payload.tenant_id, client);
        this.logger.log(`Connected: user=${payload.sub} tenant=${payload.tenant_id}`);
      })
      .catch(() => {
        client.close(4003, "Invalid token");
      });
  }

  handleDisconnect(client: WebSocket): void {
    const ws = client as AuthenticatedSocket;
    if (ws.tenantId) {
      this.notifications.unregister(ws.tenantId, client);
    }
  }

  @SubscribeMessage("chat")
  async handleChat(
    @MessageBody()     data:   ChatMessagePayload,
    @ConnectedSocket() client: WebSocket,
  ): Promise<void> {
    const ws = client as AuthenticatedSocket;

    if (!ws.isReady) {
      client.send(JSON.stringify({ event: "error", data: { code: "UNAUTHORIZED" } }));
      return;
    }

    const input: AgentRunInput = {
      tenantId:             ws.tenantId,
      userId:               ws.userId,
      roleId:               ws.roleId,
      accountApplicationId: ws.accountApplicationId,
      userType:             ws.userType as AgentRunInput["userType"],
      message:              data.message,
      ...(data.ipAddress !== undefined ? { ipAddress: data.ipAddress } : {}),
    };

    try {
      const result = await this.runner.run(input);
      client.send(JSON.stringify({ event: "response", data: result }));

      if (result.state === "AWAITING_APPROVAL" && result.actionDraft) {
        this.notifications.push(ws.tenantId, {
          type: "approval_requested",
          data: { approvalId: result.actionDraft.approvalId, actionType: result.actionDraft.actionType },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      client.send(JSON.stringify({ event: "error", data: { code: "INTERNAL_ERROR", message } }));
    }
  }
}

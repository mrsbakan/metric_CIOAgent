import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { AgentRunner } from "@cio-agent/agent-core";
import type { WebSocket } from "ws";
import { ChatGateway } from "./chat.gateway.js";
import type { NotificationsService } from "../notifications/notifications.service.js";

jest.mock("@cio-agent/auth/jwt", () => ({
  verifyAccessToken: jest.fn(() =>
    Promise.resolve({
      sub:                    "user-1",
      tenant_id:              "tenant-1",
      role_id:                "role-1",
      user_type:              "admin",
      account_application_id: "app-1",
      jti:                    "jti-1",
    }),
  ),
}));

const TENANT_ID  = "tenant-1";
const SESSION_ID = "session-1";

function makeClient(): WebSocket {
  return {
    send:      jest.fn<() => void>(),
    close:     jest.fn<() => void>(),
    readyState: 1,
  } as unknown as WebSocket;
}

function makeRunner(overrides: Partial<Pick<AgentRunner, "run">> = {}): AgentRunner {
  return {
    run: jest.fn<AgentRunner["run"]>().mockResolvedValue({
      sessionId:   SESSION_ID,
      state:       "COMPLETED",
      responseText: "Sprint velocity is 42.",
      actionDraft: null,
      error:       null,
    }),
    resume: jest.fn<AgentRunner["resume"]>(),
    ...overrides,
  } as unknown as AgentRunner;
}

function makeNotifications(): NotificationsService {
  return {
    register:   jest.fn(),
    unregister: jest.fn(),
    push:       jest.fn(),
  } as unknown as NotificationsService;
}

describe("ChatGateway", () => {
  let gateway:       ChatGateway;
  let runner:        AgentRunner;
  let notifications: NotificationsService;

  beforeEach(() => {
    runner        = makeRunner();
    notifications = makeNotifications();
    gateway       = new ChatGateway(runner, notifications);
  });

  async function connect(gateway: ChatGateway, client: ReturnType<typeof makeClient>, url = "/v1/chat/connect?token=valid.jwt.token") {
    gateway.handleConnection(client, { url } as never);
    await Promise.resolve(); // flush the verifyAccessToken promise
  }

  it("handleConnection extracts JWT and registers client in notifications", async () => {
    const client = makeClient();
    await connect(gateway, client);
    expect(notifications.register).toHaveBeenCalledWith(TENANT_ID, client);
  });

  it("handleConnection closes socket with 4001 when token is missing", () => {
    const client = makeClient();
    gateway.handleConnection(client, { url: "/v1/chat/connect" } as never);
    expect(client.close).toHaveBeenCalledWith(4001, "Missing token");
  });

  it("handleDisconnect unregisters client from notifications", async () => {
    const client = makeClient();
    await connect(gateway, client);
    gateway.handleDisconnect(client);
    expect(notifications.unregister).toHaveBeenCalledWith(TENANT_ID, client);
  });

  it("handleChat sends agent response to client", async () => {
    const client = makeClient();
    await connect(gateway, client);

    await gateway.handleChat({ message: "What is the sprint status?" }, client);

    const sent = JSON.parse((client.send as jest.MockedFunction<typeof client.send>).mock.calls[0]![0] as string);
    expect(sent.event).toBe("response");
    expect(sent.data.state).toBe("COMPLETED");
  });

  it("handleChat pushes notification when state is AWAITING_APPROVAL", async () => {
    runner = makeRunner({
      run: jest.fn<AgentRunner["run"]>().mockResolvedValue({
        sessionId:    SESSION_ID,
        state:        "AWAITING_APPROVAL",
        responseText: null,
        actionDraft:  { actionType: "source_system_write", payload: {}, approvalId: "apr-1" },
        error:        null,
      }),
    });
    gateway = new ChatGateway(runner, notifications);

    const client = makeClient();
    await connect(gateway, client);
    await gateway.handleChat({ message: "Update ticket" }, client);

    expect(notifications.push).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ type: "approval_requested" }),
    );
  });

  it("handleChat sends error event when runner throws", async () => {
    runner = makeRunner({
      run: jest.fn<AgentRunner["run"]>().mockRejectedValue(new Error("LLM_DOWN")),
    });
    gateway = new ChatGateway(runner, notifications);

    const client = makeClient();
    await connect(gateway, client);
    await gateway.handleChat({ message: "ping" }, client);

    const sent = JSON.parse((client.send as jest.MockedFunction<typeof client.send>).mock.calls[0]![0] as string);
    expect(sent.event).toBe("error");
    expect(sent.data.message).toContain("LLM_DOWN");
  });
});

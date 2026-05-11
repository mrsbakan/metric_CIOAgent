"use client";
import { useEffect, useRef, useCallback } from "react";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000";

interface WsMessage {
  event: string;
  data:  unknown;
}

interface UseWebSocketOptions {
  token:     string | null;
  onMessage: (msg: WsMessage) => void;
}

export function useWebSocket({ token, onMessage }: UseWebSocketOptions) {
  const wsRef      = useRef<WebSocket | null>(null);
  const onMsgRef   = useRef(onMessage);
  onMsgRef.current = onMessage;

  useEffect(() => {
    if (!token) return;

    const ws = new WebSocket(`${WS_URL}/v1/chat/connect?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data as string) as WsMessage;
        onMsgRef.current(parsed);
      } catch { /* ignore malformed */ }
    };

    ws.onerror = () => {
      wsRef.current = null;
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [token]);

  const send = useCallback((event: string, data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event, data }));
    }
  }, []);

  return { send };
}

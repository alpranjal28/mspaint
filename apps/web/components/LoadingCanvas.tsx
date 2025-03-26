"use client";
import { useEffect, useState } from "react";
import { WS_BACKEND_URL } from "../config";
import Canvas from "./Canvas";

export default function LoadingCanvas({ roomId }: { roomId: number }) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  useEffect(() => {
    const ws = new WebSocket(
      `${WS_BACKEND_URL}?token=${localStorage.getItem("token")}`
    );
    ws.onerror = (e) => console.log(e);
    ws.onopen = () => {
      console.log(`connecting to ws canvas of room ${roomId}`);

      setSocket(ws);
      ws.send(JSON.stringify({ type: "subscribe", roomId }));
      console.log("ws connected to canvas");
    };

    ws.onclose = () => {
      console.log("disconnected from ws canvas of room ", roomId);
      setSocket(null);
    };
  }, []);

  if (!socket) {
    return <div>Connecting to server, please wait...</div>;
  }

  return <Canvas roomId={roomId} socket={socket} />;
}

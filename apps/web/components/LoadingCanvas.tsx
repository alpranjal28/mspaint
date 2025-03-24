"use client";
import { useEffect, useState } from "react";
import { WS_BACKEND_URL } from "../config";
import Canvas from "./Canvas";

export default function LoadingCanvas({ roomId }: { roomId: number }) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  useEffect(() => {
    const ws = new WebSocket(
      // `${WS_BACKEND_URL}?token=${localStorage.getItem("token")}`
      `${WS_BACKEND_URL}?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxNzRjMWQxZi01NmIwLTRiMGQtODUzYy1iMmM2ZmE1M2M2Y2UiLCJpYXQiOjE3NDI4MTc3MjksImV4cCI6MTc0MjkwNDEyOX0.pY7UOs0xxxB3bpInNvbOlB7qFkYT3NfhqVSqiD6j14A`
    );
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

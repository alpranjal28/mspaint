"use client";
import { useEffect, useState } from "react";
import { WS_BACKEND_URL } from "../config";
import Canvas from "./Canvas";

export default function LoadingCanvas({ roomId }: { roomId: number }) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  useEffect(() => {
    const ws = new WebSocket(
      // `${WS_BACKEND_URL}?token=${localStorage.getItem("token")}`
      `${WS_BACKEND_URL}?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxNzRjMWQxZi01NmIwLTRiMGQtODUzYy1iMmM2ZmE1M2M2Y2UiLCJpYXQiOjE3NDI1NTYwNTcsImV4cCI6MTc0MjY0MjQ1N30.WrEfj0UjfjMGuZ3X2Bj0vqO5DNGQEO4lDFk1AdwQuEk`
    );
    ws.onopen = () => {
      console.log(`connecting to canvas of room ${roomId}`);

      setSocket(ws);
      ws.send(JSON.stringify({ type: "subscribe", roomId }));
      console.log("ws connected to canvas");
    };
  }, []);

  if (!socket) {
    return <div>Connecting to server, please wait...</div>;
  }

  return <Canvas roomId={roomId} socket={socket} />;
}

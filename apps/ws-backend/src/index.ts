console.log("hello from ws backend");

import WebSocket from "ws";
import { verifyToken, verifiedUser } from "@repo/backend-common/config";

const wss = new WebSocket.Server({ port: 8080 });

const users: Map<string, WebSocket> = new Map();

const broadcast = (message: string) => {
  users.forEach((ws) => ws.send(message));
};

const checkUser = (token: string): string | null => {
  const decoded = verifyToken(token);
  if (typeof decoded === "string") return null;
  if (!decoded) return null;
  return decoded.userId;
};

wss.on("connection", (ws, request) => {
  const url = request.url;
  if (!url) {
    return;
  }

  // const queryParams = url.split("?")[1];
  const token = new URLSearchParams(url.split("?")[1]).get("token");
  if (!token) {
    ws.close();
    return;
  }
  const userId = verifiedUser(token);

  if (!userId || !token) {
    ws.close();
    return;
  }

  ws.on("message", (message) => {
    console.log(message);
  });
});

wss.on("error", (error) => {
  console.log(error);
});

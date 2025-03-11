console.log("hello from ws backend");

import WebSocket from "ws";
import { verifyToken, verifiedUser } from "@repo/backend-common/config";
import { prismaClient } from "@repo/db-config/prisma";

const wss = new WebSocket.Server({ port: 8080 });

// const rooms: Map<string, Set<WebSocket>> = new Map();
// const users: Map<string, WebSocket> = new Map();

// const broadcast = (message: string) => {
//   users.forEach((ws) => ws.send(message));
// };

interface User {
  ws: WebSocket;
  room: string[];
  userId: string;
}

const users: User[] = [];

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

  users.push({ ws, room: [], userId });

  ws.on("message", async (message) => {
    const parsedData = JSON.parse(message as unknown as string);
    if (parsedData.type === "subscribe") {
      const roomId = parsedData.roomId;
      const user = users.find((u) => u.userId === userId);
      if (user) {
        user.room.push(roomId);
      }
    }
    if (parsedData.type === "unsubscribe") {
      const roomId = parsedData.roomId;
      const user = users.find((u) => u.userId === userId);
      if (user) {
        user.room = user.room.filter((r) => r !== roomId);
      }
    }
    // TODO: use queue to send messages to database
    if (parsedData.type === "chat") {
      const roomId = parsedData.roomId;
      const message = parsedData.message;

      await prismaClient.chat.create({
        data: {
          roomId,
          userId,
          message,
        },
      });

      users.forEach((u) => {
        if (u.room.includes(roomId)) {
          u.ws.send(JSON.stringify({ type: "message", message, roomId }));
        }
      });
    }
  });
});

wss.on("error", (error) => {
  console.log(error);
});

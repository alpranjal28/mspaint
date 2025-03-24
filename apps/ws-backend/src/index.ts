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

interface RoomUser {
  ws: WebSocket;
  room: number[];
  userId: string;
}

const roomUsers: RoomUser[] = [];

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

  roomUsers.push({ ws, room: [], userId });

  ws.on("message", async (message) => {
    const parsedData = JSON.parse(message as unknown as string);
    if (parsedData.type === "subscribe") {
      const roomId = parsedData.roomId;
      const user = roomUsers.find((u) => u.userId === userId);
      if (user) {
        user.room.push(roomId);
      }
    }
    if (parsedData.type === "unsubscribe") {
      const roomId = parsedData.roomId;
      const user = roomUsers.find((u) => u.userId === userId);
      if (user) {
        user.room = user.room.filter((r) => r !== roomId);
      }
    }
    // TODO: use queue to send messages to database
    if (parsedData.type === "chat") {
      const roomId = Number(parsedData.roomId);
      const message = parsedData.message;

      await prismaClient.chat.create({
        data: {
          roomId: roomId,
          userId: userId, // takes user id from token
          message: message,
        },
      });

      console.log("room users", roomUsers);

      roomUsers.forEach((u) => {
        console.log("broadcasting to room", roomId);
        u.ws.send(
          JSON.stringify({ type: "broadcasted", message, roomId, userId })
        );

        if (u.room.includes(roomId)) {
          console.log("broadcasted to room", roomId);
        } else {
          console.log("not broadcasting to room", roomId);
        }
      });
    }
  });
});

wss.on("error", (error) => {
  console.log(error);
});

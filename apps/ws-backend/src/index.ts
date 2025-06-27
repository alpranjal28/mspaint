console.log("hello from ws backend");

import WebSocket from "ws";
import { verifyToken, verifiedUser } from "@repo/backend-common/config";
import { prismaClient } from "@repo/db-config/prisma";

const wss = new WebSocket.Server({ port: 8080 });

// Efficient room/user management
const roomMap = new Map<number, Set<WebSocket>>();
const userMap = new Map<WebSocket, { userId: string; rooms: Set<number> }>();

// Debounce timers and latest move messages per shape id
// moveDebounceTimers: stores a timer for each shape's move action
// latestMoveMessages: stores the latest move message for each shape
const moveDebounceTimers: Record<string, NodeJS.Timeout> = {};
const latestMoveMessages: Record<string, any> = {};

wss.on("connection", (ws, request) => {
  console.log("new connection from", request.socket.remoteAddress);
  const url = request.url;
  if (!url) {
    console.log("Connection closed: no URL provided");
    ws.close();
    return;
  }
  const token = new URLSearchParams(url.split("?")[1]).get("token");
  if (!token) {
    console.log("Connection closed: no token provided");
    ws.close();
    return;
  }
  const userId = verifiedUser(token);

  if (!userId || !token) {
    console.log("Connection closed: invalid user or token");
    ws.close();
    return;
  }

  console.log("User", userId, "connected");
  userMap.set(ws, { userId, rooms: new Set() });

  ws.on("message", async (message) => {
    const parsedData = JSON.parse(message as unknown as string);

    // --- Room subscription management ---
    if (parsedData.type === "subscribe") {
      const roomId = Number(parsedData.roomId);
      if (!roomMap.has(roomId)) roomMap.set(roomId, new Set());
      // Avoid duplicate subscriptions
      if (!userMap.get(ws)!.rooms.has(roomId)) {
        roomMap.get(roomId)!.add(ws);
        userMap.get(ws)!.rooms.add(roomId);
      }
      console.log("User", userId, "subscribed to room", roomId);
      console.log("roomMap:",roomMap);
      console.log("userMap:", userMap);
      return;
    }
    if (parsedData.type === "unsubscribe") {
      const roomId = Number(parsedData.roomId);
      roomMap.get(roomId)?.delete(ws);
      userMap.get(ws)!.rooms.delete(roomId);
      console.log("User", userId, "unsubscribed from room", roomId);
      return;
    }

    // --- Drawing/chat message handling ---
    if (parsedData.type === "chat") {
      const roomId = Number(parsedData.roomId);
      const messageContent = parsedData.message;
      let shapeId, action;
      try {
        const msgObj =
          typeof messageContent === "string"
            ? JSON.parse(messageContent)
            : messageContent;
        shapeId = msgObj.id || parsedData.shapeId;
        action = msgObj.function || parsedData.action;
      } catch {
        shapeId = parsedData.shapeId;
        action = parsedData.action;
      }

      // --- Shape actions ---
      if (action === "move" && shapeId) {
        // move action with debounce for database update,
        // broadcast works without debounce
        latestMoveMessages[shapeId] = messageContent;
        if (moveDebounceTimers[shapeId])
          clearTimeout(moveDebounceTimers[shapeId]);
        moveDebounceTimers[shapeId] = setTimeout(async () => {
          await prismaClient.chat.updateMany({
            where: { shapeId: shapeId, roomId: roomId },
            data: {
              message: latestMoveMessages[shapeId],
              updatedAt: new Date(),
              erased: false,
            },
          });
          delete moveDebounceTimers[shapeId];
          delete latestMoveMessages[shapeId];
          console.log("Moved shape", shapeId, "in room", roomId);
        }, 80);
        // Broadcast move to all room members
        roomMap.get(roomId)?.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(
              JSON.stringify({
                type: "broadcasted",
                message: latestMoveMessages[shapeId],
                roomId,
                userId,
              })
            );
          }
        });
        return;
      }
      if (action === "draw" && shapeId) {
        await prismaClient.chat.create({
          data: {
            roomId: roomId,
            userId: userId,
            message: messageContent,
            shapeId: shapeId,
            erased: false,
          },
        });
        // Broadcast draw to all room members
        roomMap.get(roomId)?.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(
              JSON.stringify({
                type: "broadcasted",
                message: messageContent,
                roomId,
                userId,
              })
            );
          }
        });
        return;
      }
      if (action === "erase" && shapeId) {
        await prismaClient.chat.updateMany({
          where: { shapeId: shapeId, roomId: roomId },
          data: { erased: true },
        });
        // Broadcast erase to all room members
        roomMap.get(roomId)?.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(
              JSON.stringify({
                type: "broadcasted",
                message: messageContent,
                roomId,
                userId,
              })
            );
          }
        });
        return;
      }
      if (action === "un-erase" && shapeId) {
        await prismaClient.chat.updateMany({
          where: { shapeId: shapeId, roomId: roomId },
          data: { erased: false },
        });
        // Broadcast un-erase to all participants in the room
        roomMap.get(roomId)?.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(
              JSON.stringify({
                type: "broadcasted",
                message: JSON.stringify({
                  function: "un-erase",
                  id: shapeId,
                  timestamp: Date.now(),
                }),
                roomId,
                userId,
              })
            );
          }
        });
        return;
      }
      // --- Regular chat message (no shapeId/action) ---
      await prismaClient.chat.create({
        data: {
          roomId: roomId,
          userId: userId,
          message: messageContent,
        },
      });
      // Broadcast chat to all room members
      roomMap.get(roomId)?.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(
            JSON.stringify({
              type: "broadcasted",
              message: messageContent,
              roomId,
              userId,
            })
          );
        }
      });
    }
  });

  ws.on("close", () => {
    // Remove user from all rooms
    const user = userMap.get(ws);
    if (user) {
      user.rooms.forEach((roomId) => roomMap.get(roomId)?.delete(ws));
      userMap.delete(ws);
    }
    console.log("User", userId, "disconnected and cleaned up.");
  });
});

wss.on("error", (error) => {
  console.log(error);
});

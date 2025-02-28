console.log("hello from ws backend");

import WebSocket from "ws";
import { verifyToken } from "@repo/backend-common/config";

const wss = new WebSocket.Server({ port: 8080 });

wss.on("connection", (ws, request) => {
  const url = request.url;
  if (!url) {
    return;
  }

  // const queryParams = url.split("?")[1];
  const token = new URLSearchParams(url.split("?")[1]).get("token");
  const decoded = verifyToken(token!);

  if (!decoded) {
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

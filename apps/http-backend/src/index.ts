import express from "express";
import { middleware } from "./middleware";
import { signToken } from "@repo/backend-common/config";
import {
  CreateUserSchema,
  SignInSchema,
  CreateRoomSchems,
} from "@repo/common/zod-types";

const app = express();

app.get("/", (req, res) => {
  res.send("Hello from http-backend!");
});

app.post("/signup", (req, res) => {
  const data = CreateUserSchema.safeParse(req.body);
  if (!data.success) {
    res.status(400).json(data.error);
    return;
  }

  res.json({
    userId: 101,
  });
});

app.post("/signin", (req, res) => {
  const data = SignInSchema.safeParse(req.body);
  if (!data.success) {
    res.status(400).json(data.error);
    return;
  }

  //
  const userId = 101;
  const token = signToken(userId);
  res.json(token);
});

app.post("/room", middleware, (req, res) => {
  const data = CreateRoomSchems.safeParse(req.body);
  if (!data.success) {
    res.status(400).json(data.error);
    return;
  }
  res.json({
    roomId: 123,
  });
});

const port = process.env.PORT || 3030;

app.listen(port, () => {
  console.log(`http-backend listening on port ${port}`);
});

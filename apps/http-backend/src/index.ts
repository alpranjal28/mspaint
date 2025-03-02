import express from "express";
import { middleware } from "./middleware";
import { signToken } from "@repo/backend-common/config";
import {
  CreateUserSchema,
  SignInSchema,
  CreateRoomSchems,
} from "@repo/common/zod-types";
import { prismaClient } from "@repo/db-config/prisma";

const app = express();

app.get("/", (req, res) => {
  res.send("Hello from http-backend!");
});
app.use(express.json());

app.post("/signup", async (req, res) => {
  const parsedData = CreateUserSchema.safeParse(req.body);

  if (!parsedData.success) {
    res.status(400).json(parsedData.error);
    return;
  }

  try {
    const createdUser = await prismaClient.user.create({
      data: {
        name: parsedData.data.username,
        email: parsedData.data.email,
        password: parsedData.data.password,
        photo:
          "https://cdn.pixabay.com/photo/2017/07/18/23/40/group-2517459_1280.png",
      },
    });

    res.json({
      userId: createdUser.id,
    });
    console.log("created user", createdUser);

    // res.redirect("/");
  } catch (e) {
    res.status(400).json({ message: "User already exists" });
    return;
  }
});

app.post("/signin", async (req, res) => {
  const data = SignInSchema.safeParse(req.body);
  if (!data.success) {
    res.status(400).json(data.error);
    return;
  }

  const user = await prismaClient.user.findUnique({
    where: {
      email: data.data.email,
    },
  });

  if (!user) {
    res.status(400).json({ message: "User not found" });
    return;
  }

  const userId = user.id;
  const token = signToken(userId);
  res.json(token);
  res.redirect("/");
  res.cookie("token", token);
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

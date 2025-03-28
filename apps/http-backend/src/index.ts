import express from "express";
import { middleware } from "./middleware";
import {
  accessToken,
  hashPassword,
  checkPassword,
  refreshToken,
} from "@repo/backend-common/config";
import {
  CreateUserSchema,
  SignInSchema,
  CreateRoomSchems,
} from "@repo/common/zod-types";
import { prismaClient } from "@repo/db-config/prisma";
import cors from "cors";

const app = express();
const port = process.env.PORT || 3030;

// middleware
app.use(express.json());
app.use(cors());

// routes
app.get("/", (req, res) => {
  res.send("Hello from http-backend!");
});

app.post("/signup", async (req, res) => {
  const parsedData = CreateUserSchema.safeParse(req.body);
  if (!parsedData.success) {
    res.status(400).json(parsedData.error);
    return;
  }

  // check if user exists
  const user = await prismaClient.user.findUnique({
    where: {
      email: parsedData.data.email,
    },
  });
  if (user) {
    res.status(400).json({ message: "User already exists" });
    return;
  }

  // create user
  try {
    const hashedPassword = hashPassword(parsedData.data.password);
    const createdUser = await prismaClient.user.create({
      data: {
        name: parsedData.data.username,
        email: parsedData.data.email,
        password: hashedPassword,
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

  // check if user exists
  const user = await prismaClient.user.findUnique({
    where: {
      email: data.data.email,
    },
  });
  if (!user) {
    res.status(400).json({ message: "User not found" });
    return;
  }

  // check if password is correct
  if (!checkPassword(data.data.password, user.password)) {
    res.status(400).json({ message: "Invalid password" });
    return;
  }

  const token = accessToken(user.id, user.email);
  const refToken = refreshToken(user.id, user.name);
  const username = user.name;

  res.cookie("refreshToken", refToken, {
    httpOnly: true,
    secure: true,
    maxAge: 3 * 24 * 60 * 60 * 1000, // 3 days
  });

  res.json({ username, token });
  // res.json(token);
  // res.redirect("/");
  // res.cookie("token", token);
});

app.post("/room", middleware, async (req, res) => {
  console.log("crossed middleware");

  // create room
  const pardsedData = CreateRoomSchems.safeParse(req.body);
  if (!pardsedData.success) {
    res.status(400).json(pardsedData.error);
    return;
  }
  console.log("pardsedData => ", pardsedData);

  try {
    const room = await prismaClient.room.create({
      data: {
        adminId: req.body.JwtPayload.userId,
        slug: pardsedData.data.name,
      },
    });

    res.json({
      roomId: room.id,
    });
  } catch (error) {
    console.log("error => ", error);
  }
});

app.get("/room/:roomId", middleware, async (req, res) => {
  const room = Number(req.params.roomId);
  console.log("get messages from roomId -> ", room);

  // get messages from room
  const messages = await prismaClient.chat.findMany({
    where: {
      roomId: room,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 50,
  });

  res.json({ messages });
});

app.get("/chats/:slug", middleware, async (req, res) => {
  const slug = req.params.slug;

  // get roomId by slug
  const roomId = await prismaClient.room.findFirst({
    where: {
      slug: slug,
    },
  });

  res.json({ roomId });
});

app.listen(port, () => {
  console.log(`http-backend listening on port ${port}`);
});

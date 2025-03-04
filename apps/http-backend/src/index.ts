import express from "express";
import { middleware } from "./middleware";
import {
  signToken,
  hashPassword,
  checkPassword,
} from "@repo/backend-common/config";
import {
  CreateUserSchema,
  SignInSchema,
  CreateRoomSchems,
} from "@repo/common/zod-types";
import { prismaClient } from "@repo/db-config/prisma";

const app = express();

const port = process.env.PORT || 3030;

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

  const userId = user.id;
  const token = signToken(userId);
  const username = user.name;

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

app.listen(port, () => {
  console.log(`http-backend listening on port ${port}`);
});

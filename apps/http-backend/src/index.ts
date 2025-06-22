import express from "express";
import { middleware } from "./middleware";
import {
  accessToken,
  hashPassword,
  checkPassword,
  refreshToken,
  verifyToken,
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

// auth routes
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
        username: parsedData.data.username,
        email: parsedData.data.email,
        password: hashedPassword,
        photo:
          "https://cdn.pixabay.com/photo/2017/07/18/23/40/group-2517459_1280.png",
      },
    });

    const token = accessToken(createdUser.id, createdUser.email);
    const refToken = refreshToken(createdUser.id, createdUser.username);

    res.json({ username: createdUser.username, token });

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
  const refToken = refreshToken(user.id, user.username);
  const username = user.username;

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

// room routes
app.post("/room", middleware, async (req, res) => {
  console.log("crossed middleware");

  try {
    // create room
    const pardsedData = CreateRoomSchems.safeParse(req.body);
    if (!pardsedData.success) {
      res.status(400).json(pardsedData.error);
      return;
    }
    console.log("pardsedData => ", pardsedData);

    const room = await prismaClient.room.create({
      data: {
        adminId: req.body.JwtPayload.userId,
        slug: pardsedData.data.name,
      },
    });

    res.json({
      room,
    });
  } catch (error) {
    console.log("create room error => ", error);
    res.status(400).json({ message: "Room creation failed" });
    return;
  }
});

app.get("/rooms", middleware, async (req, res) => {
  try {
    const parsedData = verifyToken(req.headers.authorization!) as {
      userId: string;
    };
    console.log("parsedData => ", parsedData);
    // const userId = req.body.JwtPayload.userId;
    const userId = parsedData.userId;

    // Get rooms where user is admin
    const ownedRooms = await prismaClient.room.findMany({
      where: {
        adminId: userId,
      },
      select: {
        id: true,
        slug: true,
        createdAt: true,
      },
    });

    // Get rooms where user is a participant (you'll need to implement this based on your schema)
    const participatingRooms = await prismaClient.room.findMany({
      where: {
        participants: {
          some: {
            userId: userId,
          },
        },
      },
      select: {
        id: true,
        slug: true,
        createdAt: true,
      },
    });

    // Combine and format rooms
    const rooms = [
      ...ownedRooms.map((room) => ({
        id: room.id,
        name: room.slug,
        createdAt: room.createdAt.toISOString(),
        isOwner: true,
      })),
      ...participatingRooms.map((room) => ({
        id: room.id,
        name: room.slug,
        createdAt: room.createdAt.toISOString(),
        isOwner: false,
      })),
    ];

    res.json({ rooms });
  } catch (error) {
    console.error("Get rooms error:", error);
    res.status(500).json({ message: "Failed to fetch rooms" });
  }
});

app.get("/room/:roomId", middleware, async (req, res) => {
  const roomId = Number(req.params.roomId);
  if (isNaN(Number(roomId))) {
    res.status(400).json({ message: "Invalid room ID" });
    return;
  }

  console.log("get messages from roomId -> ", roomId);

  // get messages from room
  const messages = await prismaClient.chat.findMany({
    where: {
      roomId: roomId,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 500,
  });

  res.json({ messages });
});

app.delete("/room/:roomId", middleware, async (req, res): Promise<void> => {
  try {
    const roomId = Number(req.params.roomId);
    if (isNaN(roomId)) {
      res.status(400).json({ message: "Invalid room ID" });
      return;
    }

    const parsedData = verifyToken(req.headers.authorization!) as {
      userId: string;
    };
    const userId = parsedData.userId;

    // Check if room exists and user is admin
    const room = await prismaClient.room.findFirst({
      where: {
        id: roomId,
        adminId: userId,
      },
    });

    if (!room) {
      res.status(404).json({
        message: "Room not found or you don't have permission to delete it",
      });
      return;
    }

    // Delete all related records first (due to foreign key constraints)
    await prismaClient.$transaction([
      prismaClient.chat.deleteMany({
        where: { roomId },
      }),
      prismaClient.roomParticipant.deleteMany({
        where: { roomId },
      }),
      prismaClient.room.delete({
        where: { id: roomId },
      }),
    ]);

    res.status(200).json({
      message: "Room deleted successfully",
      roomId,
    });
    return;
  } catch (error) {
    console.error("Delete room error:", error);
    res.status(500).json({ message: "Failed to delete room" });
    return;
  }
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

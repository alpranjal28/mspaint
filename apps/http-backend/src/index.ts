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
import cookieParser from "cookie-parser";
import { prismaClient } from "@repo/db-config/prisma";
import cors from "cors";
import { generateShareCode } from "./tools";

const app = express();
const port = process.env.PORT || 3030;

// middleware
app.use(express.json());
app.use(cors());
app.use(cookieParser());

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

    res.cookie("refreshToken", refToken, {
      httpOnly: true,
      secure: true,
      maxAge: 3 * 24 * 60 * 60 * 1000, // 3 days
    });

    res.json({ username: createdUser.username, token });

    console.log("created user", createdUser);
    // res.redirect("/");
  } catch (e) {
    res.status(400).json({ message: "User already exists" });
    return;
  }
});

app.post("/signin", async (req, res) => {
  try {
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
  } catch (error) {
    console.error("Sign in error:", error);
    res.status(500).json({ message: "Failed to sign in" });
  }
});

app.post("/refresh-token", async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      res.status(401).json({ message: "No refresh token provided" });
      return;
    }

    // Verify the refresh token
    let payload: any;
    try {
      payload = verifyToken(refreshToken); // Use your JWT verify function
    } catch (err) {
      res.status(401).json({ message: "Invalid refresh token" });
      return;
    }

    // Optionally, check if user still exists
    const user = await prismaClient.user.findUnique({
      where: { id: payload.userId },
    });
    if (!user) {
      res.status(401).json({ message: "User not found" });
      return;
    }

    // Issue new access token (and optionally a new refresh token)
    const newAccessToken = accessToken(user.id, user.email);
    // Optionally rotate refresh token:
    // const newRefreshToken = refreshToken(user.id, user.username);
    // res.cookie("refreshToken", newRefreshToken, { ... });

    res.json({ token: newAccessToken, username: user.username });
  } catch (err) {
    res.status(500).json({ message: "Failed to refresh token" });
  }
});

app.post("/logout", (req, res) => {
  try {
    res.clearCookie("refreshToken");
    res.json({ message: "Logged out" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ message: "Failed to log out" });
  }
});

// room routes
app.post("/room", middleware, async (req, res) => {
  console.log("crossed middleware");

  try {
    const pardsedData = CreateRoomSchems.safeParse(req.body);
    if (!pardsedData.success) {
      res.status(400).json(pardsedData.error);
      return;
    }
    console.log("pardsedData => ", pardsedData);

    // Check if room name already exists
    const existingRoom = await prismaClient.room.findFirst({
      where: { slug: pardsedData.data.name },
    });
    if (existingRoom) {
      res.status(400).json({ message: "Room name already exists" });
      return;
    }

    // Generate a unique share code
    let shareCode: string;
    while (true) {
      shareCode = generateShareCode();
      const exists = await prismaClient.room.findUnique({
        where: { shareCode },
      });
      if (!exists) break;
    }

    // create room
    const room = await prismaClient.room.create({
      data: {
        adminId: req.body.JwtPayload.userId,
        slug: pardsedData.data.name,
        shareCode,
      },
    });

    res.json({ room });
  } catch (error) {
    console.log("create room error => ", error);
    res.status(400).json({ message: "Room already exists" });
    return;
  }
});

app.post("/room/join", middleware, async (req, res) => {
  try {
    const { code }: { code: string } = req.body;
    if (!code) {
      res.status(400).json({ message: "Share code is required" });
      return;
    }

    const parsedData = verifyToken(req.headers.authorization!) as {
      userId: string;
    };
    const userId = parsedData.userId;

    const room = await prismaClient.room.findUnique({
      where: { shareCode: code },
    });

    if (!room) {
      res.status(404).json({ message: "Room not found" });
      return;
    }

    // Check if user is already a participant
    const alreadyParticipant = await prismaClient.roomParticipant.findUnique({
      where: {
        userId_roomId: {
          userId,
          roomId: room.id,
        },
      },
    });

    if (alreadyParticipant) {
      res.status(400).json({ message: "Already joined this room" });
      return;
    }

    await prismaClient.roomParticipant.create({
      data: {
        userId,
        roomId: room.id,
      },
    });

    res.json({ message: "Joined room successfully", roomId: room.id });
  } catch (error) {
    res.status(500).json({ message: "Failed to join room" });
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
        shareCode: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
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
      orderBy: {
        createdAt: "desc",
      },
    });

    // Combine and format rooms
    const rooms = [
      ...ownedRooms.map((room) => ({
        id: room.id,
        name: room.slug,
        shareCode: room.shareCode || null,
        createdAt: room.createdAt.toISOString(),
        isOwner: true,
      })),
      ...participatingRooms.map((room) => ({
        id: room.id,
        name: room.slug,
        joinedAt: room.createdAt.toISOString(),
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
  try {
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
    });

    res.json({ messages });
  } catch (error) {
    console.error("Get room messages error:", error);
    res.status(500).json({ message: "Failed to fetch room messages" });
  }
});

app.delete(
  "/room/:roomId/delete",
  middleware,
  async (req, res): Promise<void> => {
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
  }
);

app.post("/room/:roomId/leave", middleware, async (req, res) => {
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

    // Check if user is a participant
    const participant = await prismaClient.roomParticipant.findUnique({
      where: {
        userId_roomId: {
          userId,
          roomId,
        },
      },
    });

    if (!participant) {
      res.status(404).json({ message: "You are not a member of this room" });
      return;
    }

    // Remove user from room
    await prismaClient.roomParticipant.delete({
      where: {
        userId_roomId: {
          userId,
          roomId,
        },
      },
    });

    res.json({ message: "Left room successfully" });
  } catch (error) {
    console.error("Leave room error:", error);
    res.status(500).json({ message: "Failed to leave room" });
  }
});

app.get("/chats/:slug", middleware, async (req, res) => {
  try {
    const slug = req.params.slug;

    // get roomId by slug
    const roomId = await prismaClient.room.findFirst({
      where: {
        slug: slug,
      },
    });

    res.json({ roomId });
  } catch (error) {
    console.error("Get room by slug error:", error);
    res.status(500).json({ message: "Failed to fetch room by slug" });
  }
});

app.listen(port, () => {
  console.log(`http-backend listening on port ${port}`);
});

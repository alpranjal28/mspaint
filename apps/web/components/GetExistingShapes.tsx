"use client";
import axios from "axios";
import { HTTP_BACKEND_URL } from "../config";

type Shapes =
  | {
      type: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | {
      type: "circle";
      x: number;
      y: number;
      radius: number;
    };

export default async function getExistingShapes(roomId: number) {
  try {
    const res = await axios.get(`${HTTP_BACKEND_URL}/room/${roomId}`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: localStorage.getItem("token"),
      },
    });

    const data = res.data.messages.map((message: any) =>
      JSON.parse(message.message)
    );
    console.log(data);

    const shapes = data.map((shape: Shapes) => {
      if (shape.type === "rect") {
        return {
          type: "rect",
          x: shape.x,
          y: shape.y,
          width: shape.width,
          height: shape.height,
        };
      }
      if (shape.type === "circle") {
        return {
          type: "circle",
          x: shape.x,
          y: shape.y,
          radius: shape.radius,
        };
      }
    });
    return shapes;
  } catch (error) {
    console.log(error);
  }
}

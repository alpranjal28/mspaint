import axios from "axios";
import { HTTP_BACKEND_URL } from "../config";

interface RectProps {
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CircleProps {
  type: "circle";
  centerX: number;
  centerY: number;
  radius: number;
}

interface LineProps {
  type: "line";
  x: number;
  y: number;
  x2: number;
  y2: number;
}
export type Shapes = RectProps | CircleProps | LineProps;

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
          centerX: shape.centerX,
          centerY: shape.centerY,
          radius: shape.radius,
        };
      }if (shape.type === "line") {
        return {
          type: "line",
          x: shape.x,
          y: shape.y,
          x2: shape.x2,
          y2: shape.y2,
        };
      }
    });
    return shapes;
  } catch (error) {
    console.log(error);
  }
}

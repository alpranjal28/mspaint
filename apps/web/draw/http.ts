import axios from "axios";
import { HTTP_BACKEND_URL } from "../config";
import { refreshToken } from "../src/lib/auth";

// shapes
interface RectProps {
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
}
interface EllipseProps {
  type: "ellipse";
  x: number;
  y: number;
  rx: number;
  ry: number;
}
interface LineProps {
  type: "line";
  x: number;
  y: number;
  x2: number;
  y2: number;
}
interface PencilProps {
  type: "pencil";
  points: { x: number; y: number }[];
}
interface TextProps {
  type: "text";
  x: number;
  y: number;
  text: string;
}
export type Shapes =
  | RectProps
  | EllipseProps
  | LineProps
  | PencilProps
  | TextProps;
export interface Payload {
  id: string;
  function: "draw" | "erase" | "move";
  shape: Shapes;
  color?: string;
  timestamp: number;
}

// actions
export type ActionType = "draw" | "erase" | "move";
export interface Command {
  execute(): void;
  undo(): void;
}
export interface DrawAction {
  type: "draw";
  payload: Payload;
}
export interface EraseAction {
  type: "erase";
  payload: Payload;
}
export interface MoveAction {
  type: "move";
  payload: Payload;
  oldPosition: {
    x: number;
    y: number;
  };
  newPosition: {
    x: number;
    y: number;
  };
}
export type Action = DrawAction | EraseAction | MoveAction;


export default async function getExistingShapes(
  roomId: number
): Promise<Payload[]> {
  try {
    const res = await axios.get(`${HTTP_BACKEND_URL}/room/${roomId}`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: localStorage.getItem("token"),
      },
    });

    const erasedDataFilter = res.data.messages.filter(
      (message: any) => message.erased !== true
    );
    console.log("not erased data from server/db", erasedDataFilter);
    const newdata = erasedDataFilter.map((message: any) =>
      JSON.parse(message.message)
    );

    // const data = res.data.messages.map((message: any) => JSON.parse(message.message));
    // console.log("raw data from server/db", data);

    const validPayloads = newdata.filter((item: any) => {
      return (
        // validation
        item &&
        typeof item === "object" &&
        item.function &&
        (item.function === "draw" ||
          item.function === "erase" ||
          item.function === "move") &&
        item.id &&
        (item.function === "erase" ||
          (item.function === "move" && item.shape) ||
          (item.shape && item.shape.type))
      );
    });

    console.log("valid Payloads from server", validPayloads);
    return validPayloads as Payload[];
  } catch (error: any) {
    console.log("Error fetching shapes:", error);
    if (error.response && error.response.status === 401) {
      const refreshed = await refreshToken();
      if (refreshed) {
        return getExistingShapes(roomId); // Retry the request
      }
    }
    return [];
  }
}

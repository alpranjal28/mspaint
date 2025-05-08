import axios from "axios";
import { HTTP_BACKEND_URL } from "../config";

// shapes
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
export interface Payload {
  id: string;
  function: "draw" | "erase";
  shape: Shapes;
}

// actions
export type ActionType = 'draw' | 'erase' | 'move';
export interface Command {
  execute(): void;
  undo(): void;
}
export interface DrawAction {
  type: 'draw';
  payload: Payload;
}
export interface EraseAction {
  type: 'erase';
  payload: Payload;
}
export interface MoveAction {
  type: 'move';
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
    console.log("raw data from server/db", data);

    const validPayloads = data.filter((item: any) => {
      return (
        // validation
        item &&
        typeof item === "object" &&
        item.function &&
        (item.function === "draw" || item.function === "erase") &&
        item.id &&
        (item.function === "erase" || (item.shape && item.shape.type))
      );
    });

    console.log("valid Payloads from server", validPayloads);
    return validPayloads as Payload[];
  } catch (error) {
    console.log(error);
  }
}

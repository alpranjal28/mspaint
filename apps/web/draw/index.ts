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

let existingShapes: Shapes[] = await getExistingShapes(123);

export function Draw(canvas: HTMLCanvasElement, roomId: string) {
  // const canvas = canvasRef.current;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // stroke
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(200, 100);
  ctx.stroke();

  // rect
  let clicked = false;
  let startX = 0;
  let startY = 0;
  canvas.addEventListener("mousedown", (e) => {
    clicked = true;
    startX = e.clientX;
    startY = e.clientY;
  });
  canvas.addEventListener("mouseup", (e) => {
    clicked = false;
    const width = e.clientX - startX;
    const height = e.clientY - startY;

    existingShapes.push({
      type: "rect",
      x: startX,
      y: startY,
      width,
      height,
    });
  });
  canvas.addEventListener("mousemove", (e) => {
    if (clicked) {
      const width = e.clientX - startX;
      const height = e.clientY - startY;
      renderCanvas(ctx, canvas);
      ctx.strokeStyle = "red";
      ctx.strokeRect(startX, startY, width, height);
      ctx.beginPath();
      ctx.arc(100, 100, 80, 0, 2 * Math.PI);
      ctx.stroke();
    }
  });
}

function renderCanvas(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement
) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  existingShapes.map((shape) => {
    if (shape.type === "rect") {
      ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
    }
    if (shape.type === "circle") {
      ctx.arc(shape.x, shape.y, shape.radius, shape.x + 10, shape.y + 10);
    }
  });
}

async function getExistingShapes(roomId: number) {
  const res = await axios.get(`${HTTP_BACKEND_URL}/room/${roomId}`);
  const data = JSON.parse(res.data.messages);

  return data;
}

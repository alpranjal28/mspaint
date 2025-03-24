import axios from "axios";
import { HTTP_BACKEND_URL } from "../config";
import { get } from "node:http";

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

let existingShapes: Shapes[] = [];

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

export function Draw(
  canvas: HTMLCanvasElement,
  roomId: number,
  socket: WebSocket
) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log("socketData -> ", data);
    if (data.type === "chat") {
      existingShapes.push(data);
    }
    renderCanvas(ctx, canvas);
  };

  // // stroke
  // ctx.beginPath();
  // ctx.moveTo(0, 0);
  // ctx.lineTo(200, 100);
  // ctx.stroke();

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

    const shape: Shapes = {
      type: "rect",
      x: startX,
      y: startY,
      width,
      height,
    };
    // send to backend
    existingShapes.push(shape);
    socket.send(
      JSON.stringify({
        type: "chat",
        roomId: 7,
        message: JSON.stringify(shape),
        // message: JSON.stringify(shape),
      })
    );
    console.log("sent to backend -> ", shape);
    console.log("sent to backend -> ", JSON.stringify(shape));
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

async function getExistingShapes(roomId: number) {
  const res = (await axios.get(`${HTTP_BACKEND_URL}/room/${roomId}`,{
    headers: {
      "Content-Type": "application/json",
      "Authorization": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxNzRjMWQxZi01NmIwLTRiMGQtODUzYy1iMmM2ZmE1M2M2Y2UiLCJpYXQiOjE3NDI4MTAwMzMsImV4cCI6MTc0Mjg5NjQzM30.yphIHBoS0o5NMiQdeWnuBD-m5Vqt1PfvfbWkLeUd2O4"
    },
  }));

  const data = res.data.messages;
  console.log(data);

  const shapes = data.map((shape: any) => {
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

  return data;
}
getExistingShapes(7);

"use client"
import { Tools } from "../components/Canvas";
import getExistingShapes from "../components/GetExistingShapes";

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
      width: number;
      height: number;
      radius: number;
    };

function renderCanvas(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  existingShapes: Shapes[]
) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "red";
  existingShapes.map((shape) => {
    if (shape.type === "rect") {
      ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
    }
    if (shape.type === "circle") {
      ctx.arc(shape.x, shape.y, shape.radius, shape.x + 10, shape.y + 10);
    }
  });
}

export async function Draw(
  canvas: HTMLCanvasElement,
  roomId: number,
  socket: WebSocket,
  drawShape: Tools
) {
  let existingShapes: Shapes[] = await getExistingShapes(roomId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  renderCanvas(ctx, canvas, existingShapes);

  // render new shapes broadcasted
  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "broadcasted") {
      const shape = JSON.parse(data.message) as Shapes;
      existingShapes.push(shape);
      renderCanvas(ctx, canvas, existingShapes);
    } else {
      console.log("not rendered data -> ", data);
    }
  };
  renderCanvas(ctx, canvas, existingShapes);

  // initialse
  let clicked = false;
  let startX = 0;
  let startY = 0;
  let shape: Shapes | null = null;

  canvas.addEventListener("mousedown", (e) => {
    clicked = true;
    startX = e.clientX;
    startY = e.clientY;
  });
  canvas.addEventListener("mouseup", (e) => {
    clicked = false;
    const width = e.clientX - startX;
    const height = e.clientY - startY;

    if (drawShape === Tools.Rect) {
      // rect
      shape = {
        type: "rect",
        x: startX,
        y: startY,
        width,
        height,
      };
    } else if (drawShape === Tools.Circle) {
      // circle
      shape = {
        type: "circle",
        x: startX,
        y: startY,
        width,
        height,
        radius: Math.sqrt(width * width + height * height),
      };
    }

    if (!shape) return;
    // send to backend
    socket.send(
      JSON.stringify({
        type: "chat",
        roomId: 7,
        message: JSON.stringify(shape),
      })
    );
    existingShapes.push(shape);
  });

  canvas.addEventListener("mousemove", (e) => {
    if (clicked) {
      const width = e.clientX - startX;
      const height = e.clientY - startY;
      renderCanvas(ctx, canvas, existingShapes);
      ctx.strokeStyle = "red";
      if (drawShape === Tools.Rect) {
        ctx.strokeRect(startX, startY, width, height);
      } else if (drawShape === Tools.Circle) {
        let centerWidth;
        let centerHeight;
        let endX;
        let endY;
        let radius;
        clicked = false;

        endX = e.clientX;
        endY = e.clientY;
        centerWidth = (e.clientX - startX) / 2;
        centerHeight = (e.clientY - startY) / 2;
        radius = Math.sqrt(
          centerWidth * centerWidth + centerHeight * centerHeight
        );

        console.log("start coordinates -> ", startX, startY);
        console.log("end coordinates -> ", endX, endY);
        console.log("center coordinates -> ", centerWidth, centerHeight);
      }
    }
  });

  // if (drawShape === Tools.Circle) {
  //   canvas.addEventListener("mousedown", (e) => {
  //     clicked = true;
  //     startX = e.clientX;
  //     startY = e.clientY;
  //   });
  //   let centerWidth;
  //   let centerHeight;
  //   let endX;
  //   let endY;
  //   let radius;
  //   canvas.addEventListener("mouseup", (e) => {
  //     clicked = false;

  //     endX = e.clientX;
  //     endY = e.clientY;
  //     centerWidth = (e.clientX - startX) / 2;
  //     centerHeight = (e.clientY - startY) / 2;
  //     radius = Math.sqrt(
  //       centerWidth * centerWidth + centerHeight * centerHeight
  //     );

  //     console.log("start coordinates -> ", startX, startY);
  //     console.log("end coordinates -> ", endX, endY);
  //     console.log("center coordinates -> ", centerWidth, centerHeight);
  //   });
  //   canvas.addEventListener("mousemove", (e) => {
  //     if (clicked) {
  //       ctx.beginPath();
  //     }
  //   });
  // }
}

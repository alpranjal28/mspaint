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
  socket: WebSocket
) {
  let existingShapes: Shapes[] = await getExistingShapes(roomId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  renderCanvas(ctx, canvas, existingShapes);
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
      })
    );
  });
  canvas.addEventListener("mousemove", (e) => {
    if (clicked) {
      const width = e.clientX - startX;
      const height = e.clientY - startY;
      renderCanvas(ctx, canvas, existingShapes);
      ctx.strokeStyle = "red";
      ctx.strokeRect(startX, startY, width, height);
    }
  });
}
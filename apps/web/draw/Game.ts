import getExistingShapes from "./http";

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

enum Tools {
  Rect = "rect",
  Circle = "circle",
  Pencil = "pencil",
}

export class Game {
  // global variables
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private existingShapes: Shapes[];
  private roomId: number;
  private selectedTool: Tools;
  private clicked = false;
  private startX = 0;
  private startY = 0;
  private socket: WebSocket;
  // remove private from socket if issue with connection

  constructor(
    canvas: HTMLCanvasElement,
    roomId: number,
    socket: WebSocket,
    selectedTool: Tools
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.selectedTool = Tools.Rect;
    this.existingShapes = [];
    this.roomId = roomId;
    this.socket = socket;
    this.init();
    this.initHandlers();
    this.initMouseHandlers();
  }

  async init() {
    getExistingShapes(this.roomId);
  }

  initHandlers() {
    this.socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "broadcasted") {
        const shape = JSON.parse(data.message) as Shapes;
        this.existingShapes.push(shape);
        this.renderCanvas();
      } else {
        console.log("not rendered data -> ", data);
      }
    };
  }

  renderCanvas() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.strokeStyle = "red";
    this.existingShapes.map((shape) => {
      if (shape.type === "rect") {
        this.ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
      }
      if (shape.type === "circle") {
        this.ctx.beginPath();
        this.ctx.arc(shape.x, shape.y, shape.height, shape.width, shape.radius);
        this.ctx.stroke();
        this.ctx.closePath();
      }
    });
  }

  initMouseHandlers() {
    this.canvas.addEventListener("mousedown", (e) => {
      this.clicked = true;
      this.startX = e.clientX;
      this.startY = e.clientY;
    });

    this.canvas.addEventListener("mouseup", (e) => {
      this.clicked = false;
      const width = e.clientX - this.startX;
      const height = e.clientY - this.startY;

      let shape: Shapes | null = null;
      if (this.selectedTool === Tools.Rect) {
        // rect
        shape = {
          type: "rect",
          x: this.startX,
          y: this.startY,
          width,
          height,
        };
      } else if (this.selectedTool === Tools.Circle) {
        // circle
        shape = {
          type: "circle",
          x: this.startX,
          y: this.startY,
          width,
          height,
          radius: Math.sqrt(width * width + height * height),
        };
      }

      if (!shape) return;
      // send to backend
      this.socket.send(
        JSON.stringify({
          type: "chat",
          roomId: 7,
          message: JSON.stringify(shape),
        })
      );
      this.existingShapes.push(shape);
    });

    this.canvas.addEventListener("mousemove", (e) => {
      if (this.clicked) {
        const width = e.clientX - this.startX;
        const height = e.clientY - this.startY;
        this.renderCanvas();
        this.ctx.strokeStyle = "red";
        if (this.selectedTool === Tools.Rect) {
          this.ctx.strokeRect(this.startX, this.startY, width, height);
        } else if (this.selectedTool === Tools.Circle) {
          let centerWidth;
          let centerHeight;
          let endX;
          let endY;
          let radius;

          endX = e.clientX;
          endY = e.clientY;
          centerWidth = (e.clientX - this.startX) / 2;
          centerHeight = (e.clientY - this.startY) / 2;
          radius = Math.sqrt(
            centerWidth * centerWidth + centerHeight * centerHeight
          );
  
          console.log("start coordinates -> ", this.startX, this.startY);
          console.log("end coordinates -> ", endX, endY);
          console.log("center coordinates -> ", centerWidth, centerHeight);
        }
      }
    });
  }
}

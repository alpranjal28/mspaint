import { Tools } from "../components/Canvas";
import getExistingShapes, { Shapes } from "./http";

export class Game {
  // global variables
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private existingShapes: Shapes[];
  private roomId: number;
  selectedTool: Tools;
  // initials
  private clicked = false;
  private startX = 0;
  private startY = 0;
  // rect
  private height = 0;
  private width = 0;
  // circle
  private centerX = 0;
  private centerY = 0;
  private radius = 0;

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
    this.selectedTool = selectedTool;
    this.existingShapes = [];
    this.roomId = roomId;
    this.socket = socket;
    this.init();
    this.initHandlers();
    this.initMouseHandlers();
  }

  setSelectedTool(tool: Tools) {
    console.log("selected tool -> ", tool);
    this.selectedTool = tool;
  }

  async init() {
    this.existingShapes = await getExistingShapes(this.roomId);
    this.renderCanvas();
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
        this.ctx.arc(
          shape.centerX,
          shape.centerY,
          shape.radius,
          0,
          2 * Math.PI
        );
        this.ctx.stroke();
        this.ctx.closePath();
      }
    });
  }

  mouseUpHandler = (e: MouseEvent) => {
    this.clicked = true;
    this.startX = e.clientX;
    this.startY = e.clientY;
  };

  mouseDownHandler = (e: MouseEvent) => {
    this.clicked = false;
    this.width = e.clientX - this.startX;
    this.height = e.clientY - this.startY;

    let shape: Shapes | null = null;
    if (this.selectedTool === "rect") {
      // rect
      shape = {
        type: "rect",
        x: this.startX,
        y: this.startY,
        width: this.width,
        height: this.height,
      };
    }
    if (this.selectedTool === "circle") {
      // circle
      shape = {
        type: "circle",
        centerX: this.centerX,
        centerY: this.centerY,
        radius: this.radius,
      };
      // console.log(shape);
    }

    if (!shape) return;

    console.log(shape);

    // send to backend
    this.socket.send(
      JSON.stringify({
        type: "chat",
        roomId: 7,
        message: JSON.stringify(shape),
      })
    );
    this.existingShapes.push(shape);
  };

  mouseMoveHandler = (e: MouseEvent) => {
    if (this.clicked) {
      this.width = e.clientX - this.startX;
      this.height = e.clientY - this.startY;
      this.renderCanvas();
      this.ctx.strokeStyle = "red";
      if (this.selectedTool === "rect") {
        this.ctx.strokeRect(this.startX, this.startY, this.width, this.height);
      }
      if (this.selectedTool === "circle") {
        let centerWidth;
        let centerHeight;
        let endX;
        let endY;

        endX = e.clientX;
        endY = e.clientY;
        this.centerX = (e.clientX + this.startX) / 2;
        this.centerY = (e.clientY + this.startY) / 2;
        this.radius =
          Math.sqrt(
            Math.pow(endX - this.startX, 2) + Math.pow(endY - this.startY, 2)
          ) / 2;

        // console.log("start coordinates -> ", this.startX, this.startY);
        // console.log("end coordinates -> ", endX, endY);
        // console.log("center coordinates -> ", centerWidth, centerHeight);

        this.ctx.beginPath();
        this.ctx.arc(this.centerX, this.centerY, this.radius, 0, 2 * Math.PI);
        this.ctx.stroke();
        this.ctx.closePath();
      }
    }
  };

  initMouseHandlers = () => {
    this.canvas.addEventListener("mouseup", this.mouseDownHandler);
    this.canvas.addEventListener("mousedown", this.mouseUpHandler);
    this.canvas.addEventListener("mousemove", this.mouseMoveHandler);
  };

  destroyMouseHandlers = () => {
    this.canvas.removeEventListener("mousedown", this.mouseDownHandler);
    this.canvas.removeEventListener("mouseup", this.mouseUpHandler);
    this.canvas.removeEventListener("mousemove", this.mouseMoveHandler);
  };
}

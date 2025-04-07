import { Tools } from "../components/Canvas";
import getExistingShapes, { Shapes } from "./http";

export class Game {
  // global variables
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private existingShapes: Shapes[];
  private roomId: number;
  selectedTool: Tools = Tools.Circle;
  // initials
  private clicked = false;
  private startX = 0;
  private startY = 0;
  private lastX = 0;
  private lastY = 0;
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
    // get existing shapes from db
    this.existingShapes = await getExistingShapes(this.roomId);
    this.renderCanvas();
  }

  initHandlers() {
    // pull from websocket
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

  circleStroke(shape: Shapes) {
    if (shape.type !== "circle") return;

    this.ctx.beginPath();
    this.ctx.arc(shape.centerX, shape.centerY, shape.radius, 0, 2 * Math.PI);
    this.ctx.stroke();
    this.ctx.closePath();
  }
  rectStroke(shape: Shapes) {
    if (shape.type !== "rect") return;

    this.ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
  }
  lineStroke(shape: Shapes) {
    if (shape.type !== "line") return;

    this.ctx.beginPath();
    this.ctx.moveTo(shape.x, shape.y);
    this.ctx.lineTo(shape.x2, shape.y2);
    this.ctx.stroke();
  }

  renderCanvas() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.strokeStyle = "red";
    this.existingShapes.map((shape) => {
      this.circleStroke(shape);
      this.rectStroke(shape);
      this.lineStroke(shape);
    });
  }

  broadcastHandler(shape: Shapes) {
    this.socket.send(
      JSON.stringify({
        type: "chat",
        roomId: 7,
        message: JSON.stringify(shape),
      })
    );
    this.existingShapes.push(shape);
    console.log("sent to db", shape);
  }

  mouseDownHandler = (e: MouseEvent) => {
    this.clicked = true;
    this.startX = e.clientX;
    this.startY = e.clientY;
  };

  mouseUpHandler = (e: MouseEvent) => {
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
      if (shape.width === 0 || shape.height === 0) {
        return;
      }
      this.broadcastHandler(shape);
    }
    if (this.selectedTool === "circle") {
      // circle
      shape = {
        type: "circle",
        centerX: this.centerX,
        centerY: this.centerY,
        radius: this.radius,
      };
      if (shape.radius === 0) {
        return;
      }
      this.broadcastHandler(shape);
    }
    if (this.selectedTool === "line") {
      // line
      shape = {
        type: "line",
        x: this.startX,
        y: this.startY,
        x2: e.clientX,
        y2: e.clientY,
      };
      if (shape.x === shape.x2 && shape.y === shape.y2) {
        return;
      }
      this.broadcastHandler(shape);
    } else {
      return;
    }
  };

  mouseMoveHandler = (e: MouseEvent) => {
    // rendering logic for shapes
    // playground
    if (this.clicked) {
      this.width = e.clientX - this.startX;
      this.height = e.clientY - this.startY;
      this.renderCanvas();
      this.ctx.strokeStyle = "red";
      if (this.selectedTool === Tools.Rect) {
        this.ctx.strokeRect(this.startX, this.startY, this.width, this.height);
      }
      if (this.selectedTool === Tools.Circle) {
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
        this.ctx.beginPath();
        this.ctx.arc(this.centerX, this.centerY, this.radius, 0, 2 * Math.PI);
        this.ctx.stroke();
        this.ctx.closePath();
      }
      if (this.selectedTool === Tools.Line) {
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.ctx.beginPath();
        this.ctx.moveTo(this.startX, this.startY);
        this.ctx.lineTo(this.lastX, this.lastY);
        this.ctx.stroke();
        this.ctx.closePath();
      }
    }
  };

  initMouseHandlers = () => {
    this.canvas.addEventListener("mousedown", this.mouseDownHandler);
    this.canvas.addEventListener("mouseup", this.mouseUpHandler);
    this.canvas.addEventListener("mousemove", this.mouseMoveHandler);
  };

  destroyMouseHandlers = () => {
    this.canvas.removeEventListener("mousedown", this.mouseDownHandler);
    this.canvas.removeEventListener("mouseup", this.mouseUpHandler);
    this.canvas.removeEventListener("mousemove", this.mouseMoveHandler);
  };
}

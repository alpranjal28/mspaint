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
  private panOffsetX = 0;
  private panOffsetY = 0;
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
    this.ctx.save();
  }

  getMousePos(e: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    // return {
    //   x: e.clientX - rect.left + this.panOffsetX,
    //   y: e.clientY - rect.top + this.panOffsetY,
    // };
  }

  setSelectedTool(tool: Tools) {
    console.log("selected tool -> ", tool);
    this.selectedTool = tool;
    this.resetInitialValues();
    this.ctx.restore();
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

  resetInitialValues() {
    this.clicked = false;
    this.startX = 0;
    this.startY = 0;
    this.lastX = 0;
    this.lastY = 0;
    this.height = 0;
    this.width = 0;
    this.centerX = 0;
    this.centerY = 0;
    this.radius = 0;
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
    this.ctx.closePath();
  }

  renderCanvas() {
    // First clear everything
    this.ctx.save(); // Save the initial state
    this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset any transformations
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore(); // Restore to the initial state

    // Start fresh with transformations
    this.ctx.save();

    // Apply translation here
    this.ctx.translate(this.panOffsetX, this.panOffsetY); // Example translation

    // Draw all shapes with the translation applied
    this.ctx.strokeStyle = "red";
    this.existingShapes.map((shape) => {
      this.circleStroke(shape);
      this.rectStroke(shape);
      this.lineStroke(shape);
    });

    this.ctx.restore(); // This will remove the translation
  }

  broadcastHandler(shape: Shapes) {
    this.socket.send(
      JSON.stringify({
        type: "chat",
        roomId: this.roomId,
        message: JSON.stringify(shape),
      })
    );
    this.existingShapes.push(shape);
    console.log("sent to db", shape);
    this.resetInitialValues();
  }

  mouseDownHandler = (e: MouseEvent) => {
    e.preventDefault();
    this.clicked = true;
    this.startX = this.getMousePos(e).x;
    this.startY = this.getMousePos(e).y;
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
        x: this.startX - this.panOffsetX,
        y: this.startY - this.panOffsetY,
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
        centerX: this.centerX - this.panOffsetX,
        centerY: this.centerY - this.panOffsetY,
        radius: this.radius,
      };
      if (this.radius === 0) {
        return;
      }
      this.broadcastHandler(shape);
    }
    if (this.selectedTool === "line") {
      // line
      shape = {
        type: "line",
        x: this.startX - this.panOffsetX,
        y: this.startY - this.panOffsetY,
        x2: this.lastX - this.panOffsetX,
        y2: this.lastY - this.panOffsetY,
      };
      if (
        (shape.x === shape.x2 && shape.y === shape.y2) ||
        shape.x2 === 0 ||
        shape.y2 === 0
      ) {
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

  wheelHandler = (e: WheelEvent) => {
    e.preventDefault();
    const delta = Math.sign(e.deltaY);
    const panAmount = 50; // adjust this value to control pan speed, 50 default

    if (e.shiftKey) {
      // Horizontal pan
      this.panOffsetX -= delta * panAmount;
    } else {
      // Vertical pan by default
      this.panOffsetY -= delta * panAmount;
    }

    this.renderCanvas();
  };

  initMouseHandlers = () => {
    this.canvas.addEventListener("mousedown", this.mouseDownHandler);
    this.canvas.addEventListener("mouseup", this.mouseUpHandler);
    this.canvas.addEventListener("mousemove", this.mouseMoveHandler);
    this.canvas.addEventListener("wheel", this.wheelHandler);
  };

  destroyMouseHandlers = () => {
    this.canvas.removeEventListener("mousedown", this.mouseDownHandler);
    this.canvas.removeEventListener("mouseup", this.mouseUpHandler);
    this.canvas.removeEventListener("mousemove", this.mouseMoveHandler);
  };
}

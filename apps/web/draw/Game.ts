import { Tools } from "../components/Canvas";
import getExistingShapes, { Payload, Shapes, Action } from "./http";

interface SelectionState {
  active: boolean;
  startX: number;
  startY: number;
  selectedShape?: Payload;
  isDragging: boolean;
  dragOffsetX: number;
  dragOffsetY: number;
}

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private socket: WebSocket;
  private tempShapes: Payload[] = [];
  private roomId: number;
  selectedTool: Tools;
  private resizeObserver: ResizeObserver;

  // State
  private current = { scale: 1, x: 0, y: 0 };
  private target = { scale: 1, x: 0, y: 0 };
  private drawing = { active: false, startX: 0, startY: 0, lastX: 0, lastY: 0 };
  private selection: SelectionState = {
    active: false,
    startX: 0,
    startY: 0,
    isDragging: false,
    dragOffsetX: 0,
    dragOffsetY: 0,
  };
  private frame = 0;
  private history: Action[] = [];
  private redoStack: Action[] = [];
  private maxHistorySize = 50;

  constructor(
    canvas: HTMLCanvasElement,
    roomId: number,
    socket: WebSocket,
    selectedTool: Tools
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.socket = socket;
    this.selectedTool = selectedTool;
    this.roomId = roomId;
    this.resizeObserver = new ResizeObserver(this.resizeCanvas);
    this.resizeObserver.observe(canvas);

    this.init();
    this.initSocket();
    this.initEvents();
  }

  set tool(tool: Tools) {
    this.selectedTool = tool;
    if (tool !== Tools.Select) {
      this.selection.selectedShape = undefined;
    }
  }

  private resizeCanvas = (entries: ResizeObserverEntry[]) => {
    const entry = entries[0];
    if (!entry) return;

    const { width, height } = entry.contentRect;
    this.canvas.width = width;
    this.canvas.height = height;

    this.render();
  };

  private async init() {
    const shapes = await getExistingShapes(this.roomId);
    this.tempShapes = (shapes || []).filter(
      (shape) => shape && shape.shape && shape.shape.type
    );
    this.render();
  }

  private initSocket() {
    this.socket.onmessage = (e) => {
      const data = JSON.parse(e.data);

      if (data.type === "broadcasted") {
        try {
          const message = JSON.parse(data.message);
          console.log("initSocket message = ", message);

          if (message.function === "erase") {
            this.tempShapes = this.tempShapes.filter(
              (shape) => shape.id !== message.id
            );
          }
          if (message.function === "draw") {
            this.tempShapes.push(message);
          }
          // this.shapes.push(JSON.parse(data.message));
          this.render();
        } catch (error) {
          console.error("Error parsing socket message:", error);
        }
      }
    };
  }

  private initEvents() {
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    this.canvas.addEventListener("mousemove", this.onMouseMove);
    this.canvas.addEventListener("mouseup", this.onMouseUp);
    this.canvas.addEventListener("wheel", this.onWheel);
  }

  private getMousePos(e: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert screen coordinates to world coordinates
    return {
      x: (x - this.current.x) / this.current.scale,
      y: (y - this.current.y) / this.current.scale,
    };
  }

  // mouse events
  private onMouseDown = (e: MouseEvent) => {
    const pos = this.getMousePos(e);

    if (this.selectedTool === Tools.Eraser) {
      const shapeToErase = this.findShapeAtPosition(pos);
      if (shapeToErase) {
        this.eraseShape(shapeToErase);
      }
    } else if (this.selectedTool === Tools.Select) {
      const selectedShape = this.findShapeAtPosition(pos);

      this.selection = {
        active: true,
        startX: pos.x,
        startY: pos.y,
        selectedShape,
        isDragging: !!selectedShape,
        dragOffsetX: selectedShape
          ? pos.x -
            (selectedShape.shape.type === "circle"
              ? selectedShape.shape.centerX
              : selectedShape.shape.x)
          : 0,
        dragOffsetY: selectedShape
          ? pos.y -
            (selectedShape.shape.type === "circle"
              ? selectedShape.shape.centerY
              : selectedShape.shape.y)
          : 0,
      };
    } else {
      this.drawing = {
        active: true,
        startX: pos.x,
        startY: pos.y,
        lastX: pos.x,
        lastY: pos.y,
      };
    }
    this.animate();
  };

  private onMouseMove = (e: MouseEvent) => {
    const pos = this.getMousePos(e);

    if (
      this.selectedTool === Tools.Select &&
      this.selection.active &&
      this.selection.selectedShape
    ) {
      if (this.selection.isDragging) {
        this.moveShape(
          this.selection.selectedShape,
          pos.x - this.selection.dragOffsetX,
          pos.y - this.selection.dragOffsetY
        );
      }
    } else if (this.drawing.active) {
      this.drawing.lastX = pos.x;
      this.drawing.lastY = pos.y;
    }
  };

  private onMouseUp = () => {
    if (this.selectedTool === Tools.Select) {
      if (this.selection.isDragging && this.selection.selectedShape) {
        const oldPosition = {
          x:
            this.selection.selectedShape.shape.type === "circle"
              ? this.selection.selectedShape.shape.centerX
              : this.selection.selectedShape.shape.x,
          y:
            this.selection.selectedShape.shape.type === "circle"
              ? this.selection.selectedShape.shape.centerY
              : this.selection.selectedShape.shape.y,
        };
        const newPosition = {
          x: oldPosition.x + (this.selection.dragOffsetX || 0),
          y: oldPosition.y + (this.selection.dragOffsetY || 0),
        };
        this.addToHistory({
          type: "move",
          payload: this.selection.selectedShape,
          oldPosition,
          newPosition,
        });
        this.socket.send(
          JSON.stringify({
            type: "chat",
            roomId: this.roomId,
            message: JSON.stringify(this.selection.selectedShape),
          })
        );
      }
      this.selection.isDragging = false;
    } else if (this.drawing.active) {
      this.drawing.active = false;
      const shape = this.createShape();
      if (shape) {
        const id = `${Math.random() * 11}`;
        const payload: Payload = { function: "draw", shape: shape, id };
        console.log(payload);

        this.addToHistory({
          type: "draw",
          payload,
        });

        this.socket.send(
          JSON.stringify({
            type: "chat",
            roomId: this.roomId,
            message: JSON.stringify(payload),
          })
        );
        this.tempShapes.push(payload);
        console.log("sent to db ", payload);
      }
    }
  };

  private findShapeAtPosition(pos: {
    x: number;
    y: number;
  }): Payload | undefined {
    for (let i = this.tempShapes.length - 1; i >= 0; i--) {
      const shape = this.tempShapes[i];
      if (!shape || !shape.shape) return;
      if (this.isPointInShape(pos, shape)) {
        return shape;
      }
    }
    return undefined;
  }

  private isPointInShape(
    point: { x: number; y: number },
    payload: Payload
  ): boolean {
    if (!payload || !payload.shape) return false;
    const { shape } = payload;
    switch (shape.type) {
      case "rect":
        return (
          point.x >= shape.x &&
          point.x <= shape.x + shape.width &&
          point.y >= shape.y &&
          point.y <= shape.y + shape.height
        );

      case "circle": {
        const dx = point.x - shape.centerX;
        const dy = point.y - shape.centerY;
        return dx * dx + dy * dy <= shape.radius * shape.radius;
      }

      case "line": {
        const dx = shape.x2 - shape.x;
        const dy = shape.y2 - shape.y;
        const length = Math.sqrt(dx * dx + dy * dy);

        if (length === 0) return false;

        const t = Math.max(
          0,
          Math.min(
            1,
            ((point.x - shape.x) * dx + (point.y - shape.y) * dy) /
              (length * length)
          )
        );

        const projX = shape.x + t * dx;
        const projY = shape.y + t * dy;

        return Math.hypot(point.x - projX, point.y - projY) <= 5;
      }
    }
  }

  private moveShape(payload: Payload, x: number, y: number): void {
    let { shape } = payload;
    switch (shape.type) {
      case "rect":
        shape.x = x;
        shape.y = y;
        break;

      case "circle":
        shape.centerX = x;
        shape.centerY = y;
        break;

      case "line": {
        const dx = shape.x2 - shape.x;
        const dy = shape.y2 - shape.y;
        shape.x = x;
        shape.y = y;
        shape.x2 = x + dx;
        shape.y2 = y + dy;
        break;
      }
    }
  }

  private eraseShape(tempShape: Payload) {
    const index = this.tempShapes.indexOf(tempShape);
    if (index !== -1) {
      this.addToHistory({
        type: "erase",
        payload: tempShape,
      });

      this.tempShapes.splice(index, 1);

      this.socket.send(
        JSON.stringify({
          type: "chat",
          roomId: this.roomId,
          message: JSON.stringify({ function: "erase", id: tempShape.id }),
        })
      );

      this.render();
    }
  }

  public undo(): void {
    if (this.history.length === 0) return;
    const action = this.history.pop()!;
    this.redoStack.push(action);

    switch (action.type) {
      case "draw":
        this.tempShapes = this.tempShapes.filter(
          (shape) => shape.id !== action.payload.id
        );
        break;
      case "erase":
        this.tempShapes.push(action.payload);
        break;
      case "move":
        const shape = this.tempShapes.find((s) => s.id);
        if (shape) {
          if (shape.shape.type === "circle") {
            shape.shape.centerX = action.oldPosition.x;
            shape.shape.centerY = action.oldPosition.y;
          } else {
            shape.shape.x = action.oldPosition.x;
            shape.shape.y = action.oldPosition.y;
            if (shape.shape.type === "line") {
              shape.shape.x2 =
                action.oldPosition.x +
                (action.newPosition.x - action.oldPosition.x); //////////////////
              shape.shape.y2 =
                action.oldPosition.y +
                (action.newPosition.y - action.oldPosition.y); /////////////////
            }
          }
        }
        break;
      default:
        break;
    }
    this.render();

    /////////broadcast
    this.broadcastAction(action);
  }

  public redo(): void {
    if (this.redoStack.length === 0) return;
    const action = this.redoStack.pop()!;
    this.history.push(action);

    switch (action.type) {
      case "draw":
        this.tempShapes.push(action.payload);
        break;
      case "erase":
        this.tempShapes = this.tempShapes.filter(
          (shape) => shape.id !== action.payload.id
        );
        break;
      case "move":
        const shape = this.tempShapes.find((s) => s.id);
        if (shape) {
          if (shape.shape.type === "circle") {
            shape.shape.centerX = action.newPosition.x;
            shape.shape.centerY = action.newPosition.y;
          } else {
            shape.shape.x = action.newPosition.x;
            shape.shape.y = action.newPosition.y;
            if (shape.shape.type === "line") {
              shape.shape.x2 =
                action.newPosition.x +
                (action.oldPosition.x - action.newPosition.x); //////////////////
              shape.shape.y2 =
                action.newPosition.y +
                (action.oldPosition.y - action.newPosition.y); /////////////////
            }
          }
        }
        break;
      default:
        break;
    }
    this.render();

    this.broadcastAction(action);
  }

  private addToHistory(action: Action): void {
    this.history.push(action);
    this.redoStack = []; // Clear redo stack on new action

    if (this.history.length > this.maxHistorySize) {
      this.history.shift(); // Remove the oldest action if array exceed the max size
    }
    // this.broadcastAction(action);
  }

  private broadcastAction(action: Action): void {
    // Send the action to the server
    this.socket.send(
      JSON.stringify({
        type: "chat",
        roomId: this.roomId,
        message: JSON.stringify(action.payload),
      })
    );
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const pos = this.getMousePos(e);

    if (e.ctrlKey) {
      const delta = e.deltaY > 0 ? 0.95 : 1.05;
      const newScale = this.target.scale * delta;
      this.target.scale = Math.min(Math.max(newScale, 0.1), 5);

      // Convert mouse position to world space before scaling
      const mouseX = e.clientX - this.canvas.getBoundingClientRect().left;
      const mouseY = e.clientY - this.canvas.getBoundingClientRect().top;

      // Calculate how the world position under the mouse changes
      const prevWorldX = (mouseX - this.current.x) / this.current.scale;
      const prevWorldY = (mouseY - this.current.y) / this.current.scale;
      const newWorldX = (mouseX - this.target.x) / this.target.scale;
      const newWorldY = (mouseY - this.target.y) / this.target.scale;

      // Adjust target position to keep the world position under the mouse
      this.target.x += (newWorldX - prevWorldX) * this.target.scale;
      this.target.y += (newWorldY - prevWorldY) * this.target.scale;
    } else {
      const pan = 50;
      this.target.x += e.shiftKey ? -e.deltaY : 0;
      this.target.y += !e.shiftKey ? -e.deltaY : 0;
    }

    this.animate();
  };

  private createShape(): Shapes | null {
    const { startX, startY, lastX, lastY } = this.drawing;

    switch (this.selectedTool) {
      case Tools.Rect:
        return {
          type: "rect",
          x: startX,
          y: startY,
          width: lastX - startX,
          height: lastY - startY,
        };
      case Tools.Circle:
        const radius = Math.hypot(lastX - startX, lastY - startY) / 2;
        return {
          type: "circle",
          centerX: (lastX + startX) / 2,
          centerY: (lastY + startY) / 2,
          radius,
        };
      case Tools.Line:
        return {
          type: "line",
          x: startX,
          y: startY,
          x2: lastX,
          y2: lastY,
        };
    }
    return null;
  }

  private animate = () => {
    const lerp = (a: number, b: number) => a + (b - a) * 0.15;

    this.current.scale = lerp(this.current.scale, this.target.scale);
    this.current.x = lerp(this.current.x, this.target.x);
    this.current.y = lerp(this.current.y, this.target.y);

    this.render();

    const dx = Math.abs(this.current.x - this.target.x);
    const dy = Math.abs(this.current.y - this.target.y);
    const ds = Math.abs(this.current.scale - this.target.scale);

    if (dx > 0.1 || dy > 0.1 || ds > 0.001 || this.drawing.active) {
      this.frame = requestAnimationFrame(this.animate);
    }
  };

  private render() {
    const { width, height } = this.canvas;

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, width, height);

    this.ctx.translate(this.current.x, this.current.y);
    this.ctx.scale(this.current.scale, this.current.scale);

    // Draw existing shapes
    console.log("tempshapes", this.tempShapes);

    this.tempShapes.forEach((tempShape) => {
      this.ctx.strokeStyle =
        tempShape.shape === this.selection.selectedShape?.shape
          ? "blue"
          : "red";
      if (tempShape.function === "draw") {
        const { shape } = tempShape;
        if (shape.type === "rect") {
          this.ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
        } else if (shape.type === "circle") {
          this.ctx.beginPath();
          this.ctx.arc(
            shape.centerX,
            shape.centerY,
            shape.radius,
            0,
            Math.PI * 2
          );
          this.ctx.stroke();
        } else if (shape.type === "line") {
          this.ctx.beginPath();
          this.ctx.moveTo(shape.x, shape.y);
          this.ctx.lineTo(shape.x2, shape.y2);
          this.ctx.stroke();
        }
      }
    });

    // Draw current shape
    if (this.drawing.active) {
      this.ctx.strokeStyle = "red";
      const shape = this.createShape();
      if (shape?.type === "rect") {
        this.ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
      } else if (shape?.type === "circle") {
        this.ctx.beginPath();
        this.ctx.arc(
          shape.centerX,
          shape.centerY,
          shape.radius,
          0,
          Math.PI * 2
        );
        this.ctx.stroke();
      } else if (shape?.type === "line") {
        this.ctx.beginPath();
        this.ctx.moveTo(shape.x, shape.y);
        this.ctx.lineTo(shape.x2, shape.y2);
        this.ctx.stroke();
      }
    }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    // Ctrl+Z for undo
    if (e.ctrlKey && e.key === "z") {
      e.preventDefault();
      this.undo();
    }

    // Ctrl+Y or Ctrl+Shift+Z for redo
    if (
      (e.ctrlKey && e.key === "y") ||
      (e.ctrlKey && e.shiftKey && e.key === "z")
    ) {
      e.preventDefault();
      this.redo();
    }
  };

  cleanup() {
    cancelAnimationFrame(this.frame);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    this.canvas.removeEventListener("mousemove", this.onMouseMove);
    this.canvas.removeEventListener("mouseup", this.onMouseUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("keydown", this.onKeyDown);
  }
}

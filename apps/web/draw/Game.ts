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
  isResizing: boolean;
  resizeHandle: string;
}

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private socket: WebSocket;
  private tempShapes: Payload[] = [];
  private roomId: number;
  selectedTool: Tools;
  private resizeObserver: ResizeObserver;
  private canvasDrag = { active: false, startX: 0, startY: 0 };
  private textArea: HTMLTextAreaElement | null = null;

  // State
  private current = { scale: 1, x: 0, y: 0 };
  private target = { scale: 1, x: 0, y: 0 };
  private drawing = { active: false, startX: 0, startY: 0, lastX: 0, lastY: 0 };
  private pencilPoints: { x: number; y: number }[] = [];
  private selection: SelectionState = {
    active: false,
    startX: 0,
    startY: 0,
    isDragging: false,
    dragOffsetX: 0,
    dragOffsetY: 0,
    isResizing: false,
    resizeHandle: "",
  };
  private lastSelectedShapeIndex: number = -1;
  private frame = 0;
  private history: Action[] = [];
  private redoStack: Action[] = [];
  private maxHistorySize = 50;

  constructor(
    canvas: HTMLCanvasElement,
    roomId: number,
    socket: WebSocket,
    selectedTool: Tools,
    private startInteracting: () => void,
    private onStopInteracting: () => void,
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

  public setTool(tool: Tools): void {
    this.selectedTool = tool;

    // Remove any active text area when changing tools
    if (this.textArea && tool !== Tools.Text) {
      this.removeTextArea();
    }

    // Update cursor based on selected tool
    if (tool === Tools.Hand) {
      this.canvas.style.cursor = "grab";
    } else if (tool === Tools.Select) {
      this.canvas.style.cursor = "default";
    } else if (tool === Tools.Eraser) {
      this.canvas.style.cursor = "crosshair";
    } else if (tool === Tools.Text) {
      this.canvas.style.cursor = "crosshair";
    } else {
      this.canvas.style.cursor = "crosshair";
    }

    if (tool !== Tools.Select) {
      this.selection.selectedShape = undefined;
    }
  }

  private async init() {
    const shapes = await getExistingShapes(this.roomId);

    if (shapes && shapes.length > 0) {
      // Sort shapes by timestamp if available
      const sortedShapes = shapes.sort((a, b) => {
        const timeA = a.timestamp || 0;
        const timeB = b.timestamp || 0;
        return timeA - timeB;
      });

      // Process shapes in chronological order
      const activeShapes = new Map<string, Payload>();

      sortedShapes.forEach((shape) => {
        if (shape.function === "erase") {
          // Remove erased shapes
          activeShapes.delete(shape.id);
        } else if (shape.function === "draw" || shape.function === "move") {
          // Add or update shapes
          activeShapes.set(shape.id, shape);
        }
      });

      // Convert map to array
      this.tempShapes = Array.from(activeShapes.values());
      console.log("Initialized with filtered shapes:", this.tempShapes);
    } else {
      this.tempShapes = [];
    }

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
            // Remove the shape from tempShapes
            console.log("erase shape with ID:", message.id);
            this.tempShapes = this.tempShapes.filter(
              (shape) => shape.id !== message.id
            );
          } else if (message.function === "draw") {
            // Add the shape to tempShapes only if it doesn't already exist
            if (!this.tempShapes.some((shape) => shape.id === message.id)) {
              console.log("drawing new shape:", message);
              this.tempShapes.push(message);
            }
          } else if (message.function === "move") {
            // find the shape and update its position
            const shapeToMove = this.tempShapes.findIndex(
              (s) => s.id === message.id
            );
            if (shapeToMove !== -1 && message.shape) {
              this.tempShapes[shapeToMove]!.shape = message.shape;
            }
          }
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
    document.addEventListener("keydown", this.onKeyDown);
  }

  private resizeCanvas = (entries: ResizeObserverEntry[]) => {
    const entry = entries[0];
    if (!entry) return;

    const { width, height } = entry.contentRect;
    this.canvas.width = width;
    this.canvas.height = height;

    this.render();
  };

  private getCursorForHandle(handle: string): string {
    switch (handle) {
      case "nw":
      case "se":
        return "nwse-resize";
      case "ne":
      case "sw":
        return "nesw-resize";
      case "n":
      case "s":
        return "ns-resize";
      case "e":
      case "w":
        return "ew-resize";
      default:
        return "move";
    }
  }

  private getResizeHandle(
    pos: { x: number; y: number },
    shape: Payload
  ): string {
    if (!shape || !shape.shape) return "";

    const handleSize = 8 / this.current.scale; // Adjust handle size based on zoom

    if (shape.shape.type === "rect") {
      const { x, y, width, height } = shape.shape;

      // Check corners first (they take precedence)
      if (
        Math.abs(pos.x - x) <= handleSize &&
        Math.abs(pos.y - y) <= handleSize
      )
        return "nw";
      if (
        Math.abs(pos.x - (x + width)) <= handleSize &&
        Math.abs(pos.y - y) <= handleSize
      )
        return "ne";
      if (
        Math.abs(pos.x - x) <= handleSize &&
        Math.abs(pos.y - (y + height)) <= handleSize
      )
        return "sw";
      if (
        Math.abs(pos.x - (x + width)) <= handleSize &&
        Math.abs(pos.y - (y + height)) <= handleSize
      )
        return "se";

      // Then check edges
      if (Math.abs(pos.y - y) <= handleSize && pos.x > x && pos.x < x + width)
        return "n";
      if (
        Math.abs(pos.y - (y + height)) <= handleSize &&
        pos.x > x &&
        pos.x < x + width
      )
        return "s";
      if (Math.abs(pos.x - x) <= handleSize && pos.y > y && pos.y < y + height)
        return "w";
      if (
        Math.abs(pos.x - (x + width)) <= handleSize &&
        pos.y > y &&
        pos.y < y + height
      )
        return "e";
    }

    return "";
  }

  private resizeShape(
    payload: Payload,
    x: number,
    y: number,
    handle: string,
    startX: number,
    startY: number
  ): void {
    if (!payload || !payload.shape) return;

    const { shape } = payload;
    const dx = x - startX;
    const dy = y - startY;

    if (shape.type === "rect") {
      switch (handle) {
        case "nw":
          shape.x += dx;
          shape.y += dy;
          shape.width -= dx;
          shape.height -= dy;
          break;
        case "ne":
          shape.y += dy;
          shape.width += dx;
          shape.height -= dy;
          break;
        case "sw":
          shape.x += dx;
          shape.width -= dx;
          shape.height += dy;
          break;
        case "se":
          shape.width += dx;
          shape.height += dy;
          break;
        case "n":
          shape.y += dy;
          shape.height -= dy;
          break;
        case "s":
          shape.height += dy;
          break;
        case "w":
          shape.x += dx;
          shape.width -= dx;
          break;
        case "e":
          shape.width += dx;
          break;
      }

      // Ensure width and height are positive
      if (shape.width < 0) {
        shape.x += shape.width;
        shape.width = Math.abs(shape.width);
      }
      if (shape.height < 0) {
        shape.y += shape.height;
        shape.height = Math.abs(shape.height);
      }
    }

    // Update timestamp
    payload.timestamp = Date.now();
    payload.function = "move"; // Mark as a move action

    this.render();
  }

  public recenterCanvas() {
    this.target.x = 0;
    this.target.y = 0;
    this.target.scale = 1;

    // Start animation to smoothly transition to centered view
    this.animate();
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

    // If text tool is active and already have a textarea, finalize the current text
    if (this.selectedTool === Tools.Text && this.textArea) {
      this.finalizeTextInput();
      return;
    }

    switch (this.selectedTool) {
      case Tools.Hand:
        this.canvasDrag = {
          active: true,
          startX: e.clientX,
          startY: e.clientY,
        };
        this.canvas.style.cursor = "grabbing";
        this.startInteracting();
        break;

      case Tools.Eraser:
        const shapeToErase = this.findShapeAtPosition(pos);
        if (shapeToErase) {
          this.eraseShape(shapeToErase);
        }
        break;
        
      case Tools.Text:
        this.createTextArea(pos.x, pos.y);
        this.startInteracting();
        break;

      case Tools.Select:
        const selectedShape = this.findShapeAtPosition(pos);

        if (this.selection.selectedShape) {
          // Check if clicking on a resize handle of the currently selected shape
          const handle = this.getResizeHandle(
            pos,
            this.selection.selectedShape
          );
          if (handle) {
            this.selection.isResizing = true;
            this.selection.resizeHandle = handle;
            this.selection.startX = pos.x;
            this.selection.startY = pos.y;
            this.canvas.style.cursor = this.getCursorForHandle(handle);
            return;
          }
        }

        let dragOffsetX = 0;
        let dragOffsetY = 0;

        if (selectedShape) {
          // Calculate drag offsets based on shape type
          if (selectedShape.shape.type === "circle") {
            dragOffsetX = pos.x - selectedShape.shape.centerX;
            dragOffsetY = pos.y - selectedShape.shape.centerY;
          } else if (
            selectedShape.shape.type === "rect" ||
            selectedShape.shape.type === "line"
          ) {
            dragOffsetX = pos.x - selectedShape.shape.x;
            dragOffsetY = pos.y - selectedShape.shape.y;
          } else if (
            selectedShape.shape.type === "pencil" &&
            selectedShape.shape.points &&
            selectedShape.shape.points.length > 0
          ) {
            // For pencil, use the first point as reference
            dragOffsetX = pos.x - selectedShape.shape.points[0]!.x;
            dragOffsetY = pos.y - selectedShape.shape.points[0]!.y;
          }
        }
        this.canvas.style.cursor = "move";
        this.selection = {
          active: true,
          startX: pos.x,
          startY: pos.y,
          selectedShape,
          isDragging: !!selectedShape,
          dragOffsetX,
          dragOffsetY,
          isResizing: false,
          resizeHandle: "",
        };
        break;

      default:
        // Start drawing
        this.drawing = {
          active: true,
          startX: pos.x,
          startY: pos.y,
          lastX: pos.x,
          lastY: pos.y,
        };
        if (this.selectedTool === Tools.Pencil) {
          this.pencilPoints = [{ x: pos.x, y: pos.y }];
        }
        this.startInteracting();
        break;
    }

    this.animate();
  };

  private onMouseMove = (e: MouseEvent) => {
    const pos = this.getMousePos(e);

    if (this.selectedTool === Tools.Hand && this.canvasDrag.active) {
      this.canvas.style.cursor = "grabbing";
      // Calculate the difference in screen coordinates
      const dx = e.clientX - this.canvasDrag.startX;
      const dy = e.clientY - this.canvasDrag.startY;

      // Update the canvas position
      this.target.x += dx;
      this.target.y += dy;

      // Update the start position for the next move
      this.canvasDrag.startX = e.clientX;
      this.canvasDrag.startY = e.clientY;

      this.animate();
    } else if (
      this.selectedTool === Tools.Select &&
      this.selection.active &&
      this.selection.selectedShape
    ) {
      if (this.selection.isResizing) {
        this.resizeShape(
          this.selection.selectedShape,
          pos.x,
          pos.y,
          this.selection.resizeHandle,
          this.selection.startX,
          this.selection.startY
        );
        this.selection.startX = pos.x;
        this.selection.startY = pos.y;
      } else if (this.selection.isDragging) {
        this.moveShape(
          this.selection.selectedShape,
          pos.x - this.selection.dragOffsetX,
          pos.y - this.selection.dragOffsetY
        );
      } else {
        const handle = this.getResizeHandle(pos, this.selection.selectedShape);
        if (handle) {
          this.canvas.style.cursor = this.getCursorForHandle(handle);
        } else {
          this.canvas.style.cursor = "move";
        }
      }
    } else if (this.drawing.active) {
      this.drawing.lastX = pos.x;
      this.drawing.lastY = pos.y;
      if (this.selectedTool === Tools.Pencil) {
        this.pencilPoints.push({ x: pos.x, y: pos.y });
      }
      this.render();
    }
  };

  private onMouseUp = () => {
    switch (this.selectedTool) {
      case Tools.Hand:
        this.canvasDrag.active = false;
        this.canvas.style.cursor = "grab";
        this.onStopInteracting();
        break;
        
      case Tools.Text:
        // Do nothing on mouse up for text tool
        // The text area is already created in onMouseDown
        break;

      case Tools.Select:
        if (this.selection.isResizing && this.selection.selectedShape) {
          this.addToHistory({
            type: "move",
            payload: this.selection.selectedShape,
            oldPosition: { x: 0, y: 0 }, // track the original dimensions
            newPosition: { x: 0, y: 0 },
          });
          this.socket.send(
            JSON.stringify({
              type: "chat",
              roomId: this.roomId,
              message: JSON.stringify(this.selection.selectedShape),
            })
          );
        } else if (this.selection.isDragging && this.selection.selectedShape) {
          let oldPosition = { x: 0, y: 0 };

          // Get the old position based on shape type
          const shape = this.selection.selectedShape.shape;
          if (shape.type === "circle") {
            oldPosition = { x: shape.centerX, y: shape.centerY };
          } else if (shape.type === "rect" || shape.type === "line") {
            oldPosition = { x: shape.x, y: shape.y };
          } else if (
            shape.type === "pencil" &&
            shape.points &&
            shape.points.length > 0
          ) {
            oldPosition = { x: shape.points[0]!.x, y: shape.points[0]!.y };
          }
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
        this.selection.isResizing = false;
        break;

      default:
        if (this.drawing.active) {
          this.drawing.active = false;
          this.onStopInteracting();

          // create shape and add to tempShapes
          const shape = this.createShape();
          if (shape) {
            const id = `${Math.random() * 11}`;
            const payload: Payload = {
              function: "draw",
              shape: shape,
              id,
              timestamp: Date.now(),
            };

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
          }
        }
        break;
    }
  };

  // Add this property to the Game class

  private findShapeAtPosition(pos: {
    x: number;
    y: number;
  }): Payload | undefined {
    // Find all shapes at this position
    const shapesAtPosition: Payload[] = [];

    for (let i = this.tempShapes.length - 1; i >= 0; i--) {
      const shape = this.tempShapes[i];
      if (!shape || !shape.shape) continue;
      if (this.isPointInShape(pos, shape)) {
        shapesAtPosition.push(shape);
      }
    }

    if (shapesAtPosition.length === 0) {
      this.lastSelectedShapeIndex = -1;
      return undefined;
    }

    // If we have a previously selected shape, find its index
    const currentIndex =
      this.lastSelectedShapeIndex >= 0 &&
      this.lastSelectedShapeIndex < shapesAtPosition.length
        ? this.lastSelectedShapeIndex
        : -1;

    // Select the next shape in the list (or the first if none was selected)
    this.lastSelectedShapeIndex = (currentIndex + 1) % shapesAtPosition.length;

    return shapesAtPosition[this.lastSelectedShapeIndex];
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

      case "pencil": {
        // For pencil, check if point is near any segment of the path
        for (let i = 1; i < shape.points.length; i++) {
          const p1 = shape.points[i - 1];
          const p2 = shape.points[i];
          if (!p1 || !p2) continue;
          // Calculate the distance from the point to the line segment
          // using the projection formula
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const length = Math.sqrt(dx * dx + dy * dy);

          if (length === 0) continue;

          const t = Math.max(
            0,
            Math.min(
              1,
              ((point.x - p1.x) * dx + (point.y - p1.y) * dy) /
                (length * length)
            )
          );

          const projX = p1.x + t * dx;
          const projY = p1.y + t * dy;

          if (Math.hypot(point.x - projX, point.y - projY) <= 5) {
            return true;
          }
        }
        return false;
      }
      case "text": {
        // For text, check if the point is within the bounding box of the text
        const textWidth = this.ctx.measureText(shape.text).width;
        return (
          point.x >= shape.x &&
          point.x <= shape.x + textWidth &&
          point.y >= shape.y - 20 && // Assuming a height of 20px for the text
          point.y <= shape.y
        );
      }
    }
  }

  private moveShape(payload: Payload, x: number, y: number): void {
    let { shape } = payload;
    // Store original position for history
    let oldPosition;

    switch (shape.type) {
      case "rect":
        oldPosition = { x: shape.x, y: shape.y };
        shape.x = x;
        shape.y = y;
        break;

      case "circle":
        oldPosition = { x: shape.centerX, y: shape.centerY };
        shape.centerX = x;
        shape.centerY = y;
        break;

      case "line": {
        oldPosition = { x: shape.x, y: shape.y };
        const dx = shape.x2 - shape.x;
        const dy = shape.y2 - shape.y;
        shape.x = x;
        shape.y = y;
        shape.x2 = x + dx;
        shape.y2 = y + dy;
        break;
      }

      case "pencil": {
        if (!shape.points || shape.points.length === 0) return;

        // Calculate the offset to move all points
        oldPosition = { x: shape.points[0]!.x, y: shape.points[0]!.y };
        const dx = x - oldPosition.x;
        const dy = y - oldPosition.y;

        // Move all points by the same offset
        shape.points = shape.points.map((point) => ({
          x: point.x + dx,
          y: point.y + dy,
        }));
        break;
      }
    }

    // Update timestamp
    payload.timestamp = Date.now();
    payload.function = "move"; // Ensure it's marked as a move action
  }

  private eraseShape(tempShape: Payload) {
    const index = this.tempShapes.indexOf(tempShape);
    if (index !== -1) {
      this.addToHistory({
        type: "erase",
        payload: tempShape,
      });

      this.tempShapes.splice(index, 1);

      // erase shape message for server
      const eraseMessage = {
        function: "erase",
        id: tempShape.id,
        timestamp: Date.now(),
      };

      this.socket.send(
        JSON.stringify({
          type: "chat",
          roomId: this.roomId,
          message: JSON.stringify(eraseMessage),
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
        // Remove the drawn shape
        this.tempShapes = this.tempShapes.filter(
          (shape) => shape.id !== action.payload.id
        );
        break;

      case "erase":
        // Add back the erased shape
        this.tempShapes.push({
          ...action.payload,
          timestamp: Date.now(), // Update timestamp
        });
        break;

      case "move":
        // Find the shape to move back
        const shapeToUndo = this.tempShapes.find(
          (s) => s.id === action.payload.id
        );

        if (shapeToUndo) {
          // Move it back to original position based on shape type
          const shape = shapeToUndo.shape;
          if (shape.type === "circle") {
            shape.centerX = action.oldPosition.x;
            shape.centerY = action.oldPosition.y;
          } else if (shape.type === "rect" || shape.type === "line") {
            shape.x = action.oldPosition.x;
            shape.y = action.oldPosition.y;

            if (shape.type === "line") {
              // Calculate the difference between old and new positions
              const dx = action.newPosition.x - action.oldPosition.x;
              const dy = action.newPosition.y - action.oldPosition.y;
              // Move the end point back by the same amount
              shape.x2 -= dx;
              shape.y2 -= dy;
            }
          } else if (
            shape.type === "pencil" &&
            shape.points &&
            shape.points.length > 0 &&
            shape.points[0]
          ) {
            // For pencil, move all points back
            const dx = action.oldPosition.x - shape.points[0].x;
            const dy = action.oldPosition.y - shape.points[0].y;

            shape.points = shape.points.map((point) => ({
              x: point.x + dx,
              y: point.y + dy,
            }));
          }

          // Update timestamp
          shapeToUndo.timestamp = Date.now();
        }
        break;
    }

    this.render();

    if (action.type === "draw") {
      this.broadcastAction({
        type: "draw",
        payload: action.payload,
      });
    } else if (action.type === "erase") {
      this.broadcastAction({
        type: "erase",
        payload: action.payload,
      });
    } else if (action.type === "move") {
      this.broadcastAction({
        type: "move",
        payload: action.payload,
        oldPosition: action.oldPosition,
        newPosition: action.newPosition,
      });
    }
  }

  public redo(): void {
    if (this.redoStack.length === 0) return;

    const action = this.redoStack.pop()!;
    this.history.push(action);

    switch (action.type) {
      case "draw":
        // Add the shape back
        const drawPayload = {
          ...action.payload,
          timestamp: Date.now(), // Update timestamp
        };

        this.tempShapes.push(drawPayload);
        break;

      case "erase":
        // Remove the shape again
        this.tempShapes = this.tempShapes.filter(
          (shape) => shape.id !== action.payload.id
        );
        break;

      case "move":
        // Find the shape to move
        const shapeToRedo = this.tempShapes.find(
          (s) => s.id === action.payload.id
        );

        if (shapeToRedo) {
          // Move it to the new position based on shape type
          const shape = shapeToRedo.shape;
          if (shape.type === "circle") {
            shape.centerX = action.newPosition.x;
            shape.centerY = action.newPosition.y;
          } else if (shape.type === "rect" || shape.type === "line") {
            shape.x = action.newPosition.x;
            shape.y = action.newPosition.y;

            if (shape.type === "line") {
              // Calculate the difference between old and new positions
              const dx = action.newPosition.x - action.oldPosition.x;
              const dy = action.newPosition.y - action.oldPosition.y;
              // Move the end point by the same amount
              shape.x2 += dx;
              shape.y2 += dy;
            }
          } else if (
            shape.type === "pencil" &&
            shape.points &&
            shape.points.length > 0 &&
            shape.points[0]
          ) {
            // For pencil, move all points

            const dx = action.newPosition.x - shape.points[0].x;
            const dy = action.newPosition.y - shape.points[0].y;

            shape.points = shape.points.map((point) => ({
              x: point.x + dx,
              y: point.y + dy,
            }));
          }

          // Update timestamp
          shapeToRedo.timestamp = Date.now();
        }
        break;
    }

    this.render();
    if (action.type === "draw") {
      this.broadcastAction({
        type: "draw",
        payload: action.payload,
      });
    } else if (action.type === "erase") {
      this.broadcastAction({
        type: "erase",
        payload: action.payload,
      });
    } else if (action.type === "move") {
      this.broadcastAction({
        type: "move",
        payload: action.payload,
        oldPosition: action.oldPosition,
        newPosition: action.newPosition,
      });
    }
  }

  private addToHistory(action: Action): void {
    this.history.push(action);
    this.redoStack = []; // Clear redo stack on new action

    if (this.history.length > this.maxHistorySize) {
      this.history.shift(); // Remove the oldest action if array exceed the max size
    }
    this.broadcastAction(action);
  }

  private broadcastAction(action: Action): void {
    let message: any;

    switch (action.type) {
      case "draw":
        message = action.payload;
        break;
      case "erase":
        message = {
          function: "erase",
          id: action.payload.id,
          timestamp: Date.now(),
        };
        break;
      case "move":
        message = {
          function: "move",
          id: action.payload.id,
          shape: action.payload.shape,
          timestamp: Date.now(),
        };
        break;
    }

    // Send the action to the server
    this.socket.send(
      JSON.stringify({
        type: "chat",
        roomId: this.roomId,
        message: JSON.stringify(message),
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
      this.target.y += -e.deltaY;
      this.target.x += -e.deltaX;
      this.target.scale = this.current.scale;
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
      case Tools.Pencil:
        return {
          type: "pencil",
          points: this.pencilPoints,
        };
      case Tools.Text:
        return {
          type: "text",
          x: startX,
          y: startY,
          text: this.textArea?.value || "Sample Text",
        };
    }
    return null;
  }

  private animate = () => {
    // lerp => determines how quickly the current value approaches the target value
    const lerp = (a: number, b: number) => a + (b - a) * 0.25;
    // Higher values (closer to 1.0) make the movement faster and more responsive but less smooth
    // Lower values (closer to 0.0) make the movement slower and smoother but less responsive

    this.current.scale = lerp(this.current.scale, this.target.scale);
    this.current.x = lerp(this.current.x, this.target.x);
    this.current.y = lerp(this.current.y, this.target.y);

    this.render();

    const dx = Math.abs(this.current.x - this.target.x);
    const dy = Math.abs(this.current.y - this.target.y);
    const ds = Math.abs(this.current.scale - this.target.scale);

    // Continue animation if there's movement, drawing is active, or hand tool is dragging
    if (
      dx > 0.1 ||
      dy > 0.1 ||
      ds > 0.001 ||
      this.drawing.active ||
      this.canvasDrag.active
    ) {
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
    // console.log("tempshapes", this.tempShapes);

    this.tempShapes.forEach((tempShape) => {
      this.ctx.lineWidth = 1.5;
      this.ctx.strokeStyle =
        tempShape.shape === this.selection.selectedShape?.shape
          ? "blue"
          : "white";
      if (tempShape.function === "draw" || tempShape.function === "move") {
        const { shape } = tempShape;

        switch (shape.type) {
          case "rect":
            this.ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
            break;
          case "circle":
            this.ctx.beginPath();
            this.ctx.arc(
              shape.centerX,
              shape.centerY,
              shape.radius,
              0,
              Math.PI * 2
            );
            this.ctx.stroke();
            break;
          case "line":
            this.ctx.beginPath();
            this.ctx.moveTo(shape.x, shape.y);
            this.ctx.lineTo(shape.x2, shape.y2);
            this.ctx.stroke();
            break;
          case "pencil":
            if (shape.points && shape.points.length > 0) {
              this.ctx.beginPath();
              this.ctx.moveTo(shape.points[0]!.x, shape.points[0]!.y);
              shape.points.forEach((point) => {
                this.ctx.lineTo(point.x, point.y);
              });
              this.ctx.stroke();
            }
            break;
          case "text":
            this.ctx.fontKerning = "auto";
            this.ctx.fillStyle = "white";
            this.ctx.font = "20px sans-serif";
            this.ctx.textBaseline = "top";
            this.ctx.textAlign = "left";
            this.ctx.fillText(shape.text, shape.x, shape.y);
            break;
        }
      }
    });

    // Draw current shape
    if (this.drawing.active) {
      this.ctx.strokeStyle = "white";
      const shape = this.createShape();

      if (shape) {
        switch (shape.type) {
          case "rect":
            this.ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
            break;
          case "circle":
            this.ctx.beginPath();
            this.ctx.arc(
              shape.centerX,
              shape.centerY,
              shape.radius,
              0,
              Math.PI * 2
            );
            this.ctx.stroke();
            break;
          case "line":
            this.ctx.beginPath();
            this.ctx.moveTo(shape.x, shape.y);
            this.ctx.lineTo(shape.x2, shape.y2);
            this.ctx.stroke();
            break;
          case "pencil":
            if (shape.points && shape.points.length > 0) {
              this.ctx.beginPath();
              this.ctx.moveTo(shape.points[0]!.x, shape.points[0]!.y);
              shape.points.forEach((point) => {
                this.ctx.lineTo(point.x, point.y);
              });
              this.ctx.stroke();
            }
            break;
          case "text":
            this.ctx.font = "20px sans-serif";
            this.ctx.fillText(shape.text, shape.x, shape.y);
        }
      }
    }
    
    // Draw current text input if active
    if (this.textArea && this.selectedTool === Tools.Text) {
      const x = parseFloat(this.textArea.dataset.x || "0");
      const y = parseFloat(this.textArea.dataset.y || "0");
      const text = this.textArea.value || "";
      
      this.ctx.fillStyle = "white";
      this.ctx.font = "20px sans-serif";
      this.ctx.textBaseline = "top";
      this.ctx.textAlign = "left";
      this.ctx.fillText(text, x, y);
      
      // Draw cursor
      if (text.length > 0) {
        const textWidth = this.ctx.measureText(text).width;
        this.ctx.fillRect(x + textWidth, y, 1, 20);
      } else {
        this.ctx.fillRect(x, y, 1, 20);
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

  private createTextArea(x: number, y: number): void {
    // Remove any existing textarea
    this.removeTextArea();
    
    // Create a new textarea
    this.textArea = document.createElement("textarea");
    this.textArea.style.position = "fixed";
    
    // Calculate position in screen coordinates
    const rect = this.canvas.getBoundingClientRect();
    const screenX = x * this.current.scale + this.current.x + rect.left;
    const screenY = y * this.current.scale + this.current.y + rect.top;
    
    // Set textarea styles - make it invisible
    this.textArea.style.left = `${screenX}px`;
    this.textArea.style.top = `${screenY}px`;
    this.textArea.style.opacity = "0";
    this.textArea.style.pointerEvents = "auto";
    this.textArea.style.width = "1px";
    this.textArea.style.height = "1px";
    this.textArea.style.zIndex = "9999";
    
    // Store the world coordinates for later use
    this.textArea.dataset.x = x.toString();
    this.textArea.dataset.y = y.toString();
    
    // Add event listeners
    this.textArea.addEventListener("blur", this.handleTextAreaBlur);
    this.textArea.addEventListener("keydown", this.handleTextAreaKeyDown);
    this.textArea.addEventListener("input", this.handleTextAreaInput);
    
    // Add to DOM and focus
    document.body.appendChild(this.textArea);
    setTimeout(() => this.textArea?.focus(), 0);
  }
  
  private handleTextAreaBlur = (): void => {
    // Don't finalize on blur - we'll handle this in onMouseDown
    // This prevents issues with text disappearing when clicking elsewhere
  }
  
  private handleTextAreaKeyDown = (e: KeyboardEvent): void => {
    // Submit on Enter (without shift)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this.finalizeTextInput();
    }
    
    // Cancel on Escape
    if (e.key === "Escape") {
      e.preventDefault();
      this.removeTextArea();
      this.onStopInteracting();
    }
    
    // Stop propagation to prevent canvas shortcuts
    e.stopPropagation();
  }
  
  private handleTextAreaInput = (): void => {
    if (this.textArea) {
      this.render();
    }
  }
  
  private finalizeTextInput(): void {
    if (!this.textArea) return;
    
    const text = this.textArea.value.trim();
    if (text) {
      const x = parseFloat(this.textArea.dataset.x || "0");
      const y = parseFloat(this.textArea.dataset.y || "0");
      
      // Create text shape
      const shape: Shapes = {
        type: "text",
        x,
        y,
        text
      };
      
      // Add to shapes
      const id = `${Math.random() * 11}`;
      const payload: Payload = {
        function: "draw",
        shape,
        id,
        timestamp: Date.now(),
      };
      
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
      this.render();
    }
    
    this.removeTextArea();
    this.onStopInteracting();
  }
  
  private removeTextArea(): void {
    if (this.textArea) {
      this.textArea.removeEventListener("blur", this.handleTextAreaBlur);
      this.textArea.removeEventListener("keydown", this.handleTextAreaKeyDown);
      this.textArea.removeEventListener("input", this.handleTextAreaInput);
      document.body.removeChild(this.textArea);
      this.textArea = null;
    }
  }

  cleanup() {
    cancelAnimationFrame(this.frame);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    this.canvas.removeEventListener("mousemove", this.onMouseMove);
    this.canvas.removeEventListener("mouseup", this.onMouseUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    document.removeEventListener("keydown", this.onKeyDown);
    this.removeTextArea();
  }
}

import { Tools } from "../components/Canvas";
import getExistingShapes, { Payload, Shapes, Action } from "./http";

// Extend Window interface to store mouse position
declare global {
  interface Window {
    mouseX?: number;
    mouseY?: number;
  }
}

interface SelectionState {
  active: boolean;
  startX: number;
  startY: number;
  selectedShape?: Payload;
  selectedShapes: Payload[];
  isDragging: boolean;
  dragOffsetX: number;
  dragOffsetY: number;
  isResizing: boolean;
  resizeHandle: string;
  isMultiSelect: boolean;
  shapeOffsets: Map<string, { x: number; y: number }>;
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
    selectedShapes: [],
    isMultiSelect: false,
    shapeOffsets: new Map(),
  };
  private originalPositions = new Map<string, { x: number; y: number }>();
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
    private onStopInteracting: () => void
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.socket = socket;
    this.selectedTool = selectedTool;
    this.roomId = roomId;
    this.resizeObserver = new ResizeObserver(this.handleResize);
    this.resizeObserver.observe(canvas);
    this.init();
    this.initSocket();
    this.initEvents();
  }

  // --- Initialization ---
  private async init() {
    const shapes = await getExistingShapes(this.roomId);
    this.tempShapes = this.processShapes(shapes);
    this.render();
  }

  private processShapes(shapes: Payload[] = []): Payload[] {
    if (!shapes.length) return [];
    const sorted = shapes.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const active = new Map<string, Payload>();
    sorted.forEach((shape) => {
      if (shape.function === "erase") active.delete(shape.id);
      else if (shape.function === "draw" || shape.function === "move") active.set(shape.id, shape);
    });
    return Array.from(active.values());
  }

  private initSocket() {
    this.socket.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "broadcasted") {
        try {
          const message = JSON.parse(data.message);
          this.handleSocketMessage(message);
        } catch (error) {
          console.error("Error parsing socket message:", error);
        }
      }
    };
  }

  private handleSocketMessage(message: any) {
    switch (message.function) {
      case "erase":
        this.tempShapes = this.tempShapes.filter((shape) => shape.id !== message.id);
        break;
      case "draw":
        if (!this.tempShapes.some((shape) => shape.id === message.id)) {
          this.tempShapes.push(message);
        }
        break;
      case "move":
        const idx = this.tempShapes.findIndex((s) => s.id === message.id);
        if (idx !== -1 && message.shape) {
          this.tempShapes[idx]!.shape = message.shape;
        }
        break;
    }
    this.render();
  }

  private initEvents() {
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    this.canvas.addEventListener("mousemove", this.onMouseMove);
    this.canvas.addEventListener("mouseup", this.onMouseUp);
    this.canvas.addEventListener("wheel", this.onWheel);
    document.addEventListener("keydown", this.onKeyDown);
    // Touch support
    this.canvas.addEventListener("touchstart", this.onTouchStart, { passive: false });
    this.canvas.addEventListener("touchmove", this.onTouchMove, { passive: false });
    this.canvas.addEventListener("touchend", this.onTouchEnd, { passive: false });
  }

  // --- Resize Handling ---
  private handleResize = (entries: ResizeObserverEntry[]) => {
    const entry = entries[0];
    if (!entry) return;
    const { width, height } = entry.contentRect;
    this.canvas.width = width;
    this.canvas.height = height;
    this.render();
  };

  // --- Tool Management ---
  public setTool(tool: Tools): void {
    if (this.selectedTool === Tools.Text && this.textArea) {
      this.finalizeTextInput();
    }
    this.selectedTool = tool;
    this.canvas.style.cursor = tool === Tools.Hand ? "grab" : "crosshair";
    if (tool !== Tools.Select) {
      this.selection.selectedShape = undefined;
      this.selection.selectedShapes = [];
      this.selection.isMultiSelect = false;
    }
  }

  // --- Shape Manipulation ---
  private updateShapePosition(shape: Payload, pos: { x: number; y: number }) {
    const { shape: s } = shape;
    const current = this.getShapePosition(shape);
    const dx = pos.x - current.x;
    const dy = pos.y - current.y;
    switch (s.type) {
      case "rect":
      case "text":
        s.x = pos.x;
        s.y = pos.y;
        break;
      case "ellipse":
        s.x = pos.x;
        s.y = pos.y;
        break;
      case "line":
        s.x = pos.x;
        s.y = pos.y;
        s.x2 += dx;
        s.y2 += dy;
        break;
      case "pencil":
        if (s.points) {
          s.points = s.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
        }
        break;
    }
    shape.timestamp = Date.now();
    shape.function = "move";
  }

  private moveShape(payload: Payload, x: number, y: number): void {
    this.updateShapePosition(payload, { x, y });
    this.sendShapeMessage(payload);
    this.animate();
  }

  // --- History Management ---
  private addToHistory(action: Action): void {
    this.history.push(action);
    this.redoStack = [];
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  public undo(): void {
    if (this.history.length === 0) return;
    const action = this.history.pop()!;
    this.redoStack.push(action);
    this.applyHistoryAction(action, true);
    this.render();
  }

  public redo(): void {
    if (this.redoStack.length === 0) return;
    const action = this.redoStack.pop()!;
    this.history.push(action);
    this.applyHistoryAction(action, false);
    this.render();
  }

  private applyHistoryAction(action: Action, isUndo: boolean) {
    switch (action.type) {
      case "draw":
        if (isUndo) {
          this.tempShapes = this.tempShapes.filter((shape) => shape.id !== action.payload.id);
          this.sendShapeMessage("erase", action.payload.id);
        } else {
          const drawPayload = { ...action.payload, timestamp: Date.now() };
          this.tempShapes.push(drawPayload);
          this.sendShapeMessage(drawPayload);
        }
        break;
      case "erase":
        if (isUndo) {
          this.tempShapes.push({ ...action.payload, timestamp: Date.now() });
          // Send un-erase message to backend for soft delete undo
          this.sendShapeMessage({ function: "un-erase", id: action.payload.id, timestamp: Date.now() });
        } else {
          this.tempShapes = this.tempShapes.filter((shape) => shape.id !== action.payload.id);
          this.sendShapeMessage("erase", action.payload.id);
        }
        break;
      case "move":
        const shape = this.tempShapes.find((s) => s.id === action.payload.id);
        if (shape) {
          const pos = isUndo ? action.oldPosition : action.newPosition;
          if (pos) {
            this.updateShapePosition(shape, pos);
            this.sendShapeMessage(shape);
          }
        }
        break;
    }
  }

  // broadcast
  private sendShapeMessage(payload: any, id?: string) {
    let message;
    if (typeof payload === "string" && id) {
      message = { function: payload, id, timestamp: Date.now() };
    } else {
      message = payload;
    }
    this.socket.send(
      JSON.stringify({
        type: "chat",
        roomId: this.roomId,
        message: JSON.stringify(message),
      })
    );
  }

  // --- Resize Handling ---
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
      this.handleRectResize(shape, dx, dy, handle);
      if (shape.width < 0) {
        shape.x += shape.width;
        shape.width = Math.abs(shape.width);
      }
      if (shape.height < 0) {
        shape.y += shape.height;
        shape.height = Math.abs(shape.height);
      }
    } else if (shape.type === "text") {
      shape.x += dx;
      shape.y += dy;
    }
    payload.timestamp = Date.now();
    payload.function = "move";
    this.render();
  }

  private handleRectResize(shape: any, dx: number, dy: number, handle: string) {
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
  }

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
    let x, y, width, height;

    if (shape.shape.type === "rect") {
      ({ x, y, width, height } = shape.shape);
    } else if (shape.shape.type === "text") {
      const { x: textX, y: textY, text } = shape.shape;
      x = textX;
      y = textY;
      width = this.ctx.measureText(text).width;
      height = 20; // Assuming text height of 20px
    } else {
      return "";
    }

    // Check corners first (they take precedence)
    if (Math.abs(pos.x - x) <= handleSize && Math.abs(pos.y - y) <= handleSize)
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

    return "";
  }

  // --- Mouse Events ---
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

  private calculateShapeOffset(
    payload: Payload,
    pos: { x: number; y: number }
  ): { x: number; y: number } {
    if (!payload || !payload.shape) return { x: 0, y: 0 };

    const { shape } = payload;
    let offsetX = 0;
    let offsetY = 0;

    switch (shape.type) {
      case "ellipse":
        offsetX = pos.x - shape.x;
        offsetY = pos.y - shape.y;
        break;
      case "rect":
      case "line":
      case "text":
        offsetX = pos.x - shape.x;
        offsetY = pos.y - shape.y;
        break;
      case "pencil":
        if (shape.points && shape.points.length > 0) {
          offsetX = pos.x - shape.points[0]!.x;
          offsetY = pos.y - shape.points[0]!.y;
        }
        break;
    }

    return { x: offsetX, y: offsetY };
  }

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
        // Check if shift key is pressed for multi-select
        const isShiftPressed = e.shiftKey;
        const selectedShape = this.findShapeAtPosition(pos);

        // Check if clicking on a resize handle of the currently selected shape
        if (this.selection.selectedShape) {
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

        // Check if clicking on any of the already selected shapes
        const clickedOnSelectedShape =
          selectedShape &&
          (selectedShape === this.selection.selectedShape ||
            this.selection.selectedShapes.some(
              (s) => s.id === selectedShape.id
            ));

        if (selectedShape && clickedOnSelectedShape) {
          // Calculate drag offsets based on shape type
          if (selectedShape.shape.type === "ellipse") {
            dragOffsetX = pos.x - selectedShape.shape.x;
            dragOffsetY = pos.y - selectedShape.shape.y;
          } else if (
            selectedShape.shape.type === "rect" ||
            selectedShape.shape.type === "line" ||
            selectedShape.shape.type === "text"
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

          // Store original positions before dragging
          this.originalPositions.clear();
          this.selection.selectedShapes.forEach((shape) => {
            this.originalPositions.set(shape.id, this.getShapePosition(shape));
          });

          // Keep existing selection and just update drag state
          this.selection.isDragging = true;
          this.selection.dragOffsetX = dragOffsetX;
          this.selection.dragOffsetY = dragOffsetY;
          this.selection.startX = pos.x;
          this.selection.startY = pos.y;

          // Store individual offsets for each selected shape
          this.selection.shapeOffsets.clear();
          this.selection.selectedShapes.forEach((shape) => {
            const offset = this.calculateShapeOffset(shape, pos);
            this.selection.shapeOffsets.set(shape.id, offset);
          });

          this.canvas.style.cursor = "move";
        } else {
          // Start a new selection
          if (!isShiftPressed) {
            // Clear previous selection if shift is not pressed
            this.selection.selectedShapes = [];
          }

          if (selectedShape) {
            // Single shape selection
            if (selectedShape.shape.type === "ellipse") {
              dragOffsetX = pos.x - selectedShape.shape.x;
              dragOffsetY = pos.y - selectedShape.shape.y;
            } else if (
              selectedShape.shape.type === "rect" ||
              selectedShape.shape.type === "line" ||
              selectedShape.shape.type === "text"
            ) {
              dragOffsetX = pos.x - selectedShape.shape.x;
              dragOffsetY = pos.y - selectedShape.shape.y;
            } else if (
              selectedShape.shape.type === "pencil" &&
              selectedShape.shape.points &&
              selectedShape.shape.points.length > 0
            ) {
              dragOffsetX = pos.x - selectedShape.shape.points[0]!.x;
              dragOffsetY = pos.y - selectedShape.shape.points[0]!.y;
            }

            // Add to selection if shift is pressed, otherwise make it the only selection
            if (isShiftPressed) {
              // Toggle selection with shift
              const existingIndex = this.selection.selectedShapes.findIndex(
                (s) => s.id === selectedShape.id
              );
              if (existingIndex >= 0) {
                this.selection.selectedShapes.splice(existingIndex, 1);
              } else {
                this.selection.selectedShapes.push(selectedShape);
              }
            } else {
              this.selection.selectedShapes = [selectedShape];
            }

            // Store original positions before dragging
            this.originalPositions.clear();
            this.selection.selectedShapes.forEach((shape) => {
              this.originalPositions.set(shape.id, this.getShapePosition(shape));
            });

            this.selection.selectedShape = selectedShape;
            this.selection.isDragging = true;

            // Store individual offsets for each selected shape
            this.selection.shapeOffsets.clear();
            this.selection.selectedShapes.forEach((shape) => {
              const offset = this.calculateShapeOffset(shape, pos);
              this.selection.shapeOffsets.set(shape.id, offset);
            });

            this.canvas.style.cursor = "move";
          } else {
            // Start a box selection
            this.selection.isMultiSelect = true;
            this.selection.selectedShape = undefined;
            this.canvas.style.cursor = "crosshair";
          }

          this.selection.active = true;
          this.selection.startX = pos.x;
          this.selection.startY = pos.y;
          this.selection.dragOffsetX = dragOffsetX;
          this.selection.dragOffsetY = dragOffsetY;
          this.selection.isResizing = false;
          this.selection.resizeHandle = "";
        }
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
    // Store mouse position globally for selection box drawing
    window.mouseX = e.clientX;
    window.mouseY = e.clientY;

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
    } else if (this.selectedTool === Tools.Select && this.selection.active) {
      if (this.selection.isMultiSelect) {
        // We're doing a box selection, just need to update the render
        this.render();
      } else if (this.selection.selectedShape && this.selection.isResizing) {
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
        // Move primary selected shape
        if (this.selection.selectedShape) {
          const offset = this.selection.shapeOffsets.get(
            this.selection.selectedShape.id
          ) || { x: this.selection.dragOffsetX, y: this.selection.dragOffsetY };
          this.moveShape(
            this.selection.selectedShape,
            pos.x - offset.x,
            pos.y - offset.y
          );
        }

        // Move all other shapes in the selection group with their individual offsets
        this.selection.selectedShapes.forEach((shape) => {
          if (shape !== this.selection.selectedShape) {
            const offset = this.selection.shapeOffsets.get(shape.id) || {
              x: this.selection.dragOffsetX,
              y: this.selection.dragOffsetY,
            };
            this.moveShape(shape, pos.x - offset.x, pos.y - offset.y);
          }
        });
      } else if (this.selection.selectedShape) {
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

  private onMouseUp = (e: MouseEvent) => {
    const pos = this.getMousePos(e);

    switch (this.selectedTool) {
      case Tools.Hand:
        this.canvasDrag.active = false;
        this.canvas.style.cursor = "grab";
        this.onStopInteracting();
        break;

      case Tools.Text:
        // Do nothing on mouse up for text tool
        // text finalization in onMouseDown at next click
        break;

      case Tools.Select:
        if (this.selection.isMultiSelect) {
          // Finalize box selection
          const startX = Math.min(this.selection.startX, pos.x);
          const startY = Math.min(this.selection.startY, pos.y);
          const endX = Math.max(this.selection.startX, pos.x);
          const endY = Math.max(this.selection.startY, pos.y);

          // Find all shapes within the selection box
          const selectedShapes = this.tempShapes.filter((shape) => {
            return this.isShapeInSelectionBox(
              shape,
              startX,
              startY,
              endX,
              endY
            );
          });

          if (selectedShapes.length > 0) {
            this.selection.selectedShapes = selectedShapes;
            this.selection.selectedShape = selectedShapes[0];
          }

          this.selection.isMultiSelect = false;
        } else if (this.selection.isResizing && this.selection.selectedShape) {
          this.addToHistory({
            type: "move",
            payload: this.selection.selectedShape,
            oldPosition: { x: 0, y: 0 },
            newPosition: { x: 0, y: 0 },
          });
        } else if (this.selection.isDragging) {
          // Handle history for all selected shapes
          this.selection.selectedShapes.forEach((shape) => {
            const oldPos = this.originalPositions.get(shape.id) || { x: 0, y: 0 };
            const newPos = this.getShapePosition(shape);
            this.addToHistory({
              type: "move",
              payload: shape,
              oldPosition: oldPos,
              newPosition: newPos,
            });
          });
          this.originalPositions.clear();
        }

        this.selection.isDragging = false;
        this.selection.isResizing = false;
        this.originalPositions.clear();
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

  // --- Event Handlers ---
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const pos = this.getMousePos(e);
    if (e.ctrlKey) {
      const delta = e.deltaY > 0 ? 0.95 : 1.05;
      const newScale = this.target.scale * delta;
      this.target.scale = Math.min(Math.max(newScale, 0.1), 5);
      const mouseX = e.clientX - this.canvas.getBoundingClientRect().left;
      const mouseY = e.clientY - this.canvas.getBoundingClientRect().top;
      const prevWorldX = (mouseX - this.current.x) / this.current.scale;
      const prevWorldY = (mouseY - this.current.y) / this.current.scale;
      const newWorldX = (mouseX - this.target.x) / this.target.scale;
      const newWorldY = (mouseY - this.target.y) / this.target.scale;
      this.target.x += (newWorldX - prevWorldX) * this.target.scale;
      this.target.y += (newWorldY - prevWorldY) * this.target.scale;
    } else {
      this.target.y += -e.deltaY;
      this.target.x += -e.deltaX;
      this.target.scale = this.current.scale;
    }
    this.animate();
  };

  private animate = () => {
    const lerp = (a: number, b: number) => a + (b - a) * 0.25;
    this.current.scale = lerp(this.current.scale, this.target.scale);
    this.current.x = lerp(this.current.x, this.target.x);
    this.current.y = lerp(this.current.y, this.target.y);
    this.render();
    const dx = Math.abs(this.current.x - this.target.x);
    const dy = Math.abs(this.current.y - this.target.y);
    const ds = Math.abs(this.current.scale - this.target.scale);
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

  private eraseShape(tempShape: Payload) {
    const index = this.tempShapes.indexOf(tempShape);
    if (index !== -1) {
      this.addToHistory({
        type: "erase",
        payload: tempShape,
      });
      this.tempShapes.splice(index, 1);
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

  private isShapeInSelectionBox(
    payload: Payload,
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): boolean {
    if (!payload || !payload.shape) return false;
    const { shape } = payload;
    switch (shape.type) {
      case "rect":
        return (
          shape.x >= startX &&
          shape.x + shape.width <= endX &&
          shape.y >= startY &&
          shape.y + shape.height <= endY
        );
      case "ellipse":
        return (
          shape.x - shape.rx >= startX &&
          shape.x + shape.rx <= endX &&
          shape.y - shape.ry >= startY &&
          shape.y + shape.ry <= endY
        );
      case "line":
        return (
          shape.x >= startX &&
          shape.x <= endX &&
          shape.y >= startY &&
          shape.y <= endY &&
          shape.x2 >= startX &&
          shape.x2 <= endX &&
          shape.y2 >= startY &&
          shape.y2 <= endY
        );
      case "pencil":
        if (!shape.points || shape.points.length === 0) return false;
        for (const point of shape.points) {
          if (
            point.x < startX ||
            point.x > endX ||
            point.y < startY ||
            point.y > endY
          ) {
            return false;
          }
        }
        return true;
      case "text": {
        const text = shape.text || "";
        const lines = text.split("\n");
        const lineHeight = 24;
        let maxWidth = 0;
        lines.forEach((line: string) => {
          const width = this.ctx.measureText(line).width;
          maxWidth = Math.max(maxWidth, width);
        });
        const textHeight = lines.length * lineHeight;
        return (
          shape.x >= startX &&
          shape.x + maxWidth <= endX &&
          shape.y >= startY &&
          shape.y + textHeight <= endY
        );
      }
      default:
        return false;
    }
  }

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
      case Tools.Ellipse:
        return {
          type: "ellipse",
          x: (startX + lastX) / 2,
          y: (startY + lastY) / 2,
          rx: Math.abs(lastX - startX) / 2,
          ry: Math.abs(lastY - startY) / 2,
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

  // --- Rendering ---
  private drawShape(tempShape: Payload): void {
    if (tempShape.function === "draw" || tempShape.function === "move") {
      const { shape } = tempShape;

      switch (shape.type) {
        case "rect":
          this.ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
          break;
        case "ellipse":
          this.ctx.beginPath();
          this.ctx.ellipse(
            shape.x,
            shape.y,
            shape.rx,
            shape.ry,
            0,
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
          this.ctx.font = "20px sans-serif";
          this.ctx.textBaseline = "top";
          this.ctx.textAlign = "left";

          // Handle multiline text
          const text = shape.text || "";
          const lines = text.split("\n");
          const lineHeight = 24; // 24px line height

          // Calculate max width for selection box
          let maxWidth = 0;
          lines.forEach((line) => {
            const width = this.ctx.measureText(line).width;
            maxWidth = Math.max(maxWidth, width);
          });

          // Draw each line of text
          lines.forEach((line, index) => {
            this.ctx.fillText(line, shape.x, shape.y + index * lineHeight);
          });
          break;
      }
    }
  }

  private render() {
    const { width, height } = this.canvas;

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, width, height);

    this.ctx.translate(this.current.x, this.current.y);
    this.ctx.scale(this.current.scale, this.current.scale);

    // Draw existing shapes
    // console.log("tempshapes", this.tempShapes);

    // Track shapes that will be drawn by the selection box logic
    const shapesInSelectionBox = new Set<string>();

    // If in multi-select mode, identify shapes in the selection box
    if (
      this.selectedTool === Tools.Select &&
      this.selection.active &&
      this.selection.isMultiSelect
    ) {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = (window.mouseX || 0) - rect.left;
      const mouseY = (window.mouseY || 0) - rect.top;
      const mousePos = {
        x: (mouseX - this.current.x) / this.current.scale,
        y: (mouseY - this.current.y) / this.current.scale,
      };

      const startX = Math.min(this.selection.startX, mousePos.x);
      const startY = Math.min(this.selection.startY, mousePos.y);
      const width = Math.abs(mousePos.x - this.selection.startX);
      const height = Math.abs(mousePos.y - this.selection.startY);

      this.tempShapes.forEach((shape) => {
        if (
          this.isShapeInSelectionBox(
            shape,
            startX,
            startY,
            startX + width,
            startY + height
          )
        ) {
          shapesInSelectionBox.add(shape.id);
        }
      });
    }

    this.tempShapes.forEach((tempShape) => {
      // Skip if this shape will be drawn by the selection box logic
      if (shapesInSelectionBox.has(tempShape.id)) return;

      this.ctx.lineWidth = 1.5;
      const isSelected =
        tempShape.shape === this.selection.selectedShape?.shape ||
        this.selection.selectedShapes.some((s) => s.id === tempShape.id);
      this.ctx.strokeStyle = isSelected ? "blue" : "white";

      // For text, set the fill style based on selection
      if (tempShape.shape?.type === "text") {
        const isTextSelected =
          tempShape.shape === this.selection.selectedShape?.shape ||
          this.selection.selectedShapes.some((s) => s.id === tempShape.id);
        this.ctx.fillStyle = isTextSelected ? "blue" : "white";
      }

      this.drawShape(tempShape);
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
          case "ellipse":
            this.ctx.beginPath();
            this.ctx.ellipse(
              shape.x,
              shape.y,
              shape.rx,
              shape.ry,
              0,
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
            this.ctx.fillStyle = "white";
            this.ctx.font = "20px sans-serif";
            this.ctx.textBaseline = "top";
            this.ctx.textAlign = "left";

            // Handle multiline text
            const text = shape.text || "";
            const lines = text.split("\n");
            lines.forEach((line, index) => {
              this.ctx.fillText(line, shape.x, shape.y + index * 24); // 24px line height
            });
        }
      }
    }

    // Draw current text input if active
    if (this.textArea && this.selectedTool === Tools.Text) {
      const x = parseFloat(this.textArea.dataset.x || "0");
      const y = parseFloat(this.textArea.dataset.y || "0");
      const text = this.textArea.value || "";
      const lines = text.split("\n");
      const lineHeight = 24; // 24px line height

      this.ctx.fillStyle = "white";
      this.ctx.font = "20px sans-serif";
      this.ctx.textBaseline = "top";
      this.ctx.textAlign = "left";

      // Draw each line of text
      lines.forEach((line, index) => {
        this.ctx.fillText(line, x, y + index * lineHeight);
      });

      // Draw blinking cursor at the end of the last line
      const now = Date.now();
      if (Math.floor(now / 500) % 2 === 0) {
        const lastLine = lines[lines.length - 1] || "";
        const lastLineWidth = this.ctx.measureText(lastLine).width;
        const cursorY = y + (lines.length - 1) * lineHeight;
        this.ctx.fillRect(x + lastLineWidth, cursorY, 1, 20);
      }

      // Request animation frame to keep cursor blinking
      requestAnimationFrame(this.animate);
    }

    // Draw selection box if in multi-select mode
    if (
      this.selectedTool === Tools.Select &&
      this.selection.active &&
      this.selection.isMultiSelect
    ) {
      // Get current mouse position for drawing the selection box
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = (window.mouseX || 0) - rect.left;
      const mouseY = (window.mouseY || 0) - rect.top;
      const mousePos = {
        x: (mouseX - this.current.x) / this.current.scale,
        y: (mouseY - this.current.y) / this.current.scale,
      };

      // Calculate selection box coordinates
      const startX = Math.min(this.selection.startX, mousePos.x);
      const startY = Math.min(this.selection.startY, mousePos.y);
      const width = Math.abs(mousePos.x - this.selection.startX);
      const height = Math.abs(mousePos.y - this.selection.startY);

      // Temporarily change stroke style of elements inside the selection box to blue
      this.tempShapes.forEach((tempShape) => {
        if (tempShape.function === "draw" || tempShape.function === "move") {
          if (
            this.isShapeInSelectionBox(
              tempShape,
              startX,
              startY,
              startX + width,
              startY + height
            )
          ) {
            // Set the stroke style to blue for elements inside the selection box
            this.ctx.strokeStyle = "blue";

            // Also set text color to blue if it's a text element
            if (tempShape.shape?.type === "text") {
              this.ctx.fillStyle = "blue";
            }

            this.drawShape(tempShape);
          }
        }
      });

      // Draw dashed selection box
      this.ctx.setLineDash([5, 5]);
      this.ctx.strokeStyle = "white";
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(startX, startY, width, height);
      this.ctx.setLineDash([]);
    }
  }

  // --- Keyboard Events ---
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

  // --- Text Area Handling ---
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

    // Set textarea styles - make it invisible but allow multiline input
    this.textArea.style.left = `${screenX}px`;
    this.textArea.style.top = `${screenY}px`;
    this.textArea.style.opacity = "0";
    this.textArea.style.pointerEvents = "auto";
    this.textArea.style.width = "300px"; // Give it width for multiline support
    this.textArea.style.height = "100px"; // Give it height for multiline support
    this.textArea.style.zIndex = "9999";

    // Adjust y position to center the text (subtract half of line height)
    const adjustedY = y - 8; // Half of the 24px line height

    // Store the world coordinates for later use
    this.textArea.dataset.x = x.toString();
    this.textArea.dataset.y = adjustedY.toString();

    // Add event listeners
    this.textArea.addEventListener("blur", this.handleTextAreaBlur);
    this.textArea.addEventListener("keydown", this.handleTextAreaKeyDown);
    this.textArea.addEventListener("input", this.handleTextAreaInput);

    // Add to DOM and focus
    document.body.appendChild(this.textArea);
    setTimeout(() => this.textArea?.focus(), 0);
  }

  private handleTextAreaBlur = (): void => {
    // Finalize text input when clicking away
    this.finalizeTextInput();
  };

  private handleTextAreaKeyDown = (e: KeyboardEvent): void => {
    // Allow Enter for new lines (don't prevent default)

    // Cancel on Escape
    if (e.key === "Escape") {
      e.preventDefault();
      this.removeTextArea();
      this.onStopInteracting();
    }

    // Stop propagation to prevent canvas shortcuts
    e.stopPropagation();
  };

  private handleTextAreaInput = (): void => {
    if (this.textArea) {
      this.render();
    }
  };

  private finalizeTextInput(): void {
    if (!this.textArea) return;

    const text = this.textArea.value;
    if (text) {
      const x = parseFloat(this.textArea.dataset.x || "0");
      const y = parseFloat(this.textArea.dataset.y || "0");

      // Create text shape
      const shape: Shapes = {
        type: "text",
        x,
        y,
        text,
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

  // --- Helper Methods ---
  private getShapePosition(payload: Payload): { x: number; y: number } {
    const { shape } = payload;
    switch (shape.type) {
      case "rect":
      case "line":
      case "text":
      case "ellipse":
        return { x: shape.x, y: shape.y };
      case "pencil":
        return shape.points?.[0] ? { x: shape.points[0].x, y: shape.points[0].y } : { x: 0, y: 0 };
      default:
        return { x: 0, y: 0 };
    }
  }

  private findShapeAtPosition(pos: { x: number; y: number }): Payload | undefined {
    // First check if any currently selected shape is at this position
    for (const selectedShape of this.selection.selectedShapes) {
      if (this.isPointInShape(pos, selectedShape)) {
        return selectedShape;
      }
    }
    // If no selected shape is at this position, find all other shapes
    const shapesAtPosition: Payload[] = [];
    for (let i = this.tempShapes.length - 1; i >= 0; i--) {
      const shape = this.tempShapes[i];
      if (!shape || !shape.shape) continue;
      if (this.selection.selectedShapes.some((s) => s.id === shape.id)) {
        continue;
      }
      if (this.isPointInShape(pos, shape)) {
        shapesAtPosition.push(shape);
      }
    }
    if (shapesAtPosition.length === 0) {
      this.lastSelectedShapeIndex = -1;
      return undefined;
    }
    const currentIndex =
      this.lastSelectedShapeIndex >= 0 &&
      this.lastSelectedShapeIndex < shapesAtPosition.length
        ? this.lastSelectedShapeIndex
        : -1;
    this.lastSelectedShapeIndex = (currentIndex + 1) % shapesAtPosition.length;
    return shapesAtPosition[this.lastSelectedShapeIndex];
  }

  private isPointInShape(point: { x: number; y: number }, payload: Payload): boolean {
    if (!payload || !payload.shape) return false;
    const { shape } = payload;
    const strokeWidth = 7; // Adjust as needed for hit detection
    switch (shape.type) {
      case "rect": {
        const nearLeft = Math.abs(point.x - shape.x) <= strokeWidth;
        const nearRight = Math.abs(point.x - (shape.x + shape.width)) <= strokeWidth;
        const nearTop = Math.abs(point.y - shape.y) <= strokeWidth;
        const nearBottom = Math.abs(point.y - (shape.y + shape.height)) <= strokeWidth;
        const withinX = point.x >= shape.x && point.x <= shape.x + shape.width;
        const withinY = point.y >= shape.y && point.y <= shape.y + shape.height;
        return (
          ((nearLeft || nearRight) && withinY) ||
          ((nearTop || nearBottom) && withinX)
        );
      }
      case "ellipse": {
        // Hit test for ellipse border (approximate)
        const dx = (point.x - shape.x) / (shape.rx || 1);
        const dy = (point.y - shape.y) / (shape.ry || 1);
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Consider a hit if close to the border (within strokeWidth in normalized space)
        return Math.abs(dist - 1) * Math.max(shape.rx, shape.ry) <= strokeWidth;
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
            ((point.x - shape.x) * dx + (point.y - shape.y) * dy) / (length * length)
          )
        );
        const projX = shape.x + t * dx;
        const projY = shape.y + t * dy;
        return Math.hypot(point.x - projX, point.y - projY) <= strokeWidth;
      }
      case "pencil": {
        for (let i = 1; i < shape.points.length; i++) {
          const p1 = shape.points[i - 1];
          const p2 = shape.points[i];
          if (!p1 || !p2) continue;
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const length = Math.sqrt(dx * dx + dy * dy);
          if (length === 0) continue;
          const t = Math.max(
            0,
            Math.min(
              1,
              ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / (length * length)
            )
          );
          const projX = p1.x + t * dx;
          const projY = p1.y + t * dy;
          if (Math.hypot(point.x - projX, point.y - projY) <= strokeWidth) {
            return true;
          }
        }
        return false;
      }
      case "text": {
        const text = shape.text || "";
        const lines = text.split("\n");
        const lineHeight = 24;
        let maxWidth = 0;
        lines.forEach((line: string) => {
          const width = this.ctx.measureText(line).width;
          maxWidth = Math.max(maxWidth, width);
        });
        const textHeight = lines.length * lineHeight;
        return (
          point.x >= shape.x &&
          point.x <= shape.x + maxWidth &&
          point.y >= shape.y &&
          point.y <= shape.y + textHeight
        );
      }
    }
    return false;
  }

  cleanup() {
    cancelAnimationFrame(this.frame);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    this.canvas.removeEventListener("mousemove", this.onMouseMove);
    this.canvas.removeEventListener("mouseup", this.onMouseUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    document.removeEventListener("keydown", this.onKeyDown);
    // Remove touch events
    this.canvas.removeEventListener("touchstart", this.onTouchStart);
    this.canvas.removeEventListener("touchmove", this.onTouchMove);
    this.canvas.removeEventListener("touchend", this.onTouchEnd);
    this.removeTextArea();
  }

  public recenterCanvas() {
    this.target.x = 0;
    this.target.y = 0;
    this.target.scale = 1;
    this.animate();
  }

  private onTouchStart = (e: TouchEvent) => {
    if (e.touches.length > 1) return; // Only single touch for now
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    const mouseEvent = new MouseEvent("mousedown", {
      clientX: touch.clientX,
      clientY: touch.clientY,
      button: 0,
      bubbles: true,
      cancelable: true,
    });
    this.canvas.dispatchEvent(mouseEvent);
  };

  private onTouchMove = (e: TouchEvent) => {
    if (e.touches.length > 1) return;
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    const mouseEvent = new MouseEvent("mousemove", {
      clientX: touch.clientX,
      clientY: touch.clientY,
      button: 0,
      bubbles: true,
      cancelable: true,
    });
    this.canvas.dispatchEvent(mouseEvent);
  };

  private onTouchEnd = (e: TouchEvent) => {
    e.preventDefault();
    const lastTouch = e.changedTouches[0];
    const mouseEvent = new MouseEvent("mouseup", {
      clientX: lastTouch?.clientX || 0,
      clientY: lastTouch?.clientY || 0,
      button: 0,
      bubbles: true,
      cancelable: true,
    });
    this.canvas.dispatchEvent(mouseEvent);
  };
}

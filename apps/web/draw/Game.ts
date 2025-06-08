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
    this.resizeObserver = new ResizeObserver(this.resizeCanvas);
    this.resizeObserver.observe(canvas);

    this.init();
    this.initSocket();
    this.initEvents();
  }

  public setTool(tool: Tools): void {
    // Finalize text if we're switching from text tool
    if (this.selectedTool === Tools.Text && this.textArea) {
      this.finalizeTextInput();
    }

    this.selectedTool = tool;

    // Update cursor based on selected tool
    this.canvas.style.cursor = tool === Tools.Hand ? "grab" : "crosshair";

    if (tool !== Tools.Select) {
      this.selection.selectedShape = undefined;
      this.selection.selectedShapes = [];
      this.selection.isMultiSelect = false;
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

          switch (message.function) {
            case "erase":
              console.log("erase shape with ID:", message.id);
              this.tempShapes = this.tempShapes.filter(
                (shape) => shape.id !== message.id
              );
              break;
            case "draw":
              if (!this.tempShapes.some((shape) => shape.id === message.id)) {
                console.log("drawing new shape:", message);
                this.tempShapes.push(message);
              }
              break;
            case "move":
              const shapeToMove = this.tempShapes.findIndex(
                (s) => s.id === message.id
              );
              if (shapeToMove !== -1 && message.shape) {
                this.tempShapes[shapeToMove]!.shape = message.shape;
              }
              break;
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
    } else if (shape.type === "text") {
      // For text, we only allow moving it, not resizing
      // Just update the position
      switch (handle) {
        case "nw":
        case "n":
        case "ne":
        case "e":
        case "se":
        case "s":
        case "sw":
        case "w":
          shape.x += dx;
          shape.y += dy;
          break;
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
  private calculateShapeOffset(
    payload: Payload,
    pos: { x: number; y: number }
  ): { x: number; y: number } {
    if (!payload || !payload.shape) return { x: 0, y: 0 };

    const { shape } = payload;
    let offsetX = 0;
    let offsetY = 0;

    switch (shape.type) {
      case "circle":
        offsetX = pos.x - shape.centerX;
        offsetY = pos.y - shape.centerY;
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
          if (selectedShape.shape.type === "circle") {
            dragOffsetX = pos.x - selectedShape.shape.centerX;
            dragOffsetY = pos.y - selectedShape.shape.centerY;
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
            if (selectedShape.shape.type === "circle") {
              dragOffsetX = pos.x - selectedShape.shape.centerX;
              dragOffsetY = pos.y - selectedShape.shape.centerY;
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
        } else if (this.selection.isDragging) {
          // Handle history for the primary selected shape
          if (this.selection.selectedShape) {
            let oldPosition = { x: 0, y: 0 };

            // Get the old position based on shape type
            const shape = this.selection.selectedShape.shape;
            if (shape.type === "circle") {
              oldPosition = { x: shape.centerX, y: shape.centerY };
            } else if (
              shape.type === "rect" ||
              shape.type === "line" ||
              shape.type === "text"
            ) {
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

          // Handle history for all other selected shapes
          this.selection.selectedShapes.forEach((shape) => {
            if (shape !== this.selection.selectedShape) {
              let oldPosition = { x: 0, y: 0 };

              if (shape.shape.type === "circle") {
                oldPosition = {
                  x: shape.shape.centerX,
                  y: shape.shape.centerY,
                };
              } else if (
                shape.shape.type === "rect" ||
                shape.shape.type === "line" ||
                shape.shape.type === "text"
              ) {
                oldPosition = { x: shape.shape.x, y: shape.shape.y };
              } else if (
                shape.shape.type === "pencil" &&
                shape.shape.points &&
                shape.shape.points.length > 0
              ) {
                oldPosition = {
                  x: shape.shape.points[0]!.x,
                  y: shape.shape.points[0]!.y,
                };
              }

              const newPosition = {
                x: oldPosition.x + (this.selection.dragOffsetX || 0),
                y: oldPosition.y + (this.selection.dragOffsetY || 0),
              };

              this.addToHistory({
                type: "move",
                payload: shape,
                oldPosition,
                newPosition,
              });

              this.socket.send(
                JSON.stringify({
                  type: "chat",
                  roomId: this.roomId,
                  message: JSON.stringify(shape),
                })
              );
            }
          });
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
        // Handle multiline text
        const text = shape.text || "";
        const lines = text.split("\n");
        const lineHeight = 24; // 24px line height

        // Calculate max width for bounding box
        let maxWidth = 0;
        lines.forEach((line) => {
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

      case "text": {
        oldPosition = { x: shape.x, y: shape.y };
        shape.x = x;
        shape.y = y;
        break;
      }
    }
    this.animate();
    // Update timestamp
    payload.timestamp = Date.now();
    payload.function = "move"; // Ensure it's marked as a move action
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
      case "rect": {
        // Check if any corner of the rectangle is inside the selection box
        const corners = [
          { x: shape.x, y: shape.y },
          { x: shape.x + shape.width, y: shape.y },
          { x: shape.x, y: shape.y + shape.height },
          { x: shape.x + shape.width, y: shape.y + shape.height },
        ];

        // Check if any corner is inside the selection box
        for (const corner of corners) {
          if (
            corner.x >= startX &&
            corner.x <= endX &&
            corner.y >= startY &&
            corner.y <= endY
          ) {
            return true;
          }
        }

        // Also check if the selection box is completely inside the rectangle
        if (
          startX >= shape.x &&
          endX <= shape.x + shape.width &&
          startY >= shape.y &&
          endY <= shape.y + shape.height
        ) {
          return true;
        }

        return false;
      }

      case "circle": {
        // Check if the center is inside the selection box
        if (
          shape.centerX >= startX &&
          shape.centerX <= endX &&
          shape.centerY >= startY &&
          shape.centerY <= endY
        ) {
          return true;
        }

        // Check if any point on the circle intersects with the selection box
        // This is a simplified check - just checking if the circle intersects with the box edges
        const closestX = Math.max(startX, Math.min(shape.centerX, endX));
        const closestY = Math.max(startY, Math.min(shape.centerY, endY));
        const distanceX = shape.centerX - closestX;
        const distanceY = shape.centerY - closestY;

        return (
          distanceX * distanceX + distanceY * distanceY <=
          shape.radius * shape.radius
        );
      }

      case "line": {
        // Check if either endpoint is inside the selection box
        if (
          (shape.x >= startX &&
            shape.x <= endX &&
            shape.y >= startY &&
            shape.y <= endY) ||
          (shape.x2 >= startX &&
            shape.x2 <= endX &&
            shape.y2 >= startY &&
            shape.y2 <= endY)
        ) {
          return true;
        }

        // Check if the line intersects with any of the selection box edges
        // Line-line intersection check with the four edges of the selection box
        const lines = [
          { x1: startX, y1: startY, x2: endX, y2: startY }, // Top edge
          { x1: endX, y1: startY, x2: endX, y2: endY }, // Right edge
          { x1: endX, y1: endY, x2: startX, y2: endY }, // Bottom edge
          { x1: startX, y1: endY, x2: startX, y2: startY }, // Left edge
        ];

        for (const line of lines) {
          if (
            this.doLinesIntersect(
              shape.x,
              shape.y,
              shape.x2,
              shape.y2,
              line.x1,
              line.y1,
              line.x2,
              line.y2
            )
          ) {
            return true;
          }
        }

        return false;
      }

      case "pencil": {
        if (!shape.points || shape.points.length === 0) return false;

        // Check if any point is inside the selection box
        for (const point of shape.points) {
          if (
            point.x >= startX &&
            point.x <= endX &&
            point.y >= startY &&
            point.y <= endY
          ) {
            return true;
          }
        }

        // Check if any line segment intersects with the selection box edges
        const lines = [
          { x1: startX, y1: startY, x2: endX, y2: startY }, // Top edge
          { x1: endX, y1: startY, x2: endX, y2: endY }, // Right edge
          { x1: endX, y1: endY, x2: startX, y2: endY }, // Bottom edge
          { x1: startX, y1: endY, x2: startX, y2: startY }, // Left edge
        ];

        for (let i = 1; i < shape.points.length; i++) {
          const p1 = shape.points[i - 1]!;
          const p2 = shape.points[i]!;

          for (const line of lines) {
            if (
              this.doLinesIntersect(
                p1.x,
                p1.y,
                p2.x,
                p2.y,
                line.x1,
                line.y1,
                line.x2,
                line.y2
              )
            ) {
              return true;
            }
          }
        }

        return false;
      }

      case "text": {
        // For text, check if the bounding box intersects with the selection box
        const text = shape.text || "";
        const lines = text.split("\n");
        const lineHeight = 24; // 24px line height

        // Calculate max width for bounding box
        let maxWidth = 0;
        lines.forEach((line) => {
          const width = this.ctx.measureText(line).width;
          maxWidth = Math.max(maxWidth, width);
        });

        const textHeight = lines.length * lineHeight;

        // Check if any corner of the text box is inside the selection box
        const corners = [
          { x: shape.x, y: shape.y },
          { x: shape.x + maxWidth, y: shape.y },
          { x: shape.x, y: shape.y + textHeight },
          { x: shape.x + maxWidth, y: shape.y + textHeight },
        ];

        for (const corner of corners) {
          if (
            corner.x >= startX &&
            corner.x <= endX &&
            corner.y >= startY &&
            corner.y <= endY
          ) {
            return true;
          }
        }

        // Also check if the selection box is completely inside the text box
        if (
          startX >= shape.x &&
          endX <= shape.x + maxWidth &&
          startY >= shape.y &&
          endY <= shape.y + textHeight
        ) {
          return true;
        }

        return false;
      }

      default:
        return false;
    }
  }

  private doLinesIntersect(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    x4: number,
    y4: number
  ): boolean {
    // Calculate the direction of the lines
    const d1x = x2 - x1;
    const d1y = y2 - y1;
    const d2x = x4 - x3;
    const d2y = y4 - y3;

    // Calculate the determinant
    const det = d1x * d2y - d1y * d2x;

    // If determinant is zero, lines are parallel
    if (det === 0) return false;

    // Calculate the parameters for the intersection point
    const dx = x3 - x1;
    const dy = y3 - y1;

    const t1 = (dx * d2y - dy * d2x) / det;
    const t2 = (dx * d1y - dy * d1x) / det;

    // Check if the intersection point is within both line segments
    return t1 >= 0 && t1 <= 1 && t2 >= 0 && t2 <= 1;
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
          } else if (
            shape.type === "rect" ||
            shape.type === "line" ||
            shape.type === "text"
          ) {
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
          } else if (
            shape.type === "rect" ||
            shape.type === "line" ||
            shape.type === "text"
          ) {
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
    const message =
      action.type === "draw"
        ? action.payload
        : action.type === "erase"
          ? {
              function: "erase",
              id: action.payload.id,
              timestamp: Date.now(),
            }
          : {
              function: "move",
              id: action.payload.id,
              shape: action.payload.shape,
              timestamp: Date.now(),
            };

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

  private drawShape(tempShape: Payload): void {
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

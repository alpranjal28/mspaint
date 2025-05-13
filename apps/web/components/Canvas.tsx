import { useEffect, useRef, useState } from "react";
import { Game } from "../draw/Game";

export enum Tools {
  Rect = "rect",
  Circle = "circle",
  Pencil = "pencil",
  Line = "line",
  Select = "select",
  Eraser = "eraser",
}

export default function Canvas({
  roomId,
  socket,
}: {
  roomId: number;
  socket: WebSocket;
}) {
  // const roomId = params.roomId;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedTool, setSelectedTool] = useState<Tools>(Tools.Circle);
  const [game, setGame] = useState<Game>();
  const [windowDimensions, setWindowDimensions] = useState({
    width: 0,
    height: 0,
  });
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setWindowDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, [window.innerWidth, window.innerHeight]);

  useEffect(() => {
    if (game) {
      game.selectedTool = selectedTool;
    }
  }, [selectedTool, game]);

  useEffect(() => {
    if (canvasRef.current) {
      const g = new Game(
        canvasRef.current,
        roomId,
        socket,
        selectedTool,
        startDrawing,
        stopDrawing
      );
      setGame(g);

      return () => g.cleanup();
    }
  }, [canvasRef.current]);

  const startDrawing = () => setIsDrawing(true);
  const stopDrawing = () => setIsDrawing(false);

  function Dock() {
    return (
      <div
        className={`absolute top-0 left-0 right-0 flex justify-center items-center mt-4 ${isDrawing ? "pointer-events-none" : ""}`}
      >
        <div className="flex justify-center items-center gap-4 p-2 bg-slate-600 transition-all duration-500 select-none rounded-full">
          <div
            className={` border-2 border-black py-1 px-2 bg-red-300 rounded-full cursor-pointer hover:bg-red-500 transition-colors ${selectedTool === Tools.Line && "bg-red-400"}`}
            onClick={() => {
              setSelectedTool(Tools.Line);
            }}
          >
            line
          </div>
          <div
            className={`border-2 border-black py-1 px-2 bg-red-300 cursor-pointer hover:bg-red-500 transition-colors ${selectedTool === Tools.Rect && "bg-red-400"}`}
            onClick={() => {
              setSelectedTool(Tools.Rect);
            }}
          >
            rect
          </div>
          <div
            className={`border-2 border-black py-1 px-2 bg-red-300 rounded-full cursor-pointer hover:bg-red-500 transition-colors ${selectedTool === Tools.Circle && "bg-red-400"}`}
            onClick={() => {
              setSelectedTool(Tools.Circle);
            }}
          >
            circle
          </div>
          <div
            className={`border-2 border-black py-1 px-2 bg-red-300 rounded-full cursor-pointer hover:bg-red-500 transition-colors ${selectedTool === Tools.Select && "bg-red-400"}`}
            onClick={() => {
              setSelectedTool(Tools.Select);
            }}
          >
            Selection
          </div>
          <div
            className={`border-2 border-black py-1 px-2 bg-red-300 rounded-full cursor-pointer hover:bg-red-500 transition-colors ${selectedTool === Tools.Eraser && "bg-red-400"}`}
            onClick={() => {
              setSelectedTool(Tools.Eraser);
            }}
          >
            eraser
          </div>
        </div>

        {/* {JSON.stringify(selectedTool)} */}
      </div>
    );
  }

  function handleUndo() {
    game?.undo();
  }
  function handleRedo() {
    game?.redo();
  }

  function QuickActions() {
    return (
      <div
        className={`absolute bottom-0 right-0 flex justify-center items-center gap-4 p-2 m-4 rounded-full bg-slate-600 transition-all duration-500 select-none ${isDrawing ? "pointer-events-none" : ""}`}
      >
        <div
          className="menu-option border-2 border-black px-2 py-1 bg-red-300 rounded-full cursor-pointer hover:bg-red-500 transition-colors"
          onClick={handleUndo}
        >
          undo
        </div>
        <div
          className="border-2 border-black px-2 py-1 bg-red-300 rounded-full cursor-pointer hover:bg-red-500 transition-colors"
          onClick={handleRedo}
        >
          redo
        </div>
      </div>
    );
  }

  return (
    <main className="relative flex min-h-screen bg-gray-300">
      <canvas
        height={windowDimensions.height}
        ref={canvasRef}
        width={windowDimensions.width}
      ></canvas>
      <Dock />
      <QuickActions />
    </main>
  );
}

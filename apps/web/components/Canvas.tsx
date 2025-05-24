import { useEffect, useRef, useState } from "react";
import { Game } from "../draw/Game";

export enum Tools {
  Rect = "rect",
  Circle = "circle",
  Pencil = "pencil",
  Line = "line",
  Select = "select",
  Eraser = "eraser",
  Hand = "hand",
}

function MenuOption({
  children,
  onClick,
  isActive = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  isActive?: boolean;
}) {
  return (
    <div
      className={`border-2 border-black py-1 px-2 bg-red-300 rounded-full cursor-pointer hover:bg-red-500 transition-colors ${isActive ? "bg-red-400" : ""}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

export default function Canvas({
  roomId,
  socket,
}: {
  roomId: number;
  socket: WebSocket;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedTool, setSelectedTool] = useState<Tools>(Tools.Hand);
  const [game, setGame] = useState<Game>();
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (game) {
      game.setTool(selectedTool);
    }
  }, [selectedTool, game]);

  useEffect(() => {
    if (canvasRef.current) {
      const g = new Game(
        canvasRef.current,
        roomId,
        socket,
        selectedTool,
        () => setIsDrawing(true),
        () => setIsDrawing(false),
        () => setIsDragging(true),
        () => setIsDragging(false)
      );
      setGame(g);
      return () => g.cleanup();
    }
  }, [canvasRef.current, roomId, socket]);

  return (
    <main className="relative flex min-h-screen">
      <canvas
        height={window.innerHeight}
        ref={canvasRef}
        width={window.innerWidth}
      />

      {/* Tool Selection */}
      <div
        className={`fixed top-0 left-0 right-0 flex justify-center items-center mt-4 ${isDrawing || isDragging ? "pointer-events-none" : ""}`}
      >
        <div className="flex justify-center items-center gap-4 p-2 bg-slate-600 transition-all duration-500 select-none rounded-full">
          <MenuOption
            isActive={selectedTool === Tools.Hand}
            onClick={() => setSelectedTool(Tools.Hand)}
          >
            hand
          </MenuOption>
          <MenuOption
            isActive={selectedTool === Tools.Line}
            onClick={() => setSelectedTool(Tools.Line)}
          >
            line
          </MenuOption>
          <MenuOption
            isActive={selectedTool === Tools.Pencil}
            onClick={() => setSelectedTool(Tools.Pencil)}
          >
            pencil
          </MenuOption>
          <MenuOption
            isActive={selectedTool === Tools.Rect}
            onClick={() => setSelectedTool(Tools.Rect)}
          >
            rect
          </MenuOption>
          <MenuOption
            isActive={selectedTool === Tools.Circle}
            onClick={() => setSelectedTool(Tools.Circle)}
          >
            circle
          </MenuOption>
          <MenuOption
            isActive={selectedTool === Tools.Select}
            onClick={() => setSelectedTool(Tools.Select)}
          >
            Selection
          </MenuOption>
          <MenuOption
            isActive={selectedTool === Tools.Eraser}
            onClick={() => setSelectedTool(Tools.Eraser)}
          >
            eraser
          </MenuOption>
        </div>
      </div>

      {/* Quick Actions */}
      <div
        className={`fixed bottom-0 right-0 flex justify-center items-center gap-4 p-2 m-4 rounded-full bg-slate-600 transition-all duration-500 select-none ${isDrawing || isDragging ? "pointer-events-none" : ""}`}
      >
        <MenuOption onClick={() => game?.undo()}>undo</MenuOption>
        <MenuOption onClick={() => game?.recenterCanvas()}>recenter</MenuOption>
        <MenuOption onClick={() => game?.redo()}>redo</MenuOption>
      </div>
    </main>
  );
}

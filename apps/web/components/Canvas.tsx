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
  Text = "text",
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
      className={`px-4 py-2 rounded-lg cursor-pointer transition-all duration-200 text-sm font-medium
        ${
          isActive
            ? "bg-blue-600 text-white shadow-lg shadow-blue-500/25"
            : "text-gray-300 hover:bg-gray-700/50 hover:text-white"
        }`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

function Divider() {
  return <div className="w-px h-8 bg-gray-700/50" />;
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
  const [isInteracting, setIsInteracting] = useState(false);

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
        () => setIsInteracting(true),
        () => setIsInteracting(false)
      );
      setGame(g);
      return () => g.cleanup();
    }
  }, [canvasRef.current, roomId, socket]);

  return (
    <main className="relative flex min-h-screen bg-gradient-to-b from-gray-900 to-gray-800">
      <canvas
        height={window.innerHeight}
        ref={canvasRef}
        width={window.innerWidth}
        className="backdrop-blur-sm"
      />

      {/* Tool Selection */}
      <div
        className={`fixed top-0 left-0 right-0 flex justify-center items-center mt-6 
          ${isInteracting ? "pointer-events-none opacity-50" : "opacity-100"}
          transition-opacity duration-200`}
      >
        <div
          className="flex justify-center items-center gap-2 p-2 bg-gray-800/80 backdrop-blur-sm 
          shadow-2xl rounded-xl border border-gray-700/50"
        >
          <MenuOption
            isActive={selectedTool === Tools.Hand}
            onClick={() => setSelectedTool(Tools.Hand)}
          >
            ✋ Hand
          </MenuOption>
          <MenuOption
            isActive={selectedTool === Tools.Select}
            onClick={() => setSelectedTool(Tools.Select)}
          >
            ◻️ Select
          </MenuOption>
          <Divider />
          <MenuOption
            isActive={selectedTool === Tools.Text}
            onClick={() => setSelectedTool(Tools.Text)}
          >
            📝 Text
          </MenuOption>
          <MenuOption
            isActive={selectedTool === Tools.Line}
            onClick={() => setSelectedTool(Tools.Line)}
          >
            ➖ Line
          </MenuOption>
          <MenuOption
            isActive={selectedTool === Tools.Pencil}
            onClick={() => setSelectedTool(Tools.Pencil)}
          >
            ✏️ Pencil
          </MenuOption>
          <Divider />
          <MenuOption
            isActive={selectedTool === Tools.Rect}
            onClick={() => setSelectedTool(Tools.Rect)}
          >
            ⬜ Rectangle
          </MenuOption>
          <MenuOption
            isActive={selectedTool === Tools.Circle}
            onClick={() => setSelectedTool(Tools.Circle)}
          >
            ⭕ Circle
          </MenuOption>
          <Divider />
          <MenuOption
            isActive={selectedTool === Tools.Eraser}
            onClick={() => setSelectedTool(Tools.Eraser)}
          >
            🧹 Eraser
          </MenuOption>
        </div>
      </div>

      {/* Quick Actions */}
      <div
        className={`fixed bottom-0 right-0 flex justify-center items-center gap-2 p-2 m-6 
          rounded-xl bg-gray-800/80 backdrop-blur-sm shadow-2xl border border-gray-700/50
          ${isInteracting ? "pointer-events-none opacity-50" : "opacity-100"}
          transition-opacity duration-200`}
      >
        <MenuOption onClick={() => game?.undo()}>↩️ Undo</MenuOption>
        {/* <MenuOption onClick={() => game?.recenterCanvas()}>⌘ center</MenuOption> */}
        <MenuOption onClick={() => game?.redo()}>↪️ Redo</MenuOption>
      </div>
    </main>
  );
}

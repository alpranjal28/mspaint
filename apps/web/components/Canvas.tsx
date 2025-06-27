import { useEffect, useRef, useState } from "react";
import { Game } from "../draw/Game";

export enum Tools {
  Rect = "rect",
  Ellipse = "ellipse",
  Pencil = "pencil",
  Line = "line",
  Interact = "interact",
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
        className="backdrop-blur-sm touch-none w-full h-full"
        style={{ touchAction: "none" }}
      />

      {/* tool selection mobile */}
      <div
        className={`flex-shrink sm:hidden md:hidden fixed top-0 left-0 right-0 justify-center items-center mt-6 z-20
          ${isInteracting ? "pointer-events-none opacity-50" : "opacity-100"}
          transition-opacity duration-200 select-none`}
      >
        <div
          className="flex sm:hidden md:hidden justify-center items-center gap-2 p-2 bg-gray-800/80 backdrop-blur-sm 
          shadow-2xl rounded-xl border border-gray-700/50 overflow-x-auto max-w-full scrollbar-hide md:gap-2 md:p-2"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <MenuOption
            isActive={selectedTool === Tools.Text}
            onClick={() => setSelectedTool(Tools.Text)}
          >
            <span className="text-xl md:text-base">𝐀</span>
          </MenuOption>
          <MenuOption
            isActive={selectedTool === Tools.Line}
            onClick={() => setSelectedTool(Tools.Line)}
          >
            <span className="text-xl md:text-base">➖</span>
          </MenuOption>
          <MenuOption
            isActive={selectedTool === Tools.Pencil}
            onClick={() => setSelectedTool(Tools.Pencil)}
          >
            <span className="text-xl md:text-base">✏️</span>
          </MenuOption>
          <Divider />
          <MenuOption
            isActive={selectedTool === Tools.Rect}
            onClick={() => setSelectedTool(Tools.Rect)}
          >
            <span className="text-xl md:text-base">⬜</span>
          </MenuOption>
          <MenuOption
            isActive={selectedTool === Tools.Ellipse}
            onClick={() => setSelectedTool(Tools.Ellipse)}
          >
            <span className="text-xl md:text-base">⭕</span>
          </MenuOption>
        </div>
      </div>

      <div
        className={`flex sm:hidden fixed top-0 bottom-0 right-0 justify-center items-center mr-3 z-20
          ${isInteracting ? "pointer-events-none opacity-50" : "opacity-100"}
          transition-opacity duration-200 select-none`}
      >
        <div
          className="sm:hidden flex-col justify-center items-center gap-2 p-2 bg-gray-800/80 backdrop-blur-sm 
          shadow-2xl rounded-xl border border-gray-700/50 overflow-x-auto max-w-full scrollbar-hide md:gap-2 md:p-2"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <MenuOption
            isActive={selectedTool === Tools.Hand}
            onClick={() => setSelectedTool(Tools.Hand)}
          >
            <span className="text-xl md:text-base">✋</span>
          </MenuOption>
          <MenuOption
            isActive={selectedTool === Tools.Interact}
            onClick={() => setSelectedTool(Tools.Interact)}
          >
            <span className="text-xl md:text-base">👆🏻</span>
          </MenuOption>
        </div>
      </div>

      {/* Tool Selection Desktop*/}
      <div
        className={`hidden fixed sm:flex justify-center items-center top-0 left-0 right-0 mt-6 z-20
          ${isInteracting ? "pointer-events-none opacity-50" : "opacity-100"}
          transition-opacity duration-200 select-none`}
      >
        <div
          className="flex justify-center items-center gap-2 p-2 bg-gray-800/80 backdrop-blur-sm 
          shadow-2xl rounded-xl border border-gray-700/50 overflow-x-auto max-w-full scrollbar-hide md:gap-2 md:p-2"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <MenuOption
            isActive={selectedTool === Tools.Hand}
            onClick={() => setSelectedTool(Tools.Hand)}
          >
            <span className="text-xl md:text-base">✋</span>
            <span className="hidden lg:inline ml-1">Hand</span>
          </MenuOption>
          <MenuOption
            isActive={selectedTool === Tools.Interact}
            onClick={() => setSelectedTool(Tools.Interact)}
          >
            <span className="text-xl md:text-base">👆🏻</span>
            <span className="hidden lg:inline ml-1">Select</span>
          </MenuOption>
          <Divider />
          <MenuOption
            isActive={selectedTool === Tools.Text}
            onClick={() => setSelectedTool(Tools.Text)}
          >
            <span className="text-xl md:text-base">𝐀</span>
            <span className="hidden lg:inline ml-1">Text</span>
          </MenuOption>
          <MenuOption
            isActive={selectedTool === Tools.Line}
            onClick={() => setSelectedTool(Tools.Line)}
          >
            <span className="text-xl md:text-base">➖</span>
            <span className="hidden lg:inline ml-1">Line</span>
          </MenuOption>
          <MenuOption
            isActive={selectedTool === Tools.Pencil}
            onClick={() => setSelectedTool(Tools.Pencil)}
          >
            <span className="text-xl md:text-base">✏️</span>
            <span className="hidden lg:inline ml-1">Pencil</span>
          </MenuOption>
          <Divider />
          <MenuOption
            isActive={selectedTool === Tools.Rect}
            onClick={() => setSelectedTool(Tools.Rect)}
          >
            <span className="text-xl md:text-base">⬜</span>
            <span className="hidden lg:inline ml-1">Rectangle</span>
          </MenuOption>
          <MenuOption
            isActive={selectedTool === Tools.Ellipse}
            onClick={() => setSelectedTool(Tools.Ellipse)}
          >
            <span className="text-xl md:text-base">⭕</span>
            <span className="hidden lg:inline ml-1">Ellipse</span>
          </MenuOption>
          <Divider />
          <MenuOption
            isActive={selectedTool === Tools.Eraser}
            onClick={() => setSelectedTool(Tools.Eraser)}
          >
            <span className="text-xl md:text-base">🧹</span>
            <span className="hidden lg:inline ml-1">Eraser</span>
          </MenuOption>
        </div>
      </div>

      {/* Quick Actions */}
      <div
        className={`fixed bottom-0 left-0 right-0 flex justify-center items-center gap-4 p-2 pb-4 md:pb-2 z-20
          rounded-none md:rounded-xl bg-gray-800/80 backdrop-blur-sm shadow-2xl border-t border-gray-700/50 md:border md:bottom-0 md:right-0 md:left-auto md:m-6
          ${isInteracting ? "pointer-events-none opacity-50" : "opacity-100"}
          transition-opacity duration-200 select-none`}
      >
        <MenuOption onClick={() => game?.undo()}>
          <span className="text-2xl md:text-base">↩️</span>
          <span className="hidden md:inline ml-1">Undo</span>
        </MenuOption>
        <MenuOption onClick={() => game?.recenterCanvas()}>
          <span className="text-2xl md:text-base">🧭</span>
          <span className="hidden md:inline ml-1">Re-center</span>
        </MenuOption>
        <MenuOption onClick={() => game?.redo()}>
          <span className="text-2xl md:text-base">↪️</span>
          <span className="hidden md:inline ml-1">Redo</span>
        </MenuOption>
      </div>
      {/* Hide scrollbars for tool bar on mobile */}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        @media (max-width: 768px) {
          .rounded-xl { border-radius: 1rem !important; }
          .rounded-none { border-radius: 0 !important; }
        }
      `}</style>
    </main>
  );
}

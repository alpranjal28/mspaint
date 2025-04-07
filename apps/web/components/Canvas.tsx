import { useEffect, useRef, useState } from "react";
import { Game } from "../draw/Game";

export enum Tools {
  Rect = "rect",
  Circle = "circle",
  Pencil = "pencil",
  Line = "line",
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
  }, []);

  useEffect(() => {
    game?.setSelectedTool(selectedTool);
  }, [selectedTool, game]);

  useEffect(() => {
    if (canvasRef.current) {
      const g = new Game(canvasRef.current, roomId, socket, selectedTool);
      setGame(g);

      return () => g.destroyMouseHandlers();
    }
  }, [canvasRef.current]);

  function Dock() {
    return (
      <div className="absolute flex justify-center gap-4 p-4 bg-slate-600 transition-all duration-500">
        <div
          className="border-2 border-black p-2 bg-red-300 rounded-full cursor-pointer hover:bg-red-500 transition-colors"
          onClick={() => {
            setSelectedTool(Tools.Line);
          }}
        >
          line
        </div>
        <div
          className="border-2 border-black p-2 bg-red-300 cursor-pointer hover:bg-red-500 transition-colors"
          onClick={() => {
            setSelectedTool(Tools.Rect);
          }}
        >
          rect
        </div>
        <div
          className="border-2 border-black p-2 bg-red-300 rounded-full cursor-pointer hover:bg-red-500 transition-colors"
          onClick={() => {
            setSelectedTool(Tools.Circle);
          }}
        >
          circle
        </div>

        {JSON.stringify(selectedTool)}
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
    </main>
  );
}

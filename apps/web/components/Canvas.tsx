"use client";
import { useEffect, useRef, useState } from "react";
import { Draw } from "../draw";

enum Tools {
  Rect,
  Circle,
  Pencil,
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
  const [selectedTool, setSelectedTool] = useState<Tools>(Tools.Rect);
  const [windowDimensions, setWindowDimensions] = useState({
    width: 0,
    height: 0,
  });

  console.log("roomId -> ", roomId);

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
    const canvas = canvasRef.current;
    if (!canvas) return;
    Draw(canvas, roomId, socket, selectedTool);
    console.log(selectedTool);
    
  }, [roomId, socket, selectedTool]);

  function Dock() {
    return (
      <div className="absolute flex justify-center gap-4 p-4 bg-slate-600 transition-all duration-500">
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

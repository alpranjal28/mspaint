"use client";
import { useEffect, useRef, useState } from "react";
import { Draw } from "../draw";

export default function Canvas({ params }: { params: { roomId: string } }) {
  const roomId = params.roomId;

  const canvasRef = useRef<HTMLCanvasElement>(null);

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
    const canvas = canvasRef.current;
    if (!canvas) return;
    Draw(canvas, roomId);
  });
  return (
    <main className="flex min-h-screen bg-gray-300">
      <canvas
        height={windowDimensions.height}
        ref={canvasRef}
        width={windowDimensions.width}
      ></canvas>
      <div className="absolute top-0 left-0 right-0 flex justify-center gap-4 p-4 ">
        <div className="border-2 border-black p-2 bg-red-300">rect</div>
        <div className="border-2 border-black p-2 bg-red-300 rounded-full">
          circle
        </div>
      </div>
    </main>
  );
}

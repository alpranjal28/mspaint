"use client";
import { use, useEffect, useRef } from "react";

export default function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "red";
    context.clearRect(0, 0, 500, 500);
    context.fillRect(60, 320, 100, 100);
  })
  return (
    <main>
      <canvas  height={500} ref={canvasRef} width={500}></canvas>
    </main>
  );
}

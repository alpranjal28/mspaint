"use client";
import { useEffect, useState } from "react";
import { WS_BACKEND_URL } from "../config";
import Canvas from "./Canvas";

export default function LoadingCanvas({ roomId }: { roomId: number }) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [loadingText, setLoadingText] = useState("let's paint");

  useEffect(() => {
    const messages = [
      "cleaning tools",
      "cleaning room",
      "have fun",
      "what's on your mind",
      "let's paint",
      "let's draw",
      "let's sketch",
      "mixing colors",
      "sharpening pencils",
      "unleash creativity",
      "time to create",
      "art is calling",
      "ready to doodle?",
      "splash some color",
      "masterpiece loading",
      "canvas awaits",
      "paint the world",
      "draw your dreams",
      "color outside lines",
      "create magic",
      "artistic vibes",
      "brush strokes ready",
      "imagination mode",
      "creative chaos",
      "pixel perfect",
    ];
    const randomInt = Math.floor(Math.random() * messages.length);
    setLoadingText(messages[randomInt] as string);
  }, []);

  useEffect(() => {
    const ws = new WebSocket(
      `${WS_BACKEND_URL}?token=${localStorage.getItem("token")}`
    );
    ws.onerror = (e) => console.log(e);
    ws.onopen = () => {
      console.log(`connecting to ws canvas of room ${roomId}`);

      setSocket(ws);
      ws.send(JSON.stringify({ type: "subscribe", roomId }));
      console.log("ws connected to canvas");
    };

    ws.onclose = () => {
      console.log("disconnected from ws canvas of room ", roomId);
      setSocket(null);
    };
  }, []);

  if (!socket) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 to-gray-800">
        <div className="flex flex-col items-center justify-center space-y-8">
          {/* Animated Paint Brush */}
          <div className="relative">
            <div className="w-16 h-16 animate-spin">
              <svg
                viewBox="0 0 64 64"
                className="w-full h-full text-yellow-400"
              >
                <path
                  fill="currentColor"
                  d="M32 8l-8 16h16l-8-16zm-4 20v28c0 2 2 4 4 4s4-2 4-4V28h-8z"
                />
              </svg>
            </div>
            <div className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full animate-bounce"></div>
            <div className="absolute -bottom-2 -left-2 w-4 h-4 bg-blue-500 rounded-full animate-bounce delay-150"></div>
            <div className="absolute top-1/2 -right-4 w-3 h-3 bg-green-500 rounded-full animate-bounce delay-300"></div>
          </div>

          {/* Animated Text */}
          <div className="text-center">
            <div className="text-5xl font-bold text-white mb-4 animate-pulse">
              {loadingText}
            </div>
            <div className="flex items-center justify-center space-x-2">
              <div className="text-2xl font-semibold text-blue-300">
                Loading
              </div>
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce delay-100"></div>
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce delay-200"></div>
              </div>
            </div>
          </div>

          {/* Paint Splashes */}
          <div className="absolute top-20 left-20 w-8 h-8 bg-pink-500 rounded-full opacity-60 animate-ping"></div>
          <div className="absolute bottom-32 right-24 w-6 h-6 bg-yellow-500 rounded-full opacity-60 animate-ping delay-500"></div>
          <div className="absolute top-1/3 right-16 w-4 h-4 bg-green-500 rounded-full opacity-60 animate-ping delay-1000"></div>
        </div>
      </div>
    );
  }

  return <Canvas roomId={roomId} socket={socket} />;
}

const isProduction = process.env.NODE_ENV === "production";

export const HTTP_BACKEND_URL = isProduction
  ? "https://draw.altherius.in/api"
  : "http://localhost:3030";

export const WS_BACKEND_URL = isProduction
  ? "wss://draw.altherius.in/ws"
  : "ws://localhost:8080";

// //  prod
// export const HTTP_BACKEND_URL = "https://draw.altherius.in/api";
// export const WS_BACKEND_URL = "wss://draw.altherius.in/ws";

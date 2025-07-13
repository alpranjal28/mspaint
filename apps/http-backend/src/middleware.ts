import { NextFunction, Request, Response } from "express";
import { verifyToken } from "@repo/backend-common/config";

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export function middleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization;

  if (!token) {
    res.status(401).json({ message: "No token provided" });
    return;
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
}

import { NextFunction, Request, Response } from "express";
import { verifyToken } from "@repo/backend-common/config";

export function middleware(req: Request, res: Response, next: NextFunction) {
  console.log("middleware");
  const token = req.headers.authorization;
  if (!token) {
    res.status(401).send("Unauthorized");
    return;
  }
  const decoded = verifyToken(token);
  console.log("decoded token", decoded);

  if (decoded) {
    req.body.JwtPayload = decoded;
    next();
  } else {
    res.status(401).send("Unauthorized");
  }
}

import jwt from "jsonwebtoken";

export const JWT_SECRET = process.env.JWT_SECRET || "secretcode";

export function signToken(userId: number) {
  return jwt.sign({ userId }, JWT_SECRET, {
    expiresIn: "1d",
  });
}

export function verifyToken(token: string) {
  return jwt.verify(token, JWT_SECRET);
}
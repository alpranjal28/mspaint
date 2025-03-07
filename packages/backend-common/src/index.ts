import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { log } from "console";

export const JWT_SECRET = process.env.JWT_SECRET || "secretcode";

// token
export function signToken(userId: string) {
  return jwt.sign({ userId }, JWT_SECRET, {
    expiresIn: "1d",
  });
}

export function verifyToken(token: string) {
  console.log("verifing token", token);
  return jwt.verify(token, JWT_SECRET);
}

export function verifiedUser(token: string): string | null {
  console.log("verifing user token", token);
  try {
    const decoded = verifyToken(token);
    if (typeof decoded === "string") return null;
    if (!decoded) return null;
    console.log("decoded user token", decoded);
    return decoded.userId;
  } catch (e) {
    console.log("error verifing user token", e);
    return null;
  }
}

// hash
export function hashPassword(password: string) {
  const salt = bcrypt.genSaltSync(10);
  return bcrypt.hashSync(password, salt);
}

export function checkPassword(password: string, hash: string) {
  return bcrypt.compareSync(password, hash);
}

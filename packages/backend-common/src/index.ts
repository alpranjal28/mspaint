import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

export const JWT_SECRET = process.env.JWT_SECRET || "secretcode";

// token
export function accessToken(userId: string, email: string) {
  return jwt.sign({ userId, email }, JWT_SECRET, {
    expiresIn: "1d",
  });
}
export function refreshToken(userId: string, name: string) {
  return jwt.sign({ userId, name }, JWT_SECRET, {
    expiresIn: "1d",
  });
}

export function verifyToken(token: string) {
  console.log("verifing token");
  return jwt.verify(token, JWT_SECRET);
}

export function verifiedUser(token: string): string | null {
  try {
    const decoded = verifyToken(token);
    if (typeof decoded === "string") return null;
    if (!decoded) return null;
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

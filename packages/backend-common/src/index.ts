import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

export const JWT_SECRET = process.env.JWT_SECRET || "secretcode";

// token
export function issueAccessToken(userId: string, email: string) {
  return jwt.sign({ userId, email }, JWT_SECRET, {
    expiresIn: "3d",
  });
}
export function issueRefreshToken(userId: string, name: string) {
  return jwt.sign({ userId, name }, JWT_SECRET, {
    expiresIn: "7d", // token valid for 7 days
  });
}

export function verifyToken(token: string) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('TOKEN_EXPIRED');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('TOKEN_INVALID');
    }
    throw error;
  }
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

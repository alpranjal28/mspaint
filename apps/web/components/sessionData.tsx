"use client"
import { verifyToken } from "@repo/backend-common/config";
export const SessionData = () => {
  const localToken = localStorage.getItem("token");
  if (!localToken) return null;
  const sessionData = verifyToken(localToken)
  return sessionData
};

export default SessionData
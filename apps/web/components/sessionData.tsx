"use client";
import { jwtDecode } from "jwt-decode";
// import { decodeToken } from "@repo/backend-common/config"; // Import a decodeToken function

// interface SessionDataType {
//   // Add the properties that are expected to be returned by decodeToken
//   userId: string;
//   // Add other properties as needed
// }

// export default function SessionData (){
//   const localToken = localStorage.getItem("token");
//   if (!localToken) return null;
//   const decodedToken = decodeToken(localToken); // Decode the token using the decodeToken function
//   console.log("decoded token -> ", decodedToken);
//   return decodedToken
// };

import { useEffect, useState } from "react";

interface SessionDataType {
  userId: string;
  iat: number;
  exp: number;
}
const SessionData = () => {
  const [username, setUsername] = useState<string | null>(null);
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const decowdedToken: SessionDataType = jwtDecode(token);    
    setUsername(decowdedToken.userId);
  }, []);
  return (
    <div>
      User
      <div className="">{username}</div>
    </div>
  );
};

export default SessionData;

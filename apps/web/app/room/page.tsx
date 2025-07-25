"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import axios, { AxiosError } from "axios";
import { HTTP_BACKEND_URL } from "../../config";
import { DeleteModal, LeaveModal } from "../../components/ExitRoom";
import { LogOut, Share2, Trash } from "lucide-react";

export interface Room {
  id: number;
  name: string;
  shareCode: string;
  createdAt: string;
  joinedAt: string;
  isOwner: boolean;
}

export interface RoomResponse {
  rooms: Room[];
  message?: string;
}

export interface CreateRoomResponse {
  room: Room;
  message: string;
}
export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [roomToLeave, setRoomToLeave] = useState<Room | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [roomToDelete, setRoomToDelete] = useState<Room | null>(null);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = "/signin";
      return;
    }
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      console.log("fetching existing rooms");
      const token = localStorage.getItem("token");
      const { data } = await axios.get<RoomResponse>(
        `${HTTP_BACKEND_URL}/rooms/`,
        {
          headers: {
            Authorization: `${token}`,
          },
        }
      );
      console.log(data);

      setRooms(data.rooms);
    } catch (err) {
      handleError(err, "Failed to load rooms");
    }
  };

  const createRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("token");
      const { data } = await axios.post<CreateRoomResponse>(
        `${HTTP_BACKEND_URL}/room/`,
        { name: newRoomName },
        {
          headers: {
            Authorization: `${token}`,
          },
        }
      );
      fetchRooms();
      setNewRoomName("");
      setIsCreating(false);
    } catch (err) {
      handleError(err, "Failed to create room");
    }
  };

  const joinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${HTTP_BACKEND_URL}/room/join`,
        { code: joinCode },
        {
          headers: {
            Authorization: `${token}`,
          },
        }
      );
      setIsJoinModalOpen(false);
      setJoinCode("");
      fetchRooms();
    } catch (err) {
      if (err instanceof AxiosError) {
        setJoinError(err.response?.data?.message || "Failed to join room");
      } else {
        setJoinError("Failed to join room");
      }
    }
  };

  const initiateLeave = (room: Room) => {
    setRoomToLeave(room);
    setIsLeaveModalOpen(true);
  };

  const confirmLeave = async () => {
    if (!roomToLeave) return;
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${HTTP_BACKEND_URL}/room/${roomToLeave.id}/leave`,
        {},
        {
          headers: {
            Authorization: `${token}`,
          },
        }
      );
      setRooms(rooms.filter((room) => room.id !== roomToLeave.id));
      setIsLeaveModalOpen(false);
      setRoomToLeave(null);
    } catch (err) {
      handleError(err, "Failed to leave room");
    }
  };

  const initiateDelete = (room: Room) => {
    setRoomToDelete(room);
    setIsDeleteModalOpen(true);
  };
  const confirmDelete = async () => {
    if (!roomToDelete) return;

    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${HTTP_BACKEND_URL}/room/${roomToDelete.id}/delete`, {
        headers: {
          Authorization: `${token}`,
        },
      });
      setRooms(rooms.filter((room) => room.id !== roomToDelete.id));
      setIsDeleteModalOpen(false);
      setRoomToDelete(null);
    } catch (err) {
      handleError(err, "Failed to delete room");
    }
  };

  const refreshToken = () => {
    axios
      .post(`${HTTP_BACKEND_URL}/refresh-token`, {}, { withCredentials: true })
      .then((res) => {
        const { token } = res.data;
        localStorage.setItem("token", token);
      })
      .catch((err) => {
        if (err.response?.status === 401) {
          window.location.href = "/signin";
        }
      });
  };

  const handleError = async (err: unknown, defaultMessage: string) => {
    if (err instanceof AxiosError) {
      setError(err.response?.data?.message || defaultMessage);
      if (err.response?.status === 401) {
        // Handle unauthorized access
        try {
          refreshToken();
          // Retry the original request
          fetchRooms();
        } catch (refreshError) {
          setError("Session expired. Please sign in again.");
          setTimeout(() => {
            window.location.href = "/signin";
          }, 2000);
        }
      }
    } else {
      setError(defaultMessage);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 px-4 py-12">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">
            Your Drawing Rooms
          </h1>
          <p className="text-gray-400 mb-8">
            Create or join rooms to collaborate with others
          </p>

          <button
            onClick={() => setIsCreating(true)}
            className="top-3 left-0 right-0 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium 
              hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/25"
          >
            Create New Room
          </button>
          <button
            onClick={() => setIsJoinModalOpen(true)}
            className="ml-4 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium 
    hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/25"
          >
            Join Room
          </button>
        </div>

        {/* Create Room Form */}
        {isCreating && (
          <div className="mb-8 p-6 bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700/50">
            <form onSubmit={createRoom} className="space-y-4">
              <input
                type="text"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="Enter room name"
                autoFocus
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg 
                  text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Create Room
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                {error && (
                  <div className="px-4 py-2 bg-red-900/50 border border-red-500 text-red-200 rounded-lg">
                    {error}
                  </div>
                )}
              </div>
            </form>
          </div>
        )}

        {isJoinModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4 border border-gray-700 shadow-xl">
              <h3 className="text-xl font-semibold text-white mb-4">
                Join Room
              </h3>
              <form onSubmit={joinRoom} className="space-y-4">
                <input
                  type="text"
                  value={joinCode}
                  autoFocus
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="Enter share code"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg 
            text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
                {joinError && (
                  <div className="text-red-400 text-sm">{joinError}</div>
                )}
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsJoinModalOpen(false);
                      setJoinCode("");
                      setJoinError(null);
                    }}
                    className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Join
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Rooms Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map((room) => (
            <div
              key={room.id}
              className="p-6 bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700/50 
                hover:border-gray-600/50 transition-colors"
            >
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-medium text-white">{room.name}</h3>
                {/* copy share code to clipboard */}

                {room.isOwner && (
                  <div className="gap-5 flex">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(room.shareCode);
                      }}
                      className="text-gray-400/50 hover:text-blue-400 transition-colors"
                      title="Copy Share Code"
                    >
                      <Share2 />
                    </button>
                    <button
                      onClick={() => initiateDelete(room)}
                      className="text-gray-400/50 hover:text-red-400 transition-colors"
                      title="Delete Room"
                    >
                      <Trash />
                    </button>
                  </div>
                )}
                {!room.isOwner && (
                  <button
                    onClick={() => initiateLeave(room)}
                    className="text-gray-400/50 hover:text-red-400 transition-colors"
                    title="Leave Room"
                  >
                    <LogOut />
                  </button>
                )}
              </div>
              {room.isOwner ? (
                <p className="text-gray-400 text-sm mb-4">
                  Created {new Date(room.createdAt).toLocaleDateString()}
                </p>
              ) : (
                <p className="text-gray-400 text-sm mb-4">
                  Joined {new Date(room.joinedAt).toLocaleDateString()}
                </p>
              )}
              <Link
                href={`/room/${room.id}`}
                className="inline-block px-4 py-2 bg-blue-600/20 text-blue-400 rounded-lg 
                  hover:bg-blue-600/30 transition-colors text-sm"
              >
                Join Room →
              </Link>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {rooms.length === 0 && !isCreating && (
          <div className="text-center py-12">
            <p className="text-gray-400 mb-4">No rooms found</p>
            <button
              onClick={() => setIsCreating(true)}
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              Create your first room
            </button>
          </div>
        )}
      </div>
      <DeleteModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setRoomToDelete(null);
        }}
        onConfirm={confirmDelete}
        roomName={roomToDelete?.name || ""}
      />
      <LeaveModal
        isOpen={isLeaveModalOpen}
        onClose={() => {
          setIsLeaveModalOpen(false);
          setRoomToLeave(null);
        }}
        onConfirm={confirmLeave}
        roomName={roomToLeave?.name || ""}
      />
    </div>
  );
}

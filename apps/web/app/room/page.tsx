"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import axios, { AxiosError } from "axios";
import { HTTP_BACKEND_URL } from "../../config";

export interface Room {
  id: number;
  name: string;
  createdAt: string;
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
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
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
    } finally {
      setIsLoading(false);
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

  const deleteRoom = async (roomId: number) => {
    if (!confirm("Are you sure you want to delete this room?")) return;

    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${HTTP_BACKEND_URL}/room/${roomId}`, {
        headers: {
          Authorization: `${token}`,
        },
      });
      setRooms(rooms.filter((room) => room.id !== roomId));
    } catch (err) {
      handleError(err, "Failed to delete room");
    }
  };

  const handleError = (err: unknown, defaultMessage: string) => {
    if (err instanceof AxiosError) {
      setError(err.response?.data?.message || defaultMessage);
      if (err.response?.status === 401) {
        // Handle unauthorized access
        window.location.href = "/signin";
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
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-8 p-4 bg-red-900/50 border border-red-500 text-red-200 rounded-lg">
            {error}
          </div>
        )}

        {/* Create Room Form */}
        {isCreating && (
          <div className="mb-8 p-6 bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700/50">
            <form onSubmit={createRoom} className="space-y-4">
              <input
                type="text"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="Enter room name"
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
              </div>
            </form>
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
                {room.isOwner && (
                  <button
                    onClick={() => deleteRoom(room.id)}
                    className="text-red-400 hover:text-red-300 transition-colors"
                  >
                    🗑️
                  </button>
                )}
              </div>
              <p className="text-gray-400 text-sm mb-4">
                Created {new Date(room.createdAt).toLocaleDateString()}
              </p>
              <Link
                href={`/room/${room.id}`}
                className="inline-block px-4 py-2 bg-blue-600/20 text-blue-400 rounded-lg 
                  hover:bg-blue-600/30 transition-colors text-sm"
              >
                Join Room →
              </Link>
            </div>
          ))}
          {isLoading && (
            <div className="min-h-40 p-6 bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700/50 hover:border-gray-600/50 transition-colors">
              <p className="flex items-center justify-center h-full text-gray-400 text-sm">
                Loading rooms...
              </p>
            </div>
          )}
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
    </div>
  );
}

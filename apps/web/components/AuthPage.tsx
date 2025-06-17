"use client";
import { useState } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import axios, { AxiosError } from "axios";
import { HTTP_BACKEND_URL } from "../config";
// import { AuthFormInputs, AuthResponse } from "../types/auth";

export interface AuthFormInputs {
  username?: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  username: string;
  token: string;
  message?: string;
}
const authSchema = z.object({
  username: z.string().min(3).optional(),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export function AuthPage({ isSignIn }: { isSignIn: boolean }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<AuthFormInputs>({
    resolver: zodResolver(authSchema),
    defaultValues: {
      email: "",
      password: "",
      username: isSignIn ? undefined : "",
    },
  });

  const onSubmit: SubmitHandler<AuthFormInputs> = async (data) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await axios.post<AuthResponse>(
        `${HTTP_BACKEND_URL}/${isSignIn ? "signin" : "signup"}`,
        data
      );

      localStorage.setItem("username", response.data.username);
      localStorage.setItem("token", response.data.token);
      reset();
      window.location.href = "/";
    } catch (err) {
      if (err instanceof AxiosError) {
        setError(err.response?.data?.message || "Authentication failed");
      } else {
        setError("An unexpected error occurred");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 to-gray-800 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-white text-2xl font-bold mb-2">MSPaint+</h1>
          <h2 className="text-4xl font-bold text-white mb-4">
            {isSignIn ? "Welcome Back" : "Create Account"}
          </h2>
          <p className="text-gray-300">
            {isSignIn
              ? "Sign in to continue your creative journey"
              : "Join our community of artists"}
          </p>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-2xl p-8">
          {error && (
            <div className="mb-6 p-3 bg-red-900/50 border border-red-500 text-red-200 rounded">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {!isSignIn && (
              <div>
                <label className="block text-sm font-medium text-gray-300">
                  Username
                </label>
                <input
                  {...register("username")}
                  className={`mt-1 block w-full px-3 py-2 bg-gray-700 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    errors.username ? "border-red-500" : "border-gray-600"
                  } text-white placeholder-gray-400`}
                  type="text"
                  placeholder="Enter your username"
                />
                {errors.username && (
                  <p className="mt-1 text-sm text-red-400">
                    {errors.username.message}
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-300">
                Email
              </label>
              <input
                {...register("email")}
                className={`mt-1 block w-full px-3 py-2 bg-gray-700 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.email ? "border-red-500" : "border-gray-600"
                } text-white placeholder-gray-400`}
                type="email"
                placeholder="Enter your email"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-400">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300">
                Password
              </label>
              <input
                {...register("password")}
                className={`mt-1 block w-full px-3 py-2 bg-gray-700 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.password ? "border-red-500" : "border-gray-600"
                } text-white placeholder-gray-400`}
                type="password"
                placeholder="Enter your password"
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-400">
                  {errors.password.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Processing...
                </span>
              ) : (
                <span>{isSignIn ? "Sign In" : "Create Account"}</span>
              )}
            </button>

            <p className="text-sm text-center text-gray-400">
              {isSignIn ? (
                <>
                  Don't have an account?{" "}
                  <a
                    href="/signup"
                    className="font-medium text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Sign up
                  </a>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <a
                    href="/signin"
                    className="font-medium text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Sign in
                  </a>
                </>
              )}
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

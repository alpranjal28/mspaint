"use client";
import axios from "axios";
import { useForm } from "react-hook-form";
import { HTTP_BACKEND_URL } from "../config";

export function AuthPage({ isSignIn }: { isSignIn: Boolean }) {
  const { register, handleSubmit } = useForm();
  function onSubmit(data: any) {
    axios
      .post(
        isSignIn
          ? `${HTTP_BACKEND_URL}/signin`
          : `${HTTP_BACKEND_URL}/signup`,
        data
      )
      .then((res) => {
        console.log(res);
        localStorage.setItem("username", res.data.username);
        localStorage.setItem("token", res.data.token);
        window.location.href = "/";
      });
  }
  return (
    <div className="w-screen h-screen flex justify-center items-center bg-gray-700">
      <div className="flex justify-center items-center border rounded-lg border-red-100">
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="p-10 gap-10 flex flex-col items-center justify-center">
            <div className="text-3xl">{isSignIn ? "Sign in" : "Signup"}</div>
            {!isSignIn && (
              <div className="">
                <input
                  {...register("username")}
                  className="p-1"
                  type="text"
                  placeholder="username"
                />
              </div>
            )}
            <div className="">
              <input
                {...register("email")}
                className="p-1"
                type="text"
                placeholder="email"
              />
            </div>
            <div className="">
              <input
                {...register("password")}
                className="p-1"
                type="password"
                placeholder="password"
              />
            </div>
            <div className="">
              <button
                type="submit"
                className="px-6 py-2 rounded-lg bg-gray-900 text-white"
              >
                {isSignIn ? "Sign in" : "Signup"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

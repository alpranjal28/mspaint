export function AuthPage({ isSignIn }: { isSignIn: Boolean }) {
  return (
    <div className="w-screen h-screen flex justify-center items-center bg-gray-700">
      <div className="flex justify-center items-center border rounded-lg border-red-100">
        <div className="p-10 gap-10 flex flex-col items-center justify-center">
          <div className="text-3xl">{isSignIn ? "Sign in" : "Signup"}</div>
          <div className="">
            <input className="p-1" type="text" placeholder="email" />
          </div>
          <div className="">
            <input className="p-1" type="text" placeholder="password" />
          </div>
          <div className="">
            <button className="px-6 py-2 rounded-lg bg-gray-900 text-white">{isSignIn ? "Sign in" : "Signup"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

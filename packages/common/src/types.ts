import { z } from "zod";

export const CreateUserSchema = z.object({
  username: z.string().nonempty().min(3).max(20),
  email: z.string().email().nonempty(),
  password: z.string().nonempty(),
});

export const SignInSchema = z.object({
  email: z.string().email().nonempty(),
  password: z.string().nonempty(),
});

export const CreateRoomSchems = z.object({
  name: z.string().nonempty().min(3).max(20),
});

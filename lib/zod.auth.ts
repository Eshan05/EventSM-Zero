import { z, object, string } from 'zod';

export const signUpSchema = object({
  email: string({ required_error: "Email is required" })
    .min(1, "Email is required")
    .email("Invalid email"),
  username: string()
    .min(1, "Username is required")
    .max(50, "Username must be at most 50 characters") // Adjusted based on DB schema
    .regex(/^[a-zA-Z0-9_.]+$/, "Username can only contain letters, numbers, underscores, and dots"),
  password: string()
    .min(8, { message: 'Password must be at least 8 characters' })
    .max(100, { message: 'Password must be at most 100 characters' }) // Be generous, hashing handles length
    .regex(/[A-Z]/, { message: 'Password must contain at least one uppercase letter' })
    .regex(/[a-z]/, { message: 'Password must contain at least one lowercase letter' })
    .regex(/[0-9]/, { message: 'Password must contain at least one number' })
    .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, { message: 'Password must contain at least one special character' }), // Expanded special chars
  displayName: string().max(50, "Display name too long").optional(),
});

export const signInSchema = object({
  identifier: z.string().min(1, "Email or Username is required"),
  password: z.string().min(1, "Password is required"),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
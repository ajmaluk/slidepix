import { z } from "zod";

/**
 * Shared validation schemas for both frontend and backend.
 */

// User Registration Schema
export const registrationSchema = z.object({
  email: z.string().email("Invalid email address").min(5, "Email is too short"),
  password: z.string().min(8, "Password must be at least 8 characters long"),
  date_of_birth: z.string().refine((dob) => {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age >= 13;
  }, "You must be at least 13 years old"),
  country: z.string().min(1, "Country is required"),
});

export type RegistrationInput = z.infer<typeof registrationSchema>;

// Login Schema
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

// Email OTP authentication
export const authOtpRequestSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export type AuthOtpRequestInput = z.infer<typeof authOtpRequestSchema>;

// Password reset / update schemas
export const resetPasswordRequestSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export type ResetPasswordRequestInput = z.infer<typeof resetPasswordRequestSchema>;

export const passwordResetSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters long"),
  confirmPassword: z.string().min(1, "Please confirm your new password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export type PasswordResetInput = z.infer<typeof passwordResetSchema>;

// Contact/Feedback Schema
export const feedbackSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100, "Name is too long"),
  email: z.string().email("Invalid email address"),
  subject: z.string().min(3, "Subject must be at least 3 characters").max(200, "Subject is too long"),
  message: z.string().min(10, "Message must be at least 10 characters").max(5000, "Message is too long"),
  type: z.enum(["feedback", "bug", "contact"]).default("feedback"),
});

export type FeedbackInput = z.infer<typeof feedbackSchema>;

// Chat Completion Request Schema (Backend only, but good to have here)
export const chatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string().min(1, "Message cannot be empty").max(50000, "Message is too long"),
  })).min(1, "At least one message is required").max(100, "Too many messages in context"),
  mode: z.enum(["auto", "search", "creative", "precise"]).optional(),
  provider: z.object({
    activeProvider: z.string().optional(),
    selectedModel: z.string().optional(),
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
  }).optional(),
});

/**
 * Sanitization utilities
 */
export function sanitizeInput(input: string): string {
  if (!input) return "";
  
  // Basic XSS prevention: escape HTML characters
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

import DOMPurify from 'dompurify';

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html);
}

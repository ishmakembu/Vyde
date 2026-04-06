import { z } from 'zod';

export const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password must be at most 100 characters'),
  avatarColor: z.string().optional(),
});

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const updateStatusSchema = z.object({
  status: z.string().max(50, 'Status must be at most 50 characters').optional(),
  emoji: z.string().max(4, 'Emoji must be at most 4 characters').optional(),
});

export const updateProfileSchema = z.object({
  avatar: z.string().url().optional().or(z.literal('')),
  avatarColor: z.string().optional(),
  frameTheme: z.enum(['default', 'neon', 'fire', 'nature', 'minimal']).optional(),
  isPrivate: z.boolean().optional(),
  showLastSeen: z.boolean().optional(),
  showReadReceipts: z.boolean().optional(),
});

export const sendMessageSchema = z.object({
  callId: z.string(),
  content: z.string().max(500, 'Message must be at most 500 characters').optional(),
  imageUrl: z.string().url().optional(),
});

export const sendReactionSchema = z.object({
  callId: z.string(),
  emoji: z.string(),
  pack: z.enum(['default', 'fire', 'love', 'hype']).default('default'),
});

export const initiateCallSchema = z.object({
  calleeId: z.string(),
  roomId: z.string(),
  callId: z.string(),
});

export const acceptCallSchema = z.object({
  callId: z.string(),
  roomId: z.string(),
});

export const endCallSchema = z.object({
  callId: z.string(),
});

export const inviteToCallSchema = z.object({
  callId: z.string(),
  userId: z.string(),
});

export const reportUserSchema = z.object({
  reportedId: z.string(),
  reason: z.enum(['harassment', 'spam', 'inappropriate', 'other']),
  description: z.string().max(500, 'Description must be at most 500 characters').optional(),
  callId: z.string().optional(),
});

export const wsMessageSchema = z.object({
  type: z.string(),
  payload: z.unknown(),
  id: z.string().optional(),
});

export const wsAckSchema = z.object({
  id: z.string(),
  ok: z.boolean(),
  error: z.string().optional(),
});

export const cursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type SendReactionInput = z.infer<typeof sendReactionSchema>;
export type InitiateCallInput = z.infer<typeof initiateCallSchema>;
export type AcceptCallInput = z.infer<typeof acceptCallSchema>;
export type EndCallInput = z.infer<typeof endCallSchema>;
export type InviteToCallInput = z.infer<typeof inviteToCallSchema>;
export type ReportUserInput = z.infer<typeof reportUserSchema>;
export type WSMessage = z.infer<typeof wsMessageSchema>;
export type WSAck = z.infer<typeof wsAckSchema>;
export type CursorPaginationInput = z.infer<typeof cursorPaginationSchema>;

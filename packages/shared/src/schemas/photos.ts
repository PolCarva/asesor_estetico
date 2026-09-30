import { z } from "zod";

import { ALLOWED_PHOTO_MIME_TYPES } from "../constants";

export const UserPhotoTypeSchema = z.enum(["MAIN_BODY", "FACE_DETAIL"]);
export type UserPhotoType = z.infer<typeof UserPhotoTypeSchema>;

export const UserPhotoStatusSchema = z.enum(["UPLOADED", "VALIDATING", "VALID", "INVALID"]);
export type UserPhotoStatus = z.infer<typeof UserPhotoStatusSchema>;

export const PhotoMimeTypeSchema = z.enum(ALLOWED_PHOTO_MIME_TYPES);
export type PhotoMimeType = z.infer<typeof PhotoMimeTypeSchema>;

export const PhotoIssueCodeSchema = z.enum([
  "NO_PERSON",
  "MULTIPLE_PEOPLE",
  "FACE_NOT_VISIBLE",
  "BODY_NOT_VISIBLE",
  "LOW_QUALITY",
  "TOO_DARK",
  "HEAVY_FILTER",
  "POSSIBLY_UNDERAGE",
  "INAPPROPRIATE_CONTENT",
]);
export type PhotoIssueCode = z.infer<typeof PhotoIssueCodeSchema>;

export const PhotoValidationResultSchema = z.object({
  photo_id: z.uuid(),
  type: UserPhotoTypeSchema,
  valid: z.boolean(),
  issues: z.array(
    z.object({
      code: PhotoIssueCodeSchema,
      severity: z.enum(["BLOCKING", "WARNING"]),
      message: z.string().max(200),
    }),
  ),
  quality_score: z.number().min(0).max(1),
});
export type PhotoValidationResult = z.infer<typeof PhotoValidationResultSchema>;

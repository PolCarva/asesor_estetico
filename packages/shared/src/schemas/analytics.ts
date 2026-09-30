import { z } from "zod";

export const ANALYTICS_EVENTS = [
  "landing_view",
  "signup_started",
  "signup_completed",
  "photo_uploaded",
  "photo_validation_failed",
  "analysis_started",
  "analysis_completed",
  "free_look_viewed",
  "locked_look_clicked",
  "paywall_viewed",
  "checkout_started",
  "subscription_started",
  "premium_look_viewed",
  "shopping_started",
  "product_clicked",
  "cheaper_alternative_requested",
  "look_saved",
  "product_saved",
  "chat_started",
  "look_regenerated",
  "style_advice_viewed",
] as const;

export const AnalyticsEventNameSchema = z.enum(ANALYTICS_EVENTS);
export type AnalyticsEventName = z.infer<typeof AnalyticsEventNameSchema>;

/** Propiedades planas y chicas: nunca fotos, tokens ni datos personales. */
export const AnalyticsPropertiesSchema = z
  .record(z.string().max(40), z.union([z.string().max(200), z.number(), z.boolean(), z.null()]))
  .refine((props) => Object.keys(props).length <= 20, "Demasiadas propiedades");
export type AnalyticsProperties = z.infer<typeof AnalyticsPropertiesSchema>;

export const AnalyticsEventSchema = z.object({
  name: AnalyticsEventNameSchema,
  user_id: z.uuid().nullable(),
  anonymous_id: z.string().max(64).nullable(),
  path: z.string().max(200).nullable(),
  properties: AnalyticsPropertiesSchema,
});
export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;

/** Eventos que el navegador puede reportar vía /api/analytics. El resto solo se emite en el servidor. */
export const CLIENT_ANALYTICS_EVENTS = [
  "landing_view",
  "signup_started",
  "free_look_viewed",
  "locked_look_clicked",
  "paywall_viewed",
  "premium_look_viewed",
  "product_clicked",
  "cheaper_alternative_requested",
  "style_advice_viewed",
] as const satisfies readonly AnalyticsEventName[];

export const ClientAnalyticsEventSchema = z.object({
  name: z.enum(CLIENT_ANALYTICS_EVENTS),
  anonymous_id: z.string().max(64).nullable().default(null),
  path: z.string().max(200).nullable().default(null),
  properties: AnalyticsPropertiesSchema.default({}),
});
export type ClientAnalyticsEvent = z.infer<typeof ClientAnalyticsEventSchema>;

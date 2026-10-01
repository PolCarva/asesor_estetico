// Acceso a datos: tipos generados de Supabase, helpers de auth, cola de jobs y Storage.
// Los clientes están en subpaths separados (@asesor/db/browser, /server, /service, /worker, /admin, /proxy)
// para que el código de servidor nunca termine en el bundle del navegador.
export * from "./auth";
export * from "./jobs";
export * from "./pipeline";
export * from "./shopping";
export * from "./shopping-jobs";
export * from "./storage";
export * from "./style-profile";
export * from "./types";

/**
 * Logger estructurado (JSON por línea) para web y worker.
 * Redacta claves sensibles antes de escribir: nunca loguear secretos, tokens,
 * fotos ni payloads completos.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogContext = Record<string, unknown>;

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(bindings: LogContext): Logger;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SENSITIVE_KEY =
  /pass(word)?|secret|token|authorization|cookie|api[_-]?key|service[_-]?role|signature|signed[_-]?url|image|photo[_-]?data|base64|payload|email/i;
const MAX_STRING = 500;
const MAX_DEPTH = 4;

export const REDACTED = "[REDACTED]";

export function redact(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: truncate(value.message) };
  }
  if (typeof value === "string") return truncate(value);
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[Truncated]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(v, depth + 1);
  }
  return out;
}

function truncate(s: string) {
  return s.length > MAX_STRING ? `${s.slice(0, MAX_STRING)}…` : s;
}

export interface LoggerOptions {
  service: string;
  level?: LogLevel;
  bindings?: LogContext;
  write?: (line: string, level: LogLevel) => void;
}

const defaultWrite = (line: string, level: LogLevel) => {
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
};

export function createLogger(options: LoggerOptions): Logger {
  const minLevel = LEVEL_ORDER[options.level ?? "info"];
  const write = options.write ?? defaultWrite;
  const bindings = options.bindings ?? {};

  const log = (level: LogLevel, message: string, context?: LogContext) => {
    if (LEVEL_ORDER[level] < minLevel) return;
    const entry = {
      time: new Date().toISOString(),
      level,
      service: options.service,
      msg: message,
      ...(redact({ ...bindings, ...context }) as LogContext),
    };
    write(JSON.stringify(entry), level);
  };

  return {
    debug: (m, c) => log("debug", m, c),
    info: (m, c) => log("info", m, c),
    warn: (m, c) => log("warn", m, c),
    error: (m, c) => log("error", m, c),
    child: (extra) => createLogger({ ...options, bindings: { ...bindings, ...extra } }),
  };
}

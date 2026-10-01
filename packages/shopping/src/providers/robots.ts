/**
 * robots.txt (RFC 9309): grupos por user agent, reglas Allow/Disallow con `*` y `$`, y
 * gana la regla más larga (a igual largo, Allow). Puro: la descarga está en `http.ts`.
 */

export interface RobotsRule {
  allow: boolean;
  pattern: string;
}

export interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

export interface RobotsPolicy {
  groups: RobotsGroup[];
  /** Estado de la descarga: 4xx = todo permitido; 5xx o error = todo prohibido (RFC 9309). */
  mode: "PARSED" | "ALLOW_ALL" | "DISALLOW_ALL";
}

export const ALLOW_ALL: RobotsPolicy = { groups: [], mode: "ALLOW_ALL" };
export const DISALLOW_ALL: RobotsPolicy = { groups: [], mode: "DISALLOW_ALL" };

export function parseRobots(text: string): RobotsPolicy {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const sep = line.indexOf(":");
    if (sep < 0) continue;
    const key = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();

    if (key === "user-agent") {
      // Varias líneas User-agent seguidas comparten el mismo grupo.
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === "allow" || key === "disallow") {
      lastWasAgent = false;
      // "Disallow:" vacío no prohíbe nada.
      if (current && value) current.rules.push({ allow: key === "allow", pattern: value });
    } else {
      lastWasAgent = false;
    }
  }
  return { groups, mode: "PARSED" };
}

function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

/**
 * Reglas que aplican a un bot: las de los grupos que lo nombran (por su token de
 * producto) o, si ninguno lo nombra, las de todos los grupos `*` (se combinan).
 */
function rulesFor(policy: RobotsPolicy, agentToken: string): RobotsRule[] {
  const token = agentToken.toLowerCase();
  const named = policy.groups.filter((g) => g.agents.some((a) => a !== "*" && token.startsWith(a)));
  const groups = named.length ? named : policy.groups.filter((g) => g.agents.includes("*"));
  return groups.flatMap((g) => g.rules);
}

/** ¿Puede el bot pedir este path (con query string)? */
export function isAllowedByRobots(
  policy: RobotsPolicy,
  agentToken: string,
  pathWithQuery: string,
): boolean {
  if (policy.mode === "ALLOW_ALL") return true;
  if (policy.mode === "DISALLOW_ALL") return false;
  if (pathWithQuery === "/robots.txt") return true;

  let best: RobotsRule | null = null;
  for (const rule of rulesFor(policy, agentToken)) {
    if (!patternToRegExp(rule.pattern).test(pathWithQuery)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow)
    ) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

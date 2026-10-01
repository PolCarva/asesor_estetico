import { Parser } from "htmlparser2";

/**
 * Lectura de una página de producto en una sola pasada (SAX, sin armar el DOM): bloques
 * JSON-LD, metas (OpenGraph y `product:*`) e items de microdata schema.org.
 */

export interface MicrodataItem {
  /** URLs de `itemtype` (p. ej. `http://schema.org/Product`). */
  types: string[];
  props: Map<string, MicrodataValue[]>;
}
export type MicrodataValue = string | MicrodataItem;

export interface PageData {
  /** JSON-LD ya parseado (los bloques rotos se ignoran). */
  jsonLd: unknown[];
  /** `property` o `name` en minúsculas → `content`, en orden de aparición. */
  meta: Map<string, string[]>;
  /** Items de microdata de primer nivel (los anidados cuelgan de sus propiedades). */
  items: MicrodataItem[];
}

/** Elementos cuyo valor de microdata sale de un atributo (spec de HTML, "microdata"). */
const VALUE_ATTRIBUTE: Record<string, string> = {
  meta: "content",
  img: "src",
  audio: "src",
  embed: "src",
  iframe: "src",
  source: "src",
  track: "src",
  video: "src",
  a: "href",
  area: "href",
  link: "href",
  object: "data",
  data: "value",
  meter: "value",
  time: "datetime",
};

interface Frame {
  /** Item que abre este elemento (`itemscope`). */
  item: MicrodataItem | null;
  /** Propiedades que esperan el texto del elemento, y el item al que pertenecen. */
  textProps: { names: string[]; owner: MicrodataItem } | null;
  text: string[] | null;
  jsonLd: string[] | null;
  /** `script`/`style` que no es JSON-LD: su texto se ignora. */
  skipText: boolean;
}

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

function addProp(item: MicrodataItem, names: string[], value: MicrodataValue) {
  for (const name of names) {
    const list = item.props.get(name) ?? [];
    list.push(value);
    item.props.set(name, list);
  }
}

function parseJsonLd(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^<!--|-->$/g, "")
    .replace(/^\s*\/\/\s*<!\[CDATA\[|\/\/\s*\]\]>\s*$/g, "")
    .trim()
    .replace(/;$/, "");
  try {
    return JSON.parse(cleaned) as unknown;
  } catch {
    return undefined;
  }
}

export function parseHtml(html: string): PageData {
  const data: PageData = { jsonLd: [], meta: new Map(), items: [] };
  const frames: Frame[] = [];
  const collecting: Frame[] = [];

  const currentItem = () => {
    for (let i = frames.length - 1; i >= 0; i--) {
      const item = frames[i]!.item;
      if (item) return item;
    }
    return null;
  };

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        const frame: Frame = {
          item: null,
          textProps: null,
          text: null,
          jsonLd: null,
          skipText: false,
        };
        if (name === "script") {
          if (/ld\+json/i.test(attribs.type ?? "")) frame.jsonLd = [];
          else frame.skipText = true;
        } else if (name === "style" || name === "template") {
          frame.skipText = true;
        }
        if (name === "meta") {
          const key = (attribs.property ?? attribs.name ?? "").trim().toLowerCase();
          if (key && attribs.content !== undefined) {
            const list = data.meta.get(key) ?? [];
            list.push(attribs.content);
            data.meta.set(key, list);
          }
        }

        const owner = currentItem();
        const names = (attribs.itemprop ?? "").split(/\s+/).filter(Boolean);
        if ("itemscope" in attribs) {
          frame.item = {
            types: (attribs.itemtype ?? "").split(/\s+/).filter(Boolean),
            props: new Map(),
          };
          // Con itemprop es el valor de una propiedad del item de afuera; si no, es de primer nivel.
          if (names.length > 0 && owner) addProp(owner, names, frame.item);
          else data.items.push(frame.item);
        } else if (names.length > 0 && owner) {
          // `content` en cualquier elemento es práctica común (`<span itemprop="price" content="1690">`).
          const attribute = attribs.content !== undefined ? "content" : VALUE_ATTRIBUTE[name];
          const value = attribute ? attribs[attribute] : undefined;
          if (value !== undefined && !(name === "time" && !value)) {
            addProp(owner, names, value.trim());
          } else {
            frame.textProps = { names, owner };
            frame.text = [];
            collecting.push(frame);
          }
        }
        frames.push(frame);
      },
      ontext(text) {
        const top = frames.at(-1);
        if (top?.jsonLd) {
          top.jsonLd.push(text);
          return;
        }
        if (frames.some((f) => f.skipText)) return;
        for (const frame of collecting) frame.text!.push(text);
      },
      onclosetag() {
        const frame = frames.pop();
        if (!frame) return;
        if (frame.jsonLd) {
          const parsed = parseJsonLd(frame.jsonLd.join(""));
          if (parsed !== undefined) data.jsonLd.push(parsed);
        }
        if (frame.textProps && frame.text) {
          collecting.splice(collecting.indexOf(frame), 1);
          addProp(frame.textProps.owner, frame.textProps.names, collapse(frame.text.join("")));
        }
      },
    },
    { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true },
  );
  parser.write(html);
  parser.end();
  return data;
}

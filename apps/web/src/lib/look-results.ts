import type { LookProductResult, LookSearchState } from "@asesor/db";
import {
  type Currency,
  type Garment,
  type GarmentSlot,
  type InStoreInfo,
  isProductStale,
  type Money,
  priceForSize,
  type ProductAvailability,
  type ShoppingSearchSummary,
  sizeForCategory,
  type SizeStatus,
  type UserSizes,
} from "@asesor/shared";

/**
 * View model de los resultados de shopping de un look (paso 08): por prenda, un
 * RECOMENDADO y sus alternativas (3–5 opciones en total, las que guardó la búsqueda), con
 * talle y stock honestos, precio en su moneda real y cuándo se verificó. Puro: sin red.
 */

export type Tone = "ok" | "warn" | "muted";

export interface ProductOptionView {
  /** uuid de `products`. */
  productId: string;
  rank: number;
  title: string;
  storeName: string;
  storeDomain: string;
  /** Solo https (la CSP no deja otra cosa); null = sin foto. */
  imageUrl: string | null;
  /** "$ 1.399", "US$ 79"; null = precio a consultar (local físico). */
  price: string | null;
  /** El precio es el del talle del usuario, distinto del menor del producto (otro color). */
  sizePrice: boolean;
  availability: ProductAvailability;
  stock: { label: string; tone: Tone };
  /** null: prenda sin talle (accesorios). */
  size: { label: string; tone: Tone } | null;
  /** "hace 2 h". */
  verified: string;
  /** Más de 8 h desde la última verificación: conviene revalidar antes de comprar. */
  stale: boolean;
  inStore: InStoreInfo | null;
}

export interface CheaperOptionView extends ProductOptionView {
  /** "$ 400 menos"; null si está en otra moneda (se comparó con una conversión aproximada). */
  saving: string | null;
}

/**
 * "Buscar más barato" de la prenda (paso 09):
 * - `running`: buscando;
 * - `results`: alternativas guardadas;
 * - `empty`: se buscó y no hubo nada más barato que conserve el estilo;
 * - `failed`: la búsqueda falló;
 * - `none`: nunca se pidió (o una búsqueda nueva del look la descartó).
 */
export interface CheaperView {
  state: "none" | "running" | "results" | "empty" | "failed";
  /** "$ 1.399": el precio del producto de referencia (el tope estricto). */
  limit: string | null;
  referenceTitle: string | null;
  options: CheaperOptionView[];
  /** Hay alternativas en otra moneda que la del tope. */
  converted: boolean;
}

export interface PieceResultsView {
  slot: GarmentSlot;
  garment: Garment;
  /** `failed`: la búsqueda de esta prenda falló; `empty`: no hubo opciones. */
  status: "results" | "empty" | "failed";
  recommended: ProductOptionView | null;
  alternatives: ProductOptionView[];
  cheaper: CheaperView;
}

export interface LookResultsView {
  pieces: PieceResultsView[];
  /**
   * Suma de los recomendados con precio, por moneda (nunca convertida). `complete`: todas
   * las prendas con resultados tienen precio y la misma moneda.
   */
  totals: Array<{ amount: string; count: number }>;
  complete: boolean;
  /** Prendas con resultados (para "N de M prendas"). */
  withResults: number;
  /** Algún producto mostrado se verificó hace más de 8 h. */
  stale: boolean;
  /** Verificación más vieja de lo mostrado ("hace 3 h"). */
  oldestVerified: string | null;
  /** Los talles del perfil cambiaron desde la búsqueda: el estado del talle es del anterior. */
  sizesChanged: boolean;
}

const FORMATS = new Map<string, Intl.NumberFormat>();

/** Precio en su moneda real, con el formato de Uruguay: "$ 1.399", "$ 249,90", "US$ 79". */
export function formatMoney(money: Money): string {
  const digits = Number.isInteger(money.amount) ? 0 : 2;
  const key = `${money.currency}:${digits}`;
  let format = FORMATS.get(key);
  if (!format) {
    format = new Intl.NumberFormat("es-UY", {
      style: "currency",
      currency: money.currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    FORMATS.set(key, format);
  }
  return format.format(money.amount);
}

/** "recién", "hace 12 min", "hace 3 h", "hace 2 días". */
export function timeAgo(iso: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "hace 1 día" : `hace ${days} días`;
}

/** Stock como lo muestra la UI (resultados, carrito y guardados). */
export const STOCK: Record<ProductAvailability, { label: string; tone: Tone }> = {
  IN_STOCK: { label: "En stock", tone: "ok" },
  OUT_OF_STOCK: { label: "Sin stock", tone: "warn" },
  UNKNOWN: { label: "Stock sin verificar", tone: "muted" },
  IN_STORE_ONLY: { label: "Disponible en tienda física", tone: "muted" },
};

/**
 * Stock del producto junto al talle del usuario: con su talle agotado o sin ofrecer, "En
 * stock" se leía como que lo había (paso 12b: "Talle 42 agotado · En stock"). Es en otros.
 */
export function stockFor(
  availability: ProductAvailability,
  sizeStatus: SizeStatus | null,
): { label: string; tone: Tone } {
  if (
    availability === "IN_STOCK" &&
    (sizeStatus === "OUT_OF_STOCK" || sizeStatus === "NOT_OFFERED")
  ) {
    return { label: "En stock en otros talles", tone: "muted" };
  }
  return STOCK[availability];
}

/** Talle del usuario en el producto: "Talle M ✓", "Talle M agotado", "Talle sin verificar"… */
export function sizeBadge(
  status: SizeStatus | null,
  userSize: string | null,
): { label: string; tone: Tone } | null {
  const size = userSize ? `Talle ${userSize}` : "Tu talle";
  switch (status) {
    case "NOT_APPLICABLE":
      return null;
    case "AVAILABLE":
      return { label: `${size} ✓`, tone: "ok" };
    case "OUT_OF_STOCK":
      return { label: `${size} agotado`, tone: "warn" };
    case "NOT_OFFERED":
      return { label: userSize ? `No hay talle ${userSize}` : "No hay tu talle", tone: "warn" };
    case "NOT_REQUESTED":
      return { label: "Talle sin cargar", tone: "muted" };
    default:
      // UNVERIFIED o filas anteriores al paso 05 (sin estado).
      return { label: "Talle sin verificar", tone: "muted" };
  }
}

/** Lo que se paga en el talle con que se buscó (paso 11): puede no ser el menor del producto. */
function rowPrice(row: LookProductResult): Money | null {
  const { product } = row.product;
  return priceForSize(product.price, product.variants, row.userSize);
}

function option(row: LookProductResult, now: Date) {
  const { product } = row.product;
  const image = product.image_url?.startsWith("https://") ? product.image_url : null;
  const price = rowPrice(row);
  return {
    productId: row.product.id,
    rank: row.rank,
    title: product.title,
    storeName: product.store.name,
    storeDomain: product.store.domain,
    imageUrl: image,
    price: price ? formatMoney(price) : null,
    sizePrice: Boolean(price && product.price && price.amount !== product.price.amount),
    availability: product.availability,
    stock: stockFor(product.availability, row.sizeStatus),
    // El estado se calculó con el talle de la búsqueda (no con el del perfil de hoy).
    size: sizeBadge(row.sizeStatus, row.userSize),
    verified: timeAgo(product.fetched_at, now),
    stale: isProductStale(product.fetched_at, now),
    inStore: product.in_store,
  } satisfies ProductOptionView;
}

function cheaperView(
  rows: LookProductResult[],
  all: LookProductResult[],
  search: Pick<LookSearchState, "status" | "createdAt"> | undefined,
  lookSearchCreatedAt: string | null,
  now: Date,
): CheaperView {
  const none: CheaperView = {
    state: "none",
    limit: null,
    referenceTitle: null,
    options: [],
    converted: false,
  };
  if (search && (search.status === "QUEUED" || search.status === "RUNNING")) {
    return { ...none, state: "running" };
  }
  const cheaper = rows.filter((r) => r.list === "CHEAPER").sort((a, b) => a.rank - b.rank);
  const first = cheaper[0]?.cheaperThan;
  if (first) {
    const limit = first.maxPrice;
    const reference = all.find((r) => r.product.id === first.productId);
    const options = cheaper.map((row): CheaperOptionView => {
      const price = row.product.product.price;
      const same = price?.currency === limit.currency;
      return {
        ...option(row, now),
        saving:
          price && same
            ? `${formatMoney({ currency: limit.currency, amount: Math.round((limit.amount - price.amount) * 100) / 100 })} menos`
            : null,
      };
    });
    return {
      state: "results",
      limit: formatMoney(limit),
      referenceTitle: reference?.product.product.title ?? null,
      options,
      converted: options.some((o) => o.saving === null),
    };
  }
  // Sin filas: solo cuenta una búsqueda más nueva que la del look (que descarta las viejas).
  const recent =
    search &&
    (!lookSearchCreatedAt || Date.parse(search.createdAt) > Date.parse(lookSearchCreatedAt));
  if (recent && search.status === "COMPLETED") return { ...none, state: "empty" };
  if (recent && search.status === "FAILED") return { ...none, state: "failed" };
  return none;
}

export function buildLookResults(input: {
  pieces: Array<{ slot: GarmentSlot; garment: Garment }>;
  rows: LookProductResult[];
  summary: ShoppingSearchSummary | null;
  sizes: UserSizes;
  now: Date;
  /** Búsquedas de una sola prenda ("más barato"), por slot, y cuándo se buscó el look. */
  slotSearches?: Map<string, Pick<LookSearchState, "status" | "createdAt">>;
  lookSearchCreatedAt?: string | null;
}): LookResultsView {
  const failed = new Set(input.summary?.failed_slots ?? []);
  const fetched: string[] = [];
  let sizesChanged = false;
  const mainRows = input.rows.filter((r) => r.list === "MAIN");
  const pieces = input.pieces.map(({ slot, garment }): PieceResultsView => {
    const slotRows = input.rows.filter((r) => r.slot === slot);
    const rows = slotRows.filter((r) => r.list === "MAIN").sort((a, b) => a.rank - b.rank);
    const options = rows.map((row) => option(row, input.now));
    const current = sizeForCategory(input.sizes, garment.category);
    if (rows.some((r) => r.userSize !== null && r.userSize !== current)) sizesChanged = true;
    fetched.push(...rows.map((r) => r.product.product.fetched_at));
    const [recommended = null, ...alternatives] = options;
    return {
      slot,
      garment,
      status: options.length > 0 ? "results" : failed.has(slot) ? "failed" : "empty",
      recommended,
      alternatives,
      cheaper: cheaperView(
        slotRows,
        input.rows,
        input.slotSearches?.get(slot),
        input.lookSearchCreatedAt ?? null,
        input.now,
      ),
    };
  });

  const recommended = pieces.flatMap((p) => (p.recommended ? [p] : []));
  const byCurrency = new Map<Currency, { amount: number; count: number }>();
  for (const piece of recommended) {
    const row = mainRows.find((r) => r.product.id === piece.recommended?.productId);
    const price = row ? rowPrice(row) : null;
    if (!price) continue;
    const sum = byCurrency.get(price.currency) ?? { amount: 0, count: 0 };
    byCurrency.set(price.currency, { amount: sum.amount + price.amount, count: sum.count + 1 });
  }
  const totals = [...byCurrency.entries()].map(([currency, sum]) => ({
    amount: formatMoney({ currency, amount: Math.round(sum.amount * 100) / 100 }),
    count: sum.count,
  }));
  const oldest = fetched.sort()[0] ?? null;
  return {
    pieces,
    totals,
    complete:
      recommended.length > 0 && totals.length === 1 && totals[0]!.count === recommended.length,
    withResults: recommended.length,
    stale: fetched.some((at) => isProductStale(at, input.now)),
    oldestVerified: oldest ? timeAgo(oldest, input.now) : null,
    sizesChanged,
  };
}

# Motor de shopping

## Estado

- **Búsqueda real** (paso 03): LookSpec → `buildShoppingQueries` → `CompositeSearchProvider` (registro de tiendas por plataforma + sitemaps + descubrimiento web) → URLs candidatas de tiendas uruguayas.
- **Descarga**: `HttpProductFetcher` con el mismo cliente respetuoso. La extracción robusta (microdata de Fenicio, talles, stock, precios con punto de miles) es del paso 04a/04b: hoy `extractProduct` solo lee JSON-LD.
- **Mocks** (`MockSearchProvider`, `MockProductFetcher`, catálogo ficticio `.test`): solo con `SHOPPING_PROVIDER=mock` (tests y E2E). El default del worker es `live` y en producción `mock` está prohibido por el schema de env.

## Pipeline

```
ShoppingQuery
  → SearchProvider        URLs candidatas
  → fetchProductPage      descarga (con validación anti-SSRF)
  → extractProduct        JSON-LD schema.org/Product → RawProduct
  → normalizeProduct      RawProduct → Product (Zod)
  → rankProducts          score ponderado + breakdown por factor
  → Cache
```

Funciones públicas (`packages/shopping`): `searchProducts`, `fetchProductPage`, `extractProduct`, `normalizeProduct`, `rankProducts`, `refreshProduct`.

- **ShoppingQuery**: una prenda (`Garment` del LookSpec), país (`UY`), talle opcional, precio máximo opcional, límite.
- Una tienda caída o una página sin datos no rompe la búsqueda: ese candidato se descarta.
- Las descargas corren con concurrencia limitada (default 4) y preservan el orden.

## Búsqueda (paso 03)

### De la prenda a la query (`packages/shared`, puro)

- `buildShoppingQueries(look, { sizes, audience, limit })`: una query por prenda de `listLookGarments` (top, bottom, layering, shoes, accesorios) con `slot`, `search_terms`, talle (`sizeForCategory`) y público. `limit` queda entre 3 y 5.
- `buildSearchTerms`: frases cortas en español rioplatense, de la más específica a la más general (`camisa oxford celeste` → `camisa oxford` → `camisa celeste` → … → `camisa`), porque las búsquedas de tienda son léxicas. Traduce lo que la IA escribe en inglés (`loafers` → mocasines, `overshirt` → sobrecamisa, `sneakers` → championes), suma sinónimos (remera/camiseta, buzo/sweater, campera/chaqueta, pollera/falda, bermuda/short…), no busca lo negado (`sin pinzas`) ni repite el color.
- Público: `audienceForProfile` (presentación MASCULINE → `MEN`, FEMININE → `WOMEN`, andrógina → sin filtro). No se infiere nada sensible.
- `isRelevantCandidate(texto, query)`: el título o la URL tiene que nombrar la prenda o un sinónimo (por prefijo, para plurales) y no ser del otro público ni de niños. Una remera negra trae remeras, no medias; unas botas no aceptan championes. URL sin palabras (solo id) → `null` (no se puede juzgar; se valida al descargar).
- `ShoppingQuerySchema` creció de forma aditiva (`slot`, `search_terms`, `audience`, `strict_max_price`, todos con default): los payloads viejos de `SEARCH_PRODUCTS` siguen validando.
- Talles: `UserSizesSchema` (`top`, `bottom`, `shoe`, `shoe_size_system: EU | US`) y `sizeKindForCategory` (camisas, remeras, tejidos, abrigos, blazers y vestidos → top; pantalones, jeans, shorts y polleras → bottom; calzado → shoe; accesorios → ninguno). Los usan los pasos 06 y 07.

### Fuentes (`packages/shopping/src/providers`)

| Fuente                     | Qué hace                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RegistrySearchProvider`   | Recorre `STORE_REGISTRY` (datos: dominio, plataforma, público, modo de búsqueda). `PLATFORM` → adaptador de su plataforma; `SITEMAP` → índice del sitemap. Salta las tiendas de otro público. Prueba hasta 3 términos por tienda hasta juntar 3 candidatas pertinentes.                                                                                                                                                                                                                                                                               |
| Adaptadores por plataforma | Fenicio: listado HTML `/catalogo?q=` (o `/productos?q=`), items `<a class="img" href title>`. VTEX: `/api/catalog_system/pub/products/search?ft=`. Shopify: `/search/suggest.json`. WooCommerce: Store API `/wp-json/wc/store/v1/products?search=`. Magento no tiene adaptador (poca ropa y robots `/*?`).                                                                                                                                                                                                                                            |
| `SitemapIndex`             | Para tiendas que prohíben la búsqueda por robots pero publican sitemap (Stadium, BAS): baja el sitemap (o los hijos `product`/`articulos` del índice), lo cachea 12 h en memoria y puntúa los slugs por los términos.                                                                                                                                                                                                                                                                                                                                 |
| `DiscoverySearchProvider`  | Búsqueda web con la server tool `openrouter:web_search` (motor Exa, ~USD 0.01 por prenda) para llegar a tiendas fuera del registro. Se quedan solo hosts `.uy` (o del registro), sin dominios bloqueados, sin home y pertinentes. Para hasta 2 tiendas nuevas por query detecta la plataforma por huella (`detectPlatform`: Fenicio `f.fcdn.app`/`X-Powered-By: MV`, VTEX `vtexassets`, Shopify `cdn.shopify`, Woo `wp-content`) y busca también con su adaptador. Las URLs son solo candidatas: nunca se usan precios ni datos dichos por el modelo. |
| `CompositeSearchProvider`  | Combina las fuentes con `Promise.allSettled` (una tienda o fuente caída no rompe la búsqueda: se reporta a `onError`), deduplica por URL canónica (sin query, fragmento ni `/` final), acota a 3 por tienda, intercala tiendas y corta en 30.                                                                                                                                                                                                                                                                                                         |

`createLiveShopping({ botContact, webSearch, onError, onCost })` arma todo; el worker lo usa con `SHOPPING_PROVIDER=live` y pasa el cliente de OpenRouter solo si hay `OPENROUTER_API_KEY` (sin clave, no hay descubrimiento). Prueba real: `apps/worker/scripts/real-shopping-search.ts`.

### Reglas de las tiendas

- `PoliteHttpClient`: user agent identificable `AsesorEsteticoBot/1.0 (…; SHOPPING_BOT_CONTACT)`, timeout 12 s con `AbortSignal`, 2 requests simultáneos por host, tope de 6 MB, bloqueo de hosts internos (también tras redirects).
- robots.txt (RFC 9309): se descarga una vez cada 6 h por origen; grupo del bot o, si no lo nombran, los grupos `*`; gana la regla más larga; `*` y `$`. 4xx → todo permitido; 5xx o error → no se pide nada. Toda request (búsqueda, sitemap, descubrimiento) pasa por ahí.
- No se evaden protecciones: un 403 o un desafío anti-bot es una falla más de esa tienda. Mercado Libre, Zara, Nike y Tienda Inglesa están en `BLOCKED_DOMAINS` y se descartan también del descubrimiento.
- Toda respuesta externa (HTML de listados, JSON de plataformas, sitemaps, OpenRouter) se valida con Zod; un formato inesperado es `MalformedResponseError` y cuenta como falla parcial.

## Extracción y normalización

- `extractProduct` lee bloques `application/ld+json` (incluye `@graph` y variantes `hasVariant`). Es el formato más común en tiendas. Extractores específicos por tienda se agregarán cuando haya scraping real.
- `normalizeProduct` mapea disponibilidad (`schema.org/InStock` → `IN_STOCK`, etc.), infiere categoría por palabras clave, normaliza colores/materiales y descarta productos sin título, precio o con moneda no soportada (solo `UYU` y `USD`).

## Disponibilidad

| Valor           | Significado                            | Puntaje de stock |
| --------------- | -------------------------------------- | ---------------- |
| `IN_STOCK`      | Se puede comprar online                | 1                |
| `IN_STORE_ONLY` | Solo en local físico                   | 0.6              |
| `UNKNOWN`       | No se pudo determinar (o tienda caída) | 0.4              |
| `OUT_OF_STOCK`  | Sin stock                              | 0                |

## Ranking

Cada factor puntúa de 0 a 1; el score es el promedio ponderado (`DEFAULT_RANKING_WEIGHTS`, suman 1). Se devuelve el `breakdown` para depurar y para guardarlo en `look_products.score_breakdown`.

| Factor              | Peso | Cálculo inicial                                                      |
| ------------------- | ---- | -------------------------------------------------------------------- |
| `category_match`    | 0.25 | 1 misma categoría, 0.5 relacionada, 0 → se descarta                  |
| `color_match`       | 0.20 | nombre de color (sin tildes) en los colores del producto             |
| `visual_similarity` | 0.15 | similitud de texto (Jaccard). Reemplazar por embeddings de imagen    |
| `size_available`    | 0.10 | 1 talle en stock, 0.25 talle sin stock, 0 no existe, 0.5 sin dato    |
| `stock`             | 0.10 | tabla de disponibilidad                                              |
| `fit_match`         | 0.08 | fit coincide / sin dato / no coincide                                |
| `material_match`    | 0.07 | material coincide / sin dato / no coincide                           |
| `price`             | 0.05 | con precio máximo: 1 si entra; sin máximo: relativo entre candidatos |

Los precios en USD se convierten con una tasa aproximada (`APPROX_UYU_PER_USD`) solo para comparar; nunca se muestra ese valor.

## Cache (previsto)

| Qué                          | TTL  | Clave                        |
| ---------------------------- | ---- | ---------------------------- |
| Búsqueda (query → resultado) | 24 h | `search:<query serializada>` |
| Producto (precio / stock)    | 8 h  | URL del producto             |

- Al **agregar al carrito** se revalida siempre el producto (`refreshProduct`), sin cache.
- Si la revalidación falla, la disponibilidad pasa a `UNKNOWN` (no se muestran datos viejos como ciertos).
- Hoy existe `createMemoryCache()` (dev/tests). En producción la cache irá en Postgres: `products.last_fetched_at` para productos y una tabla de búsquedas cacheadas, con jobs `REFRESH_PRODUCT`.

## Seguridad

- `isSafeProductUrl` bloquea `localhost`, IPs privadas/link-local, IPv6 literal, credenciales en la URL y esquemas que no sean http(s) (anti-SSRF).
- Los links a tiendas se abren con `rel="noopener noreferrer nofollow"`.
- El precio del carrito lo fija la base (trigger), nunca el cliente.

## Próximos pasos

1. Extracción y normalización de páginas reales (04a) y talles/stock por plataforma (04b).
2. Cache en Postgres y jobs de refresco (05).
3. `visual_similarity` con embeddings de imagen.

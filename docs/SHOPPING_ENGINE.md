# Motor de shopping

## Estado

- **Búsqueda real** (paso 03): LookSpec → `buildShoppingQueries` → `CompositeSearchProvider` (registro de tiendas por plataforma + sitemaps + descubrimiento web) → URLs candidatas de tiendas uruguayas.
- **Descarga, extracción y normalización reales** (paso 04a): fetcher endurecido (anti-SSRF con DNS y redirects, timeout, tamaño, robots, ritmo por dominio), extracción en cascada JSON-LD → microdata → OpenGraph y normalización de precios locales, categorías de Uruguay, fit, colores, materiales e ids estables. Talles y stock por plataforma, Validate y locales físicos son del paso 04b.
- **Mocks** (`MockSearchProvider`, `MockProductFetcher`, catálogo ficticio `.test`): solo con `SHOPPING_PROVIDER=mock` (tests y E2E). El default del worker es `live` y en producción `mock` está prohibido por el schema de env.

## Pipeline

```
ShoppingQuery
  → SearchProvider        URLs candidatas
  → fetchProductPage      descarga segura (HttpProductFetcher → PoliteHttpClient → transporte con IP validada)
  → extractProduct        JSON-LD → microdata → OpenGraph → RawProduct (con la fuente de cada dato)
  → normalizeProduct      RawProduct → Product (Zod), o el motivo del descarte
  → rankProducts          score ponderado + breakdown por factor
  → Cache
```

Funciones públicas (`packages/shopping`): `searchProducts`, `loadCandidate(s)`, `summarizeOutcomes`, `fetchProductPage`, `extractProduct`, `normalizeProduct(Result)`, `rankProducts`, `refreshProduct`.

- **ShoppingQuery**: una prenda (`Garment` del LookSpec), país (`UY`), talle opcional, precio máximo opcional, límite.
- Cada candidato falla solo (`CandidateOutcome`: `product`, `failed` con motivo, `not_product` o `discarded` con motivo) y el `ShoppingResult` lleva `stats` (ver "Tolerancia a fallas").
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

- `PoliteHttpClient`: user agent identificable `AsesorEsteticoBot/1.0 (…; SHOPPING_BOT_CONTACT)`, timeout 12 s con `AbortSignal`, 2 requests simultáneos y uno cada 300 ms por dominio, tope de 6 MB y anti-SSRF en cada salto (ver "Descarga segura").
- robots.txt (RFC 9309): se descarga una vez cada 6 h por origen; grupo del bot o, si no lo nombran, los grupos `*`; gana la regla más larga; `*` y `$`. 4xx → todo permitido; 5xx o error → no se pide nada. Toda request (búsqueda, sitemap, descubrimiento) pasa por ahí.
- No se evaden protecciones: un 403 o un desafío anti-bot es una falla más de esa tienda. Mercado Libre, Zara, Nike y Tienda Inglesa están en `BLOCKED_DOMAINS` y se descartan también del descubrimiento.
- Toda respuesta externa (HTML de listados, JSON de plataformas, sitemaps, OpenRouter) se valida con Zod; un formato inesperado es `MalformedResponseError` y cuenta como falla parcial.

## Descarga segura (paso 04a)

Las URLs candidatas vienen de terceros (búsqueda web, sitemaps), así que cada request se trata como no confiable.

- **Por nombre** (`isSafeProductUrl`, sin DNS): solo `http`/`https` al puerto estándar, sin credenciales en la URL, sin IPv6 literal, sin IPv4 privadas o reservadas (loopback, 10/8, 172.16/12, 192.168/16, CGNAT 100.64/10, 0/8, link-local 169.254/16 —metadata de la nube—, multicast, documentación) en cualquier notación (`0x7f000001`, `2130706433`, `127.1`: la URL las normaliza), sin `localhost` (también `localhost.` y `*.localhost`), `.local`, `.internal`, `.lan`, `home.arpa` ni nombres de una sola etiqueta (servicios de Docker como `db`).
- **Por IP, al conectar** (`createSafeTransport`): transporte propio sobre `node:http(s)` con un `lookup` que resuelve el DNS y rechaza si **alguna** IP no es pública (`isPublicAddress`, IPv4 e IPv6: `::1`, `fc00::/7`, `fe80::/10`, IPv4 mapeada, NAT64, 6to4…). El socket se conecta a la IP ya validada, así que no hay ventana para DNS rebinding.
- **Redirects manuales** (`PoliteHttpClient`, hasta 5): cada destino pasa otra vez por `isSafeProductUrl`, por el `lookup` validado y por el robots.txt de su origen. Un redirect a `169.254.169.254`, a `localhost.` o a un path prohibido corta la descarga.
- **Tiempo y tamaño**: timeout de 12 s por salto combinado con el `AbortSignal` de quien llama (`ProductFetcher.fetch(url, { signal })`); tope de 6 MB **ya descomprimido**, medido mientras se lee (se corta y se cierra el socket apenas se pasa, sin bajar el resto). Acepta gzip, deflate y br.
- **Ritmo por dominio**: 2 requests simultáneos y uno cada 300 ms por dominio (`www.` cuenta como el mismo), con el turno reservado antes de esperar.
- **robots.txt**: el de cada origen (ver "Reglas de las tiendas").
- **Solo HTML**: `HttpProductFetcher` rechaza otro `content-type` (`NotHtmlError`).

## Extracción en cascada (paso 04a)

`parseHtml` recorre la página una sola vez con `htmlparser2` (SAX, sin armar el DOM) y junta los bloques JSON-LD, las metas (`og:*`, `product:*`) y los items de microdata anidados (valores por `content`, `src`, `href` o texto, como dice la spec de HTML). `extractProduct` arma un `RawProduct` tomando cada dato de la **primera** fuente que lo trae y anota la fuente en `sources`:

1. **JSON-LD** `Product` o `ProductGroup` (también en `@graph` o `mainEntity`; se ignoran `ItemList` y `BreadcrumbList`; con 3 o más productos distintos es un listado y no cuenta).
   - Ofertas: `Offer`, arrays de `Offer` (Shopify y VTEX: una por variante), `AggregateOffer` (con o sin `offers` adentro) y `priceSpecification`. En un `ProductGroup` sin ofertas propias se usan las de `hasVariant`.
   - Precio: el menor entre las ofertas **disponibles**; si ninguna lo está, el menor de todas.
   - Disponibilidad agregada: alguna variante disponible → disponible; todas agotadas → agotado; si no, sin dato.
   - Imagen: string, array o `ImageObject` (`url`/`contentUrl`), relativa a la página; un `ProductGroup` sin imagen usa la de su primera variante.
   - Categoría: `category` más las migas de pan (`BreadcrumbList`, sin la última, que es el producto).
   - Entidades HTML dentro de los strings (`H&amp;M`) se decodifican.
2. **Microdata** schema.org (`itemprop`; así publican todas las tiendas Fenicio). Se convierte a la misma forma que el JSON-LD y se lee con la misma lógica.
3. **OpenGraph** (`og:title` sin el nombre del sitio, `og:image:secure_url`/`og:image`, `product:price:amount`/`og:price:amount`, `product:price:currency`, `product:availability`, `product:brand`, `product:category`). Solo cuenta si `og:type` es de producto o hay precio: así una home o una categoría no pasan por producto.

Precio y moneda salen juntos de la primera fuente con un precio legible (la moneda puede completarse con otra fuente de la misma página). Las variantes salen de la primera fuente que las tenga.

**No es una página de producto** (→ `null`): respuesta no 2xx, otro `content-type`, listado o categoría, HTML sin datos de producto o JSON-LD roto. Los endpoints de plataforma (04b) y el parsing específico van después; **Playwright no entra en el MVP**: queda como último recurso documentado para tiendas que solo rendericen en el cliente, nunca para evadir anti-bot.

## Normalización (paso 04a)

`normalizeProductResult(raw, { store, fetchedAt })` devuelve el `Product` (Zod) o el motivo del descarte (`no_title`, `no_price`, `unsupported_currency`, `invalid`). Nunca completa un precio, un stock ni un talle que la página no dio.

- **Precios con formato local** (`parsePrice`): `1.890,00` y `1,890.00` → 1890; un solo separador seguido de 3 dígitos y con 1–3 dígitos adelante es de miles (`6.390` de Decathlon, `1,499` de Jack & Jones); si no, es decimal (`4690.00`, `1490.000`, `12,5`). Ignora símbolos y texto (`UYU 1.690`, `$ 3.890`). Cero, negativo o ilegible → sin precio (BAS publica `0` en agotados: no se muestra).
- **Moneda**: la declarada (`UYU`, `USD`, `$U`, `U$S`, `US$`…) o la escrita junto al precio. Un `$` solo no alcanza: no se supone UYU. Otra moneda (ARS, EUR) → descartado.
- **Categoría** (`inferCategory`): gana el sustantivo de prenda que aparece **primero** en el título, con plurales y términos de Uruguay (championes, remeras, pantalones, buzo, canguro, campera, sobrecamisa, pollera, musculosa, bermuda, chomba, cadena, anillo, lentes…): "Sobrecamisa jean" es abrigo, "Camisa de jean" es camisa. "Pantalón de jean" → `JEANS`; "saco tejido" → `KNITWEAR`. Si el título no dice nada se mira la categoría declarada y las migas de pan. "Reloj despertador" o "almohadón" → `OTHER`.
- **Fit** (`inferFit`), solo explícito: en el título ("Jean slim", "Pantalón recto", "Wide Leg") o en la descripción con contexto ("modelo Slim", "corte entallado", "regular fit"). Valores: `oversize`, `skinny`, `slim`, `relajado`, `ancho`, `recto`, `regular`, `boxy`. "fit cómodo" o "mejor ajuste" no son un fit.
- **Colores** (`inferColors`): los declarados (JSON-LD, microdata, variantes) o los del título, en español (`Black` → negro, `Navy` → azul marino, "GRIS OSCURO" → gris). Fenicio pone el color al final ("Pantalón - Negro - Blanco"). Del título solo salen colores del vocabulario: un nombre de fantasía ("Forest River") queda sin dato.
- **Materiales** (`inferMaterials`): declarados o nombrados en título o descripción (algodón, lino, lana, cuero, cuero sintético, gamuza, poliéster, viscosa, elastano…). "jean" solo cuenta en el título.
- **Ids**: `Product.id` es el id de producto que declara la plataforma (`productGroupID`, `productID`) o, si no hay, la URL de la página (el SKU no sirve: VTEX FastStore usa `"1"` en todos los productos de H&M). Variantes: id de la plataforma (`?variant=` de Shopify) o SKU; sin ninguno, la variante se descarta (nunca el índice).
- **Fechas honestas**: `fetched_at` es el momento de la descarga exitosa. `refreshProduct` devuelve `verified` (datos y fecha nuevos), `gone` (404/410) o `failed` (con motivo); en los dos últimos la disponibilidad pasa a `UNKNOWN` y **`fetched_at` no cambia**: una falla no cuenta como verificación.

## Tolerancia a fallas (paso 04a)

Cada URL candidata se procesa por separado (`loadCandidate`) y su falla no afecta a las demás. `ShoppingResult.stats` lleva los conteos para los mensajes honestos de la UI ("no pudimos verificar algunas tiendas"), sin errores técnicos:

| Conteo        | Qué cuenta                                                        |
| ------------- | ----------------------------------------------------------------- |
| `candidates`  | URLs candidatas (sin duplicados)                                  |
| `products`    | productos válidos, antes de rankear y recortar                    |
| `blocked`     | 401/403/429 o robots.txt que no deja                              |
| `gone`        | 404/410: el producto desapareció                                  |
| `failed`      | timeout, 5xx, red, tamaño, demasiados redirects, URL insegura     |
| `not_product` | no es página de producto (categoría, HTML que cambió, no es HTML) |
| `no_price`    | producto sin precio legible                                       |
| `invalid`     | sin título, moneda distinta de UYU/USD o datos fuera del schema   |

Prueba real: `apps/worker/scripts/real-product-extraction.ts [look-N] [--discovery]` (tabla por tienda con fuentes, fallas y un ejemplo).

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
- Si la revalidación falla, la disponibilidad pasa a `UNKNOWN` (no se muestran datos viejos como ciertos) y la fecha de verificación no avanza (`refreshProduct` → `gone` o `failed`).
- Hoy existe `createMemoryCache()` (dev/tests). En producción la cache irá en Postgres: `products.last_fetched_at` para productos y una tabla de búsquedas cacheadas, con jobs `REFRESH_PRODUCT`.

## Seguridad

- Anti-SSRF en dos capas: `isSafeProductUrl` por nombre y `createSafeTransport` por IP al conectar (sin DNS rebinding), y cada redirect revalidado. Detalle en "Descarga segura".
- Los links a tiendas se abren con `rel="noopener noreferrer nofollow"`.
- El precio del carrito lo fija la base (trigger), nunca el cliente.

## Próximos pasos

1. Talles y stock por plataforma, etapa Validate y locales físicos (04b).
2. Cache en Postgres y jobs de refresco (05).
3. `visual_similarity` con embeddings de imagen.

# Motor de shopping

## Estado

- **Búsqueda real** (paso 03): LookSpec → `buildShoppingQueries` → `CompositeSearchProvider` (registro de tiendas por plataforma + sitemaps + descubrimiento web) → URLs candidatas de tiendas uruguayas.
- **Descarga, extracción y normalización reales** (paso 04a): fetcher endurecido (anti-SSRF con DNS y redirects, timeout, tamaño, robots, ritmo por dominio), extracción en cascada JSON-LD → microdata → OpenGraph y normalización de precios locales, categorías de Uruguay, fit, colores, materiales e ids estables.
- **Talles, stock, Validate y locales físicos** (paso 04b): variantes con talle y disponibilidad desde la plataforma de cada tienda (Fenicio, VTEX, Shopify, WooCommerce), talles normalizados, etapa Validate (página descargada, host de la tienda, Uruguay, precio, URL canónica, tiendas bloqueadas) y productos `IN_STORE_ONLY` con precio opcional, ubicación y contacto.
- **Ranking y cache persistente** (paso 05): ranking estético con talle del usuario y estado del talle, pesos documentados; cache de pools en Postgres (24 h) re-rankeada por pedido, frescura de producto (8 h) y persistencia idempotente de productos, variantes y `look_products`.
- **Mocks** (`MockSearchProvider`, `MockProductFetcher`, catálogo ficticio `.test`): solo con `SHOPPING_PROVIDER=mock` (tests y E2E). El default del worker es `live` y en producción `mock` está prohibido por el schema de env.

## Pipeline

```
ShoppingQuery
  → SearchCache           pool de la prenda (24 h); hit: revalida productos de más de 8 h y salta al ranking
  → SearchProvider        URLs candidatas
  → fetchProductPage      descarga segura (HttpProductFetcher → PoliteHttpClient → transporte con IP validada)
  → extractProduct        JSON-LD → microdata → OpenGraph → RawProduct (con la fuente de cada dato)
  → VariantEnricher       talles y stock de la plataforma (Fenicio, VTEX, Shopify, Woo); si falla, sin verificar
  → normalizeProduct      RawProduct → Product (Zod), o el motivo del descarte
  → validateProduct       página real, host de la tienda, vende en Uruguay, precio > 0, URL canónica
  → SearchCache           se guarda el pool completo (products, product_variants, shopping_search_cache)
  → rankProducts          por pedido: score ponderado + breakdown + estado del talle del usuario
  → saveLookProducts      ranking de la prenda en look_products (paso 06 lo hace desde el job)
```

Funciones públicas (`packages/shopping`): `searchProducts`, `loadCandidate(s)`, `summarizeOutcomes`, `fetchProductPage`, `extractProduct`, `PlatformVariantEnricher`, `normalizeProduct(Result)`, `validateProduct`, `canonicalProductUrl`, `rankProducts`, `refreshProduct`. `createLiveShopping` devuelve `searchProvider`, `fetcher` y `variants` (el worker los recibe como dependencias).

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
- **Talles** (`normalizeSizeLabel`, en `packages/shared` para comparar también el del usuario): letras `XS`…`4XL` (también "Small", "Grande" y los brasileños de Hering: `P`→S, `G`→L, `GG`/`XG`→XL), números `42`/`42.5`, pantalón con largo `32/34`, calzado `US 9`/`UK 8` (EU queda como número) y `ÚNICO`. La etiqueta original queda en `size_label` (Indian: `2XL`; Hering: `XG`).
- **Ids**: `Product.id` es el id de producto que declara la plataforma (`productGroupID`, `productID`) o, si no hay, la URL de la página (el SKU no sirve: VTEX FastStore usa `"1"` en todos los productos de H&M). Variantes: id de la plataforma (`?variant=` de Shopify) o SKU; sin ninguno, la variante se descarta (nunca el índice).
- **Fechas honestas**: `fetched_at` es el momento de la descarga exitosa. `refreshProduct` devuelve `verified` (datos y fecha nuevos), `gone` (404/410) o `failed` (con motivo); en los dos últimos la disponibilidad pasa a `UNKNOWN` y **`fetched_at` no cambia**: una falla no cuenta como verificación.

## Talles y stock por plataforma (paso 04b)

El JSON-LD casi nunca trae talles. `PlatformVariantEnricher` (`variants.ts`) los busca donde los publica la **plataforma** de la tienda (no hay código por tienda). La plataforma sale del candidato, del registro o de la huella del HTML (`detectPlatform`). Todo request pasa por `PoliteHttpClient`: robots.txt, ritmo por dominio, tope de tamaño y anti-SSRF.

| Plataforma  | Dónde                                                                       | Talle                                                                    | Stock                                                                     |
| ----------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Fenicio     | la propia página: `ul#lstTalles > li > input[name=sku]` (sin request extra) | `<b>` (en Indian `data-cpre` es un código); el `span.precio` no es talle | `li[data-stock]` "disponible"/"agotado", o `input[data-stock]` (cantidad) |
| VTEX        | `/api/catalog_system/pub/products/search?fq=skuId:<sku>` (SKU del JSON-LD)  | la clave de `variations` que nombra el talle (`Talla`, `Talla Hombre`…)  | `IsAvailable` o `AvailableQuantity > 0` (viene topeado: solo sí/no)       |
| Shopify     | `/products/<handle>.js`                                                     | la opción `Talla`/`Talle`/`Size`                                         | `available` por variante; precio en centésimos                            |
| WooCommerce | Store API: `/wp-json/wc/store/v1/products?slug=<slug>` + una por variación  | términos del atributo `Talle` (`pa_talle`)                               | `is_in_stock` de cada variación (hasta 12; las demás quedan sin dato)     |

- **Se verifica que sea el mismo producto**: la respuesta de VTEX o Woo tiene que tener el mismo path que la página; el `handle` de Shopify, el mismo. Si no, `mismatch` y no se usa.
- **Un adaptador que falla no descarta el producto** (`VariantResult`: `verified`, `unsupported` o `failed` con `blocked`, `unavailable`, `malformed`, `no_id` o `mismatch`). El producto sigue con lo que dijo su página (el JSON-LD de VTEX y Shopify trae disponibilidad por oferta, que es un dato real) y lo que no se verificó queda `UNKNOWN` o sin talle.
- **robots.txt manda**: BAS prohíbe `/api/` → sus talles quedan sin verificar (su página FastStore no los trae en el HTML). H&M prohíbe `/*_*` pero permite `?fq=` explícitamente: se usa solo esa forma.
- La disponibilidad del producto pasa a ser la de la plataforma (alguna variante disponible → `IN_STOCK`; todas agotadas → `OUT_OF_STOCK`). Si la plataforma no dice nada, queda la de la página.
- Magento no tiene adaptador (poca ropa y robots `Disallow: /*?`).

## Validate (paso 04b)

`validateProduct` corre después de normalizar. Un producto se descarta (cuenta en `invalid`) si:

| Motivo          | Regla                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `not_extracted` | el título o el precio no salen de la página descargada (nunca de un snippet de búsqueda ni de lo que diga un LLM)                     |
| `host_mismatch` | la página, después de redirects, o su URL canónica son de otro dominio que la tienda                                                  |
| `blocked_store` | dominio de `BLOCKED_DOMAINS` (Zara, Nike, Mercado Libre, Tienda Inglesa), aunque la página se haya podido leer                        |
| `invalid_price` | precio ≤ 0, o sin precio fuera de un local físico                                                                                     |
| `foreign_store` | sin evidencia de que vende en Uruguay: no está en el registro, el dominio no es `.uy`, no cobra en UYU y la página no declara Uruguay |

La moneda fuera de UYU/USD ya se descarta al normalizar (`unsupported_currency`). **Evidencia de Uruguay** en la página: `eligibleRegion` o `areaServed` de la oferta, el país de la dirección del local o `og:locale` `es_UY`.

**URL canónica** (`canonicalProductUrl`): la `<link rel="canonical">` si es de la misma tienda (no la raíz ni una ruta interna de VTEX `/_v/`), sin fragmento, sin tracking (`utm_*`, `fbclid`, `gclid`, `srsltid`, `_pos`/`_sid`/`_ss` de Shopify…) ni `?variant=`, con el host en minúsculas y sin `/` final. Es la `url` del producto y su id cuando la plataforma no declara uno.

## Locales físicos: `IN_STORE_ONLY` (paso 04b, D10)

Un producto es `IN_STORE_ONLY` solo si la página lo declara (`availability: InStoreOnly`). Nunca se deduce.

- **Precio opcional**: `Product.price` puede ser `null` solo en `IN_STORE_ONLY` (refine de `ProductSchema` y check `products_price_known` en la base). Online sin precio sigue siendo `no_price`.
- **Ubicación y contacto** (`Product.in_store`, guardado en `data_json`): `address`, `locality`, `phone` y `contact_url`, de la oferta (`availableAtOrFrom`) o de un `LocalBusiness`/`Store` de la página. Lo que no se publica queda en `null`; el contacto mínimo es la página del producto.
- **Carrito**: un producto sin precio no se compra online; el trigger del carrito lo rechaza con un error explícito (el paso 10a decide cómo se muestra). El ranking le da un puntaje de precio neutro (0.5) hasta el paso 05.
- **Caso real**: no apareció ninguno el 2026-10-01 (ver `TIENDAS_UY.md`). El soporte está probado con fixtures.

## Tiendas bloqueadas (D7)

Zara, Nike, Mercado Libre y Tienda Inglesa (`BLOCKED_DOMAINS`) **no se muestran**: ni como producto ni como link a la tienda. El descubrimiento las filtra antes de descargar y Validate las rechaza si igual llegan. No se intenta evadir sus protecciones. Un link "también en Zara" sin precio ni stock quedó fuera del MVP: no aporta un producto verificable.

## Tolerancia a fallas (paso 04a)

Cada URL candidata se procesa por separado (`loadCandidate`) y su falla no afecta a las demás. `ShoppingResult.stats` lleva los conteos para los mensajes honestos de la UI ("no pudimos verificar algunas tiendas"), sin errores técnicos:

| Conteo             | Qué cuenta                                                                        |
| ------------------ | --------------------------------------------------------------------------------- |
| `candidates`       | URLs candidatas (sin duplicados)                                                  |
| `products`         | productos válidos, antes de rankear y recortar                                    |
| `blocked`          | 401/403/429 o robots.txt que no deja                                              |
| `gone`             | 404/410: el producto desapareció                                                  |
| `failed`           | timeout, 5xx, red, tamaño, demasiados redirects, URL insegura                     |
| `not_product`      | no es página de producto (categoría, HTML que cambió, no es HTML)                 |
| `no_price`         | producto sin precio legible                                                       |
| `invalid`          | sin título, moneda distinta de UYU/USD, fuera del schema o rechazado por Validate |
| `unverified_stock` | productos válidos con stock `UNKNOWN` (paso 04b)                                  |
| `unverified_sizes` | productos válidos de una prenda con talle sin talles verificados (paso 04b)       |

Los dos últimos alimentan el mensaje honesto del SPEC ("no pudimos verificar el stock de algunas prendas").

Prueba real: `apps/worker/scripts/real-product-extraction.ts [look-N] [--discovery]` (tabla por tienda con fuentes, fallas y un ejemplo) y `real-product-variants.ts [look-N] [--discovery] [--url …]` (talles y stock por tienda, con lo que quedó sin verificar y por qué).

## Disponibilidad

| Valor           | Significado                            | Puntaje de stock |
| --------------- | -------------------------------------- | ---------------- |
| `IN_STOCK`      | Se puede comprar online                | 1                |
| `IN_STORE_ONLY` | Solo en local físico                   | 0.6              |
| `UNKNOWN`       | No se pudo determinar (o tienda caída) | 0.4              |
| `OUT_OF_STOCK`  | Sin stock                              | 0                |

## Ranking (paso 05, D11)

`rankProducts(pool, query)` es puro: ordena el pool de una prenda para **un pedido** (talle y precio máximo de ese usuario). Cada factor puntúa de 0 a 1 y el score es el promedio ponderado (`DEFAULT_RANKING_WEIGHTS`, suman 1). Se devuelve el `breakdown` (va a `look_products.score_breakdown`) y el `size_status` del talle del usuario (va a `look_products.size_status`).

| Factor              | Peso | Cálculo                                                                                                                                                                                                                                                              |
| ------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `category_match`    | 0.20 | 1 misma categoría, 0.5 relacionada (remera ↔ camisa, abrigo ↔ blazer, pantalón ↔ jean), 0 → se descarta                                                                                                                                                              |
| `color_match`       | 0.20 | 1 si el producto tiene el color pedido (nombre canónico: "charcoal"/"carbón" = gris); si no, cercanía del hex en Lab (CIE76, hasta 0.85); sin colores reconocibles ("Magical Forest") 0.5                                                                            |
| `visual_similarity` | 0.18 | similitud de estilo: qué parte de lo que describe la prenda aparece en el producto (sinónimos, alias como "desert boots" → botas, raíz corta) y estampado: pedir liso y recibir estampado multiplica por 0.4 (también "stripes", "checks"), liso declarado suma 0.15 |
| `fit_match`         | 0.12 | mismo fit 1; misma familia 0.75 (holgado: relajado/ancho/oversize/boxy; recto: recto/regular; ajustado: slim/skinny); recto contra otro 0.4; ajustado contra holgado 0; sin dato 0.5                                                                                 |
| `material_match`    | 0.07 | material pedido presente 1; misma familia 0.5 (lana/cashmere, algodón/piqué/gabardina…); otro 0.15; sin dato 0.5                                                                                                                                                     |
| `size_available`    | 0.10 | según `size_status`: talle en stock 1, sin verificar 0.4, agotado 0.1, no lo ofrece 0; sin talle pedido o accesorio 0.5                                                                                                                                              |
| `stock`             | 0.08 | `IN_STOCK` 1, `IN_STORE_ONLY` 0.6, `UNKNOWN` 0.4, `OUT_OF_STOCK` 0                                                                                                                                                                                                   |
| `price`             | 0.05 | con precio máximo: 1 si entra (y decae si no); sin máximo: relativo dentro del pool. Un producto sin precio (local físico) se rankea sin este factor                                                                                                                 |

**Por qué estos pesos.** El SPEC pide que la prioridad sea "qué tan bien reproduce el outfit" y que el precio sea secundario:

- **Estética (0.77):** categoría, estilo, color, fit y material. Color y categoría pesan lo mismo porque son lo primero que se ve; el estilo (estampado, tipo de prenda) va casi igual; fit y material son más finos y la página no siempre los dice.
- **Disponibilidad (0.18):** talle y stock. El talle pesa más que el stock porque ya incluye si el talle del usuario está en stock.
- **Precio (0.05):** con eso, un producto igual pero más barato solo desempata.

Medido con productos reales (`test/rank.test.ts`, pools grabados del paso 04b): la remera negra lisa de Legacy ($1290) le gana a su estampada ($1190) y a la estampada de Jack & Jones ($799); el pantalón ancho "Charcoal" le gana al skinny gris para un "pantalón sastrero relaxed", aunque el skinny tenga el talle 42.

**Talle del usuario** (`sizeStatusFor`): `sizeMatches` compara formas canónicas y entiende talles combinados (`XS/S`, cintura con largo `32/34`, `38 (L33)`, `M / W32 L33`).

| `size_status`    | Cuándo                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `AVAILABLE`      | hay variante de su talle en stock (o en local)                                                   |
| `OUT_OF_STOCK`   | su talle existe, agotado                                                                         |
| `NOT_OFFERED`    | la tienda publica talles del mismo sistema y el suyo no está                                     |
| `UNVERIFIED`     | sin talles publicados, stock desconocido u otro sistema (42 EU contra cintura 32/30 en pulgadas) |
| `NOT_REQUESTED`  | no cargó talle para esa prenda                                                                   |
| `NOT_APPLICABLE` | accesorio sin talle                                                                              |

**Filtro estricto**: con `strict_max_price` (paso 09) se descarta lo que supera el máximo y lo que no tiene precio. **Diversidad**: después de ordenar, cada producto de una tienda que ya aparece más arriba resta 0.03 al elegir el siguiente: el score no cambia, solo se evita que una tienda acapare el top con empates cercanos.

Los precios en USD se convierten con una tasa aproximada (`APPROX_UYU_PER_USD`) solo para comparar; nunca se muestra ese valor.

## Cache (paso 05, D12)

| Qué                                    | TTL  | Dónde                                               | Clave                                                            |
| -------------------------------------- | ---- | --------------------------------------------------- | ---------------------------------------------------------------- |
| Búsqueda (pool de productos validados) | 24 h | `shopping_search_cache` (`product_ids`, `stats`)    | sha256 de `poolQueryOf(query)`: prenda, términos, público y país |
| Producto (precio, stock, variantes)    | 8 h  | `products` + `product_variants` (`last_fetched_at`) | URL canónica                                                     |

- **El pool es de la prenda, no del usuario.** La clave no lleva talle, precio máximo, límite ni slot, y la cache guarda **todos** los productos validados, sin score. `searchProducts` re-rankea el pool en cada pedido: el mismo pool da órdenes distintos con talles distintos (test de integración y prueba real). `POOL_VERSION` invalida los pools si cambia qué entra en ellos.
- **Hit**: los productos verificados hace más de 8 h se revalidan (`refreshProduct`) antes de rankear. Si desaparecieron (404), salen del resultado. Una falla deja el stock en `UNKNOWN` y la fecha como estaba. Los demás no se vuelven a descargar.
- **Miss o vencido**: búsqueda en vivo; se guardan los productos (`upsertProducts`) y el pool (`savePool`), y se borran los pools vencidos.
- **Inyección**: `searchProducts(query, { cache })` recibe un `SearchCache`. En el worker es `createPostgresSearchCache(db)` (`@asesor/db`), y el paso 06 la conecta al job. En tests y desarrollo, `createMemorySearchCache()`. Una cache caída no rompe la búsqueda: va en vivo.
- **Revalidación antes de comprar**: `isProductStale(fetched_at)` (`@asesor/shared`, 8 h) lo usan el carrito y "Comprar" (pasos 08 y 10a). Si la revalidación falla, la disponibilidad pasa a `UNKNOWN` y la fecha no avanza.

## Persistencia (paso 05, `packages/db/src/shopping.ts`)

- `upsertProducts(db, products)` → URL → uuid. Es idempotente: el objetivo de conflicto es la URL canónica y los duplicados del lote se deduplican. Las variantes se upsertean por (producto, id externo) y solo se borran las que la tienda dejó de publicar: las que siguen conservan su uuid, porque el carrito las referencia.
- `saveLookProducts(db, { lookId, slot, items })`: guarda los productos y reemplaza el ranking de esa prenda de forma atómica (función SQL `replace_look_products`, solo service role).
- `getLookProducts(db, lookId)`: resultados por prenda y en orden. Con el cliente del usuario, la RLS solo se los muestra al dueño Premium.
- `getProductById`, `getProductsByIds`, `markProductVerified` (mueve `last_fetched_at`) y `markProductUnverified` (stock `UNKNOWN`, fecha intacta).
- `Product.id` (externo) ≠ `products.id` (uuid): la traducción la hace esta capa.

Prueba real: `apps/worker/scripts/real-shopping-ranking.ts [--account …] [--top M] [--bottom 42] [--shoe 42]`. Corre el look 1 de una cuenta local con la cache Postgres, guarda `look_products` e imprime el top 5 por prenda con su breakdown y los requests HTTP hechos.

## Seguridad

- Anti-SSRF en dos capas: `isSafeProductUrl` por nombre y `createSafeTransport` por IP al conectar (sin DNS rebinding), y cada redirect revalidado. Detalle en "Descarga segura".
- Los links a tiendas se abren con `rel="noopener noreferrer nofollow"`.
- El precio del carrito lo fija la base (trigger), nunca el cliente.

## Próximos pasos

1. Jobs reales: `SEARCH_PRODUCTS` con la cache y la persistencia, `REFRESH_PRODUCT` por uuid y progreso (06).
2. `visual_similarity` con embeddings de imagen.

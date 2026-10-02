# Motor de shopping

## Estado

- **Búsqueda real** (paso 03): LookSpec → `buildShoppingQueries` → `CompositeSearchProvider` (registro de tiendas por plataforma + sitemaps + descubrimiento web) → URLs candidatas de tiendas uruguayas.
- **Descarga, extracción y normalización reales** (paso 04a): fetcher endurecido (anti-SSRF con DNS y redirects, timeout, tamaño, robots, ritmo por dominio), extracción en cascada JSON-LD → microdata → OpenGraph y normalización de precios locales, categorías de Uruguay, fit, colores, materiales e ids estables.
- **Talles, stock, Validate y locales físicos** (paso 04b): variantes con talle y disponibilidad desde la plataforma de cada tienda (Fenicio, VTEX, Shopify, WooCommerce), talles normalizados, etapa Validate (página descargada, host de la tienda, Uruguay, precio, URL canónica, tiendas bloqueadas) y productos `IN_STORE_ONLY` con precio opcional, ubicación y contacto.
- **Ranking y cache persistente** (paso 05): ranking estético con talle del usuario y estado del talle, pesos documentados; cache de pools en Postgres (24 h) re-rankeada por pedido, frescura de producto (8 h) y persistencia idempotente de productos, variantes y `look_products`.
- **Jobs reales** (paso 06): `SEARCH_PRODUCTS` (look completo o una prenda) y `REFRESH_PRODUCT` en el worker, con la cache Postgres, progreso por etapas en `jobs.progress`, fallas parciales por prenda, Premium verificado en el servidor y en el worker, y `startLookShopping` / `startLookShoppingAction` para encolar.
- **Carrito** (paso 10a): agregar un producto con dato de más de 8 h espera su revalidación en el worker (hasta 8 s) y, si no llega, entra con el último dato y lo dice.
- **Mocks** (`MockSearchProvider`, `MockProductFetcher`, catálogo ficticio `.test`): solo con `SHOPPING_PROVIDER=mock` (tests y E2E). El default del worker es `live` y en producción `mock` está prohibido por el schema de env. El worker en `mock` (el que levanta el E2E, paso 12a) usa una cache de pools en memoria (la de Postgres no distingue mock de live), sella las páginas con la hora real y suma al catálogo una camisa de mujer que solo lo dice en su página (`FIXTURE_OTHER_AUDIENCE_PRODUCT`); los tests unitarios siguen con el reloj fijo y `FIXTURE_PRODUCTS`.

## Pipeline

```
ShoppingQuery
  → SearchCache           pool de la prenda (24 h); hit: revalida productos de más de 8 h y salta al ranking
  → SearchProvider        URLs candidatas
  → fetchProductPage      descarga segura (HttpProductFetcher → PoliteHttpClient → transporte con IP validada)
  → extractProduct        JSON-LD → microdata → OpenGraph → RawProduct (con la fuente de cada dato)
  → normalize + validate  primera pasada sin variantes: descarta lo que no sirve antes de consultar la plataforma
  → VariantEnricher       talles y stock de la plataforma (Fenicio, VTEX, Shopify, Woo); si falla, sin verificar
  → normalizeProduct      RawProduct → Product (Zod), o el motivo del descarte
  → validateProduct       página real, host de la tienda, vende en Uruguay, precio > 0, URL canónica
  → SearchCache           se guarda el pool completo (products, product_variants, shopping_search_cache)
  → rankProducts          por pedido: score ponderado + breakdown + estado del talle del usuario
  → saveLookProducts      ranking de la prenda en look_products (desde el job SEARCH_PRODUCTS, paso 06)
```

`loadCandidates` trabaja por fases sobre todas las candidatas: primero lee todas las páginas, después las compara (normalización y Validate, sin requests) y al final consulta la plataforma solo para las que pasaron. Las variantes solo cambian talles y stock, nunca precio, moneda ni título, así que nada de lo descartado en la primera pasada lo habría salvado la plataforma.

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
- **Público:** cada tienda del registro tiene su público (`MEN`, `WOMEN` o `ALL`). Las de otro público no se consultan por plataforma ni sitemap, y desde el paso 10b tampoco entran por el descubrimiento web cuando el resultado es de una tienda registrada (`storeServesAudience`). Indian se corrigió a `WOMEN` (`TIENDAS_UY.md`); `POOL_VERSION` 3 invalidó los pools que la incluían. Legacy pasó a `ALL` (tiene sección de mujer). **Desde el paso 11, además, cada producto trae el público que declara su página** (`Product.audience`: `MEN`, `WOMEN`, `UNISEX` o null): schema.org `gender`/`audience.suggestedGender`, la `seccion` de Fenicio (`"carac":{"seccion":"Hombre"}`), las migas (JSON-LD `BreadcrumbList` o microdata) y, si el producto no dice nada, la `Organization` de la tienda ("Tienda de Ropa para Mujer"; una tienda "de hombre y de mujer" no cuenta). Nunca se deduce de la foto ni del nombre de la prenda. `rankProducts` descarta lo del otro público (`forAudience`), en vivo y desde la cache, también en tiendas descubiertas. `POOL_VERSION` 4. Prueba real: en 5 prendas de hombre del registro, 5 productos de mujer (Legacy `"seccion":"Mujer"`, BAS miga `MUJER`) quedaron afuera.
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
- **Colores** (`inferColors`): los declarados (JSON-LD, microdata, variantes) o los del título, en español (`Black` → negro, `Navy` → azul marino, "GRIS OSCURO" → gris). Fenicio pone el color al final ("Pantalón - Negro - Blanco"). Del título solo salen colores del vocabulario: un nombre de fantasía ("Forest River") queda sin dato. **El color de una variante conserva el tono** ("Azul Oscuro" → "azul oscuro", paso 12b): una tienda Woo tenía `azul-claro` y `azul-oscuro` y quedaban iguales en el selector del carrito; `pickVariantForSize` prefiere, a igualdad de talle y stock, la del color y tono de la prenda del look. `POOL_VERSION` 5.
- **Materiales** (`inferMaterials`): declarados o nombrados en título o descripción (algodón, lino, lana, cuero, cuero sintético, gamuza, poliéster, viscosa, elastano…). "jean" solo cuenta en el título.
- **Talles** (`normalizeSizeLabel`, en `packages/shared` para comparar también el del usuario): letras `XS`…`4XL` (también "Small", "Grande" y los brasileños de Hering: `P`→S, `G`→L, `GG`/`XG`→XL), números `42`/`42.5`, pantalón con largo `32/34`, calzado `US 9`/`UK 8` (EU queda como número) y `ÚNICO`. La etiqueta original queda en `size_label` (Indian: `2XL`; Hering: `XG`).
- **Ids**: `Product.id` es el id de producto que declara la plataforma (`productGroupID`, `productID`) o, si no hay, la URL de la página (el SKU no sirve: VTEX FastStore usa `"1"` en todos los productos de H&M). Variantes: id de la plataforma (`?variant=` de Shopify) o SKU; sin ninguno, la variante se descarta (nunca el índice).
- **Fechas honestas**: `fetched_at` es el momento de la descarga exitosa. `refreshProduct` devuelve `verified` (datos y fecha nuevos), `gone` (404/410) o `failed` (con motivo); en los dos últimos la disponibilidad pasa a `UNKNOWN` y **`fetched_at` no cambia**: una falla no cuenta como verificación.

## Talles y stock por plataforma (paso 04b)

El JSON-LD casi nunca trae talles. `PlatformVariantEnricher` (`variants.ts`) los busca donde los publica la **plataforma** de la tienda (no hay código por tienda). La plataforma sale del candidato, del registro o de la huella del HTML (`detectPlatform`). Todo request pasa por `PoliteHttpClient`: robots.txt, ritmo por dominio, tope de tamaño y anti-SSRF.

| Plataforma  | Dónde                                                                                                                                                      | Talle                                                                    | Stock                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Fenicio     | la propia página: `ul#lstTalles > li > input[name=sku]` (sin request extra)                                                                                | `<b>` (en Indian `data-cpre` es un código); el `span.precio` no es talle | `li[data-stock]` "disponible"/"agotado", o `input[data-stock]` (cantidad)                        |
| VTEX        | `/api/catalog_system/pub/products/search?fq=skuId:<sku>` (SKU del JSON-LD)                                                                                 | la clave de `variations` que nombra el talle (`Talla`, `Talla Hombre`…)  | `IsAvailable` o `AvailableQuantity > 0` (viene topeado: solo sí/no)                              |
| Shopify     | `/products/<handle>.js`                                                                                                                                    | la opción `Talla`/`Talle`/`Size`                                         | `available` por variante; precio en centésimos                                                   |
| WooCommerce | Store API: `/wp-json/wc/store/v1/products?slug=<slug>`; stock y precio de `data-product_variations` de la página o, si no está, una consulta por variación | términos del atributo `Talle` (`pa_talle`)                               | `is_in_stock` de cada variación (de la página, todas; por la API, hasta 12 y las demás sin dato) |

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
- **Carrito** (paso 10a): un producto sin precio no se compra online; no entra al carrito ("Este producto se consigue en el local y no tiene precio publicado…"). El trigger también lo rechaza (`22023`) si se saltea la lógica. En el ranking, sin precio el producto se rankea sin ese factor (paso 05).
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

**Auditoría del paso 11** (`packages/shopping/test/partial-failures.test.ts`, un test por caso del SPEC): tienda que bloquea (403, 429, página de desafío anti-bot con 200 y 503), producto que desapareció (404 y 410 por el camino real de `HttpStatusError`), HTML que cambió (sin datos estructurados: no se adivina), sin talle (`UNVERIFIED` / `NOT_OFFERED`), extracción que falla, candidato que falla (error inesperado o red) y timeout: en todos, el candidato cuenta y las demás tiendas siguen. Arreglado en la auditoría: una entidad HTML numérica fuera de rango (`&#x110000;`) hacía lanzar a `String.fromCodePoint` y caía la búsqueda de toda la prenda; ahora queda como texto y, además, cualquier excepción de la extracción cuenta como `not_product` de ese candidato.

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

| Factor              | Peso | Cálculo                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `category_match`    | 0.20 | 1 misma categoría, 0.5 relacionada (remera ↔ camisa, abrigo ↔ blazer, pantalón ↔ jean), 0 → se descarta                                                                                                                                                                                                                                                                                                                                                                |
| `color_match`       | 0.20 | 1 si el producto tiene el color pedido (nombre canónico: "charcoal"/"carbón" = gris); si no, cercanía del hex en Lab (CIE76, hasta 0.85); sin colores reconocibles ("Magical Forest") 0.5. Del tono contrario (claro por oscuro) 0.45 aunque el nombre coincida (paso 12b)                                                                                                                                                                                             |
| `visual_similarity` | 0.18 | similitud de estilo: qué parte de lo que describe la prenda aparece en el producto (sinónimos, alias como "desert boots" → botas, raíz corta) y estampado: pedir liso y recibir estampado multiplica por 0.4 (también "stripes", "checks"), liso declarado suma 0.15. Otra opción de un rasgo excluyente (cuello V o medio cierre por redondo, manga larga por corta) y cada rasgo visible no pedido (deporte, montaña, capucha, cargo) multiplican por 0.4 (paso 12b) |
| `fit_match`         | 0.12 | mismo fit 1; misma familia 0.75 (holgado: relajado/ancho/oversize/boxy; recto: recto/regular; ajustado: slim/skinny); recto contra otro 0.4; ajustado contra holgado 0; sin dato 0.5. Si la prenda pide una medida en mm y el título dice la suya (caja de reloj): hasta 3 mm 1, hasta 6 mm 0.6, más 0.15 (paso 12b)                                                                                                                                                   |
| `material_match`    | 0.07 | material pedido presente 1; misma familia 0.5 (lana/cashmere, algodón/piqué/gabardina…); otro 0.15; sin dato 0.5                                                                                                                                                                                                                                                                                                                                                       |
| `size_available`    | 0.10 | según `size_status`: talle en stock 1, sin verificar 0.4, agotado 0.1, no lo ofrece 0; sin talle pedido o accesorio 0.5                                                                                                                                                                                                                                                                                                                                                |
| `stock`             | 0.08 | `IN_STOCK` 1, `IN_STORE_ONLY` 0.6, `UNKNOWN` 0.4, `OUT_OF_STOCK` 0                                                                                                                                                                                                                                                                                                                                                                                                     |
| `price`             | 0.05 | con precio máximo: 1 si entra (y decae si no); sin máximo: relativo dentro del pool. Un producto sin precio (local físico) se rankea sin este factor                                                                                                                                                                                                                                                                                                                   |

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

**Filtro estricto**: con `strict_max_price` (paso 09) se descarta lo que supera el máximo y lo que no tiene precio. **Diversidad**: después de ordenar, cada producto de una tienda que ya aparece más arriba resta 0.03 al elegir el siguiente, y cada copia del mismo producto (mismo título y precio, en otra tienda o URL) resta 0.15: el score no cambia, solo se evita que una tienda o un mismo modelo acaparen el top. **Lo que no se parece va después** (`LOW_SIMILARITY`): con similitud de estilo menor a 0.2 (un canguro estampado por un buzo de punto liso, botas de senderismo por unas chelsea) el producto queda después de todo lo que sí se parece, aunque tenga mejor color o talle; no se saca.

**Ajustes de la prueba real (paso 12b).** Con los looks de un usuario real aparecieron: un jean "Azul Claro" para un look de lavado oscuro (el color canónico perdía el tono), un reloj de 28 mm para uno de 40 mm, una remera cuello V para una de cuello redondo, el mismo championes en tres tiendas, championes de fútbol 5 como "más baratos" que unos urbanos, botas de senderismo y de nieve por unas chelsea, camperas con capucha por una Harrington, un cargo por un chino y un canguro estampado por un buzo de punto. Cada uno tiene su test con el título real (`test/rank.test.ts`, "prueba real del paso 12b"). El tono vive en `@asesor/shared` (`colorShade`, `garmentShade`) porque también lo usa el carrito para elegir la variante.

Los precios en USD se convierten con una tasa aproximada (`APPROX_UYU_PER_USD`) solo para comparar; nunca se muestra ese valor.

## Cache (paso 05, D12)

| Qué                                    | TTL  | Dónde                                               | Clave                                                            |
| -------------------------------------- | ---- | --------------------------------------------------- | ---------------------------------------------------------------- |
| Búsqueda (pool de productos validados) | 24 h | `shopping_search_cache` (`product_ids`, `stats`)    | sha256 de `poolQueryOf(query)`: prenda, términos, público y país |
| Producto (precio, stock, variantes)    | 8 h  | `products` + `product_variants` (`last_fetched_at`) | URL canónica                                                     |

- **El pool es de la prenda, no del usuario.** La clave no lleva talle, precio máximo, límite ni slot, y la cache guarda **todos** los productos validados, sin score. `searchProducts` re-rankea el pool en cada pedido: el mismo pool da órdenes distintos con talles distintos (test de integración y prueba real). `POOL_VERSION` invalida los pools si cambia qué entra en ellos.
- **Hit**: los productos verificados hace más de 8 h se revalidan (`refreshProduct`) antes de rankear. Si desaparecieron (404), salen del resultado. Una falla deja el stock en `UNKNOWN` y la fecha como estaba. Los demás no se vuelven a descargar.
- **Miss o vencido**: búsqueda en vivo; se guardan los productos (`upsertProducts`) y el pool (`savePool`), y se borran los pools vencidos.
- **Inyección**: `searchProducts(query, { cache })` recibe un `SearchCache`. En el worker es `createPostgresSearchCache(db)` (`@asesor/db`), conectada al job desde el paso 06. En tests y desarrollo, `createMemorySearchCache()`. Una cache caída no rompe la búsqueda: va en vivo.
- **Qué no se guarda** (paso 06): un pool vacío (puede ser una falla pasajera de las tiendas y escondería productos por 24 h) ni una búsqueda cortada por timeout o apagado.
- **Revalidación antes de comprar**: `isProductStale(fetched_at)` (`@asesor/shared`, 8 h) lo usan el carrito y "Comprar" (pasos 08 y 10a). Si la revalidación falla, la disponibilidad pasa a `UNKNOWN` y la fecha no avanza. Detalle en "Revalidación antes de agregar al carrito".

## Persistencia (paso 05, `packages/db/src/shopping.ts`)

- `upsertProducts(db, products)` → URL → uuid. Es idempotente: el objetivo de conflicto es la URL canónica y los duplicados del lote se deduplican. Las variantes se upsertean por (producto, id externo) y solo se borran las que la tienda dejó de publicar: las que siguen conservan su uuid, porque el carrito las referencia.
- `saveLookProducts(db, { lookId, slot, items })`: guarda los productos y reemplaza el ranking de esa prenda de forma atómica (función SQL `replace_look_products`, solo service role).
- `getLookProducts(db, lookId)`: resultados por prenda y en orden. Con el cliente del usuario, la RLS solo se los muestra al dueño Premium.
- `getProductById`, `getProductsByIds`, `markProductVerified` (mueve `last_fetched_at`) y `markProductUnverified` (stock `UNKNOWN`, fecha intacta).
- `Product.id` (externo) ≠ `products.id` (uuid): la traducción la hace esta capa.

Prueba real: `apps/worker/scripts/real-shopping-ranking.ts [--account …] [--top M] [--bottom 42] [--shoe 42]`. Corre el look 1 de una cuenta local con la cache Postgres, guarda `look_products` e imprime el top 5 por prenda con su breakdown y los requests HTTP hechos.

## Jobs (paso 06, D13 y D14)

### `SEARCH_PRODUCTS`

Payload `{ user_id, look_id, sizes, slot?, max_price? }` (`SearchProductsPayloadSchema`). Un job por look; con `slot`, una sola prenda ("Buscar más barato", paso 09) y `max_price` estricto.

1. **Autorización otra vez en el worker** (corre con service role): el job tiene que ser del usuario del payload, el look del usuario (`getLookForUser`) y el usuario Premium hoy (`isUserPremium`). `PREMIUM_REQUIRED` y `NOT_FOUND` no se reintentan.
2. **Queries**: `buildShoppingQueries` con los talles del pedido y el público del perfil del look (`getStyleProfileCore` + `audienceForProfile`).
3. **Prendas en paralelo** con `searchProducts` y la cache Postgres. El cliente HTTP ya limita por tienda (2 a la vez, una cada 300 ms), así que el paralelismo no apura a ninguna tienda. Timeout del job: 4 minutos (`AbortSignal.any` con el apagado del worker); una búsqueda cortada no se cachea.
4. **Persistencia**: `saveLookProducts` por prenda (reemplazo atómico). En una búsqueda completa, las prendas que fallaron quedan vacías (no conservan resultados viejos) y se borran los resultados de prendas que ya no están en el look (`removeLookProductsExcept`). En el modo de una prenda solo se toca esa prenda.
5. **Fallas parciales**: cada prenda falla sola. Si fallan todas, el job falla (y se reintenta: `maxAttempts` 2) y los resultados anteriores quedan como estaban.
6. **Resumen** (`ShoppingSearchSummary`, solo conteos) en `jobs.result` y en el último `progress.summary`: prendas con resultados, prendas fallidas, candidatos, productos, guardados, stock y talle sin verificar, `partial` (alguna prenda falló o quedó sin productos) y hits de cache.
7. **Analytics y costos**: `shopping_completed` (servidor, propiedades planas) y una fila `WEB_SEARCH` en `ai_usage` con el costo de las búsquedas web del job.

### Progreso por etapas

`searchProducts(query, { onStage })` llama a `onStage` en cada frontera real del pipeline:

| Etapa             | Texto en la UI                         | Qué pasa                                                                                |
| ----------------- | -------------------------------------- | --------------------------------------------------------------------------------------- |
| `SEARCHING`       | "Buscando prendas…"                    | Buscar la prenda en la cache o URLs candidatas (registro, sitemaps, descubrimiento web) |
| `CHECKING_STORES` | "Revisando tiendas…"                   | Descargar y leer las páginas de producto                                                |
| `COMPARING`       | "Comparando opciones…"                 | Normalizar y validar cada producto (sin requests)                                       |
| `VERIFYING`       | "Verificando precios y talles…"        | Talles y stock por plataforma; con un pool cacheado, revalidar lo de más de 8 h         |
| `RANKING`         | "Ordenando las mejores coincidencias…" | Ranking con el talle del usuario y guardado                                             |

Con un pool cacheado: `SEARCHING → VERIFYING → RANKING`. El job (`createStageTracker`) reporta la etapa de la prenda **más atrasada**, así nunca retrocede, más `slots_done`/`slots_total`. Solo escribe cuando algo cambia, en orden, y un error al guardarlo no corta la búsqueda. Sin porcentajes.

### Inicio y lectura (`packages/db/src/shopping-jobs.ts`, D22)

- `startLookShopping({ userClient, serviceClient, lookId, sizes, slot?, maxPrice?, requestId })`: Premium (`requirePremium` con el cliente del usuario), dueño del look (RLS), prenda existente en el look, **talles relevantes cargados** (si faltan, `VALIDATION_FAILED` con el mensaje `MISSING_SIZES`; paso 07), una búsqueda activa por (look, prenda) y encolado con prioridad 8 (debajo del análisis y del look gratis, arriba de los looks Premium), `maxAttempts` 2 y clave `search:<look>:<slot|look>:<requestId>`. Si ya hay una activa, la devuelve (`alreadyRunning`). Una carrera entre dos pedidos la frena el índice único de búsquedas activas.
- `startLookShoppingAction(prev, formData)` (web, `app/app/looks/[id]/actions.ts`, paso 07): action de formulario. `requirePremium` → estado `paywall` para free; Zod; si el formulario trae talles (`top`, `bottom`, `shoe`, `shoe_size_system`), los guarda en el perfil (`saveUserSizes`); lee los talles del perfil; rate limit `shoppingSearch` (10 por hora por usuario); `startLookShopping`; `shopping_started` y `revalidatePath`. Estados: `queued`, `already_running`, `paywall`, `needs_sizes` o `error` con texto humano. Nunca devuelve errores técnicos.
- `getLatestLookSearch(client, lookId, { slot? })` / `getLookShoppingState(lookId)` (web): estado y progreso del último job, con el cliente del usuario. El panel de progreso del detalle del look lo consulta cada 2,5 s por `GET /api/looks/[id]/shopping` (solo el estado del job, sin re-renderizar la página) y, cuando termina, refresca la página una vez.

### "Buscar más barato" (paso 09, D17)

- **Pedido:** `findCheaperAlternativeAction(prev, formData)` (web, capa fina: `requirePremium`, Zod, rate limit `cheaperSearch` 20/hora por usuario, `cheaper_alternative_requested` con `look_id`, `slot`, `product_id`, `price` y `currency`, una sola vez y desde el servidor) → `startCheaperSearch({ userClient, serviceClient, lookId, productId, sizes, requestId })` (`@asesor/db`): el producto tiene que ser un resultado de ese look (RLS: dueño Premium) y tener precio (si no, `NO_PRICE`). Encola `SEARCH_PRODUCTS` en el modo de una prenda: `slot` de ese producto, `max_price` = su precio y `reference_product_id`. La misma regla de una búsqueda activa por (look, prenda) hace que pedirlo dos veces no encole otra.
- **Búsqueda:** la query es la de la prenda del LookSpec (categoría, descripción, color, fit, material, estampado, términos y público: no se regenera el look ni se buscan las otras prendas) con `strict_max_price`. `rankProducts` descarta lo que cuesta **lo mismo o más** (precio menor estricto; entre UYU y USD compara con la conversión aproximada, solo para filtrar) y ordena por parecido: con tope, el factor precio vale 1 para todo lo que entra, así que manda la estética. Casi siempre sale del pool cacheado (24 h) en menos de un segundo; sin pool, va en vivo.
- **Guardado:** las mejores 4 (`CHEAPER_LIMIT`) van a `look_products` como lista `CHEAPER`, con el producto de referencia y el tope (`replace_cheaper_look_products`): no repiten productos del ranking principal ni el de referencia, reemplazan las más baratas anteriores de la prenda y no tocan el ranking principal. Una búsqueda nueva de la prenda o del look descarta las más baratas.
- **UI:** "Buscar más barato" (vidrio) en cada producto con precio; mientras corre, el progreso compacto en la fila (las etapas del paso 07, por `GET /api/looks/[id]/shopping?slot=`); después, "Más baratas que $ X · frente a <producto>", ordenadas por parecido, con "$ N menos" (si están en otra moneda, sin diferencia y con una aclaración). Sin resultados: "No encontramos opciones más baratas que conserven el estilo."

### Resultados en la UI (paso 08)

- **Lectura:** `getLookProducts` (cliente del usuario; RLS: dueño Premium) → `buildLookResults` (`apps/web/src/lib/look-results.ts`, puro y con tests): por prenda del look, el RECOMENDADO (rank 1) y las alternativas (las 3–5 opciones que guardó la búsqueda), con precio en su moneda real (`$ 1.399`, `US$ 79`; sin precio, "Precio a consultar"), talle del usuario según `size_status` y `user_size` ("Talle M ✓", "Talle 42 agotado", "No hay talle 42", "Talle sin verificar"), stock (`En stock`, `Sin stock`, `Stock sin verificar`, `Disponible en tienda física`), "verificado hace X" y el aviso de más de 8 h. Prendas sin opciones o fallidas se dicen, no se esconden.
- **Total:** suma de los recomendados por moneda, nunca convertida (la conversión aproximada del ranker no se muestra como precio). Si falta algún precio o hay dos monedas, subtotales.
- **Comprar:** `GET /api/products/[id]/open` redirige a la página real; si el dato tiene más de 8 h, encola `REFRESH_PRODUCT` (`enqueueProductRefresh`) y redirige sin esperar: la tienda muestra el precio de hoy y la app se actualiza para la próxima vez.
- **Eventos:** `product_viewed` (una vez por producto y sesión del navegador; las alternativas, al abrirlas) y `external_product_clicked` (`product_id`, `store_domain`, `look_id`, `slot`, `rank`), desde el cliente. `product_clicked`, que nadie emitía, se reemplazó por `external_product_clicked`.

### Nunca inventar (auditoría del paso 11)

- **Revalidación fallida:** el stock del producto **y de cada talle** pasa a `UNKNOWN` (en el `Product`, en `data_json` y en `product_variants`), y `last_fetched_at` no avanza. Antes los talles conservaban su `IN_STOCK` viejo y el ranking seguía diciendo "tu talle en stock".
- **Moneda de una variante:** sin moneda propia toma la del producto; con una moneda no soportada (ARS) su precio queda nulo, nunca se le pone otra.
- **Talles:** "Calce" no es una clave de talle (en Uruguay es el fit: "Calce: Regular"); en Fenicio, sin etiqueta visible, `data-cpre` solo se usa si parece un talle (en Indian es un código).
- **Precio en tu talle:** el precio de un producto es el menor de sus variantes, pero el mismo talle puede costar otra cosa en otro color (Decathlon NH500: 42 canela $ 2.813 agotado, 42 azul/negro $ 4.090). `priceForSize` (`@asesor/shared`) da lo que se paga en el talle buscado: lo usan los resultados (con la marca "en tu talle"), el total del look y el `listedPrice` del carrito.
- **Validación externa:** las APIs de plataforma, la búsqueda web y los sitemaps pasan por Zod (`parseExternal`); el HTML de producto se lee a mano (JSON-LD, microdata, OpenGraph son heterogéneos) y lo que sale se valida con `ProductSchema` al normalizar. Los pools cacheados se vuelven a validar al leerlos.

### `REFRESH_PRODUCT`

Payload `{ product_id }` (uuid de `products`). Carga el producto, lo re-extrae con `refreshProduct` (1 minuto de timeout) y guarda con `markProductVerified` (precio, stock, variantes y `last_fetched_at`) o, si no se pudo verificar (404, bloqueo, falla), `markProductUnverified` (stock `UNKNOWN`, fecha intacta). Devuelve `{ product_id, status, availability }`. Un apagado del worker no marca el producto.

Prueba real: `apps/worker/scripts/real-shopping-job.ts [--keep]`, con el worker en `AI_PROVIDER=mock SHOPPING_PROVIDER=live`: usuarios locales nuevos, la búsqueda de un look seguida etapa por etapa como la UI, una segunda corrida desde la cache con dos pedidos simultáneos, el modo de una prenda con precio máximo, `REFRESH_PRODUCT` y el rechazo de un usuario free.

### Revalidación antes de agregar al carrito (paso 10a, D18)

SPEC "CACHE": antes de agregar al carrito un producto con dato viejo (más de 8 h), se revalida. La web nunca descarga páginas de tiendas: lo hace el worker con `REFRESH_PRODUCT`, y el carrito espera un tiempo corto.

- **`enqueueProductRefresh(service, productId)`** (`@asesor/db`): prioridad 9 (antes que las búsquedas), 2 intentos y clave de idempotencia `refresh:<producto>:<hora UTC>`. La comparten "Comprar ↗" y el carrito: un pedido repetido, o una tienda que viene fallando, no se vuelve a consultar dentro de la misma hora.
- **`waitForProductRefresh(service, productId)`**: encola y consulta el job cada 250 ms hasta 8 s (`PRODUCT_REFRESH_WAIT_MS`). Devuelve `verified`, `gone`, `failed` o `pending` (no terminó a tiempo: el job sigue y actualiza el producto después). Si el job de esta hora ya terminó, devuelve ese resultado sin esperar. Prueba real: 1,8–2,1 s con el worker libre (Indian y Jack & Jones).
- **`addToCart` / `swapCartItem`** (`@asesor/db/src/cart.ts`) la reciben inyectada (`RevalidateProduct`) y la usan solo si `isProductStale`. Según el resultado:

  | Resultado                        | Qué pasa                                                         | Lo que ve el usuario                               |
  | -------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------- |
  | dato fresco (< 8 h)              | No se consulta la tienda                                         | —                                                  |
  | `verified` y el dato quedó nuevo | Precio, stock y talles de hoy; el trigger fija el precio nuevo   | "El precio cambió: antes $ X, ahora $ Y" si cambió |
  | `failed`, o `verified` viejo     | Entra con el último precio; stock `UNKNOWN` (la fecha no avanza) | "No pudimos verificar el stock con la tienda…"     |
  | `pending`                        | Entra con el último precio; stock `UNKNOWN`; el job sigue        | "No pudimos verificar el precio y el stock ahora…" |
  | `gone`                           | No entra (`PRODUCT_GONE`)                                        | "Este producto ya no está publicado en la tienda." |

- **Talle**: sin talle elegido, la variante del talle del perfil para esa categoría (`sizeForCategory`) o, si no lo cargó, el de la búsqueda de la prenda (`look_products.user_size`); `pickVariantForSize` prefiere el exacto al combinado y en stock a agotado. Al cambiar por otra alternativa, el mismo criterio (o el talle que tenía el ítem). Una tienda puede tener el talle en varios colores con precios distintos (Decathlon NH500: 42 canela a $ 2.813 agotado, 42 azul y negro a $ 4.090): el resultado de agregar trae `listedPrice` (lo que se mostraba) y la variante elegida, y la UI avisa "En el talle 42 (azul) cuesta $ 4.090; en la búsqueda figuraba $ 2.813". El selector del carrito muestra talle y color, ordenados (`compareSizes`).
- **Look completo** (`addLookToCart`, paso 10b): el recomendado de cada prenda que todavía no tiene nada en el carrito para ese look (si el usuario eligió otra opción u otro talle, se respeta), en paralelo; las que no entran (sin precio, ya no publicadas) se informan sin frenar a las demás.
- **Precio del ítem**: lo fija la base desde el catálogo (trigger), al agregar y al cambiar producto o talle. El view model del carrito (`buildCartView`) usa el precio actual del catálogo y avisa si cambió desde que se agregó; subtotal por moneda y total único "aprox." en pesos solo con monedas mezcladas.

Prueba real: `apps/worker/scripts/real-cart.ts [--quick] [--keep]` (sin descubrimiento web, USD 0).

## Seguridad

- Anti-SSRF en dos capas: `isSafeProductUrl` por nombre y `createSafeTransport` por IP al conectar (sin DNS rebinding), y cada redirect revalidado. Detalle en "Descarga segura".
- Los links a tiendas se abren con `rel="noopener noreferrer nofollow"`.
- El precio del carrito lo fija la base (trigger), nunca el cliente: no tiene grant sobre esas columnas.

## Próximos pasos

1. `visual_similarity` con embeddings de imagen.
2. "Buscar más barato" con más candidatos: hoy filtra el pool de la prenda (el mismo que el ranking); si no alcanza, una búsqueda en vivo con más resultados por tienda u ordenada por precio en las plataformas que lo permiten.

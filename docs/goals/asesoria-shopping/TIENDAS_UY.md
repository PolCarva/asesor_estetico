# Tiendas uruguayas: relevamiento inicial

Pruebas en vivo del **2026-09-30** con curl y user agent de navegador, desde una IP residencial de la región. Son **pistas**: los sitios cambian y una IP de datacenter (worker en producción) puede recibir más bloqueos. Verificá antes de apoyarte en un dato y actualizá este archivo con lo que encuentres.

## Resumen por plataforma

| Tienda             | Dominio                      | Plataforma       | Datos estructurados                                         | Búsqueda / catálogo accesible                                                              | robots.txt                                                |
| ------------------ | ---------------------------- | ---------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Legacy             | legacy.com.uy                | Fenicio          | Microdata schema.org (sin JSON-LD) + og:image               | HTML `/catalogo?q=<término>`; sitemap `/sitemap/catalogo-articulos.xml`                    | Permite todo                                              |
| Hering             | www.hering.com.uy            | Fenicio          | Microdata                                                   | `/catalogo?q=` (léxica: "remera" 0 resultados, "camiseta" 354)                             | Permite todo                                              |
| Indian             | www.indian.com.uy            | Fenicio          | Microdata (`data-cpre` son códigos, el talle está en `<b>`) | `/catalogo?q=`                                                                             | Permite todo                                              |
| Lolita             | lolita.com.uy                | Fenicio          | Microdata                                                   | `/catalogo?q=` (productos en `/productos/...`)                                             | Permite todo                                              |
| Stadium            | www.stadium.com.uy           | Fenicio          | Microdata                                                   | Búsqueda **bloqueada** por robots; usar sitemap `sitemap.xml`                              | Prohíbe `/*?*q=`, `/*?*page=`, `/ajax`, `/api`, `/buscar` |
| La Isla            | laisla.com.uy                | Fenicio          | Microdata                                                   | `/catalogo?q=`                                                                             | Permite todo                                              |
| Zooko              | www.zooko.com.uy             | Fenicio          | Microdata                                                   | `/catalogo?q=`                                                                             | Permite todo                                              |
| H&M                | uy.hm.com                    | VTEX IO          | JSON-LD Product (UYU, availability)                         | API VTEX funciona pero robots la prohíbe → páginas + sitemap                               | `Disallow: /*_*` (bloquea `/api/...`), `/busca/`          |
| Adidas             | www.adidas.com.uy            | VTEX IO          | JSON-LD Product con AggregateOffer (UYU)                    | `/api/catalog_system/pub/products/search?ft=` (talle: `Talla`)                             | Solo prohíbe `/busca/`, cuenta y checkout                 |
| BAS                | www.bas.com.uy               | VTEX (FastStore) | —                                                           | API funciona pero robots la prohíbe                                                        | `Disallow: /api/`                                         |
| Jack & Jones       | jackjones.com.uy             | Shopify          | JSON-LD Product, un Offer por variante                      | `/search/suggest.json?q=&resources[type]=product`, `/products.json` (opciones Color/Talla) | Permite esos endpoints                                    |
| Decathlon          | decathlon.com.uy             | Shopify          | JSON-LD **ProductGroup** con `hasVariant`                   | `suggest.json`, `products.json`                                                            | —                                                         |
| Tiendas Montevideo | www.tiendasmontevideo.com.uy | WooCommerce      | —                                                           | Store API `/wp-json/wc/store/v1/products?search=` (precios en unidades menores)            | Permisivo (poca ropa)                                     |
| Pigalle, Mosca     | pigalle.com.uy, mosca.com.uy | Magento 2        | —                                                           | GraphQL `/graphql`                                                                         | `Disallow: /*?` (poca ropa, baja prioridad)               |

## Tiendas bloqueadas o sin datos verificables

- **Zara UY** (`www.zara.com/uy/es/`): vende online, pero Akamai Bot Manager devuelve un intersticial o 403 a requests no-navegador. robots prohíbe query strings y `/itxrest/*/availability`. No se pudo verificar su JSON-LD.
- **Nike UY** (`www.nike.com.uy`): Cloudflare "Sorry, you have been blocked" (403), incluso en robots.txt.
- **Renner UY** (`www.renner.com.uy`): el dominio resuelve, pero la conexión dio timeout. No se verificó si vende online.
- **Stadium Sport**: `stadiumsport.com.uy` no resuelve; solo existe `stadium.com.uy`.
- **Mercado Libre UY**: la API `/sites/MLU/search?q=` devuelve 403 sin OAuth, y la documentación actual solo muestra búsqueda por vendedor. El listado HTML redirige a verificación de cuenta, y el robots.txt **prohíbe todo** a ClaudeBot, Claude-User, GPTBot, ChatGPT-User, etc. No planificar scraping de Mercado Libre. Queda documentado como limitación, salvo que aparezca una vía oficial.
- **Tienda Inglesa**: Cloudflare 403 en HTML, y es principalmente supermercado.

Para las bloqueadas, lo honesto es no mostrarlas, o como mucho mostrar el link sin precio ni stock inventado (decisión del paso 04b). No intentes evadir protecciones anti-bot.

## Dónde están talles y stock

Casi nunca están en el JSON-LD. Hace falta el dato de la plataforma:

- **Fenicio:** `#lstTalles input[name=sku][data-cpre=<talle>][data-stock=<cantidad>]` dentro de `li[data-stock=disponible]`. En Indian `data-cpre` es un código y la etiqueta visible está en `<b>`.
- **VTEX:** en la API de catálogo, `items[].variations` (la clave varía: `Talla`, `Talla Mujer`, `TALLE`), con `commertialOffer.Price` y `AvailableQuantity`. `AvailableQuantity` viene topeado u ofuscado (100/10/0): usalo solo como booleano. La API no trae moneda: tomala del JSON-LD (`priceCurrency`) o de `product:price:currency`.
- **Shopify:** `products.json` trae variantes con `available` y las opciones (`Talla`). En el JSON-LD hay un Offer por variante: la disponibilidad del producto es "alguna variante disponible", no `offers[0]`.
- **WooCommerce:** atributos (`Talle`), `is_in_stock`. Precios en unidades menores (`97900` con `currency_minor_unit: 2` = UYU 979).

## Trampas de parsing

- `og product:price:amount` puede usar punto de miles (`6.390` en Decathlon). El `asNumber` actual lo convertiría en 6.39, y `1.890,00` lo descarta.
- Fenicio muestra "UYU 1.690", pero el microdata `content="1690"` está limpio. Algunas tiendas cobran en USD: leé siempre la moneda, no la supongas.
- Fenicio embebe un tipo de cambio (`var FN_TC = {M1: 40.31}`): no lo uses para mostrar precios convertidos.
- La búsqueda de Fenicio es léxica: hace falta expansión de sinónimos (remera ↔ camiseta ↔ t-shirt, buzo ↔ sweater ↔ suéter, campera ↔ chaqueta ↔ abrigo, pollera ↔ falda, championes ↔ zapatillas, musculosa, short ↔ bermuda…).

## Búsqueda web (descubrimiento de tiendas fuera del registro)

- **OpenRouter** (ya hay clave en el proyecto): `:online` y el plugin `web` están **deprecados**. Lo vigente es la server tool `tools: [{ type: 'openrouter:web_search', parameters: { engine, max_results, allowed_domains, … } }]`, que devuelve `message.annotations[]` de tipo `url_citation`. Con modelos no nativos usa Exa (~USD 0.007 por búsqueda + tokens); `user_location` (país UY) solo lo respetan los motores nativos. Hay también `openrouter:web_fetch`. Tratá las URLs como candidatas y **siempre** volvé a descargar y extraer: nunca uses precios dichos por el LLM. Las consultas no pueden llevar fotos ni datos personales.
- **Alternativas con clave propia:** Tavily (`country: 'uruguay'`, 1000 créditos gratis por mes), Serper (`gl=uy`, ~USD 1 por 1000 consultas), Exa directo (`userLocation`, `includeDomains`). Brave no soporta UY en `country`. La API de Google Custom Search está cerrada a clientes nuevos.

Fuentes: docs de OpenRouter (`/docs/guides/features/server-tools/web-search.md`, `/web-fetch.md`, `/plugins/web-search.md`), docs de Mercado Libre (`developers.mercadolibre.com.ar/es_ar/items-y-busquedas`), Tavily, Exa, Brave, y probes en vivo de cada tienda.

## Verificado en el paso 03 (2026-09-30, user agent `AsesorEsteticoBot/1.0`)

- **Fenicio:** el listado `/catalogo?q=` de Legacy, Hering, Indian, La Isla, Zooko (y de tiendas halladas por descubrimiento: Cuatro Ases, Santander, Amadeus, Minot, Harrington…) tiene el mismo markup: `<div class='it …'><div class='cnt'><a class="img" href="…" title="…">`. En La Isla falta el `title` (se usa el slug). **Lolita** redirige `/catalogo` a `/productos`: en el registro va con `searchPath: '/productos'`. Las URLs de producto son `/catalogo/<slug>_<código>` (Lolita y Stadium: `/productos/…`).
- **Stadium:** cubierta por sitemap. `sitemap.xml` es un índice; `sitemap/catalogo-articulos.xml` lista ~5500 productos con slug descriptivo (`championes-de-hombre-adidas-galaxy-8-m-negro_…`) y `<image:loc>`.
- **BAS:** robots.txt solo prohíbe `/api/`, `/checkout/`, cuenta y wishlist. Cubierta por sitemap: índice con 13 `sitemap/product-N.xml` de slugs descriptivos (`/sobrecamisa-jean-azul-1000481678/p`).
- **H&M:** robots.txt prohíbe `/busca/` y `/*_*` (eso incluye `/api/catalog_system/...?ft=`) y solo permite `/api/catalog_system/pub/products/search?fq=` (filtros, no texto). `sitemap/product-N.xml` tiene solo ids (`/0450182003/p`), sin términos para filtrar, y las páginas de categoría (`/hombre/remeras`) se renderizan en el cliente, sin links de producto en el HTML. **Motivo de no cubrirla por sitemap:** no hay forma de elegir productos por término sin descargar miles de páginas. Queda en el registro como `DISCOVERY`: llega por la búsqueda web (aparecieron páginas de `uy.hm.com`).
- **Adidas (VTEX):** la API `?ft=` responde (206) y robots lo permite. **Jack & Jones** y **Decathlon** (Shopify): `suggest.json` responde con título y URL relativa con tracking (`?_pos=…`), que se limpia.
- **Tiendas Montevideo (Woo):** la Store API responde, pero casi no vende ropa (una "camisa" es una camisa de dormir): devuelve poco o nada pertinente.
- **Descubrimiento web (`openrouter:web_search`, Exa):** funciona con la clave existente, ~USD 0.011 por consulta. Devuelve también tiendas de Argentina, Chile, Paraguay y listados de Mercado Libre: se filtran por host `.uy` y `BLOCKED_DOMAINS`. A veces cita páginas que ya no existen (404) o de categoría: se descartan al descargar.

## Verificado en el paso 04a (2026-10-01, páginas de producto con `AsesorEsteticoBot/1.0`)

Qué fuente de la cascada da los datos en cada plataforma (fixtures recortados en `packages/shopping/test/fixtures/`):

| Plataforma     | Tiendas probadas                                                                                                                   | Fuente                  | Notas                                                                                                                                                                                                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fenicio        | Legacy, Hering, Indian, La Isla, Zooko, Stadium; fuera del registro: Santander, Peppos, Piece of Cake, Canva Store, New Balance UY | Microdata (sin JSON-LD) | Less is More (Fenicio, `X-Powered-By: MV`) es la excepción: trae JSON-LD. Bloque oculto `itemscope itemtype=schema.org/Product` con `price` en `content` limpio (`2190`) y moneda; imagen relativa al protocolo (`//f.fcdn.app/...`). El color va al final del título ("- Arena", "- Negro - Blanco"). |
| VTEX IO        | Adidas                                                                                                                             | JSON-LD                 | `AggregateOffer` con un `Offer` por SKU (disponibilidad por talle). La categoría solo está en `product:category` (OpenGraph). `og:url` apunta a una ruta interna (`/_v/segment/...`): no usarla.                                                                                                       |
| VTEX FastStore | BAS, H&M                                                                                                                           | JSON-LD                 | `Product` con un solo `Offer` y `BreadcrumbList`. El `sku` no identifica al producto (H&M: `"1"` en todos): el id es la URL. BAS publica precio `0` (JSON-LD y `product:price:amount`) en algunos agotados → sin precio, no se muestra.                                                                |
| Shopify        | Jack & Jones, Decathlon                                                                                                            | JSON-LD                 | Jack & Jones: `Product` con un `Offer` por variante (`url` con `?variant=`). Decathlon: `ProductGroup` con `hasVariant`, sin ofertas ni imagen propias, y precios distintos por variante. OpenGraph con miles: `og:price:amount` `1,499` (J&J) y `product:price:amount` `6.390` (Decathlon).           |

- **Prueba real** (`real-product-extraction.ts`): look 1 sin descubrimiento → 59 de 59 candidatas con producto válido en 8 tiendas (Fenicio, VTEX, Shopify); look 3 con descubrimiento → 55 de 60 en 16 tiendas (6 fuera del registro). Las fallas fueron páginas de categoría citadas por el buscador (Triny, Inbox, Peppos: `/hombre/calzado/championes`), un 404 (Pricebox) y el precio `0` de BAS.
- **Ninguna tienda probada expone solo OpenGraph**: el último escalón de la cascada se prueba con las metas reales de Decathlon sin su JSON-LD.
- **H&M** en el sitemap tiene productos de hogar (`/0450182003/p` es un almohadón): la categoría los deja en `OTHER`.

## Verificado en el paso 04b (2026-10-01, talles y stock con `AsesorEsteticoBot/1.0`)

Fixtures recortados en `packages/shopping/test/fixtures/` (`fenicio-talles-*.html`, `vtex-*-catalogo.json`, `shopify-jackjones-producto-js.json`, `woo-tiendasmontevideo-*`).

| Plataforma  | Tiendas probadas                                                                         | Talles y stock                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fenicio     | Legacy, Indian, Hering, La Isla, Stadium                                                 | `#lstTalles` en la página (sin request extra). `li[data-stock]` dice "disponible" o "agotado" (con `title="Agotado"`); el `input[data-stock]` trae la cantidad. Hering usa talles brasileños (`P`, `M`, `G`, `XG`). **La Isla** tiene productos con `data-varia="true"`: el `<b>` del talle trae además `<span class=precio>` con el precio de esa variante (30 y 32 a $ 2.990, el resto a $ 1.990). |
| VTEX IO     | Adidas                                                                                   | API `?fq=skuId:<n>` con el SKU de las ofertas del JSON-LD (`"00029253"` → `29253`). Clave `Talla`. `AvailableQuantity` 0/1/10 e `IsAvailable`.                                                                                                                                                                                                                                                       |
| VTEX FS     | H&M, BAS                                                                                 | **H&M**: el JSON-LD trae `sku` real (`245570`) y robots permite `?fq=` → clave `Talla Hombre`. **BAS**: robots prohíbe `/api/` y el HTML (`__NEXT_DATA__`) no trae variantes → talles sin verificar; su JSON-LD dice `OutOfStock` en los agotados y es cierto (contrastado: todos los talles tachados en la página).                                                                                 |
| Shopify     | Jack & Jones, Decathlon (más actitudguay.com.uy, dolceragazza.com.uy por descubrimiento) | `/products/<handle>.js` permitido por robots: opciones `["Color","Talla"]`, `available` por variante y precio en centésimos (`149900`). Los ids coinciden con los `?variant=` del JSON-LD.                                                                                                                                                                                                           |
| WooCommerce | Tiendas Montevideo                                                                       | Store API `?slug=` → atributos con términos (`Talle`: S/M/L/XL) y `variations` con slugs; el stock está en cada variación (`/products/<id>`: `is_in_stock`, `low_stock_remaining`). Precios en unidades menores (`31900` → 319). Casi no vende ropa (pijamas).                                                                                                                                       |

- **Prueba real del look 1** (`real-product-variants.ts`, sin descubrimiento): 61 de 61 productos válidos y talles verificados en 9 de 10 tiendas (todas salvo BAS).
- **Locales sin ecommerce:** ninguno de los productos probados declara `InStoreOnly`. Dos búsquedas web el 2026-10-01 (USD 0.0183, "ropa disponible solo en tienda física Montevideo…" y "disponible en tienda / solo en local") devolvieron tiendas online (Shopify) y directorios de locales sin datos de producto (smartservices.uy, guiadeo.com): ningún caso real. Si aparece, el pipeline lo toma (ver `SHOPPING_ENGINE.md`).
- **Contrastes a mano en la página de la tienda**:
  - Jack & Jones "Camisa clásica regular Oxford - Crockery Stripes": S, M y XXL disponibles, L y XL grises. Coincide con `L✗ S✓ M✓ XL✗ XXL✓`.
  - Indian "Pantalon Alvren - Verde Oliva": S disponible, M, L y XL "Agotado". Coincide con `S✓ M✗ L✗ XL✗`.

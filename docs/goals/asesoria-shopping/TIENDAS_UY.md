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

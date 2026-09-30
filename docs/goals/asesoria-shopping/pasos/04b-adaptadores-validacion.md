# Paso 04b — Shopping: adaptadores de talles/stock, validación y locales físicos

**Orden del SPEC:** 10–11 · **Depende de:** 04a · **SPEC:** "PIPELINE DE SHOPPING" (Validate, endpoints del ecommerce), "DATOS DE CADA PRODUCTO", "LOCALES SIN ECOMMERCE", "MANEJO DE ERRORES" · **Leer también:** [`TIENDAS_UY.md`](../TIENDAS_UY.md)

## Objetivo

Completar los datos del producto con lo que la extracción genérica no trae: **variantes, talles y stock**, desde endpoints accesibles de cada **plataforma** (no de cada tienda). Además:

- la etapa **Validate**: producto real, de una tienda que vende en Uruguay, con datos coherentes;
- el soporte de **locales sin ecommerce** (`IN_STORE_ONLY`).

Estados permitidos: `IN_STOCK`, `OUT_OF_STOCK`, `UNKNOWN` e `IN_STORE_ONLY`. Si algo no se puede verificar, queda `UNKNOWN`.

## Lo que ya hay (relevamiento 2026-09-30, verificalo)

- **Talles y stock casi nunca están en el JSON-LD.** Dónde están, según la plataforma (detalle en `TIENDAS_UY.md`):
  - **Fenicio:** `#lstTalles input[name=sku][data-cpre][data-stock]`. En Indian, `data-cpre` es un código y la etiqueta visible está en `<b>`.
  - **VTEX:** API de catálogo, `items[].variations`. La clave del talle varía (`Talla`, `Talla Mujer`, `TALLE`). `AvailableQuantity` viene topeado, así que usalo como booleano. No trae moneda.
  - **Shopify:** variantes con `available` en `products.json`.
  - **WooCommerce:** Store API, con precios en unidades menores.
- **robots.txt.** Prohíbe la API de H&M y BAS: ahí usá solo la página del producto.
- **Precio obligatorio en todas las capas.** `ProductSchema.price` es obligatorio. En la base, `products.price_amount` y `products.currency` son NOT NULL, y también `cart_items.price_amount_snapshot`.
- **Sin campos para locales.** `products` no tiene columnas de ubicación ni de contacto (solo `data_json`).
- **Tiendas bloqueadas.** Zara y Nike bloquean requests automáticos.

## Trampas

- **Locales sin precio.** El SPEC dice "precio si se conoce", pero el esquema exige precio. Si un producto `IN_STORE_ONLY` o de una tienda bloqueada puede no tener precio, hace falta:
  - una migración: precio y moneda nullable, más un check coherente con la disponibilidad;
  - el cambio en `ProductSchema`;
  - `db:types`;
  - que el carrito y el ranking lo contemplen (pasos 05 y 10a).

  Decidilo acá y anotalo (D10).

- **Tiendas bloqueadas (Zara, Nike).** Nunca se muestra como producto algo cuya página no se pudo descargar y validar: no hay productos armados con snippets de búsqueda. Se descartan, o como mucho aparecen como link a la tienda, no a un producto (D7).
- **Tiendas de otros países.** Una búsqueda web puede traer tiendas extranjeras (zara.com/es, dominios `.com.ar`). Validate las rechaza.

## Tareas

1. **Adaptadores de plataforma** para variantes, talles y stock, elegidos por la huella de la plataforma, solo donde robots lo permite:
   - Fenicio: parseo de `#lstTalles`;
   - VTEX: catálogo por id o SKU;
   - Shopify: `products.json` o `.js`;
   - WooCommerce: Store API.

   Magento es opcional. Si el adaptador falla, el producto queda con talles y stock `UNKNOWN` (no se descarta).

2. **Talles normalizados:** S/M/L/XL, 28–44 y calzado EU/US, conservando la etiqueta original.
3. **Etapa Validate** (con Zod):
   - el host coincide con la tienda;
   - la moneda es UYU o USD;
   - el precio es positivo cuando existe;
   - la página del producto se descargó y extrajo con éxito (nada de productos armados con snippets de búsqueda);
   - la tienda vende en Uruguay (registro, TLD `.uy`, moneda UYU o evidencia equivalente);
   - la URL queda canonicalizada, sin parámetros de tracking.
4. **Locales sin ecommerce** (`IN_STORE_ONLY`):
   - nombre, producto, precio si se conoce, ubicación y contacto o link;
   - persistidos en `data_json` o en columnas nuevas;
   - con precio nullable, si así lo decidiste (migración + `db:types`);
   - solo con datos reales.

   Buscá al menos un caso real. Si no aparece ninguno, el soporte queda implementado y probado con un fixture, y la ausencia se documenta.

5. **Conteos de parcialidad.** El resultado del pipeline informa cuántos productos quedaron con stock o talle sin verificar, para los mensajes honestos de la UI (paso 08).
6. **Tests** con fixtures reales grabados de las 4 plataformas:
   - talles y stock por plataforma;
   - adaptador que falla → `UNKNOWN`;
   - Validate rechaza host distinto de la tienda, moneda inválida, precio ≤ 0 y tiendas que no venden en Uruguay;
   - `IN_STORE_ONLY` con y sin precio.
7. **Prueba real:** sobre los productos reales del paso 04a, completá talles y stock. En el log:
   - tabla por tienda con talles y stock reales;
   - qué quedó `UNKNOWN` y por qué;
   - contraste manual de 2 productos con la página de la tienda.
8. **Docs:** `docs/SHOPPING_ENGINE.md` (adaptadores, Validate, `IN_STORE_ONLY`, tiendas bloqueadas), `docs/DATA_MODEL.md` si hubo migración, y `TIENDAS_UY.md`.

## Hecho cuando

- [ ] Adaptadores de talles y stock para Fenicio, VTEX, Shopify y Woo, con fixtures reales y respeto de robots.
- [ ] Ningún dato inventado: stock y talle quedan `UNKNOWN` cuando no se verifican (tests).
- [ ] Validate con tests: exige la página del producto descargada y extraída, y rechaza host distinto de la tienda, moneda fuera de UYU/USD, precio ≤ 0 y tiendas que no venden en Uruguay, y canonicaliza URLs.
- [ ] `IN_STORE_ONLY` implementado y probado (precio opcional si se decidió, ubicación y contacto), con datos reales o con la ausencia documentada.
- [ ] Prueba real con talles y stock reales y 2 productos contrastados a mano (evidencia en el log).
- [ ] `pnpm format`, `lint`, `typecheck`, `test` (con integración ejecutada) y `build` en verde. `db:types` al día si hubo migración.
- [ ] Docs y `DECISIONES.md` (D7, D9, D10) actualizados.

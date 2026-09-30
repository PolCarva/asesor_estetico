# Motor de shopping

## Estado

Pipeline completo implementado con **`MockSearchProvider`** y **`MockProductFetcher`** sobre un catálogo ficticio (dominios `.test`). No hay scraping real ni requests a tiendas.

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

1. `SearchProvider` real (API de búsqueda o catálogo de tiendas asociadas), respetando robots.txt y términos de cada tienda.
2. `ProductFetcher` real con timeouts, user-agent identificable, límites de tamaño y rate limit por dominio.
3. Cache en Postgres y jobs de refresco.
4. `visual_similarity` con embeddings de imagen.

# Resumen final — asesoría de imagen + shopping real en Uruguay

Rama `feat/asesoria-shopping`, pasos 01 a 13 (2026-09-30 → 2026-10-02). Detalle de cada paso en el log de `README.md`, decisiones en `DECISIONES.md` y la auditoría requisito por requisito en `AUDITORIA.md`.

## 1. Qué se implementó

El recorrido completo del SPEC funciona de punta a punta con IA y tiendas reales:

**fotos → análisis → 3 looks → imágenes → asesoría de imagen completa → prendas reales de tiendas de Uruguay → carrito.**

- **Asesoría de imagen** (pasos 01, 02, 02b): StyleProfile v3 con pelo, grooming, colores, ropa y fit, calzado, accesorios, joyería, anteojos, tatuajes y consejos generales; UI de consultoría en `/app/looks`, bento visual en `/app/profile` y detalle de cada look en `/app/looks/[id]`. Free ve un teaser; Premium, todo (protegido por RLS).
- **Shopping real** (pasos 03 a 09): del LookSpec a queries estructuradas, búsqueda en un registro de tiendas por plataforma más descubrimiento web, descarga segura, extracción en cascada, talles y stock por plataforma, normalización, validación, ranking, cache, jobs con progreso por etapas, talles del usuario, resultados por prenda y "Buscar más barato".
- **Carrito y guardados** (pasos 10a, 10b): carrito externo agrupado por look, con talle, comprado, quitar, cambiar por otra opción, guardar, total aproximado por moneda y "Comprar ↗" a la tienda original, con revalidación de datos viejos.
- **Premium en el servidor** (paso 06 en adelante): cada búsqueda, escritura del carrito y guardado de productos lo verifica la action, `@asesor/db`, el worker y la RLS.
- **Auditoría y pruebas** (pasos 11, 12a, 12b): analytics (los 9 eventos del SPEC), fallas parciales, seguridad, E2E con worker mock y la prueba real de los 15 criterios de aceptación.

## 2. Cambios en StyleProfile

- **v2** (paso 01): al núcleo existente (`appearance`, `colors`, `strengths`, `avoid`, `style_direction`) se le sumó la asesoría: `hair` (corte, largo, laterales, textura, peinado, evitar, indicaciones para el peluquero), `grooming` (barba, cejas, cuidado, evitar), `clothing` (fits, siluetas, cortes de pantalón, largos, layering, materiales, evitar), `body_proportions`, `shoes`, `accessories` (accesorios, joyería, anteojos), `tattoos` (opcionales, estilos y ubicaciones) y `general_advice`. Campos "no aplica" como listas o textos vacíos (sin nullables, para la gramática del JSON Schema estricto).
- **v3** (paso 02b): `appearance` suma `face_features`, `body_shape` (silueta) y `torso_legs` (proporciones), y las razones de cada look pasan a tener aspecto y calificativo ("Color · cálido").
- **Persistencia** separada: el núcleo (teaser, visible para free) en `style_profiles` y la asesoría (Premium) en `style_advice`, con RLS solo para el dueño Premium. Una sola función atómica guarda núcleo, asesoría y los 3 looks.
- **Lectura tolerante**: `parseStoredStyleProfile` sube v1 y v2 a v3 sin perder datos; los looks viejos se leen con `StoredLookSpecSchema`.
- Todo lo que devuelve el modelo se valida con Zod; una sola llamada (`analyzeStyleProfile`) con JSON Schema estricto.

## 3. Cómo funciona ahora la asesoría

- El prompt pide "la mejor versión estética de esta misma persona": sin cambiar estructura facial, altura, cuerpo ni musculatura, sin puntuaciones de atractivo ni análisis médico, con recomendaciones concretas, breves y aplicables (y categorías para elegir ropa, nunca medidas).
- En `/app/looks`, debajo de los 3 looks: "Te favorece", "Mejor evitar" y colores (mejores, neutros, evitar) para todos; para Premium, las secciones Pelo (con "Para decirle al peluquero" y botón de copiar), Grooming, Ropa y fit, Calzado y accesorios, Tatuajes y Consejos generales. Free ve las secciones como títulos bloqueados con el CTA a Premium; el contenido Premium nunca llega al navegador de un usuario free.
- `/app/profile`: bento con forma de rostro, colorimetría, silueta, proporciones y claves; cómo equilibrar la silueta es Premium.
- `/app/looks/[id]`: render con pines por prenda, piezas con color, fit y material, "Por qué te queda bien" con aspecto, "Con este look, evitá"; los looks 2 y 3 de free muestran el paywall.

## 4. Cómo funciona el shopping

1. **"Encontrar este look"** (Premium; free ve "Encontrá las prendas reales para recrear este look" y el paywall). Si faltan talles, pide solo los que usa ese look (arriba, abajo, calzado) y los guarda en el perfil.
2. La action encola un job `SEARCH_PRODUCTS` (sin request abierto). El worker arma una `ShoppingQuery` por prenda (`buildShoppingQueries`: categoría, color, fit, material, términos en español de Uruguay, talle, público del perfil).
3. **Búsqueda**: adaptadores por plataforma sobre un registro de 13 tiendas (Fenicio, VTEX, Shopify, WooCommerce), sitemaps donde la búsqueda está bloqueada y descubrimiento web (`openrouter:web_search`) para tiendas `.uy` fuera del registro, con detección de plataforma.
4. **Descarga** con un cliente respetuoso (user agent identificable, robots.txt, ritmo por dominio, timeout, tope de tamaño, anti-SSRF sin DNS rebinding), **extracción**, **talles y stock** por plataforma, **normalización** y **validación** (Uruguay, precio real, host de la tienda, público).
5. **Ranking** por prenda con el talle del usuario; se guardan 4 opciones por prenda (recomendado + alternativas) y el pool completo queda 24 h en cache para otros pedidos.
6. **Progreso real por etapas** en la UI (sin porcentajes), resultados agrupados por prenda con mensajes honestos ("Encontramos opciones para 4 de 5 prendas", "no pudimos confirmar si está tu talle").
7. **"Buscar más barato"**: una sola prenda, con la misma estética y `price < precio actual` estricto, sobre el pool cacheado si alcanza; las alternativas se guardan aparte sin tocar el ranking principal.

## 5. Tiendas reales con las que se probó

- **Registro** (adaptador por plataforma): Legacy, Hering, Indian (de mujer: no se consulta para hombre), Lolita (de mujer), La Isla, Zooko, Stadium (por sitemap: robots prohíbe la búsqueda), Adidas, BAS, H&M (páginas y sitemap: robots prohíbe la API), Jack & Jones, Decathlon y Tiendas Montevideo.
- **Descubiertas por búsqueda web en las pruebas reales**: Peppos, Santander, Piece of Cake, Canva Store, New Balance UY, Actitud, Dolce Ragazza, Guapa, Uniform & Co., MundoTrabajo, Rossi Sport, Riviera Joyas, Watchme, Lincoln's, Macri, O'Neill, Otec, Panthai, Superoutlet, Team L, Amadeus, Disershop, Kaotiko, Kiabi, Lemon y `stadiumsport.uy`, entre otras.
- **Prueba de punta a punta del paso 12b**: 25 tiendas reales en los resultados de dos looks (lista en el log).
- **Fuera de alcance, documentado** (D7, `TIENDAS_UY.md`): Zara (Akamai Bot Manager), Nike (Cloudflare 403) y Mercado Libre (API con OAuth, robots prohíbe todo a bots de IA); Renner dio timeout y no se pudo verificar. Nunca se muestran productos sin una página descargada y validada.

## 6. Estrategia de extracción

Cascada genérica, sin scraper por tienda:

1. **JSON-LD** (`Product`, `ProductGroup` con `hasVariant`, `Offer`/`AggregateOffer`);
2. **microdata** schema.org (Fenicio) y **OpenGraph** para completar datos sueltos;
3. **endpoints de la plataforma** para talles y stock: Fenicio `#lstTalles` en la misma página, VTEX API de catálogo por SKU, Shopify `/products/<handle>.js`, WooCommerce `data-product_variations` de la página o la Store API;
4. parsing específico solo donde hizo falta (talles de Fenicio, códigos `data-cpre`, "Calce" de Shopify);
5. **Playwright no entra en el MVP** (solo documentado como último recurso para tiendas que renderizan en el cliente, nunca para evadir anti-bot).

Cada dato externo se valida con Zod; nunca se completa un precio, stock o talle que la página no dio (`UNKNOWN` y "sin verificar" cuando no se puede).

## 7. Ranking utilizado

Promedio ponderado de factores entre 0 y 1 (`DEFAULT_RANKING_WEIGHTS`, documentados en `SHOPPING_ENGINE.md`):

| Factor                    | Peso |
| ------------------------- | ---- |
| Categoría                 | 0.20 |
| Color                     | 0.20 |
| Estilo (similitud visual) | 0.18 |
| Fit / silueta             | 0.12 |
| Material                  | 0.07 |
| Talle del usuario         | 0.10 |
| Stock                     | 0.08 |
| Precio                    | 0.05 |

Estética 0.77, disponibilidad 0.18, precio 0.05 (solo desempata). Encima del promedio: tono del color (claro/oscuro), rasgos excluyentes (cuello, mangas), rasgos visibles no pedidos (deporte, montaña, capucha, cargo), medida en mm, público del producto (se descarta el otro), diversidad por tienda, copias del mismo producto más abajo y lo que claramente no se parece después de lo que sí. El ranking es puro: el mismo pool cacheado se re-rankea con el talle y el precio de cada pedido.

## 8. Funcionamiento del carrito

- **Agregador externo** sobre las tablas existentes (`carts`, `cart_items`, `products`, `product_variants`): no procesa pagos; "Comprar ↗" pasa por `/api/products/<id>/open` y redirige a la URL guardada de la tienda (sin open redirect), revalidando en segundo plano si el dato tiene más de 8 h.
- **Agregar** un producto desde los resultados (o el look completo con un botón): si el dato tiene más de 8 h, espera la revalidación del worker (hasta 8 s); elige la variante del talle del perfil, en stock y del color del look; guarda el precio de ese momento.
- **En `/app/cart`**: agrupado por look con subtotal; talle (selector con color y agotados), "Ya lo compré", guardar (♡), quitar, "Cambiar por otra opción" de la misma prenda del look; "TOTAL APROX." por moneda (pesos y dólares nunca sumados; un aproximado convertido aparte); avisos de cambio de precio y de productos sin precio.
- **Guardados** (`/app/favorites`): looks (cualquier plan) y productos (Premium).
- **Premium vencido**: el carrito queda en solo lectura, con las tiendas a mano.
- Todo persiste en la base: al volver (otra sesión) siguen el perfil, los looks, los talles, el carrito y los guardados.

## 9. Limitaciones conocidas

**Tiendas y búsqueda**

- Zara, Nike y Mercado Libre quedan fuera mientras bloqueen bots o exijan OAuth; Renner no se pudo verificar (timeout). No se evade ninguna protección.
- El descubrimiento de tiendas fuera del registro necesita `OPENROUTER_API_KEY` (búsqueda web paga) y solo acepta dominios `.uy`.
- Sin fallback de navegador: una tienda que arma la página en el cliente queda afuera (`not_product`).
- Los términos de búsqueda son léxicos: la cobertura depende de los sinónimos (en la prueba real, un "buzo liviano de cuello redondo" de merino no encontró buzos de punto).
- El relevamiento se hizo desde una IP residencial: desde un datacenter puede haber más bloqueos.

**Calidad de los resultados**

- El ranking compara texto, no fotos (una sobrecamisa "Verde" con foto a cuadros, una campera "básica" que en la foto tiene capucha).
- El talle del usuario es una prioridad, no un filtro: puede salir recomendado un producto agotado en su talle (y lo dice).
- El público del producto se filtra solo si la página lo declara.
- "Buscar más barato" busca sobre el pool cacheado de la prenda: a veces no hay opciones (lo dice).
- El stock es disponibilidad por talle, sin cantidades; "Comprar ↗" revalida en segundo plano (la tienda muestra el dato de hoy).
- Locales físicos (`IN_STORE_ONLY`): solo si la página lo declara; ningún caso real apareció en las pruebas.

**Producto y plataforma**

- El paywall es informativo: el checkout de Mercado Pago es el milestone 3 y Premium se activa por seed o SQL. Los looks 2 y 3 se generan solo si el usuario ya era Premium al analizar.
- Chat Premium: no implementado (no es parte de los dos pilares del SPEC).
- El núcleo del perfil (6 fortalezas, 6 "evitar", neutros, colores a evitar) lo puede leer el dueño con cualquier plan por la API (D4); el recorte del teaser es de la UI. La asesoría Premium sí la protege la RLS.
- "Sin análisis médico" y "no cambiar el cuerpo" los exige el prompt, sin un control posterior sobre el texto.
- La RLS deja borrar ítems del carrito y guardados propios sin Premium (decisión del paso 11; la app lo bloquea igual).
- Rate limit en memoria: sirve para una instancia; hace falta uno compartido (Postgres) antes de escalar.
- E2E sin cubrir: "más barato" con resultados y el precio "en tu talle" (el catálogo mock no los produce; los cubren unit e integración).
- Un `next dev` de larga duración puede quedar con módulos viejos (pasó con el rate limit de "Comprar ↗"): reiniciarlo después de `pnpm install` o de cambios grandes.

## 10. Resultado de tests y build

Verificación final del paso 13, sin cache de turbo (`--force`):

| Comando                           | Resultado                                                                                                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm format`                     | ✅                                                                                                                                                                                                           |
| `pnpm lint`                       | ✅ 9/9 tareas                                                                                                                                                                                                |
| `pnpm typecheck`                  | ✅ 9/9 tareas (TypeScript strict)                                                                                                                                                                            |
| `CI=1 pnpm test`                  | ✅ **517 unitarios** (shared 141, shopping 246, web 72, ai 24, worker 11, config 8, payments 6, db 5, analytics 4) y **84 de integración** contra Supabase local (db 72, worker 12), 0 de 11 tareas en cache |
| `pnpm build`                      | ✅ web y worker, 0 en cache                                                                                                                                                                                  |
| `pnpm test:e2e`                   | ✅ **24** (12 tests × desktop y mobile: smoke, asesoría, shopping con progreso, paywall, carrito y guardados), con `CI=1` contra `next start` y el worker mock                                               |
| `pnpm db:reset` + `pnpm db:types` | ✅ sin diferencias                                                                                                                                                                                           |

Además, la prueba real de punta a punta del paso 12b: los 15 criterios de aceptación con IA real (OpenRouter) y 25 tiendas reales de Uruguay, ~USD 0.41.

## 11. Qué falta para considerar completa la funcionalidad primaria del MVP

Los dos pilares del SPEC (asesoría completa y shopping real en Uruguay, con carrito) funcionan de punta a punta: los 15 criterios de aceptación se verificaron con datos reales. Para que el MVP sea usable por usuarios reales falta, en orden:

1. **Pagos (milestone 3):** checkout real de Mercado Pago (suscripción, webhook verificado, gestión en el perfil), para que Premium se pueda comprar; al pasar a Premium, generar los looks 2 y 3.
2. **Producción:** deploy de la web, del worker (contenedor) y de Supabase gestionado; probar el worker contra las tiendas desde la IP de producción; rate limit compartido en Postgres; monitoreo de errores y alertas de costo de IA y búsqueda web.
3. **Legal y privacidad (milestone 6):** política de privacidad que informe que las fotos van a OpenRouter/Google y pida consentimiento, términos, borrado de cuenta que incluya Storage y exportación de datos.
4. **Operación del shopping:** mantener el registro de tiendas (plataforma, público, robots) y ampliar los sinónimos de búsqueda con datos de uso.

Fuera de la funcionalidad primaria (después): chat Premium, regenerar o reintentar looks desde la UI, comparar fotos en el ranking y un fallback de navegador para tiendas que lo necesiten.

# Spec completo: asesoramiento estético + shopping real Uruguay

> Texto original del pedido, sin cambios. Es la fuente de verdad del objetivo.
> Los pasos (`01-*.md` … ) lo dividen en tandas ejecutables; ante cualquier duda sobre el alcance, manda este archivo.

---

Revisá primero AGENTS.md y toda la documentación existente en /docs para entender la arquitectura, el estado actual del proyecto y las decisiones ya tomadas.

La funcionalidad primaria ya llega hasta el punto en que el usuario sube sus fotos, se genera el análisis, se crean los 3 looks y se generan sus imágenes.

Quiero completar ahora las DOS partes principales que faltan para que la experiencia central del producto quede funcional de punta a punta:

USUARIO
→ fotos
→ análisis
→ 3 looks
→ imágenes
→ asesoramiento estético completo
→ prendas reales disponibles en Uruguay
→ agregar prendas reales al carrito

No quiero mocks en estas dos funcionalidades salvo donde sea estrictamente necesario para testing. Quiero integrarlas realmente.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. COMPLETAR EL ASESORAMIENTO ESTÉTICO
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Actualmente el análisis está demasiado centrado en generar los 3 looks.

Quiero que el StyleProfile/análisis se convierta realmente en un ASESOR DE IMAGEN PERSONAL.

Además de los 3 looks, debe devolver recomendaciones claras, concretas, breves y aplicables sobre qué le favorece al usuario y qué debería evitar.

Debe analizar, cuando corresponda:

- pelo;
- corte recomendado;
- largo;
- laterales;
- textura;
- peinado;
- grooming;
- barba/vello facial;
- cejas;
- colores que favorecen;
- colores que conviene evitar;
- fits de ropa;
- cortes de pantalón;
- largos;
- layering;
- materiales/texturas;
- calzado;
- accesorios;
- joyería;
- anteojos si corresponde;
- tatuajes opcionales;
- ubicaciones de tatuajes;
- recomendaciones generales;
- cosas que claramente le favorecen;
- cosas que debería evitar.

No quiero puntuaciones de atractivo ni análisis médico.

Todo debe basarse en styling realista y cambios que el usuario pueda aplicar en la vida real.

El análisis debe seguir conservando la idea:

“mejor versión estética de esta misma persona”

sin cambiar:

- estructura facial;
- altura;
- cuerpo;
- musculatura;
- características fundamentales.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ESTRUCTURA DEL ANÁLISIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Revisá el StyleProfile existente y extendelo si hace falta.

Quiero que el resultado tenga información estructurada, no solamente texto libre.

Por ejemplo:

```
{
  strengths: [],
  avoid: [],
  hair: {
    recommended: [],
    avoid: [],
    barber_instructions: ""
  },
  grooming: {},
  colors: {
    recommended: [],
    avoid: []
  },
  clothing: {
    recommended_fits: [],
    recommended_silhouettes: [],
    recommended_materials: [],
    avoid: []
  },
  shoes: {},
  accessories: {},
  tattoos: {},
  general_advice: []
}
```

No copies necesariamente este schema.
Revisá los schemas existentes y diseñalo de forma coherente con el proyecto.

Toda respuesta del modelo debe seguir validándose con Zod.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UI DEL ASESORAMIENTO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

En la pantalla de resultados, además de los 3 looks, agregá una sección de asesoramiento general.

Quiero algo visual, premium y fácil de escanear.

Por ejemplo:

```
TE FAVORECE
✓ ...
✓ ...
✓ ...

MEJOR EVITAR
× ...
× ...
× ...

PELO
...

GROOMING
...

COLORES
...

ROPA Y FIT
...

ACCESORIOS
...

TATUAJES
...
```

No pongas bloques enormes de texto.

Debe sentirse como una consultoría profesional de imagen.

Si ya existe lógica de Free/Premium, respetala:

FREE puede ver una parte suficiente como teaser.

PREMIUM desbloquea el análisis completo.

No rompas el comportamiento actual de los 3 looks.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 2. SHOPPING REAL EN URUGUAY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Una vez generado cada LookSpec, quiero que el usuario Premium pueda tocar:

“Encontrar este look”

y que el sistema busque prendas REALES disponibles en Uruguay que permitan recrearlo.

No quiero una lista genérica.

Debe interpretar cada componente del LookSpec.

Ejemplo:

LOOK:

- remera negra lisa fitted-but-not-tight;
- pantalón sastrero carbón relaxed;
- polo tejido taupe;
- championes negros minimalistas;
- cadena plateada fina.

Debe convertirlo en ShoppingQueries estructurados.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TIENDAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No limitarse a una lista fija si no es necesario.

Buscar opciones reales disponibles en Uruguay incluyendo, cuando aparezcan:

- Zara Uruguay;
- H&M;
- Renner;
- Legacy;
- Hering;
- Jack & Jones;
- Stadium;
- Stadium Sport;
- Adidas Uruguay;
- Nike;
- Mercado Libre Uruguay;
- boutiques;
- tiendas independientes;
- otros ecommerce uruguayos relevantes.

El sistema debe ser extensible y no depender de integraciones manuales para cada tienda.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PIPELINE DE SHOPPING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Revisá packages/shopping y SHOPPING_ENGINE.md.

Implementá realmente el pipeline:

```
LookSpec
→ identificar prendas necesarias
→ ShoppingQueries
→ Search
→ Candidate URLs
→ Fetch
→ Extract
→ Normalize
→ Validate
→ Rank
→ Persist/cache
→ Mostrar resultados
```

Preferir extracción en este orden:

1. JSON-LD / structured data;
2. metadata/HTML;
3. endpoints accesibles del ecommerce;
4. parsing específico solo cuando sea necesario;
5. browser/Playwright únicamente como fallback.

No hagas un scraper gigante específico por tienda.

Quiero una arquitectura genérica.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATOS DE CADA PRODUCTO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Intentar obtener:

- nombre;
- tienda;
- URL;
- imagen;
- precio;
- moneda;
- categoría;
- color;
- material si está disponible;
- variantes;
- talles;
- stock;
- disponibilidad;
- fecha de última verificación.

Estados permitidos:

IN_STOCK
OUT_OF_STOCK
UNKNOWN
IN_STORE_ONLY

Nunca inventar stock.

Si no puede verificarse:
UNKNOWN.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TALLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Si todavía no conocemos los talles del usuario, antes de buscar o al comenzar el shopping pedir solamente los relevantes.

Ejemplo:

Remera/camisa:
S / M / L / XL...

Pantalón:
30 / 32 / 34...

Calzado:
EU / US.

Los talles deben persistir en el perfil para no volver a preguntarlos.

Las búsquedas deben priorizar productos disponibles en el talle del usuario.

Si no podemos verificar el talle:
mostrarlo claramente.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RANKING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No ordenar simplemente por precio.

Prioridad principal:

“qué tan bien reproduce el outfit recomendado”.

Revisá el ranker existente e implementá un score razonable considerando aproximadamente:

- category match;
- visual/style similarity;
- color match;
- silhouette/fit match;
- material match;
- size availability;
- stock;
- price.

El parecido estético debe tener bastante más peso que el precio.

El precio sirve como criterio secundario.

Documentá los pesos elegidos.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESULTADOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Para cada componente del outfit quiero mostrar pocas opciones buenas.

Por ejemplo:

```
PANTALÓN

RECOMENDADO
[imagen]
Zara
Pantalón Relaxed Fit
$3.990
Talle disponible: 32 ✓

[Agregar al carrito]

ALTERNATIVA
...
```

No mostrar 50 productos.

Por defecto mostrar aproximadamente:
3–5 opciones por tipo de prenda.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUSCAR MÁS BARATO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Cada producto debe permitir:

“Buscar más barato”

Al hacerlo:

mantener lo máximo posible:

- categoría;
- silueta;
- fit;
- color;
- textura;
- estética.

pero establecer como restricción:

price < precio actual

y buscar alternativas.

No regenerar todo el look.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CARRITO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Implementá el carrito real del proyecto usando las tablas existentes.

El carrito NO procesa la compra.

Es un agregador de productos externos.

Debe permitir:

- agregar producto;
- seleccionar variante/talle;
- eliminar;
- cambiar por otra alternativa;
- guardar producto;
- mostrar subtotal aproximado;
- agrupar por look;
- marcar producto como comprado;
- abrir la URL externa de la tienda.

Ejemplo:

```
TU LOOK

Remera
Hering
$699
[Comprar ↗]

Pantalón
Legacy
$1.868
[Comprar ↗]

Championes
Converse
$2.590
[Comprar ↗]

TOTAL APROX:
$5.157
```

El botón Comprar abre la tienda original.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CACHE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No repetir scraping innecesariamente.

Usar aproximadamente:

Search results:
24 horas.

Datos de producto:
8 horas.

Antes de:

- agregar al carrito;
- o abrir una compra si el dato está viejo;

revalidar cuando sea razonable.

Usar products/product_variants existentes como cache persistente si encaja con la arquitectura actual.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PREMIUM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

La búsqueda de ropa real debe ser Premium.

Verificar server-side.

No alcanza ocultar botones en frontend.

Usar el mecanismo requirePremium existente.

FREE puede ver CTA del estilo:

“Encontrá las prendas reales para recrear este look”

pero al tocar:
→ paywall.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
JOBS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Las búsquedas pueden tardar.

Usar el sistema de jobs existente.

SEARCH_PRODUCTS
REFRESH_PRODUCT

No mantener requests HTTP abiertos innecesariamente.

La UI debe mostrar progreso real por etapas:

Buscando prendas...
Revisando tiendas...
Comparando opciones...
Verificando precios y talles...
Ordenando las mejores coincidencias...

No mostrar porcentajes falsos.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UX
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

El flujo final debe sentirse así:

```
Resultado
↓
Look 1
↓
[Encontrar este look]
↓
pedir talles si faltan
↓
Buscar
↓
Mostrar prendas agrupadas

TOP
BOTTOM
SHOES
ACCESSORIES
etc.

↓
Agregar opciones al carrito
↓
Carrito completo
↓
links externos de compra
```

El usuario debe poder repetir esto con cualquiera de sus 3 looks.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMPORTANTE: LOCALES SIN ECOMMERCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Si encontramos una tienda/local uruguayo relevante que no tiene compra online pero sí información pública suficiente:

permitir mostrar:

“Disponible en tienda física”

con:

- nombre;
- producto;
- precio si se conoce;
- ubicación si está disponible;
- contacto/link;
- estado IN_STORE_ONLY.

No inventar datos.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ANALYTICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Asegurate de disparar o agregar eventos necesarios:

- style_advice_viewed
- shopping_started
- shopping_completed
- product_viewed
- product_added_to_cart
- product_removed_from_cart
- cheaper_alternative_requested
- external_product_clicked
- size_requested

Integrarlos al sistema de analytics existente.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANEJO DE ERRORES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

El shopping no debe romper toda la experiencia si:

- una tienda bloquea requests;
- un producto desapareció;
- cambia HTML;
- no hay talle;
- falla una extracción;
- falla un candidato.

Continuar con otras tiendas/resultados.

Mostrar información honesta.

Ejemplo:

“Encontramos opciones similares, pero no pudimos verificar el stock de algunas prendas.”

No mostrar errores técnicos al usuario.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ORDEN DE IMPLEMENTACIÓN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Trabajá en este orden:

1. Leer docs y código actual.
2. Revisar StyleProfile/LookSpec existentes.
3. Extender schemas del asesoramiento.
4. Actualizar prompts/model output.
5. Persistir nuevo análisis.
6. Crear UI de asesoramiento.
7. Revisar packages/shopping existente.
8. Implementar ShoppingQuery desde LookSpec.
9. Implementar búsqueda real.
10. Implementar fetch/extraction.
11. Implementar normalización.
12. Implementar ranking.
13. Implementar cache.
14. Integrar jobs.
15. Crear UI de resultados.
16. Implementar talles.
17. Implementar “Buscar más barato”.
18. Implementar carrito.
19. Integrar Premium.
20. Analytics.
21. Testing.
22. Documentación.
23. Auditoría final.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITERIOS DE ACEPTACIÓN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Considerá la tarea terminada solamente si puedo:

1. Subir fotos.
2. Obtener mi StyleProfile.
3. Obtener mis 3 looks.
4. Ver mis imágenes generadas.
5. Ver una sección clara con:
   - qué me favorece;
   - qué evitar;
   - pelo;
   - grooming;
   - colores;
   - ropa;
   - accesorios;
   - tattoos.
6. Entrar a cualquier look.
7. Tocar “Encontrar este look”.
8. Ingresar mis talles si faltan.
9. Obtener productos REALES de tiendas uruguayas.
10. Ver:
    - imagen;
    - tienda;
    - precio;
    - talle/stock cuando pueda verificarse;
    - link real.
11. Agregar una opción real de cada categoría al carrito.
12. Ver el total aproximado.
13. Abrir cada producto en su tienda.
14. Pedir una alternativa más barata.
15. Volver posteriormente y conservar:
    - StyleProfile;
    - looks;
    - talles;
    - carrito;
    - favoritos.

Todo debe funcionar con datos reales salvo casos explícitamente marcados UNKNOWN.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- No reescribas partes ya funcionales sin necesidad.
- Respetá la arquitectura y documentación existente.
- Si docs y código difieren, investigá cuál refleja el estado real y actualizá docs.
- Evitá dependencias nuevas si no aportan valor claro.
- No sobreingenierices.
- No hagas integraciones manuales con 20 tiendas si una solución genérica alcanza.
- Nunca inventes producto, precio, stock o talle.
- Validar todo input/output externo.
- Mantener secretos server-side.
- Shopping y carrito real deben requerir Premium server-side.
- Toda búsqueda debe estar preparada para fallar parcialmente.
- No pares ante errores normales: investigá, corregí y continuá.
- Agregá tests para lógica crítica.
- Actualizá documentación al terminar.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ANTES DE FINALIZAR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ejecutá:

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Corregí cualquier error.

Actualizá:

- docs/PRODUCT_SPEC.md
- docs/AI_PIPELINE.md
- docs/SHOPPING_ENGINE.md
- docs/DATA_MODEL.md
- docs/EXECUTION_PLAN.md
- docs/SETUP_STATUS.md

si corresponde.

Finalmente entregame un resumen con:

1. qué implementaste;
2. cambios en StyleProfile;
3. cómo funciona ahora el asesoramiento;
4. cómo funciona el shopping;
5. tiendas reales con las que se probó;
6. estrategia de extracción;
7. ranking utilizado;
8. funcionamiento del carrito;
9. limitaciones conocidas;
10. resultado de tests/build;
11. qué falta para considerar completa la funcionalidad primaria del MVP.

No avances a features secundarias hasta que estos dos pilares —asesoramiento completo + shopping real Uruguay— estén funcionales end-to-end.

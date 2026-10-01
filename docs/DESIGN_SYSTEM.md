# Sistema visual "Espejo"

La UI de la app sigue la **opción 2** ("Espejo · dirección tech-orgánica") del proyecto de Claude Design [Virtual try-on styling platform](https://claude.ai/design/p/98796207-048d-4033-b191-8a3934e78a7c?file=Espejo+Mockups.dc.html), archivo `Espejo Mockups.dc.html`, pantallas 2a–2k. Se adoptó el 2026-10-01.

La base es el diseño, pero con una condición: la app nunca muestra datos que no tiene. Donde el mockup inventa números (puntajes, porcentajes, medidas), la app muestra datos reales o no muestra nada. Más detalles en [Diferencias con el mockup](#diferencias-con-el-mockup).

## Principios

- **Papel, vidrio y relieve.** Fondo arena con grano y curvas de nivel, tarjetas de vidrio esmerilado, huecos en relieve y sombras de contacto.
- **Dos capas de texto.** La humana va en Familjen Grotesk, con una palabra en itálica de acento ("tal como _sos._"). La técnica (etiquetas, números, estados) va en Geist Mono, en mayúsculas y espaciada.
- **El orbe es el estilista.** Aparece cuando la IA "piensa" o habla: análisis, paywall, claves.
- **La IA se ve trabajando.** Nube de puntos, contornos y líneas de escaneo sobre las fotos del usuario, solo como decoración y nunca con números.
- **Mobile first.** Las pantallas desktop del diseño se apilan en mobile, los looks pasan a una baraja deslizable y la navegación a una barra flotante abajo.

## Tokens

Viven en `apps/web/src/app/globals.css` (`@theme` de Tailwind v4).

### Color

| Token                                    | Hex                               | Uso                                                                 |
| ---------------------------------------- | --------------------------------- | ------------------------------------------------------------------- |
| `ivory`                                  | `#efeae0`                         | Fondo de página (con grano)                                         |
| `paper` / `cream`                        | `#f5f1e9` / `#f7f3eb`             | Superficies sólidas / píldora activa                                |
| `sand` / `sand-deep`                     | `#e6dfd1` / `#e2dacb`             | Huecos en relieve, rieles, avatar                                   |
| `line`                                   | `#dcd4c4`                         | Bordes y botones deshabilitados                                     |
| `ink` / `ink-deep`                       | `#1f2420` / `#1c211b`             | Texto y botón oscuro                                                |
| `stone` / `bark`                         | `#5f6358` / `#4a5046`             | Texto secundario (oscurecido respecto del mockup para cumplir AA)   |
| `moss` / `sage`                          | `#4e5b3c` / `#b5c29e`             | Acento musgo (itálicas, ✓) / musgo claro sobre fondos oscuros       |
| `clay` / `clay-dark`                     | `#b8653f` / `#8a4a2c`             | Acento arcilla: `clay` solo en texto grande; en chico, `clay-dark`  |
| `copper` / `peach`                       | `#c7825a` / `#f0c9a0`             | Orbe y acentos sobre la pantalla nocturna                           |
| `night` / `forest`                       | `#171b15` / `#2a3125`             | Pantalla de análisis, "Tus claves", paywall, panel de login         |
| `bone` / `mist`                          | `#f2ecdf` / `#a39e90`             | Texto sobre fondos oscuros                                          |
| `tint-clay` / `tint-moss` / `tint-stone` | `#e4dccb` / `#dde0cf` / `#e8e1d3` | Tarjetas teñidas con curvas ("Por qué te queda bien", colorimetría) |

### Tipografía

`next/font/google` en `app/layout.tsx`: `Familjen_Grotesk` (`--font-display`, normal + itálica), `Geist` (`--font-sans`) y `Geist_Mono` (`--font-mono`). Los titulares usan peso 500 y tracking negativo. La utilidad `eyebrow` es la etiqueta mono (11 px, mayúsculas, `0.08em`).

### Utilidades

| Utilidad                                     | Qué es                                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `glass`, `glass-strong`, `glass-night`       | Vidrio esmerilado: tarjeta, etiqueta encima de una foto y vidrio oscuro                             |
| `well`                                       | Hueco en relieve (zona de carga, riel de navegación, chips)                                         |
| `raised-dark`                                | Botón oscuro con brillo superior y sombra (variante `primary` de `Button`)                          |
| `shadow-contact`                             | Sombra de contacto de las tarjetas con foto                                                         |
| `orb`, `orb-mark`                            | Orbe grande y orbe del logo                                                                         |
| `bg-topo`, `bg-topo-corner`, `bg-topo-night` | Curvas de nivel de fondo                                                                            |
| `topo-card`                                  | Curvas en la esquina de una tarjeta teñida (color en `--topo-line`)                                 |
| `dot-cloud`                                  | Nube de puntos (color en `--dot`); se recorta con `mask-image`                                      |
| `animate-scan/blink/breath/float/dots/orbit` | Animaciones del análisis. Con `prefers-reduced-motion` se apagan y las líneas de escaneo se ocultan |

## Componentes

| Componente                                                                                                                        | Dónde                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `Logo` (orbe + nombre en itálica)                                                                                                 | `components/logo.tsx`; usa `APP_NAME`                                   |
| `DesktopNav` (riel con la sección activa elevada), `MobileNav` (barra flotante)                                                   | `components/app-nav.tsx`                                                |
| `Button` / `LinkButton`: `primary` (oscuro en relieve), `secondary` (vidrio), `light` (sobre oscuro), `accent`, `ghost`, `danger` | `components/ui/button.tsx`                                              |
| `Card` (vidrio), `PageHeader` (título con `<em>` de acento), estados vacío y de error                                             | `components/ui/*`                                                       |
| `Pebble`, `Swatches` (colores como guijarros), `PaletteRing` (anillo con los colores del look)                                    | `components/swatches.tsx`                                               |
| `LookCard`, `LockedLookCard`, `LookStage` (escenario 3D en desktop, baraja en mobile)                                             | `components/look-card.tsx`, `look-stage.tsx`                            |
| `PrivateImage` (foto privada estable en pantallas que se refrescan)                                                               | `components/private-image.tsx`                                          |
| `AnalysisStage` (pantalla nocturna del análisis)                                                                                  | `app/app/onboarding/analysis-stage.tsx`                                 |
| `PhotoSlot` (hueco con guías, arrastrar o elegir archivo)                                                                         | `app/app/onboarding/photos/photo-slot.tsx`                              |
| `StyleAdvice` (asesoría en resultados), `PaywallCard` (bosque + orbe)                                                             | `components/style-advice.tsx`, `paywall-card.tsx`                       |
| Bento del perfil: `SilhouetteTile` (con `ShapeGlyph`, el dibujo de la categoría), `ProportionsTile` (escala de tres tramos)       | `app/app/profile/page.tsx`                                              |
| Etiquetas de los enums (rostro, subtono, contraste, silueta, proporciones, aspectos, categorías, talles, etapas del shopping…)    | `lib/labels.ts`                                                         |
| `StepMark` (✓ / actual que titila / pendiente, en las pantallas nocturnas)                                                        | `components/step-mark.tsx`                                              |
| `SizeFields` (talles en filas de vidrio con píldoras; calzado con selector EU/US)                                                 | `components/size-fields.tsx`                                            |
| `LookShopping` (CTA del look, talles en línea, paywall free, panel nocturno de progreso y resultado honesto)                      | `app/app/looks/[id]/look-shopping.tsx`                                  |
| `PieceResultsRow`, `LookTotals` (productos por pieza y total por moneda) · `ProductThumb`, `StoreLink`, `AlternativesDisclosure`  | `app/app/looks/[id]/piece-results.tsx`, `components/product-client.tsx` |
| `CheaperButton` ("Buscar más barato", vidrio), `CheaperProgress` (etapas en chico, nocturno)                                      | `app/app/looks/[id]/cheaper.tsx`                                        |

## Pantallas

| Diseño                                      | Ruta                                      | Estado                                                                                                                                                                          |
| ------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2a · Subida, dos huecos con guías           | `/app/onboarding/photos`                  | Hecho. "Paso 1 / 3". Arrastrar o elegir archivo; en mobile, el input abre cámara o galería.                                                                                     |
| 2b · Cámara guiada (mobile)                 | —                                         | No implementado: no hay captura con cámara ni chequeos en vivo.                                                                                                                 |
| 2c · Fotos listas, flotando                 | `/app/onboarding` (sin análisis en curso) | Hecho, con las preferencias (nivel de cambio y tatuajes) que el mockup no tiene. "Paso 2 / 3".                                                                                  |
| 2d · Escaneo nocturno                       | `/app/onboarding` (análisis en curso)     | Hecho. Etapas reales de los jobs y hallazgos reales (rostro, color, silueta, estilo) cuando el perfil ya está guardado.                                                         |
| 2e · Escenario con profundidad (desktop)    | `/app/looks`                              | Hecho. Debajo va la asesoría (el SPEC la pide en la pantalla de resultados) y el paywall para free.                                                                             |
| 2f · Antes / después                        | —                                         | No implementado (variante alternativa de resultados).                                                                                                                           |
| 2g · Baraja en abanico (mobile)             | `/app/looks`                              | Hecho (`LookStage` con snap y puntos).                                                                                                                                          |
| 2h · Render con pines + prendas             | `/app/looks/[id]`                         | Hecho: piezas, ficha de pelo y grooming, "Por qué te queda bien" con aspecto, "Encontrar este look" (talles y progreso, paso 07) y productos por pieza (paso 08). Carrito: 10b. |
| 2i · Bento del perfil / 2j · capas (mobile) | `/app/profile`                            | Hecho con datos reales: rostro y rasgos, colorimetría, silueta, proporciones, claves y estilo. Debajo, la cuenta.                                                               |
| 2k · Mapa topográfico del cuerpo            | —                                         | No implementado (variante alternativa del perfil).                                                                                                                              |

**Navegación.** Arriba: "Mis looks", "Mi perfil" y "Guardados" (`/app/favorites`), más el carrito (ícono) y el avatar con iniciales, que lleva a `/app/profile#cuenta`. En mobile, una barra flotante con "Looks", "Perfil" y "Guardados". No hay "Inicio": `/app/dashboard` (entrada de la app, destino del login y de la PWA) redirige a los looks si hay análisis, y si no, a las fotos o al análisis.

**Free/Premium** no está en el mockup y se diseñó con el mismo lenguaje: card de look bloqueada (curvas, candado en relieve, etiqueta "Premium"), secciones de asesoría bloqueadas en huecos y paywall en bosque con orbe. En el perfil, free ve la silueta y las proporciones y la tarjeta de silueta ofrece desbloquear "cómo equilibrarla" (las notas son Premium).

**Perfiles anteriores al paso 02b** (sin silueta ni proporciones): la tarjeta de silueta muestra la contextura y sus notas (Premium) o queda bloqueada (free), no aparece la de proporciones y "Tu estilo" ocupa su lugar en la grilla. Las razones viejas de los looks se muestran como "Estilo".

**Productos en el detalle del look (paso 08):** con una búsqueda terminada, cada fila de pieza muestra su RECOMENDADO: foto de la tienda (o el guijarro de color si no hay o no carga), etiqueta mono "RECOMENDADO · prenda", nombre, tienda, línea mono con talle (musgo ✓, arcilla si falta o está agotado, piedra si no se pudo verificar), stock y "verificado hace X" (arcilla si tiene más de 8 h), precio en Familjen 20 px con su moneda (o "Precio a consultar") y el chip oscuro "Comprar ↗" ("Ver local ↗" en un local físico, con dirección, teléfono y link en un recuadro arena). "Ver N opciones más" abre las alternativas compactas dentro de la misma fila. Una prenda sin opciones lo dice en arcilla. Debajo de la lista, una tarjeta de vidrio con el total de los recomendados por moneda y cuándo se verificaron los precios. En mobile, precio y chip bajan a una línea propia.

**Buscar más barato (paso 09):** acción secundaria en vidrio ("Buscar más barato") debajo del recomendado y de cada alternativa con precio. Mientras busca, una franja nocturna chica en la fila con "BUSCANDO MÁS BARATO · etapa" y la barra de cinco tramos. Después, "MÁS BARATAS QUE $ X · frente a <producto>" (mono, musgo) y las opciones compactas con precio, "$ N MENOS" en musgo y "Ver ↗". Sin resultados, un recuadro arena: "No encontramos opciones más baratas que conserven el estilo."

**Shopping en el detalle del look (paso 07):** debajo de las piezas, la píldora oscura a lo ancho. Premium: "Encontrar este look"; si faltan talles, se abre en línea el formulario solo con los que faltan (filas de vidrio, píldoras, calzado con EU/US) y "Buscar las prendas". Mientras corre, un panel `night` compacto con las cinco etapas del SPEC (✓ / actual / pendiente), barra por etapas, orbe con una frase y "N de M prendas listas" (conteos reales, sin porcentajes). Al terminar, una tarjeta de vidrio con el resultado honesto y la hora, y "Buscar de nuevo" (o "Reintentar la búsqueda" si falló). Free: "Encontrá las prendas reales para recrear este look" abre el `PaywallCard` en línea. La edición de talles está en `/app/profile#cuenta` ("Editar mis talles").

**"Por qué te queda bien":** etiqueta `ASPECTO · CALIFICATIVO` en mono; tarjeta arcilla para color, musgo para silueta y neutra para rostro, pelo y estilo.

## Diferencias con el mockup

Cuando el mockup contradice el SPEC o muestra datos que la app no tiene, manda el SPEC. Los datos cualitativos que faltaban (silueta, proporciones, rasgos del rostro y el aspecto de cada razón) los agregó el paso 02b.

| Mockup                                                                                          | En la app                                                                                               | Por qué                                                                                         |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Puntaje de match por look (96, 91, 88) y "96% encaja con tu rostro"                             | `PaletteRing`: anillo con los colores del look y su número                                              | SPEC: "No quiero puntuaciones de atractivo"; además no existe una métrica real de encaje        |
| "✦ Tu mejor match" en el look central                                                           | "✦ Para empezar" en el look 01                                                                          | Los looks se generan de menor a mayor riesgo (prompt de `GENERATE_LOOK_SPECS`), no por encaje   |
| "Analizando · 62%" y barra continua                                                             | "Analizando · etapa N de 3" y barra por etapas                                                          | SPEC: "No mostrar porcentajes falsos" (D14)                                                     |
| Medidas: hombros 47 cm, pecho 102, cintura 84, torso 44% / pierna 56%, ratio 1,38, "468 puntos" | Silueta con el dibujo de su categoría; proporciones en una escala de tres tramos sin números            | La IA no mide desde fotos: serían números inventados                                            |
| Validación "Iluminación ÓPTIMA, Nitidez 97%…"                                                   | Estado real de cada foto (Lista, Validada, Conviene cambiarla) y los mensajes de la validación          | Son los datos que devuelve `VALIDATE_PHOTOS`                                                    |
| "Tus fotos se procesan cifradas y se borran en 24 h"                                            | "Se guardan privadas: solo vos las ves y las podés borrar cuando quieras. Nunca entrenamos…"            | La app no borra las fotos a las 24 h (`SECURITY_PRIVACY.md`)                                    |
| "Algunos enlaces nos generan una comisión"                                                      | No se muestra                                                                                           | No hay afiliación con tiendas                                                                   |
| Pines sobre el render                                                                           | Ubicación aproximada por zona del cuerpo, solo con `framing: FULL_BODY`                                 | No hay detección de prendas en la imagen                                                        |
| "Comprar el look completo · $ 9.960", "Ver look · ~$ 9.960"                                     | Total de los recomendados por moneda, informativo; la píldora para comprar el look llega con el carrito | Carrito: paso 10b. Nunca un total convertido entre monedas                                      |
| "↻ Generar otras"                                                                               | No está                                                                                                 | Regenerar looks es del milestone 2 (`EXECUTION_PLAN.md`)                                        |
| ♡ Guardar                                                                                       | No está                                                                                                 | Paso 10b                                                                                        |
| Marca "espejo"                                                                                  | `APP_NAME` ("Asesor Estético") con el logo del diseño                                                   | Cambiar el nombre es una decisión de producto pendiente; es un solo string en `packages/shared` |

## Para pantallas nuevas

- Usá los tokens y las utilidades de esta página; nada de colores sueltos salvo gradientes decorativos.
- Etiquetas y estados en `eyebrow` (mono). Títulos con una palabra en `<em>` de acento: musgo en fondos claros y arcilla solo en texto grande.
- Acción principal: `Button` `primary` (píldora oscura); secundaria: `secondary` (vidrio). Sobre fondos oscuros, `light`. Para textos largos en columnas angostas, `size="lg-wrap"` (crece a dos líneas).
- Fotos del usuario: siempre `<img>` con URL firmada (nunca `next/image`) y `PrivateImage` si la pantalla se refresca sola.
- Nada de números que la app no calculó. Si el diseño los pide, primero va el dato (con su paso en el plan).
- Verificá en desktop y en mobile (375–390 px) que no haya scroll horizontal.

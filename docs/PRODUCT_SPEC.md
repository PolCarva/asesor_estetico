# Especificación de producto

## Qué es

> Un asesor de imagen personal con IA que analiza fotos del usuario, decide cómo potenciar su imagen, genera tres versiones visuales realistas y después encuentra productos reales para reproducir los looks.

La promesa es: **"decime cómo mejorar mi imagen y mostrame cómo quedaría"**.

El usuario sube fotos suyas, la app analiza sus rasgos y su estilo actual, arma un perfil de estilo, propone looks concretos y genera imágenes realistas del propio usuario con esos looks. Después lo ayuda a conseguir las prendas en tiendas locales.

### Qué no es

- **No es principalmente un virtual try-on.** No se trata de probarse una prenda puntual de una tienda, sino de recibir asesoramiento y ver el resultado aplicado a uno mismo.
- No es una tienda: no vende ni cobra productos de terceros. La compra ocurre en la tienda externa.
- No da consejos sobre cambiar el cuerpo (peso, cirugías, etc.). El alcance es ropa, colores, calzado, accesorios, pelo, barba y grooming o maquillaje.

## Flujo principal

```
fotos
  → validación
  → análisis
  → StyleProfile
  → 3 LookSpecs
  → imágenes
  → recomendaciones
  → paywall
  → shopping
  → chat Premium
```

1. **Fotos.** El usuario sube dos fotos: cuerpo entero (`MAIN_BODY`) y rostro (`FACE_DETAIL`).
2. **Validación.** Se verifica que sirvan para el análisis (una persona, buena luz, rostro/cuerpo visibles, mayor de edad). Si fallan, se explica qué cambiar.
3. **Análisis.** La IA extrae rasgos relevantes para vestirse: forma de rostro, tono y subtono de piel, contraste, cabello, proporciones generales y estilo actual.
4. **StyleProfile.** Perfil estructurado y persistente del usuario: paleta de colores recomendada, siluetas y fits, estilos afines, cosas a evitar.
5. **3 LookSpecs.** Tres propuestas de look concretas y estructuradas: prendas, colores, fit, calzado, accesorios y peinado o grooming, cada una con su justificación.
6. **Imágenes.** Se genera una imagen del propio usuario con cada look, manteniendo su identidad.
7. **Asesoría de imagen.** En `/app/looks`, debajo de los looks:
   - te favorece (+) y mejor evitar (−), colores;
   - pelo, con indicaciones copiables para el peluquero;
   - grooming (barba y cejas), ropa y fit;
   - calzado y accesorios (joyería, anteojos), tatuajes;
   - consejos generales de por dónde empezar.

   Listas cortas, sin bloques de texto. Cada look tiene su detalle en `/app/looks/[id]`: render con pines por zona, piezas del look (color, fit y material), ficha de pelo y grooming, por qué le queda (cada razón con su aspecto: color, silueta, rostro, pelo o estilo) y qué evitar. `/app/profile` ("Mi perfil") muestra el análisis en un bento: forma y rasgos del rostro, colorimetría, silueta, proporciones torso/piernas, claves y estilo. Silueta y proporciones son categorías para vestirse, sin medidas.

8. **Paywall.** El plan free muestra 1 look. Premium desbloquea el resto.
9. **Shopping.** Para cada prenda de un look se buscan productos equivalentes en tiendas de Uruguay. Desde el detalle del look:
   - **Premium:** "Encontrar este look". Si faltan talles, se piden solo los que usa ese look (remera o camisa S/M/L…, pantalón 28–50, calzado EU o US) y se guardan en el perfil, así no se vuelven a pedir; se editan en "Mi perfil". Con los talles, la búsqueda arranca y se ve el progreso real por etapas ("Buscando prendas…", "Revisando tiendas…", "Comparando opciones…", "Verificando precios y talles…", "Ordenando las mejores coincidencias…"), sin porcentajes. Al terminar, un mensaje honesto: para cuántas prendas hubo opciones y si algún stock o talle no se pudo verificar. Se puede repetir con cualquiera de los 3 looks.
   - **Free:** "Encontrá las prendas reales para recrear este look" abre el paywall; el servidor rechaza la búsqueda igual.
   - **Resultados:** en la misma lista de piezas del look, una fila por prenda con el RECOMENDADO (foto, tienda, nombre, precio con su moneda o "a consultar", talle del usuario: disponible, agotado, no está o sin verificar; stock y cuándo se verificó) y 2–4 alternativas que se abren en la fila. "Comprar ↗" abre la página real de la tienda (si el dato tiene más de 8 h, se revalida). Los locales sin compra online se muestran como "Disponible en tienda física" con dirección y contacto. Si una prenda no tiene opciones, se dice. Abajo, el total de los recomendados por moneda, sin conversiones.
   - **Buscar más barato:** cada producto con precio lo ofrece. Busca solo esa prenda, con la misma categoría, color, fit, material y estética, y precio menor al del producto; no regenera el look ni cambia las recomendaciones. Las alternativas aparecen en la fila como "Más baratas que $ X", ordenadas por parecido y con cuánto menos cuestan; si no hay, lo dice.
10. **Chat Premium.** Conversación con el asesor sobre su perfil y sus looks ("¿qué me pongo para un casamiento?", "¿esta camisa me queda?").

## Navegación y diseño

La UI sigue el sistema visual "Espejo" (`docs/DESIGN_SYSTEM.md`):

- **Recorrido:** Paso 1/3 fotos (`/app/onboarding/photos`) → Paso 2/3 análisis (`/app/onboarding`, con la pantalla nocturna mientras corre) → resultados (`/app/looks`).
- **Navegación:** "Mis looks", "Mi perfil" y "Guardados", más el carrito y el avatar (cuenta en `/app/profile#cuenta`).
- **Entrada:** `/app/dashboard` redirige al paso que corresponde.

La app nunca muestra puntajes, porcentajes ni medidas que no calculó.

## MVP

| Aspecto         | Definición                                         |
| --------------- | -------------------------------------------------- |
| Mercado         | Uruguay                                            |
| Público         | Hombres y mujeres, solo mayores de 18 años         |
| Plataforma      | Web / PWA (mobile first)                           |
| Plan free       | Análisis, teaser de la asesoría y 1 look           |
| Premium         | USD 4.99 por mes                                   |
| Looks Premium   | 3 looks con imagen                                 |
| Shopping        | Solo Premium, tiendas locales                      |
| Guardados       | Guardar looks y productos (`/app/favorites`)       |
| Carrito externo | Lista de productos que deriva a la tienda original |
| Chat            | Solo Premium                                       |

### Free vs Premium

| Funcionalidad              | Free | Premium |
| -------------------------- | :--: | :-----: |
| Subida y análisis de fotos |  ✔   |    ✔    |
| Teaser de la asesoría      |  ✔   |    ✔    |
| Asesoría completa          |      |    ✔    |
| Looks con imagen realista  |  1   |    3    |
| Shopping local             |      |    ✔    |
| Guardados (favoritos)      |  ✔   |    ✔    |
| Carrito externo            |      |    ✔    |
| Chat con el asesor         |      |    ✔    |

El teaser es el núcleo del perfil recortado: dirección de estilo, 3 ítems de "te favorece" y 3 de "mejor evitar", hasta 6 colores y el perfil visual (forma y rasgos del rostro, silueta y proporciones). La asesoría completa (pelo, grooming, ropa y fit, cómo equilibrar la silueta, calzado y accesorios, tatuajes, consejos generales, neutros y colores a evitar) es Premium: la protege la RLS de `style_advice` y la web ni siquiera la consulta para un usuario free (`selectAdviceForPlan` en `packages/shared`).

Decisión vigente (aplicada en RLS): en free solo se pueden guardar looks; guardar productos es Premium, igual que el shopping. Revisar con datos de uso.

## Fuera del MVP

- Otros países y monedas además de UYU y USD.
- Apps nativas (la PWA cubre mobile).
- Virtual try-on de prendas puntuales.
- Compra dentro de la app o checkout integrado con tiendas.
- Afiliados o comisiones con tiendas (se puede evaluar después).
- Menores de 18 años.

## Principios de producto

- **Respeto.** Lenguaje positivo y sin juicios sobre el cuerpo. Se asesora sobre cómo vestirse, no sobre cómo cambiar el cuerpo.
- **Concreto.** Recomendaciones accionables, con prendas y colores específicos.
- **Realista.** Las imágenes tienen que parecerse al usuario. Si no se parece, el producto falla.
- **Privado.** Las fotos son del usuario, se pueden borrar y no se usan para entrenar modelos (ver `SECURITY_PRIVACY.md`).

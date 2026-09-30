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
7. **Asesoría de imagen.** En `/app/looks`, debajo de los looks: te favorece (✓) y mejor evitar (×), colores, pelo (con indicaciones copiables para el peluquero), grooming (barba y cejas), ropa y fit, calzado y accesorios (joyería, anteojos), tatuajes y consejos generales de por dónde empezar. Listas cortas, sin bloques de texto. Cada look tiene su detalle en `/app/looks/[id]`: prendas por slot con color, fit y material, pelo y grooming del look, por qué le queda y qué evitar.
8. **Paywall.** El plan free muestra 1 look. Premium desbloquea el resto.
9. **Shopping.** Para cada prenda de un look se buscan productos equivalentes en tiendas de Uruguay.
10. **Chat Premium.** Conversación con el asesor sobre su perfil y sus looks ("¿qué me pongo para un casamiento?", "¿esta camisa me queda?").

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
| Favoritos       | Guardar looks y productos                          |
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
| Favoritos                  |  ✔   |    ✔    |
| Carrito externo            |      |    ✔    |
| Chat con el asesor         |      |    ✔    |

El teaser es el núcleo del perfil recortado: dirección de estilo, 3 ítems de "te favorece" y 3 de "mejor evitar" y hasta 6 colores. La asesoría completa (pelo, grooming, ropa y fit, calzado y accesorios, tatuajes, consejos generales, neutros y colores a evitar) es Premium: la protege la RLS de `style_advice` y la web ni siquiera la consulta para un usuario free (`selectAdviceForPlan` en `packages/shared`).

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

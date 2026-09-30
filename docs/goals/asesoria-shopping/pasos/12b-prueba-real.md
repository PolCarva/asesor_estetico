# Paso 12b — Prueba real de punta a punta (15 criterios)

**Orden del SPEC:** 21 · **Depende de:** 12a · **SPEC:** "CRITERIOS DE ACEPTACIÓN", "UX"

## Objetivo

Recorrer a mano los **15 criterios de aceptación** del SPEC con IA real, tiendas reales y la app completa, dejar evidencia y corregir lo que falle.

## Preparación

- **App completa:** `pnpm dev` + `pnpm worker:dev`, con `AI_PROVIDER=openrouter` y `SHOPPING_PROVIDER=live`. El costo es real: un análisis Premium sale ~USD 0.24, más las búsquedas.
- **Usuario:** local nuevo, hecho Premium por SQL (ver README). No uses `demo@asesor.test`, que trae datos ficticios.
- **Fotos:** las de `~/asesor-fotos-prueba/` (README, "Prerrequisitos"). Si no están, el paso queda ⛔.
- **Navegador:** el del panel de Claude, en desktop y mobile.

## Criterios

Marcá cada uno con evidencia (captura o descripción concreta de lo que se vio):

1. Subir fotos.
2. Obtener el StyleProfile.
3. Obtener los 3 looks.
4. Ver las imágenes generadas.
5. Ver la sección de asesoría: qué favorece, qué evitar, pelo, grooming, colores, ropa, accesorios y tatuajes.
6. Entrar a cualquier look.
7. Tocar "Encontrar este look".
8. Ingresar los talles, si faltan.
9. Obtener productos **reales** de tiendas uruguayas.
10. Ver imagen, tienda, precio, talle o stock cuando se pueda verificar, y el link real.
11. Agregar al carrito una opción real de cada prenda.
12. Ver el total aproximado.
13. Abrir cada producto en su tienda.
14. Pedir una alternativa más barata.
15. Volver después (cerrar sesión o abrir una sesión nueva del navegador) y conservar el StyleProfile, los looks, los talles, el carrito y los favoritos.

Repetí los criterios 7–10 con **otro de los 3 looks**.

## Tareas

1. **Recorrido.** Pasá por los 15 criterios y armá la tabla de evidencia en el log. Anotá también:
   - las tiendas reales que aparecieron;
   - qué quedó `UNKNOWN` y por qué;
   - los tiempos de búsqueda;
   - el costo aproximado.
2. **Correcciones.** Todo criterio que falle se corrige en este paso, con su test si corresponde, aunque el arreglo pertenezca a otro paso. Si es grande, commiteá los avances en verde a medida que avanzás y seguí hasta cerrarlo. ⛔ solo por los motivos del protocolo (README, punto 7). No se pasa al paso 13 con criterios rotos.

3. **Capturas.** Guardalas en `docs/goals/asesoria-shopping/evidencia/` solo si no muestran datos personales reales (fotos de prueba autorizadas o recortes). Si no, no las commitees.

## Hecho cuando

- [ ] Los 15 criterios de aceptación están verificados con datos reales y su evidencia en el log. Los criterios 7–10 están repetidos con un segundo look.
- [ ] Está la lista de tiendas reales que aparecieron y de lo que quedó `UNKNOWN`, con el motivo.
- [ ] Los fallos que se encontraron están corregidos, con test donde corresponde.
- [ ] `pnpm format`, `lint`, `typecheck`, `test` (con integración ejecutada), `build` y `test:e2e` en verde.

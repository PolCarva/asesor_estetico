# Goal reutilizable

Pegá este texto con `/goal` en cada sesión (siempre el mismo). Cada corrida ejecuta **un** paso: el siguiente ejecutable de la tabla de `README.md`. Cuando el paso queda terminado y reportado, el goal se da por cumplido. Para seguir, abrí una sesión nueva (o `/clear`) y volvé a pegarlo.

`/goal` evalúa la condición leyendo **solo la conversación**, no los archivos. Por eso el goal hace que la tabla, la lista "Hecho cuando" y la evidencia se impriman en el chat.

```text
Ejecutá UN solo paso del plan docs/goals/asesoria-shopping/ y cerralo.

0. Si existe la rama feat/asesoria-shopping y no estás en ella, cambiate (git switch) antes de leer nada.
1. Leé docs/goals/asesoria-shopping/README.md y seguí su protocolo (Node 24, rama, verificación, cierre, commit sin push). Si algo choca con este texto, manda este texto.
2. Mostrá la tabla con grep -n '^| [0-9]' docs/goals/asesoria-shopping/README.md y elegí en este orden: a) el paso en 🟡; b) el primer ⛔ cuyo bloqueo ya se resolvió (comprobalo con un comando, sin imprimir secretos); c) el primer ⬜ con todas sus dependencias en ✅, aunque haya un ⛔ antes. Si no hay ninguno, no toques nada e informá "PLAN TERMINADO" (todo ✅) o "SIN PASO EJECUTABLE" (cada pendiente y qué lo traba).
3. Leé el archivo del paso, DECISIONES.md, TIENDAS_UY.md si es de shopping, y las secciones de SPEC.md que cita (SPEC manda). Mostrá su lista con sed -n '/^## Hecho cuando/,$p' <archivo del paso>.
4. Implementalo completo, con integraciones reales (mocks solo en tests). Podés tocar código de pasos anteriores si este paso lo exige, pero no cambies el estado de otra fila de la tabla.
5. Errores, tests rojos o inestables, tiendas que bloquean o dificultad NO son bloqueo: investigá y seguí. ⛔ solo por algo que solo yo puedo dar: clave o secret faltante (mostrá el comando que lo prueba), gasto no previsto (con monto), fotos de prueba autorizadas, o decisión de producto que el SPEC no resuelve (citá el SPEC y las opciones). Para ⛔: hacé todo lo que no depende de eso, marcá ⛔ y el log, dejá la verificación en verde y commiteá todo junto. Si un punto de "Hecho cuando" admite explícitamente una alternativa, usala, anotala y el paso cierra ✅.
6. Cerrá según el protocolo (tabla, log, DECISIONES.md, /docs); después corré la verificación final y recién ahí commiteá.

CONDICIÓN DE CUMPLIDO. Tu último mensaje tiene un bloque "REPORTE PASO NN — <título>" con:
- qué regla del punto 2 eligió el paso;
- estado final (✅ o ⛔);
- todos los puntos del "Hecho cuando" mostrado en el punto 3, en el mismo orden, cada uno con ✓ y evidencia concreta que aparezca en una salida de herramienta de esta conversación (comando y resultado, test, prueba real, captura o lectura del navegador); si el paso se retomó, lo cerrado antes puede respaldarse con git show --stat del commit y su entrada del log;
- la verificación final, corrida después del último cambio de código y docs: pnpm format, lint, typecheck y test (más build, test:e2e o db:types si el paso o el README los piden), todo sin errores, con la cantidad de tests unitarios y de integración, y la integración ejecutada (no salteada);
- la fila del paso en ✅ (salida de grep), git log -1 --oneline con el commit del paso y git status --short vacío;
- lo anotado "para pasos siguientes" y los ⛔ que sigan abiertos.
También está cumplido si: el paso quedó ⛔ por un motivo de la lista del punto 5, con su evidencia, la fila en ⛔ (salida de grep), todo commiteado y git status --short vacío, y el mensaje dice qué tengo que hacer y cómo se va a comprobar que ya está; o el mensaje informa "PLAN TERMINADO" o "SIN PASO EJECUTABLE" con la tabla mostrada.
NO está cumplido si falta algún punto de "Hecho cuando", si un ✓ no tiene una salida real que lo respalde, si la verificación final falló o salteó la integración, si quedan cambios sin commitear o si cambió el estado de otra fila de la tabla. Las fallas intermedias ya corregidas no cuentan.
```

## Variante: hasta terminar todo

Si preferís que siga de largo en la misma sesión (más riesgo de contexto largo y menos control entre pasos), reemplazá la primera línea por:

> Ejecutá los pasos del plan docs/goals/asesoria-shopping/ uno tras otro, eligiendo y cerrando cada uno con las reglas de abajo (con su propio commit) antes de empezar el siguiente.

Y reemplazá el primer párrafo de la condición por:

> Cumplido cuando el último mensaje muestra la salida de grep con todos los pasos en ✅ y el resumen final del paso 13 con los 11 puntos numerados del SPEC, o informa "SIN PASO EJECUTABLE" con la tabla y qué traba cada pendiente.

En la variante, un paso ⛔ **no** termina la corrida: se commitea como ⛔ y se sigue con el siguiente ejecutable. Solo se termina con "SIN PASO EJECUTABLE" o con todo ✅. Borrá también las frases "Ejecutá UN solo paso…", "y cerralo", el "También está cumplido si: el paso quedó ⛔…" y el "cambió el estado de otra fila". El resto de las reglas (selección, evidencia, verificación, commit por paso) no cambia.

# Revisión de Orden 03 — no aceptada todavía

Codex ejecutó el 12-09-2026 la migración y pruebas en Supabase local (CLI 2.117.0, Docker Desktop 4.90.0). `supabase db reset --local` **pasó** y aplicó las dos migraciones. `supabase test db` **falló** en ambos archivos. `node supabase/tests/database/concurrent_test.js` **falló** con `Profile is not active`. Ninguna base remota fue modificada.

## Bloqueos

1. `public.set_daily_report` es `SECURITY DEFINER`, pero la migración solo hace `GRANT EXECUTE ... TO authenticated` y no revoca el `EXECUTE` que PostgreSQL concede por defecto a `PUBLIC`. pgTAP confirmó que `anon` conserva `EXECUTE`. Revoca `ALL ON FUNCTION ... FROM PUBLIC, anon` antes de conceder a `authenticated`. Prueba invocación como anónimo, no solo metadatos.
2. El archivo de Orden 02 sigue esperando `INSERT` y `UPDATE` directos para `authenticated`; tras la nueva migración esos grants se revocan. Actualiza las pruebas previas para afirmar el estado **final** del esquema. Conserva su cobertura RLS para `SELECT`, perfiles y restricciones, usando preparación privilegiada cuando corresponda. Las dos suites deben pasar juntas después de un reset limpio.
3. `results_eq` de pgTAP no puede comparar filas `json` porque PostgreSQL no tiene operador de igualdad para `json`. La ejecución se detuvo en esa aserción. Usa `jsonb` como tipo de retorno, castea a `jsonb`/texto estable o extrae campos escalares y compara esos campos.
4. La prueba concurrente no prepara un usuario/perfil persistente; los datos de pgTAP se revierten con `ROLLBACK`. Por eso ejecutó `Profile is not active`. Debe crear usuarios/perfiles sintéticos únicos, limpiar sus datos al terminar y usar sesiones con `SET ROLE authenticated` y JWT de ese usuario. Conectar como `postgres` y cambiar solo claims no demuestra que el cliente sin privilegios pueda ejecutar la operación. Usa URL local configurable por entorno; evita una credencial fija en el archivo. Falla con código distinto de cero ante cualquier resultado incorrecto y verifica el valor y revisión finales en base. Ejecuta varias repeticiones de creación y actualización en **dos conexiones independientes**, con resultados uno éxito/uno conflicto.
5. La función trata `p_expected_revision` negativa como permiso de creación cuando no existe fila (`IF COALESCE(...) > 0`). Valida de forma explícita que la revisión esperada sea entero no negativo; decide y documenta si `NULL` equivale a 0 o es inválido. Añade tests. Asegura que el caso de `unique_violation` distinga la colisión esperada de cualquier otra violación de clave única para no ocultar errores de esquema.
6. `pg` se añadió a `dependencies` aunque solo lo usa un script de prueba. Muévelo a `devDependencies` y mantén actualizado `package-lock.json`. Añade un comando npm claro para ejecutar la prueba concurrente local.

## Criterio de entrega

Entregar salidas de `supabase db reset --local`, `supabase test db`, prueba concurrente, `npm test`, lint y build. No conectar React ni publicar hasta que todo pase. La función atómica y su seguridad no se consideran verificadas con el resultado actual.

## Segunda validación local — 13 de septiembre de 2026

La migración corregida se aplicó con `supabase db reset --local`. `npm run test:concurrency` **pasó una ejecución**: una creación y una actualización concurrentes produjeron un éxito y un conflicto, el reintento quedó rechazado y el estado final fue revisión 2, total 15. `npm test` (26), lint y build pasaron. `supabase test db` **sigue fallando**:

- Orden 03: 3/10 aserciones fallidas. La prueba llamada “anon” no hace `SET LOCAL ROLE anon`, por lo que se ejecuta como superusuario y obtiene `P0001 Not authenticated` en vez de `42501`. Añadir el cambio de rol y restaurarlo antes de la preparación siguiente. Dos comparaciones de conflicto hacen `::text` sobre `jsonb` y fallan solo por el orden de claves; comparar el valor `jsonb` como tal o campos escalares.
- Orden 02: el test se detiene en la línea 87, que usa `is_empty` para un `UPDATE` directo ahora prohibido por grant. Cambiar a aserción de `42501`; revisar **todas** las aserciones posteriores que hacen `INSERT`/`UPDATE` directo como `authenticated`. Las restricciones de tabla pueden probarse con preparación privilegiada, y las validaciones de API a través de `set_daily_report`.
- El script concurrente llama `process.exit(1)` dentro del `catch`, lo que puede impedir la limpieza del `finally`. Usar `process.exitCode = 1` y cerrar conexiones en `finally`; hacer que el fallo de limpieza también falle. Verificar que el total final corresponda al cliente ganador, no solo que sea 15 o 20. Repetir las carreras varias veces con usuarios/fechas únicos para reducir resultados fortuitos.

La Orden 03 sigue abierta: una ejecución concurrente favorable no compensa la suite pgTAP fallida ni completa la revisión de seguridad.

## Tercera validación local — 13 de septiembre de 2026

Codex ejecutó `supabase db reset --local` (aplicó ambas migraciones), `supabase test db` (**2 archivos, 40/40, PASS**) y `npm run test:concurrency` (**5/5 ciclos de creación, actualización y reintento con dos conexiones, PASS**). `npm test` (**26/26**) y `npm run build` pasaron. `npm run lint` terminó con código 0, pero emitió **una advertencia** `eslint(no-unsafe-finally)` en `supabase/tests/database/concurrent_test.js:103`; por tanto no debe describirse como «sin advertencias».

Dos ajustes de calidad siguen pendientes antes de cerrar la orden:

1. El test `updated_at trigger works automatically` de la suite RLS no realiza ningún `UPDATE`: inserta `2026-09-12 10:00:00+00` y luego verifica que no sea `2026-09-11 10:00:00+00`. Pasa incluso si se elimina el trigger. Hacer un `UPDATE` privilegiado o una escritura RPC y comparar el valor posterior con el valor anterior real.
2. Evitar `throw` dentro de `finally` en el script concurrente; conservar tanto el error original como un posible fallo de limpieza, poner `process.exitCode = 1`, y cerrar las tres conexiones sin silenciar fallos relevantes. Ejecutar lint sin advertencias después.

El mecanismo atómico, los grants y las carreras probadas localmente quedan aceptados en su comportamiento observado. Staging, peticiones por la API y política de corrección de fechas históricas siguen fuera de esta validación.

## Cierre de Orden 03 en PostgreSQL local — 13 de septiembre de 2026

Antigravity corrigió la prueba del trigger para hacer un `UPDATE` real y retiró el `throw` inseguro de `finally`. Codex reconstruyó la base local y ejecutó: `supabase test db` **2 archivos, 40/40 PASS**; `npm run test:concurrency` **5/5 ciclos PASS**; `npm test` **26/26 PASS**; `npm run lint` **sin advertencias**; `npm run build` **PASS**. Orden 03 **cerrada para la base local**. Esto no equivale todavía a validación por PostgREST, staging o producción. El repositorio sigue sin primer commit.

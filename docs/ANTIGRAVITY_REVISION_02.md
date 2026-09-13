# Revisión de Orden 02 — pendiente de corrección y ejecución

Revisado por Codex el 12 de septiembre de 2026. `npm test` (26), `npm run lint` y `npm run build` pasan. No hay Docker, Supabase CLI ni `psql` disponibles aquí; **las pruebas PostgreSQL no han pasado**.

## Bloqueos de la suite SQL

1. En `supabase/tests/database/20260912_rls_policies_test.sql`, el primer `is_empty('SELECT * FROM public.profiles')` como `anon` contradice el `REVOKE ALL` de la migración. Una lectura sin grant genera `42501`, no un conjunto vacío. Usa una aserción de error para `profiles` y `daily_reports`, y prueba por separado la ocultación RLS con un rol que sí tenga el grant.
2. El test anuncia 15 aserciones, pero faltan las que exige Orden 02: B no puede actualizar filas de A; A no puede cambiar `user_id`; el usuario desactivado no puede actualizar reportes existentes; fracciones no son aceptadas; dos usuarios activos pueden tener igual fecha y total; `updated_at` realmente cambia. `lives_ok(UPDATE ...)` no demuestra que una fila cambió: un `UPDATE` de cero filas también pasa. Comprueba estado final, cantidad de filas afectadas o usa `RETURNING`.
3. Una prueba de estado desactivado debe partir de un reporte existente de ese usuario creado por preparación privilegiada, para demostrar que SELECT y UPDATE quedan bloqueados incluso con JWT válido. El intento de insertar a nombre de A por B no sustituye esta prueba.
4. Añade una aserción de metadatos de grants para que falle si `anon` o `authenticated` recuperan `DELETE`/`UPDATE profiles`. En las pruebas de errores, verifica los SQLSTATE correctos tras ejecutarlas; no des por supuesto que todos los bloqueos RLS y grants emiten el mismo código.

## Reproducibilidad pendiente

- No existe `supabase/config.toml`; el README debe incluir `supabase init` (o incorporar el archivo generado sin secretos) antes de `supabase start` para que un clon limpio sea reproducible.
- Ejecuta en un entorno con Docker compatible y Supabase CLI: `supabase start`, `supabase db reset --local` y `supabase test db`. Conserva salida y versiones. No uses `--linked` ni bases compartidas. Si el entorno sigue sin Docker, deja el estado bloqueado y entrega los tests corregidos para revisión estática, sin llamarlos aprobados.
- `revision` aún no evita condiciones de carrera. No se autoriza integrar la persistencia remota hasta implementar una escritura condicional/transaccional y probar dos clientes con la misma revisión.

## Estado de la migración

El `UPDATE` de `profiles` fue retirado y los grants de tabla son explícitos. La política de `daily_reports` incluye el estado `active`, y el rango SQL de conteo coincide con el dominio. Estas mejoras quedan **provisionalmente aceptadas solo por lectura de código**; la aceptación final requiere pruebas PostgreSQL reales.

## Segunda revisión estática

Antigravity reescribió el test, pero `plan(22)` no coincide con las **19 aserciones** presentes (4 de grants, 2 anónimas, 8 de Alice, 4 de Bob y 1 de dos usuarios). pgTAP debe fallar por el conteo incluso si las 19 aserciones pasan. Falta crear las tres aserciones pendientes o ajustar el plan después de completar la cobertura.

La cobertura aún omite: anónimo no puede insertar; Alice no puede actualizar `profiles.status`; Alice no puede insertar/actualizar filas de Bob; Bob desactivado no puede insertar; `revision < 0`; duplicado de `(user_id, work_date)`; Bob desactivado puede leer solo su propio perfil; dos usuarios activos con igual **fecha y total** (el test usa 10 y 42); y la actualización del perfil propia frente a ajena. No es necesario tener una aserción por cada frase si se demuestra el comportamiento, pero estos casos deben quedar explícitos en la suite.

`npx supabase init` fue cancelado y `supabase/config.toml` sigue ausente. El README da el comando, pero el repositorio todavía no permite reproducir las pruebas en un clon limpio sin ese paso manual. Una configuración local versionada, generada sin secretos, permitiría que la CLI aplique migraciones y ejecute tests de forma consistente.

## Validación local posterior — 12 de septiembre de 2026

Antigravity añadió `supabase/config.toml` y completó las aserciones. Codex ejecutó Supabase CLI 2.117.0 con Docker Desktop 4.90.0, `supabase start`, `supabase db reset --local` y `supabase test db`: **1 archivo, 28 pruebas, PASS**. También pasaron `npm test` (26), `npm run lint` y `npm run build`. La revisión estática anterior registra el estado de entregas previas y ya no describe la suite actual. Orden 02 queda aceptada **para PostgreSQL local**. Siguen pendientes staging, pruebas API y guardado atómico con revisión; no se aplicó nada remoto.

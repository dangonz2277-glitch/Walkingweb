# Revisión de Orden 04 — API local pendiente

Codex revisó el commit `f442b9995ae4062b2eead33bd1545dc004fe3729` y ejecutó los checks en Supabase local el 13-09-2026. `supabase db reset --local` aplicó migraciones; `supabase test db` pasó **40/40**. `npm test` pasó **26/26**, lint sin advertencias y build correcto. `npm run test:api` **falló** en `signUp` de Alice: `Signups not allowed for this instance`. No hubo conexión remota.

## Bloqueos de la prueba HTTP

1. `supabase/config.toml` contiene `[auth] enable_signup = false` y `[auth.email] enable_signup = true`. El registro global permanece cerrado: la prueba se detiene antes de hacer ninguna aserción HTTP de RLS. Para probar Auth local, habilita registro **solo en la configuración local de test**, documentando que staging/producción deben usar altas administradas y registro público deshabilitado. Alternativa preferible si la CLI lo permite: crear usuarios sintéticos mediante Admin Auth local con una clave de servicio obtenida del entorno de prueba, sin exponerla en código.
2. El script no crea perfiles. Tras `signUp`, ejecuta `UPDATE public.profiles ... WHERE user_id = bobId`, pero ninguna migración crea automáticamente `profiles`; el `UPDATE` afectará cero filas. Crea perfiles de Alice y Bob explícitamente mediante preparación privilegiada local y comprueba `rowCount`/estado. Sin ello, Alice tampoco puede llamar la RPC (`Profile is not active`).
3. La clave `SUPABASE_ANON_KEY` está incrustada en el script. Obtén la clave publicable/anon del stack local mediante variable de entorno o CLI; si falta, falla con un mensaje claro. No pongas claves de servicio, contraseñas ni tokens en código, Git o salida de CI. El fallback actual podría pertenecer a otra instancia y hacer que un error de autenticación parezca una política correcta.
4. En la prueba de Bob, se ignora `error` del `select`. Una respuesta fallida puede parecer una lista vacía y producir falso positivo. Comprueba `error === null` y `data` esperado. En la prueba de RPC anónima, comprueba el código/resultado de acceso denegado, no solo que exista cualquier error. Después del conflicto de Alice, vuelve a leer el total y la revisión para demostrar que no cambió. Añade el `UPDATE` directo que el resumen afirma probar, porque el script actual solo comprueba `INSERT` directo.
5. La limpieza debe cerrar clientes aunque el fallo ocurra antes de `adminPg.connect()`, y debe informar si no borró los usuarios creados. Usa datos únicos, sin alterar cuentas reales. Un test API que falla antes de sus aserciones no verifica RLS aunque pgTAP pase.

## Git y CI

- El commit inicial existe y el árbol está limpio. Contrario al informe, `origin` sí apunta a `https://github.com/dangonz2277-glitch/Walkingweb.git`; no se hizo push.
- `supabase/.branches/_current_branch` quedó versionado pese a ser estado local de la CLI. Ignóralo y retíralo del índice en un commit posterior, sin borrar migraciones ni configuración versionada.
- CI usa Node `20.x`; Vite 8 declara `^20.19.0 || >=22.12.0`. Fija una versión compatible y mantenida (por ejemplo 22.12+ o una LTS posterior compatible), y no afirmes que CI pasó hasta ejecutarlo en GitHub.

Orden 04 abierta. No conectar React, staging ni producción hasta que la prueba HTTP pase con tokens reales y errores comprobados.

## Validación final local — 13 de septiembre de 2026

Antigravity creó el commit `445cb21`, retiró `supabase/.branches/_current_branch` del índice, ajustó CI a Node 22.12.0, habilitó registro solo en la configuración local de prueba y corrigió la preparación de perfiles y las aserciones HTTP. Codex reinició Supabase local para aplicar Auth y ejecutó `npm run test:api`: **PASS**, con dos usuarios sintéticos y limpieza confirmada de ambos. También pasaron `supabase test db` (**40/40**), `npm run test:concurrency` (**5/5 ciclos**), `npm test` (**26/26**), lint sin advertencias y build. La primera ejecución de `test:api` no pudo encontrar Docker desde el subproceso `npx supabase status`; pasó al incluir la ruta de Docker Desktop en `PATH`. La documentación de ejecución debe mencionar que Docker y Supabase CLI deben ser localizables desde el proceso de test.

Orden 04 **cerrada para API local**. Quedan pendientes CI ejecutado en GitHub, staging, registro público cerrado fuera de test, gestión administrativa de perfiles y puerta general del sitio. El remoto `origin` está configurado, pero no se hizo push.

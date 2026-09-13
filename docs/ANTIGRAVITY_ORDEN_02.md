# Orden 02 para Antigravity — seguridad SQL y pruebas reales de PostgreSQL

Trabaja solo en `/Users/daniel/Documents/Desarollo/Web/WalkingWeb`. Mantén el catálogo React operable y los 42 productos. No conectes producción ni crees usuarios reales. Esta orden cierra la revisión de la migración inicial y exige pruebas ejecutadas en PostgreSQL local/Supabase local; Codex revisará el diff y la evidencia.

## 1. Corregir la migración antes de aplicarla fuera de local

- En `supabase/migrations/20260912_initial_schema.sql`, elimina la posibilidad de que un usuario cambie su `profiles.status`. Preferimos que el cliente solo pueda leer su perfil: ninguna política ni grant `UPDATE` para `authenticated` sobre `profiles` hasta que exista una operación de servidor específica para editar `display_name`. Altas, bajas y cambios de estado quedan para administración posterior. Un perfil `disabled` tampoco debe poder leer o modificar reportes aunque conserve un JWT vigente: haz que las políticas de `daily_reports` consulten el estado activo del propietario. Documenta si la lectura del propio perfil deshabilitado sigue permitida para mostrar el estado.
- Declara grants explícitos para `anon` y `authenticated` en ambas tablas; revoca privilegios por defecto antes de conceder los mínimos. Ningún `DELETE`, `TRUNCATE`, `REFERENCES` ni `TRIGGER` para clientes. Verifica el comportamiento real de grants y RLS, no solo la presencia de políticas.
- Alinea SQL y dominio: `resolved_count BETWEEN 0 AND 9999`, `revision >= 0`, campos esenciales `NOT NULL`; define cómo se actualiza `updated_at`. Si `revision` aún no se incrementa de forma transaccional en esta etapa, dilo expresamente y deja el guardado concurrente para la orden de persistencia; no presentes el campo como protección ya operativa.
- La migración inicial aún no se ha aplicado a ningún entorno conocido. Puedes editarla en sitio para pruebas locales; si descubres que ya fue aplicada en alguna base compartida, no reescribas historia: añade migración correctiva e informa dónde se aplicó.

## 2. Pruebas SQL ejecutables

- Instala o usa Supabase CLI y un runtime Docker-compatible en tu entorno. Inicializa `supabase/config.toml` sin secretos si falta. Ejecuta solo comandos locales (`supabase start`, `supabase db reset --local` si la CLI lo admite, `supabase test db`); nunca uses `--linked` ni conectes producción. Si no dispones de Docker/CLI, deja los tests ejecutables y comunica el bloqueo; no marques RLS como probado.
- Reemplaza el archivo de casos conceptuales por pruebas pgTAP reales bajo `supabase/tests/database/`, con transacción y `ROLLBACK`. Prepara dos usuarios de prueba y perfiles, y cambia rol/JWT de forma fiel a Supabase (`set local role authenticated` y claims) para ejercer políticas con `auth.uid()`; las consultas de preparación privilegiadas no cuentan como verificación.
- Prueba al menos: anónimo sin lectura/escritura; usuario A lee solo A; B no lee ni inserta/actualiza A; A inserta y modifica solo su día; A no puede cambiar `status`, propietario ni borrar; perfil `disabled` no puede consultar ni modificar reportes con JWT vigente; conteos `-1`, `10000` y fraccionarios rechazados; revisión negativa rechazada; duplicado `(user_id, work_date)` rechazado; dos usuarios pueden usar igual fecha y total; `updated_at` cambia tras una actualización si se implementa automatismo.
- Cuando un acceso esté bloqueado por grant, espera error de permisos; cuando lo bloquee RLS, acepta cero filas o error de política según la operación. Las aserciones deben fallar si se relaja accidentalmente la seguridad. Mantén datos de prueba sintéticos.

## 3. Reproducibilidad y entrega

- Añade scripts/documentación con los comandos exactos para levantar, reconstruir y probar la base local. Explica el requisito de Docker y qué se destruye en el reset local. Añade la prueba SQL a CI solo si el runner realmente inicia el stack; no dejes un check verde que omite la base.
- Ejecuta `npm test`, `npm run lint`, `npm run build`, `supabase db reset --local` (o equivalente local verificado) y `supabase test db`. Entrega comandos, versiones, salida resumida con número de pruebas y fallos, y lista de archivos cambiados. Si alguna prueba no se pudo ejecutar, indica el motivo exacto y no declares cerrado este punto.
- No hagas push, despliegue ni migración remota en esta orden. No implementes todavía login, gateway, UI nueva ni guardado de reportes.

Referencias: [RLS y grants de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [pruebas de base con pgTAP](https://supabase.com/docs/guides/database/testing), [flujo local de la CLI](https://supabase.com/docs/guides/local-development/cli-workflows).

# Auditoría de Staging (Revisión 09A / Post-Push 09B / Prep. Smoke Test 10A)

**Fecha:** 2026-09-16
**Estado:** Preparación de Smoke Tests Remotos (Auth)

## 1. Información del Proyecto
- **Project Ref:** `unctlwxbttwfumnekctx`
- **Nombre:** WalkingWeb
- **Región:** `us-east-2`
- **Engine:** PostgreSQL 17 (v17.6.1.166)
- **Estado Remote:** `ACTIVE_HEALTHY`

## 2. Estado de las Migraciones
Tras ejecutar `supabase db push` y verificar con `supabase migration list --linked`, la comparativa refleja que el esquema local se ha sincronizado correctamente:

| ID de Migración | Local | Remote |
| :--- | :--- | :--- |
| `20260912` (initial_schema) | 20260912 | 20260912 |
| `20260912220000` (atomic_save) | 20260912220000 | 20260912220000 |
| `20260913150000` (rate_limit) | 20260913150000 | 20260913150000 |

## 3. Verificaciones de Lectura y Seguridad
Se realizaron comprobaciones con la API REST (PostgREST) usando las claves públicas (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) y privadas (`SUPABASE_SECRET_KEY`) con los siguientes resultados:

1. **Tablas Base**:
   - `profiles`: Creada y vacía (`[]`). El acceso anónimo devuelve `401 Unauthorized`.
   - `daily_reports`: Creada y vacía (`[]`).
   - `rate_limits`: Creada y vacía (`[]`).
2. **Funciones RPC**:
   - `set_daily_report`: Existe en el catálogo administrativo.
   - `check_rate_limit`: Existe en el catálogo administrativo.
   - `reset_rate_limit`: Existe en el catálogo administrativo.
3. **Restricción de Acceso Público**:
   - Comprobado satisfactoriamente. Ningún usuario anónimo puede extraer información de las tablas protegidas.
   - La API PostgREST devuelve `404 Not Found` (ocultas en el caché de esquema por falta de privilegios) a los usuarios anónimos que intentan invocar cualquiera de las tres funciones RPC privadas.
   - El bloqueo de acceso anónimo ha sido validado empíricamente, y su configuración está respaldada por una combinación verificable de revocaciones de permisos (`REVOKE ALL`/`REVOKE EXECUTE` de _grants_ públicos) en el motor de PostgreSQL y políticas de Nivel de Fila (RLS) en las tablas subyacentes.

## 4. Requisitos y Plan del Smoke Test (Orden 10A)
Se ha diseñado el script `supabase/tests/staging/auth_smoke_test.js` para validar la integración con Auth remoto. Este script **requiere autorización explícita** para ejecutarse.

**Verificaciones Pendientes en el Dashboard de Supabase (por Daniel):**
Debido a que la lectura remota de configuración mediante CLI devuelve el estado del registro, pero la configuración no fue empujada (`config push`), debes confirmar las siguientes opciones en el Dashboard de tu proyecto Supabase:
- Que el **registro de nuevos usuarios públicos esté deshabilitado**. (Authentication -> Providers -> Email -> `Enable signup` = `false`).
- Que el proveedor de correo electrónico (Email) se mantenga **habilitado**.
- Que la duración del JWT (Session duration) concuerde con lo requerido por el proyecto (ej: 3600 segundos).
- Comprobar que la validación de cuenta/correo electrónico sea compatible con cuentas creadas administrativamente (verificar en Settings -> Auth).

**Plan del Smoke Test (Una vez autorizado):**
1. Comprobación del Guard: Exigirá `ALLOW_STAGING_MUTATION=1` y prohibirá URLs locales, validando que el `project ref` coincide con el de staging.
2. Crear Usuarios Sintéticos: Se darán de alta 2 cuentas (ej: `smoke1_<timestamp>`).
3. Operaciones de Login y Guardado Atómico (RLS).
4. Prueba de Bloqueo por Desactivación (Baneo remoto).
5. Limpieza automática (*finally block*) para eliminar los usuarios generados, manteniendo el entorno staging limpio.

*Nota de Seguridad: Este documento ha sido purgado de cadenas de conexión, contraseñas, secretos JWT o identificadores de base de datos internos.*

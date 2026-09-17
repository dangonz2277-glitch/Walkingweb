# Auditoría de Staging (Revisión 09A / Post-Push 09B)

**Fecha:** 2026-09-16
**Estado:** Post-Migración (Deployed Initial Schema)

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
   - `profiles`: Creada y vacía (`[]`). El acceso anónimo devuelve `401 Unauthorized` (RLS activo).
   - `daily_reports`: Creada y vacía (`[]`).
   - `rate_limits`: Creada y vacía (`[]`).
2. **Funciones RPC**:
   - `set_daily_report`: Existe en el catálogo (detectada por el _schema cache_).
   - `check_rate_limit`: Restringida (anónimo devuelve `401 Permission Denied`).
   - `reset_rate_limit`: Restringida.
3. **Restricción de Acceso Público**:
   - Comprobado satisfactoriamente. Ningún usuario anónimo puede extraer listas de perfiles ni invocar los mecanismos de limitación de tasa.

*Nota de Seguridad: Este documento ha sido purgado de cadenas de conexión, contraseñas, secretos JWT o identificadores de base de datos internos.*

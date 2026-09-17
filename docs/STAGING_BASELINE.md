# Auditoría de Staging (Revisión 09A)

**Fecha:** 2026-09-16
**Estado:** Pre-Despliegue (Baseline)

## 1. Información del Proyecto
- **Project Ref:** `unctlwxbttwfumnekctx`
- **Nombre:** WalkingWeb
- **Región:** `us-east-2`
- **Engine:** PostgreSQL 17 (v17.6.1.166)
- **Estado Remote:** `ACTIVE_HEALTHY`

## 2. Estado de las Migraciones
Tras ejecutar `supabase migration list --linked`, se obtiene la siguiente comparativa entre el repositorio local y el proyecto vinculado:

| ID de Migración | Local | Remote |
| :--- | :--- | :--- |
| `20260912` (initial_schema) | Pendiente | No Aplicada |
| `20260912220000` (atomic_save) | Pendiente | No Aplicada |
| `20260913150000` (rate_limit) | Pendiente | No Aplicada |

## 3. Diferencias Detectadas (Local vs Remoto)
El esquema remoto se encuentra actualmente vacío (sin inicializar) en relación a los recursos de WalkingWeb. 
Las pruebas de lectura confirmaron el código HTTP `404` (PGRST205) para las tablas principales, lo cual se corrobora con la falta de migraciones remotas. 
Faltan:
1. Esquema base (tablas `profiles`, `daily_reports`, `rate_limits`).
2. Funciones RPC (ej. `check_rate_limit`, `reset_rate_limit`).
3. Triggers de timestamps.
4. Políticas de Seguridad RLS.

## 4. Orden de Aplicación Propuesto
Según el reporte de `supabase db push --dry-run`, se aplicarán las siguientes 3 migraciones en estricto orden cronológico:

1. `20260912_initial_schema.sql` - Crea tablas y RLS de profiles y daily_reports.
2. `20260912220000_atomic_save.sql` - Añade RPCs para operaciones atómicas.
3. `20260913150000_rate_limit.sql` - Introduce la tabla rate_limits y los RPCs correspondientes.

*Nota de Seguridad: Este documento ha sido purgado de cadenas de conexión, contraseñas, secretos JWT o identificadores de base de datos internos.*

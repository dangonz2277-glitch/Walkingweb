# Auditoría de Staging (Revisión 09A / Post-Push 09B / Smoke Test 10B)

**Fecha:** 2026-09-16
**Estado:** Smoke Test de Auth Alojado - Superado con Éxito

## 1. Información del Proyecto
- **Project Ref:** `unctlwxbttwfumnekctx`
- **Nombre:** WalkingWeb
- **Región:** `us-east-2`
- **Engine:** PostgreSQL 17 (v17.6.1.166)
- **Registro Público (Enable signup):** Deshabilitado manualmente en Dashboard (Confirmado por Daniel).
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

## 4. Ejecución del Smoke Test Remoto (Orden 10B)
El script de prueba de humo `supabase/tests/staging/auth_smoke_test.js` fue autorizado y ejecutado una única vez contra el servidor de staging real, validando los componentes clave de Autenticación, RLS y lógica de negocios.

**Resultados de la Ejecución:**
- **Login de Usuarios Sintéticos:** Dos usuarios sintéticos (ej. `smoke1_...` y `smoke2_...`) fueron aprovisionados administrativamente (con `email_confirm: true`) y lograron iniciar sesión (JWT grant) exitosamente mediante Supabase Client.
- **Mismo día, mismo total y Aislamiento RLS:** Ambos usuarios insertaron exactamente 5 pasos en la misma fecha (zona horaria La Paz). Al solicitar la lista, cada cliente recibió **exactamente 1 reporte**, validando que el aislamiento simétrico RLS impide el sangrado de datos (*cross-user data bleed*).
- **Conflicto de Revisión Atómico:** Una modificación concurrente intencionada (forzando una condición de carrera simulada) fue detectada y rechazada correctamente por la función SQL remota, devolviendo el objeto de conflicto esperado (`success: false, conflict: true, current_revision: 1`).
- **Bloqueo tras Desactivación:** Un usuario fue baneado (desactivado) administrativamente.
  - Se confirmó que el token pre-existente activo dejó de poder invocar la RPC `set_daily_report` (devolviendo el error defensivo textual `Profile is not active`).
  - Las lecturas a la base de datos RLS devolvieron arreglos vacíos de forma imperceptible.
  - Un nuevo intento de inicio de sesión desde un cliente limpio falló exitosamente.
- **Restablecimiento de Contraseña:** Un usuario sintético cambió su contraseña vía el backend administrativo, comprobándose que la contraseña anterior perdía validez, mientras que la nueva autorizaba satisfactoriamente el inicio de sesión.
- **Limpieza Completa (Cleanup):** El bloque `finally` erradicó exitosamente ambas cuentas sintéticas utilizando cascada y confirmación manual.

**Auditoría Post-Prueba (Sólo lectura):**
Mediante el cliente de administración se comprobó el estado de las tablas remotas luego de la ejecución:
- `users`: Cero usuarios sintéticos remanentes.
- `profiles`: 0 filas.
- `daily_reports`: 0 filas.
- `rate_limits`: 0 filas.
La base de datos de staging mantiene su integridad intocable.

*Nota de Seguridad: Este documento ha sido purgado de cadenas de conexión, contraseñas, secretos JWT o identificadores de base de datos internos.*

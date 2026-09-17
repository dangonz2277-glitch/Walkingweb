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
Se ha diseñado el script `supabase/tests/staging/auth_smoke_test.js` para validar la integración con Auth remoto. Este script **requiere autorización explícita** para ejecutarse vía `ALLOW_STAGING_MUTATION=1`.

**Verificaciones Pendientes en el Dashboard de Supabase (por Daniel):**
Debido a que la configuración no ha sido empujada (`config push`), debes realizar los siguientes ajustes manuales en el Dashboard del proyecto:
- **ATENCIÓN: El registro público de nuevos usuarios está actualmente HABILITADO en el servidor remoto**. Debes deshabilitarlo manualmente (Authentication -> Providers -> Email -> `Enable signup` = `false`) antes de correr el smoke test.
- El proveedor de correo electrónico (Email) se encuentra **habilitado** de fábrica y exige confirmación. Esto es correcto y compatible, ya que la API del backend utiliza `email_confirm: true` al provisionar administrativamente las cuentas.
- *Nota sobre sesiones*: La CLI infiere ausencia de cambios respecto a un entorno por defecto, pero no se validó el valor absoluto de forma directa. Comprueba visualmente que la duración de sesión (`jwt_expiry`) esté establecida a 3600 segundos (1 hora).

**Plan del Smoke Test (Una vez autorizado):**
1. Comprobación del Guard: Exigirá `ALLOW_STAGING_MUTATION=1`, rechazará URLs no seguras (HTTP, localhost, subdominios alterados o credenciales embebidas), validando exhaustivamente que el `project ref` coincida con el de staging (`unctlwxbttwfumnekctx.supabase.co`).
2. Crear Usuarios Sintéticos: Se darán de alta 2 cuentas simétricas usando la utilidad de normalización interna del proyecto.
3. Operaciones de Login y Guardado Atómico (RLS). Ambos registrarán la misma meta en la misma fecha (zona horaria La Paz) para comprobar la privacidad estricta simétrica.
4. Prueba de Bloqueo por Desactivación: Se desactiva el perfil de un usuario (baneo remoto). El token ya emitido no "expira" instantáneamente del lado del cliente, sino que las operaciones posteriores (leer tablas o ejecutar la RPC `set_daily_report`) son rechazadas explícitamente por el motor RLS y las sentencias SQL defensivas que consultan el estado "inactivo" del perfil. También se verificará que un login nuevo sea rechazado.
5. Limpieza automática (*finally block*) estricta que captura errores. Elimina los usuarios de Auth desencadenando un ON DELETE CASCADE, y verifica mediante cliente administrador que no persisten registros huérfanos.

*Nota de Seguridad: Este documento ha sido purgado de cadenas de conexión, contraseñas, secretos JWT o identificadores de base de datos internos.*

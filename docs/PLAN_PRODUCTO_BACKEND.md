# Plan de acción del backend — Catálogo WalkingPad

**Documento rector · 12 de septiembre de 2026 · estado: requisitos de acceso acordados, arquitectura por validar**

Raíz única del proyecto: `/Users/daniel/Documents/Desarollo/Web/WalkingWeb`. Codex y Antigravity deben trabajar sobre esta misma raíz y actualizar este documento cuando cambie una decisión. No publicar la app actual hasta completar los criterios de salida de la etapa 10.

## Decisiones cerradas

- La web tendrá una **contraseña general fuerte** para entrar. El control ocurre antes de entregar HTML, JavaScript, CSS o JSON; un formulario React que compara una clave en el navegador no cumple este requisito.
- Dentro de la web, solo **Mi Reporte** tendrá perfiles personales. Cada perfil usará una contraseña de **mínimo ocho caracteres** (se permitirán contraseñas más largas). El acceso general no identifica al usuario del reporte.
- Mi Reporte será **únicamente el número de tickets resueltos por persona y por día**. No almacena fichas de ticket. Los campos actuales de llamadas, emails, chats y nota pertenecen al formato antiguo y no se convertirán automáticamente.
- El módulo de seguimiento anterior fue eliminado; existe otro sistema para esa función. Su antigua clave de navegador puede conservarse en respaldos históricos, pero no se crea tabla ni módulo nuevos para ella.
- Al abrir la web se ven todos los modelos; las categorías filtran en la vista principal. Guía y Mi Reporte serán popups. Exportar/importar pasará a Ajustes o Datos. Estas son tareas de interfaz coordinadas con el backend, no motivos para cambiar el modelo de datos.
- La zona horaria de trabajo inicial será `America/La_Paz`. Se validará con el equipo antes de cargar datos de producción.

## Arquitectura de referencia

React/Vite sirve el catálogo. Un **gateway de acceso** en el hosting o backend protege cada ruta de la web antes de entregar contenido interno. Ese gateway verifica la contraseña general en el servidor y emite una sesión corta en cookie `HttpOnly`, `Secure` y `SameSite`. Su middleware protege también archivos estáticos y endpoints; cerrar sesión o rotar la contraseña invalida sesiones anteriores. HTTPS y límites de intentos son obligatorios.

Para Mi Reporte, un proveedor de autenticación probado gestiona las cuentas individuales. **Supabase Auth + Postgres con Row Level Security (RLS)** es la opción inicial a validar en staging; no es una dependencia irreversible. El frontend solo recibe una clave publicable y nunca una clave de servicio. La política de base de datos exige que cada fila pertenezca al usuario autenticado (`user_id = auth.uid()`); la contraseña general no concede acceso a reportes ajenos. La decisión concreta de hosting/gateway se toma en la etapa 2 y debe permitir probar que los assets están realmente protegidos.

La contraseña individual de ocho caracteres es una decisión de simplicidad con riesgo residual: **dos contraseñas no equivalen a dos factores**, y NIST recomienda quince caracteres cuando una contraseña es el único factor remoto. Para compensar sin cambiar la experiencia: mínimo ocho y sin máximo corto, bloquear contraseñas conocidas/filtradas cuando el proveedor lo permita, limitar intentos por cuenta e IP, invitaciones cerradas, restablecimiento seguro, sesión con caducidad y opción de usar una frase más larga. La contraseña general debe ser única y generada (al menos 20 caracteres aleatorios o una frase larga equivalente); solo su verificador derivado se almacena en el backend, mientras el secreto se guarda en un gestor de contraseñas, nunca en Git. No se registran contraseñas ni tokens en logs.

## Contrato de datos

- `profiles`: `user_id` UUID ligado a Auth, `display_name`, estado `active/disabled`, fechas. El administrador crea/invita, desactiva y restablece cuentas; no hay alta pública.
- `daily_reports`: clave única `(user_id, work_date)`, `resolved_count` entero no negativo, `revision`, `created_at`, `updated_at`. La fecha se define en la zona horaria del trabajo, no con la zona arbitraria del navegador. El usuario ve y modifica únicamente sus filas. Una persona puede tener un solo total por día.
- `report_changes`: opcional pero recomendado para auditoría de correcciones: usuario, fecha, valor anterior/nuevo, momento y motivo si aplica. No guarda contraseñas ni texto libre de tickets.
- `import_batches`: hash del respaldo, propietario, fecha, estado y resultado. Permite reintentar sin importar dos veces el mismo lote.
- Los JSON de catálogo/errores/guía se mantienen como fuente versionada al inicio. Solo pasan a tablas si se necesita administración central. La contraseña general debe proteger el bundle que los contiene si la guía es interna.

**Regla de concurrencia:** guardar un total usa `revision` o una condición equivalente para detectar otra pestaña/dispositivo; un botón «+1» futuro debe usar una operación transaccional con clave de idempotencia. No se confía en un incremento calculado solo por React. Días cerrados y permisos de corrección se fijan antes de la etapa 4.

**Legado:** `repSession_Daniel` y `repHistory_Daniel` se exportan y conservan con sus `shiftId`. No existe equivalencia automática entre llamadas/emails/chats y tickets resueltos. Se conserva una copia de solo lectura y cualquier carga de conteos históricos exige una asignación explícita por persona y fecha con vista previa.

## Entregas por urgencia

### 1. Congelar y controlar la base existente — EN PROGRESO

Crear un único repositorio Git en `WalkingWeb`, con rama principal protegida y trabajo por ramas/PR. Registrar los 42 productos y JSON fuente mediante hashes; guardar respaldo de los datos locales antes de migrar. Configurar CI para `npm test`, `npm run lint` y `npm run build`. No editar la antigua copia `react-app` ni el catálogo anterior. **Terminado cuando:** ambos agentes usan la misma raíz y cada cambio tiene diff, revisión y checks reproducibles. El primer commit local `f442b99` existe y `origin` está configurado; no hay push ni CI remoto ejecutado ni protección de `main`. Los hashes y respaldos deben verificarse; `supabase/.branches/_current_branch` quedó versionado por error y debe retirarse del índice.

### 2. Cerrar el perímetro del sitio — bloqueante de publicación (Gateway local aprobado; publicación pendiente)

Elegir hosting que permita una puerta **del lado servidor o edge**. Implementar login general, logout, rotación de clave y sesión segura. Exigir la sesión en `/`, rutas internas, assets, JSON y APIs. Configurar secreto fuera de Git y fuera de cualquier variable `VITE_` pública; HTTPS, límites de intentos y respuesta genérica a fallos. 

**Limitaciones y Mitigaciones documentadas:**
- **Sesión sin estado (JWT):** El servidor usa cookies firmadas (HMAC-SHA-256) sin estado. El logout borra la cookie en el cliente, pero una copia extraída de la misma cookie seguirá siendo válida hasta su fecha de expiración codificada (20 días). Para revocar instantáneamente *todas* las sesiones de forma forzosa, se debe rotar `SITE_SESSION_SECRET` (rotar solo `SITE_PASSWORD` evita nuevos logins pero no revoca cookies existentes).
- **Rate-Limiting (Mitigación de fuerza bruta):** Previo a su publicación, se deberá implementar un middleware o firewall (ej. Cloudflare Rate Limiting o Vercel Edge Firewall) para limitar los intentos de `POST /api/login` por IP a un máximo de 5 intentos por minuto, mitigando los ataques contra la contraseña maestra.

Probar acceso directo a la URL de un JS/JSON sin sesión. **Terminado cuando:** una petición anónima no puede obtener el contenido protegido, el proxy bloquea sin fallar (500) ante cookies inválidas, y las redirecciones respetan el host de origen. En `83e16f8`, la suite local pasa y las redirecciones relativas corrigieron el cambio de host. Antes de publicar quedan la prueba de navegador y preview, un límite de intentos efectivo y la revisión de cobertura descrita en `ANTIGRAVITY_REVISION_06D.md`.

### 3. Fijar el dominio del reporte y los esquemas — EN PROGRESO (SQL/RLS probado localmente)

Crear validadores versionados para perfil, fecha y conteo (`0` o entero positivo dentro de un límite razonable); migraciones SQL para `profiles` y `daily_reports`, restricción única y política de zona horaria. Definir si se permite corregir días pasados, quién lo hace y hasta cuándo. Escribir pruebas de dos personas, dos días, dos pestañas y valores inválidos. **Terminado cuando:** el contrato de datos y reglas de corrección están documentados y probados sin UI. El 12-09-2026 se aplicó la migración en Supabase local y pasaron las 28 pruebas pgTAP de grants, RLS y restricciones. Quedan pendientes la regla de correcciones históricas y la concurrencia real de `revision`.

### 4. Crear cuentas individuales en staging - EN PROGRESO (Orden 05 local)

Configurar Auth con registro público deshabilitado (en local `[auth] enable_signup = false` y proveedor de email activo para permitir login administrado). Implementar invitación/alta administrada con clave de servicio, garantizando la creación consistente del Auth user y el perfil; nombre visible, contraseña mínima de ocho caracteres, recuperación y desactivación. Activar controles de contraseñas filtradas y límites de intento disponibles en el proveedor; complementar en gateway si hace falta. Definir caducidad de sesión y reautenticación al abrir Mi Reporte en dispositivo compartido. **Terminado cuando:** hay dos perfiles de prueba independientes y uno desactivado no puede iniciar sesión. Orden 05 pasó un flujo HTTP local tras dos correcciones, pero todavía permite iniciar sesión a un perfil desactivado; RLS/RPC sí le bloquean reportes. Quedan comprobaciones de rollback y limpieza (ver `ANTIGRAVITY_REVISION_05.md`).

### 5. Blindar la base de datos — EN PROGRESO (pgTAP y API HTTP locales validadas)

Aplicar RLS y grants mínimos a cada tabla expuesta. Un usuario solo puede leer/insertar/actualizar su `(user_id, work_date)` mediante la RPC atómica; anónimos no acceden; la clave de servicio solo vive en servidor. Probar las políticas con solicitudes directas y usuarios distintos, incluidas rutas de actualización y borrado. **Terminado cuando:** las pruebas de acceso permitido y denegado pasan contra staging, no solo en tests simulados. Órdenes 02–04 pasaron en PostgreSQL local: 40/40 pgTAP, cinco ciclos concurrentes y flujo HTTP Auth/PostgREST con dos usuarios sintéticos. Siguen pendientes staging y CI remoto.

### 6. Implementar persistencia y operaciones idempotentes — EN PROGRESO (Orden 03 cerrada en PostgreSQL local)

Definir en `src/data` un contrato `getTodayReport`, `setResolvedCount`, `listMyReports` y `retrySave`; la UI no conoce SQL ni credenciales privilegiadas. Guardado con conflicto de revisión, estados `loading/saving/saved/error` y reintentos seguros. Si se añade «+1», usar endpoint/RPC transaccional con `idempotency_key` y registro único. **Terminado cuando:** doble clic, fallo de red, reintento y dos pestañas no pierden ni duplican el total. La Orden 03 cerró la RPC `set_daily_report` con 40 pruebas pgTAP y cinco ciclos concurrentes en PostgreSQL local el 13-09-2026. Faltan integración cliente, escenario de respuesta perdida y pruebas API/staging.

### 7. Trasladar datos sin inventar equivalencias

Mantener exportación de respaldo antiguo. Validar JSON, conservar claves `_corrupted`, mostrar vista previa, asignar propietario y fecha explícitos y no sobrescribir un total existente sin resolver conflicto. Archivar métricas antiguas sin convertirlas. Registrar el hash de lote para idempotencia y probar rollback/restauración. **Terminado cuando:** importar dos veces produce el mismo estado y un fallo a mitad de proceso no deja datos parciales.

### 8. Integrar Mi Reporte y el acceso en React

Tras la puerta general, catálogo y guía abren sin perfil. Al abrir Mi Reporte, pedir la cuenta individual si no hay sesión válida; mostrar solo el contador propio del día y su historial de totales. La sesión general y la personal se distinguen claramente. El popup conserva foco, borrador y mensajes de guardado al cerrar/abrir. **Terminado cuando:** el flujo completo funciona con teclado y móvil, y cerrar sesión personal no expulsa innecesariamente del catálogo.

### 9. Validación integral en staging

Ejecutar pruebas unitarias, de integración SQL/RLS y E2E de login general, login individual, aislamiento entre perfiles, fecha de medianoche, concurrencia, restablecimiento de contraseña, pérdida de red, importación y respaldo. Revisar el bundle: sin clave general, hashes, tokens ni datos privados. Verificar accesibilidad básica y navegadores principales. **Terminado cuando:** CI verde y el equipo aprueba una prueba con datos anonimizados.

### 10. Operación y publicación

Separar staging/producción, definir dominio y HTTPS, variables/secretos, backups automáticos y una restauración ensayada, monitoreo, logs sin secretos, alertas, rotación de la contraseña general y procedimiento para altas/bajas. Publicar gradualmente con posibilidad de reversión. El modo `file://` queda como legado de transición; la versión con backend necesita red y hosting. **Terminado cuando:** los criterios de acceso, integridad, restauración y operación se demuestran en producción antes de retirar la versión antigua.

## Decisiones pendientes antes de implementar cada bloque

1. Proveedor de hosting/gateway y proveedor de base/Auth, tras una prueba de protección real de assets.
2. ¿Se pueden corregir conteos de días anteriores? ¿Existe un administrador que vea totales del equipo o solo administra cuentas?
3. Confirmar `America/La_Paz` como fecha oficial del reporte.
4. Duración deseada de la sesión general y de Mi Reporte en dispositivos compartidos.

## Referencias técnicas

- [NIST SP 800-63B: contraseñas](https://pages.nist.gov/800-63-4/sp800-63b.html)
- [Supabase: seguridad de contraseñas](https://supabase.com/docs/guides/auth/password-security)
- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [OWASP: gestión de sesiones](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

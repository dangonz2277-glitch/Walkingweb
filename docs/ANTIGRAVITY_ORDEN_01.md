# Orden 01 para Antigravity — base verificable del backend

**Rol:** implementación. Codex revisará diseño, diff y pruebas antes de cerrar esta orden. Lee primero [PLAN_PRODUCTO_BACKEND.md](PLAN_PRODUCTO_BACKEND.md). Trabaja únicamente en `/Users/daniel/Documents/Desarollo/Web/WalkingWeb`; no muevas carpetas ni edites `react-app` o el catálogo anterior.

## Objetivo

Preparar una base profesional para el backend del contador diario de Mi Reporte, sin crear aún servicios externos, cuentas reales ni contraseñas. Mantén la app actual operativa y los 42 productos intactos.

## Alcance de este primer bloque

1. **Control de versiones:** comprobar si existe `.git`; si no existe, inicializar Git en esta raíz. El intento desde Codex falló con `Operation not permitted` por el sandbox. Si también falla en tu entorno, no cambies de carpeta ni fuerces permisos: informa el bloqueo. Amplía `.gitignore` para secretos `.env*` (con excepción de `.env.example`) y respaldos locales, sin ignorar migraciones ni documentación. Añade CI que ejecute `npm ci`, `npm test`, `npm run lint` y `npm run build` en cada PR si hay remoto compatible; si no hay remoto, deja el workflow listo sin inventar URL.
2. **Dominio puro:** crea un módulo separado de React y de `localStorage` para el nuevo conteo diario. Debe validar `resolvedCount` como entero entre 0 y 9999, calcular la fecha laboral en `America/La_Paz`, identificar cada registro por `(userId, workDate)` y distinguir conflictos de revisión. No conviertas `calls`, `emails` ni `chats` en tickets resueltos. Documenta las funciones exportadas y cubre zonas horarias, medianoche, números negativos/fraccionarios y dos usuarios con el mismo día.
3. **Esquema SQL revisable:** añade una primera migración Postgres/Supabase para `profiles` y `daily_reports` con claves estables, `unique(user_id, work_date)`, `check(resolved_count >= 0)`, `revision` y timestamps. Activa RLS; solo el propietario puede leer, insertar y actualizar sus filas; anónimo y usuario ajeno no pueden. No concedas borrado a usuarios. Escribe pruebas SQL de políticas para ejecutar en staging o, si no hay Postgres disponible, un archivo de casos esperados claramente marcado como pendiente de ejecución. No afirmes que RLS pasó si no se ejecutó contra una base real.
4. **Contratos de repositorio:** define una interfaz pequeña para `getTodayReport`, `setResolvedCount` y `listMyReports` con estados de éxito, conflicto y error. No conectes todavía Supabase ni reescribas el componente Mi Reporte. Mantén la lógica antigua en su sitio y separada; habrá migración explícita en otro bloque.

## Fuera de alcance

Puerta de contraseña general, cuentas individuales, despliegue, cambios visuales/popups, importación de datos reales y cualquier clave o token. No instales dependencias si se puede completar con las actuales; si una dependencia es necesaria, explica por qué y actualiza lockfile.

## Criterios para mi revisión

- `npm test`, `npm run lint` y `npm run build` pasan; no desaparecen los 42 modelos.
- Pruebas nuevas cubren validación, fecha `America/La_Paz`, identidad por usuario/día y conflicto de revisión; no son espejos triviales de la implementación.
- La migración SQL y políticas están comentadas, sin privilegios amplios ni clave de servicio en cliente.
- README y plan reflejan exactamente lo implementado y lo pendiente.
- Entrega un resumen con archivos cambiados, comandos/resultados y limitaciones. No declares terminada la etapa de acceso o base en staging.

# Orden 07 — Flujos de catálogo

Trabaja solo en `/Users/daniel/Documents/Desarollo/Web/WalkingWeb`. No hagas push ni despliegue. No amplíes el gateway ni el rate limit en esta orden. Si el login actual impide probar localmente los flujos, informa el caso reproducible antes de modificar esa capa.

## Alcance

1. Audita con pruebas de React y navegador los 42 modelos base, filtros de categoría, búsqueda por modelo/nombre/error/síntoma, detalle, códigos de error y guía. Parte del código actual, no de auditorías antiguas. Registra fallos concretos y corrígelos.
2. Completa el alta y **edición** de productos personalizados. `Catalog.jsx` hoy solo llama a `addProduct`; no hay edición. Mantén los JSON base como fuente de referencia y no los sobrescribas desde el navegador. Si se requiere editar la presentación de un modelo base, define una capa explícita de overrides locales, visible y reversible, sin mutar los 42 registros originales.
3. Separa la persistencia de la interfaz. Valida campos y enlaces, evita duplicados por identidad de modelo definida, conserva el formulario ante errores de guardado y muestra claramente cuándo un cambio es local. Comprueba carga tras recargar, recuperación de JSON local inválido y funcionamiento de exportación/importación sin sobrescribir silenciosamente datos existentes.
4. Conserva la decisión de producto: catálogo visible al entrar, guía y Mi Reporte como popups, y respaldo en una zona secundaria. Esta orden puede corregir la estructura necesaria para esos flujos, sin rediseñar toda la web.
5. Añade pruebas React significativas de búsqueda, detalles, alta, edición, duplicados, recarga y fallos de persistencia. Ejecuta `npm test`, `npm run lint`, `npm run build` y una comprobación real de los flujos en navegador local.

## Límite con Mi Reporte

No conectes aún `Report.jsx` a Supabase en esta orden. El componente actual muestra llamadas, emails y chats y usa `localStorage`; el producto acordado pide **solo el número de tickets resueltos del día por perfil**. En la siguiente orden habrá que alinear esa interfaz con `daily_reports.resolved_count`, autenticar al perfil con Supabase Auth y ejecutar la RPC `set_daily_report` bajo el JWT de ese usuario. **No usar la service role como sesión del empleado**: esa clave elude RLS y solo corresponde a tareas administrativas del servidor.

Entrega diff, resultados de pruebas y limitaciones reproducibles. Mantén operativos los datos locales hasta disponer de un traslado comprobado.

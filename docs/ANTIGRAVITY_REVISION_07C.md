# Revisión de la Orden 07B (`266418b`)

Estado: **Orden 07 abierta**. Pasaron `npm test` (33/33), `npm run lint` y `npm run build`, pero una prueba real en el navegador sobre `http://localhost:3000` mostró un error recuperable de hidratación de Next/React. No se hizo push ni despliegue.

## Bloqueos

1. `Catalog` inicializa `products` con `[]` en el servidor y con `getAllProducts()` en el navegador mediante `typeof window !== 'undefined'`. El HTML del servidor muestra 0 productos y el primer render cliente muestra 42. Next reporta: `Hydration failed because the server rendered text didn't match the client`, señalando el contador de `Catalog.jsx` (`Client 42`, `Server 0`). Corregir el límite servidor/cliente para que el primer render sea idéntico y cargar la persistencia local después de hidratar sin generar una actualización en efecto que restaure el warning anterior. Una opción limpia es pasar los 42 productos base como estado inicial serializable y aplicar la capa local tras el montaje mediante un store externo compatible con SSR (`useSyncExternalStore`) o aislar el catálogo persistente en un componente cliente que use un fallback de servidor consistente. Añadir una prueba de hidratación real o E2E que falle ante errores de consola.
2. La migración de `walkingpad_custom_products` marca todo registro sin `id`/`baseId` como `isOverride=true`. Si no coincide con ningún producto base, no establece `migrationConflict`; queda excluido de `newCustoms`, no entra en `conflicts` y tampoco coincide con `combinedBase`, por lo que desaparece de la interfaz. Un producto personalizado histórico sin `id` debe conservarse como custom con un identificador estable, mientras un override no resoluble debe conservarse visible como conflicto.
3. Si existe un conflicto, `saveArray('walkingpad_migration_conflicts', conflictsArr)` puede fallar y el resultado se ignora. La escritura de `walkingpad_local_products` todavía puede verificarse y provocar que se borre `walkingpad_custom_products`, perdiendo la única copia del contenido conflictivo. No borrar la clave antigua hasta verificar tanto la colección fusionada como el registro de conflictos. Probar fallo de cuota específicamente en la clave de conflictos.

## Observaciones

La identidad `baseId` conserva correctamente un override durante un cambio normal de nombre. Las pruebas añadidas para `X21`, `TRG1F`, recarga e importación pasan, pero no cubren los bloqueos anteriores. La verificación visual se detuvo antes de crear datos temporales porque el error de hidratación ya impide cerrar el criterio de navegador limpio.

Después de corregir, ejecutar test, lint y build. Abrir la app en navegador real, confirmar cero errores de hidratación/consola y completar alta, edición con renombrado, recarga, reversión, exportación e importación repetida. No describir JSDOM como navegador real.

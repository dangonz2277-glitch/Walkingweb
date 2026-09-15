# Revisión de la Orden 07C (`0b5261d`)

Estado: **Orden 07 abierta por un caso de compatibilidad local**. Pasaron `npm test` (36/36), `npm run lint` y `npm run build`. Una prueba en navegador real sobre `http://localhost:3000` confirmó 42 productos y ausencia del error/overlay de hidratación de Next. No se creó información temporal durante la revisión; no hubo push ni despliegue.

## Corrección validada

El primer render de servidor y cliente ya parte de los 42 productos base. La carga posterior de la capa local no produjo el error de hidratación observado en `266418b`. La migración desde `walkingpad_custom_products` conserva ahora un custom histórico sin `id` cuando no coincide con un producto base, y la clave antigua permanece si falla guardar los conflictos.

## Bloqueo restante

La normalización de registros que **ya están en `walkingpad_local_products`** sigue dejando invisible un override huérfano de las versiones anteriores. En `getAllProducts()`, cuando `localP.isOverride && !localP.baseId`, solo se adapta con una coincidencia o se marca `migrationConflict` con más de una. Con cero coincidencias devuelve el registro intacto: queda fuera de `newCustoms`, no entra en la lista de conflictos visibles y no coincide con ningún producto base.

Marcar el caso de cero coincidencias como conflicto visible y recuperable, o adaptarlo como custom únicamente si existe evidencia suficiente. Añadir una prueba que coloque directamente en `walkingpad_local_products` un override antiguo renombrado/sin coincidencia, recargue la app y compruebe que sigue visible y exportable. Incluir `walkingpad_migration_conflicts` y su variante `_corrupted` en el respaldo manual, o justificar y probar otra vía que garantice que esos datos de diagnóstico no se pierdan al cambiar de navegador.

Después ejecutar test, lint y build. No es necesario volver a rediseñar la hidratación ni la seguridad.

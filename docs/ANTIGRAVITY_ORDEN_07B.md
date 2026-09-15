# Orden 07B — Cierre de integridad del catálogo

Continúa exclusivamente en `/Users/daniel/Documents/Desarollo/Web/WalkingWeb`, partiendo de `46d3454`. No hagas push ni despliegue. No trabajes en Mi Reporte, Supabase ni el gateway durante esta orden.

## 1. Identidad estable de productos

- Sustituye la identidad `modelo|nombre` de productos base por una clave canónica estable que no dependa de campos editables.
- Asigna esa clave determinísticamente a los 42 productos al cargar los JSON y guárdala en cada override. No modifiques destructivamente los JSON fuente.
- Conserva compatibilidad con overrides creados por `730f093`/`46d3454`: adáptalos cuando la coincidencia sea inequívoca. Si un registro antiguo resulta ambiguo, consérvalo y reporta conflicto; no lo apliques a varios modelos ni lo descartes.
- Usa la misma identidad en `store.js`, `Catalog.jsx` e `importExport.js`.
- Editar nombre, modelo visible, categoría u otros campos no debe convertir un override en producto nuevo ni perder la posibilidad de “Revertir a base”.

## 2. Migración idempotente

- Fusiona `walkingpad_custom_products` con `walkingpad_local_products` sin duplicar registros cuando ambos contienen el mismo producto.
- Ante registros con la misma identidad y contenido distinto, conserva el dato existente y registra el conflicto de forma recuperable; no sobrescribas silenciosamente.
- Borra la clave antigua solo después de guardar y releer correctamente el resultado completo.
- Repetir la migración o importar dos veces el mismo respaldo debe producir el mismo estado.
- Conserva las variantes `_corrupted` y no elimines datos inválidos.

## 3. Pruebas obligatorias

Añade pruebas que cubran:

- renombrar y revertir únicamente `X21` entre los siete modelos `—`;
- editar por separado los dos productos con modelo `TRG1F`;
- recargar tras editar y mantener exactamente 42 productos base;
- migración con ambas claves y registros repetidos;
- conflicto de contenido, fallo de cuota y fallo al releer/verificar;
- exportar/importar un override renombrado dos veces sin duplicarlo;
- formulario conservado si falla el guardado.

Ejecuta en orden `npm test`, `npm run lint` y `npm run build`. Después realiza en navegador real: login local, búsqueda, alta, edición con cambio de nombre, recarga, reversión, exportación e importación repetida. Indica navegador, URL, resultados y cualquier paso que no pudiste comprobar. No describas pruebas de Testing Library como prueba de navegador.

## Criterio de cierre

La Orden 07 solo se cierra cuando las pruebas pasan, no hay advertencias, los 42 modelos permanecen íntegros y la comprobación real de navegador no muestra duplicación o pérdida de datos. Entrega el diff y los códigos de salida.

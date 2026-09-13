# Catálogo WalkingPad (React)

El plan rector del backend, con prioridades y criterios de salida, está en [docs/PLAN_PRODUCTO_BACKEND.md](docs/PLAN_PRODUCTO_BACKEND.md). La contraseña general y los perfiles individuales de Mi Reporte están acordados; la elección de hosting y proveedor de datos sigue pendiente.

La primera tarea de implementación para Antigravity está en [docs/ANTIGRAVITY_ORDEN_01.md](docs/ANTIGRAVITY_ORDEN_01.md). Codex revisará el diff y las pruebas antes de continuar al siguiente bloque.

Raíz canónica de desarrollo: `/Users/daniel/Documents/Desarollo/Web/WalkingWeb`. Esta es la aplicación React existente, consolidada aquí para evitar trabajo entre carpetas. La carpeta `/Users/daniel/Documents/Desarollo/Web/react-app` y el catálogo anterior siguen intactos como referencias; **no edites esas copias en paralelo**. Para Antigravity, usa únicamente esta raíz en adelante.

## Progreso del Backend (Orden 01)
- **Control de Versiones y CI**: Repositorio Git inicializado. `.gitignore` actualizado para excluir secretos y respaldos locales. Configuración de GitHub Actions para `npm ci`, `npm test`, `npm run lint` y `npm run build` añadida.
- **Dominio Puro**: Creado módulo `src/domain/dailyReport.js` con validaciones de conteo, cálculos de fecha en `America/La_Paz`, generación de ID y detección de conflictos de revisión. Pruebas unitarias completas.
- **Esquema SQL**: Migración inicial creada para `profiles` y `daily_reports` con RLS habilitado (pendiente de ejecución en base real).
- **Contratos de Repositorio**: Definida interfaz en `src/data/reportRepository.js` sin conectar a backend real aún.

## Datos

Los JSON originales de `WalkingPad Web/catalogo-walkingpad/data` se copiaron a `src/catalog-data/` (categorías, 42 productos, problemas generales, guía, base de errores y metadatos). Vite integra los datos que utiliza la aplicación en el build; no hay solicitudes de JSON en tiempo de ejecución. `meta.json` se conserva como referencia de procedencia. La copia anterior sigue operativa y no se sustituyó.

## Ejecutar y compilar

```bash
npm ci
npm run dev
npm test
npm run lint
npm run build
```

`npm run dev` sirve la app React convencional en Vite. `npm run build` produce `dist/index.html` con JavaScript y CSS integrados mediante `vite-plugin-singlefile`. El archivo se puede distribuir y abrir con doble clic mediante `file://`; no necesita servidor ni Internet para catálogo, guía o reportes. La consulta automática de precios de tiendas **no está implementada**: requeriría Internet. En productos nuevos, los enlaces y precios se introducen manualmente en el formulario; la consulta automática de precios no está implementada.

## Datos locales y traslado

La aplicación activa usa `walkingpad_custom_products`, `repSession_Daniel`, `repHistory_Daniel` y sus variantes `_corrupted`. El módulo anterior de seguimiento se retiró. No se borra su clave antigua de `localStorage`; un respaldo puede archivarla, pero la importación ya no la activa. El reporte usa `shiftId` para identificar turnos, incluso cuando dos turnos tienen iguales totales. Los borradores antiguos sin `shiftId` se adaptan al cargarse. La importación adapta registros históricos antiguos sin id con identificadores estables, para que importar dos veces no duplique registros.

Antes de cambiar de archivo o equipo, pulsa **Exportar respaldo** en la versión que contiene tus datos y conserva el JSON descargado. En la nueva versión pulsa **Importar respaldo**. La importación valida el formato, agrega entradas nuevas y muestra conflictos sin reemplazar silenciosamente entradas o borradores existentes. Si la clave local contiene JSON inválido, se conserva y se copia a `_corrupted` cuando es posible. Los orígenes `file://` no comparten necesariamente `localStorage`; el respaldo manual es la vía de traslado. Nunca asumas que los datos se transfirieron hasta comprobarlos en la nueva aplicación.

## Estado y validación

Implementados: 42 productos base, búsqueda por modelo/nombre/error/síntoma, detalles y códigos de error, problemas generales, guía, alta local, Mi Reporte, respaldo manual, recuperación de valores inválidos y pruebas de persistencia. En la consolidación inicial pasaron 14 pruebas, lint y build; el servidor Vite respondió por HTTP local. El navegador integrado bloqueó abrir `file://` por su política de seguridad. La revisión visual de `file://` en un navegador normal y un traslado con datos reales siguen pendientes en el equipo del usuario. Conserva el catálogo anterior hasta confirmar ambos pasos.

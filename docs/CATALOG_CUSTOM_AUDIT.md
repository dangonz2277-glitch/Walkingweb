# Auditoría del Catálogo Personalizado (Orden 18A)

## Estado Actual y Puntos de Partida
- **Estado de Git:** El working tree estaba completamente limpio antes del inicio de la auditoría. Después de la auditoría, existe únicamente este archivo (`docs/CATALOG_CUSTOM_AUDIT.md`) sin seguimiento.
- La gestión de productos "custom" e "overrides" se realiza actualmente en el lado del cliente (localStorage) usando la clave `walkingpad_local_products`.
- Almacenamiento local se combina con los 42 productos base en `src/data/store.js`.
- La autenticación utiliza una cookie `site_session` verificada por `proxy.js` que hace de middleware para Next.js.
- El login en `app/api/login/route.js` valida un rate limit en Supabase pero la validación de contraseña (`SITE_PASSWORD`) es estática.

## Decisiones Cerradas sobre la Base de Productos
Se han aprobado las siguientes directrices estrictas, sin excepciones:
- Los 42 productos base permanecen en sus archivos JSON estáticos.
- Son estrictamente **inmutables**: no se editan, no se revierten ni se eliminan.
- Los overrides locales antiguos *no* se importarán a Supabase. Se conservarán temporalmente en cliente únicamente para respaldo o migración controlada.
- **Solamente los productos realmente nuevos (custom) se podrán importar y almacenar en la base de datos.**

## Claves de LocalStorage Detectadas en el Código
El código interactúa de forma explícita con las siguientes claves de almacenamiento:
- `walkingpad_local_products` (clave principal actual del catálogo)
- `walkingpad_local_products_corrupted`
- `walkingpad_custom_products` (clave antigua "legacy")
- `walkingpad_custom_products_corrupted`
- `walkingpad_migration_conflicts`
- `walkingpad_migration_conflicts_corrupted`
- `repSession_Daniel` y `repSession_Daniel_corrupted` (relacionado con Mi Reporte)
- `repHistory_Daniel` y `repHistory_Daniel_corrupted` (relacionado con Mi Reporte)

## Archivos Afectados en Fases Posteriores
1. `src/data/store.js` (combinación de base y remoto)
2. `src/components/Catalog.jsx` (UI para listar, editar, eliminar y distinguir base/custom)
3. `src/data/storage.js` / `src/data/importExport.js` (eliminación de sincronización local de productos)
4. Nueva API Route (`app/api/products/...`)
5. Nueva migración en `supabase/migrations/` para la tabla `public.catalog_custom_products`.

## Modelo de Datos Aprobado
### Estructura del Producto y Atributos
- **Mapeo:** La tabla principal se llamará unívocamente `public.catalog_custom_products`.
- Campos principales: `cat`, `name`, `model`, `capacity`, `speed`, `motor`, `area`, `weight`, `folded`, `control`, `assembly`, `notes`.

### Contrato de Enlaces (Links)
Un arreglo de objetos JSON con la estructura:
```json
{
  "label": "Tienda",
  "url": "https://...",
  "price": "$0"
}
```

### Contrato de Errores (Issues)
Campo `issues` de tipo `jsonb` almacenando un arreglo de objetos:
```json
{
  "code": "E01",
  "name": "Síntoma o descripción",
  "fix": "Diagnóstico y solución",
  "parts": "Repuestos"
}
```
*Reglas:* Un producto puede tener cero o más errores. `code` y `name` son estrictamente obligatorios; `fix` y `parts` son opcionales.

## Política de Acceso y RLS (Seguridad)
El esquema de acceso a la tabla `public.catalog_custom_products` está totalmente cerrado por diseño:
- Se habilitará RLS (Row Level Security).
- Los roles `PUBLIC`, `anon`, y `authenticated` **no tendrán acceso directo**.
- Todas las lecturas y escrituras transitarán de forma exclusiva mediante rutas de servidor protegidas en Next.js.

## Contrato Aprobado para la API (Rutas Protegidas)
La API Route de productos implementará el siguiente comportamiento estricto:
- **GET:** Recuperación autorizada del catálogo remoto.
- **POST:** Operación **idempotente** protegida mediante un `request_id` (para evitar inserciones duplicadas).
- **PATCH:** Edición de productos requiriendo validación optimista enviando un `expectedRevision`. Si la versión no coincide, retorna error `409 Conflict`.
- **DELETE:** Implementado exclusivamente como borrado **lógico**, exigiendo el envío de un `expectedRevision`, una validación de contraseña general, y obligando a que su verificación emplee comparaciones en tiempo constante (ej. `crypto.timingSafeEqual`).
- **Rate Limit de Borrado:** El límite de intentos para la acción DELETE estará segregado del rate limit general de login para impedir que ataques a las eliminaciones bloqueen el acceso global al sistema.

## Pruebas Existentes que Habrá que Adaptar
- `src/tests/App.test.jsx`: Tiene tests que verifican comportamiento local de overrides e interacciones dependientes de la sincronicidad actual del localStorage.
- `src/tests/importExport.test.js`: Verifica el backup/importación y migraciones antiguas.
- Todo esto debe adaptarse al nuevo modelo 100% remoto de adición de productos custom, sin overrides.

## Diagnóstico de `npm run test:gateway`
**Ejecución Inicial (dentro del Sandbox estricto):**
Falló en la fase inicial de setup.
- Error reportado: `❌ ERROR: El servidor no respondió a tiempo en http://127.0.0.1:3105/login`
- Aserción afectada: La función `waitServerReady` agotó su tiempo de espera de 10 segundos antes de comenzar la primera prueba real.

**Ejecución Repetida (Bypass de Sandbox habilitado):**
Pasó completamente y sin errores.
- Salida saneada de la segunda ejecución:
```text
> react-app@0.0.0 test:gateway
> node tests/gateway_test.js
Iniciando servidor Next.js de prueba en puerto 3105...
Servidor listo. Ejecutando pruebas...
✅ Acceso anónimo redirige a /login
✅ Ruta profunda anónima redirigida a login.
✅ Cookie falsa rechazada (307).
✅ Cookie firmada válidamente pero expirada rechazada (307).
✅ Chunk de la app es público sin sesión
✅ Los chunks JS no exponen identificadores concretos del catálogo (WP510B4, WP500B4, WP400B52).
Probando límites de intentos concurrentes (Rate limit 5/3s)...
✅ Rate limit debe permitir 5 y bloquear 1 concurrente. Encontrados: permitidos=5, bloqueados=1
✅ La contraseña correcta debe ser rechazada (429) con límite agotado. Fue 429
✅ Login en nueva IP debe reiniciar el límite. Fue 303
Esperando expiración de ventana (3.1s)...
✅ Recuperación de la ventana fallida para IP 1. Fue 303
✅ Debe rechazar solicitudes sin request.ip o x-real-ip (spoofing débil) devolviendo 500. Fue 500
✅ RPC check_rate_limit no debe ser accesible anónimamente. Estado: 401
✅ Acceso autorizado correcto
✅ El catálogo debe renderizar 42 modelos. Encontrados: 42
✅ El span contabilizador final marca 42 productos.
✅ Logout borra la cookie del navegador.
✅ Comprobación de sesión sin estado: copia de cookie no se anula (requiere rotación de secreto).
Levantando servidor alternativo sin secreto en puerto 3106...
✅ Servidor sin SITE_SESSION_SECRET rechaza en 500 (fue 500).
Limpiando procesos...
✅ Tests de pasarela completados con éxito.
```

**Evidencia de Causa Demostrada:**
El puerto 3105 no estaba ocupado ni el servidor Node quedó colgado; el problema original radicó en el Sandbox del entorno de ejecución virtual que bloqueaba de forma silenciosa la resolución/conexión de la interfaz `127.0.0.1` de red dentro de la prueba (`Operation not permitted` arrojado por fetch interno). La función capturaba en un catch vacío este error y seguía reintentando hasta el timeout. Al relanzar el entorno fuera del sandbox restrictivo, la misma prueba exacta (sin modificar el timeout ni el código) demostró que todo el middleware de proxy responde sin problemas y pasa limpiamente la auditoría de seguridad y concurrencia.

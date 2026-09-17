# Checklist de Preparación para Vercel Preview (Orden 13A y 13B)

## Auditoría de Entorno y Secretos
- ✅ `package.json`, `.github/workflows/ci.yml` y scripts revisados. Ninguno imprime variables ni lee de forma insegura `.env.local`.
- ✅ `.env.example` contiene *exclusivamente* nombres de las variables requeridas y valores claramente ficticios (documentación segura).
- ✅ `.gitignore` excluye `.env.local` y toda configuración privada (`*.local`).
- ✅ Artefactos de `.next` (incluyendo cliente y servidor) inspeccionados binariamente. Ningún valor real de `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, contraseñas globales ni `SITE_SESSION_SECRET` está embebido/inlined en el código compilado.
- ✅ Los datos de Trackings (`walkingpad_trackings`) se encuentran ausentes en el código activo y en los artefactos de ejecución. Las pruebas pueden conservar referencias históricas para verificar que los respaldos antiguos se sigan ignorando correctamente.

## Confirmación de Destino (Localhost)
- Se confirmó activamente (vía `npx supabase status`) que el entorno local usa la API en `http://127.0.0.1:54321` y Postgres en `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
- Se revisaron las variables del sistema y de shell asegurando que `SUPABASE_URL` o `PG_CONN_STRING` no forzaran peticiones remotas.
- Las pruebas mutables (`test:concurrency`, `test:api`, `test:gateway`) extrajeron y apuntaron con certeza únicamente a las credenciales efímeras locales, garantizando protección de la instancia real de Supabase.

## Ejecución Integrada Local

### Comandos Ejecutados
```bash
npx supabase db reset --local
npx supabase test db
npm run test:concurrency
npm run test:api
npm run test:gateway
npm test
npm run lint
npm run build
```

### Resultados Saneados
- **Reset DB**: Migraciones iniciales y de rate limit aplicadas exitosamente al contenedor local.
- **Base de Datos (pgTAP)**: 48 pruebas exitosas en `rate_limit_test.sql`, `20260912_rls_policies_test.sql` y `20260912_order03_atomic_save_test.sql`.
- **Concurrencia (`test:concurrency`)**: 5 simulaciones completas aprobadas. Validación de `expected_revision` confirmada.
- **API (`test:api`)**: 8 validaciones de aislamiento y roles administrados superadas. Registro público correctamente bloqueado (local).
- **Gateway (`test:gateway`)**: 14 validaciones de rate limit y protección de sesión sin estado completadas satisfactoriamente (incluyendo bloqueos HTTP 429).
- **Cliente (`npm test`)**: 13 suites, 98 pruebas pasadas. Condición de carrera superada exitosamente.
- **Lint (`npm run lint`)**: Aprobado sin advertencias activas.
- **Compilación (`npm run build`)**: Generación estática y dinámica de Next.js lista (~250ms).

## Requisitos de Variables por Entorno

### Entornos de Navegador (Cliente)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

### Entornos de Servidor (SSR, Pruebas y Scripts)
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` (Secreto estricto)
- `SUPABASE_JWKS_URL`
- `SITE_PASSWORD` (Secreto estricto)
- `SITE_SESSION_SECRET` (Secreto estricto, min. 32 chars)

### GitHub Actions (CI)
El workflow de GitHub Actions fue revisado y los controles equivalentes pasaron exitosamente a nivel local (empleando valores mock). La ejecución real del CI en GitHub sigue pendiente hasta que se realice el primer push al repositorio.

### Vercel Preview y Producción
Requieren la definición de todas las variables mencionadas arriba en sus respectivas configuraciones de entorno.
**Nota Importante sobre Bases de Datos**: Actualmente existe un único proyecto Supabase alojado (WalkingWeb). Si el entorno de Preview usa estas mismas variables, Preview y Producción compartirán usuarios y reportes. Crear otro proyecto Supabase completamente aislado es opcional pero todavía no está implementado. Esta decisión arquitectónica debe tomarse **antes** de probar operaciones de escritura desde Vercel Preview.

## Migraciones Remotas Ya Aplicadas
Las siguientes migraciones ya fueron empujadas previamente al proyecto real alojado durante órdenes anteriores:
1. `20260912_initial_schema.sql`
2. `20260912220000_atomic_save.sql`
3. `20260913150000_rate_limit.sql`

## Riesgos y Validaciones Pendientes
- **Ausencia de SMTP Real**: La autenticación sigue flujos puramente administrados sin soporte de correos mágicos, lo que nos desconecta de dependencias de terceros y SMTP.
- **Gestión Administrativa Directa**: La reactivación de perfiles elimina administrativamente el ban en Auth y cambia directamente `profiles.status` a `active`. El restablecimiento de cuenta asigna directamente una nueva contraseña (que se introduce de forma oculta). No se generan ni se entregan enlaces de recuperación, tokens, ni correos.
- **Bordes de Middleware Edge**: La firma nativa de cookies está comprobada en Node; de surgir diferencias criptográficas en Vercel Edge Runtime, se revisará durante la evaluación en Preview.

**El repositorio está documentado, preparado localmente para el primer push y listo para su correspondiente validación de CI.**

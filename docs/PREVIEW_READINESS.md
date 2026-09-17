# Checklist de Preparación para Vercel Preview

## Auditoría de Entorno y Secretos
- ✅ `package.json` y `.github/workflows/ci.yml` revisados. No exponen variables de entorno críticas en `console.log` o comandos no seguros.
- ✅ `.env.example` contiene solo nombres de variables de entorno y datos dummy (documentación clara sin riesgo de filtración).
- ✅ `.gitignore` protege el archivo `.env.local` y otras configuraciones locales (`*.local`).
- ✅ Archivos compilados en `.next/static/` (bundles del cliente) verificados. No contienen la cadena `SUPABASE_SECRET_KEY` ni contraseñas.
- ✅ Datos eliminados de `Trackings` (`walkingpad_trackings`) no están presentes en los artefactos de compilación ni en la base de datos (migraciones locales).

## Pruebas Integradas Ejecutadas
Se ha simulado un reinicio puro de la base de datos local y la ejecución en cadena de toda la batería de pruebas en estricto modo local.

### Comandos
```bash
npx supabase status
npx supabase db reset --local
npx supabase test db
npm run test:concurrency
npm run test:api
npm run test:gateway
npm test
npm run lint
npm run build
```

### Resultados
- **Base de Datos (pgTAP)**: `All tests successful (Files=3, Tests=48)` - Políticas RLS, Atomic Save y Rate Limiting funcionando.
- **Concurrencia (`test:concurrency`)**: Todas las iteraciones pasadas. Control de bloqueo optimista (`expected_revision`) funcionando como se espera (sin sobreescrituras perdidas).
- **API (`test:api`)**: Gestión Auth confirmada. Registro público bloqueado y administración de perfiles aislada y segura.
- **Gateway (`test:gateway`)**: Reglas de middleware verificadas. Protección por cookies `SITE_SESSION_SECRET` y manejo del `Rate Limit` en memoria correctos. Fallbacks y falsificaciones rechazadas (429/500/307).
- **Cliente (`npm test`)**: 13 suites, 98 pruebas exitosas. Cero falsos positivos. Estabilidad contra carreras asegurada.
- **Linting (`npm run lint`)**: Sin advertencias (limpio).
- **Compilación (`npm run build`)**: Generación de páginas estáticas y SSR sin errores (optimización en ~250ms).

## Variables Requeridas por Entorno

### Local / Desarrollo (CLI Supabase Local)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_JWKS_URL`
- `SITE_PASSWORD`
- `SITE_SESSION_SECRET`

### GitHub Actions (CI)
Solo requiere mock values inyectados en su `.yml` nativo para pasar los tests unitarios. Todo está aprovisionado.

### Vercel Preview (Entorno efímero)
Debe poseer configuradas en Vercel las siguientes variables conectadas al proyecto Supabase de Staging/Preview:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_JWKS_URL`
- `SITE_PASSWORD`
- `SITE_SESSION_SECRET` (Mínimo 32 caracteres)

### Producción (Main / Supabase Prod)
Al igual que Preview, pero enlazadas al Supabase Definitivo y rotando la contraseña general.

## Migraciones Remotas
Las siguientes migraciones y comandos han sido probados y validados previamente en el entorno real de Supabase Staging, encontrándose listos para acompañar al frontend:
1. `20260912_initial_schema.sql`
2. `20260912220000_atomic_save.sql`
3. `20260913150000_rate_limit.sql`
- Configuración de Auth (Registro anónimo desactivado remotamente en Supabase).

## Riesgos y Validaciones Pendientes
- **Verificación de Enlaces Mágicos/Emails**: Auth por correo está operando sin servidores SMTP externos (solo testing). Se debe evaluar si el cliente real necesitará envío de correos, o si todo operará vía CLI administrativo (Actual: exclusivo administrativo).
- **Rendimiento Edge vs Node**: Middleware usa cookies firmadas nativamente. Si en Vercel Edge surge algún inconveniente, se validará a nivel de Preview log. (Testeado localmente en ambiente Node sin problemas).
- **Rotación de Secretos**: `SITE_SESSION_SECRET` debe ser gestionado estrictamente fuera de git. 

**Todo validado de extremo a extremo de forma local.**

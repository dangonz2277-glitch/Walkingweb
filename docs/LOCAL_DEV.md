# Vista local de WalkingWeb

La raíz de trabajo es `/Users/daniel/Documents/Desarollo/Web/WalkingWeb`. La app actual usa Next.js y el stack local existente de Supabase (`supabase/config.toml`); no necesita otro `docker-compose.yml`. Docker Desktop debe estar iniciado.

1. Ejecuta `npx supabase status`. Si el stack está detenido, ejecuta `npx supabase start`. No uses `supabase db reset` para previsualizar: elimina los datos locales de PostgreSQL.
2. Crea `.env.local` a partir de `.env.example` solo si aún no existe. Necesita `SITE_PASSWORD`, `SITE_SESSION_SECRET`, `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` del Supabase local. El archivo está excluido por Git; nunca lo subas. En esta máquina ya se creó con permisos `0600` y contraseña de desarrollo `walkingpad-dev-local`.
3. Para el servidor Next local, `.env.local` contiene `TRUST_FORWARDED_IP=1`. Esta opción **solo es apropiada en localhost**, donde se controla quién llega al servidor. No copiarla a Vercel ni confiar en cabeceras aportadas por visitantes. `IS_LOCAL_TEST=1` se reserva a la suite automática y no sirve para login normal del navegador.
4. Ejecuta `npm run dev` y abre `http://localhost:3000`. Si el servidor ya estaba abierto al crear o cambiar `.env.local`, reinícialo para cargar las variables nuevas. Inicia sesión con la contraseña local de desarrollo. El catálogo debe mostrar 42 modelos.

Para una comprobación automática: `npm test`, `npm run lint`, `npm run build`, `npx supabase test db` y `npm run test:gateway`. La suite HTTP usa puertos temporales 3105 y 3106. `next start` en HTTP no es una vista de navegador equivalente al desarrollo: en modo producción la cookie se marca `Secure` y debe probarse sobre HTTPS.

La versión actual de Mi Reporte aún usa almacenamiento local y no está conectada a perfiles de Supabase. Los productos agregados o editados también se guardan localmente en el navegador; exporta respaldo antes de cambiar de equipo o borrar datos del navegador.

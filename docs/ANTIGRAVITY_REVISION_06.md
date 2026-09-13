# Revisión de Orden 06 — puerta general bloqueante

Auditoría de Codex el 13-09-2026 sobre `d7f4693`. `npm test` (26), lint y `npm run build` pasan, pero **la puerta no es segura ni está terminada**. No hacer push ni desplegar.

## Hallazgos críticos

1. `proxy.js` solo comprueba que exista `site_session`; no verifica valor, firma ni expiración. Con el Next compilado en localhost:3100, `GET /` sin cookie devolvió `307 /login`, pero `GET /` con `Cookie: site_session=anything` devolvió **200**. Una persona puede entrar sin contraseña. Implementar cookie firmada y verificarla del lado servidor en cada petición, incluyendo caducidad y rotación de secreto.
2. `app/api/login/route.js` usa `process.env.SITE_PASSWORD || 'local-test-password'`. Si falta la variable, existe una contraseña conocida. La comparación usa `===`, contra el requisito de tiempo constante. Quitar el fallback; fallar cerrado si falta `SITE_PASSWORD` o `SITE_SESSION_SECRET`; comparar digests de longitud fija con una operación de tiempo constante. Nunca guardar la contraseña o la clave en el bundle cliente. Añadir `.env.example` solo con nombres/valores de muestra inequívocamente no operativos.
3. La cookie actual vale literalmente `authenticated`, sin prueba de integridad, y dura un día; falta endpoint de logout. Debe ser `HttpOnly`, `SameSite`, `Path=/`, `Secure` cuando la solicitud use HTTPS y con expiración verificada en servidor (20 días acordados como máximo inicial). Un flag basado solo en `NODE_ENV` puede impedir pruebas HTTP locales con `next start` y no representa necesariamente el esquema de la solicitud detrás de un proxy; probar local y HTTPS/preview.

## Rutas, datos y pruebas

4. `matcher: '/((?!login|api/login).*)'` excluye cualquier ruta que empiece por esos prefijos, no solo las dos rutas exactas. Reducir excepciones a rutas exactas necesarias y documentar callbacks Supabase que realmente existan. Proteger APIs propias. Añadir pruebas de rutas profundas, variantes de prefijo, rutas de datos/RSC y redirección abierta.
5. El proxy intercepta `/_next/static`, incluido el JS/CSS del login. `GET /_next/static/chunks/2xzel5e_dtzs7.js` anónimo devolvió `307 /login`. La página de login debe funcionar sin bucles ni recursos bloqueados. A la vez, ese chunk contiene `WP510B4`/`X218` del catálogo. Si se exceptúa `_next/static`, los datos quedan públicamente descargables. Mover los datos internos a un camino server-side protegido y evitar que los JSON/guía/errores entren en chunks públicos; después exceptuar solo los assets públicos necesarios.
6. No hay pruebas nuevas del proxy ni del login. Añadir pruebas HTTP con `next start` para anónimo, cookie inventada/alterada/caducada, login correcto/incorrecto, logout, rutas profundas, asset público y URL directa a los datos. Probar que el login funciona con teclado y que Supabase Auth no se rompe. Un `next build` exitoso no valida estas condiciones.
7. El plan declara la Orden 06 «finalizada/validada»; corregirlo hasta que las pruebas demuestren paridad y seguridad. El sitio sigue mostrando texto de uso «sin servidor», y los módulos aún no tienen la integración final de Mi Reporte. Mantener la copia Vite anterior/legado como referencia y no afirmar paridad completa.

## Evidencia

- `npm test`: 26/26; lint: salida limpia; `npm run build`: pasa con advertencia experimental de `localStorage` durante prerender.
- Servidor Next compilado con contraseña temporal solo para la auditoría: `/` anónimo `307`, `/` con cookie arbitraria `200`, `/login` anónimo `200`, chunk estático anónimo `307`.
- `rg` encontró identificadores de modelos en `.next/static/chunks/2xzel5e_dtzs7.js`.
- No hay `.env.example`, ni endpoint de logout, ni pruebas del gateway.

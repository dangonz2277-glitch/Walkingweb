# Segunda revisión de Orden 06 — 13 de septiembre de 2026

Codex revisó el commit `0d4b1e2` y el servidor del usuario en `localhost:3000`. `npm test` pasó 26/26, lint y `next build` pasaron. El build aún emite advertencia experimental sobre `localStorage` durante prerender. No hubo push ni despliegue.

## Resultado del gateway

1. El servidor de `3000` devuelve `500` para `/` con o sin cookie, y `200` para `/login`: parece no tener `SITE_SESSION_SECRET` configurado. Esto es cierre seguro, pero no demuestra la experiencia autenticada en ese proceso. No colocar secretos reales en la conversación ni en Git; usar variables locales privadas para probar.
2. Con secretos temporales en un servidor compilado aparte, `/` sin sesión redirigió, `POST /api/login` correcto devolvió `303` con cookie, y la cookie permitió `200` en `/`. Un JS de `/_next/static` fue público (`200`). Un barrido de chunks no encontró `WP510B4` ni `X218`; el refactor redujo la exposición observada. Hay que mantener prueba automática de que los JSON no aparecen en assets públicos, no solo comprobar que `/data/products.json` redirige.
3. `npm run test:gateway` **falla** en la aserción de cookie falsa. `verifySession('inventado.1234', secret)` lanza `InvalidCharacterError` en `atob` y el servidor devuelve **500** en vez de `307 /login`. Capturar errores de parseo/base64/JSON/firma, limitar longitud y estructura de cookie, devolver `null` sin provocar 500. Probar valores vacíos, sin punto, bytes inválidos, JSON inválido, firma alterada, expirado y payload de tamaño excesivo. El proxy debe responder con un rechazo uniforme.
4. Al hacer login por `127.0.0.1:3106`, el `Location` fue `http://localhost:3106/`. La cookie host-only funcionó en `127.0.0.1` (`200`) pero no en `localhost` (`307`). Construir redirecciones con el origen efectivo de la petición y probar ambos hosts sin cambiar de host durante el flujo. No aceptar `Host` no confiable para crear redirecciones abiertas.
5. El test de logout solo comprueba que la respuesta borra la cookie del navegador; una copia previa de la cookie firmada sigue válida hasta su expiración. No describirlo como revocación de sesión del lado servidor. Si el requisito es invalidar inmediatamente, hace falta estado de revocación/versión de sesión o rotar `SITE_SESSION_SECRET`; en un esquema sin estado, documentar la limitación. La rotación de `SITE_PASSWORD` sola tampoco invalida cookies existentes porque la firma usa otro secreto.
6. La suite HTTP deja de correr al primer fallo y no verifica que la página de login cargue sus JS/CSS o que el catálogo muestre 42 productos tras autenticar. Añadir peticiones reales a assets descubiertos en el HTML y una prueba funcional de la página. La prueba de secreto faltante y de rotación también deben automatizarse. Definir mitigación de intentos repetidos para la contraseña general antes de publicar.

## Estado

Orden 06 **en progreso**. La firma y expiración son una mejora real, pero el error 500 con cookie malformada, la redirección entre hosts y la cobertura insuficiente impiden cerrarla. Mantener `SITE_PASSWORD` y `SITE_SESSION_SECRET` solo en entorno local/hosting; no hacer push ni desplegar.

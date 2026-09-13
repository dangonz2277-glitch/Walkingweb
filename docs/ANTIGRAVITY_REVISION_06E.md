# Revisión de `8f7fda1`: gateway y límite de intentos

Estado: gateway local funcional; **rate limit no aprobado para publicación**. No se hizo push ni despliegue.

Con un build nuevo pasaron `npm test` (26/26), `npm run lint` (código 0), `npm run build` y `npm run test:gateway` (código 0). La suite ahora prueba una cookie firmada pero expirada, cuenta exactamente 42 modelos y describe correctamente la limitación del logout sin estado.

El límite de intentos añadido a `app/api/login/route.js` usa `request.headers.get('x-forwarded-for')` como clave literal y un `Map` del proceso. En un servidor de producción temporal, seis contraseñas erróneas con el mismo `x-forwarded-for` dieron 429 a partir de la sexta; cambiar solo esa cabecera permitió nuevos intentos. Una solicitud de prueba puede modificar la cabecera en este entorno. En un despliegue con varias instancias, el `Map` tampoco comparte contadores ni sobrevive reinicios. El test de gateway no prueba el 429 ni este bypass. No presentarlo como mitigación efectiva.

Además, el comentario afirma que se cuentan fallos, pero `rateLimit()` incrementa antes de verificar la contraseña. El límite también bloquea al usuario que conoce la contraseña correcta después de cinco intentos de terceros bajo la misma clave. La limpieza del `Map` solo corre si hay más de 1000 entradas y mantiene entradas nuevas indefinidamente por debajo de ese umbral.

Para cerrar la protección: definir una fuente de identidad de cliente confiable para el entorno desplegado, usar un contador compartido con operación atómica y expiración, evitar que una cabecera aportada por el cliente permita cambiar de identidad, y probar simultaneidad, cambio de cabecera, bloqueo y recuperación tras la ventana. Si la infraestructura no permite identificar clientes de forma confiable, usar un control compartido de intentos por sitio con un mecanismo para evitar bloqueo permanente; documentar el riesgo de denegación de servicio. Mantener la contraseña fuerte y no publicar hasta verificar el control en preview HTTPS.

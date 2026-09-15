# Orden 08 — Mi Reporte por perfil

Trabaja únicamente en `/Users/daniel/Documents/Desarollo/Web/WalkingWeb`, partiendo de `9dcfd49`. No hagas push ni despliegue. No modifiques el catálogo, el gateway general ni el rate limit salvo que un fallo reproducible impida esta integración.

## Resultado de producto

Al abrir **Mi Reporte** desde el catálogo debe aparecer un popup accesible. Si no existe sesión personal de Supabase, el popup solicita usuario y contraseña. Tras autenticar, muestra exclusivamente:

- nombre del perfil activo;
- fecha laboral actual en `America/La_Paz`;
- número entero de tickets resueltos, entre 0 y 9999;
- estado de guardado y un historial propio sencillo;
- botón para cerrar la sesión personal sin cerrar la sesión general del sitio.

Retira de la interfaz activa los campos `calls`, `emails`, `chats`, nota y “Finalizar turno”. No conviertas esos valores antiguos automáticamente a tickets resueltos: no son equivalentes. Conserva `repSession_Daniel`, `repHistory_Daniel` y sus `_corrupted` en respaldo como archivo histórico hasta diseñar una importación con propietario y fecha explícitos.

## Autenticación individual

1. Usa Supabase Auth con registro público deshabilitado. Las cuentas las crea el procedimiento administrativo existente.
2. La interfaz debe aceptar un **usuario simple** y contraseña de mínimo ocho caracteres. Define una representación interna determinista y documentada para Auth (por ejemplo, email sintético reservado) o agrega un identificador único al perfil mediante migración. No expongas correos ni permitas enumerar cuentas.
3. Mueve `@supabase/supabase-js` a `dependencies` si el runtime de la app lo importa. El navegador solo puede recibir `NEXT_PUBLIC_SUPABASE_URL` y una clave publicable/anon. `SUPABASE_SERVICE_ROLE_KEY` nunca llega al cliente ni se usa como sesión del empleado.
4. Una cuenta desactivada debe recibir un mensaje genérico y no leer ni guardar reportes. El cierre de sesión personal conserva acceso al catálogo.

## Persistencia separada de la UI

Implementa el contrato existente de `src/data/reportRepository.js` con un cliente autenticado:

- `getTodayReport(workDate)`;
- `setResolvedCount(workDate, resolvedCount, expectedRevision)` mediante `set_daily_report`;
- `listMyReports()`;
- reintento explícito y manejo de conflictos.

La UI no conoce SQL ni la clave de servicio. Estados mínimos: `loading`, `saving`, `saved`, `error`, `conflict`. Un conflicto de `revision` debe releer el valor remoto y pedir una acción clara; nunca sobrescribir silenciosamente. Un reintento del mismo valor no debe sumar tickets ni crear otra fila. No implementes “+1” como lectura seguida de escritura insegura.

## Popup y accesibilidad

- Mi Reporte se abre como diálogo modal, devuelve el foco al botón al cerrar y permite cerrar con Escape.
- Mantén el catálogo visible detrás sin desmontar innecesariamente su estado.
- Durante guardado deshabilita acciones duplicadas y presenta errores sin perder el valor escrito.
- Guía también debe quedar encaminada como popup según la decisión de diseño, pero no rediseñes su contenido en esta orden.

## Pruebas obligatorias

- login correcto e incorrecto; cuenta desactivada; logout personal;
- dos perfiles con la misma fecha y el mismo total sin interferencia;
- 0, 9999, negativos, fracciones y valores fuera de rango;
- creación, actualización con `revision`, dos pestañas en conflicto y resolución explícita;
- error de red/guardado, respuesta perdida y reintento sin duplicación;
- cambio de fecha alrededor de medianoche en `America/La_Paz`;
- popup con teclado, Escape, foco restaurado y catálogo aún disponible;
- ninguna clave de servicio en chunks o variables `NEXT_PUBLIC_*`.

Ejecuta `npx supabase test db`, `npm run test:api`, `npm run test:concurrency`, `npm test`, `npm run lint`, `npm run build` y la suite HTTP relevante. Verifica el flujo completo con dos perfiles sintéticos en navegador real. Limpia solo las cuentas sintéticas creadas por la prueba. Entrega diff, códigos de salida y cualquier limitación reproducible.

## Criterio de cierre

La orden se cierra cuando dos perfiles administrados pueden iniciar sesión por separado, ver y guardar únicamente su conteo diario, los conflictos no pierden datos, y cerrar Mi Reporte o su sesión no afecta al catálogo ni a la sesión general.

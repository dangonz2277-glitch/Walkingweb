# Revisión 08C de la entrega 08B

Estado: **Orden 08 abierta**. `npm test` (58/58), `npm run lint` (cero advertencias), `npm run build` y `npm run test:api` pasan en la verificación de Codex. La prueba API creó y eliminó sus cuentas sintéticas. `git diff --check` falla por 15 líneas con espacios finales.

## Correcciones puntuales

1. Eliminar `test-check.js`: quedó como script de diagnóstico con cliente de servicio, consulta y salida de reportes, y usa `dotenv` sin declarar dependencia. No versionarlo.
2. Arreglar los 15 espacios finales que detecta `git diff --check`; exigir ese comando junto con lint.
3. La prueba `bundle.test.js` debe **fallar** si no existe un build o no encuentra chunks JS; hoy pasa silenciosamente. Debe verificar tanto el identificador como el valor real de `SUPABASE_SERVICE_ROLE_KEY` si está definido, sin imprimir el secreto. Ejecutarla después del build mediante un comando reproducible o separar una prueba de build. La descripción actual de Antigravity dice que comprueba el valor, pero el código solo comprueba el nombre.
4. En la prueba API, verificar el `error` de ambos `signInWithPassword` nuevos y la respuesta `data` antes de leer `.success`. Corregir la interpolación de `aliceReportErr.message`/`bobReportErr.message` cuando el error es nulo y falla la RPC lógicamente. Comprobar también con los clientes de Alice y Bob que cada uno ve solo su propia fila; una lectura con service role de dos filas no prueba RLS entre perfiles. Mantener la limpieza en `finally`.
5. La prueba UI llamada “error in history/profile” solo comprueba `Read error` de `getTodayReport`; no comprueba el error de historial ni perfil. La implementación ignora `listMyReports` fallido y `signOut` fallido. Mostrar esos errores sin fingir historial vacío ni logout exitoso y añadir aserciones que verifiquen el mensaje visible y la sesión conservada.
6. La prueba de doble submit solo observa que el botón está deshabilitado; comprobar `signInWithPassword` invocado exactamente una vez y el camino de login **exitoso**. Mantener la prueba anterior de perfil desactivado, que esta entrega reemplazó.
7. Añadir la prueba de respuesta perdida **después de una escritura confirmada** y reintento con la misma revisión: debe producir conflicto, releer la fila y no duplicar el total. La prueba de conflicto actual solo devuelve un mock constante y su título sobre “retry without duplication” no realiza un reintento.
8. La preservación de borrador con el diálogo oculto funciona al cerrar/abrir, pero `ReportContent` queda montado y consulta la sesión de Supabase aun cuando Mi Reporte no se abrió. Verificar que no cause una solicitud/estado personal innecesario al entrar al catálogo, y que el borrador no quede asociado al siguiente usuario después de logout/cambio de perfil. Ajustar la estructura si corresponde y probar con dos sesiones.

No cambiar SQL, RLS, gateway ni catálogo. Ejecutar `npm test`, `npm run lint`, `npm run build`, prueba efectiva de bundle, `git diff --check`, pgTAP, concurrencia, gateway y API. Reportar salidas exactas. No hacer push ni despliegue.

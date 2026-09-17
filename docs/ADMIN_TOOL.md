# Herramienta de Administración Local

La herramienta de administración local (`scripts/admin_tool.js`) permite gestionar de forma segura los perfiles y cuentas de usuario en el entorno remoto (ej. Staging o Producción) directamente desde la terminal, sin necesidad de construir una interfaz gráfica de administración en el frontend.

## Requisitos de Seguridad Integrados
- **Ejecución Autorizada:** La herramienta aborta inmediatamente a menos que se ejecute con la bandera de mutación explícita (`ALLOW_STAGING_MUTATION=1`).
- **Verificación de Hostname:** Analiza la URL del entorno cargada y se niega a operar contra entornos de desarrollo locales (`localhost`), requiriendo que coincida exactamente con el dominio remoto oficial.
- **Sin Fugas de Secretos:** La `SUPABASE_SECRET_KEY` nunca abandona el servidor y la herramienta no imprime los UUIDs completos, *tokens* o contraseñas en pantalla.
- **Entrada Oculta:** Las contraseñas (nuevas cuentas o reseteos) son solicitadas interactivamente enmascarando los caracteres (o silenciando la salida de terminal), previniendo que queden atrapadas en el historial de bash o en logs.

## Procedimiento de Operación

1. **Preparación del Entorno**
   Asegúrate de tener un archivo `.env.local` configurado con las URLs correctas y la clave secreta de servidor (SUPABASE_SECRET_KEY). No inicies la sesión con credenciales incrustadas.

2. **Ejecución de la Herramienta**
   Abre una terminal en la raíz del proyecto y ejecuta la herramienta inyectando la bandera de autorización y el entorno:
   ```bash
   ALLOW_STAGING_MUTATION=1 node --env-file=.env.local scripts/admin_tool.js
   ```

3. **Menú Interactivo**
   Una vez en ejecución, la herramienta te mostrará un menú:
   - **(1) Listar perfiles:** Muestra los nombres de pantalla y el estado (activo/inactivo) truncando los UUIDs.
   - **(2) Crear cuenta:** Solicitará el nombre de usuario base (que automáticamente se normalizará al dominio `@walkingweb.internal`), el nombre a mostrar, y te pedirá de forma silenciada la contraseña (mínimo 8 caracteres). Pedirá confirmación (y/N) antes de impactar la base de datos remota mediante el flujo consistente (`authAdmin.js`).
   - **(3) Desactivar usuario:** Solicitará el UUID exacto para bloquear temporalmente a un usuario. Esto impone un ban remoto de 100 años a nivel Auth y actualiza el perfil a estado 'disabled' (provocando bloqueo vía RLS).
   - **(4) Reactivar usuario:** Levanta las restricciones antes mencionadas usando el UUID.
   - **(5) Restablecer contraseña:** Pide el UUID y de forma silenciada la nueva contraseña. Solo impacta Auth sin tocar el perfil.
   - **(0) Salir:** Abandona la herramienta y termina el proceso.

**Importante:** Nunca ejecutes esta herramienta con argumentos incrustados en la línea de comandos ni expongas las claves privadas del servidor.

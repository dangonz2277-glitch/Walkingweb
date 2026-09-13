# Supabase Local Development

Para probar la base de datos localmente, necesitas tener Docker instalado y funcionando, y la CLI de Supabase instalada.

## Requisitos
- Docker (o entorno compatible con Docker Desktop)
- [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started)

## Comandos

1. **Inicializar configuración (solo la primera vez o si falta config.toml):**
   ```bash
   npx supabase init
   ```

2. **Iniciar el stack local:**
   ```bash
   npx supabase start
   ```
   *Nota: Esto descargará las imágenes de Docker necesarias y levantará Postgres, Auth, Storage, etc.*

3. **Aplicar migraciones y reiniciar (si es necesario):**
   ```bash
   npx supabase db reset --local
   ```
   *Advertencia: `db reset` destruye todos los datos de la base de datos local y vuelve a aplicar las migraciones y seeds.*

4. **Ejecutar pruebas SQL (pgTAP):**
   ```bash
   npx supabase test db
   ```
   *Esto ejecuta todos los archivos `.sql` dentro de `supabase/tests/database/` usando pgTAP en una transacción temporal, mostrando el número de pruebas y fallos.*

## Estado Actual
Las migraciones iniciales configuran `profiles` y `daily_reports` con políticas RLS robustas:
- Se revocaron los privilegios por defecto.
- No hay permisos `DELETE`, `TRUNCATE` para los usuarios.
- Los usuarios desactivados (`status = 'disabled'`) no pueden leer ni escribir reportes diarios.
- La protección de concurrencia `revision` está declarada en el esquema pero se implementará transaccionalmente en la capa de persistencia/servidor en una orden futura.

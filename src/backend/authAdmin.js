import { createClient } from '@supabase/supabase-js';
import { normalizeUsername } from '../utils/auth.js';

function shortId(userId) {
  return `...${userId.slice(-4)}`;
}

/**
 * Crea un cliente administrador usando la clave secreta.
 * NUNCA exponer esta clave en el frontend.
 */
export function getAdminClient(supabaseUrl, secretKey) {
  if (!supabaseUrl || !secretKey) throw new Error("Faltan credenciales secretas (SUPABASE_SECRET_KEY)");
  return createClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

/**
 * Procedimiento administrado de alta.
 * Crea el Auth user y el perfil de forma consistente.
 */
export async function createManagedUser(adminClient, username, password, displayName) {
  if (password.length < 8) {
    throw new Error("La contraseña debe tener mínimo 8 caracteres.");
  }

  const email = normalizeUsername(username);

  // 1. Crear el usuario en auth.users
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (authError) throw new Error(`Error al crear auth user: ${authError.message}`);

  const userId = authData.user.id;

  // 2. Crear el perfil asociado
  const { error: profileError } = await adminClient.from('profiles').insert({
    user_id: userId,
    display_name: displayName,
    status: 'active'
  });

  // 3. Consistencia: si el perfil falla, borramos la cuenta huérfana
  if (profileError) {
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
       throw new Error(`CRÍTICO: Falló la creación de perfil y también falló el rollback (cuenta huérfana) para el usuario ${shortId(userId)}. Error perfil: ${profileError.message}. Error rollback: ${deleteError.message}`);
    }
    throw new Error(`Error al crear el perfil, usuario descartado de forma segura: ${profileError.message}`);
  }

  return userId;
}

/**
 * Desactiva un usuario administrado (bloqueando su login en Auth y su uso de la API vía RLS).
 */
export async function disableManagedUser(adminClient, userId) {
  // 1. Bloqueo en Auth (ban de 100 años)
  const { error: banError } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: '876600h' });
  if (banError) throw new Error(`Error al banear usuario en Auth: ${banError.message}`);

  // 2. Actualizar perfil
  const { error, count } = await adminClient.from('profiles').update({ status: 'disabled' }, { count: 'exact' }).eq('user_id', userId);
  if (error || count === 0) {
    const errorMsg = error ? error.message : 'Ningún perfil actualizado';

    // Compensación: retirar ban
    const { error: rollbackErr } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: 'none' });
    if (rollbackErr) {
      throw new Error(`CRÍTICO: Falló la actualización del perfil y la compensación (retiro de ban) también falló para el usuario ${shortId(userId)}. Perfil: ${errorMsg}. Compensación: ${rollbackErr.message}`);
    }

    throw new Error(`Error al desactivar perfil, ban revertido de forma segura: ${errorMsg}`);
  }
}

/**
 * Reactiva un usuario previamente desactivado.
 */
export async function reactivateManagedUser(adminClient, userId) {
  // 1. Levantar el ban en Auth
  const { error: unbanError } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: 'none' });
  if (unbanError) throw new Error(`Error al desbanear usuario en Auth: ${unbanError.message}`);

  // 2. Actualizar perfil
  const { error, count } = await adminClient.from('profiles').update({ status: 'active' }, { count: 'exact' }).eq('user_id', userId);
  if (error || count === 0) {
    const errorMsg = error ? error.message : 'Ningún perfil actualizado';

    // Compensación: volver a banear
    const { error: rollbackErr } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: '876600h' });
    if (rollbackErr) {
      throw new Error(`CRÍTICO: Falló la reactivación del perfil y la compensación (re-aplicación de ban) también falló para el usuario ${shortId(userId)}. Perfil: ${errorMsg}. Compensación: ${rollbackErr.message}`);
    }

    throw new Error(`Error al reactivar perfil, ban re-aplicado de forma segura: ${errorMsg}`);
  }
}

/**
 * Restablece la contraseña de un usuario de forma administrada.
 */
export async function resetManagedUserPassword(adminClient, userId, newPassword) {
  if (newPassword.length < 8) {
    throw new Error("La contraseña debe tener mínimo 8 caracteres.");
  }
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    password: newPassword
  });
  if (error) throw new Error(`Error reseteando contraseña: ${error.message}`);
}

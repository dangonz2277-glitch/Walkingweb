import { createClient } from '@supabase/supabase-js';

/**
 * Crea un cliente administrador usando la Service Role Key.
 * NUNCA exponer esta clave en el frontend.
 */
export function getAdminClient(supabaseUrl, serviceRoleKey) {
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Faltan credenciales de Service Role");
  return createClient(supabaseUrl, serviceRoleKey, {
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
export async function createManagedUser(adminClient, email, password, displayName) {
  if (password.length < 8) {
    throw new Error("La contraseña debe tener mínimo 8 caracteres.");
  }

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
       throw new Error(`CRÍTICO: Falló la creación de perfil y también falló el rollback (cuenta huérfana). UUID: ${userId}. Error perfil: ${profileError.message}. Error rollback: ${deleteError.message}`);
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
  
  // 2. Revocar tokens activos
  await adminClient.auth.admin.signOut(userId, 'global');

  // 3. Actualizar perfil
  const { error, count } = await adminClient.from('profiles').update({ status: 'disabled' }, { count: 'exact' }).eq('user_id', userId);
  if (error) throw new Error(`Error al desactivar perfil: ${error.message}`);
  if (count === 0) throw new Error(`No se actualizó ningún perfil al desactivar (UUID: ${userId}).`);
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
  if (error) throw new Error(`Error al reactivar perfil: ${error.message}`);
  if (count === 0) throw new Error(`No se actualizó ningún perfil al reactivar (UUID: ${userId}).`);
}

/**
 * Restablece la contraseña de un usuario de forma administrada y revoca sesiones previas.
 */
export async function resetManagedUserPassword(adminClient, userId, newPassword) {
  if (newPassword.length < 8) {
    throw new Error("La contraseña debe tener mínimo 8 caracteres.");
  }
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    password: newPassword
  });
  if (error) throw new Error(`Error reseteando contraseña: ${error.message}`);
  
  // Revocar sesiones globales activas al cambiar contraseña
  const { error: signoutError } = await adminClient.auth.admin.signOut(userId, 'global');
  if (signoutError) throw new Error(`Error revocando sesiones globales tras reset: ${signoutError.message}`);
}

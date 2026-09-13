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
    email_confirm: true // Se confirma automáticamente al ser administrado
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
    await adminClient.auth.admin.deleteUser(userId);
    throw new Error(`Error al crear el perfil, usuario descartado de forma segura: ${profileError.message}`);
  }

  return userId;
}

/**
 * Desactiva un usuario administrado (bloqueando su uso de la API, aunque tenga token).
 */
export async function disableManagedUser(adminClient, userId) {
  const { error } = await adminClient.from('profiles').update({ status: 'disabled' }).eq('user_id', userId);
  if (error) throw new Error(`Error al desactivar usuario: ${error.message}`);
}

/**
 * Reactiva un usuario previamente desactivado.
 */
export async function reactivateManagedUser(adminClient, userId) {
  const { error } = await adminClient.from('profiles').update({ status: 'active' }).eq('user_id', userId);
  if (error) throw new Error(`Error al reactivar usuario: ${error.message}`);
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

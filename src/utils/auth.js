export function normalizeUsername(rawUsername) {
  if (typeof rawUsername !== 'string') throw new Error('Usuario inválido.');
  const trimmed = rawUsername.trim().toLowerCase();
  if (!trimmed) throw new Error('El usuario no puede estar vacío.');
  if (!/^[a-z0-9_.-]+$/.test(trimmed)) {
    throw new Error('El usuario solo puede contener letras (sin tildes), números, puntos, guiones y guiones bajos.');
  }
  if (trimmed.length < 3) throw new Error('El usuario debe tener al menos 3 caracteres.');
  return `${trimmed}@walkingweb.internal`;
}

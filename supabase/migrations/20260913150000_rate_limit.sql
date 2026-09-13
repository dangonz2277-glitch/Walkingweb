create table public.rate_limits (
    ip text primary key,
    attempts int not null default 1,
    expires_at timestamptz not null
);

-- Habilitar RLS
alter table public.rate_limits enable row level security;

-- Revocar absolutamente todo para anon, authenticated y public
revoke all on table public.rate_limits from anon, authenticated, public;
-- Conceder control total solo a la service role
grant all on table public.rate_limits to service_role;

-- Función atómica para el rate limit
create or replace function public.check_rate_limit(client_ip text, max_attempts int default 5, window_interval interval default interval '1 minute')
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    current_attempts int;
    current_expires timestamptz;
begin
    if client_ip is null or trim(client_ip) = '' then
        raise exception 'client_ip is required';
    end if;

    if max_attempts < 1 or max_attempts > 100 then
        raise exception 'max_attempts out of bounds';
    end if;

    -- Eliminar entradas expiradas progresivamente (5% de las veces para evitar bloqueos)
    if random() < 0.05 then
        delete from public.rate_limits where expires_at < now();
    end if;

    -- Inserción atómica o actualización
    insert into public.rate_limits (ip, attempts, expires_at)
    values (client_ip, 1, now() + window_interval)
    on conflict (ip) do update
    set 
        attempts = case 
            when public.rate_limits.expires_at < now() then 1 
            else public.rate_limits.attempts + 1 
        end,
        expires_at = case 
            when public.rate_limits.expires_at < now() then now() + window_interval
            else public.rate_limits.expires_at 
        end
    returning attempts, expires_at into current_attempts, current_expires;

    if current_attempts > max_attempts then
        return false;
    end if;

    return true;
end;
$$;

-- Revocar ejecución por defecto
revoke execute on function public.check_rate_limit(text, int, interval) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, int, interval) to service_role;

-- Función para limpiar el rate limit tras login exitoso
create or replace function public.reset_rate_limit(client_ip text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    delete from public.rate_limits where ip = client_ip;
end;
$$;

revoke execute on function public.reset_rate_limit(text) from public, anon, authenticated;
grant execute on function public.reset_rate_limit(text) to service_role;

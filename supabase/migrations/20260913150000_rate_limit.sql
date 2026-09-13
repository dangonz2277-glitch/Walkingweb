create table public.rate_limits (
    ip text primary key,
    attempts int not null default 1,
    expires_at timestamptz not null
);

-- Habilitar RLS
alter table public.rate_limits enable row level security;

-- Solo la service role key podrá modificar esta tabla (Next.js backend)
-- No hay grants para authenticated ni anon

-- Función atómica para el rate limit
create or replace function public.check_rate_limit(client_ip text, max_attempts int, window_interval interval)
returns boolean
language plpgsql
security definer
as $$
declare
    current_attempts int;
    current_expires timestamptz;
begin
    -- Eliminar entradas expiradas (opcional, pero útil para limpieza)
    -- delete from public.rate_limits where expires_at < now();

    -- Inserción atómica o actualización
    insert into public.rate_limits (ip, attempts, expires_at)
    values (client_ip, 1, now() + window_interval)
    on conflict (ip) do update
    set 
        attempts = case 
            when rate_limits.expires_at < now() then 1 
            else rate_limits.attempts + 1 
        end,
        expires_at = case 
            when rate_limits.expires_at < now() then now() + window_interval
            else rate_limits.expires_at 
        end
    returning attempts, expires_at into current_attempts, current_expires;

    if current_attempts > max_attempts then
        return false;
    end if;

    return true;
end;
$$;

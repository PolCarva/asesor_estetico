-- Talles del usuario en su perfil (paso 07, D15): se piden una sola vez, antes de buscar
-- las prendas de un look, y se reusan en las búsquedas siguientes. Alineados con
-- `UserSizesSchema` de @asesor/shared: null = todavía no lo cargó.

alter table public.profiles
  add column top_size text check (top_size is null or char_length(top_size) between 1 and 10),
  add column bottom_size text
    check (bottom_size is null or char_length(bottom_size) between 1 and 10),
  -- El número de calzado va siempre con su sistema: EU y US no son intercambiables.
  add column shoe_size text check (shoe_size is null or char_length(shoe_size) between 1 and 10),
  add column shoe_size_system text not null default 'EU'
    check (shoe_size_system in ('EU', 'US'));

-- El usuario edita sus talles (la política "profiles: update own" ya limita a su fila).
grant update (top_size, bottom_size, shoe_size, shoe_size_system)
  on public.profiles to authenticated;

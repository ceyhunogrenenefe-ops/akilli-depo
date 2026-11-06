-- =====================================================================
-- Akıllı Palet ve Depo Yönetim Sistemi — Supabase şeması
-- Supabase panelinde SQL Editor'e yapıştırıp bir kez çalıştırın.
-- Tekrar çalıştırmak güvenlidir (IF NOT EXISTS / OR REPLACE).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Firmalar ----------
create table if not exists public.companies (
  id          uuid primary key default gen_random_uuid(),
  code        text,                         -- kısa kod: A, B, C (sesli komutta "A firması")
  name        text not null,
  contact_name text,
  phone       text,
  email       text,
  created_at  timestamptz not null default now()
);
create unique index if not exists companies_name_uq on public.companies (lower(name));

-- ---------- Kullanıcı profilleri / roller ----------
-- admin    : her şey + firmalar, alıcılar, kullanıcılar
-- personel : palet / ürün ekler, düzenler, bildirim gönderir
-- depo     : tüm listeleri görür, Excel indirir (Hollanda depo sorumlusu)
-- firma    : yalnızca kendi firmasının ürünlerini görür
-- bekliyor : üye oldu, yönetici onayı bekliyor (hiçbir şey göremez)
-- pasif    : reddedildi / erişimi kapatıldı
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  phone       text,
  request_note text,
  role        text not null default 'bekliyor' check (role in ('admin','personel','depo','firma','bekliyor','pasif')),
  company_id  uuid references public.companies(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------- Paletler ----------
create table if not exists public.pallets (
  id          uuid primary key default gen_random_uuid(),
  number      integer not null unique,
  status      text not null default 'acik' check (status in ('acik','tamamlandi','gonderildi')),
  note        text,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid()
);

-- ---------- Palet içindeki ürünler ----------
create table if not exists public.items (
  id          uuid primary key default gen_random_uuid(),
  pallet_id   uuid not null references public.pallets(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete restrict,
  product     text not null,
  quantity    numeric(12,2) not null check (quantity > 0),
  unit        text not null default 'adet',
  note        text,
  source      text not null default 'manuel' check (source in ('ses','manuel')),
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_at  timestamptz not null default now()
);
create index if not exists items_pallet_idx  on public.items(pallet_id);
create index if not exists items_company_idx on public.items(company_id);

-- ---------- Bildirim alıcıları ----------
create table if not exists public.recipients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kind        text not null check (kind in ('firma','depo','yonetici','personel')),
  company_id  uuid references public.companies(id) on delete cascade,  -- kind = 'firma' ise zorunlu
  email       text,
  phone       text,                 -- uluslararası biçim: 905xxxxxxxxx / 316xxxxxxxx
  use_email   boolean not null default true,
  use_whatsapp boolean not null default true,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint firma_needs_company check (kind <> 'firma' or company_id is not null)
);

-- ---------- Gönderilen bildirimler ----------
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  created_by   uuid default auth.uid(),
  recipient_id uuid references public.recipients(id) on delete set null,
  recipient_name text,
  channel      text not null,       -- email | whatsapp
  status       text not null,       -- gonderildi | hata | atlandi
  error        text,
  pallet_numbers integer[],
  file_url     text
);

-- ---------- Geçmiş işlemler (değişiklik kaydı) ----------
create table if not exists public.audit_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  user_id     uuid,
  user_email  text,
  entity      text not null,        -- pallet | item | company | recipient
  entity_id   uuid,
  action      text not null,        -- ekle | guncelle | sil | tasi
  before      jsonb,
  after       jsonb
);
create index if not exists audit_at_idx on public.audit_log(at desc);

-- =====================================================================
-- Yardımcı fonksiyonlar
-- =====================================================================
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.my_company() returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from public.profiles where id = auth.uid()
$$;

-- Sıradaki palet numarasıyla yeni palet oluşturur (Palet 1, Palet 2 ...)
create or replace function public.create_pallet(p_number integer default null, p_note text default null)
returns public.pallets
language plpgsql security invoker set search_path = public as $$
declare r public.pallets;
begin
  perform pg_advisory_xact_lock(424242);
  insert into public.pallets(number, note)
  values (coalesce(p_number, (select coalesce(max(number),0)+1 from public.pallets)), p_note)
  returning * into r;
  return r;
end $$;

-- Yeni kullanıcı kaydında profil oluştur. İlk kullanıcı otomatik admin olur.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, email, full_name, phone, request_note, role)
  values (
    new.id, new.email,
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1)),
    left(new.raw_user_meta_data->>'phone', 40),
    left(new.raw_user_meta_data->>'request_note', 300),
    -- İlk kullanıcı yönetici olur. Diğerleri yetkisiz başlar; rolü yönetici verir.
    -- (Kayıt sırasında gönderilen rol bilgisine asla güvenilmez.)
    case when (select count(*) from public.profiles) = 0 then 'admin' else 'bekliyor' end
  )
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists items_touch on public.items;
create trigger items_touch before update on public.items
  for each row execute function public.touch_updated_at();

-- Değişiklik kaydı tetikleyicisi
create or replace function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_action text;
  v_entity text := tg_argv[0];
begin
  if tg_op = 'INSERT' then v_action := 'ekle';
  elsif tg_op = 'DELETE' then v_action := 'sil';
  elsif v_entity = 'item' and old.pallet_id is distinct from new.pallet_id then v_action := 'tasi';
  else v_action := 'guncelle';
  end if;

  insert into public.audit_log(user_id, user_email, entity, entity_id, action, before, after)
  values (
    auth.uid(),
    (select email from public.profiles where id = auth.uid()),
    v_entity,
    coalesce((case when tg_op='DELETE' then old.id else new.id end)),
    v_action,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

drop trigger if exists audit_items on public.items;
create trigger audit_items after insert or update or delete on public.items
  for each row execute function public.audit_trigger('item');
drop trigger if exists audit_pallets on public.pallets;
create trigger audit_pallets after insert or update or delete on public.pallets
  for each row execute function public.audit_trigger('pallet');
drop trigger if exists audit_companies on public.companies;
create trigger audit_companies after insert or update or delete on public.companies
  for each row execute function public.audit_trigger('company');
drop trigger if exists audit_recipients on public.recipients;
create trigger audit_recipients after insert or update or delete on public.recipients
  for each row execute function public.audit_trigger('recipient');

-- =====================================================================
-- Satır bazlı yetkiler (RLS)
-- =====================================================================
alter table public.companies     enable row level security;
alter table public.profiles      enable row level security;
alter table public.pallets       enable row level security;
alter table public.items         enable row level security;
alter table public.recipients    enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log     enable row level security;

-- Firmalar: herkes okur (firma kullanıcısı yalnızca kendini), admin yazar
drop policy if exists companies_read on public.companies;
create policy companies_read on public.companies for select to authenticated
  using (my_role() in ('admin','personel','depo') or id = my_company());
drop policy if exists companies_write on public.companies;
create policy companies_write on public.companies for all to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');

-- Profiller: kişi kendini, admin herkesi görür; yalnızca admin değiştirir
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or my_role() = 'admin');
drop policy if exists profiles_admin on public.profiles;
create policy profiles_admin on public.profiles for update to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');

-- Paletler: admin/personel/depo hepsini, firma yalnızca kendi ürünü olan paletleri görür
drop policy if exists pallets_read on public.pallets;
create policy pallets_read on public.pallets for select to authenticated
  using (my_role() in ('admin','personel','depo')
         or exists (select 1 from public.items i where i.pallet_id = pallets.id and i.company_id = my_company()));
drop policy if exists pallets_write on public.pallets;
create policy pallets_write on public.pallets for all to authenticated
  using (my_role() in ('admin','personel')) with check (my_role() in ('admin','personel'));

-- Ürünler: firma kullanıcısı yalnızca kendi firmasının satırlarını görür
drop policy if exists items_read on public.items;
create policy items_read on public.items for select to authenticated
  using (my_role() in ('admin','personel','depo') or company_id = my_company());
drop policy if exists items_write on public.items;
create policy items_write on public.items for all to authenticated
  using (my_role() in ('admin','personel')) with check (my_role() in ('admin','personel'));

-- Alıcılar: admin yönetir, personel okur (bildirim gönderirken seçmek için)
drop policy if exists recipients_read on public.recipients;
create policy recipients_read on public.recipients for select to authenticated
  using (my_role() in ('admin','personel'));
drop policy if exists recipients_write on public.recipients;
create policy recipients_write on public.recipients for all to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');

-- Bildirim kayıtları ve geçmiş: admin/personel okur (yazma sunucu/trigger tarafında)
drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications for select to authenticated
  using (my_role() in ('admin','personel'));
drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select to authenticated
  using (my_role() in ('admin','personel'));

-- =====================================================================
-- Rapor dosyaları için özel depolama alanı
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('raporlar', 'raporlar', false)
on conflict (id) do nothing;

-- =====================================================================
-- Başlangıç verisi
-- =====================================================================
insert into public.companies (code, name)
select v.code, v.name from (values ('A','A Firması'),('B','B Firması'),('C','C Firması')) as v(code,name)
where not exists (select 1 from public.companies);

-- =====================================================================
-- Çok kullanıcılı canlı güncelleme (Realtime)
-- =====================================================================
do $$ begin
  begin alter publication supabase_realtime add table public.items;     exception when others then null; end;
  begin alter publication supabase_realtime add table public.pallets;   exception when others then null; end;
  begin alter publication supabase_realtime add table public.companies; exception when others then null; end;
end $$;

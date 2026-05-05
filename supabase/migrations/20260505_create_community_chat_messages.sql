-- =============================================
-- Community Chat Messages
-- Global community chat for all site visitors
-- Readable by everyone, writable by authenticated users only
-- =============================================

create table if not exists public.community_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.community_chat_messages enable row level security;

drop policy if exists "Anyone can read community chat messages"
on public.community_chat_messages;

create policy "Anyone can read community chat messages"
on public.community_chat_messages
for select
to anon, authenticated
using (true);

drop policy if exists "Logged in users can send community chat messages"
on public.community_chat_messages;

create policy "Logged in users can send community chat messages"
on public.community_chat_messages
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own community chat messages"
on public.community_chat_messages;

create policy "Users can delete their own community chat messages"
on public.community_chat_messages
for delete
to authenticated
using (auth.uid() = user_id);

create index if not exists community_chat_messages_created_at_idx
on public.community_chat_messages (created_at desc);

create index if not exists community_chat_messages_user_id_idx
on public.community_chat_messages (user_id);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'community_chat_messages'
  ) then
    alter publication supabase_realtime
    add table public.community_chat_messages;
  end if;
end $$;

-- Content validation: non-empty after trim, max 500 characters
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'community_chat_messages_content_check'
      and conrelid = 'public.community_chat_messages'::regclass
  ) then
    alter table public.community_chat_messages
    add constraint community_chat_messages_content_check
    check (length(trim(content)) > 0 and length(content) <= 500);
  end if;
end $$;

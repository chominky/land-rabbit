-- =============================================
-- 육지토끼고기 Supabase Schema
-- Supabase Dashboard → SQL Editor에서 실행하세요
-- =============================================

-- 1. cases 테이블
create table if not exists cases (
  id text primary key,
  title text not null,
  difficulty smallint not null default 2,
  tags text[] default '{}',
  status text not null default 'draft',
  images text[] default '{}',
  image_meta jsonb default '[]',
  brief text not null,
  truth text not null,
  key_facts jsonb not null default '[]',
  red_herrings text[] default '{}',
  hints text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. rooms 테이블
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  case_id text references cases(id),
  case_snapshot jsonb,
  host_player_id uuid,
  mode text not null default 'coop',
  status text not null default 'lobby',
  shared_tokens integer not null default 50,
  revealed_image_count integer not null default 1,
  total_questions integer not null default 0,
  turn_player_id uuid,
  turn_deadline timestamptz,
  created_at timestamptz default now(),
  last_activity_at timestamptz default now()
);

-- 3. room_players 테이블
create table if not exists room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  nickname text not null,
  is_host boolean default false,
  is_spectator boolean default false,
  tokens integer not null default 50,
  attempts_used integer not null default 0,
  solved_at timestamptz,
  rank integer,
  score integer,
  joined_at timestamptz default now(),
  cooldown_until timestamptz
);

-- 4. room_questions 테이블
create table if not exists room_questions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  player_id uuid references room_players(id) on delete set null,
  text text not null,
  verdict text not null,
  comment text default '',
  revealed_facts text[] default '{}',
  flagged boolean default false,
  created_at timestamptz default now()
);

-- 5. room_events 테이블
create table if not exists room_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  type text not null,
  payload jsonb default '{}',
  created_at timestamptz default now()
);

-- 6. flags 테이블
create table if not exists flags (
  id uuid primary key default gen_random_uuid(),
  case_id text,
  room_id uuid,
  question_text text,
  answer_text text,
  verdict_or_status text,
  ai_response jsonb,
  type text default 'judge',
  resolved boolean default false,
  created_at timestamptz default now()
);

-- 7. case_golden_tests 테이블
create table if not exists case_golden_tests (
  id uuid primary key default gen_random_uuid(),
  case_id text references cases(id) on delete cascade,
  question text not null,
  expected_verdict text not null,
  actual_verdict text,
  passed boolean,
  created_at timestamptz default now()
);

-- =============================================
-- RPC Functions (토큰 차감/환불/질문 카운트)
-- =============================================

-- 공유 토큰 차감
create or replace function deduct_shared_tokens(p_room_id uuid, p_cost integer)
returns integer as $$
declare
  current_tokens integer;
begin
  select shared_tokens into current_tokens from rooms where id = p_room_id for update;
  if current_tokens < p_cost then
    return -1;
  end if;
  update rooms set shared_tokens = shared_tokens - p_cost, last_activity_at = now() where id = p_room_id;
  return current_tokens - p_cost;
end;
$$ language plpgsql;

-- 플레이어 토큰 차감
create or replace function deduct_player_tokens(p_player_id uuid, p_cost integer)
returns integer as $$
declare
  current_tokens integer;
begin
  select tokens into current_tokens from room_players where id = p_player_id for update;
  if current_tokens < p_cost then
    return -1;
  end if;
  update room_players set tokens = tokens - p_cost where id = p_player_id;
  return current_tokens - p_cost;
end;
$$ language plpgsql;

-- 공유 토큰 환불
create or replace function refund_shared_tokens(p_room_id uuid, p_amount integer)
returns void as $$
begin
  update rooms set shared_tokens = shared_tokens + p_amount where id = p_room_id;
end;
$$ language plpgsql;

-- 플레이어 토큰 환불
create or replace function refund_player_tokens(p_player_id uuid, p_amount integer)
returns void as $$
begin
  update room_players set tokens = tokens + p_amount where id = p_player_id;
end;
$$ language plpgsql;

-- 질문 카운트 증가 + 이미지 자동 해금
create or replace function increment_questions(p_room_id uuid)
returns jsonb as $$
declare
  room_row rooms%rowtype;
  new_total integer;
  new_revealed integer;
  total_images integer;
  image_unlocked boolean := false;
begin
  select * into room_row from rooms where id = p_room_id for update;
  new_total := room_row.total_questions + 1;
  new_revealed := room_row.revealed_image_count;
  total_images := jsonb_array_length(coalesce((room_row.case_snapshot->'images'), '[]'::jsonb));

  if new_total % 15 = 0 and new_revealed < total_images then
    new_revealed := new_revealed + 1;
    image_unlocked := true;
  end if;

  update rooms
  set total_questions = new_total,
      revealed_image_count = new_revealed,
      last_activity_at = now()
  where id = p_room_id;

  return jsonb_build_object(
    'totalQuestions', new_total,
    'revealedImageCount', new_revealed,
    'imageUnlocked', image_unlocked
  );
end;
$$ language plpgsql;

-- =============================================
-- RLS (Row Level Security) 비활성화
-- 서버 사이드에서만 service_role로 접근하므로
-- =============================================
alter table cases enable row level security;
alter table rooms enable row level security;
alter table room_players enable row level security;
alter table room_questions enable row level security;
alter table room_events enable row level security;
alter table flags enable row level security;
alter table case_golden_tests enable row level security;

-- service_role은 RLS 우회하므로 별도 policy 불필요

-- Cases table
CREATE TABLE IF NOT EXISTS cases (
  id text PRIMARY KEY,
  title text NOT NULL,
  difficulty int NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  tags text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  brief text NOT NULL DEFAULT '',
  truth text NOT NULL DEFAULT '',
  images jsonb DEFAULT '[]',
  image_meta jsonb DEFAULT '[]',
  key_facts jsonb DEFAULT '[]',
  red_herrings jsonb DEFAULT '[]',
  hints jsonb DEFAULT '[]',
  play_count int DEFAULT 0,
  total_tokens_used int DEFAULT 0,
  clear_count int DEFAULT 0,
  flag_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS: block all anonymous reads on cases (truth must never leak)
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No anonymous access" ON cases FOR ALL USING (false);

-- Golden tests for judge regression
CREATE TABLE IF NOT EXISTS case_golden_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id text REFERENCES cases(id) ON DELETE CASCADE,
  question text NOT NULL,
  expected_verdict text NOT NULL,
  last_result text,
  last_run_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE case_golden_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No anonymous access" ON case_golden_tests FOR ALL USING (false);

-- Rooms
CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  case_id text NOT NULL,
  host_player_id uuid,
  mode text NOT NULL DEFAULT 'coop' CHECK (mode IN ('coop', 'versus')),
  status text NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'playing', 'finished')),
  shared_tokens int DEFAULT 50,
  revealed_image_count int DEFAULT 1,
  total_questions int DEFAULT 0,
  turn_player_id uuid,
  turn_deadline timestamptz,
  case_snapshot jsonb,
  created_at timestamptz DEFAULT now(),
  last_activity_at timestamptz DEFAULT now()
);

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
-- Anyone with room code can read
CREATE POLICY "Room read by code" ON rooms FOR SELECT USING (true);
CREATE POLICY "Room insert" ON rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "Room update" ON rooms FOR UPDATE USING (true);

-- Room players
CREATE TABLE IF NOT EXISTS room_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
  nickname text NOT NULL,
  is_host boolean DEFAULT false,
  is_spectator boolean DEFAULT false,
  tokens int DEFAULT 50,
  attempts_used int DEFAULT 0,
  solved_at timestamptz,
  rank int,
  score int,
  cooldown_until timestamptz,
  joined_at timestamptz DEFAULT now()
);

ALTER TABLE room_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players read" ON room_players FOR SELECT USING (true);
CREATE POLICY "Players insert" ON room_players FOR INSERT WITH CHECK (true);
CREATE POLICY "Players update" ON room_players FOR UPDATE USING (true);
CREATE POLICY "Players delete" ON room_players FOR DELETE USING (true);

-- Room questions
CREATE TABLE IF NOT EXISTS room_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
  player_id uuid REFERENCES room_players(id) ON DELETE SET NULL,
  text text NOT NULL,
  verdict text NOT NULL,
  comment text DEFAULT '',
  revealed_facts text[] DEFAULT '{}',
  flagged boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE room_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Questions read" ON room_questions FOR SELECT USING (true);
CREATE POLICY "Questions insert" ON room_questions FOR INSERT WITH CHECK (true);
CREATE POLICY "Questions update" ON room_questions FOR UPDATE USING (true);

-- Room events
CREATE TABLE IF NOT EXISTS room_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE room_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Events read" ON room_events FOR SELECT USING (true);
CREATE POLICY "Events insert" ON room_events FOR INSERT WITH CHECK (true);

-- Flags for review
CREATE TABLE IF NOT EXISTS flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id text REFERENCES cases(id) ON DELETE CASCADE,
  room_id uuid,
  question_id uuid,
  question_text text,
  answer_text text,
  verdict_or_status text,
  evidence text,
  ai_response jsonb,
  type text DEFAULT 'judge' CHECK (type IN ('judge', 'verdict')),
  resolved boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No anonymous access" ON flags FOR ALL USING (false);

-- Single-player game history (admin stats source)
CREATE TABLE IF NOT EXISTS game_history (
  id text PRIMARY KEY,
  case_id text REFERENCES cases(id) ON DELETE CASCADE,
  case_title text NOT NULL,
  ip text,
  solved boolean NOT NULL DEFAULT false,
  score int,
  rank text,
  accuracy int,
  tokens_left int NOT NULL DEFAULT 0,
  total_questions int NOT NULL DEFAULT 0,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  final_answer text,
  finished_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_history_case_idx ON game_history(case_id);
CREATE INDEX IF NOT EXISTS game_history_finished_idx ON game_history(finished_at DESC);

ALTER TABLE game_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No anonymous access" ON game_history FOR ALL USING (false);

-- ============================================
-- RPC: Atomic token deduction for coop mode
-- ============================================
CREATE OR REPLACE FUNCTION deduct_shared_tokens(
  p_room_id uuid,
  p_cost int
) RETURNS int AS $$
DECLARE
  v_tokens int;
BEGIN
  SELECT shared_tokens INTO v_tokens
  FROM rooms WHERE id = p_room_id FOR UPDATE;

  IF v_tokens < p_cost THEN
    RETURN -1; -- insufficient
  END IF;

  UPDATE rooms
  SET shared_tokens = shared_tokens - p_cost,
      last_activity_at = now()
  WHERE id = p_room_id;

  RETURN v_tokens - p_cost;
END;
$$ LANGUAGE plpgsql;

-- RPC: Atomic token deduction for versus mode (per player)
CREATE OR REPLACE FUNCTION deduct_player_tokens(
  p_player_id uuid,
  p_cost int
) RETURNS int AS $$
DECLARE
  v_tokens int;
BEGIN
  SELECT tokens INTO v_tokens
  FROM room_players WHERE id = p_player_id FOR UPDATE;

  IF v_tokens < p_cost THEN
    RETURN -1;
  END IF;

  UPDATE room_players
  SET tokens = tokens - p_cost
  WHERE id = p_player_id;

  RETURN v_tokens - p_cost;
END;
$$ LANGUAGE plpgsql;

-- RPC: Refund tokens (on AI failure)
CREATE OR REPLACE FUNCTION refund_shared_tokens(
  p_room_id uuid,
  p_amount int
) RETURNS void AS $$
BEGIN
  UPDATE rooms
  SET shared_tokens = shared_tokens + p_amount
  WHERE id = p_room_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refund_player_tokens(
  p_player_id uuid,
  p_amount int
) RETURNS void AS $$
BEGIN
  UPDATE room_players
  SET tokens = tokens + p_amount
  WHERE id = p_player_id;
END;
$$ LANGUAGE plpgsql;

-- RPC: Increment question count and check auto-unlock
CREATE OR REPLACE FUNCTION increment_questions(
  p_room_id uuid
) RETURNS jsonb AS $$
DECLARE
  v_total int;
  v_revealed int;
  v_case_snapshot jsonb;
  v_total_images int;
  v_should_unlock boolean := false;
BEGIN
  SELECT total_questions, revealed_image_count, case_snapshot
  INTO v_total, v_revealed, v_case_snapshot
  FROM rooms WHERE id = p_room_id FOR UPDATE;

  v_total := v_total + 1;
  v_total_images := jsonb_array_length(v_case_snapshot->'images');

  -- Check auto-unlock at 15, 30, 45
  IF v_total % 15 = 0 AND v_revealed < v_total_images THEN
    v_revealed := v_revealed + 1;
    v_should_unlock := true;
  END IF;

  UPDATE rooms
  SET total_questions = v_total,
      revealed_image_count = v_revealed
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'totalQuestions', v_total,
    'revealedImageCount', v_revealed,
    'imageUnlocked', v_should_unlock
  );
END;
$$ LANGUAGE plpgsql;

-- Cleanup: delete rooms inactive for 24 hours
CREATE OR REPLACE FUNCTION cleanup_stale_rooms() RETURNS void AS $$
BEGIN
  DELETE FROM rooms
  WHERE last_activity_at < now() - interval '24 hours';
END;
$$ LANGUAGE plpgsql;

-- Storage bucket policy (run manually or via dashboard)
-- CREATE POLICY "Authenticated read for case-images"
-- ON storage.objects FOR SELECT
-- USING (bucket_id = 'case-images' AND auth.role() = 'service_role');

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE room_players;
ALTER PUBLICATION supabase_realtime ADD TABLE room_questions;
ALTER PUBLICATION supabase_realtime ADD TABLE room_events;

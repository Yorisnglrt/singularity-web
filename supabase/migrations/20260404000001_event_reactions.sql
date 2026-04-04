-- Create event_reactions table
CREATE TABLE IF NOT EXISTS event_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id TEXT NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('like', 'interested', 'attending')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (event_id, user_id, action)
);

-- Enable RLS
ALTER TABLE event_reactions ENABLE ROW LEVEL SECURITY;

-- 1. Everyone can read reaction counts
CREATE POLICY "Public Read Reactions" ON event_reactions
FOR SELECT USING (true);

-- 2. Authenticated users can toggles their own reactions
CREATE POLICY "Auth Insert Reactions" ON event_reactions
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Auth Delete Reactions" ON event_reactions
FOR DELETE TO authenticated USING (auth.uid() = user_id);

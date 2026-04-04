-- Create event_comments table
CREATE TABLE IF NOT EXISTS event_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id TEXT NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL CHECK (char_length(content) <= 500 AND char_length(trim(content)) > 0),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE event_comments ENABLE ROW LEVEL SECURITY;

-- 1. Everyone can read comments
CREATE POLICY "Public Read Comments" ON event_comments
FOR SELECT USING (true);

-- 2. Authenticated users can insert comments
CREATE POLICY "Auth Insert Comments" ON event_comments
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- 3. Users can delete their own comments
CREATE POLICY "Author Delete Comments" ON event_comments
FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 4. Admins can delete any comment
CREATE POLICY "Admin Delete All Comments" ON event_comments
FOR DELETE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.is_admin = TRUE
  )
);

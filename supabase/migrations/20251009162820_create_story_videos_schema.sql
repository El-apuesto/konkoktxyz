/*
  # Story Video Maker Database Schema

  1. New Tables
    - `stories`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `title` (text)
      - `prompt` (text) - Original user input
      - `script` (text) - Generated or uploaded script
      - `duration` (integer) - Video duration in seconds (60, 180, or 300)
      - `status` (text) - generation, completed, failed
      - `video_url` (text) - Final video storage URL
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `image_prompts`
      - `id` (uuid, primary key)
      - `story_id` (uuid, references stories)
      - `sequence` (integer) - Order in the story
      - `prompt` (text) - Image generation prompt
      - `image_url` (text) - Generated image URL
      - `timestamp_start` (integer) - When image appears in video (seconds)
      - `timestamp_end` (integer) - When image ends in video (seconds)
      - `created_at` (timestamptz)
    
    - `characters`
      - `id` (uuid, primary key)
      - `story_id` (uuid, references stories)
      - `name` (text)
      - `description` (text) - Physical description for consistent generation
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their own data
*/

-- Create stories table
CREATE TABLE IF NOT EXISTS stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  prompt text NOT NULL,
  script text DEFAULT '',
  duration integer NOT NULL DEFAULT 60,
  status text NOT NULL DEFAULT 'pending',
  video_url text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create image_prompts table
CREATE TABLE IF NOT EXISTS image_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid REFERENCES stories(id) ON DELETE CASCADE NOT NULL,
  sequence integer NOT NULL DEFAULT 0,
  prompt text NOT NULL,
  image_url text DEFAULT '',
  timestamp_start integer NOT NULL DEFAULT 0,
  timestamp_end integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create characters table
CREATE TABLE IF NOT EXISTS characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid REFERENCES stories(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;

-- Stories policies
CREATE POLICY "Users can view own stories"
  ON stories FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own stories"
  ON stories FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own stories"
  ON stories FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own stories"
  ON stories FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Image prompts policies
CREATE POLICY "Users can view own image prompts"
  ON image_prompts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM stories
      WHERE stories.id = image_prompts.story_id
      AND stories.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own image prompts"
  ON image_prompts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM stories
      WHERE stories.id = image_prompts.story_id
      AND stories.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own image prompts"
  ON image_prompts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM stories
      WHERE stories.id = image_prompts.story_id
      AND stories.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM stories
      WHERE stories.id = image_prompts.story_id
      AND stories.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own image prompts"
  ON image_prompts FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM stories
      WHERE stories.id = image_prompts.story_id
      AND stories.user_id = auth.uid()
    )
  );

-- Characters policies
CREATE POLICY "Users can view own characters"
  ON characters FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM stories
      WHERE stories.id = characters.story_id
      AND stories.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own characters"
  ON characters FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM stories
      WHERE stories.id = characters.story_id
      AND stories.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own characters"
  ON characters FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM stories
      WHERE stories.id = characters.story_id
      AND stories.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM stories
      WHERE stories.id = characters.story_id
      AND stories.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own characters"
  ON characters FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM stories
      WHERE stories.id = characters.story_id
      AND stories.user_id = auth.uid()
    )
  );

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_stories_user_id ON stories(user_id);
CREATE INDEX IF NOT EXISTS idx_stories_created_at ON stories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_image_prompts_story_id ON image_prompts(story_id);
CREATE INDEX IF NOT EXISTS idx_image_prompts_sequence ON image_prompts(story_id, sequence);
CREATE INDEX IF NOT EXISTS idx_characters_story_id ON characters(story_id);

/*
  # Add Video Storage and Subscription System

  1. Storage
    - Create videos bucket for storing generated videos
    - Enable RLS on storage bucket
    - Add policies for authenticated users

  2. New Tables
    - `subscriptions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `stripe_customer_id` (text)
      - `stripe_subscription_id` (text)
      - `plan_tier` (text: free, basic, pro)
      - `status` (text: active, canceled, past_due)
      - `current_period_end` (timestamptz)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `usage_tracking`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key)
      - `videos_generated` (integer, default 0)
      - `month` (text, format: YYYY-MM)
      - `created_at` (timestamptz)

  3. Security
    - Enable RLS on all tables
    - Add policies for users to access their own data
    - Policies check subscription status for generation limits

  4. Functions
    - Function to check if user can generate video based on plan
    - Trigger to track usage on video generation
*/

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan_tier text NOT NULL DEFAULT 'free' CHECK (plan_tier IN ('free', 'basic', 'pro')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'trialing')),
  current_period_end timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS usage_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  videos_generated integer DEFAULT 0,
  month text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, month)
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own usage"
  ON usage_tracking FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage subscriptions"
  ON subscriptions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can manage usage"
  ON usage_tracking FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION can_generate_video(p_user_id uuid)
RETURNS boolean AS $$
DECLARE
  v_plan_tier text;
  v_videos_generated integer;
  v_current_month text;
  v_limit integer;
BEGIN
  v_current_month := to_char(now(), 'YYYY-MM');
  
  SELECT plan_tier INTO v_plan_tier
  FROM subscriptions
  WHERE user_id = p_user_id AND status = 'active';
  
  IF v_plan_tier IS NULL THEN
    v_plan_tier := 'free';
  END IF;
  
  SELECT COALESCE(videos_generated, 0) INTO v_videos_generated
  FROM usage_tracking
  WHERE user_id = p_user_id AND month = v_current_month;
  
  v_limit := CASE v_plan_tier
    WHEN 'free' THEN 3
    WHEN 'basic' THEN 20
    WHEN 'pro' THEN 100
    ELSE 0
  END;
  
  RETURN v_videos_generated < v_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_usage()
RETURNS trigger AS $$
BEGIN
  INSERT INTO usage_tracking (user_id, month, videos_generated)
  VALUES (NEW.user_id, to_char(now(), 'YYYY-MM'), 1)
  ON CONFLICT (user_id, month)
  DO UPDATE SET videos_generated = usage_tracking.videos_generated + 1;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'track_video_generation'
  ) THEN
    CREATE TRIGGER track_video_generation
    AFTER INSERT ON stories
    FOR EACH ROW
    WHEN (NEW.status = 'completed')
    EXECUTE FUNCTION increment_usage();
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('videos', 'videos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload videos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can view their own videos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their own videos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Public can view videos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'videos');

-- Migration: Admin bypass policies and secure RPC functions
-- Allows admin users to view all profiles and all audio_jobs globally

-- =============================================
-- PROFILES TABLE: Admin can view all profiles
-- =============================================

DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (
    (auth.uid() = id)
    OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.is_admin = TRUE
    )
  );

DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;

CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  USING (
    (auth.uid() = id)
    OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.is_admin = TRUE
    )
  );

-- =============================================
-- AUDIO_JOBS TABLE: Admin can view all jobs
-- =============================================

-- Check if audio_jobs has RLS enabled (if not, enable it)
ALTER TABLE IF EXISTS audio_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all audio_jobs" ON audio_jobs;

CREATE POLICY "Admins can view all audio_jobs"
  ON audio_jobs FOR SELECT
  USING (
    (user_id = auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.is_admin = TRUE
    )
  );

-- =============================================
-- RPC FUNCTION: get_all_users_for_admin
-- Returns all users with email for admin panel
-- Uses SECURITY DEFINER to bypass RLS
-- =============================================

CREATE OR REPLACE FUNCTION get_all_users_for_admin()
RETURNS TABLE (
  id UUID,
  email TEXT,
  is_admin BOOLEAN,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow admins to call this function
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Access denied: admin privileges required';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    u.email::TEXT,
    p.is_admin,
    COALESCE(p.is_active, TRUE) AS is_active,
    p.created_at
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  ORDER BY p.created_at DESC;
END;
$$;

-- Grant execute to authenticated users (the function itself checks admin status)
GRANT EXECUTE ON FUNCTION get_all_users_for_admin() TO authenticated;

-- =============================================
-- RPC FUNCTION: get_global_job_counts
-- Returns total job counts across all users
-- Uses SECURITY DEFINER to bypass RLS
-- =============================================

CREATE OR REPLACE FUNCTION get_global_job_counts()
RETURNS TABLE (
  audio_count BIGINT,
  press_count BIGINT,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow admins to call this function
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Access denied: admin privileges required';
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE job_type = 'audio') AS audio_count,
    COUNT(*) FILTER (WHERE job_type = 'press_release') AS press_count,
    COUNT(*) AS total_count
  FROM audio_jobs;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_global_job_counts() TO authenticated;

-- =============================================
-- RPC FUNCTION: get_global_job_data
-- Returns all job data for cost calculation
-- =============================================

CREATE OR REPLACE FUNCTION get_global_job_data()
RETURNS TABLE (
  job_type TEXT,
  file_name TEXT,
  result JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow admins to call this function
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Access denied: admin privileges required';
  END IF;

  RETURN QUERY
  SELECT
    j.job_type::TEXT,
    j.file_name::TEXT,
    j.result
  FROM audio_jobs j
  ORDER BY j.created_at DESC
  LIMIT 500;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_global_job_data() TO authenticated;

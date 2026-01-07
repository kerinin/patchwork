-- Seed data for local development
-- This file runs automatically after migrations during `supabase db reset`

-- Create dev user for auto-login in development mode
-- Email: dev@patchwork.local
-- Password: devpassword123
DO $$
DECLARE
  dev_user_id uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- Insert into auth.users
  -- Note: All nullable string columns must be empty strings, not NULL, for GoTrue
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change_token_current,
    email_change,
    phone,
    phone_change,
    phone_change_token,
    reauthentication_token
  ) VALUES (
    dev_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'dev@patchwork.local',
    crypt('devpassword123', gen_salt('bf')),
    NOW(),
    '{"provider": "email", "providers": ["email"]}',
    '{}',
    false,
    NOW(),
    NOW(),
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    ''
  ) ON CONFLICT (id) DO NOTHING;

  -- Insert into auth.identities (required for email login)
  -- Note: email column is generated from identity_data->>'email'
  INSERT INTO auth.identities (
    id,
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    dev_user_id,
    dev_user_id::text,
    dev_user_id,
    jsonb_build_object(
      'sub', dev_user_id::text,
      'email', 'dev@patchwork.local',
      'email_verified', true
    ),
    'email',
    NOW(),
    NOW(),
    NOW()
  ) ON CONFLICT (provider_id, provider) DO NOTHING;

  -- Create profile for the dev user (required by our schema)
  INSERT INTO public.profiles (id, display_name, preferences)
  VALUES (dev_user_id, 'Dev User', '{}')
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE 'Dev user created: dev@patchwork.local / devpassword123';
END $$;

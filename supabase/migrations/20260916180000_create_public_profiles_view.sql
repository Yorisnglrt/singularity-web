-- Ensure public_profiles view exists and is accessible by all roles
CREATE OR REPLACE VIEW public.public_profiles
AS
SELECT 
  p.id,
  p.display_name,
  p.avatar_url,
  p.bio,
  p.favorite_producer,
  p.favorite_track,
  p.favorite_subgenre,
  p.favorite_venue,
  p.favorite_festival,
  p.city,
  p.points,
  p.created_at,
  p.is_admin
FROM public.profiles p;

GRANT SELECT ON public.public_profiles TO anon, authenticated, service_role;

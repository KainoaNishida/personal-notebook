-- Supabase supports pg_cron. Expired notes and their revision history are
-- removed daily; source files remain because other entries may reference them.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('commonplace-expired-trash', '17 3 * * *', 'select public.purge_expired_trash()');

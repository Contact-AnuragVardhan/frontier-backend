-- OPTIONAL RESET FOR THE OLD V1/MOCK POLICIES TABLE ONLY.
-- Run this once only if your existing public.policies table still uses the old schema/mock rows.
-- This deletes the existing policies table and its data so sql/01_table.sql can create the v2 schema.

DROP TABLE IF EXISTS public.policies CASCADE;

-- MOCK DATA ONLY. NOT REAL POLICY CLAIMS.
-- Replace with Julia's verified data before production.

truncate table public.policies restart identity;

insert into public.policies
(state_code,state_name,title,summary,category,status,effective_date,source_url,last_updated)
values
('NJ','New Jersey','Mock K-12 AI Classroom Guidance','Mock record used to test how AI-use guidance is displayed in the EdTech Map.','AI Use','Guidance','2026-01-15','https://example.com/mock/nj/ai-guidance','2026-09-23'),
('NJ','New Jersey','Mock Student Data Protection Bill','Mock record used to test a pending student-privacy policy.','Student Privacy','Pending',null,'https://example.com/mock/nj/student-privacy','2026-09-23'),
('CA','California','Mock AI Literacy Requirement','Mock record used to test an enacted AI-literacy policy.','AI Literacy','Enacted','2026-07-01','https://example.com/mock/ca/ai-literacy','2026-09-23'),
('CA','California','Mock EdTech Procurement Regulation','Mock record used to test school-procurement requirements.','School Procurement','Regulation','2026-03-01','https://example.com/mock/ca/procurement','2026-09-23'),
('NY','New York','Mock Parent Consent for AI Tools','Mock record used to test a pending parental-consent policy.','Parental Consent','Pending',null,'https://example.com/mock/ny/parent-consent','2026-09-23'),
('TX','Texas','Mock District AI Use Framework','Mock record used to test state guidance for school AI use.','AI Use','Guidance','2026-08-01','https://example.com/mock/tx/ai-framework','2026-09-23'),
('FL','Florida','Mock Student Privacy Regulation','Mock record used to test regulation status and privacy filtering.','Student Privacy','Regulation','2026-06-15','https://example.com/mock/fl/privacy','2026-09-23'),
('CO','Colorado','Mock Responsible AI Literacy Act','Mock record used to test AI-literacy filtering and enacted status.','AI Literacy','Enacted','2026-09-01','https://example.com/mock/co/ai-literacy','2026-09-23'),
('VA','Virginia','Mock School AI Procurement Guidance','Mock record used to test procurement guidance for schools.','School Procurement','Guidance','2026-02-01','https://example.com/mock/va/procurement','2026-09-23'),
('WA','Washington','Mock Family Notice and Consent Bill','Mock record used to test parental-consent filtering.','Parental Consent','Pending',null,'https://example.com/mock/wa/consent','2026-09-23'),
('IL','Illinois','Mock Generative AI Classroom Regulation','Mock record used to test an AI-use regulation.','AI Use','Regulation','2026-05-01','https://example.com/mock/il/generative-ai','2026-09-23'),
('CT','Connecticut','Mock Student Data and AI Guidance','Mock record used to test another student-privacy guidance entry.','Student Privacy','Guidance','2026-04-15','https://example.com/mock/ct/student-data','2026-09-23');

-- 022: Universal textbook AI extraction - add content_schema and extra_content
-- content_schema: AI extraction config per textbook (JSON)
-- extra_content: extended dimension data beyond vocab/patterns/grammar (JSON)

ALTER TABLE textbooks ADD COLUMN content_schema TEXT DEFAULT NULL;

ALTER TABLE unit_content ADD COLUMN extra_content TEXT DEFAULT NULL;

-- Set default config for existing general English textbooks
UPDATE textbooks SET content_schema = '{"type":"general_english","dimensions":["vocab","patterns","grammar"],"target_age":"5-12","instruction_blacklist":["Listen.*point.*say","Listen and point","Listen and say","Listen and number","Listen and sing","Look and listen"]}'
WHERE code LIKE 'EU-%';

-- Set config for Phonics textbooks
UPDATE textbooks SET content_schema = '{"type":"phonics","dimensions":["letters","sounds","blending_words","sight_words","vocab"],"target_age":"4-8","instruction_blacklist":["Trace and write","Color and match","Circle the letter","Listen.*point.*say"]}'
WHERE code = 'WE-P';

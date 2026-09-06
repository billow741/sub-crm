-- Add new fields for V2 Milestone Report (Agency prompt)
ALTER TABLE progress_reports ADD COLUMN stage_growth_insights TEXT;
ALTER TABLE progress_reports ADD COLUMN radar_scores TEXT;
ALTER TABLE progress_reports ADD COLUMN next_phase_strategy TEXT;

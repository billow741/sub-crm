-- Migration 024: Add next_page_from and next_page_to to classes table
ALTER TABLE classes ADD COLUMN next_page_from INTEGER;
ALTER TABLE classes ADD COLUMN next_page_to INTEGER;

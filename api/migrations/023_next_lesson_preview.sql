-- Migration 023: Add next lesson preview target fields to classes table  
ALTER TABLE classes ADD COLUMN next_textbook_code TEXT;  
ALTER TABLE classes ADD COLUMN next_unit_number INTEGER; 

-- Migration: Add vendor_id to master_materials and master_equipment
-- Description: Links materials and equipment to vendors/suppliers
-- Author: Assistant

-- Add vendor_id column to master_materials
ALTER TABLE master_materials
ADD COLUMN vendor_id INT NULL,
ADD CONSTRAINT fk_materials_vendor
FOREIGN KEY (vendor_id) REFERENCES vendors(id)
ON DELETE SET NULL;

-- Add vendor_id column to master_equipment
ALTER TABLE master_equipment
ADD COLUMN vendor_id INT NULL,
ADD CONSTRAINT fk_equipment_vendor
FOREIGN KEY (vendor_id) REFERENCES vendors(id)
ON DELETE SET NULL;

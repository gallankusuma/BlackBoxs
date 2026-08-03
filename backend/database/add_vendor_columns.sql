-- Add vendor column to master_materials
ALTER TABLE master_materials 
ADD COLUMN vendor VARCHAR(255) NULL AFTER harga;

-- Add vendor column to master_equipment
ALTER TABLE master_equipment 
ADD COLUMN vendor VARCHAR(255) NULL AFTER harga;

-- Add index for vendor search
ALTER TABLE master_materials ADD INDEX idx_vendor (vendor);
ALTER TABLE master_equipment ADD INDEX idx_vendor (vendor);

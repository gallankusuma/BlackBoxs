-- ============================================
-- ESTIMATOR MODULE - SAMPLE SEED DATA
-- Based on AHSP screenshots provided
-- ============================================

-- Insert Master Disciplines
INSERT INTO master_disciplines (code, name, order_no) VALUES
('CIVIL', 'Civil', 1),
('STEEL', 'Steel Structure', 2),
('PIPING', 'Piping', 3),
('ELECTRICAL', 'Electrical', 4),
('MECHANICAL', 'Mechanical', 5);

-- Insert Master Sub-Disciplines for CIVIL
INSERT INTO master_sub_disciplines (discipline_id, code, name, order_no) VALUES
(1, 'PERSIAPAN', 'Pekerjaan Persiapan', 1),
(1, 'PONDASI', 'Pekerjaan Pondasi', 2),
(1, 'SALURAN', 'Pekerjaan Saluran', 3),
(1, 'STRUKTUR', 'Pekerjaan Struktur', 4);

-- =============================================
-- MASTER LABOR / UPAH (from screenshot 3)
-- =============================================
INSERT INTO master_labor (code, name, satuan, harga) VALUES
('L.01', 'Mandor', 'OH', 125685),
('L.02', 'Pekerja', 'OH', 94206),
('L.03', 'Tukang Kayu', 'OH', 111055),
('L.04', 'Tukang Batu', 'OH', 111055),
('L.05', 'Kepala Tukang', 'OH', 128000),
('L.06', 'Kepala Tukang Kayu', 'OH', 111055),
('L.07', 'Kepala Tukang Besi', 'OH', 111055),
('L.08', 'Kepala Tukang Cat', 'OH', 111055),
('L.09', 'Kepala Tukang Listrik', 'OH', 111055),
('L.10', 'Kepala Tukang Tanam', 'OH', 111055),
('L.11', 'Tukang', 'OJ', 15865),
('L.12', 'Tukang (anyam-isi batu)', 'OH', 111055),
('L.13', 'Tukang (isi batu)', 'OH', 111055),
('L.14', 'Tukang Aluminium', 'OH', 111055),
('L.15', 'Tukang Batu', 'OJ', 15865),
('L.16', 'Tukang Batu Halus', 'OH', 111055),
('L.17', 'Tukang Batu Kasar', 'OH', 111055),
('L.18', 'Tenaga Ahli Pratama', 'OH', 210000),
('L.19', 'Tenaga Terampil Operator', 'OH', 270000);

-- =============================================
-- MASTER MATERIALS / BAHAN (from screenshots 1 & 2)
-- =============================================
INSERT INTO master_materials (code, jenis, name, satuan, harga) VALUES
-- Kayu
('M.35.a', 'Kayu', 'Kayu Kaso 5/7 (lebar 5 cm, tinggi 7cm)', 'm3', 10039000),
('M.48.3', 'Kayu', 'Papan Kayu 2/20', 'm3', 9610500),

-- Agregat
('M.AGREGAT', 'AGREGAT', 'Agregat', 'm3', 263572),
('M.AGREGAT.1', 'AGREGAT', 'Agregat 5-10 & 10-15', 'm3', 354286),
('M.AGREGAT.2', 'AGREGAT', 'Agregat 5-8 & 8-11', 'm3', 432143),
('M.AGREGAT.3', 'AGREGAT', 'Agregat 5-8 & 8-11 & 11-16', 'm3', 432143),
('M.AGREGAT.4', 'AGREGAT', 'Agregat Halus', 'm3', 360945),

-- Semen & Building Materials
('M.23', 'Semen', 'PC/Portland Cement', 'Kg', 1417),
('M.01a', 'Pasir', 'Pasir Beton', 'Kg', 190),
('M.01b', 'Pasir', 'Paku Biasa 2" - 5"', 'Kg', 20403),
('M.02.a.3', 'Air', 'Air', 'Liter', 500),
('M.RESIDU', 'Residu', 'Residu', 'Liter', 8750),

-- Kerikil
('M.KERIKIL', 'Kerikil', 'Kerikil (Maks 30 mm)', 'Kg', 211),

-- AC (from screenshot 2)
('M.AC.1', 'AC', 'AC Cassete Kap. 35.000 BTUH dan aksesoris', 'Unit', 39569000),
('M.AC.2', 'AC', 'AC Wall Mounted Kap. 12.000 BTUH dan aksesoris', 'Unit', 7089000),
('M.AC.3', 'AC', 'AC Wall Mounted Kap. 24.000 BTUH dan aksesoris', 'Unit', 10000000),
('M.AC.4', 'AC', 'AC Wall Mounted Kap. 5.000 BTUH dan aksesoris', 'Unit', 6189000),
('M.AC.5', 'AC', 'AC Wall Mounted Kap. 6.500 BTUH dan aksesoris', 'Unit', 5059000),
('M.AC.6', 'AC', 'AC Wall Mounted Kap. 7.000 BTUH dan aksesoris', 'Unit', 5049000),
('M.AC.7', 'AC', 'AC Wall Mounted Kap. 9.000 BTUH dan aksesoris', 'Unit', 6729000);

-- =============================================
-- MASTER EQUIPMENT / ALAT (from screenshot 4)
-- =============================================
INSERT INTO master_equipment (code, name, satuan, harga) VALUES
('E.001', 'Rock Drill Breaker', 'Jam', 400000),
('E.002', 'Alat Las Listrik', 'Hari', 75000),
('E.003', 'Mesin Las', 'Jam', 40000),
('E.004', 'Welding Set', 'Jam', 50000),
('E.005', 'Bored Pile Machine (Hidraulik) Auger dia. 30-60 cm', 'Jam', 15000),
('E.006', 'Bored Pile Machine (Hidraulik) Auger dia. 45 - 120 cm', 'Jam', 550000),
('E.007', 'Mesin Bor', 'Jam', 5800),
('E.008', 'Mesin Bor Pipe Jacking', 'Jam', 21500),
('E.009', 'Crane', 'Jam', 593750),
('E.010', 'Crane 10-15 Ton', 'Jam', 562500),
('E.011', 'Crane 2', 'Jam', 562500),
('E.012', 'Crane 3', 'Jam', 562500),
('E.013', 'Crane on Track', 'Jam', 593750),
('E.014', 'Crane On Track (75-100)T, 75 HP', 'Jam', 1000000),
('E.015', 'Crane On Truck', 'Jam', 625000),
('E.016', 'Crane Truck 3 Ton; Winch 5 Ton', 'Jam', 625000),
('E.017', 'Mobile crane <= 3 ton', 'Hari', 1218000),
('E.018', 'Sewa crane', 'unit Hari', 4500000),
('E.019', 'Sewa crane', 'Jam', 650000),
('E.020', 'Dump Truck', 'Jam', 418000),
('E.021', 'Dump Truck 1', 'Jam', 418000);

-- =============================================
-- SAMPLE AHSP: U1.111 (c) - Pagar Sementara 1 m² 
-- (from screenshot 1)
-- =============================================
INSERT INTO ahsp_headers (kode, name, satuan, version, status) VALUES
('U1.111.c', 'Pembuatan 1 m² Pagar Sementara dari Kayu Tinggi 2 Meter', 'm2', '2024', 'active');

SET @ahsp_id = LAST_INSERT_ID();

-- Section A: Tenaga Kerja
INSERT INTO ahsp_items (ahsp_id, section, resource_type, resource_id, koefisien, resource_name, resource_satuan, resource_harga) VALUES
(@ahsp_id, 'A', 'labor', 1, 0.013, 'Mandor', 'OH', 125685),
(@ahsp_id, 'A', 'labor', 2, 0.6, 'Pekerja', 'OH', 94206),
(@ahsp_id, 'A', 'labor', 3, 0.2, 'Tukang Kayu', 'OH', 111055),
(@ahsp_id, 'A', 'labor', 4, 0.2, 'Tukang Batu', 'OH', 111055),
(@ahsp_id, 'A', 'labor', 5, 0.04, 'Kepala Tukang', 'OH', 128000);

-- Section B: Bahan
INSERT INTO ahsp_items (ahsp_id, section, resource_type, resource_id, koefisien, resource_name, resource_satuan, resource_harga) VALUES
(@ahsp_id, 'B', 'material', 1, 0.0387, 'Kayu Kaso 5/7', 'm3', 10039000),
(@ahsp_id, 'B', 'material', 2, 0.0396, 'Papan Kayu 2/20', 'm3', 9610500),
(@ahsp_id, 'B', 'material', 13, 83.349, 'Kerikil (Maks 30 mm)', 'Kg', 211),
(@ahsp_id, 'B', 'material', 9, 17.415, 'Air', 'Liter', 500),
(@ahsp_id, 'B', 'material', 10, 0.4, 'Residu', 'Liter', 8750),
(@ahsp_id, 'B', 'material', 8, 26.406, 'PC/Portland Cement', 'Kg', 1417),
(@ahsp_id, 'B', 'material', 7, 61.56, 'Pasir Beton', 'Kg', 190),
(@ahsp_id, 'B', 'material', 6, 0.5872, 'Paku Biasa 2" - 5"', 'Kg', 20403);

-- Section C: Peralatan (empty for this AHSP)

-- Map to Sub-Discipline
INSERT INTO ahsp_sub_discipline_map (ahsp_id, sub_discipline_id) VALUES
(@ahsp_id, 1); -- PERSIAPAN

-- =============================================
-- SAMPLE AHSP: A.2.2.14 - Papan Nama Proyek
-- =============================================
INSERT INTO ahsp_headers (kode, name, satuan, version, status) VALUES
('A.2.2.14', 'Papan Nama Proyek', 'bh', '2024', 'active');

-- =============================================
-- SAMPLE AHSP: A.2.2.15 - Pengukuran dan Bowplank
-- =============================================
INSERT INTO ahsp_headers (kode, name, satuan, version, status) VALUES
('A.2.2.15', 'Pengukuran dan Bowplank', 'm', '2024', 'active');

-- =============================================
-- SAMPLE AHSP: A.2.2.16 - Direksi Keet Sementara
-- =============================================
INSERT INTO ahsp_headers (kode, name, satuan, version, status) VALUES
('A.2.2.16', 'Pembuatan Direksi Keet sementara', 'm2', '2024', 'active');

-- =============================================
-- SAMPLE AHSP: A.2.2.17 - Mobilisasi & Demobilisasi
-- =============================================
INSERT INTO ahsp_headers (kode, name, satuan, version, status) VALUES
('A.2.2.17', 'Biaya Mobilisasi & Demobilisasi', 'paket', '2024', 'active');

-- =============================================
-- SAMPLE AHSP: A.2.2.18 - Pelaporan & Administrasi
-- =============================================
INSERT INTO ahsp_headers (kode, name, satuan, version, status) VALUES
('A.2.2.18', 'Pelaporan, Administrasi & Dokumentasi', 'paket', '2024', 'active');

-- =============================================
-- SAMPLE AHSP: A.2.2.19 - Sistem Manajemen K3
-- =============================================
INSERT INTO ahsp_headers (kode, name, satuan, version, status) VALUES
('A.2.2.19', 'Sistem Manajemen K3', 'paket', '2024', 'active');

-- Map these AHSP to PERSIAPAN sub-discipline
INSERT INTO ahsp_sub_discipline_map (ahsp_id, sub_discipline_id)
SELECT id, 1 FROM ahsp_headers WHERE kode IN ('A.2.2.14', 'A.2.2.15', 'A.2.2.16', 'A.2.2.17', 'A.2.2.18', 'A.2.2.19');

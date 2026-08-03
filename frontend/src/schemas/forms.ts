import { z } from 'zod';

export const productSchema = z.object({
  sku: z.string()
    .min(1, 'SKU is required')
    .min(3, 'SKU must be at least 3 characters'),
  name: z.string()
    .min(1, 'Product name is required')
    .min(5, 'Product name must be at least 5 characters'),
  category: z.string()
    .min(1, 'Category is required'),
  unit_of_measure: z.string()
    .min(1, 'Unit of measure is required'),
  product_type: z.enum(['raw_material', 'finished_goods', 'packaging'])
    .optional(),
  description: z.string().optional(),
  standard_cost: z.coerce.number()
    .min(0, 'Standard cost must be positive')
    .optional(),
  density: z.coerce.number()
    .min(0, 'Density must be positive')
    .optional(),
});

export type ProductFormData = z.infer<typeof productSchema>;

export const categorySchema = z.object({
  name: z.string()
    .min(1, 'Category name is required')
    .min(3, 'Category name must be at least 3 characters'),
  description: z.string().optional(),
  active: z.boolean().default(true),
});

export type CategoryFormData = z.infer<typeof categorySchema>;

export const bomSchema = z.object({
  component_product_id: z.coerce.number()
    .min(1, 'Component product is required'),
  quantity: z.coerce.number()
    .min(0.01, 'Quantity must be greater than 0'),
  unit: z.string()
    .min(1, 'Unit is required'),
  loss_percent: z.coerce.number()
    .min(0, 'Loss percent must be positive')
    .max(100, 'Loss percent cannot exceed 100')
    .optional()
    .default(0),
  notes: z.string().optional(),
});

export type BOMFormData = z.infer<typeof bomSchema>;

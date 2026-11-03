import { pool } from '../config/database';
import { logger } from '../utils/logger';

export interface PublicStoreSettings {
  gstNumber: string;
  gstPercentage: number;
  deliveryCharge: number;
  freeDeliveryThreshold: number;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyTiming: string;
  invoicePrefix: string;
}

export interface AllStoreSettings extends PublicStoreSettings {
  [key: string]: any;
}

let cachedSettings: AllStoreSettings | null = null;
let cacheExpiry: number = 0;
const CACHE_TTL_MS = 10000; // 10 seconds cache

/**
 * Validates Indian GSTIN (Goods and Services Tax Identification Number)
 * Format: 2 digits (state) + 5 letters (PAN) + 4 digits + 1 letter + 1 char + 'Z' + 1 checksum char
 * Example: 24AAACA1234A1Z5
 */
export const isValidGstin = (gstin: string): boolean => {
  if (!gstin) return true; // Optional / empty allowed
  const clean = gstin.trim().toUpperCase();
  const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  return gstRegex.test(clean);
};

export const fetchAllSettingsFromDb = async (): Promise<Record<string, string>> => {
  const [rows]: any = await pool.query(`SELECT setting_key, setting_value FROM store_settings`);
  const settingsMap: Record<string, string> = {};
  if (Array.isArray(rows)) {
    for (const row of rows) {
      settingsMap[row.setting_key] = row.setting_value;
    }
  }
  return settingsMap;
};

export const getStoreSettings = async (forceRefresh = false): Promise<AllStoreSettings> => {
  const now = Date.now();
  if (!forceRefresh && cachedSettings && now < cacheExpiry) {
    return cachedSettings;
  }

  const raw = await fetchAllSettingsFromDb();

  const gstPercentage = Number(raw['gst_percentage']) || 0;
  const deliveryCharge = raw['delivery_charge'] !== undefined && raw['delivery_charge'] !== '' ? Number(raw['delivery_charge']) : 0;
  const freeDeliveryThreshold = raw['free_delivery_threshold'] !== undefined && raw['free_delivery_threshold'] !== '' ? Number(raw['free_delivery_threshold']) : 0;

  const gstNumber = raw['gst_number'] ?? '';
  const companyName = raw['company_name'] ?? '';
  const companyAddress = raw['company_address'] ?? '';
  const companyPhone = raw['company_phone'] ?? '';
  const companyEmail = raw['company_email'] ?? '';
  const companyTiming = raw['company_timing'] ?? '';
  const invoicePrefix = raw['invoice_prefix'] ?? 'INV-';

  cachedSettings = {
    gstNumber,
    gstPercentage,
    deliveryCharge,
    freeDeliveryThreshold,
    companyName,
    companyAddress,
    companyPhone,
    companyEmail,
    companyTiming,
    invoicePrefix,
    ...raw
  };

  cacheExpiry = now + CACHE_TTL_MS;
  return cachedSettings;
};

export const updateStoreSettings = async (
  updates: Record<string, string | number>
): Promise<AllStoreSettings> => {
  // Validate GSTIN if supplied
  if (updates['gst_number'] !== undefined) {
    const gstVal = String(updates['gst_number']).trim().toUpperCase();
    if (gstVal && !isValidGstin(gstVal)) {
      throw new Error(`Invalid GSTIN format "${gstVal}". Expected 15-character Indian GST format (e.g. 24AAACA1234A1Z5).`);
    }
  }

  // Validate numeric fields
  if (updates['delivery_charge'] !== undefined && updates['delivery_charge'] !== null && String(updates['delivery_charge']).trim() !== '') {
    const dc = Number(updates['delivery_charge']);
    if (isNaN(dc) || dc < 0) {
      throw new Error('Delivery charge must be a valid non-negative number.');
    }
  }

  if (updates['free_delivery_threshold'] !== undefined && updates['free_delivery_threshold'] !== null && String(updates['free_delivery_threshold']).trim() !== '') {
    const fdt = Number(updates['free_delivery_threshold']);
    if (isNaN(fdt) || fdt < 0) {
      throw new Error('Free delivery threshold must be a valid non-negative number.');
    }
  }

  if (updates['gst_percentage'] !== undefined && updates['gst_percentage'] !== null && String(updates['gst_percentage']).trim() !== '') {
    const gp = Number(updates['gst_percentage']);
    if (isNaN(gp) || gp < 0 || gp > 100) {
      throw new Error('GST percentage must be between 0 and 100.');
    }
  }

  for (const [key, value] of Object.entries(updates)) {
    const stringVal = value !== null && value !== undefined ? String(value).trim() : '';
    await pool.query(
      `INSERT INTO store_settings (setting_key, setting_value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = CURRENT_TIMESTAMP`,
      [key, stringVal, stringVal]
    );
  }

  // Invalidate memory cache immediately
  cachedSettings = null;
  cacheExpiry = 0;

  return await getStoreSettings(true);
};

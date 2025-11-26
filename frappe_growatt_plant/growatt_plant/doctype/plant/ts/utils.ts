/**
 * Utility functions for Plant doctype operations
 */

import { Device, EqpActiveApi } from "./types/oss";

/**
 * Validates if a device object is valid
 */
export function validateDevice(device: Device): boolean {
  return Boolean(device?.serialNumber && device?.deviceModel);
}

/**
 * Validates if equipment from API is valid
 */
export function validateApiEquipment(equipment: EqpActiveApi): boolean {
  return Boolean(equipment?.serialNumber);
}

/**
 * Transforms API device data to table row format
 */
export function transformApiDeviceToTableRow(device: EqpActiveApi) {
  return {
    serial_number: device.serialNumber || "",
    model: device.devicemodel || "",
    datalogger_sn: "",
    status: device.status || "",
  };
}

/**
 * Filters out invalid equipment entries
 */
export function filterValidEquipment<T extends { serial_number?: string }>(
  equipment: T[]
): T[] {
  return equipment.filter((eq) => eq && eq.serial_number);
}

/**
 * Creates a Map from an array of equipment by serial number
 */
export function createEquipmentMap<T extends { serial_number: string }>(
  equipment: T[]
): Map<string, T> {
  return new Map(equipment.map((eq) => [eq.serial_number, eq]));
}

/**
 * Creates a Map from API equipment array by serial number
 */
export function createApiEquipmentMap(
  equipment: EqpActiveApi[]
): Map<string, EqpActiveApi> {
  return new Map(
    equipment
      .filter((eq) => eq && eq.serialNumber)
      .map((eq) => [eq.serialNumber, eq])
  );
}

/**
 * Checks if two values are different (null-safe)
 */
export function hasChanged(
  oldValue: string | null | undefined,
  newValue: string | null | undefined
): boolean {
  return (oldValue ?? "") !== (newValue ?? "");
}

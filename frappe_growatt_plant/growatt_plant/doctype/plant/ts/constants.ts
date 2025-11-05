/**
 * Constants for Plant doctype operations
 */

export const FIELD_NAMES = {
  SERIAL_NUMBER: "serial_number",
  ACTIVE_EQUIPMENT: "equipamentos_ativos_na_planta",
  HISTORY_EQUIPMENT: "historico_de_equipamentos",
  PLANT_ID: "plant_id",
  ACCOUNT_NAME: "accountname",
  PLANT_NAME: "plant_name",
  MODEL: "model",
  DATALOGGER_SN: "datalogger_sn",
  STATUS: "status",
} as const;

export const DOCTYPE_NAMES = {
  PLANT: "Plant",
  PLANT_ACTIVE_EQUIPMENTS: "Plant Active Equipments",
  SERIAL_NO: "Serial No",
  ITEM: "Item",
} as const;

export const ERROR_MESSAGES = {
  INVALID_SERIAL: "Invalid serial number",
  NO_DEVICES: "No devices found for the given serial number",
  NO_PLANT_DATA: "No plant data found for the given serial number",
  DUPLICATE_PLANT: "A plant with this serial number already exists. Do you want to redirect to the existing plant?",
  ITEM_NOT_FOUND: (model: string) => `Item "${model}" not found`,
  SERIAL_CREATE_FAILED: (serialNumber: string, model: string) =>
    `Failed to create Serial No "${serialNumber}" with model "${model}"`,
  ERROR_FETCHING_DEVICES: (msg: string) => `Error fetching devices: ${msg}`,
  ERROR_FETCHING_PLANT_DATA: (serialNumber: string, msg: string) =>
    `Error fetching plant data for device "${serialNumber}": ${msg}`,
  ERROR_FETCHING_ITEM_CODE: (msg: string) =>
    `Error fetching item code using device model as reference: ${msg}`,
  STRANGE_BEHAVIOUR: (plantName: string, serialNumber: string) =>
    `Strange behaviour: Plant "${plantName}" has no active equipment BUT it was fetched as having the serial number "${serialNumber}"`,
} as const;

export const UI_MESSAGES = {
  PROCESSING_DEVICES: "Processing devices...",
  SERIAL_NUMBER_INPUT: "Serial Number Input",
  SERIAL_NUMBER_LABEL: "Serial Number",
  SERIAL_NUMBER_DESCRIPTION: "Enter the serial number of the device.",
  SUBMIT: "Submit",
} as const;

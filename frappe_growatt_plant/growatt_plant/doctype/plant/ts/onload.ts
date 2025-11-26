import {
  DialogField,
  DialogInstance,
} from "@anygridtech/frappe-types/client/frappe/ui/Dialog";
import { Item } from "@anygridtech/frappe-types/doctype/erpnext/Item";
import { SerialNo } from "@anygridtech/frappe-types/doctype/erpnext/SerialNo";
import { FrappeForm } from "@anygridtech/frappe-types/client/frappe/core";
import {
  Device,
  EqpActiveDoc,
  EqpHistoryDoc,
  GetPlantInfo,
  PlantDoc,
} from "./types/oss";
import { checkMpptRoutine } from "./general/plant";
import { JoinStep } from "@anygridtech/frappe-agt-types/agt/client/utils/db";


frappe.ui.form.on<PlantDoc>("Plant", "onload", async (form) => {
  if (!form.doc.__islocal) return;
  SerialNumberInput(form);
  form.refresh_field("equipamentos_ativos_na_planta");
  form.refresh_field("historico_de_equipamentos");
});
/**
 * Builds and returns a dialog instance that accepts a serial number and
 * attempts to locate/create/associate devices and plants based on that serial.
 *
 * High level behaviour:
 * - Validates the supplied serial number format.
 * - Calls server API to fetch devices for the serial number.
 * - Retrieves plant information for the first device.
 * - Prevents creating a duplicate Plant (asks user to redirect if a plant
 *   with the same plant_id already exists).
 * - For each device found:
 *   - If there's no existing `Serial No` record, try to create one (and add
 *     it later to the current form table).
 *   - If the serial exists on other Plant records, remove it from their
 *     active equipment tables and move it into their history.
 *   - Update other Plant documents accordingly.
 * - Adds any new serial numbers to the current form's
 *   `equipamentos_ativos_na_planta` table.
 *
 * Inputs:
 * - form: FrappeForm<PlantDoc> — the current Plant form object to update.
 *
 * Returns:
 * - DialogInstance — the created dialog. The caller can show/hide this dialog.
 */
function SerialNumberInput(form: FrappeForm<PlantDoc>): DialogInstance {
  const sn_field_name = "serial_number";
  /**
   * Primary dialog submit handler.
   *
   * Steps and responsibilities:
   * - Read serial number value from dialog fields.
   * - Run client-side serial number validation.
   * - Call server APIs to fetch devices and plant info.
   * - Create `Serial No` records when required.
   * - Update other Plant documents to remove the serial from their active
   *   equipment table and move it into history.
   * - Add newly created serials into the current form table.
   *
   * The handler swallows errors sensibly and uses `frappe.msgprint` for
   * user-facing messages. It freezes/unfreezes the UI while waiting for
   * long-running network operations.
   *
   * @param values - dialog field values keyed by fieldname
   */
  const FetchSerialNumberPlant = async (values: Record<string, any>) => {
    const sn = values[sn_field_name];
    if (typeof sn !== "string" || sn === "") return;
    if (!agt.utils.validate_serial_number(sn)) {
      frappe.msgprint(__("Invalid serial number"));
      return;
    } 
      frappe.dom.freeze(__("Processing devices..."));
      const devices = await frappe
        .call<{ message: Device[] }>(
          {
            method: "frappe_growatt_plant.api.get_first_active_equipment",
            args: {
              serialNumber: sn,
            },
          }
        )
        .then((r) => r.message)
        .catch((e) => {
          // Log full error object for debugging and present a readable message to the user
          console.error("Error fetching devices:", e);
          const msg =
            typeof e === "string"
              ? e
              : e?.message ?? JSON.stringify(e, Object.getOwnPropertyNames(e));
          // Use msgprint instead of throw to avoid breaking the UI thread here
          frappe.msgprint(__(`Error fetching devices: ${msg}`));
          return [];
        });
    if (devices.length === 0) {
      frappe.msgprint(__("No devices found for the given serial number."));
      return;
    }
    /**
     * Fetch plant-level metadata for a device from server API.
     * Returns an object shaped like GetPlantInfo or an empty object on error.
     */
    const getPlantData = async (device: Device) => {
      return await frappe
        .call<{
          message: GetPlantInfo;
        }>({
          method: "frappe_growatt_plant.api.get_plant_info",
          args: {
            serialNumber: device.serialNumber,
          },
        })
        .then((r) => r.message)
        .catch((e) => {
            console.error(
              `Error fetching plant data for device "${device.serialNumber}":`,
              e
            );
            const msg =
              typeof e === "string"
                ? e
                : e?.message ?? JSON.stringify(e, Object.getOwnPropertyNames(e));
            frappe.msgprint(
              __(
                `Error fetching plant data for device "${device.serialNumber}": ${msg}`
              )
            );
            return {} as GetPlantInfo;
          });
    };

    const firstDevice = devices[0];
    if (!firstDevice) {
      frappe.dom.unfreeze();
      frappe.msgprint(__("No devices available to fetch plant data."));
      return;
    }
    const plantData = await getPlantData(firstDevice);
    if (!plantData) {
      frappe.msgprint(__("No plant data found for the given serial number."));
      return;
    }
  /**
   * If a Plant with the same plantId already exists, prompt the user to
   * either redirect to that plant or cancel. If the user chooses to
   * redirect, we throw to interrupt the flow (handled by the caller).
   */
  const ValidateDuplicatePlant = async (plantId: string): Promise<void> => {
      const existingPlants = await frappe.db.get_list<PlantDoc>("Plant", {
        filters: { plant_id: plantId },
        fields: ["name"],
      });
      if (existingPlants.length > 0) {
        const existingName = existingPlants[0]?.name;
        frappe.dom.unfreeze();
        await new Promise<void>((_resolve, reject) => {
          frappe.confirm(
            __(
              "A plant with this serial number already exists. Do you want to redirect to the existing plant?"
            ),
            () => {
              if (existingName) {
                frappe.set_route(["Form", "Plant", existingName]);
                reject(new Error("Redirected to existing plant."));
              } else {
                reject(new Error("Existing plant not found."));
              }
            },
            () => {
              diag.hide();
              reject(new Error("User cancelled duplicate plant confirmation."));
            }
          );
        });
      }
    };
    try {
      await ValidateDuplicatePlant(plantData.plantId);
    } catch (error) {
      // If validation fails (duplicate found), stop execution here
      return;
    }

    form.doc.plant_id = plantData.plantId;
    form.doc.accountname = plantData.accountName;
    form.doc.plant_name = plantData.plantName;

  /**
   * Try to resolve an item_code by looking up an existing `Serial No`
   * document for the supplied serial. Returns an empty string when not found.
   */
  const GetItemCodeUsingSerialNo = async (device: Device) => {
      return await frappe.db
        .get_value<SerialNo>("Serial No", { serial_no: device.serialNumber }, [
          "item_code",
        ])
        .then((r) => r.message?.item_code || "")
        .catch((e) => {
          const msg = e?.message || e;
          console.error(
            `Error fetching item code for serial ${device.serialNumber}:`,
            msg
          );
          return "";
        });
    };
  /**
   * Resolve an Item by matching the device model (item_name).
   * Returns list of matching Items (name, mppt). Callers decide how to
   * pick the right one; this function centralises the DB lookup.
   */
  const GetItemCode = async (device: Device) => {
      const device_model = device.deviceModel;
      return await frappe.db
        .get_list<Item>("Item", {
          filters: { item_name: device_model },
          fields: ["name", "mppt"],
        })
        .then((data) => data)
        .catch((e) => {
          const msg = e?.message || e;
          frappe.throw(
            __(
              `Error fetching item code using device model as reference: ${msg}`
            )
          );
          return [];
        });
    };
  /**
   * Create a new `Serial No` document for the device. If multiple items
   * match the model, `checkMpptRoutine` is used to select the correct
   * item_code. On success returns the inserted Serial No record, otherwise
   * returns undefined and displays a message to the user.
   */
  const CreateSerialNo = async (device: Device) => {
      frappe.dom.unfreeze();
      const item_list = await GetItemCode(device);
      let item_code = item_list.length > 0 && item_list[0]?.name ? item_list[0].name : "";
      if (item_list.length > 1) {
        const data = await checkMpptRoutine(
          device.deviceModel,
          device.serialNumber
        );
        if (data) {
          item_code = data.item_code;
        }
      }
      if (!item_code) {
        frappe.msgprint(`Item "${device.deviceModel}" not found.`);
        return;
      }
      const item = await frappe.db.insert<SerialNo>({
        doctype: "Serial No",
        serial_no: device.serialNumber,
        item_code: item_code,
      });
      if (!item) {
        frappe.msgprint(
          `Failed to create Serial No for "${device.serialNumber}".`
        );
        return;
      }

      frappe.dom.freeze(__("Processing devices..."));
      return item;
    };
  // Serial numbers to append to the current Plant form's active
  // equipment table at the end of processing.
  const SerialNumbersToAdd: EqpActiveDoc[] = [];
    const PlantsToUpdate: {
      plant_doc: PlantDoc;
      active_eqp_table: EqpActiveDoc[];
      history_eqp_table: EqpHistoryDoc[];
    }[] = [];
  // Iterate each device returned for the serial number. We handle the
  // following cases:
  // - Serial number has no `Serial No` record -> create and queue for add
  // - Serial number exists on other Plants -> remove from their active
  //   tables, add to their history, and update those Plants
  deviceLoop: for (const device of devices) {
      let serial_no: SerialNo | undefined = undefined;
      const itemcode_first_try = await GetItemCodeUsingSerialNo(device);
      if (itemcode_first_try.length === 0) {
        serial_no = await CreateSerialNo(device);
        if (!serial_no)
          return frappe.throw(
            `Failed to create Serial No "${device.serialNumber} with model "${device.deviceModel}".`
          );
        SerialNumbersToAdd.push({
          serial_number: device.serialNumber,
          status: device.status,
          datalogger_sn: "",
        } as EqpActiveDoc);
        continue deviceLoop;
      }

  // Use agt.utils.db.filter_join to find Plant documents that currently
  // list the device in their `Plant Active Equipments` child table.
  const steps: [JoinStep<EqpActiveDoc>, JoinStep<PlantDoc>] = [
        {
          doctype: "Plant Active Equipments",
          filters: {
            serial_number: device.serialNumber,
          },
          fields: ["name", "parent"],
        },
        {
          doctype: "Plant",
          filters: {},
          fields: ["*"],
          joinOn: {
            sourceField: "parent",
            targetField: "name",
          },
        },
      ];
      const plant_names = await agt.utils.db.filter_join(steps);
      let other_plants: PlantDoc[] = [];
      if (plant_names.length !== 0) {
        other_plants = await Promise.all(
          plant_names.map(async (plant) => {
            const res = await frappe.call<{ message: PlantDoc }>({
              method: "frappe.client.get",
              args: {
                doctype: "Plant",
                name: plant.name,
              },
            });
            return res.message;
          })
        );
      }
      // If no other plants claim this serial, queue it to be added to the
      // current Plant's active equipment table.
      if (other_plants.length === 0) {
        SerialNumbersToAdd.push({
          serial_number: device.serialNumber,
          status: device.status,
          datalogger_sn: "",
        } as EqpActiveDoc);
        continue deviceLoop;
      }
      plantLoop: for (const plant of other_plants) {
        // Defensive check: other plant should have active equipment rows.
        // If not, that's unexpected because we found the plant via a join
        // on `Plant Active Equipments`.
        if (plant.equipamentos_ativos_na_planta.length === 0) {
          return frappe.throw(
            `Strange behaviour: Plant "${plant.name}" has no active equipment BUT it was fetched as having the serial number "${device.serialNumber}".`
          );
        }
        const history_serials = plant.historico_de_equipamentos || [];
        // Build the updated active equipment table for the plant by
        // removing entries that match the current device serial. At the
        // same time, move those removed entries into the plant's history.
        const existing_serials = plant.equipamentos_ativos_na_planta.filter(
          (eq) => eq.serial_number !== device.serialNumber
        );
        existingSerialsLoop: for (const eq of existing_serials) {
          if (eq.serial_number !== device.serialNumber)
            continue existingSerialsLoop;
          history_serials.push({
            serial_number: eq.serial_number,
            model: eq.model,
            datalogger_sn: eq.datalogger_sn,
          } as EqpHistoryDoc);
        }

        PlantsToUpdate.push({
          plant_doc: plant,
          active_eqp_table: existing_serials,
          history_eqp_table: history_serials,
        });
      }
    }
  // Persist updates to any Plants that lost the serial from their active
  // equipment tables (we removed them above and appended to history).
  if (PlantsToUpdate.length > 0) {
      await Promise.all(
        PlantsToUpdate.map((plant) =>
          agt.utils.doc.update_doc(
            plant.plant_doc.doctype,
            plant.plant_doc.name,
            {
              equipamentos_ativos_na_planta: plant.active_eqp_table,
              historico_de_equipamentos: plant.history_eqp_table,
            }
          )
        )
      );
    }
    // Finally, add any created or unresolved serials to the current form's
    // `equipamentos_ativos_na_planta` table in bulk.
    await agt.utils.table.row.add_many(
      form,
      "equipamentos_ativos_na_planta",
      SerialNumbersToAdd
    );
    frappe.dom.unfreeze();
  };
  const fields: DialogField[] = [
    {
      fieldname: sn_field_name,
      fieldtype: "Data",
      label: __("Serial Number"),
      reqd: true,
      description: __("Enter the serial number of the device."),
    },
  ];
  const diag = agt.utils.dialog.load({
    title: __("Serial Number Input"),
    fields: fields,
    primary_action_label: __("Submit"),
    primary_action: FetchSerialNumberPlant,
  });

  return diag;
}

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
function SerialNumberInput(form: FrappeForm<PlantDoc>): DialogInstance {
  const sn_field_name = "serial_number";
  const FetchSerialNumberPlant = async (values: Record<string, any>) => {
    const sn = values[sn_field_name];
    if (typeof sn !== "string" || sn === "") return;
    if (!agt.utils.validate_serial_number(sn)) {
      frappe.msgprint(__("Invalid serial number"));
      return;
    } 
    frappe.dom.freeze(__("Processing devices..."));
    const devices = await frappe
      .call<{ message: Device[] }>({
        method: "frappe_growatt_plant.api.get_first_active_equipment",
        args: {
          serialNumber: sn,
        },
      })
      .then((r) => r.message)
      .catch((e) => {
        const msg = e?.message || e;
        frappe.throw(__(`Error fetching devices: ${msg}`));
        return [];
      });
    if (devices.length === 0) {
      frappe.msgprint(__("No devices found for the given serial number."));
      return;
    }
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
          const msg = e?.message || e;
          frappe.throw(
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
    const SerialNumbersToAdd: { serial_number: string }[] = [];
    const PlantsToUpdate: {
      plant_doc: PlantDoc;
      active_eqp_table: EqpActiveDoc[];
      history_eqp_table: EqpHistoryDoc[];
    }[] = [];
    deviceLoop: for (const device of devices) {
      let serial_no: SerialNo | undefined = undefined;
      const itemcode_first_try = await GetItemCodeUsingSerialNo(device);
      if (itemcode_first_try.length === 0) {
        serial_no = await CreateSerialNo(device);
        if (!serial_no)
          return frappe.throw(
            `Failed to create Serial No "${device.serialNumber} with model "${device.deviceModel}".`
          );
        SerialNumbersToAdd.push({ serial_number: serial_no.name });
        continue deviceLoop;
      }

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
      if (other_plants.length === 0) {
        SerialNumbersToAdd.push({ serial_number: device.serialNumber });
        continue deviceLoop;
      }
      plantLoop: for (const plant of other_plants) {
        if (plant.equipamentos_ativos_na_planta.length === 0) {
          return frappe.throw(
            `Strange behaviour: Plant "${plant.name}" has no active equipment BUT it was fetched as having the serial number "${device.serialNumber}".`
          );
        }
        const history_serials = plant.historico_de_equipamentos || [];
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

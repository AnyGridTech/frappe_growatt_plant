// Copyright (c) 2025, AnyGridTech and contributors
// For license information, please see license.txt
"use strict";
(() => {
  // growatt_plant/doctype/plant/ts/general/plant.ts
  async function checkMpptRoutine(item_name, sn) {
    const item_info = await frappe.db.get_list("Item", {
      filters: { item_name },
      fields: ["item_code", "custom_mppt", "item_name"]
    }).catch((e) => console.error(e));
    console.log(item_info);
    if (!item_info || !item_info.length) return void 0;
    if (item_info.length === 1) {
      return item_info[0];
    }
    const dialog_title = "Selecione a quantidade de MPPTs";
    return new Promise((resolve) => {
      agt.utils.dialog.load({
        title: dialog_title,
        fields: [
          {
            fieldname: "mppt",
            label: "MPPT",
            fieldtype: "Select",
            options: item_info.map((item) => item["custom_mppt"] || "").filter((mppt) => mppt),
            reqd: true,
            description: `Modelo: ${item_name} 
 SN: ${sn}`
          }
        ],
        primary_action: function(values) {
          const mppt = values["mppt"];
          if (!mppt) {
            resolve(void 0);
            return;
          }
          const item = item_info.find((item2) => item2["custom_mppt"] === mppt);
          console.log(item);
          agt.utils.dialog.close_by_title(dialog_title);
          resolve(item);
        }
      });
      agt.utils.dialog.refresh_dialog_stacking();
    });
  }

  // growatt_plant/doctype/plant/ts/onload.ts
  frappe.ui.form.on("Plant", "onload", async (form) => {
    console.log("Plant onload hello test");
    if (!form.doc.__islocal) return;
    SerialNumberInput(form);
    form.refresh_field("equipamentos_ativos_na_planta");
    form.refresh_field("historico_de_equipamentos");
  });
  function SerialNumberInput(form) {
    const sn_field_name = "serial_number";
    const FetchSerialNumberPlant = async (values) => {
      const sn = values[sn_field_name];
      if (typeof sn !== "string" || sn === "") return;
      if (!agt.utils.validate_serial_number(sn)) {
        frappe.msgprint(__("Invalid serial number"));
        return;
      }
      frappe.dom.freeze(__("Processing devices..."));
      const devices = await frappe.call({
        method: "get_first_active_eqp",
        args: {
          serialNumber: sn
        }
      }).then((r) => r.message).catch((e) => {
        const msg = e?.message || e;
        frappe.throw(__(`Error fetching devices: ${msg}`));
        return [];
      });
      if (devices.length === 0) {
        frappe.msgprint(__("No devices found for the given serial number."));
        return;
      }
      const getPlantData = async (device) => {
        return await frappe.call({
          method: "get_plant_info",
          args: {
            serialNumber: device.serialNumber
          }
        }).then((r) => r.message).catch((e) => {
          const msg = e?.message || e;
          frappe.throw(
            __(
              `Error fetching plant data for device "${device.serialNumber}": ${msg}`
            )
          );
          return {};
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
      const ValidateDuplicatePlant = async (plantId) => {
        const existingPlants = await frappe.db.get_list("Plant", {
          filters: { plant_id: plantId },
          fields: ["name"]
        });
        if (existingPlants.length > 0) {
          const existingName = existingPlants[0]?.name;
          frappe.dom.unfreeze();
          return new Promise((resolve, reject) => {
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
              }
            );
          });
        }
      };
      try {
        await ValidateDuplicatePlant(plantData.plantId);
      } catch (error) {
        return;
      }
      form.doc.plant_id = plantData.plantId;
      form.doc.accountname = plantData.accountName;
      form.doc.plant_name = plantData.plantName;
      const GetItemCodeUsingSerialNo = async (device) => {
        return await frappe.db.get_value("Serial No", { serial_no: device.serialNumber }, [
          "item_code"
        ]).then((r) => r.message?.item_code || "").catch((e) => {
          const msg = e?.message || e;
          console.error(
            `Error fetching item code for serial ${device.serialNumber}:`,
            msg
          );
          return "";
        });
      };
      const GetItemCode = async (device) => {
        const device_model = device.deviceModel;
        return await frappe.db.get_list("Item", {
          filters: { item_name: device_model },
          fields: ["name", "custom_mppt"]
        }).then((data) => data).catch((e) => {
          const msg = e?.message || e;
          frappe.throw(
            __(
              `Error fetching item code using device model as reference: ${msg}`
            )
          );
          return [];
        });
      };
      const CreateSerialNo = async (device) => {
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
        const item = await frappe.db.insert({
          doctype: "Serial No",
          serial_no: device.serialNumber,
          item_code
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
      const SerialNumbersToAdd = [];
      const PlantsToUpdate = [];
      deviceLoop: for (const device of devices) {
        let serial_no = void 0;
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
        const steps = [
          {
            doctype: "Plant Active Equipments",
            filters: {
              serial_number: device.serialNumber
            },
            fields: ["name", "parent"]
          },
          {
            doctype: "Plant",
            filters: {},
            fields: ["*"],
            joinOn: {
              sourceField: "parent",
              targetField: "name"
            }
          }
        ];
        const plant_names = await agt.db.filter_join(steps);
        let other_plants = [];
        if (plant_names.length !== 0) {
          other_plants = await Promise.all(
            plant_names.map(async (plant) => {
              const res = await frappe.call({
                method: "frappe.client.get",
                args: {
                  doctype: "Plant",
                  name: plant.name
                }
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
              datalogger_sn: eq.datalogger_sn
            });
          }
          PlantsToUpdate.push({
            plant_doc: plant,
            active_eqp_table: existing_serials,
            history_eqp_table: history_serials
          });
        }
      }
      if (PlantsToUpdate.length > 0) {
        for (const plant of PlantsToUpdate) {
          await agt.utils.doc.update_doc(
            plant.plant_doc.doctype,
            plant.plant_doc.name,
            {
              equipamentos_ativos_na_planta: plant.active_eqp_table,
              historico_de_equipamentos: plant.history_eqp_table
            }
          );
        }
      }
      await agt.utils.table.row.add_many(
        form,
        "equipamentos_ativos_na_planta",
        SerialNumbersToAdd
      );
      frappe.dom.unfreeze();
    };
    const fields = [
      {
        fieldname: sn_field_name,
        fieldtype: "Data",
        label: __("Serial Number"),
        reqd: true,
        description: __("Enter the serial number of the device.")
      }
    ];
    const diag = agt.utils.dialog.load({
      title: __("Serial Number Input"),
      fields,
      primary_action_label: __("Submit"),
      primary_action: FetchSerialNumberPlant
    });
    return diag;
  }

  // growatt_plant/doctype/plant/ts/refresh.ts
  frappe.ui.form.on("Plant", "refresh", async (frm) => {
    console.log("Refresh event triggered for Plant form");
  });
  frappe.ui.form.on("Plant", "refresh", async (frm) => {
    frappe.call({
      method: "frappe_growatt_plant.api.hello_growatt_plant",
      // The dotted path to your function
      callback: function(response) {
        if (response.message) {
          frappe.msgprint(response.message);
        }
      }
    });
    frm.add_custom_button("Refresh", () => {
      setTimeout(async () => {
        frappe.dom.freeze(__("Processing devices..."));
        try {
          await updatePlant(frm);
        } catch (error) {
          console.error("Error updating plant:", error);
        } finally {
          console.log("Attempting to unfreeze");
          frappe.dom.unfreeze();
        }
      });
    });
  });
  async function updatePlant(frm) {
    console.log("Starting updatePlant function");
    let activeEqp = await frappe.call({
      method: "getActiveEqp",
      args: {
        plantId: frm.doc.plant_id,
        accountName: frm.doc.accountname
      }
    }).then((r) => {
      console.log("Successfully fetched active equipment");
      return r.message;
    }).catch((e) => {
      console.error("Error fetching active equipment:", e);
      frappe.msgprint(__("Error fetching active equipment"));
      return [];
    });
    console.log("Active Equipment:", activeEqp);
    try {
      console.log("Starting mergeActiveEquipment");
      await mergeActiveEquipment(frm, activeEqp);
      console.log("mergeActiveEquipment completed successfully");
    } catch (error) {
      console.error("Error in mergeActiveEquipment:", error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      frappe.msgprint(__("Error merging equipment data: " + errorMsg));
      throw error;
    }
    console.log("updatePlant function completed");
    return;
  }
  async function mergeActiveEquipment(frm, activeEqpFromApi) {
    console.log("Starting mergeActiveEquipment with API data:", activeEqpFromApi);
    if (!Array.isArray(activeEqpFromApi)) {
      console.warn("activeEqpFromApi is not an array:", activeEqpFromApi);
      activeEqpFromApi = [];
    }
    const currentActiveEqp = Array.isArray(frm.doc.equipamentos_ativos_na_planta) ? frm.doc.equipamentos_ativos_na_planta : [];
    const currentHistoryEqp = Array.isArray(frm.doc.historico_de_equipamentos) ? frm.doc.historico_de_equipamentos : [];
    console.log("Current active equipment in plant:", currentActiveEqp);
    console.log("Current history equipment in plant:", currentHistoryEqp);
    const currentEqpMap = new Map(
      currentActiveEqp.filter((eq) => eq && eq.serial_number).map((eq) => [eq.serial_number, eq])
    );
    const historyEqpMap = new Map(
      currentHistoryEqp.filter((eq) => eq && eq.serial_number).map((eq) => [eq.serial_number, eq])
    );
    const apiEqpMap = new Map(
      activeEqpFromApi.filter((eq) => eq && eq.serialNumber).map((eq) => [eq.serialNumber, eq])
    );
    const equipmentToAdd = [];
    const equipmentToUpdate = [];
    const equipmentToMoveToHistory = [];
    const equipmentToMoveFromHistory = [];
    console.log("Processing API equipment for additions and updates");
    for (const apiEqp of activeEqpFromApi) {
      if (!apiEqp || !apiEqp.serialNumber) {
        console.warn("Skipping invalid API equipment:", apiEqp);
        continue;
      }
      const existingEqp = currentEqpMap.get(apiEqp.serialNumber);
      const historyEqp = historyEqpMap.get(apiEqp.serialNumber);
      if (existingEqp) {
        if (existingEqp.status == null) {
          throw new Error("existingEqp.status is required here");
        } else if (existingEqp.model !== apiEqp.devicemodel || existingEqp.status !== apiEqp.status) {
          console.log(`Equipment ${apiEqp.serialNumber} needs update`);
          existingEqp.model = apiEqp.devicemodel || existingEqp.model;
          existingEqp.status = apiEqp.status || existingEqp.status;
          equipmentToUpdate.push(existingEqp);
        }
      } else if (historyEqp) {
        console.log(
          `Equipment ${apiEqp.serialNumber} found in history, moving back to active`
        );
        equipmentToMoveFromHistory.push(historyEqp);
        equipmentToAdd.push({
          serial_number: apiEqp.serialNumber,
          model: apiEqp.devicemodel || "",
          datalogger_sn: historyEqp.datalogger_sn || "",
          status: apiEqp.status || ""
        });
      } else {
        console.log(`New equipment found: ${apiEqp.serialNumber}`);
        equipmentToAdd.push({
          serial_number: apiEqp.serialNumber,
          model: apiEqp.devicemodel || "",
          datalogger_sn: "",
          status: apiEqp.status || ""
        });
      }
    }
    console.log("Finding equipment to move to history");
    for (const currentEqp of currentActiveEqp) {
      if (!currentEqp || !currentEqp.serial_number) {
        console.warn("Skipping invalid current equipment:", currentEqp);
        continue;
      }
      if (!apiEqpMap.has(currentEqp.serial_number)) {
        console.log(
          `Equipment ${currentEqp.serial_number} to be moved to history`
        );
        equipmentToMoveToHistory.push(currentEqp);
      }
    }
    console.log("Summary of changes:", {
      toAdd: equipmentToAdd.length,
      toUpdate: equipmentToUpdate.length,
      toMoveToHistory: equipmentToMoveToHistory.length,
      toMoveFromHistory: equipmentToMoveFromHistory.length
    });
    let changesMade = false;
    if (equipmentToMoveFromHistory.length > 0) {
      console.log("Removing equipment from history");
      try {
        for (const eqpToRemove of equipmentToMoveFromHistory) {
          if (!eqpToRemove || !eqpToRemove.name) {
            console.warn(
              "Skipping invalid equipment to remove from history:",
              eqpToRemove
            );
            continue;
          }
          console.log(
            `Removing equipment ${eqpToRemove.serial_number} from history`
          );
          await agt.utils.table.row.delete_one(
            frm,
            "historico de equipamentos",
            eqpToRemove.name
          );
        }
        console.log("Successfully removed equipment from history");
      } catch (error) {
        console.error("Error removing equipment from history:", error);
        throw new Error(
          "Failed to remove equipment from history: " + (error instanceof Error ? error.message : error)
        );
      }
    }
    if (equipmentToAdd.length > 0) {
      console.log("Adding new equipment or restoring from history");
      try {
        await agt.utils.table.row.add_many(
          frm,
          "equipamentos_ativos_na_planta",
          equipmentToAdd
        );
        changesMade = true;
        console.log("Successfully added equipment to active");
      } catch (error) {
        console.error("Error adding equipment to active:", error);
        throw new Error(
          "Failed to add equipment to active: " + (error instanceof Error ? error.message : error)
        );
      }
    }
    if (equipmentToMoveToHistory.length > 0) {
      console.log("Moving equipment to history");
      try {
        const historyItems = equipmentToMoveToHistory.filter((eq) => eq && eq.serial_number).map((eq) => ({
          serial_number: eq.serial_number,
          model: eq.model || "",
          datalogger_sn: eq.datalogger_sn || ""
        }));
        if (historyItems.length > 0) {
          await agt.utils.table.row.add_many(
            frm,
            "historico_de_equipamentos",
            historyItems
          );
          console.log("Successfully added items to history");
        }
        for (const eqpToRemove of equipmentToMoveToHistory) {
          if (!eqpToRemove || !eqpToRemove.name) {
            console.warn(
              "Skipping invalid equipment to remove from active:",
              eqpToRemove
            );
            continue;
          }
          console.log(
            `Removing equipment ${eqpToRemove.serial_number} from active`
          );
          await agt.utils.table.row.delete_one(
            frm,
            "Plant Active Equipments",
            eqpToRemove.name
          );
        }
        changesMade = true;
        console.log("Successfully moved equipment to history");
      } catch (error) {
        console.error("Error moving equipment to history:", error);
        throw new Error(
          "Failed to move equipment to history: " + (error instanceof Error ? error.message : error)
        );
      }
    }
    if (equipmentToUpdate.length > 0) {
      console.log("Refreshing updated equipment");
      frm.refresh_field("equipamentos_ativos_na_planta");
      changesMade = true;
    }
    if (changesMade) {
      console.log("Saving changes");
      try {
        frm.save();
        console.log("Successfully saved changes");
      } catch (error) {
        console.error("Error saving form:", error);
        throw new Error(
          "Failed to save changes: " + (error instanceof Error ? error.message : error)
        );
      }
    }
    const addedCount = equipmentToAdd.length;
    const movedToHistoryCount = equipmentToMoveToHistory.length;
    const updatedCount = equipmentToUpdate.length;
    const restoredFromHistoryCount = equipmentToMoveFromHistory.length;
    const messages = [];
    if (addedCount > 0) messages.push(`${addedCount} new equipment added`);
    if (updatedCount > 0) messages.push(`${updatedCount} equipment updated`);
    if (movedToHistoryCount > 0)
      messages.push(`${movedToHistoryCount} equipment moved to history`);
    if (restoredFromHistoryCount > 0)
      messages.push(
        `${restoredFromHistoryCount} equipment restored from history`
      );
    if (messages.length > 0) {
      console.log("Equipment sync completed with changes:", messages.join(", "));
      frappe.msgprint(__(`Equipment sync completed: ${messages.join(", ")}`));
    } else {
      console.log("No changes detected in equipment");
      frappe.msgprint(__("No changes detected in equipment"));
    }
    console.log("mergeActiveEquipment function completed");
    return;
  }
})();

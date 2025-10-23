import { FrappeForm } from "@anygridtech/frappe-types/client/frappe/core";
import {
  EqpActiveApi,
  EqpActiveDoc,
  EqpHistoryDoc,
  PlantDoc,
} from "./types/oss";

frappe.ui.form.on<PlantDoc>("Plant", "refresh", async (frm) => {
  frappe.call({
    method: "frappe_growat_plant.api.hello_world", // The dotted path to your function
    callback: function (response) {
      // The 'response' object contains the return value
      // in response.message
      if (response.message) {
        frappe.msgprint(response.message);
      }
    },
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

async function updatePlant(frm: FrappeForm<PlantDoc>) {
  console.log("Starting updatePlant function");

  let activeEqp = await frappe
    .call<{
      message: EqpActiveApi[];
    }>({
      method: "getActiveEqp",
      args: {
        plantId: frm.doc.plant_id,
        accountName: frm.doc.accountname,
      },
    })
    .then((r) => {
      console.log("Successfully fetched active equipment");
      return r.message;
    })
    .catch((e) => {
      console.error("Error fetching active equipment:", e);
      frappe.msgprint(__("Error fetching active equipment"));
      return [];
    });

  console.log("Active Equipment:", activeEqp);

  // Merge the active equipment with existing equipment in the plant
  try {
    console.log("Starting mergeActiveEquipment");
    await mergeActiveEquipment(frm, activeEqp);
    console.log("mergeActiveEquipment completed successfully");
  } catch (error) {
    console.error("Error in mergeActiveEquipment:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    frappe.msgprint(__("Error merging equipment data: " + errorMsg));
    throw error; // Re-throw to ensure the finally block in the calling function runs
  }

  console.log("updatePlant function completed");
  return;
}

async function mergeActiveEquipment(
  frm: FrappeForm<PlantDoc>,
  activeEqpFromApi: EqpActiveApi[]
) {
  console.log("Starting mergeActiveEquipment with API data:", activeEqpFromApi);

  // Ensure activeEqpFromApi is valid
  if (!Array.isArray(activeEqpFromApi)) {
    console.warn("activeEqpFromApi is not an array:", activeEqpFromApi);
    activeEqpFromApi = [];
  }

  // Get current equipment in the plant with proper null checks
  const currentActiveEqp = Array.isArray(frm.doc.equipamentos_ativos_na_planta)
    ? frm.doc.equipamentos_ativos_na_planta
    : [];
  const currentHistoryEqp = Array.isArray(frm.doc.historico_de_equipamentos)
    ? frm.doc.historico_de_equipamentos
    : [];

  console.log("Current active equipment in plant:", currentActiveEqp);
  console.log("Current history equipment in plant:", currentHistoryEqp);

  // Create maps for easy lookup with safe array handling
  const currentEqpMap = new Map(
    currentActiveEqp
      .filter((eq) => eq && eq.serial_number) // Filter out null/undefined items
      .map((eq) => [eq.serial_number, eq])
  );
  const historyEqpMap = new Map(
    currentHistoryEqp
      .filter((eq) => eq && eq.serial_number) // Filter out null/undefined items
      .map((eq) => [eq.serial_number, eq])
  );
  const apiEqpMap = new Map(
    activeEqpFromApi
      .filter((eq) => eq && eq.serialNumber) // Filter out null/undefined items
      .map((eq) => [eq.serialNumber, eq])
  );

  // Arrays to track changes
  const equipmentToAdd: {
    serial_number: string;
    model: string;
    datalogger_sn: string;
    status?: string;
  }[] = [];
  const equipmentToUpdate: EqpActiveDoc[] = [];
  const equipmentToMoveToHistory: EqpActiveDoc[] = [];
  const equipmentToMoveFromHistory: EqpHistoryDoc[] = [];

  console.log("Processing API equipment for additions and updates");
  // Process API equipment - find new, updated, or equipment to restore from history
  for (const apiEqp of activeEqpFromApi) {
    // Skip if apiEqp is null/undefined or doesn't have serialNumber
    if (!apiEqp || !apiEqp.serialNumber) {
      console.warn("Skipping invalid API equipment:", apiEqp);
      continue;
    }

    const existingEqp = currentEqpMap.get(apiEqp.serialNumber);
    const historyEqp = historyEqpMap.get(apiEqp.serialNumber);

    if (existingEqp) {
      // Equipment exists in active - check if update is needed
      if (existingEqp.status == null) {
        throw new Error("existingEqp.status is required here");
      } else if (
        existingEqp.model !== apiEqp.devicemodel ||
        existingEqp.status !== apiEqp.status
      ) {
        console.log(`Equipment ${apiEqp.serialNumber} needs update`);
        existingEqp.model = apiEqp.devicemodel || existingEqp.model;
        existingEqp.status = apiEqp.status || existingEqp.status;
        equipmentToUpdate.push(existingEqp);
      }
    } else if (historyEqp) {
      // Equipment exists in history - move back to active
      console.log(
        `Equipment ${apiEqp.serialNumber} found in history, moving back to active`
      );
      equipmentToMoveFromHistory.push(historyEqp);
      equipmentToAdd.push({
        serial_number: apiEqp.serialNumber,
        model: apiEqp.devicemodel || "",
        datalogger_sn: historyEqp.datalogger_sn || "",
        status: apiEqp.status || "",
      });
    } else {
      // New equipment not in active or history
      console.log(`New equipment found: ${apiEqp.serialNumber}`);
      equipmentToAdd.push({
        serial_number: apiEqp.serialNumber,
        model: apiEqp.devicemodel || "",
        datalogger_sn: "",
        status: apiEqp.status || "",
      });
    }
  }

  console.log("Finding equipment to move to history");
  // Find equipment that is no longer active (exists in current but not in API)
  for (const currentEqp of currentActiveEqp) {
    // Skip if currentEqp is null/undefined or doesn't have serial_number
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
    toMoveFromHistory: equipmentToMoveFromHistory.length,
  });

  // Apply changes using growatt.utils functions
  let changesMade = false;

  // Remove equipment from history that will be moved back to active
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
        "Failed to remove equipment from history: " +
          (error instanceof Error ? error.message : error)
      );
    }
  }

  // Add new equipment or equipment moved from history
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
        "Failed to add equipment to active: " +
          (error instanceof Error ? error.message : error)
      );
    }
  }

  // Move equipment to history and remove from active
  if (equipmentToMoveToHistory.length > 0) {
    console.log("Moving equipment to history");
    try {
      // Add to history
      const historyItems = equipmentToMoveToHistory
        .filter((eq) => eq && eq.serial_number) // Filter out invalid items
        .map((eq) => ({
          serial_number: eq.serial_number,
          model: eq.model || "",
          datalogger_sn: eq.datalogger_sn || "",
        }));

      if (historyItems.length > 0) {
        await agt.utils.table.row.add_many(
          frm,
          "historico_de_equipamentos",
          historyItems
        );
        console.log("Successfully added items to history");
      }

      // Remove from active equipment
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
        "Failed to move equipment to history: " +
          (error instanceof Error ? error.message : error)
      );
    }
  }

  // Update existing equipment (if any updates were made)
  if (equipmentToUpdate.length > 0) {
    console.log("Refreshing updated equipment");
    frm.refresh_field("equipamentos_ativos_na_planta");
    changesMade = true;
  }

  // Save changes if any were made
  if (changesMade) {
    console.log("Saving changes");
    try {
      frm.save();
      console.log("Successfully saved changes");
    } catch (error) {
      console.error("Error saving form:", error);
      throw new Error(
        "Failed to save changes: " +
          (error instanceof Error ? error.message : error)
      );
    }
  }

  // Show summary of changes
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

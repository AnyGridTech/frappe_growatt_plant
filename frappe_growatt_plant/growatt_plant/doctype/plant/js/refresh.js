frappe.ui.form.on("Plant", "refresh", async (frm) => {
    frappe.call({
        method: "frappe_growat_plant.api.hello_world",
        callback: function (response) {
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
            }
            catch (error) {
                console.error("Error updating plant:", error);
            }
            finally {
                console.log("Attempting to unfreeze");
                frappe.dom.unfreeze();
            }
        });
    });
});
async function updatePlant(frm) {
    console.log("Starting updatePlant function");
    let activeEqp = await frappe
        .call({
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
    try {
        console.log("Starting mergeActiveEquipment");
        await mergeActiveEquipment(frm, activeEqp);
        console.log("mergeActiveEquipment completed successfully");
    }
    catch (error) {
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
    const currentActiveEqp = Array.isArray(frm.doc.equipamentos_ativos_na_planta)
        ? frm.doc.equipamentos_ativos_na_planta
        : [];
    const currentHistoryEqp = Array.isArray(frm.doc.historico_de_equipamentos)
        ? frm.doc.historico_de_equipamentos
        : [];
    console.log("Current active equipment in plant:", currentActiveEqp);
    console.log("Current history equipment in plant:", currentHistoryEqp);
    const currentEqpMap = new Map(currentActiveEqp
        .filter((eq) => eq && eq.serial_number)
        .map((eq) => [eq.serial_number, eq]));
    const historyEqpMap = new Map(currentHistoryEqp
        .filter((eq) => eq && eq.serial_number)
        .map((eq) => [eq.serial_number, eq]));
    const apiEqpMap = new Map(activeEqpFromApi
        .filter((eq) => eq && eq.serialNumber)
        .map((eq) => [eq.serialNumber, eq]));
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
            }
            else if (existingEqp.model !== apiEqp.devicemodel ||
                existingEqp.status !== apiEqp.status) {
                console.log(`Equipment ${apiEqp.serialNumber} needs update`);
                existingEqp.model = apiEqp.devicemodel || existingEqp.model;
                existingEqp.status = apiEqp.status || existingEqp.status;
                equipmentToUpdate.push(existingEqp);
            }
        }
        else if (historyEqp) {
            console.log(`Equipment ${apiEqp.serialNumber} found in history, moving back to active`);
            equipmentToMoveFromHistory.push(historyEqp);
            equipmentToAdd.push({
                serial_number: apiEqp.serialNumber,
                model: apiEqp.devicemodel || "",
                datalogger_sn: historyEqp.datalogger_sn || "",
                status: apiEqp.status || "",
            });
        }
        else {
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
    for (const currentEqp of currentActiveEqp) {
        if (!currentEqp || !currentEqp.serial_number) {
            console.warn("Skipping invalid current equipment:", currentEqp);
            continue;
        }
        if (!apiEqpMap.has(currentEqp.serial_number)) {
            console.log(`Equipment ${currentEqp.serial_number} to be moved to history`);
            equipmentToMoveToHistory.push(currentEqp);
        }
    }
    console.log("Summary of changes:", {
        toAdd: equipmentToAdd.length,
        toUpdate: equipmentToUpdate.length,
        toMoveToHistory: equipmentToMoveToHistory.length,
        toMoveFromHistory: equipmentToMoveFromHistory.length,
    });
    let changesMade = false;
    if (equipmentToMoveFromHistory.length > 0) {
        console.log("Removing equipment from history");
        try {
            for (const eqpToRemove of equipmentToMoveFromHistory) {
                if (!eqpToRemove || !eqpToRemove.name) {
                    console.warn("Skipping invalid equipment to remove from history:", eqpToRemove);
                    continue;
                }
                console.log(`Removing equipment ${eqpToRemove.serial_number} from history`);
                await agt.utils.table.row.delete_one(frm, "historico de equipamentos", eqpToRemove.name);
            }
            console.log("Successfully removed equipment from history");
        }
        catch (error) {
            console.error("Error removing equipment from history:", error);
            throw new Error("Failed to remove equipment from history: " +
                (error instanceof Error ? error.message : error));
        }
    }
    if (equipmentToAdd.length > 0) {
        console.log("Adding new equipment or restoring from history");
        try {
            await agt.utils.table.row.add_many(frm, "equipamentos_ativos_na_planta", equipmentToAdd);
            changesMade = true;
            console.log("Successfully added equipment to active");
        }
        catch (error) {
            console.error("Error adding equipment to active:", error);
            throw new Error("Failed to add equipment to active: " +
                (error instanceof Error ? error.message : error));
        }
    }
    if (equipmentToMoveToHistory.length > 0) {
        console.log("Moving equipment to history");
        try {
            const historyItems = equipmentToMoveToHistory
                .filter((eq) => eq && eq.serial_number)
                .map((eq) => ({
                serial_number: eq.serial_number,
                model: eq.model || "",
                datalogger_sn: eq.datalogger_sn || "",
            }));
            if (historyItems.length > 0) {
                await agt.utils.table.row.add_many(frm, "historico_de_equipamentos", historyItems);
                console.log("Successfully added items to history");
            }
            for (const eqpToRemove of equipmentToMoveToHistory) {
                if (!eqpToRemove || !eqpToRemove.name) {
                    console.warn("Skipping invalid equipment to remove from active:", eqpToRemove);
                    continue;
                }
                console.log(`Removing equipment ${eqpToRemove.serial_number} from active`);
                await agt.utils.table.row.delete_one(frm, "Plant Active Equipments", eqpToRemove.name);
            }
            changesMade = true;
            console.log("Successfully moved equipment to history");
        }
        catch (error) {
            console.error("Error moving equipment to history:", error);
            throw new Error("Failed to move equipment to history: " +
                (error instanceof Error ? error.message : error));
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
        }
        catch (error) {
            console.error("Error saving form:", error);
            throw new Error("Failed to save changes: " +
                (error instanceof Error ? error.message : error));
        }
    }
    const addedCount = equipmentToAdd.length;
    const movedToHistoryCount = equipmentToMoveToHistory.length;
    const updatedCount = equipmentToUpdate.length;
    const restoredFromHistoryCount = equipmentToMoveFromHistory.length;
    const messages = [];
    if (addedCount > 0)
        messages.push(`${addedCount} new equipment added`);
    if (updatedCount > 0)
        messages.push(`${updatedCount} equipment updated`);
    if (movedToHistoryCount > 0)
        messages.push(`${movedToHistoryCount} equipment moved to history`);
    if (restoredFromHistoryCount > 0)
        messages.push(`${restoredFromHistoryCount} equipment restored from history`);
    if (messages.length > 0) {
        console.log("Equipment sync completed with changes:", messages.join(", "));
        frappe.msgprint(__(`Equipment sync completed: ${messages.join(", ")}`));
    }
    else {
        console.log("No changes detected in equipment");
        frappe.msgprint(__("No changes detected in equipment"));
    }
    console.log("mergeActiveEquipment function completed");
    return;
}

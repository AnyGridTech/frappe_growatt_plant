async function checkMpptRoutine(item_name, sn) {
    const item_info = await frappe.db
        .get_list("Item", {
        filters: { item_name: item_name },
        fields: ["item_code", "custom_mppt", "item_name"],
    }).catch((e) => console.error(e));
    console.log(item_info);
    if (!item_info || !item_info.length)
        return undefined;
    if (item_info.length === 1) {
        return item_info[0];
    }
    const dialog_title = "Selecione a quantidade de MPPTs";
    return new Promise((resolve) => {
        growatt.utils.load_dialog({
            title: dialog_title,
            fields: [
                {
                    fieldname: "mppt",
                    label: "MPPT",
                    fieldtype: "Select",
                    options: item_info.map((item) => item.custom_mppt),
                    reqd: true,
                    description: `Modelo: ${item_name} \n SN: ${sn}`
                }
            ],
            primary_action: function (values) {
                const mppt = values.mppt;
                if (!mppt) {
                    resolve(undefined);
                    return;
                }
                const item = item_info.find((item) => item.custom_mppt === mppt);
                console.log(item);
                growatt.utils.close_dialog_by_title(dialog_title);
                resolve(item);
            },
        });
        growatt.utils.refresh_dialog_stacking();
    });
}
export { checkMpptRoutine };

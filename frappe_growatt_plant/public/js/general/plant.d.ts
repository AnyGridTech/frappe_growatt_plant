import { Item } from "@anygridtech/frappe-types/doctype/erpnext/Item";
declare function checkMpptRoutine(item_name: string, sn: string): Promise<Item | undefined>;
export { checkMpptRoutine };

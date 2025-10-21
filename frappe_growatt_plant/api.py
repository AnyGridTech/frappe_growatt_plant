import frappe



@frappe.whitelist()
def hello_growatt_plant():
    frappe.msgprint("Hello from Growatt Plant API")
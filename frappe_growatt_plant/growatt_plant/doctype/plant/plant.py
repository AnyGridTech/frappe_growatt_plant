# Copyright (c) 2025, AnyGridTech and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class Plant(Document):
    def authOssApi():
        try:
            url = ""
            payload = {}
            headers = {}
            response = frappe.make_post_request(url, data=payload, headers=headers)
            token = response.get("token")

            if not token:
                frappe.log_error(title="Growatt Auth Error", message="Token not found in the API response")
                frappe.msgprint("Token not found in the API response")
            return token
        except Exception as e:
            frappe.log_error(title="Growatt Auth Error", message=str(e))
            raise

    def get_active_eqp(plant_id, accountName):
        try:
            url = ""
            payload = {"accountName": accountName}
            headers = {"Content-Type": "application/json"}
            response = frappe.make_post_request(url, data=payload, headers=headers)
            active_equipments = response.get("data", [])

            if not active_equipments:
                frappe.log_error(title="Growatt Active Equipments Error", message="No active equipments found")
                frappe.msgprint("No active equipments found")
            return active_equipments
        except Exception as e:
            frappe.log_error(title="Growatt Active Equipments Error", message=str(e))
            raise
    
    def get_sn_data(serialNumber):
        try:
            url = ""
            payload = {
                "serialNumber": serialNumber,
                "serverID": 1,
                "type": 0,
                "deviceSN": str(serialNumber)
            }
            headers = {"Content-Type": "application/x-www-form-urlencoded"}
            response = frappe.make_post_request(url, data=payload, headers=headers)
            if not response:
                frappe.log_error(title="Growatt SN Data Error", message="No data found for the given serial number")
                frappe.msgprint("No data found for the given serial number")
            return response
        except Exception as e:
            frappe.log_error(title="Growatt SN Data Error", message=str(e))
            raise
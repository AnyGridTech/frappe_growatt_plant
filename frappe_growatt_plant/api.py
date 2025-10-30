import frappe


@frappe.whitelist()
def hello_growatt_plant():
    frappe.msgprint("Hello from Growatt Plant API")


def get_params():
    try:
        params = frappe.get_single("Params Growatt Plant")
        return params
    except Exception as e:
        frappe.log_error(title="Growatt Params Error", message=str(e))
        raise


def authOssApi():
    try:
        params = get_params()
        url = params.api_host + "/oss/login"
        payload = {
            "username": params.username,
            "password": params.get_password("password"),
            "ossUrl": params.oss_url,
            "growattUrl": params.growatt_url,
        }
        headers = {"Content-Type": "application/json"}
        response = frappe.make_post_request(url, data=payload, headers=headers)
        token = response.get("token")

        if not token:
            frappe.log_error(
                title="Growatt Auth Error",
                message="Token not found in the API response",
            )
            frappe.msgprint("Token not found in the API response")
        else:
            frappe.cache().set_value(
                "growatt_plant_auth_token", token, expires_in_sec=43200
            )
            frappe.logger().info("Growatt Auth Token stored in Redis")
    except Exception as e:
        frappe.log_error(title="Growatt Auth Error", message=str(e))
        raise


@frappe.whitelist()
def get_active_eqp(plant_id, accountName):
    try:
        params = get_params()
        token = frappe.cache().get_value("growatt_plant_auth_token")
        if not token:
            authOssApi()
            token = frappe.cache().get_value("growatt_plant_auth_token")
        uri = params.api_host + "oss/getActiveEquipaments"
        query_params = f"?accountName={str(accountName)}&plantId={str(plant_id)}"
        url = uri + query_params
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": f"Bearer {token}",
        }

        response = frappe.make_get_request(url, headers=headers)
        if not response.get("data"):
            frappe.log_error(
                title="Growatt Active Equipments Error",
                message="No active equipments found",
            )
            frappe.msgprint("No active equipments found")
        return response
    except Exception as e:
        frappe.log_error(title="Growatt Active Equipments Error", message=str(e))
        raise


def get_sn_data(serialNumber):
    try:
        params = get_params()
        token = frappe.cache().get_value("growatt_plant_auth_token")
        if not token:
            authOssApi()
            token = frappe.cache().get_value("growatt_plant_auth_token")
        url = params.api_host + "oss/searchInverter"
        payload = {
            "serverID": 1,
            "type": 0,
            "deviceSN": str(serialNumber),
        }
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": f"Bearer {token}",
        }
        response = frappe.make_post_request(url, data=payload, headers=headers)
        if not response:
            frappe.log_error(
                title="Growatt SN Data Error",
                message="No data found for the given serial number",
            )
            frappe.msgprint("No data found for the given serial number")
        return response
    except Exception as e:
        frappe.log_error(title="Growatt SN Data Error", message=str(e))
        raise

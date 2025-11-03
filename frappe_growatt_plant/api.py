import frappe
import requests

plantRequest = {
    "username": "",
    "plantId": "",
    "serverid": ""
}

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

@frappe.whitelist()
def authOssApi():
    try:
        params = get_params()
        frappe.logger().info(params)
        url = params.api_host + "/oss/login"
        payload = {
            "username": params.username,
            "pwd": params.get_password("password"),
            "ossUrl": params.oss_url,
            "growattUrl": params.growatt_url,
        }
        headers = {"Content-Type": "application/json"}
        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()
        data = response.json()
        token = data.get("token")

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


def getToken():
    token = frappe.cache().get_value("growatt_plant_auth_token")
    if not token:
        authOssApi()
        token = frappe.cache().get_value("growatt_plant_auth_token")
    return token

@frappe.whitelist()
def get_active_eqp(plantId, accountName):
    try:
        params = get_params()
        token = getToken()
        uri = params.api_host + "/oss/getActiveEquipaments"
        query_params = f"?accountName={str(accountName)}&plantId={str(plantId)}"
        url = uri + query_params
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": f"Bearer {token}",
        }

        response = requests.get(url, headers=headers)
        response.raise_for_status()
        data = response.json()
        if not data.get("data"):
            frappe.log_error(
                title="Growatt Active Equipments Error",
                message="No active equipments found",
            )
            frappe.msgprint("No active equipments found")
        return data
    except Exception as e:
        frappe.log_error(title="Growatt Active Equipments Error", message=str(e))
        raise


def get_plant_data(plantRequest):
    try:
        params = get_params()
        token = getToken()
        headers = {"Authorization": f"Bearer {token}"}
        url = params.api_host + "/oss/getDevicesByPlantList"
        query_params = f"?serverId={plantRequest['serverid']}&plantId={plantRequest['plantId']}&username={plantRequest['username']}&currPage=1"
        url = url + query_params

        response = requests.get(url, headers=headers)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        frappe.log_error(title="Growatt Get Plant Data Error", message=str(e))
        raise

def get_sn_data(serialNumber):
    try:
        params = get_params()
        token = getToken()
        url = params.api_host + "/oss/searchInverter"
        payload = {
            "serverID": 1,
            "type": 0,
            "deviceSN": str(serialNumber),
        }
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": f"Bearer {token}",
        }
        response = requests.post(url, data=payload, headers=headers)
        response.raise_for_status()
        data = response.json()
        if not data:
            frappe.log_error(
                title="Growatt SN Data Error",
                message="No data found for the given serial number",
            )
            frappe.msgprint("No data found for the given serial number")
        return data
    except Exception as e:
        frappe.log_error(title="Growatt SN Data Error", message=str(e))
        raise


def get_active_equipaments(plantRequest):
    params = get_params()
    token = getToken()     
    url = params.api_host + "/oss/getActiveEquipaments"
    query_params = f"?serverId={plantRequest['serverid']}&plantId={plantRequest['plantId']}&accountName={plantRequest['username']}&currPage=1"
    url = url + query_params
    if not token:
        frappe.log_error(title="Growatt Get Active Equipments Error", message="Token not retrieved before making request")
        authOssApi()
        token = getToken()
    headers = {"Authorization": f"Bearer {token}"}
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        frappe.log_error(title="Growatt Get Active Equipments Error", message=str(e))
        raise

@frappe.whitelist()
def get_first_active_equipment():
    serialNumber = frappe.form_dict.get("serialNumber")
    data = get_sn_data(serialNumber)
    obj = data.get("obj")
    if isinstance(obj, dict) and obj:
        for key, items in obj.items():
            if isinstance(items, list) and items:
                entry = items[0]
                plantRequest["serverid"] = entry.get("serverId")
                plantRequest["plantId"] = entry.get("plantId")
                plantRequest["username"] = entry.get("accountName")
                break
    else:
        frappe.throw("No valid data found in the response.")
    plantData = get_active_equipaments(plantRequest)
    return plantData

@frappe.whitelist()
def get_plant_info():
    serialNumber = frappe.form_dict.get("serialNumber")
    token = authOssApi()
    data = get_sn_data(serialNumber)
    obj = data.get("obj")
    if isinstance(obj, dict) and obj:
        for key, items in obj.items():
            if isinstance(items, list) and items:
                entry = items[0]
                plantRequest["serverid"] = entry.get("serverId")
                plantRequest["plantId"] = entry.get("plantId")
                plantRequest["accountName"] = entry.get("accountName")
                plantRequest["plantName"] = entry.get("plantName")
                break
        return plantRequest
    else:
        frappe.throw("No valid data found in the response.")
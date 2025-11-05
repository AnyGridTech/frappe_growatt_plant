import frappe
import requests
from frappe import _
from typing import Dict, Optional, Any


# Global variable for plant request data
plantRequest = {
    "username": "",
    "plantId": "",
    "serverid": ""
}


@frappe.whitelist()
def hello_growatt_plant():
    """Test endpoint to verify API is working"""
    frappe.msgprint("Hello from Growatt Plant API")


def get_params():
    """Get Growatt Plant parameters from single doctype"""
    try:
        params = frappe.get_single("Params Growatt Plant")
        return params
    except Exception as e:
        frappe.log_error(title="Growatt Params Error", message=str(e))
        raise

@frappe.whitelist()
def authOssApi():
    """Authenticate with Growatt OSS API and store token in cache"""
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
            frappe.throw(_("Authentication failed: Token not found in API response"))
        else:
            frappe.cache().set_value(
                "growatt_plant_auth_token", token, expires_in_sec=43200
            )
            frappe.logger().info("Growatt Auth Token stored in Redis")
            return token
    except requests.RequestException as e:
        frappe.log_error(title="Growatt Auth Error", message=str(e))
        frappe.throw(_("Authentication failed: {0}").format(str(e)))
    except Exception as e:
        frappe.log_error(title="Growatt Auth Error", message=str(e))
        raise


def get_token():
    """Get authentication token from cache or authenticate if not available"""
    token = frappe.cache().get_value("growatt_plant_auth_token")
    if not token:
        authOssApi()
        token = frappe.cache().get_value("growatt_plant_auth_token")
    return token

@frappe.whitelist()
def get_active_eqp(plantId, accountName):
    """Get active equipment for a plant"""
    if not plantId or not accountName:
        frappe.throw(_("Plant ID and Account Name are required"))
    
    try:
        params = get_params()
        token = get_token()
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
        
        if not data:
            frappe.throw(_("No response received from API"))
        
        equipment_data = data.get("data")
        if not equipment_data:
            frappe.log_error(
                title="Growatt Active Equipments Error",
                message=f"No active equipments found for Plant ID: {plantId}",
            )
            frappe.msgprint(_("No active equipments found for Plant ID: {0}").format(plantId))
            return []
        
        return equipment_data
    except requests.RequestException as e:
        frappe.log_error(title="Growatt Active Equipments Error", message=str(e))
        frappe.throw(_("Failed to fetch active equipment: {0}").format(str(e)))
    except Exception as e:
        frappe.log_error(title="Growatt Active Equipments Error", message=str(e))
        raise


def get_plant_data(plantRequest: Dict[str, Any]) -> Dict[str, Any]:
    """Get plant device data from Growatt API"""
    try:
        params = get_params()
        token = get_token()
        headers = {"Authorization": f"Bearer {token}"}
        url = params.api_host + "/oss/getDevicesByPlantList"
        query_params = f"?serverId={plantRequest['serverid']}&plantId={plantRequest['plantId']}&username={plantRequest['username']}&currPage=1"
        url = url + query_params

        response = requests.get(url, headers=headers)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        frappe.log_error(title="Growatt Get Plant Data Error", message=str(e))
        frappe.throw(_("Failed to get plant data: {0}").format(str(e)))
    except Exception as e:
        frappe.log_error(title="Growatt Get Plant Data Error", message=str(e))
        raise

def get_sn_data(serialNumber: str) -> Dict[str, Any]:
    """Get serial number data from Growatt API"""
    token = get_token()
    if not serialNumber:
        frappe.throw(_("Serial number is required"))
    if not token:
        frappe.log_error(
            title="Growatt SN Data Error", 
            message="Token not retrieved before making request"
        )
        frappe.throw(_("Authentication token is missing"))
    try:
        params = get_params()
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
            frappe.throw(_("No data found for serial number: {0}").format(serialNumber))
        
        return data
    except requests.RequestException as e:
        frappe.log_error(title="Growatt SN Data Error", message=str(e))
        frappe.throw(_("Failed to get serial number data: {0}").format(str(e)))
    except Exception as e:
        frappe.log_error(title="Growatt SN Data Error", message=str(e))
        raise


def get_active_equipaments(plantRequest: Dict[str, Any]) -> Dict[str, Any]:
    """Get active equipment for a plant from Growatt API"""
    params = get_params()
    token = get_token()     
    url = params.api_host + "/oss/getActiveEquipaments"
    query_params = f"?serverId={plantRequest['serverid']}&plantId={plantRequest['plantId']}&accountName={plantRequest['username']}&currPage=1"
    url = url + query_params
    
    if not token:
        frappe.log_error(
            title="Growatt Get Active Equipments Error", 
            message="Token not retrieved before making request"
        )
        token = get_token()
    
    headers = {"Authorization": f"Bearer {token}"}
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        frappe.log_error(title="Growatt Get Active Equipments Error", message=str(e))
        frappe.throw(_("Failed to get active equipment: {0}").format(str(e)))
    except Exception as e:
        frappe.log_error(title="Growatt Get Active Equipments Error", message=str(e))
        raise

@frappe.whitelist()
def get_first_active_equipment() -> Dict[str, Any]:
    """Get first active equipment for a given serial number"""
    serialNumber = frappe.form_dict.get("serialNumber")
    
    if not serialNumber:
        frappe.throw(_("Serial number is required"))
    
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
        frappe.throw(_("No valid data found for serial number: {0}").format(serialNumber))
    
    plantData = get_active_equipaments(plantRequest)
    return plantData

@frappe.whitelist()
def get_plant_info() -> Dict[str, Any]:
    """Get plant information for a given serial number"""
    serialNumber = frappe.form_dict.get("serialNumber")
    
    if not serialNumber:
        frappe.throw(_("Serial number is required"))
    
    authOssApi()
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
        frappe.throw(_("No valid data found for serial number: {0}").format(serialNumber))
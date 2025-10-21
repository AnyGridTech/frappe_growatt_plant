import { FrappeDoc } from "@anygridtech/frappe-types/client/frappe/core";

interface Device {
  deviceModel: string;
  serialNumber: string;
  status: string;
  deviceType: string;
  // Add other device properties as needed
}

interface ItemResponse {
  name: string;
}

interface PlantDoc extends FrappeDoc {
  plant_name: string;
  plant_id: string;
  accountname: string;
  first_sn: string;
  equipamentos_ativos_na_planta: Array<EqpActiveDoc>;
  historico_de_equipamentos: Array<EqpHistoryDoc>;
}

interface InvoicesDoc extends FrappeDoc {
  operation_nature?: string;
  carrier?: string;
  modalidade_de_frete?: string;
  client_type?: string;
  contribuinte_icms?: string;
  state_tax_number?: string;
  nf_de_retorno?: string;
  nf_ref_serie?: string;
  nf_ref_numero?: string;
  nf_chave_de_acesso?: string;
  nome?: string;
  email?: string;
  telefone?: string;
  cpf?: string;
  cnpj?: string;
  items_section?: string;
  scan_barcode?: string;
  invoice_id?: string;
  invoice_link?: string;
  items: InvoiceItem[];
  total?: string;
  total_impostos?: string;
  collectguy?: string;
  cep?: string;
  address?: string;
  neighborhood?: string;
  ibge?: string;
  deliveryphone?: string;
  state?: string;
  city?: string;
  number_address?: string;
  complement?: string;
  small_text_cyhn?: string;
  errors_field?: string;
  internal_tab?: string;
  amended_from?: string;
}

interface InvoiceTaxesDoc extends FrappeDoc {
  base_calc_icms_fcp: number;
  icms_value_fcp: number;
  icms_value: number;
  cst_icms: string;
  base_calc_icms: number;
  aliq_icms: number;
  aliq_fcp: number;
  calcular_automaticamente_icms: number;
  adiciona_outras_despesas_icms: number;
  adiciona_frete_icms: number;
  adiciona_ipi_icms: number;
  adiciona_seguro_icms: number;
  aplicar_aliq_auto_icms: number;
  mod_base_calc_icms_trib: string;
  base_icms_trib: number;
  mva_trib: number;
  credito_trib: number;
  reducao_trib: number;
  adiciona_outras_despesas_trib: number;
  adiciona_frete_trib: number;
  adiciona_ipi_trib: number;
  adiciona_seguro_trib: number;
  valor_da_base_de_calculo_icms_no_destino: number;
  aliq_do_icms_do_estado_de_destino: number;
  aliq_do_icms_interestadual: number;
  valor_da_base_de_calculo_fcp_na_uf_destino: number;
  valor_icms_inter_puf_de_destino_difal: number;
  aliq_fundo_pobre: number;
  cst_ipi: string;
  base_de_calculo_ipi: number;
  valor_do_ipi: number;
  cod_enquadramento: number;
  aliquota_ipi: number;
  calcular_automaticamente_ipi: number;
  cst_cofins: string;
  base_de_calculo_cofins: number;
  valor_cofins: number;
  aliquota_cofins: number;
  calcular_automaticamente_cofins: number;
  cst_pis: string;
  base_de_calculo_pis: number;
  valor_pis: number;
  aliquota_pis: number;
  calcular_automaticamente_pis: number;
  main_base_calc: number;
  uf_origin: string;
  uf_destination: string;
  is_system: number;
  interstate_icms: number;
  standard_icms: number;
}
interface InvoiceItem extends FrappeDoc {
  name: string;
  docstatus: number;
  idx: number;
  serial_no: string;
  item_code: string;
  invoice_taxes: string;
  item_name: string;
  rate: number;
  amount: number;
  ncm: string;
  doctype: string;
  rate_taxes: number;
}

interface GetPlantInfo {
  plantId: string;
  accountName: string;
  plantName: string;
}

interface EqpActiveDoc extends FrappeDoc {
  serial_number: string;
  model: string;
  datalogger_sn: string;
  status?: string;
  parent?: string;
}

interface EqpHistoryDoc extends FrappeDoc {
  serial_number: string;
  model: string;
  datalogger_sn: string;
}

interface EqpActiveApi {
  serialNumber: string;
  deviceType: string;
  devicemodel: string;
  status?: string;
}

interface FullPlantDoc {
  name: string;
  equipamentos_ativos_na_planta: Array<EqpActiveDoc>;
}

interface DeviceData {
  deviceType: string;
  ptoStatus: string;
  timeServer: string;
  accountName: string;
  timezone: string;
  plantId: string;
  deviceTypeName: string;
  nominalPower: string;
  bdcStatus: string;
  eToday: string;
  eMonth: string;
  datalogTypeTest: string;
  eTotal: string;
  pac: string;
  datalogSn: string;
  alias: string;
  location: string;
  deviceModel: string;
  sn: string;
  plantName: string;
  status: string;
  lastUpdateTime: string;
}

interface ObjData {
  currPage: number;
  pages: number;
  pageSize: number;
  count: number;
  ind: number;
  datas: DeviceData[];
  notPager: boolean;
}

interface GetPlantResponse {
  result: number;
  obj: ObjData;
}

interface EventData {
  ptoStatus: string;
  bcFlag: string;
  addTime: string;
  accountName: string;
  timeServer: string;
  timezone: string;
  nominal_power: string;
  type: string;
  pac: string;
  eventSolution: string;
  eventTime: string;
  alias: string;
  tcp_server_ip: string;
  eventName: string;
  datalog_sn: string;
  selfDeviceType: string;
  eDischarge: string;
  signal: string;
  eventId: string;
  address: string;
  newDeviceType: string;
  eDischargeTotal: string;
  eCharge: string;
  plantId: string;
  deviceTypeName: string;
  eventType: string;
  eToday: string;
  eTotal: string;
  time: string;
  plantName: string;
  inverterId: string;
  status: string;
  serverId: string;
  serverUrl: string;
  accountNameEncryption: string;
}

interface ObjEvent {
  [key: string]: EventData[];
}

interface SearchInverterResponse {
  result: number;
  obj: ObjEvent;
}

export interface PurchaseOrder {
  id: number;
  product_type: "liter" | "gallon";
  customer_name: string;
  quantity: number;
  notes: string | null;
  production_status: "pending" | "in_production" | "completed";
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface Supply {
  id: number;
  material: "pet" | "pta" | "eg";
  quantity: number;
  supplier_name: string | null;
  tracking_number: string | null;
  eta: string | null;
  order_status: "ordered" | "received";
  created_at: string;
  received_at: string | null;
}

export type ScheduleStatus = "on_track" | "delay_expected" | "unable_to_fulfill";

export interface ScheduledOrder {
  id: number;
  product_type: "liter" | "gallon";
  customer_name: string;
  quantity: number;
  notes: string | null;
  created_at: string;
  expectedStart: string | null;
  expectedCompletion: string | null;
  scheduleStatus: ScheduleStatus;
}

export interface CurrentOrder {
  id: number;
  product_type: "liter" | "gallon";
  customer_name: string;
  quantity: number;
  notes: string | null;
  created_at: string;
  started_at: string;
  expectedCompletion: string;
}

export interface LineStatus {
  currentOrder: CurrentOrder | null;
  upcomingOrders: ScheduledOrder[];
}

export interface ProductionStatusResponse {
  lines: {
    liter: LineStatus;
    gallon: LineStatus;
  };
}

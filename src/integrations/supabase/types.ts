export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      attendance_incentives: {
        Row: {
          amount: number
          condition: string | null
          created_at: string
          id: string
          name: string
          rule_id: string
        }
        Insert: {
          amount?: number
          condition?: string | null
          created_at?: string
          id?: string
          name: string
          rule_id: string
        }
        Update: {
          amount?: number
          condition?: string | null
          created_at?: string
          id?: string
          name?: string
          rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_incentives_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "attendance_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_logs: {
        Row: {
          batch_id: string | null
          client_name: string | null
          clock_in: string | null
          clock_out: string | null
          created_at: string
          driver_code: string | null
          duration_minutes: number | null
          id: string
          is_absent: boolean
          is_late: boolean
          log_date: string
          rider_id: string | null
        }
        Insert: {
          batch_id?: string | null
          client_name?: string | null
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          driver_code?: string | null
          duration_minutes?: number | null
          id?: string
          is_absent?: boolean
          is_late?: boolean
          log_date: string
          rider_id?: string | null
        }
        Update: {
          batch_id?: string | null
          client_name?: string | null
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          driver_code?: string | null
          duration_minutes?: number | null
          id?: string
          is_absent?: boolean
          is_late?: boolean
          log_date?: string
          rider_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_logs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "upload_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_rules: {
        Row: {
          absent_penalty: number
          active: boolean
          client_id: string | null
          clockin_time: string
          created_at: string
          daily_base_fee: number
          id: string
          late_penalty: number
          late_tolerance_minutes: number
          min_duration_minutes: number
          name: string
          updated_at: string
        }
        Insert: {
          absent_penalty?: number
          active?: boolean
          client_id?: string | null
          clockin_time?: string
          created_at?: string
          daily_base_fee?: number
          id?: string
          late_penalty?: number
          late_tolerance_minutes?: number
          min_duration_minutes?: number
          name: string
          updated_at?: string
        }
        Update: {
          absent_penalty?: number
          active?: boolean
          client_id?: string | null
          clockin_time?: string
          created_at?: string
          daily_base_fee?: number
          id?: string
          late_penalty?: number
          late_tolerance_minutes?: number
          min_duration_minutes?: number
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_rules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          active: boolean
          address: string | null
          code: string
          contact_person: string | null
          created_at: string
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          code: string
          contact_person?: string | null
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          code?: string
          contact_person?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      deduction_types: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          id: string
          installmentable: boolean
          name: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          id?: string
          installmentable?: boolean
          name: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          installmentable?: boolean
          name?: string
        }
        Relationships: []
      }
      delivery_records: {
        Row: {
          awb: string | null
          batch_id: string | null
          client_id: string | null
          created_at: string
          dash_delivery_id: string | null
          delivery_date: string
          destination_address: string | null
          distance_km: number | null
          district: string | null
          driver_code: string | null
          fee: number
          id: string
          provider_order_id: string | null
          receiver_name: string | null
          rider_id: string | null
          service_type: string | null
          weight_kg: number | null
        }
        Insert: {
          awb?: string | null
          batch_id?: string | null
          client_id?: string | null
          created_at?: string
          dash_delivery_id?: string | null
          delivery_date: string
          destination_address?: string | null
          distance_km?: number | null
          district?: string | null
          driver_code?: string | null
          fee?: number
          id?: string
          provider_order_id?: string | null
          receiver_name?: string | null
          rider_id?: string | null
          service_type?: string | null
          weight_kg?: number | null
        }
        Update: {
          awb?: string | null
          batch_id?: string | null
          client_id?: string | null
          created_at?: string
          dash_delivery_id?: string | null
          delivery_date?: string
          destination_address?: string | null
          distance_km?: number | null
          district?: string | null
          driver_code?: string | null
          fee?: number
          id?: string
          provider_order_id?: string | null
          receiver_name?: string | null
          rider_id?: string | null
          service_type?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_records_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "upload_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_records_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_records_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_details: {
        Row: {
          base_amount: number
          calculation_type: string | null
          client_id: string
          component_label: string | null
          created_at: string
          detail_breakdown: Json | null
          id: string
          invoice_date: string
          rider_id: string | null
          surcharge_amount: number
          total_amount: number
          upload_batch_id: string | null
        }
        Insert: {
          base_amount?: number
          calculation_type?: string | null
          client_id: string
          component_label?: string | null
          created_at?: string
          detail_breakdown?: Json | null
          id?: string
          invoice_date: string
          rider_id?: string | null
          surcharge_amount?: number
          total_amount?: number
          upload_batch_id?: string | null
        }
        Update: {
          base_amount?: number
          calculation_type?: string | null
          client_id?: string
          component_label?: string | null
          created_at?: string
          detail_breakdown?: Json | null
          id?: string
          invoice_date?: string
          rider_id?: string | null
          surcharge_amount?: number
          total_amount?: number
          upload_batch_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_details_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_details_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_details_upload_batch_id_fkey"
            columns: ["upload_batch_id"]
            isOneToOne: false
            referencedRelation: "upload_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_deductions: {
        Row: {
          amount: number
          created_at: string
          deduction_type_id: string | null
          description: string | null
          detail_id: string
          id: string
          installment_id: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          deduction_type_id?: string | null
          description?: string | null
          detail_id: string
          id?: string
          installment_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          deduction_type_id?: string | null
          description?: string | null
          detail_id?: string
          id?: string
          installment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_deductions_deduction_type_id_fkey"
            columns: ["deduction_type_id"]
            isOneToOne: false
            referencedRelation: "deduction_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_deductions_detail_id_fkey"
            columns: ["detail_id"]
            isOneToOne: false
            referencedRelation: "payroll_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_deductions_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "rider_installments"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_details: {
        Row: {
          attendance_fee: number
          client_id: string | null
          created_at: string
          delivery_count: number
          delivery_fee: number
          gross_earning: number
          id: string
          incentive: number
          net_pay: number
          penalty: number
          rider_id: string
          run_id: string
          total_deduction: number
        }
        Insert: {
          attendance_fee?: number
          client_id?: string | null
          created_at?: string
          delivery_count?: number
          delivery_fee?: number
          gross_earning?: number
          id?: string
          incentive?: number
          net_pay?: number
          penalty?: number
          rider_id: string
          run_id: string
          total_deduction?: number
        }
        Update: {
          attendance_fee?: number
          client_id?: string | null
          created_at?: string
          delivery_count?: number
          delivery_fee?: number
          gross_earning?: number
          id?: string
          incentive?: number
          net_pay?: number
          penalty?: number
          rider_id?: string
          run_id?: string
          total_deduction?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_details_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_details_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_details_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          created_at: string
          created_by: string | null
          finalized_at: string | null
          id: string
          name: string
          period_end: string
          period_start: string
          period_type: Database["public"]["Enums"]["period_type"]
          published_at: string | null
          status: Database["public"]["Enums"]["payroll_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          finalized_at?: string | null
          id?: string
          name: string
          period_end: string
          period_start: string
          period_type?: Database["public"]["Enums"]["period_type"]
          published_at?: string | null
          status?: Database["public"]["Enums"]["payroll_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          finalized_at?: string | null
          id?: string
          name?: string
          period_end?: string
          period_start?: string
          period_type?: Database["public"]["Enums"]["period_type"]
          published_at?: string | null
          status?: Database["public"]["Enums"]["payroll_status"]
          updated_at?: string
        }
        Relationships: []
      }
      payslips: {
        Row: {
          data: Json
          detail_id: string
          id: string
          published_at: string
          rider_id: string
          run_id: string
        }
        Insert: {
          data?: Json
          detail_id: string
          id?: string
          published_at?: string
          rider_id: string
          run_id: string
        }
        Update: {
          data?: Json
          detail_id?: string
          id?: string
          published_at?: string
          rider_id?: string
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payslips_detail_id_fkey"
            columns: ["detail_id"]
            isOneToOne: true
            referencedRelation: "payroll_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          employee_id: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          employee_id?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          employee_id?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      rider_installments: {
        Row: {
          active: boolean
          created_at: string
          deduction_type_id: string
          id: string
          installment_count: number
          installments_paid: number
          next_deduction_date: string | null
          notes: string | null
          per_period_amount: number
          rider_id: string
          start_date: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          deduction_type_id: string
          id?: string
          installment_count?: number
          installments_paid?: number
          next_deduction_date?: string | null
          notes?: string | null
          per_period_amount: number
          rider_id: string
          start_date?: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          deduction_type_id?: string
          id?: string
          installment_count?: number
          installments_paid?: number
          next_deduction_date?: string | null
          notes?: string | null
          per_period_amount?: number
          rider_id?: string
          start_date?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rider_installments_deduction_type_id_fkey"
            columns: ["deduction_type_id"]
            isOneToOne: false
            referencedRelation: "deduction_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_installments_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
        ]
      }
      riders: {
        Row: {
          bank_account: string | null
          bank_name: string | null
          client_id: string | null
          created_at: string
          email: string | null
          employee_id: string
          full_name: string
          id: string
          join_date: string | null
          notes: string | null
          phone: string | null
          status: Database["public"]["Enums"]["rider_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          bank_account?: string | null
          bank_name?: string | null
          client_id?: string | null
          created_at?: string
          email?: string | null
          employee_id: string
          full_name: string
          id?: string
          join_date?: string | null
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["rider_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          bank_account?: string | null
          bank_name?: string | null
          client_id?: string | null
          created_at?: string
          email?: string | null
          employee_id?: string
          full_name?: string
          id?: string
          join_date?: string | null
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["rider_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "riders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      upload_batches: {
        Row: {
          client_id: string | null
          created_at: string
          filename: string | null
          id: string
          kind: Database["public"]["Enums"]["upload_kind"]
          row_count: number
          uploaded_by: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          filename?: string | null
          id?: string
          kind: Database["public"]["Enums"]["upload_kind"]
          row_count?: number
          uploaded_by?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          filename?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["upload_kind"]
          row_count?: number
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "upload_batches_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "rider"
      payroll_status: "draft" | "finalized" | "published"
      period_type: "weekly" | "biweekly" | "monthly"
      rider_status: "active" | "inactive" | "pending_review" | "suspended"
      upload_kind: "delivery" | "attendance"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "rider"],
      payroll_status: ["draft", "finalized", "published"],
      period_type: ["weekly", "biweekly", "monthly"],
      rider_status: ["active", "inactive", "pending_review", "suspended"],
      upload_kind: ["delivery", "attendance"],
    },
  },
} as const

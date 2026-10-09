// Generated from the staging project (Supabase generate_typescript_types). Regenerate after every migration.
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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          at: string
          changes: Json
          id: number
          row_id: string
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          at?: string
          changes: Json
          id?: never
          row_id: string
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          at?: string
          changes?: Json
          id?: never
          row_id?: string
          table_name?: string
        }
        Relationships: []
      }
      attendance_media: {
        Row: {
          attendance_id: string
          selfie_in_path: string
          selfie_out_path: string | null
        }
        Insert: {
          attendance_id: string
          selfie_in_path: string
          selfie_out_path?: string | null
        }
        Update: {
          attendance_id?: string
          selfie_in_path?: string
          selfie_out_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_media_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: true
            referencedRelation: "attendances"
            referencedColumns: ["id"]
          },
        ]
      }
      attendances: {
        Row: {
          accuracy_m: number | null
          auto_closed: boolean
          clock_in_at: string
          clock_in_lat: number
          clock_in_lng: number
          clock_out_at: string | null
          clock_out_lat: number | null
          clock_out_lng: number | null
          distance_m: number | null
          geo_valid: boolean
          id: string
          late_min: number
          mocked: boolean
          received_at: string
          shift_id: string
          user_id: string
        }
        Insert: {
          accuracy_m?: number | null
          auto_closed?: boolean
          clock_in_at: string
          clock_in_lat: number
          clock_in_lng: number
          clock_out_at?: string | null
          clock_out_lat?: number | null
          clock_out_lng?: number | null
          distance_m?: number | null
          geo_valid?: boolean
          id: string
          late_min?: number
          mocked?: boolean
          received_at?: string
          shift_id: string
          user_id: string
        }
        Update: {
          accuracy_m?: number | null
          auto_closed?: boolean
          clock_in_at?: string
          clock_in_lat?: number
          clock_in_lng?: number
          clock_out_at?: string | null
          clock_out_lat?: number | null
          clock_out_lng?: number | null
          distance_m?: number | null
          geo_valid?: boolean
          id?: string
          late_min?: number
          mocked?: boolean
          received_at?: string
          shift_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendances_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: true
            referencedRelation: "billable_shifts"
            referencedColumns: ["shift_id"]
          },
          {
            foreignKeyName: "attendances_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: true
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          active: boolean
          created_at: string
          ends_on: string | null
          id: string
          kpi_fields: Json
          name: string
          starts_on: string
          type: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          ends_on?: string | null
          id: string
          kpi_fields?: Json
          name: string
          starts_on: string
          type: string
        }
        Update: {
          active?: boolean
          created_at?: string
          ends_on?: string | null
          id?: string
          kpi_fields?: Json
          name?: string
          starts_on?: string
          type?: string
        }
        Relationships: []
      }
      cities: {
        Row: {
          capability: string
          created_at: string
          id: string
          name: string
          province: string
          umk: number
        }
        Insert: {
          capability?: string
          created_at?: string
          id: string
          name: string
          province: string
          umk: number
        }
        Update: {
          capability?: string
          created_at?: string
          id?: string
          name?: string
          province?: string
          umk?: number
        }
        Relationships: []
      }
      client_errors: {
        Row: {
          app_version: string | null
          at: string
          context: string | null
          id: number
          message: string
          platform: string | null
          stack: string | null
          user_id: string | null
        }
        Insert: {
          app_version?: string | null
          at?: string
          context?: string | null
          id?: never
          message: string
          platform?: string | null
          stack?: string | null
          user_id?: string | null
        }
        Update: {
          app_version?: string | null
          at?: string
          context?: string | null
          id?: never
          message?: string
          platform?: string | null
          stack?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_errors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_reports: {
        Row: {
          generated_at: string
          published_at: string | null
          published_by: string | null
          report_date: string
          totals: Json
        }
        Insert: {
          generated_at?: string
          published_at?: string | null
          published_by?: string | null
          report_date: string
          totals: Json
        }
        Update: {
          generated_at?: string
          published_at?: string | null
          published_by?: string | null
          report_date?: string
          totals?: Json
        }
        Relationships: [
          {
            foreignKeyName: "daily_reports_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exceptions: {
        Row: {
          detail: string
          detected_at: string
          id: number
          note: string
          resolved_at: string | null
          resolved_by: string | null
          shift_id: string
          status: string
          type: string
        }
        Insert: {
          detail?: string
          detected_at?: string
          id?: never
          note?: string
          resolved_at?: string | null
          resolved_by?: string | null
          shift_id: string
          status?: string
          type: string
        }
        Update: {
          detail?: string
          detected_at?: string
          id?: never
          note?: string
          resolved_at?: string | null
          resolved_by?: string | null
          shift_id?: string
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "exceptions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exceptions_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "billable_shifts"
            referencedColumns: ["shift_id"]
          },
          {
            foreignKeyName: "exceptions_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_logs: {
        Row: {
          field_key: string
          id: string
          logged_at: string
          proof_path: string | null
          received_at: string
          shift_id: string
          spg_id: string
          value: number
        }
        Insert: {
          field_key: string
          id: string
          logged_at: string
          proof_path?: string | null
          received_at?: string
          shift_id: string
          spg_id: string
          value: number
        }
        Update: {
          field_key?: string
          id?: string
          logged_at?: string
          proof_path?: string | null
          received_at?: string
          shift_id?: string
          spg_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "kpi_logs_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "billable_shifts"
            referencedColumns: ["shift_id"]
          },
          {
            foreignKeyName: "kpi_logs_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_logs_spg_id_fkey"
            columns: ["spg_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      media_purge_queue: {
        Row: {
          bucket: string
          path: string
          queued_at: string
        }
        Insert: {
          bucket: string
          path: string
          queued_at?: string
        }
        Update: {
          bucket?: string
          path?: string
          queued_at?: string
        }
        Relationships: []
      }
      profile_contacts: {
        Row: {
          phone: string
          user_id: string
        }
        Insert: {
          phone: string
          user_id: string
        }
        Update: {
          phone?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_contacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          bpjs_registered: boolean
          city_id: string | null
          consent_at: string | null
          consent_version: string | null
          contract_type: string | null
          created_at: string
          documents_ok: boolean
          grade: string | null
          id: string
          name: string
          phone_ok: boolean
          photo_path: string | null
          role: string
          username: string
        }
        Insert: {
          active?: boolean
          bpjs_registered?: boolean
          city_id?: string | null
          consent_at?: string | null
          consent_version?: string | null
          contract_type?: string | null
          created_at?: string
          documents_ok?: boolean
          grade?: string | null
          id: string
          name: string
          phone_ok?: boolean
          photo_path?: string | null
          role?: string
          username: string
        }
        Update: {
          active?: boolean
          bpjs_registered?: boolean
          city_id?: string | null
          consent_at?: string | null
          consent_version?: string | null
          contract_type?: string | null
          created_at?: string
          documents_ok?: boolean
          grade?: string | null
          id?: string
          name?: string
          phone_ok?: boolean
          photo_path?: string | null
          role?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      replacements: {
        Row: {
          due_at: string
          filled_at: string | null
          filled_shift_id: string | null
          id: string
          original_shift_id: string
          reason: string
          requested_at: string
        }
        Insert: {
          due_at: string
          filled_at?: string | null
          filled_shift_id?: string | null
          id: string
          original_shift_id: string
          reason: string
          requested_at?: string
        }
        Update: {
          due_at?: string
          filled_at?: string | null
          filled_shift_id?: string | null
          id?: string
          original_shift_id?: string
          reason?: string
          requested_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "replacements_filled_shift_id_fkey"
            columns: ["filled_shift_id"]
            isOneToOne: false
            referencedRelation: "billable_shifts"
            referencedColumns: ["shift_id"]
          },
          {
            foreignKeyName: "replacements_filled_shift_id_fkey"
            columns: ["filled_shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replacements_original_shift_id_fkey"
            columns: ["original_shift_id"]
            isOneToOne: true
            referencedRelation: "billable_shifts"
            referencedColumns: ["shift_id"]
          },
          {
            foreignKeyName: "replacements_original_shift_id_fkey"
            columns: ["original_shift_id"]
            isOneToOne: true
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          campaign_id: string
          city_id: string
          created_at: string
          end_date: string
          grade: string
          headcount: number
          id: string
          notes: string
          package: string
          shift_hours: number
          sla_hiring_due: string | null
          staffed_at: string | null
          start_date: string
          status: string
          submitted_at: string
          submitted_by: string | null
          venue_id: string
        }
        Insert: {
          campaign_id: string
          city_id: string
          created_at?: string
          end_date: string
          grade: string
          headcount: number
          id: string
          notes?: string
          package: string
          shift_hours: number
          sla_hiring_due?: string | null
          staffed_at?: string | null
          start_date: string
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          venue_id: string
        }
        Update: {
          campaign_id?: string
          city_id?: string
          created_at?: string
          end_date?: string
          grade?: string
          headcount?: number
          id?: string
          notes?: string
          package?: string
          shift_hours?: number
          sla_hiring_due?: string | null
          staffed_at?: string | null
          start_date?: string
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "requests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      route_points: {
        Row: {
          attendance_id: string
          id: number
          lat: number
          lng: number
          recorded_at: string
          user_id: string
        }
        Insert: {
          attendance_id: string
          id?: never
          lat: number
          lng: number
          recorded_at: string
          user_id: string
        }
        Update: {
          attendance_id?: string
          id?: never
          lat?: number
          lng?: number
          recorded_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_points_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_points_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          created_at: string
          id: string
          overtime_hours: number
          planned_end: string
          planned_start: string
          replaces_shift_id: string | null
          request_id: string
          shift_date: string
          spg_id: string
          status: string
          validated_at: string | null
          validated_by: string | null
          venue_id: string
        }
        Insert: {
          created_at?: string
          id: string
          overtime_hours?: number
          planned_end: string
          planned_start: string
          replaces_shift_id?: string | null
          request_id: string
          shift_date: string
          spg_id: string
          status?: string
          validated_at?: string | null
          validated_by?: string | null
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          overtime_hours?: number
          planned_end?: string
          planned_start?: string
          replaces_shift_id?: string | null
          request_id?: string
          shift_date?: string
          spg_id?: string
          status?: string
          validated_at?: string | null
          validated_by?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_replaces_shift_id_fkey"
            columns: ["replaces_shift_id"]
            isOneToOne: false
            referencedRelation: "billable_shifts"
            referencedColumns: ["shift_id"]
          },
          {
            foreignKeyName: "shifts_replaces_shift_id_fkey"
            columns: ["replaces_shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "billable_shifts"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "shifts_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_spg_id_fkey"
            columns: ["spg_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      trainings: {
        Row: {
          campaign_id: string
          id: string
          passed_at: string
          recorded_by: string | null
          score: number | null
          spg_id: string
        }
        Insert: {
          campaign_id: string
          id: string
          passed_at?: string
          recorded_by?: string | null
          score?: number | null
          spg_id: string
        }
        Update: {
          campaign_id?: string
          id?: string
          passed_at?: string
          recorded_by?: string | null
          score?: number | null
          spg_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainings_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainings_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainings_spg_id_fkey"
            columns: ["spg_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          active_from: string | null
          active_to: string | null
          address: string
          city_id: string
          created_at: string
          created_by: string | null
          id: string
          lat: number
          lng: number
          name: string
          radius_m: number
        }
        Insert: {
          active_from?: string | null
          active_to?: string | null
          address?: string
          city_id: string
          created_at?: string
          created_by?: string | null
          id: string
          lat: number
          lng: number
          name: string
          radius_m?: number
        }
        Update: {
          active_from?: string | null
          active_to?: string | null
          address?: string
          city_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lat?: number
          lng?: number
          name?: string
          radius_m?: number
        }
        Relationships: [
          {
            foreignKeyName: "venues_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      billable_shifts: {
        Row: {
          city_id: string | null
          grade: string | null
          overtime_hours: number | null
          package: string | null
          request_id: string | null
          shift_date: string | null
          shift_hours: number | null
          shift_id: string | null
          spg_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requests_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_spg_id_fkey"
            columns: ["spg_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_working_days: {
        Args: { p_days: number; p_from: string }
        Returns: string
      }
      auto_close_attendances: { Args: never; Returns: number }
      build_daily_report: { Args: { p_date: string }; Returns: Json }
      can_monitor: { Args: never; Returns: boolean }
      current_city_id: { Args: never; Returns: string }
      current_role: { Args: never; Returns: string }
      detect_no_shows: { Args: never; Returns: number }
      grade_rank: { Args: { p: string }; Returns: number }
      haversine_m: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      is_field: { Args: never; Returns: boolean }
      is_ops: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      late_sync_after: { Args: never; Returns: string }
      late_threshold_min: { Args: never; Returns: number }
      live_positions: {
        Args: never
        Returns: {
          lat: number
          lng: number
          name: string
          recorded_at: string
          shift_id: string
          user_id: string
          venue_id: string
        }[]
      }
      max_offline_age: { Args: never; Returns: string }
      open_replacement: {
        Args: { p_reason: string; p_shift: string }
        Returns: string
      }
      publish_daily_report: { Args: { p_date: string }; Returns: undefined }
      purge_expired_personal_data: { Args: never; Returns: Json }
      raise_exception_row: {
        Args: { p_detail: string; p_shift: string; p_type: string }
        Returns: undefined
      }
      refresh_request_status: {
        Args: { p_request: string }
        Returns: undefined
      }
      resolve_exception: {
        Args: { p_id: number; p_note: string; p_status: string }
        Returns: undefined
      }
      retention_months: { Args: never; Returns: number }
      roll_request_status: { Args: never; Returns: number }
      shift_visible: { Args: { p_shift: string }; Returns: boolean }
      validate_shift: { Args: { p_shift: string }; Returns: undefined }
      wib: { Args: { ts: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

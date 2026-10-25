
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "auditor_appointments": {
                  Row: {
                    "appointing_set": (string)[],"appointment_seq": number,"fy": string,"person_id": string,"society_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "appointing_set": (string)[],"appointment_seq": number,"fy": string,"person_id": string,"society_id": string
                  }
                  Update: {
                    "appointing_set"?: (string)[],"appointment_seq"?: number,"fy"?: string,"person_id"?: string,"society_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "auditor_appointments_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "auditor_appointments_society_id_fkey"
      columns: ["society_id"]
isOneToOne: false
      referencedRelation: "societies"
      referencedColumns: ["id"]
    }
                  ]
                },"chain_entries": {
                  Row: {
                    "actor": string | null,"body": NonNullable<Json>,"entry_hash": string,"format_version": number,"kind": string,"prev_hash": string,"recorded_at": number,"sequence": number,"society_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor"?: string | null,"body": NonNullable<Json>,"entry_hash": string,"format_version"?: number,"kind": string,"prev_hash": string,"recorded_at": number,"sequence": number,"society_id": string
                  }
                  Update: {
                    "actor"?: string | null,"body"?: NonNullable<Json>,"entry_hash"?: string,"format_version"?: number,"kind"?: string,"prev_hash"?: string,"recorded_at"?: number,"sequence"?: number,"society_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "chain_entries_society_id_fkey"
      columns: ["society_id"]
isOneToOne: false
      referencedRelation: "societies"
      referencedColumns: ["id"]
    }
                  ]
                },"committee_seats": {
                  Row: {
                    "derived": boolean,"person_id": string,"role": string,"seated_seq": number,"society_id": string,"unseated_seq": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "derived"?: boolean,"person_id": string,"role": string,"seated_seq": number,"society_id": string,"unseated_seq"?: number | null
                  }
                  Update: {
                    "derived"?: boolean,"person_id"?: string,"role"?: string,"seated_seq"?: number,"society_id"?: string,"unseated_seq"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "committee_seats_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "committee_seats_society_id_fkey"
      columns: ["society_id"]
isOneToOne: false
      referencedRelation: "societies"
      referencedColumns: ["id"]
    }
                  ]
                },"flats": {
                  Row: {
                    "has_parking": boolean,"id": string,"joined_on": string,"label": string,"ordinal": number,"society_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "has_parking"?: boolean,"id"?: string,"joined_on"?: string,"label": string,"ordinal": number,"society_id": string
                  }
                  Update: {
                    "has_parking"?: boolean,"id"?: string,"joined_on"?: string,"label"?: string,"ordinal"?: number,"society_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "flats_society_id_fkey"
      columns: ["society_id"]
isOneToOne: false
      referencedRelation: "societies"
      referencedColumns: ["id"]
    }
                  ]
                },"mismatch_reports": {
                  Row: {
                    "anchor_hash": string | null,"anchor_seq": number | null,"handle": string,"id": number,"note": string | null,"opened_at": string,"served_hash": string | null,"society_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "anchor_hash"?: string | null,"anchor_seq"?: number | null,"handle": string,"id"?: never,"note"?: string | null,"opened_at"?: string,"served_hash"?: string | null,"society_id": string,"updated_at"?: string
                  }
                  Update: {
                    "anchor_hash"?: string | null,"anchor_seq"?: number | null,"handle"?: string,"id"?: never,"note"?: string | null,"opened_at"?: string,"served_hash"?: string | null,"society_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "mismatch_reports_society_id_fkey"
      columns: ["society_id"]
isOneToOne: false
      referencedRelation: "societies"
      referencedColumns: ["id"]
    }
                  ]
                },"people": {
                  Row: {
                    "auth_user_id": string | null,"created_at": string,"email": string,"full_name": string,"id": string,"phone": string | null,"society_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth_user_id"?: string | null,"created_at"?: string,"email": string,"full_name": string,"id"?: string,"phone"?: string | null,"society_id": string
                  }
                  Update: {
                    "auth_user_id"?: string | null,"created_at"?: string,"email"?: string,"full_name"?: string,"id"?: string,"phone"?: string | null,"society_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "people_society_id_fkey"
      columns: ["society_id"]
isOneToOne: false
      referencedRelation: "societies"
      referencedColumns: ["id"]
    }
                  ]
                },"seen": {
                  Row: {
                    "last_seen_seq": number,"person_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "last_seen_seq"?: number,"person_id": string
                  }
                  Update: {
                    "last_seen_seq"?: number,"person_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "seen_person_id_fkey"
      columns: ["person_id"]
isOneToOne: true
      referencedRelation: "people"
      referencedColumns: ["id"]
    }
                  ]
                },"societies": {
                  Row: {
                    "city": string | null,"committee_threshold": number | null,"created_at": string,"currency": string,"fy_start_month": number,"id": string,"name": string,"structuring_window_days": number
                  }
                  ComputedFields: never
                  Insert: {
                    "city"?: string | null,"committee_threshold"?: number | null,"created_at"?: string,"currency"?: string,"fy_start_month"?: number,"id": string,"name": string,"structuring_window_days"?: number
                  }
                  Update: {
                    "city"?: string | null,"committee_threshold"?: number | null,"created_at"?: string,"currency"?: string,"fy_start_month"?: number,"id"?: string,"name"?: string,"structuring_window_days"?: number
                  }
                  Relationships: [
                    
                  ]
                },"tenures": {
                  Row: {
                    "ends_on": string | null,"flat_id": string,"handle": string,"id": string,"kind": string,"parent_tenure_id": string | null,"person_id": string,"society_id": string,"starts_on": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ends_on"?: string | null,"flat_id": string,"handle": string,"id"?: string,"kind": string,"parent_tenure_id"?: string | null,"person_id": string,"society_id": string,"starts_on"?: string
                  }
                  Update: {
                    "ends_on"?: string | null,"flat_id"?: string,"handle"?: string,"id"?: string,"kind"?: string,"parent_tenure_id"?: string | null,"person_id"?: string,"society_id"?: string,"starts_on"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tenures_flat_id_fkey"
      columns: ["flat_id"]
isOneToOne: false
      referencedRelation: "flat_dues"
      referencedColumns: ["flat_id"]
    },{
      foreignKeyName: "tenures_flat_id_fkey"
      columns: ["flat_id"]
isOneToOne: false
      referencedRelation: "flats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tenures_parent_tenure_id_fkey"
      columns: ["parent_tenure_id"]
isOneToOne: false
      referencedRelation: "tenures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tenures_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tenures_society_id_fkey"
      columns: ["society_id"]
isOneToOne: false
      referencedRelation: "societies"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "disputes": {
                  Row: {
                    "counterparty": string | null,"handle": string | null,"is_open": boolean | null,"notes": Json | null,"period": string | null,"recorded_at": number | null,"scope": string | null,"seq": number | null,"society_id": string | null,"target_seqs": Json | null,"text": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "counterparty"?: never,"handle"?: string | null,"is_open"?: never,"notes"?: never,"period"?: never,"recorded_at"?: number | null,"scope"?: never,"seq"?: number | null,"society_id"?: string | null,"target_seqs"?: never,"text"?: never
                         }
                        Update: {
                           "counterparty"?: never,"handle"?: string | null,"is_open"?: never,"notes"?: never,"period"?: never,"recorded_at"?: number | null,"scope"?: never,"seq"?: number | null,"society_id"?: string | null,"target_seqs"?: never,"text"?: never
                         }
                        Relationships: [
                    {
      foreignKeyName: "chain_entries_society_id_fkey"
      columns: ["society_id"]
isOneToOne: false
      referencedRelation: "societies"
      referencedColumns: ["id"]
    }
                  ]
                },"flat_dues": {
                  Row: {
                    "charged_minor": number | null,"flat_id": string | null,"has_parking": boolean | null,"label": string | null,"ordinal": number | null,"outstanding_minor": number | null,"paid_minor": number | null,"society_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "flats_society_id_fkey"
      columns: ["society_id"]
isOneToOne: false
      referencedRelation: "societies"
      referencedColumns: ["id"]
    }
                  ]
                },"ledger": {
                  Row: {
                    "action": string | null,"amount_minor": number | null,"balance_minor": number | null,"business_date": string | null,"category": string | null,"counterparty": string | null,"currency": string | null,"effect": string | null,"fingerprint": string | null,"flat_id": string | null,"flat_set": string | null,"is_cash": boolean | null,"limit_minor": number | null,"narration": string | null,"origin_effect": string | null,"proposal_seq": number | null,"proposed_by": string | null,"reason": string | null,"recorded_at": number | null,"replaces_seq": number | null,"required": number | null,"reversed_by_seq": number | null,"reverses_seq": number | null,"seq": number | null,"society_id": string | null,"tier": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "chain_entries_society_id_fkey"
      columns: ["society_id"]
isOneToOne: false
      referencedRelation: "societies"
      referencedColumns: ["id"]
    }
                  ]
                },"proposals": {
                  Row: {
                    "action": string | null,"amount_minor": number | null,"approvals": Json | null,"approve_count": number | null,"business_date": string | null,"category": string | null,"counterparty": string | null,"currency": string | null,"decline_count": number | null,"flat_count": number | null,"flat_id": string | null,"flat_set": string | null,"fy": string | null,"limit_minor": number | null,"narration": string | null,"person": string | null,"posted_seq": number | null,"proposed_by": string | null,"reason": string | null,"recorded_at": number | null,"replacement_amount_minor": number | null,"required": number | null,"role": string | null,"seated": number | null,"seq": number | null,"society_id": string | null,"state": string | null,"status": string | null,"target_seq": number | null,"tier": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "chain_entries_society_id_fkey"
      columns: ["society_id"]
isOneToOne: false
      referencedRelation: "societies"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "api_add_person":
{ Args: { "p_email": string,"p_name": string,"p_phone"?: string,"p_society": string }; Returns: string
                           },
"api_add_tenure":
{ Args: { "p_flat": string,"p_kind": string,"p_person": string,"p_society": string,"p_starts"?: string }; Returns: string
                           },
"api_cast":
{ Args: { "p_decision": string,"p_key_seq": number,"p_seq": number,"p_signature": string,"p_society": string,"p_user": string }; Returns: Json
                           },
"api_cast_intent":
{ Args: { "p_decision": string,"p_seq": number,"p_society": string,"p_user": string }; Returns: Json
                           },
"api_close_intent":
{ Args: { "p_fy": string,"p_opinion": string,"p_society": string,"p_statement": string,"p_user": string }; Returns: Json
                           },
"api_close_tenure":
{ Args: { "p_ends"?: string,"p_society": string,"p_tenure": string }; Returns: undefined
                           },
"api_close_year":
{ Args: { "p_fy": string,"p_key_seq": number,"p_opinion": string,"p_signature": string,"p_society": string,"p_statement": string,"p_through_seq": number,"p_user": string }; Returns: number
                           },
"api_flag_note":
{ Args: { "p_flag_seq": number,"p_note": string,"p_society": string,"p_text": string }; Returns: number
                           },
"api_head":
{ Args: { "p_society": string }; Returns: Json
                           },
"api_mark_seen":
{ Args: { "p_seq": number,"p_society": string }; Returns: undefined
                           },
"api_me":
{ Args: { "p_society"?: string }; Returns: Json
                           },
"api_my_tenant_flags":
{ Args: { "p_society": string }; Returns: number[]
                           },
"api_open_society":
{ Args: { "p": Json }; Returns: string
                           },
"api_preview_charge":
{ Args: { "p_flat_set": string,"p_society": string,"p_total": number }; Returns: Json
                           },
"api_propose":
{ Args: { "p": Json,"p_society": string,"p_user": string }; Returns: Json
                           },
"api_raise_flag":
{ Args: { "p": Json,"p_society": string }; Returns: number
                           },
"api_register_key":
{ Args: { "p_public_key": string,"p_society": string,"p_user": string }; Returns: number
                           },
"api_report":
{ Args: { "p_fy": string,"p_society": string }; Returns: Json
                           },
"api_report_mismatch":
{ Args: { "p_anchor_hash": string,"p_anchor_seq": number,"p_note": string,"p_served_hash": string,"p_society": string }; Returns: undefined
                           },
"api_resolve_handle":
{ Args: { "p_handle": string,"p_society": string }; Returns: Json
                           },
"api_signoff":
{ Args: { "p_key_seq": number,"p_month": string,"p_note": string,"p_signature": string,"p_society": string,"p_through_seq": number,"p_user": string }; Returns: number
                           },
"api_signoff_intent":
{ Args: { "p_month": string,"p_society": string,"p_user": string }; Returns: Json
                           },
"api_structuring":
{ Args: { "p_society": string }; Returns: Json
                           },
"api_summary":
{ Args: { "p_society": string }; Returns: Json
                           },
"api_withdraw":
{ Args: { "p_seq": number,"p_society": string }; Returns: Json
                           },
"api_years":
{ Args: { "p_society": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const

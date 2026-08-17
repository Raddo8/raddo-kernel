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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      _grant_rollback_20260729: {
        Row: {
          stmt: string | null
        }
        Insert: {
          stmt?: string | null
        }
        Update: {
          stmt?: string | null
        }
        Relationships: []
      }
      _grant_snapshot_20260729: {
        Row: {
          grantee: string | null
          privilege_type: string | null
          snapped_at: string | null
          table_name: string | null
        }
        Insert: {
          grantee?: string | null
          privilege_type?: string | null
          snapped_at?: string | null
          table_name?: string | null
        }
        Update: {
          grantee?: string | null
          privilege_type?: string | null
          snapped_at?: string | null
          table_name?: string | null
        }
        Relationships: []
      }
      access_codes: {
        Row: {
          claimed_at: string | null
          claimed_by: string | null
          claimed_email: string | null
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          grants: string
          issued_to: string | null
          label: string | null
          max_uses: number
          redemption_policy: string | null
          revoked: boolean
          uses: number
        }
        Insert: {
          claimed_at?: string | null
          claimed_by?: string | null
          claimed_email?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          grants?: string
          issued_to?: string | null
          label?: string | null
          max_uses?: number
          redemption_policy?: string | null
          revoked?: boolean
          uses?: number
        }
        Update: {
          claimed_at?: string | null
          claimed_by?: string | null
          claimed_email?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          grants?: string
          issued_to?: string | null
          label?: string | null
          max_uses?: number
          redemption_policy?: string | null
          revoked?: boolean
          uses?: number
        }
        Relationships: []
      }
      accounts: {
        Row: {
          billing_mode: string
          created_at: string
          id: string
          metadata: Json | null
          name: string
          primary_contact_id: string | null
          status: string | null
          stripe_customer_id: string | null
          type: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          billing_mode?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          name: string
          primary_contact_id?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          type?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          billing_mode?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          name?: string
          primary_contact_id?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          type?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      action_responses: {
        Row: {
          action_id: string
          created_at: string
          expires_at: string
          id: string
          item_ref: string
          metadata: Json | null
          options: Json
          selected_option: string | null
          submitted_at: string | null
          token_hash: string
          workspace_id: string
        }
        Insert: {
          action_id: string
          created_at?: string
          expires_at: string
          id?: string
          item_ref: string
          metadata?: Json | null
          options?: Json
          selected_option?: string | null
          submitted_at?: string | null
          token_hash: string
          workspace_id: string
        }
        Update: {
          action_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          item_ref?: string
          metadata?: Json | null
          options?: Json
          selected_option?: string | null
          submitted_at?: string | null
          token_hash?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_responses_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: true
            referencedRelation: "actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_responses_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      actions: {
        Row: {
          actor_user_id: string | null
          channel: string | null
          claimed_at: string | null
          claimed_by: string | null
          contact_id: string | null
          created_at: string
          executed_at: string | null
          id: string
          idempotency_key: string | null
          item_id: string
          payload_json: Json | null
          playbook_step_id: string | null
          provider: string | null
          provider_message_id: string | null
          requires_approval: boolean
          result_json: Json | null
          scheduled_for: string | null
          source: string
          status: Database["public"]["Enums"]["action_status"]
          template_id: string | null
          trigger_state: string | null
          type: string
          workspace_id: string
        }
        Insert: {
          actor_user_id?: string | null
          channel?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          contact_id?: string | null
          created_at?: string
          executed_at?: string | null
          id?: string
          idempotency_key?: string | null
          item_id: string
          payload_json?: Json | null
          playbook_step_id?: string | null
          provider?: string | null
          provider_message_id?: string | null
          requires_approval?: boolean
          result_json?: Json | null
          scheduled_for?: string | null
          source?: string
          status?: Database["public"]["Enums"]["action_status"]
          template_id?: string | null
          trigger_state?: string | null
          type: string
          workspace_id: string
        }
        Update: {
          actor_user_id?: string | null
          channel?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          contact_id?: string | null
          created_at?: string
          executed_at?: string | null
          id?: string
          idempotency_key?: string | null
          item_id?: string
          payload_json?: Json | null
          playbook_step_id?: string | null
          provider?: string | null
          provider_message_id?: string | null
          requires_approval?: boolean
          result_json?: Json | null
          scheduled_for?: string | null
          source?: string
          status?: Database["public"]["Enums"]["action_status"]
          template_id?: string | null
          trigger_state?: string | null
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "actions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_playbook_step_id_fkey"
            columns: ["playbook_step_id"]
            isOneToOne: false
            referencedRelation: "playbook_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_access: {
        Row: {
          access_id: string
          action: string
          at: string
          detail: Json | null
          operator: string | null
          operator_email: string | null
          target_cid: string
        }
        Insert: {
          access_id?: string
          action: string
          at?: string
          detail?: Json | null
          operator?: string | null
          operator_email?: string | null
          target_cid: string
        }
        Update: {
          access_id?: string
          action?: string
          at?: string
          detail?: Json | null
          operator?: string | null
          operator_email?: string | null
          target_cid?: string
        }
        Relationships: []
      }
      approval_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          item_id: string
          kind: string
          note: string | null
          payload: Json
          requested_by: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          item_id: string
          kind: string
          note?: string | null
          payload?: Json
          requested_by?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          item_id?: string
          kind?: string
          note?: string | null
          payload?: Json
          requested_by?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      authority_access_receipts: {
        Row: {
          action: string
          caller_auth_user_id: string | null
          caller_label: string
          decision: string
          first_seen_at: string
          last_seen_at: string
          ledger_fleet_role: string | null
          ledger_granted_at: string | null
          ledger_present: boolean
          ledger_status: string | null
          reason: string | null
          receipt_id: string
          sightings: number
          target_cid: string
        }
        Insert: {
          action: string
          caller_auth_user_id?: string | null
          caller_label: string
          decision: string
          first_seen_at?: string
          last_seen_at?: string
          ledger_fleet_role?: string | null
          ledger_granted_at?: string | null
          ledger_present: boolean
          ledger_status?: string | null
          reason?: string | null
          receipt_id?: string
          sightings?: number
          target_cid: string
        }
        Update: {
          action?: string
          caller_auth_user_id?: string | null
          caller_label?: string
          decision?: string
          first_seen_at?: string
          last_seen_at?: string
          ledger_fleet_role?: string | null
          ledger_granted_at?: string | null
          ledger_present?: boolean
          ledger_status?: string | null
          reason?: string | null
          receipt_id?: string
          sightings?: number
          target_cid?: string
        }
        Relationships: []
      }
      authority_secdef_register: {
        Row: {
          bucket: string
          callers: string | null
          classified_at: string
          deferred_reason: string | null
          fn_args: string
          fn_name: string
          reachable_anon: boolean | null
          reachable_auth: boolean | null
          reason: string | null
          remediated: boolean
          remediation: string | null
          synced_at: string
          trigger_bound: boolean | null
        }
        Insert: {
          bucket?: string
          callers?: string | null
          classified_at?: string
          deferred_reason?: string | null
          fn_args: string
          fn_name: string
          reachable_anon?: boolean | null
          reachable_auth?: boolean | null
          reason?: string | null
          remediated?: boolean
          remediation?: string | null
          synced_at?: string
          trigger_bound?: boolean | null
        }
        Update: {
          bucket?: string
          callers?: string | null
          classified_at?: string
          deferred_reason?: string | null
          fn_args?: string
          fn_name?: string
          reachable_anon?: boolean | null
          reachable_auth?: boolean | null
          reason?: string | null
          remediated?: boolean
          remediation?: string | null
          synced_at?: string
          trigger_bound?: boolean | null
        }
        Relationships: []
      }
      blueprints: {
        Row: {
          cid: string | null
          cid_quarantine_reason: string | null
          created_at: string
          current_state: string | null
          goal_id: string | null
          id: string
          intent: string | null
          loop_cadence: string | null
          milestones: Json | null
          next_action: string | null
          owner: string | null
          status: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          cid?: string | null
          cid_quarantine_reason?: string | null
          created_at?: string
          current_state?: string | null
          goal_id?: string | null
          id?: string
          intent?: string | null
          loop_cadence?: string | null
          milestones?: Json | null
          next_action?: string | null
          owner?: string | null
          status?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          cid?: string | null
          cid_quarantine_reason?: string | null
          created_at?: string
          current_state?: string | null
          goal_id?: string | null
          id?: string
          intent?: string | null
          loop_cadence?: string | null
          milestones?: Json | null
          next_action?: string | null
          owner?: string | null
          status?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant_id?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "blueprints_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      boot_log: {
        Row: {
          booted_at: string
          cid: string | null
          cid_quarantine_reason: string | null
          fallback_used: boolean
          id: string
          kernel_version: number | null
          meta: Json | null
          surface: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id: string
        }
        Insert: {
          booted_at?: string
          cid?: string | null
          cid_quarantine_reason?: string | null
          fallback_used?: boolean
          id?: string
          kernel_version?: number | null
          meta?: Json | null
          surface?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id: string
        }
        Update: {
          booted_at?: string
          cid?: string | null
          cid_quarantine_reason?: string | null
          fallback_used?: boolean
          id?: string
          kernel_version?: number | null
          meta?: Json | null
          surface?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant_id?: string
        }
        Relationships: []
      }
      boot_source_register: {
        Row: {
          boot_relationship: string
          classification_basis: string | null
          classified_at: string | null
          classified_by: string | null
          failure_behavior: string | null
          first_seen_at: string
          freshness_proof: string | null
          notes: string | null
          plane: string
          ratified_at: string | null
          ratified_by: string | null
          reader: string | null
          required: boolean | null
          supersession_role: string | null
          system_role: string
          table_name: string
          tenant_column: string | null
          watermark_column: string | null
          writer: string | null
        }
        Insert: {
          boot_relationship?: string
          classification_basis?: string | null
          classified_at?: string | null
          classified_by?: string | null
          failure_behavior?: string | null
          first_seen_at?: string
          freshness_proof?: string | null
          notes?: string | null
          plane?: string
          ratified_at?: string | null
          ratified_by?: string | null
          reader?: string | null
          required?: boolean | null
          supersession_role?: string | null
          system_role?: string
          table_name: string
          tenant_column?: string | null
          watermark_column?: string | null
          writer?: string | null
        }
        Update: {
          boot_relationship?: string
          classification_basis?: string | null
          classified_at?: string | null
          classified_by?: string | null
          failure_behavior?: string | null
          first_seen_at?: string
          freshness_proof?: string | null
          notes?: string | null
          plane?: string
          ratified_at?: string | null
          ratified_by?: string | null
          reader?: string | null
          required?: boolean | null
          supersession_role?: string | null
          system_role?: string
          table_name?: string
          tenant_column?: string | null
          watermark_column?: string | null
          writer?: string | null
        }
        Relationships: []
      }
      bridge_deliveries: {
        Row: {
          attempt_no: number
          attempted_at: string
          cid: string
          delivery_id: string
          error: string | null
          outcome: string
          run_id: string
          slack_ts: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          attempt_no: number
          attempted_at?: string
          cid?: string
          delivery_id?: string
          error?: string | null
          outcome: string
          run_id: string
          slack_ts?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          attempt_no?: number
          attempted_at?: string
          cid?: string
          delivery_id?: string
          error?: string | null
          outcome?: string
          run_id?: string
          slack_ts?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: [
          {
            foreignKeyName: "bridge_deliveries_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "bridge_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      bridge_events: {
        Row: {
          attempt_count: number
          channel_id: string
          cid: string
          claimed_at: string | null
          event_id: string
          event_type: string
          id: string
          last_error: string | null
          message_ts: string
          payload: Json
          processed_at: string | null
          received_at: string
          slack_user_id: string | null
          status: string
          target_agent: string | null
          team_id: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          thread_ts: string | null
        }
        Insert: {
          attempt_count?: number
          channel_id: string
          cid?: string
          claimed_at?: string | null
          event_id: string
          event_type: string
          id?: string
          last_error?: string | null
          message_ts: string
          payload: Json
          processed_at?: string | null
          received_at?: string
          slack_user_id?: string | null
          status?: string
          target_agent?: string | null
          team_id: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          thread_ts?: string | null
        }
        Update: {
          attempt_count?: number
          channel_id?: string
          cid?: string
          claimed_at?: string | null
          event_id?: string
          event_type?: string
          id?: string
          last_error?: string | null
          message_ts?: string
          payload?: Json
          processed_at?: string | null
          received_at?: string
          slack_user_id?: string | null
          status?: string
          target_agent?: string | null
          team_id?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          thread_ts?: string | null
        }
        Relationships: []
      }
      bridge_limits: {
        Row: {
          breach_action: string
          enforced_by: string
          limit_name: string
          limit_value: number
          set_at: string
          set_by: string
          unit: string
        }
        Insert: {
          breach_action: string
          enforced_by: string
          limit_name: string
          limit_value: number
          set_at?: string
          set_by: string
          unit: string
        }
        Update: {
          breach_action?: string
          enforced_by?: string
          limit_name?: string
          limit_value?: number
          set_at?: string
          set_by?: string
          unit?: string
        }
        Relationships: []
      }
      bridge_model_prices: {
        Row: {
          effective_from: string
          input_usd_per_1k: number
          model: string
          output_usd_per_1k: number
          provider: string
          registered_by: string
          source: string
        }
        Insert: {
          effective_from: string
          input_usd_per_1k: number
          model: string
          output_usd_per_1k: number
          provider: string
          registered_by: string
          source: string
        }
        Update: {
          effective_from?: string
          input_usd_per_1k?: number
          model?: string
          output_usd_per_1k?: number
          provider?: string
          registered_by?: string
          source?: string
        }
        Relationships: []
      }
      bridge_runs: {
        Row: {
          agent: string
          agent_tenant: string
          cid: string
          completed_at: string | null
          cost_usd: number | null
          created_at: string
          error: string | null
          event_id: string
          input_watermark: string
          kernel_version: number
          latency_ms: number | null
          model: string
          packet_id: string | null
          price_effective_from: string
          provider: string
          provider_response_id: string | null
          request_message_ts: string
          response_text: string | null
          run_id: string
          status: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          agent: string
          agent_tenant: string
          cid?: string
          completed_at?: string | null
          cost_usd?: number | null
          created_at?: string
          error?: string | null
          event_id: string
          input_watermark: string
          kernel_version: number
          latency_ms?: number | null
          model: string
          packet_id?: string | null
          price_effective_from: string
          provider: string
          provider_response_id?: string | null
          request_message_ts: string
          response_text?: string | null
          run_id?: string
          status: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          agent?: string
          agent_tenant?: string
          cid?: string
          completed_at?: string | null
          cost_usd?: number | null
          created_at?: string
          error?: string | null
          event_id?: string
          input_watermark?: string
          kernel_version?: number
          latency_ms?: number | null
          model?: string
          packet_id?: string | null
          price_effective_from?: string
          provider?: string
          provider_response_id?: string | null
          request_message_ts?: string
          response_text?: string | null
          run_id?: string
          status?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bridge_runs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "bridge_events"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "bridge_runs_price_registered"
            columns: ["provider", "model", "price_effective_from"]
            isOneToOne: false
            referencedRelation: "bridge_model_prices"
            referencedColumns: ["provider", "model", "effective_from"]
          },
        ]
      }
      bridge_senders: {
        Row: {
          added_at: string
          added_by: string
          enabled: boolean
          label: string
          may_invoke: string[]
          note: string | null
          slack_user_id: string
        }
        Insert: {
          added_at?: string
          added_by: string
          enabled?: boolean
          label: string
          may_invoke?: string[]
          note?: string | null
          slack_user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string
          enabled?: boolean
          label?: string
          may_invoke?: string[]
          note?: string | null
          slack_user_id?: string
        }
        Relationships: []
      }
      buddy_worklog: {
        Row: {
          blueprint_id: string | null
          body_md: string | null
          cid: string
          confidence_e: number | null
          confidence_r: number | null
          created_at: string
          id: string
          kind: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          blueprint_id?: string | null
          body_md?: string | null
          cid: string
          confidence_e?: number | null
          confidence_r?: number | null
          created_at?: string
          id?: string
          kind: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          blueprint_id?: string | null
          body_md?: string | null
          cid?: string
          confidence_e?: number | null
          confidence_r?: number | null
          created_at?: string
          id?: string
          kind?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: [
          {
            foreignKeyName: "buddy_worklog_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "hq_readiness"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "buddy_worklog_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "identity_census"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "buddy_worklog_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
          },
        ]
      }
      build_receipts: {
        Row: {
          build_id: string | null
          circuit: string
          created_at: string
          id: string
          legs_owed: number | null
          legs_passed: number | null
          owed_by: string | null
          probed_at: string | null
          status: string
          summary: string
        }
        Insert: {
          build_id?: string | null
          circuit: string
          created_at?: string
          id?: string
          legs_owed?: number | null
          legs_passed?: number | null
          owed_by?: string | null
          probed_at?: string | null
          status: string
          summary: string
        }
        Update: {
          build_id?: string | null
          circuit?: string
          created_at?: string
          id?: string
          legs_owed?: number | null
          legs_passed?: number | null
          owed_by?: string | null
          probed_at?: string | null
          status?: string
          summary?: string
        }
        Relationships: []
      }
      build_views: {
        Row: {
          build_id: string
          id: string
          ip: string | null
          opened_at: string
          ua: string | null
          viewer_email: string | null
        }
        Insert: {
          build_id: string
          id?: string
          ip?: string | null
          opened_at?: string
          ua?: string | null
          viewer_email?: string | null
        }
        Update: {
          build_id?: string
          id?: string
          ip?: string | null
          opened_at?: string
          ua?: string | null
          viewer_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "build_views_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["id"]
          },
        ]
      }
      builds: {
        Row: {
          access_mode: string
          client_id: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          preview_path: string | null
          recipient: string | null
          revoked: boolean
          storage_path: string
          sub_type: string
          title: string
          token: string
          updated_at: string
          version: number
        }
        Insert: {
          access_mode?: string
          client_id: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          preview_path?: string | null
          recipient?: string | null
          revoked?: boolean
          storage_path: string
          sub_type?: string
          title: string
          token: string
          updated_at?: string
          version?: number
        }
        Update: {
          access_mode?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          preview_path?: string | null
          recipient?: string | null
          revoked?: boolean
          storage_path?: string
          sub_type?: string
          title?: string
          token?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      bulletins: {
        Row: {
          action_md: string | null
          audience: string
          body_md: string | null
          cid: string | null
          created_at: string
          effective: string | null
          expires: string | null
          id: string
          occurred_at: string | null
          priority: string
          seen: boolean
          seen_at: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          title: string
          type: string
        }
        Insert: {
          action_md?: string | null
          audience?: string
          body_md?: string | null
          cid?: string | null
          created_at?: string
          effective?: string | null
          expires?: string | null
          id?: string
          occurred_at?: string | null
          priority?: string
          seen?: boolean
          seen_at?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          title: string
          type: string
        }
        Update: {
          action_md?: string | null
          audience?: string
          body_md?: string | null
          cid?: string | null
          created_at?: string
          effective?: string | null
          expires?: string | null
          id?: string
          occurred_at?: string | null
          priority?: string
          seen?: boolean
          seen_at?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulletins_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "hq_readiness"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "bulletins_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "identity_census"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "bulletins_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
          },
        ]
      }
      change_ledger: {
        Row: {
          actor: string | null
          actor_role: string | null
          after_row: Json | null
          at: string
          before_row: Json | null
          changed_fields: string[] | null
          cid: string | null
          ledger_id: number
          op: string
          pk_col: string | null
          reason: string | null
          reverted_by: number | null
          reverts: number | null
          row_pk: string
          session_ref: string | null
          table_name: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          actor?: string | null
          actor_role?: string | null
          after_row?: Json | null
          at?: string
          before_row?: Json | null
          changed_fields?: string[] | null
          cid?: string | null
          ledger_id?: number
          op: string
          pk_col?: string | null
          reason?: string | null
          reverted_by?: number | null
          reverts?: number | null
          row_pk: string
          session_ref?: string | null
          table_name: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          actor?: string | null
          actor_role?: string | null
          after_row?: Json | null
          at?: string
          before_row?: Json | null
          changed_fields?: string[] | null
          cid?: string | null
          ledger_id?: number
          op?: string
          pk_col?: string | null
          reason?: string | null
          reverted_by?: number | null
          reverts?: number | null
          row_pk?: string
          session_ref?: string | null
          table_name?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: [
          {
            foreignKeyName: "change_ledger_reverted_by_fkey"
            columns: ["reverted_by"]
            isOneToOne: false
            referencedRelation: "change_ledger"
            referencedColumns: ["ledger_id"]
          },
          {
            foreignKeyName: "change_ledger_reverts_fkey"
            columns: ["reverts"]
            isOneToOne: false
            referencedRelation: "change_ledger"
            referencedColumns: ["ledger_id"]
          },
        ]
      }
      change_log: {
        Row: {
          actor: string | null
          at: string
          change: string
          cid: string | null
          cid_quarantine_reason: string | null
          entity: string
          entity_id: string | null
          id: string
          summary: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id: string
        }
        Insert: {
          actor?: string | null
          at?: string
          change: string
          cid?: string | null
          cid_quarantine_reason?: string | null
          entity: string
          entity_id?: string | null
          id?: string
          summary?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id: string
        }
        Update: {
          actor?: string | null
          at?: string
          change?: string
          cid?: string | null
          cid_quarantine_reason?: string | null
          entity?: string
          entity_id?: string | null
          id?: string
          summary?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant_id?: string
        }
        Relationships: []
      }
      chat_leads: {
        Row: {
          challenge: string
          company: string
          created_at: string
          email: string
          id: string
          name: string
          referer: string | null
          session_id: string
          title: string
          user_agent: string | null
          voice: string | null
        }
        Insert: {
          challenge: string
          company: string
          created_at?: string
          email: string
          id?: string
          name: string
          referer?: string | null
          session_id: string
          title: string
          user_agent?: string | null
          voice?: string | null
        }
        Update: {
          challenge?: string
          company?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          referer?: string | null
          session_id?: string
          title?: string
          user_agent?: string | null
          voice?: string | null
        }
        Relationships: []
      }
      cid_t_apply_log: {
        Row: {
          applied: boolean
          at: string
          detail: string | null
          id: number
          table_name: string
        }
        Insert: {
          applied: boolean
          at?: string
          detail?: string | null
          id?: number
          table_name: string
        }
        Update: {
          applied?: boolean
          at?: string
          detail?: string | null
          id?: number
          table_name?: string
        }
        Relationships: []
      }
      claim_code: {
        Row: {
          cid: string
          claim_id: string
          code_id: string
          coded_at: string
          coded_by: string
          confidence: number | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          cid: string
          claim_id: string
          code_id: string
          coded_at?: string
          coded_by: string
          confidence?: number | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          cid?: string
          claim_id?: string
          code_id?: string
          coded_at?: string
          coded_by?: string
          confidence?: number | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: [
          {
            foreignKeyName: "claim_code_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "world_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_code_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "world_delta_v"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "claim_code_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "codebook"
            referencedColumns: ["code_id"]
          },
        ]
      }
      claim_ingest_key: {
        Row: {
          cid: string
          claim_id: string
          created_at: string
          fingerprint: string
          source_ref: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          cid: string
          claim_id: string
          created_at?: string
          fingerprint: string
          source_ref: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          cid?: string
          claim_id?: string
          created_at?: string
          fingerprint?: string
          source_ref?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: [
          {
            foreignKeyName: "claim_ingest_key_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "world_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_ingest_key_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "world_delta_v"
            referencedColumns: ["claim_id"]
          },
        ]
      }
      client_access_canary_result: {
        Row: {
          boot_detail: string | null
          boot_status: string
          checked_at: string
          cid: string
          cob_name: string | null
          result_id: string
          run_id: string
          transact_detail: string | null
          transact_status: string
          write_detail: string | null
          write_status: string | null
        }
        Insert: {
          boot_detail?: string | null
          boot_status: string
          checked_at?: string
          cid: string
          cob_name?: string | null
          result_id?: string
          run_id: string
          transact_detail?: string | null
          transact_status: string
          write_detail?: string | null
          write_status?: string | null
        }
        Update: {
          boot_detail?: string | null
          boot_status?: string
          checked_at?: string
          cid?: string
          cob_name?: string | null
          result_id?: string
          run_id?: string
          transact_detail?: string | null
          transact_status?: string
          write_detail?: string | null
          write_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_access_canary_result_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "client_access_canary_run"
            referencedColumns: ["run_id"]
          },
        ]
      }
      client_access_canary_run: {
        Row: {
          boot_ok: number
          failed: number
          label: string | null
          notes: string | null
          phase: string
          ran_at: string
          run_id: string
          tenants_total: number
          transact_ok: number
          unverified: number
          write_ok: number | null
        }
        Insert: {
          boot_ok?: number
          failed?: number
          label?: string | null
          notes?: string | null
          phase: string
          ran_at?: string
          run_id?: string
          tenants_total?: number
          transact_ok?: number
          unverified?: number
          write_ok?: number | null
        }
        Update: {
          boot_ok?: number
          failed?: number
          label?: string | null
          notes?: string | null
          phase?: string
          ran_at?: string
          run_id?: string
          tenants_total?: number
          transact_ok?: number
          unverified?: number
          write_ok?: number | null
        }
        Relationships: []
      }
      client_intake: {
        Row: {
          cid: string
          content_md: string
          id: string
          recorded_at: string
          source: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          topic: string
        }
        Insert: {
          cid: string
          content_md: string
          id?: string
          recorded_at?: string
          source: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          topic: string
        }
        Update: {
          cid?: string
          content_md?: string
          id?: string
          recorded_at?: string
          source?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          topic?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_intake_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "hq_readiness"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "client_intake_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "identity_census"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "client_intake_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
          },
        ]
      }
      code_redemptions: {
        Row: {
          auth_user_id: string
          cid: string | null
          code: string
          id: string
          redeemed_at: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          auth_user_id: string
          cid?: string | null
          code: string
          id?: string
          redeemed_at?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          auth_user_id?: string
          cid?: string | null
          code?: string
          id?: string
          redeemed_at?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: [
          {
            foreignKeyName: "code_redemptions_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "hq_readiness"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "code_redemptions_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "identity_census"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "code_redemptions_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "code_redemptions_code_fkey"
            columns: ["code"]
            isOneToOne: false
            referencedRelation: "access_codes"
            referencedColumns: ["code"]
          },
        ]
      }
      codebook: {
        Row: {
          category: string | null
          cid: string
          code: string
          code_id: string
          definition: string
          example_ref: string | null
          first_seen: string
          hits: number
          last_seen: string
          merged_into: string | null
          status: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          theme: string | null
        }
        Insert: {
          category?: string | null
          cid: string
          code: string
          code_id?: string
          definition: string
          example_ref?: string | null
          first_seen?: string
          hits?: number
          last_seen?: string
          merged_into?: string | null
          status?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          theme?: string | null
        }
        Update: {
          category?: string | null
          cid?: string
          code?: string
          code_id?: string
          definition?: string
          example_ref?: string | null
          first_seen?: string
          hits?: number
          last_seen?: string
          merged_into?: string | null
          status?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          theme?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "codebook_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "codebook"
            referencedColumns: ["code_id"]
          },
        ]
      }
      comms: {
        Row: {
          approved_at: string | null
          body_md: string
          channel: string
          cid: string
          comm_id: string
          created_at: string
          direction: string
          external_id: string | null
          external_url: string | null
          failed_reason: string | null
          occurred_at: string | null
          prepared_by: string | null
          sent_at: string | null
          state: string
          subject: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant: string | null
          to_whom: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          body_md: string
          channel: string
          cid: string
          comm_id?: string
          created_at?: string
          direction?: string
          external_id?: string | null
          external_url?: string | null
          failed_reason?: string | null
          occurred_at?: string | null
          prepared_by?: string | null
          sent_at?: string | null
          state?: string
          subject?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant?: string | null
          to_whom?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          body_md?: string
          channel?: string
          cid?: string
          comm_id?: string
          created_at?: string
          direction?: string
          external_id?: string | null
          external_url?: string | null
          failed_reason?: string | null
          occurred_at?: string | null
          prepared_by?: string | null
          sent_at?: string | null
          state?: string
          subject?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant?: string | null
          to_whom?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      connector_accounts: {
        Row: {
          account_id: string
          connector_id: string
          created_at: string
          external_id: string | null
          id: string
          metadata: Json | null
        }
        Insert: {
          account_id: string
          connector_id: string
          created_at?: string
          external_id?: string | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          account_id?: string
          connector_id?: string
          created_at?: string
          external_id?: string | null
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "connector_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connector_accounts_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "connectors"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_events: {
        Row: {
          cid: string
          client_id: string | null
          created_at: string
          detail: Json
          event: string
          id: string
          surface: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          cid: string
          client_id?: string | null
          created_at?: string
          detail?: Json
          event: string
          id?: string
          surface?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          cid?: string
          client_id?: string | null
          created_at?: string
          detail?: Json
          event?: string
          id?: string
          surface?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: [
          {
            foreignKeyName: "connector_events_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "hq_readiness"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "connector_events_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "identity_census"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "connector_events_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
          },
        ]
      }
      connector_installations: {
        Row: {
          authorized_at: string | null
          cid: string | null
          connector_server_id: string | null
          installation_id: string
          issuer: string | null
          last_used_at: string | null
          oauth_client_id: string | null
          principal_id: string | null
          scopes: string[]
          status: string
          surface: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          authorized_at?: string | null
          cid?: string | null
          connector_server_id?: string | null
          installation_id?: string
          issuer?: string | null
          last_used_at?: string | null
          oauth_client_id?: string | null
          principal_id?: string | null
          scopes?: string[]
          status?: string
          surface?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          authorized_at?: string | null
          cid?: string | null
          connector_server_id?: string | null
          installation_id?: string
          issuer?: string | null
          last_used_at?: string | null
          oauth_client_id?: string | null
          principal_id?: string | null
          scopes?: string[]
          status?: string
          surface?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: [
          {
            foreignKeyName: "connector_installations_principal_id_fkey"
            columns: ["principal_id"]
            isOneToOne: false
            referencedRelation: "principals"
            referencedColumns: ["principal_id"]
          },
        ]
      }
      connectors: {
        Row: {
          config: Json | null
          created_at: string
          id: string
          name: string
          type: string
          workspace_id: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          id?: string
          name: string
          type: string
          workspace_id: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          id?: string
          name?: string
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connectors_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      consult_submissions: {
        Row: {
          app_inventory: Json
          aspiration_state_words: Json
          challenge: string | null
          created_at: string
          current_state_words: Json
          disc_responses: Json
          disc_scores: Json
          email: string
          id: string
          is_hybrid: boolean
          name: string | null
          occupation: string | null
          other_apps_text: string | null
          persona_name_candidates: string[]
          phone: string | null
          primary_style: string
          research_brief: Json | null
          research_brief_present: boolean
          research_lookup_fired: boolean
          secondary_style: string
          theme_gap_analysis: Json
        }
        Insert: {
          app_inventory: Json
          aspiration_state_words: Json
          challenge?: string | null
          created_at?: string
          current_state_words: Json
          disc_responses: Json
          disc_scores: Json
          email: string
          id?: string
          is_hybrid?: boolean
          name?: string | null
          occupation?: string | null
          other_apps_text?: string | null
          persona_name_candidates?: string[]
          phone?: string | null
          primary_style: string
          research_brief?: Json | null
          research_brief_present?: boolean
          research_lookup_fired?: boolean
          secondary_style: string
          theme_gap_analysis: Json
        }
        Update: {
          app_inventory?: Json
          aspiration_state_words?: Json
          challenge?: string | null
          created_at?: string
          current_state_words?: Json
          disc_responses?: Json
          disc_scores?: Json
          email?: string
          id?: string
          is_hybrid?: boolean
          name?: string | null
          occupation?: string | null
          other_apps_text?: string | null
          persona_name_candidates?: string[]
          phone?: string | null
          primary_style?: string
          research_brief?: Json | null
          research_brief_present?: boolean
          research_lookup_fired?: boolean
          secondary_style?: string
          theme_gap_analysis?: Json
        }
        Relationships: []
      }
      contacts: {
        Row: {
          account_id: string
          created_at: string
          email: string | null
          email_verified: boolean
          id: string
          is_decision_maker: boolean
          linkedin_url: string | null
          metadata: Json | null
          name: string
          notes: string | null
          phone: string | null
          role: string | null
          source: string | null
          title: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          email?: string | null
          email_verified?: boolean
          id?: string
          is_decision_maker?: boolean
          linkedin_url?: string | null
          metadata?: Json | null
          name: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          source?: string | null
          title?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          email?: string | null
          email_verified?: boolean
          id?: string
          is_decision_maker?: boolean
          linkedin_url?: string | null
          metadata?: Json | null
          name?: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          source?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      correction_claims: {
        Row: {
          at: string
          cid: string
          claim_id: string
          correction_text: string
          declared_by: string
          overrides_tier: number
          status: string
          target: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          at?: string
          cid: string
          claim_id?: string
          correction_text: string
          declared_by: string
          overrides_tier: number
          status?: string
          target: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          at?: string
          cid?: string
          claim_id?: string
          correction_text?: string
          declared_by?: string
          overrides_tier?: number
          status?: string
          target?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: [
          {
            foreignKeyName: "correction_claims_overrides_tier_fkey"
            columns: ["overrides_tier"]
            isOneToOne: false
            referencedRelation: "doctrine_tiers"
            referencedColumns: ["tier"]
          },
        ]
      }
      council_minutes: {
        Row: {
          advisor: string | null
          chairs: Json | null
          cid: string | null
          completed_at: string | null
          convened_at: string
          cost_usd: number | null
          curn: string | null
          dissent_md: string | null
          eps: number | null
          error: string | null
          horizon: Json | null
          id: string
          lenses: Json | null
          minute: Json | null
          mode: string | null
          notes: Json
          question: string | null
          question_hash: string | null
          rho: number | null
          run_id: string | null
          session_id: string | null
          started_at: string
          status: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_label: string | null
          tool: string | null
          updated_at: string
          verdict_md: string | null
        }
        Insert: {
          advisor?: string | null
          chairs?: Json | null
          cid?: string | null
          completed_at?: string | null
          convened_at?: string
          cost_usd?: number | null
          curn?: string | null
          dissent_md?: string | null
          eps?: number | null
          error?: string | null
          horizon?: Json | null
          id?: string
          lenses?: Json | null
          minute?: Json | null
          mode?: string | null
          notes?: Json
          question?: string | null
          question_hash?: string | null
          rho?: number | null
          run_id?: string | null
          session_id?: string | null
          started_at?: string
          status?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_label?: string | null
          tool?: string | null
          updated_at?: string
          verdict_md?: string | null
        }
        Update: {
          advisor?: string | null
          chairs?: Json | null
          cid?: string | null
          completed_at?: string | null
          convened_at?: string
          cost_usd?: number | null
          curn?: string | null
          dissent_md?: string | null
          eps?: number | null
          error?: string | null
          horizon?: Json | null
          id?: string
          lenses?: Json | null
          minute?: Json | null
          mode?: string | null
          notes?: Json
          question?: string | null
          question_hash?: string | null
          rho?: number | null
          run_id?: string | null
          session_id?: string | null
          started_at?: string
          status?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant_label?: string | null
          tool?: string | null
          updated_at?: string
          verdict_md?: string | null
        }
        Relationships: []
      }
      curn_sequence: {
        Row: {
          cid: string
          kind: string
          last_value: number
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          updated_at: string
        }
        Insert: {
          cid: string
          kind: string
          last_value?: number
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          updated_at?: string
        }
        Update: {
          cid?: string
          kind?: string
          last_value?: number
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          updated_at?: string
        }
        Relationships: []
      }
      cutover_lease: {
        Row: {
          acquired_at: string
          cid: string
          drift_at_acquire: number | null
          drift_at_flip: number | null
          lease_id: string
          outcome: string | null
          register_key: string
          released_at: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          acquired_at?: string
          cid: string
          drift_at_acquire?: number | null
          drift_at_flip?: number | null
          lease_id?: string
          outcome?: string | null
          register_key: string
          released_at?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          acquired_at?: string
          cid?: string
          drift_at_acquire?: number | null
          drift_at_flip?: number | null
          lease_id?: string
          outcome?: string | null
          register_key?: string
          released_at?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: []
      }
      decisions: {
        Row: {
          authoritative: boolean
          authority_tier: string | null
          cid: string
          curn: string
          decided_at: string
          decided_by: string | null
          decision_md: string
          id: string
          minute_id: string | null
          provenance: string
          rationale_md: string | null
          reversibility: string | null
          source_session_id: string | null
          source_subject: string | null
          source_surface: string | null
          superseded_by: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          test_run_id: string | null
          title: string
          tool_version: string | null
          verification_state: string | null
        }
        Insert: {
          authoritative?: boolean
          authority_tier?: string | null
          cid: string
          curn: string
          decided_at?: string
          decided_by?: string | null
          decision_md: string
          id?: string
          minute_id?: string | null
          provenance?: string
          rationale_md?: string | null
          reversibility?: string | null
          source_session_id?: string | null
          source_subject?: string | null
          source_surface?: string | null
          superseded_by?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          test_run_id?: string | null
          title: string
          tool_version?: string | null
          verification_state?: string | null
        }
        Update: {
          authoritative?: boolean
          authority_tier?: string | null
          cid?: string
          curn?: string
          decided_at?: string
          decided_by?: string | null
          decision_md?: string
          id?: string
          minute_id?: string | null
          provenance?: string
          rationale_md?: string | null
          reversibility?: string | null
          source_session_id?: string | null
          source_subject?: string | null
          source_surface?: string | null
          superseded_by?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          test_run_id?: string | null
          title?: string
          tool_version?: string | null
          verification_state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "decisions_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "hq_readiness"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "decisions_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "identity_census"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "decisions_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "decisions_minute_id_fkey"
            columns: ["minute_id"]
            isOneToOne: false
            referencedRelation: "council_minutes"
            referencedColumns: ["id"]
          },
        ]
      }
      deletion_requests: {
        Row: {
          cid: string | null
          cid_quarantine_reason: string | null
          created_at: string
          id: string
          requested_by: string
          status: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id: string
        }
        Insert: {
          cid?: string | null
          cid_quarantine_reason?: string | null
          created_at?: string
          id?: string
          requested_by: string
          status?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id: string
        }
        Update: {
          cid?: string | null
          cid_quarantine_reason?: string | null
          created_at?: string
          id?: string
          requested_by?: string
          status?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deletion_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "onboarding_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      directive_log: {
        Row: {
          at: string
          cid: string
          directive_id: string | null
          id: string
          phase: string
          receipt_md: string | null
          rolled_back_at: string | null
          scope_checked: boolean | null
          signature_ok: boolean | null
          snapshot: Json | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          at?: string
          cid: string
          directive_id?: string | null
          id?: string
          phase: string
          receipt_md?: string | null
          rolled_back_at?: string | null
          scope_checked?: boolean | null
          signature_ok?: boolean | null
          snapshot?: Json | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          at?: string
          cid?: string
          directive_id?: string | null
          id?: string
          phase?: string
          receipt_md?: string | null
          rolled_back_at?: string | null
          scope_checked?: boolean | null
          signature_ok?: boolean | null
          snapshot?: Json | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: [
          {
            foreignKeyName: "directive_log_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "hq_readiness"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "directive_log_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "identity_census"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "directive_log_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
          },
        ]
      }
      directives: {
        Row: {
          cid: string | null
          confirmed_at: string | null
          created_at: string
          id: string
          occurred_at: string | null
          rank: number | null
          scope: string
          status: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id: string
          text: string
          title: string | null
          updated_at: string
        }
        Insert: {
          cid?: string | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          occurred_at?: string | null
          rank?: number | null
          scope?: string
          status?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id: string
          text: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          cid?: string | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          occurred_at?: string | null
          rank?: number | null
          scope?: string
          status?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant_id?: string
          text?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      display_name_allowlist: {
        Row: {
          added_at: string
          fn_name: string
          reason: string
        }
        Insert: {
          added_at?: string
          fn_name: string
          reason: string
        }
        Update: {
          added_at?: string
          fn_name?: string
          reason?: string
        }
        Relationships: []
      }
      doctrine_amendments: {
        Row: {
          action: string
          actor: string
          amendment_id: number
          at: string
          from_tier: number | null
          from_version: number | null
          provenance: string
          reason: string
          receipt: string | null
          rule_key: string | null
          to_tier: number | null
          to_version: number | null
        }
        Insert: {
          action: string
          actor: string
          amendment_id?: number
          at?: string
          from_tier?: number | null
          from_version?: number | null
          provenance?: string
          reason: string
          receipt?: string | null
          rule_key?: string | null
          to_tier?: number | null
          to_version?: number | null
        }
        Update: {
          action?: string
          actor?: string
          amendment_id?: number
          at?: string
          from_tier?: number | null
          from_version?: number | null
          provenance?: string
          reason?: string
          receipt?: string | null
          rule_key?: string | null
          to_tier?: number | null
          to_version?: number | null
        }
        Relationships: []
      }
      doctrine_publications: {
        Row: {
          at: string
          corpus: Json
          corpus_sha256: string
          note: string | null
          publication_id: string
          published_by: string
          rule_count: number
          tier0_count: number
        }
        Insert: {
          at?: string
          corpus: Json
          corpus_sha256: string
          note?: string | null
          publication_id?: string
          published_by: string
          rule_count: number
          tier0_count: number
        }
        Update: {
          at?: string
          corpus?: Json
          corpus_sha256?: string
          note?: string | null
          publication_id?: string
          published_by?: string
          rule_count?: number
          tier0_count?: number
        }
        Relationships: []
      }
      doctrine_rules: {
        Row: {
          added_at: string
          change_reason: string | null
          cid: string | null
          prior_tier: number | null
          ratification_receipt: string | null
          ratified_at: string | null
          ratified_by: string | null
          rule_id: string
          rule_key: string
          rule_text: string
          scope: string
          source: string
          status: string
          superseded_by: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tier: number
          version: number
        }
        Insert: {
          added_at?: string
          change_reason?: string | null
          cid?: string | null
          prior_tier?: number | null
          ratification_receipt?: string | null
          ratified_at?: string | null
          ratified_by?: string | null
          rule_id?: string
          rule_key: string
          rule_text: string
          scope?: string
          source: string
          status?: string
          superseded_by?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tier: number
          version?: number
        }
        Update: {
          added_at?: string
          change_reason?: string | null
          cid?: string | null
          prior_tier?: number | null
          ratification_receipt?: string | null
          ratified_at?: string | null
          ratified_by?: string | null
          rule_id?: string
          rule_key?: string
          rule_text?: string
          scope?: string
          source?: string
          status?: string
          superseded_by?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tier?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "doctrine_rules_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "doctrine_rules"
            referencedColumns: ["rule_id"]
          },
          {
            foreignKeyName: "doctrine_rules_tier_fkey"
            columns: ["tier"]
            isOneToOne: false
            referencedRelation: "doctrine_tiers"
            referencedColumns: ["tier"]
          },
        ]
      }
      doctrine_tiers: {
        Row: {
          description: string
          name: string
          overridable_by_client: boolean
          tier: number
          writable_by: string
        }
        Insert: {
          description: string
          name: string
          overridable_by_client: boolean
          tier: number
          writable_by: string
        }
        Update: {
          description?: string
          name?: string
          overridable_by_client?: boolean
          tier?: number
          writable_by?: string
        }
        Relationships: []
      }
      document_registry: {
        Row: {
          category: string | null
          cid: string
          created_at: string
          doc_id: string
          drift: string
          filename: string
          id: string
          install_sha256: string | null
          install_version: string | null
          last_checked: string | null
          observed_sha256: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          category?: string | null
          cid: string
          created_at?: string
          doc_id: string
          drift?: string
          filename: string
          id?: string
          install_sha256?: string | null
          install_version?: string | null
          last_checked?: string | null
          observed_sha256?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          category?: string | null
          cid?: string
          created_at?: string
          doc_id?: string
          drift?: string
          filename?: string
          id?: string
          install_sha256?: string | null
          install_version?: string | null
          last_checked?: string | null
          observed_sha256?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: [
          {
            foreignKeyName: "document_registry_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "hq_readiness"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "document_registry_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "identity_census"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "document_registry_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
          },
        ]
      }
      domain_taxonomy: {
        Row: {
          definition: string
          domain_key: string
          keywords: string[]
          label: string
          lights_with: string | null
          ordinal: number
          scope: string
        }
        Insert: {
          definition: string
          domain_key: string
          keywords?: string[]
          label: string
          lights_with?: string | null
          ordinal: number
          scope?: string
        }
        Update: {
          definition?: string
          domain_key?: string
          keywords?: string[]
          label?: string
          lights_with?: string | null
          ordinal?: number
          scope?: string
        }
        Relationships: []
      }
      entity_merge_log: {
        Row: {
          absorbed: string
          action: string
          actor: string
          at: string
          cid: string
          log_id: number
          pair_id: string | null
          reason: string | null
          survivor: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          absorbed: string
          action: string
          actor: string
          at?: string
          cid: string
          log_id?: number
          pair_id?: string | null
          reason?: string | null
          survivor: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          absorbed?: string
          action?: string
          actor?: string
          at?: string
          cid?: string
          log_id?: number
          pair_id?: string | null
          reason?: string | null
          survivor?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: []
      }
      entity_pair: {
        Row: {
          blocker: string
          cid: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          left_id: string
          llm_conf: number | null
          llm_verdict: string | null
          llm_why: string | null
          pair_id: string
          right_id: string
          rule_verdict: string | null
          shared_keys: Json
          sim_name: number | null
          state: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          blocker: string
          cid: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          left_id: string
          llm_conf?: number | null
          llm_verdict?: string | null
          llm_why?: string | null
          pair_id?: string
          right_id: string
          rule_verdict?: string | null
          shared_keys?: Json
          sim_name?: number | null
          state?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          blocker?: string
          cid?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          left_id?: string
          llm_conf?: number | null
          llm_verdict?: string | null
          llm_why?: string | null
          pair_id?: string
          right_id?: string
          rule_verdict?: string | null
          shared_keys?: Json
          sim_name?: number | null
          state?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: [
          {
            foreignKeyName: "entity_pair_left_id_fkey"
            columns: ["left_id"]
            isOneToOne: false
            referencedRelation: "entity_resolvable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_pair_left_id_fkey"
            columns: ["left_id"]
            isOneToOne: false
            referencedRelation: "world_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_pair_right_id_fkey"
            columns: ["right_id"]
            isOneToOne: false
            referencedRelation: "entity_resolvable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_pair_right_id_fkey"
            columns: ["right_id"]
            isOneToOne: false
            referencedRelation: "world_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_registry: {
        Row: {
          canonical_name: string
          confidence: number | null
          created_at: string
          identifiers: Json
          kind: string
          registry_id: string
          scope_cid: string
          updated_at: string
        }
        Insert: {
          canonical_name: string
          confidence?: number | null
          created_at?: string
          identifiers?: Json
          kind: string
          registry_id: string
          scope_cid: string
          updated_at?: string
        }
        Update: {
          canonical_name?: string
          confidence?: number | null
          created_at?: string
          identifiers?: Json
          kind?: string
          registry_id?: string
          scope_cid?: string
          updated_at?: string
        }
        Relationships: []
      }
      entity_registry_link: {
        Row: {
          cid: string
          confidence: number | null
          entity_id: string
          link_id: string
          linked_at: string
          linked_by: string
          registry_id: string
          review_status: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          cid: string
          confidence?: number | null
          entity_id: string
          link_id?: string
          linked_at?: string
          linked_by: string
          registry_id: string
          review_status?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          cid?: string
          confidence?: number | null
          entity_id?: string
          link_id?: string
          linked_at?: string
          linked_by?: string
          registry_id?: string
          review_status?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: [
          {
            foreignKeyName: "entity_registry_link_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entity_resolvable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_registry_link_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "world_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_registry_link_registry_id_fkey"
            columns: ["registry_id"]
            isOneToOne: false
            referencedRelation: "entity_registry"
            referencedColumns: ["registry_id"]
          },
        ]
      }
      envelope_ledger: {
        Row: {
          at: string
          commit_sha: string | null
          credits: number | null
          entry_id: number
          envelope_id: string
          evidence: string | null
          item: string
          outcome: string
        }
        Insert: {
          at?: string
          commit_sha?: string | null
          credits?: number | null
          entry_id?: number
          envelope_id: string
          evidence?: string | null
          item: string
          outcome: string
        }
        Update: {
          at?: string
          commit_sha?: string | null
          credits?: number | null
          entry_id?: number
          envelope_id?: string
          evidence?: string | null
          item?: string
          outcome?: string
        }
        Relationships: [
          {
            foreignKeyName: "envelope_ledger_envelope_id_fkey"
            columns: ["envelope_id"]
            isOneToOne: false
            referencedRelation: "execution_envelopes"
            referencedColumns: ["envelope_id"]
          },
        ]
      }
      execution_envelopes: {
        Row: {
          authorized_by: string
          budget_credits: number
          close_reason: string | null
          closed_at: string | null
          ends_at: string
          envelope_id: string
          excluded: string
          name: string
          scope: string
          spent_credits: number
          started_at: string
          status: string
          stop_conditions: string
          success_criteria: string
        }
        Insert: {
          authorized_by: string
          budget_credits: number
          close_reason?: string | null
          closed_at?: string | null
          ends_at: string
          envelope_id?: string
          excluded: string
          name: string
          scope: string
          spent_credits?: number
          started_at?: string
          status?: string
          stop_conditions: string
          success_criteria: string
        }
        Update: {
          authorized_by?: string
          budget_credits?: number
          close_reason?: string | null
          closed_at?: string | null
          ends_at?: string
          envelope_id?: string
          excluded?: string
          name?: string
          scope?: string
          spent_credits?: number
          started_at?: string
          status?: string
          stop_conditions?: string
          success_criteria?: string
        }
        Relationships: []
      }
      execution_receipts: {
        Row: {
          auth_mode: string | null
          authenticated_sub: string | null
          build_id: string | null
          canonical_refs: Json
          cid: string | null
          contract_ok: boolean
          contract_version: string
          correlation_id: string
          created_at: string
          declared_effects: Json
          duration_ms: number | null
          effects_catalog_version: string
          error_class: string | null
          id: string
          identity_candidates: Json | null
          identity_status: string | null
          notes: Json
          observed_effects: Json
          outcome: string
          request_id: string
          started_at: string | null
          surface: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_display: string | null
          tool: string
          tool_catalogued: boolean
          undeclared_effects: Json
        }
        Insert: {
          auth_mode?: string | null
          authenticated_sub?: string | null
          build_id?: string | null
          canonical_refs?: Json
          cid?: string | null
          contract_ok?: boolean
          contract_version: string
          correlation_id: string
          created_at?: string
          declared_effects?: Json
          duration_ms?: number | null
          effects_catalog_version: string
          error_class?: string | null
          id?: string
          identity_candidates?: Json | null
          identity_status?: string | null
          notes?: Json
          observed_effects?: Json
          outcome: string
          request_id: string
          started_at?: string | null
          surface?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_display?: string | null
          tool: string
          tool_catalogued?: boolean
          undeclared_effects?: Json
        }
        Update: {
          auth_mode?: string | null
          authenticated_sub?: string | null
          build_id?: string | null
          canonical_refs?: Json
          cid?: string | null
          contract_ok?: boolean
          contract_version?: string
          correlation_id?: string
          created_at?: string
          declared_effects?: Json
          duration_ms?: number | null
          effects_catalog_version?: string
          error_class?: string | null
          id?: string
          identity_candidates?: Json | null
          identity_status?: string | null
          notes?: Json
          observed_effects?: Json
          outcome?: string
          request_id?: string
          started_at?: string | null
          surface?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant_display?: string | null
          tool?: string
          tool_catalogued?: boolean
          undeclared_effects?: Json
        }
        Relationships: []
      }
      external_authority_references: {
        Row: {
          applies_to: string
          authority: string
          category: string
          citation: string | null
          note: string | null
          recognised_at: string
          recognised_by: string
          reference_id: string
          status: string
          title: string
        }
        Insert: {
          applies_to: string
          authority: string
          category: string
          citation?: string | null
          note?: string | null
          recognised_at?: string
          recognised_by: string
          reference_id?: string
          status?: string
          title: string
        }
        Update: {
          applies_to?: string
          authority?: string
          category?: string
          citation?: string | null
          note?: string | null
          recognised_at?: string
          recognised_by?: string
          reference_id?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      external_identities: {
        Row: {
          evidence: string | null
          first_seen_at: string
          identity_id: string
          issuer: string
          last_seen_at: string | null
          principal_id: string
          provider: string | null
          provider_subject: string
          status: string
          token_version: string | null
          verified_email: string | null
        }
        Insert: {
          evidence?: string | null
          first_seen_at?: string
          identity_id?: string
          issuer: string
          last_seen_at?: string | null
          principal_id: string
          provider?: string | null
          provider_subject: string
          status?: string
          token_version?: string | null
          verified_email?: string | null
        }
        Update: {
          evidence?: string | null
          first_seen_at?: string
          identity_id?: string
          issuer?: string
          last_seen_at?: string | null
          principal_id?: string
          provider?: string | null
          provider_subject?: string
          status?: string
          token_version?: string | null
          verified_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_identities_principal_id_fkey"
            columns: ["principal_id"]
            isOneToOne: false
            referencedRelation: "principals"
            referencedColumns: ["principal_id"]
          },
        ]
      }
      fleet_artifacts: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          approved_distribution_policy: string
          artifact_class: string
          artifact_id: string
          bytes: number | null
          cid: string | null
          content_hash: string | null
          created_at: string
          derived_from: string | null
          distribution_evidence: string | null
          distribution_verified_at: string | null
          observed_distribution_state: string
          rollback_target: string | null
          sensitivity: string
          source_id: string | null
          source_table: string | null
          status: string
          supersedes: string | null
          template_version: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_scope: string
          version: string | null
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          approved_distribution_policy?: string
          artifact_class: string
          artifact_id?: string
          bytes?: number | null
          cid?: string | null
          content_hash?: string | null
          created_at?: string
          derived_from?: string | null
          distribution_evidence?: string | null
          distribution_verified_at?: string | null
          observed_distribution_state?: string
          rollback_target?: string | null
          sensitivity?: string
          source_id?: string | null
          source_table?: string | null
          status?: string
          supersedes?: string | null
          template_version?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_scope: string
          version?: string | null
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          approved_distribution_policy?: string
          artifact_class?: string
          artifact_id?: string
          bytes?: number | null
          cid?: string | null
          content_hash?: string | null
          created_at?: string
          derived_from?: string | null
          distribution_evidence?: string | null
          distribution_verified_at?: string | null
          observed_distribution_state?: string
          rollback_target?: string | null
          sensitivity?: string
          source_id?: string | null
          source_table?: string | null
          status?: string
          supersedes?: string | null
          template_version?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant_scope?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_artifacts_derived_from_fkey"
            columns: ["derived_from"]
            isOneToOne: false
            referencedRelation: "fleet_artifacts"
            referencedColumns: ["artifact_id"]
          },
          {
            foreignKeyName: "fleet_artifacts_rollback_target_fkey"
            columns: ["rollback_target"]
            isOneToOne: false
            referencedRelation: "fleet_artifacts"
            referencedColumns: ["artifact_id"]
          },
          {
            foreignKeyName: "fleet_artifacts_supersedes_fkey"
            columns: ["supersedes"]
            isOneToOne: false
            referencedRelation: "fleet_artifacts"
            referencedColumns: ["artifact_id"]
          },
        ]
      }
      fleet_operators: {
        Row: {
          auth_user_id: string
          fleet_role: string
          granted_at: string
          granted_by: string | null
          revoked_at: string | null
          status: string
        }
        Insert: {
          auth_user_id: string
          fleet_role: string
          granted_at?: string
          granted_by?: string | null
          revoked_at?: string | null
          status?: string
        }
        Update: {
          auth_user_id?: string
          fleet_role?: string
          granted_at?: string
          granted_by?: string | null
          revoked_at?: string | null
          status?: string
        }
        Relationships: []
      }
      fleet_qa_scorecard: {
        Row: {
          audit_date: string | null
          audit_label: string | null
          cid: string | null
          client_label: string
          created_at: string
          migrated_from: string | null
          office_health: string | null
          open_issues: string | null
          operator_exceptions: string | null
          overall_grade: string | null
          profile_grade: string | null
          scorecard_id: string
          skill_versions: string | null
          source_ref: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          audit_date?: string | null
          audit_label?: string | null
          cid?: string | null
          client_label: string
          created_at?: string
          migrated_from?: string | null
          office_health?: string | null
          open_issues?: string | null
          operator_exceptions?: string | null
          overall_grade?: string | null
          profile_grade?: string | null
          scorecard_id?: string
          skill_versions?: string | null
          source_ref?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          audit_date?: string | null
          audit_label?: string | null
          cid?: string | null
          client_label?: string
          created_at?: string
          migrated_from?: string | null
          office_health?: string | null
          open_issues?: string | null
          operator_exceptions?: string | null
          overall_grade?: string | null
          profile_grade?: string | null
          scorecard_id?: string
          skill_versions?: string | null
          source_ref?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: []
      }
      fleet_skill_install: {
        Row: {
          cid: string | null
          client_label: string
          created_at: string
          install_id: string
          installed_at: string | null
          migrated_from: string | null
          note: string | null
          skill_key: string
          source_ref: string | null
          status: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          version: string | null
        }
        Insert: {
          cid?: string | null
          client_label: string
          created_at?: string
          install_id?: string
          installed_at?: string | null
          migrated_from?: string | null
          note?: string | null
          skill_key: string
          source_ref?: string | null
          status?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          version?: string | null
        }
        Update: {
          cid?: string | null
          client_label?: string
          created_at?: string
          install_id?: string
          installed_at?: string | null
          migrated_from?: string | null
          note?: string | null
          skill_key?: string
          source_ref?: string | null
          status?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          version?: string | null
        }
        Relationships: []
      }
      goals: {
        Row: {
          cid: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          priority: number | null
          status: string
          target_date: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id: string
          title: string
          updated_at: string
          value_pillar: string
          version: number
          why: string | null
        }
        Insert: {
          cid?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          priority?: number | null
          status?: string
          target_date?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id: string
          title: string
          updated_at?: string
          value_pillar: string
          version?: number
          why?: string | null
        }
        Update: {
          cid?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          priority?: number | null
          status?: string
          target_date?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant_id?: string
          title?: string
          updated_at?: string
          value_pillar?: string
          version?: number
          why?: string | null
        }
        Relationships: []
      }
      harden05_probe: {
        Row: {
          observed: string
          passed: boolean
          probe: string
          ran_at: string
        }
        Insert: {
          observed: string
          passed: boolean
          probe: string
          ran_at?: string
        }
        Update: {
          observed?: string
          passed?: boolean
          probe?: string
          ran_at?: string
        }
        Relationships: []
      }
      hq_action_request: {
        Row: {
          ack_at: string | null
          action: string
          cid: string
          fulfilled_at: string | null
          outcome: string | null
          params: Json
          receipt: Json | null
          request_id: string
          requested_at: string
          requested_by: string | null
          state: string
          surface: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          title: string | null
          updated_at: string
        }
        Insert: {
          ack_at?: string | null
          action: string
          cid: string
          fulfilled_at?: string | null
          outcome?: string | null
          params?: Json
          receipt?: Json | null
          request_id?: string
          requested_at?: string
          requested_by?: string | null
          state?: string
          surface?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          title?: string | null
          updated_at?: string
        }
        Update: {
          ack_at?: string | null
          action?: string
          cid?: string
          fulfilled_at?: string | null
          outcome?: string | null
          params?: Json
          receipt?: Json | null
          request_id?: string
          requested_at?: string
          requested_by?: string | null
          state?: string
          surface?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      hq_page: {
        Row: {
          default_enabled: boolean
          label: string
          nav_no: string | null
          note: string | null
          operator_only: boolean
          page_key: string
          route: string
          sort_order: number
        }
        Insert: {
          default_enabled?: boolean
          label: string
          nav_no?: string | null
          note?: string | null
          operator_only?: boolean
          page_key: string
          route: string
          sort_order?: number
        }
        Update: {
          default_enabled?: boolean
          label?: string
          nav_no?: string | null
          note?: string | null
          operator_only?: boolean
          page_key?: string
          route?: string
          sort_order?: number
        }
        Relationships: []
      }
      hq_page_entitlement: {
        Row: {
          cid: string
          enabled: boolean
          page_key: string
          reason: string | null
          set_at: string
          set_by: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          cid: string
          enabled: boolean
          page_key: string
          reason?: string | null
          set_at?: string
          set_by?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          cid?: string
          enabled?: boolean
          page_key?: string
          reason?: string | null
          set_at?: string
          set_by?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: [
          {
            foreignKeyName: "hq_page_entitlement_page_key_fkey"
            columns: ["page_key"]
            isOneToOne: false
            referencedRelation: "hq_page"
            referencedColumns: ["page_key"]
          },
        ]
      }
      identity_observations: {
        Row: {
          authorization_receipt: string | null
          authorized_at: string | null
          authorized_by: string | null
          call_count: number
          evidence: string
          first_seen_at: string
          issuer: string
          last_seen_at: string
          linked_principal_id: string | null
          observation_id: string
          provider_subject: string
          review_status: string
          surface: string | null
          tenant_claim: string | null
          token_version: string | null
          verified_email: string | null
        }
        Insert: {
          authorization_receipt?: string | null
          authorized_at?: string | null
          authorized_by?: string | null
          call_count?: number
          evidence: string
          first_seen_at?: string
          issuer: string
          last_seen_at?: string
          linked_principal_id?: string | null
          observation_id?: string
          provider_subject: string
          review_status?: string
          surface?: string | null
          tenant_claim?: string | null
          token_version?: string | null
          verified_email?: string | null
        }
        Update: {
          authorization_receipt?: string | null
          authorized_at?: string | null
          authorized_by?: string | null
          call_count?: number
          evidence?: string
          first_seen_at?: string
          issuer?: string
          last_seen_at?: string
          linked_principal_id?: string | null
          observation_id?: string
          provider_subject?: string
          review_status?: string
          surface?: string | null
          tenant_claim?: string | null
          token_version?: string | null
          verified_email?: string | null
        }
        Relationships: []
      }
      identity_resolution_log: {
        Row: {
          at: string
          canonical_cid: string | null
          canonical_membership_id: string | null
          canonical_principal_id: string | null
          id: string
          issuer: string | null
          legacy_cid: string | null
          legacy_keyed_by: string | null
          match_state: string
          provider_subject: string | null
          reason: string | null
          surface: string | null
          tenant_claim: string | null
          token_version: string | null
        }
        Insert: {
          at?: string
          canonical_cid?: string | null
          canonical_membership_id?: string | null
          canonical_principal_id?: string | null
          id?: string
          issuer?: string | null
          legacy_cid?: string | null
          legacy_keyed_by?: string | null
          match_state: string
          provider_subject?: string | null
          reason?: string | null
          surface?: string | null
          tenant_claim?: string | null
          token_version?: string | null
        }
        Update: {
          at?: string
          canonical_cid?: string | null
          canonical_membership_id?: string | null
          canonical_principal_id?: string | null
          id?: string
          issuer?: string | null
          legacy_cid?: string | null
          legacy_keyed_by?: string | null
          match_state?: string
          provider_subject?: string | null
          reason?: string | null
          surface?: string | null
          tenant_claim?: string | null
          token_version?: string | null
        }
        Relationships: []
      }
      improvement_signals: {
        Row: {
          audience: string
          authoritative: boolean
          caller: string | null
          cid: string
          classification: string | null
          curn: string
          detail_md: string | null
          elapsed_seconds: number | null
          failure_mode: string | null
          first_seen: string
          id: string
          last_seen: string
          pattern: string
          provenance: string
          recurrence: number
          sightings: number
          signal_key: string | null
          silent: boolean
          source_session_id: string | null
          source_subject: string | null
          source_surface: string | null
          status: string
          subject_tool: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          test_run_id: string | null
          tool_version: string | null
          transport_detail: string | null
          verification_state: string | null
        }
        Insert: {
          audience?: string
          authoritative?: boolean
          caller?: string | null
          cid: string
          classification?: string | null
          curn: string
          detail_md?: string | null
          elapsed_seconds?: number | null
          failure_mode?: string | null
          first_seen?: string
          id?: string
          last_seen?: string
          pattern: string
          provenance?: string
          recurrence?: number
          sightings?: number
          signal_key?: string | null
          silent?: boolean
          source_session_id?: string | null
          source_subject?: string | null
          source_surface?: string | null
          status?: string
          subject_tool?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          test_run_id?: string | null
          tool_version?: string | null
          transport_detail?: string | null
          verification_state?: string | null
        }
        Update: {
          audience?: string
          authoritative?: boolean
          caller?: string | null
          cid?: string
          classification?: string | null
          curn?: string
          detail_md?: string | null
          elapsed_seconds?: number | null
          failure_mode?: string | null
          first_seen?: string
          id?: string
          last_seen?: string
          pattern?: string
          provenance?: string
          recurrence?: number
          sightings?: number
          signal_key?: string | null
          silent?: boolean
          source_session_id?: string | null
          source_subject?: string | null
          source_surface?: string | null
          status?: string
          subject_tool?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          test_run_id?: string | null
          tool_version?: string | null
          transport_detail?: string | null
          verification_state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "improvement_signals_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "hq_readiness"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "improvement_signals_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "identity_census"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "improvement_signals_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
          },
        ]
      }
      incident_ledger: {
        Row: {
          cid: string
          client_ratified: boolean
          client_request_id: string | null
          closed_at: string | null
          incident_id: string
          item_id: string
          notes: string | null
          occurred_at: string | null
          opened_at: string
          persisted_records: Json | null
          receipt_outcome: string | null
          recovery_state: string
          requested_layers: Json | null
          session_id: string | null
          source_available: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          cid: string
          client_ratified?: boolean
          client_request_id?: string | null
          closed_at?: string | null
          incident_id: string
          item_id?: string
          notes?: string | null
          occurred_at?: string | null
          opened_at?: string
          persisted_records?: Json | null
          receipt_outcome?: string | null
          recovery_state?: string
          requested_layers?: Json | null
          session_id?: string | null
          source_available?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          cid?: string
          client_ratified?: boolean
          client_request_id?: string | null
          closed_at?: string | null
          incident_id?: string
          item_id?: string
          notes?: string | null
          occurred_at?: string | null
          opened_at?: string
          persisted_records?: Json | null
          receipt_outcome?: string | null
          recovery_state?: string
          requested_layers?: Json | null
          session_id?: string | null
          source_available?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: []
      }
      ingest_campaign: {
        Row: {
          cadence: string
          campaign_id: string
          cid: string
          created_at: string
          horizon_note: string | null
          items_done: number
          items_per_run: number | null
          label: string
          last_run_at: string | null
          measured_rate_per_hour: number | null
          minutes_per_run: number
          next_suggested_at: string | null
          ordering: string
          proving_runs_required: number
          rate_source: string | null
          runs_done: number
          status: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          total_estimate_basis: string | null
          total_estimated_items: number | null
          updated_at: string
        }
        Insert: {
          cadence?: string
          campaign_id?: string
          cid: string
          created_at?: string
          horizon_note?: string | null
          items_done?: number
          items_per_run?: number | null
          label: string
          last_run_at?: string | null
          measured_rate_per_hour?: number | null
          minutes_per_run?: number
          next_suggested_at?: string | null
          ordering?: string
          proving_runs_required?: number
          rate_source?: string | null
          runs_done?: number
          status?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          total_estimate_basis?: string | null
          total_estimated_items?: number | null
          updated_at?: string
        }
        Update: {
          cadence?: string
          campaign_id?: string
          cid?: string
          created_at?: string
          horizon_note?: string | null
          items_done?: number
          items_per_run?: number | null
          label?: string
          last_run_at?: string | null
          measured_rate_per_hour?: number | null
          minutes_per_run?: number
          next_suggested_at?: string | null
          ordering?: string
          proving_runs_required?: number
          rate_source?: string | null
          runs_done?: number
          status?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          total_estimate_basis?: string | null
          total_estimated_items?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      ingest_campaign_source: {
        Row: {
          campaign_id: string
          cid: string
          connect_state: string
          discovered_at: string
          discovery_state: string
          estimate_basis: string | null
          estimated_items: number | null
          items_done: number
          kind: string
          label: string
          source_key: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          updated_at: string
        }
        Insert: {
          campaign_id: string
          cid: string
          connect_state?: string
          discovered_at?: string
          discovery_state?: string
          estimate_basis?: string | null
          estimated_items?: number | null
          items_done?: number
          kind: string
          label: string
          source_key: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          cid?: string
          connect_state?: string
          discovered_at?: string
          discovery_state?: string
          estimate_basis?: string | null
          estimated_items?: number | null
          items_done?: number
          kind?: string
          label?: string
          source_key?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingest_campaign_source_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ingest_campaign"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      ingest_checkpoint: {
        Row: {
          items_done: number
          phase: string
          position: string
          program_id: string
          source_id: string
          updated_at: string
        }
        Insert: {
          items_done?: number
          phase: string
          position: string
          program_id: string
          source_id: string
          updated_at?: string
        }
        Update: {
          items_done?: number
          phase?: string
          position?: string
          program_id?: string
          source_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingest_checkpoint_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "ingest_program"
            referencedColumns: ["program_id"]
          },
          {
            foreignKeyName: "ingest_checkpoint_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "ingest_source"
            referencedColumns: ["source_id"]
          },
        ]
      }
      ingest_event: {
        Row: {
          at: string
          cid: string
          detail: Json
          event_id: number
          kind: string
          program_id: string | null
          session_ref: string | null
          source_id: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          unit_id: string | null
        }
        Insert: {
          at?: string
          cid: string
          detail?: Json
          event_id?: number
          kind: string
          program_id?: string | null
          session_ref?: string | null
          source_id?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          unit_id?: string | null
        }
        Update: {
          at?: string
          cid?: string
          detail?: Json
          event_id?: number
          kind?: string
          program_id?: string | null
          session_ref?: string | null
          source_id?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingest_event_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "ingest_program"
            referencedColumns: ["program_id"]
          },
        ]
      }
      ingest_program: {
        Row: {
          campaign_id: string | null
          cid: string
          completed_at: string | null
          created_at: string
          envelope_policy: Json
          items_done: number
          items_seen: number
          label: string
          ordering: string
          phase: string
          program_id: string
          started_at: string | null
          status: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          updated_at: string
        }
        Insert: {
          campaign_id?: string | null
          cid: string
          completed_at?: string | null
          created_at?: string
          envelope_policy?: Json
          items_done?: number
          items_seen?: number
          label: string
          ordering?: string
          phase?: string
          program_id?: string
          started_at?: string | null
          status?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          updated_at?: string
        }
        Update: {
          campaign_id?: string | null
          cid?: string
          completed_at?: string | null
          created_at?: string
          envelope_policy?: Json
          items_done?: number
          items_seen?: number
          label?: string
          ordering?: string
          phase?: string
          program_id?: string
          started_at?: string | null
          status?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingest_program_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ingest_campaign"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      ingest_run_receipt: {
        Row: {
          campaign_id: string
          cid: string
          claims_added: number
          dated_items_added: number
          entities_added: number
          finished_at: string
          headline: string | null
          items: number
          label: string | null
          minutes: number | null
          program_id: string | null
          receipt_id: string
          run_no: number
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          campaign_id: string
          cid: string
          claims_added?: number
          dated_items_added?: number
          entities_added?: number
          finished_at?: string
          headline?: string | null
          items?: number
          label?: string | null
          minutes?: number | null
          program_id?: string | null
          receipt_id?: string
          run_no: number
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          campaign_id?: string
          cid?: string
          claims_added?: number
          dated_items_added?: number
          entities_added?: number
          finished_at?: string
          headline?: string | null
          items?: number
          label?: string | null
          minutes?: number | null
          program_id?: string | null
          receipt_id?: string
          run_no?: number
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: [
          {
            foreignKeyName: "ingest_run_receipt_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ingest_campaign"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      ingest_schedule: {
        Row: {
          campaign_id: string
          cid: string
          consecutive_misses: number
          created_at: string
          days: string
          enabled: boolean
          external_ref: string | null
          last_confirmed_run: string | null
          local_tz: string
          minutes: number
          state: string
          surface_key: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          updated_at: string
          window_start: string
        }
        Insert: {
          campaign_id: string
          cid: string
          consecutive_misses?: number
          created_at?: string
          days?: string
          enabled?: boolean
          external_ref?: string | null
          last_confirmed_run?: string | null
          local_tz?: string
          minutes?: number
          state?: string
          surface_key?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          updated_at?: string
          window_start?: string
        }
        Update: {
          campaign_id?: string
          cid?: string
          consecutive_misses?: number
          created_at?: string
          days?: string
          enabled?: boolean
          external_ref?: string | null
          last_confirmed_run?: string | null
          local_tz?: string
          minutes?: number
          state?: string
          surface_key?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          updated_at?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingest_schedule_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "ingest_campaign"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "ingest_schedule_surface_key_fkey"
            columns: ["surface_key"]
            isOneToOne: false
            referencedRelation: "ingest_surface"
            referencedColumns: ["surface_key"]
          },
        ]
      }
      ingest_source: {
        Row: {
          auth_state: string
          cid: string
          created_at: string
          cursor: string | null
          discovered: number
          handle: string
          health: string
          kind: string
          last_seen_at: string | null
          program_id: string
          read_attempts: number
          read_failures: number
          source_id: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          throttle_hits: number
        }
        Insert: {
          auth_state?: string
          cid: string
          created_at?: string
          cursor?: string | null
          discovered?: number
          handle: string
          health?: string
          kind: string
          last_seen_at?: string | null
          program_id: string
          read_attempts?: number
          read_failures?: number
          source_id?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          throttle_hits?: number
        }
        Update: {
          auth_state?: string
          cid?: string
          created_at?: string
          cursor?: string | null
          discovered?: number
          handle?: string
          health?: string
          kind?: string
          last_seen_at?: string | null
          program_id?: string
          read_attempts?: number
          read_failures?: number
          source_id?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          throttle_hits?: number
        }
        Relationships: [
          {
            foreignKeyName: "ingest_source_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "ingest_program"
            referencedColumns: ["program_id"]
          },
        ]
      }
      ingest_surface: {
        Row: {
          can_run_unattended: boolean
          can_schedule: boolean
          label: string
          sort_order: number
          surface_key: string
          why: string
        }
        Insert: {
          can_run_unattended: boolean
          can_schedule: boolean
          label: string
          sort_order?: number
          surface_key: string
          why: string
        }
        Update: {
          can_run_unattended?: boolean
          can_schedule?: boolean
          label?: string
          sort_order?: number
          surface_key?: string
          why?: string
        }
        Relationships: []
      }
      ingest_unit: {
        Row: {
          attempts: number
          cid: string
          completed_at: string | null
          created_at: string
          idem_key: string
          item_count: number
          last_error: string | null
          lease_expires: string | null
          lease_holder: string | null
          payload: Json
          phase: string
          priority: number
          program_id: string
          seq: number | null
          source_id: string | null
          status: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          unit_id: string
        }
        Insert: {
          attempts?: number
          cid: string
          completed_at?: string | null
          created_at?: string
          idem_key: string
          item_count?: number
          last_error?: string | null
          lease_expires?: string | null
          lease_holder?: string | null
          payload?: Json
          phase: string
          priority?: number
          program_id: string
          seq?: number | null
          source_id?: string | null
          status?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          unit_id?: string
        }
        Update: {
          attempts?: number
          cid?: string
          completed_at?: string | null
          created_at?: string
          idem_key?: string
          item_count?: number
          last_error?: string | null
          lease_expires?: string | null
          lease_holder?: string | null
          payload?: Json
          phase?: string
          priority?: number
          program_id?: string
          seq?: number | null
          source_id?: string | null
          status?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingest_unit_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "ingest_program"
            referencedColumns: ["program_id"]
          },
          {
            foreignKeyName: "ingest_unit_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "ingest_source"
            referencedColumns: ["source_id"]
          },
        ]
      }
      intake_corrections: {
        Row: {
          cid: string
          claim: string
          corrected_to: string
          created_at: string
          declared_by: string
          id: string
          is_synthetic: boolean
          source_message_id: string | null
          source_surface: string
          status: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          cid: string
          claim: string
          corrected_to: string
          created_at?: string
          declared_by?: string
          id?: string
          is_synthetic?: boolean
          source_message_id?: string | null
          source_surface?: string
          status?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          cid?: string
          claim?: string
          corrected_to?: string
          created_at?: string
          declared_by?: string
          id?: string
          is_synthetic?: boolean
          source_message_id?: string | null
          source_surface?: string
          status?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_corrections_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "taylor_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_corrections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "onboarding_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_facts: {
        Row: {
          cid: string | null
          cid_quarantine_reason: string | null
          created_at: string
          fact: string
          id: string
          section: string | null
          source: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id: string
        }
        Insert: {
          cid?: string | null
          cid_quarantine_reason?: string | null
          created_at?: string
          fact: string
          id?: string
          section?: string | null
          source?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id: string
        }
        Update: {
          cid?: string | null
          cid_quarantine_reason?: string | null
          created_at?: string
          fact?: string
          id?: string
          section?: string | null
          source?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_facts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "onboarding_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_files: {
        Row: {
          cid: string | null
          cid_quarantine_reason: string | null
          file_name: string
          id: string
          kind: string
          size_bytes: number | null
          storage_path: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id: string
          uploaded_at: string
        }
        Insert: {
          cid?: string | null
          cid_quarantine_reason?: string | null
          file_name: string
          id?: string
          kind: string
          size_bytes?: number | null
          storage_path: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id: string
          uploaded_at?: string
        }
        Update: {
          cid?: string | null
          cid_quarantine_reason?: string | null
          file_name?: string
          id?: string
          kind?: string
          size_bytes?: number | null
          storage_path?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant_id?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_files_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "onboarding_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_state: {
        Row: {
          answer: string | null
          chapter: number
          cid: string | null
          cid_quarantine_reason: string | null
          created_at: string
          id: string
          question_key: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          answer?: string | null
          chapter: number
          cid?: string | null
          cid_quarantine_reason?: string | null
          created_at?: string
          id?: string
          question_key: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          answer?: string | null
          chapter?: number
          cid?: string | null
          cid_quarantine_reason?: string | null
          created_at?: string
          id?: string
          question_key?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_state_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "onboarding_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_keys: {
        Row: {
          created_at: string
          key_value: string
          name: string
        }
        Insert: {
          created_at?: string
          key_value?: string
          name: string
        }
        Update: {
          created_at?: string
          key_value?: string
          name?: string
        }
        Relationships: []
      }
      invoice_number_sequences: {
        Row: {
          last_number: number
          workspace_id: string
          year: number
        }
        Insert: {
          last_number?: number
          workspace_id: string
          year: number
        }
        Update: {
          last_number?: number
          workspace_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_number_sequences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          account_id: string
          billing_mode: string
          billing_period: string
          created_at: string
          created_by: string | null
          due_date: string
          id: string
          invoice_number: string
          issue_date: string
          line_items: Json
          notes: string | null
          paid_at: string | null
          paid_note: string | null
          paid_via: string | null
          status: string
          stripe_invoice_id: string | null
          stripe_invoice_pdf: string | null
          stripe_payment_link: string | null
          subtotal: number
          total: number
          updated_at: string
          void_reason: string | null
          workspace_id: string
        }
        Insert: {
          account_id: string
          billing_mode?: string
          billing_period: string
          created_at?: string
          created_by?: string | null
          due_date: string
          id?: string
          invoice_number: string
          issue_date?: string
          line_items?: Json
          notes?: string | null
          paid_at?: string | null
          paid_note?: string | null
          paid_via?: string | null
          status?: string
          stripe_invoice_id?: string | null
          stripe_invoice_pdf?: string | null
          stripe_payment_link?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
          void_reason?: string | null
          workspace_id: string
        }
        Update: {
          account_id?: string
          billing_mode?: string
          billing_period?: string
          created_at?: string
          created_by?: string | null
          due_date?: string
          id?: string
          invoice_number?: string
          issue_date?: string
          line_items?: Json
          notes?: string | null
          paid_at?: string | null
          paid_note?: string | null
          paid_via?: string | null
          status?: string
          stripe_invoice_id?: string | null
          stripe_invoice_pdf?: string | null
          stripe_payment_link?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
          void_reason?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      item_domain: {
        Row: {
          cid: string
          claim_id: string | null
          confidence: number | null
          domain_key: string
          memory_id: string | null
          routed_at: string
          routed_by: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          world_item_id: string | null
        }
        Insert: {
          cid: string
          claim_id?: string | null
          confidence?: number | null
          domain_key: string
          memory_id?: string | null
          routed_at?: string
          routed_by?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          world_item_id?: string | null
        }
        Update: {
          cid?: string
          claim_id?: string | null
          confidence?: number | null
          domain_key?: string
          memory_id?: string | null
          routed_at?: string
          routed_by?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          world_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_domain_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "world_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_domain_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "world_delta_v"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "item_domain_domain_key_fkey"
            columns: ["domain_key"]
            isOneToOne: false
            referencedRelation: "domain_taxonomy"
            referencedColumns: ["domain_key"]
          },
          {
            foreignKeyName: "item_domain_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: false
            referencedRelation: "memory_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_domain_world_item_id_fkey"
            columns: ["world_item_id"]
            isOneToOne: false
            referencedRelation: "world_items"
            referencedColumns: ["id"]
          },
        ]
      }
      item_states: {
        Row: {
          category: string
          color: string | null
          created_at: string
          id: string
          label: string
          name: string
          sort_order: number | null
          workspace_id: string
        }
        Insert: {
          category?: string
          color?: string | null
          created_at?: string
          id?: string
          label: string
          name: string
          sort_order?: number | null
          workspace_id: string
        }
        Update: {
          category?: string
          color?: string | null
          created_at?: string
          id?: string
          label?: string
          name?: string
          sort_order?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_states_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          account_id: string
          amount: number | null
          created_at: string
          due_date: string | null
          id: string
          metadata: Json | null
          owner_id: string | null
          policy_id: string | null
          state_id: string | null
          title: string
          type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_id: string
          amount?: number | null
          created_at?: string
          due_date?: string | null
          id?: string
          metadata?: Json | null
          owner_id?: string | null
          policy_id?: string | null
          state_id?: string | null
          title: string
          type?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_id?: string
          amount?: number | null
          created_at?: string
          due_date?: string | null
          id?: string
          metadata?: Json | null
          owner_id?: string | null
          policy_id?: string | null
          state_id?: string | null
          title?: string
          type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_state_id_fkey"
            columns: ["state_id"]
            isOneToOne: false
            referencedRelation: "item_states"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      kernel_access_log: {
        Row: {
          access_kind: string
          artifact_id: string | null
          at: string
          auth_subject: string | null
          bytes_served: number | null
          cid: string
          id: string
          issuer: string | null
          kernel_id: string | null
          part: string
          purpose: string | null
          resolved_keyed_by: string | null
          seq: number | null
          session_id: string | null
          surface: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_claim: string | null
          token_version: string | null
        }
        Insert: {
          access_kind: string
          artifact_id?: string | null
          at?: string
          auth_subject?: string | null
          bytes_served?: number | null
          cid: string
          id?: string
          issuer?: string | null
          kernel_id?: string | null
          part: string
          purpose?: string | null
          resolved_keyed_by?: string | null
          seq?: number | null
          session_id?: string | null
          surface?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_claim?: string | null
          token_version?: string | null
        }
        Update: {
          access_kind?: string
          artifact_id?: string | null
          at?: string
          auth_subject?: string | null
          bytes_served?: number | null
          cid?: string
          id?: string
          issuer?: string | null
          kernel_id?: string | null
          part?: string
          purpose?: string | null
          resolved_keyed_by?: string | null
          seq?: number | null
          session_id?: string | null
          surface?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant_claim?: string | null
          token_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kernel_access_log_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "fleet_artifacts"
            referencedColumns: ["artifact_id"]
          },
        ]
      }
      kernel_activation_receipts: {
        Row: {
          activated_at: string
          activated_by: string
          cid: string
          kernel_id: string
          part_manifest: Json
          receipt_id: string
          retired_kernel_id: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          validator_verdict: Json
          version: number
        }
        Insert: {
          activated_at?: string
          activated_by: string
          cid: string
          kernel_id: string
          part_manifest: Json
          receipt_id?: string
          retired_kernel_id?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          validator_verdict: Json
          version: number
        }
        Update: {
          activated_at?: string
          activated_by?: string
          cid?: string
          kernel_id?: string
          part_manifest?: Json
          receipt_id?: string
          retired_kernel_id?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          validator_verdict?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "kernel_activation_receipts_kernel_id_fkey"
            columns: ["kernel_id"]
            isOneToOne: false
            referencedRelation: "kernels"
            referencedColumns: ["id"]
          },
        ]
      }
      kernel_boot_challenge: {
        Row: {
          attest_latency_ms: number | null
          attested_at: string | null
          bytes_served: number | null
          challenge_id: string
          cid: string
          expires_at: string
          issued_at: string
          kernel_id: string | null
          missed_parts: string[] | null
          outcome: string
          parts_attested: number | null
          parts_required: number | null
          parts_served: number | null
          phrase: string
          phrases: Json | null
          session_ref: string | null
          surface: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          attest_latency_ms?: number | null
          attested_at?: string | null
          bytes_served?: number | null
          challenge_id?: string
          cid: string
          expires_at?: string
          issued_at?: string
          kernel_id?: string | null
          missed_parts?: string[] | null
          outcome?: string
          parts_attested?: number | null
          parts_required?: number | null
          parts_served?: number | null
          phrase: string
          phrases?: Json | null
          session_ref?: string | null
          surface?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          attest_latency_ms?: number | null
          attested_at?: string | null
          bytes_served?: number | null
          challenge_id?: string
          cid?: string
          expires_at?: string
          issued_at?: string
          kernel_id?: string | null
          missed_parts?: string[] | null
          outcome?: string
          parts_attested?: number | null
          parts_required?: number | null
          parts_served?: number | null
          phrase?: string
          phrases?: Json | null
          session_ref?: string | null
          surface?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: []
      }
      kernel_part_audit: {
        Row: {
          at: string
          audit_id: number
          cid: string | null
          content_changed: boolean | null
          db_user: string
          declared_actor: string | null
          declared_reason: string | null
          jwt_role: string | null
          kernel_id: string | null
          new_bytes: number | null
          new_sha256: string | null
          old_bytes: number | null
          old_sha256: string | null
          op: string
          part: string | null
          seq: number | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          at?: string
          audit_id?: number
          cid?: string | null
          content_changed?: boolean | null
          db_user: string
          declared_actor?: string | null
          declared_reason?: string | null
          jwt_role?: string | null
          kernel_id?: string | null
          new_bytes?: number | null
          new_sha256?: string | null
          old_bytes?: number | null
          old_sha256?: string | null
          op: string
          part?: string | null
          seq?: number | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          at?: string
          audit_id?: number
          cid?: string | null
          content_changed?: boolean | null
          db_user?: string
          declared_actor?: string | null
          declared_reason?: string | null
          jwt_role?: string | null
          kernel_id?: string | null
          new_bytes?: number | null
          new_sha256?: string | null
          old_bytes?: number | null
          old_sha256?: string | null
          op?: string
          part?: string | null
          seq?: number | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: []
      }
      kernel_parts: {
        Row: {
          bytes: number
          cid: string | null
          content_md: string
          id: string
          kernel_id: string
          part: string
          seq: number
          sha256: string
        }
        Insert: {
          bytes: number
          cid?: string | null
          content_md: string
          id?: string
          kernel_id: string
          part: string
          seq?: number
          sha256: string
        }
        Update: {
          bytes?: number
          cid?: string | null
          content_md?: string
          id?: string
          kernel_id?: string
          part?: string
          seq?: number
          sha256?: string
        }
        Relationships: [
          {
            foreignKeyName: "kernel_parts_kernel_id_fkey"
            columns: ["kernel_id"]
            isOneToOne: false
            referencedRelation: "kernels"
            referencedColumns: ["id"]
          },
        ]
      }
      kernel_state_notes: {
        Row: {
          cid: string
          notes_md: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cid: string
          notes_md: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cid?: string
          notes_md?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      kernels: {
        Row: {
          activated_at: string | null
          cid: string
          created_at: string
          id: string
          kernel_kind: string
          notes: string | null
          persona_key: string | null
          status: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id: string
          verification_state: string | null
          version: number
        }
        Insert: {
          activated_at?: string | null
          cid: string
          created_at?: string
          id?: string
          kernel_kind?: string
          notes?: string | null
          persona_key?: string | null
          status?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id: string
          verification_state?: string | null
          version?: number
        }
        Update: {
          activated_at?: string | null
          cid?: string
          created_at?: string
          id?: string
          kernel_kind?: string
          notes?: string | null
          persona_key?: string | null
          status?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant_id?: string
          verification_state?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "kernels_cid_fk"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "hq_readiness"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "kernels_cid_fk"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "identity_census"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "kernels_cid_fk"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
          },
        ]
      }
      knowledge_files: {
        Row: {
          category: string
          cid: string | null
          cid_quarantine_reason: string | null
          confidence: number | null
          content_md: string | null
          created_at: string
          id: string
          source: string
          status: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          category: string
          cid?: string | null
          cid_quarantine_reason?: string | null
          confidence?: number | null
          content_md?: string | null
          created_at?: string
          id?: string
          source?: string
          status?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id: string
          title: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          category?: string
          cid?: string | null
          cid_quarantine_reason?: string | null
          confidence?: number | null
          content_md?: string | null
          created_at?: string
          id?: string
          source?: string
          status?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      loop_state_alias: {
        Row: {
          added_at: string
          alias: string
          canonical: string
          note: string | null
          vocab_version: number
        }
        Insert: {
          added_at?: string
          alias: string
          canonical: string
          note?: string | null
          vocab_version?: number
        }
        Update: {
          added_at?: string
          alias?: string
          canonical?: string
          note?: string | null
          vocab_version?: number
        }
        Relationships: []
      }
      mcp_usage_events: {
        Row: {
          agent_id: string | null
          cid: string | null
          created_at: string
          duration_ms: number | null
          external_identity_id: string | null
          id: string
          metadata: Json
          model_breakdown: Json
          principal_id: string | null
          resolution_mode: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant: string
          tool: string
          total_cost_usd: number
        }
        Insert: {
          agent_id?: string | null
          cid?: string | null
          created_at?: string
          duration_ms?: number | null
          external_identity_id?: string | null
          id?: string
          metadata?: Json
          model_breakdown?: Json
          principal_id?: string | null
          resolution_mode?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant: string
          tool: string
          total_cost_usd?: number
        }
        Update: {
          agent_id?: string | null
          cid?: string | null
          created_at?: string
          duration_ms?: number | null
          external_identity_id?: string | null
          id?: string
          metadata?: Json
          model_breakdown?: Json
          principal_id?: string | null
          resolution_mode?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant?: string
          tool?: string
          total_cost_usd?: number
        }
        Relationships: []
      }
      memory_entity_link: {
        Row: {
          cid: string
          confidence: number
          entity_id: string
          link_id: string
          linked_at: string
          linked_by: string | null
          match_mode: string
          memory_id: string
          review_status: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          cid: string
          confidence?: number
          entity_id: string
          link_id?: string
          linked_at?: string
          linked_by?: string | null
          match_mode?: string
          memory_id: string
          review_status?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          cid?: string
          confidence?: number
          entity_id?: string
          link_id?: string
          linked_at?: string
          linked_by?: string | null
          match_mode?: string
          memory_id?: string
          review_status?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: [
          {
            foreignKeyName: "memory_entity_link_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entity_resolvable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memory_entity_link_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "world_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memory_entity_link_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: false
            referencedRelation: "memory_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_entries: {
        Row: {
          body_md: string
          category: string | null
          category_legacy: string | null
          cid: string | null
          confidence: number
          created_at: string
          created_by: string | null
          embedding: string | null
          id: string
          lane: string | null
          notion_block_ref: string | null
          occurred_at: string | null
          session_id: string | null
          status: string
          superseded_by: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant: string
          title: string
          updated_at: string
        }
        Insert: {
          body_md: string
          category?: string | null
          category_legacy?: string | null
          cid?: string | null
          confidence?: number
          created_at?: string
          created_by?: string | null
          embedding?: string | null
          id?: string
          lane?: string | null
          notion_block_ref?: string | null
          occurred_at?: string | null
          session_id?: string | null
          status?: string
          superseded_by?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant: string
          title: string
          updated_at?: string
        }
        Update: {
          body_md?: string
          category?: string | null
          category_legacy?: string | null
          cid?: string | null
          confidence?: number
          created_at?: string
          created_by?: string | null
          embedding?: string | null
          id?: string
          lane?: string | null
          notion_block_ref?: string | null
          occurred_at?: string | null
          session_id?: string | null
          status?: string
          superseded_by?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "memory_entries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memory_entries_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "memory_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      message_events: {
        Row: {
          action_id: string | null
          created_at: string
          event_type: string
          id: string
          occurred_at: string
          payload: Json | null
          provider: string
          provider_message_id: string
          recipient_email: string | null
          workspace_id: string
        }
        Insert: {
          action_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          occurred_at: string
          payload?: Json | null
          provider?: string
          provider_message_id: string
          recipient_email?: string | null
          workspace_id: string
        }
        Update: {
          action_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          occurred_at?: string
          payload?: Json | null
          provider?: string
          provider_message_id?: string
          recipient_email?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      notion_dependency: {
        Row: {
          created_at: string
          dep_id: string
          detail: string | null
          disposition: string
          layer: string
          locator: string
          owner: string
          resolved_at: string | null
          severity: string
          what: string
        }
        Insert: {
          created_at?: string
          dep_id?: string
          detail?: string | null
          disposition?: string
          layer: string
          locator: string
          owner?: string
          resolved_at?: string | null
          severity: string
          what: string
        }
        Update: {
          created_at?: string
          dep_id?: string
          detail?: string | null
          disposition?: string
          layer?: string
          locator?: string
          owner?: string
          resolved_at?: string | null
          severity?: string
          what?: string
        }
        Relationships: []
      }
      office_record_index: {
        Row: {
          box_link: string | null
          cid: string | null
          created_at: string
          drive_link: string | null
          kind: string | null
          linked_decision: string | null
          linked_entity: string | null
          migrated_from: string | null
          name: string
          note: string | null
          occurred_at: string | null
          other_link: string | null
          record_date: string | null
          record_id: string
          source_ref: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          box_link?: string | null
          cid?: string | null
          created_at?: string
          drive_link?: string | null
          kind?: string | null
          linked_decision?: string | null
          linked_entity?: string | null
          migrated_from?: string | null
          name: string
          note?: string | null
          occurred_at?: string | null
          other_link?: string | null
          record_date?: string | null
          record_id?: string
          source_ref?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          box_link?: string | null
          cid?: string | null
          created_at?: string
          drive_link?: string | null
          kind?: string | null
          linked_decision?: string | null
          linked_entity?: string | null
          migrated_from?: string | null
          name?: string
          note?: string | null
          occurred_at?: string | null
          other_link?: string | null
          record_date?: string | null
          record_id?: string
          source_ref?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: []
      }
      onboarding_checklist: {
        Row: {
          account_id: string
          created_at: string
          done: boolean
          done_at: string | null
          id: string
          label: string
          note: string | null
          phase: string
          sort_order: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          done?: boolean
          done_at?: string | null
          id?: string
          label: string
          note?: string | null
          phase: string
          sort_order?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          done?: boolean
          done_at?: string | null
          id?: string
          label?: string
          note?: string | null
          phase?: string
          sort_order?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_checklist_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_checklist_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_escalations: {
        Row: {
          cid: string | null
          cid_quarantine_reason: string | null
          created_at: string
          id: string
          reason: string
          status: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id: string
        }
        Insert: {
          cid?: string | null
          cid_quarantine_reason?: string | null
          created_at?: string
          id?: string
          reason: string
          status?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id: string
        }
        Update: {
          cid?: string | null
          cid_quarantine_reason?: string | null
          created_at?: string
          id?: string
          reason?: string
          status?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_escalations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "onboarding_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_program: {
        Row: {
          created_at: string
          effective_from: string | null
          notes: string | null
          program_version: string
          published_at: string | null
          published_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          effective_from?: string | null
          notes?: string | null
          program_version: string
          published_at?: string | null
          published_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          effective_from?: string | null
          notes?: string | null
          program_version?: string
          published_at?: string | null
          published_by?: string | null
          status?: string
        }
        Relationships: []
      }
      onboarding_progress: {
        Row: {
          cid: string
          detail: string | null
          ordinal: number | null
          phase: string | null
          program_version: string | null
          source: string
          status: string
          step_key: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          updated_at: string
        }
        Insert: {
          cid: string
          detail?: string | null
          ordinal?: number | null
          phase?: string | null
          program_version?: string | null
          source: string
          status?: string
          step_key: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          updated_at?: string
        }
        Update: {
          cid?: string
          detail?: string | null
          ordinal?: number | null
          phase?: string | null
          program_version?: string | null
          source?: string
          status?: string
          step_key?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_progress_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "hq_readiness"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "onboarding_progress_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "identity_census"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "onboarding_progress_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
          },
        ]
      }
      onboarding_state: {
        Row: {
          email: string | null
          state: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          email?: string | null
          state?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          email?: string | null
          state?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      onboarding_step_template: {
        Row: {
          evidence_required: string
          gate_kind: string
          ordinal: number
          outcome_md: string
          phase: string
          program_version: string
          step_key: string
        }
        Insert: {
          evidence_required: string
          gate_kind?: string
          ordinal: number
          outcome_md: string
          phase: string
          program_version: string
          step_key: string
        }
        Update: {
          evidence_required?: string
          gate_kind?: string
          ordinal?: number
          outcome_md?: string
          phase?: string
          program_version?: string
          step_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_step_template_program_version_fkey"
            columns: ["program_version"]
            isOneToOne: false
            referencedRelation: "onboarding_program"
            referencedColumns: ["program_version"]
          },
        ]
      }
      onboarding_tenants: {
        Row: {
          bound_at: string | null
          bound_by: string | null
          build_submission: Json | null
          build_submitted_at: string | null
          cid: string | null
          connector_connected_at: string | null
          connector_first_client: string | null
          connectors: Json
          consent_signed_at: string | null
          consent_signed_name: string | null
          created_at: string
          current_step: string
          handoff_complete_at: string | null
          handoff_message_id: string | null
          id: string
          identity_state: string
          lane: string | null
          quarantine_reason: string | null
          reconciliation_receipt_id: string | null
          state: Json | null
          status: string
          step0_flags: Json
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_key: string
          updated_at: string
          user_id: string
          welcome_celebrated_at: string | null
        }
        Insert: {
          bound_at?: string | null
          bound_by?: string | null
          build_submission?: Json | null
          build_submitted_at?: string | null
          cid?: string | null
          connector_connected_at?: string | null
          connector_first_client?: string | null
          connectors?: Json
          consent_signed_at?: string | null
          consent_signed_name?: string | null
          created_at?: string
          current_step?: string
          handoff_complete_at?: string | null
          handoff_message_id?: string | null
          id?: string
          identity_state?: string
          lane?: string | null
          quarantine_reason?: string | null
          reconciliation_receipt_id?: string | null
          state?: Json | null
          status?: string
          step0_flags?: Json
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_key: string
          updated_at?: string
          user_id: string
          welcome_celebrated_at?: string | null
        }
        Update: {
          bound_at?: string | null
          bound_by?: string | null
          build_submission?: Json | null
          build_submitted_at?: string | null
          cid?: string | null
          connector_connected_at?: string | null
          connector_first_client?: string | null
          connectors?: Json
          consent_signed_at?: string | null
          consent_signed_name?: string | null
          created_at?: string
          current_step?: string
          handoff_complete_at?: string | null
          handoff_message_id?: string | null
          id?: string
          identity_state?: string
          lane?: string | null
          quarantine_reason?: string | null
          reconciliation_receipt_id?: string | null
          state?: Json | null
          status?: string
          step0_flags?: Json
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant_key?: string
          updated_at?: string
          user_id?: string
          welcome_celebrated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_tenants_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "hq_readiness"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "onboarding_tenants_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "identity_census"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "onboarding_tenants_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "ot_membership_fk"
            columns: ["user_id", "cid"]
            isOneToOne: false
            referencedRelation: "tenant_members"
            referencedColumns: ["auth_user_id", "cid"]
          },
        ]
      }
      onboarding_tenants_archive: {
        Row: {
          archived_at: string | null
          archived_reason: string | null
          connectors: Json
          consent_signed_at: string | null
          consent_signed_name: string | null
          created_at: string
          current_step: string
          id: string
          state: Json | null
          status: string
          step0_flags: Json
          tenant_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          archived_reason?: string | null
          connectors?: Json
          consent_signed_at?: string | null
          consent_signed_name?: string | null
          created_at?: string
          current_step?: string
          id?: string
          state?: Json | null
          status?: string
          step0_flags?: Json
          tenant_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          archived_reason?: string | null
          connectors?: Json
          consent_signed_at?: string | null
          consent_signed_name?: string | null
          created_at?: string
          current_step?: string
          id?: string
          state?: Json | null
          status?: string
          step0_flags?: Json
          tenant_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      open_loops: {
        Row: {
          brief_status: string
          cid: string | null
          cid_quarantine_reason: string | null
          created_at: string
          escalated_at: string | null
          escalation_state: string | null
          hard_deadline: string | null
          id: string
          last_action_at: string | null
          last_surfaced: string | null
          notion_page_id: string | null
          occurred_at: string | null
          owner: string | null
          principal_acts: boolean | null
          snooze_until: string | null
          state: string | null
          superseded_by: string | null
          surfaced_count: number
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant: string
          title: string
          trigger: string | null
          updated_at: string
          urgent: boolean
          urgent_reason: string | null
          work_id: string | null
        }
        Insert: {
          brief_status?: string
          cid?: string | null
          cid_quarantine_reason?: string | null
          created_at?: string
          escalated_at?: string | null
          escalation_state?: string | null
          hard_deadline?: string | null
          id?: string
          last_action_at?: string | null
          last_surfaced?: string | null
          notion_page_id?: string | null
          occurred_at?: string | null
          owner?: string | null
          principal_acts?: boolean | null
          snooze_until?: string | null
          state?: string | null
          superseded_by?: string | null
          surfaced_count?: number
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant: string
          title: string
          trigger?: string | null
          updated_at?: string
          urgent?: boolean
          urgent_reason?: string | null
          work_id?: string | null
        }
        Update: {
          brief_status?: string
          cid?: string | null
          cid_quarantine_reason?: string | null
          created_at?: string
          escalated_at?: string | null
          escalation_state?: string | null
          hard_deadline?: string | null
          id?: string
          last_action_at?: string | null
          last_surfaced?: string | null
          notion_page_id?: string | null
          occurred_at?: string | null
          owner?: string | null
          principal_acts?: boolean | null
          snooze_until?: string | null
          state?: string | null
          superseded_by?: string | null
          surfaced_count?: number
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant?: string
          title?: string
          trigger?: string | null
          updated_at?: string
          urgent?: boolean
          urgent_reason?: string | null
          work_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "open_loops_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "open_loops"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_alias: {
        Row: {
          alias: string
          canonical: string
          created_at: string
        }
        Insert: {
          alias: string
          canonical: string
          created_at?: string
        }
        Update: {
          alias?: string
          canonical?: string
          created_at?: string
        }
        Relationships: []
      }
      playbook_steps: {
        Row: {
          action_type: string
          channel: string | null
          created_at: string
          delay_minutes: number | null
          id: string
          playbook_id: string
          requires_approval: boolean | null
          step_order: number
          template_id: string | null
          trigger_state: string
        }
        Insert: {
          action_type: string
          channel?: string | null
          created_at?: string
          delay_minutes?: number | null
          id?: string
          playbook_id: string
          requires_approval?: boolean | null
          step_order?: number
          template_id?: string | null
          trigger_state: string
        }
        Update: {
          action_type?: string
          channel?: string | null
          created_at?: string
          delay_minutes?: number | null
          id?: string
          playbook_id?: string
          requires_approval?: boolean | null
          step_order?: number
          template_id?: string | null
          trigger_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "playbook_steps_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "playbooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      playbooks: {
        Row: {
          created_at: string
          id: string
          item_type: string
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_type: string
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_type?: string
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playbooks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      policies: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "policies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_rate_rules: {
        Row: {
          created_at: string
          id: string
          policy_id: string
          rule_json: Json
          rule_type: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          policy_id: string
          rule_json?: Json
          rule_type: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          policy_id?: string
          rule_json?: Json
          rule_type?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "policy_rules_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_rules: {
        Row: {
          action_channel: string
          action_type: string
          contact_id: string | null
          created_at: string
          delay_minutes: number | null
          delay_seconds: number | null
          enabled: boolean
          id: string
          predicate: Json
          requires_approval: boolean
          sort_order: number
          template_id: string | null
          updated_at: string
          vertical_pack_key: string
          workspace_id: string
        }
        Insert: {
          action_channel: string
          action_type: string
          contact_id?: string | null
          created_at?: string
          delay_minutes?: number | null
          delay_seconds?: number | null
          enabled?: boolean
          id?: string
          predicate: Json
          requires_approval?: boolean
          sort_order?: number
          template_id?: string | null
          updated_at?: string
          vertical_pack_key: string
          workspace_id: string
        }
        Update: {
          action_channel?: string
          action_type?: string
          contact_id?: string | null
          created_at?: string
          delay_minutes?: number | null
          delay_seconds?: number | null
          enabled?: boolean
          id?: string
          predicate?: Json
          requires_approval?: boolean
          sort_order?: number
          template_id?: string | null
          updated_at?: string
          vertical_pack_key?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "policy_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      principal_binding: {
        Row: {
          authority_receipt: string | null
          cid: string
          created_at: string
          delegated_by: string | null
          issuer: string | null
          membership_id: string | null
          principal_id: string
          principal_type: string
          provider: string | null
          provider_subject: string | null
          revoked_at: string | null
          role: string | null
          scopes: string[]
          status: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          verified_email: string | null
        }
        Insert: {
          authority_receipt?: string | null
          cid: string
          created_at?: string
          delegated_by?: string | null
          issuer?: string | null
          membership_id?: string | null
          principal_id?: string
          principal_type: string
          provider?: string | null
          provider_subject?: string | null
          revoked_at?: string | null
          role?: string | null
          scopes?: string[]
          status?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          verified_email?: string | null
        }
        Update: {
          authority_receipt?: string | null
          cid?: string
          created_at?: string
          delegated_by?: string | null
          issuer?: string | null
          membership_id?: string | null
          principal_id?: string
          principal_type?: string
          provider?: string | null
          provider_subject?: string | null
          revoked_at?: string | null
          role?: string | null
          scopes?: string[]
          status?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          verified_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "principal_binding_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "hq_readiness"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "principal_binding_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "identity_census"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "principal_binding_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "principal_binding_delegated_by_fkey"
            columns: ["delegated_by"]
            isOneToOne: false
            referencedRelation: "principal_binding"
            referencedColumns: ["principal_id"]
          },
        ]
      }
      principal_email_alias: {
        Row: {
          alias_id: string
          created_at: string
          email: string
          noted_by: string | null
          principal_id: string
          purpose: string | null
          verified: boolean
        }
        Insert: {
          alias_id?: string
          created_at?: string
          email: string
          noted_by?: string | null
          principal_id: string
          purpose?: string | null
          verified?: boolean
        }
        Update: {
          alias_id?: string
          created_at?: string
          email?: string
          noted_by?: string | null
          principal_id?: string
          purpose?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "principal_email_alias_principal_id_fkey"
            columns: ["principal_id"]
            isOneToOne: false
            referencedRelation: "principals"
            referencedColumns: ["principal_id"]
          },
        ]
      }
      principals: {
        Row: {
          created_at: string
          display_name: string | null
          principal_id: string
          principal_type: string
          revoked_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          principal_id?: string
          principal_type: string
          revoked_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          principal_id?: string
          principal_type?: string
          revoked_at?: string | null
          status?: string
        }
        Relationships: []
      }
      probe_runs: {
        Row: {
          cid: string
          claim: string
          expected: string
          id: string
          method: string
          observed: string
          passed: boolean
          probe_kind: string
          ran_at: string
          ran_by: string
          subject_kind: string
          subject_ref: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          cid: string
          claim: string
          expected: string
          id?: string
          method: string
          observed: string
          passed: boolean
          probe_kind?: string
          ran_at?: string
          ran_by: string
          subject_kind: string
          subject_ref: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          cid?: string
          claim?: string
          expected?: string
          id?: string
          method?: string
          observed?: string
          passed?: boolean
          probe_kind?: string
          ran_at?: string
          ran_by?: string
          subject_kind?: string
          subject_ref?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      program_capabilities: {
        Row: {
          autonomy: string
          blocked_by: string | null
          capability_key: string
          cost_model: string
          est_usd_per_unit: number | null
          label: string
          proven_by: string | null
          registered_at: string
          registered_by: string
          status: string
          unit: string | null
          what_it_does: string
        }
        Insert: {
          autonomy: string
          blocked_by?: string | null
          capability_key: string
          cost_model: string
          est_usd_per_unit?: number | null
          label: string
          proven_by?: string | null
          registered_at?: string
          registered_by: string
          status: string
          unit?: string | null
          what_it_does: string
        }
        Update: {
          autonomy?: string
          blocked_by?: string | null
          capability_key?: string
          cost_model?: string
          est_usd_per_unit?: number | null
          label?: string
          proven_by?: string | null
          registered_at?: string
          registered_by?: string
          status?: string
          unit?: string | null
          what_it_does?: string
        }
        Relationships: []
      }
      project_builds: {
        Row: {
          account_id: string
          created_at: string
          description: string | null
          id: string
          kind: string
          metadata: Json
          revenue_schedule_id: string | null
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          metadata?: Json
          revenue_schedule_id?: string | null
          status?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          metadata?: Json
          revenue_schedule_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_builds_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_builds_revenue_schedule_id_fkey"
            columns: ["revenue_schedule_id"]
            isOneToOne: false
            referencedRelation: "revenue_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_builds_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      protected_artifact_access_log: {
        Row: {
          access_id: number
          action: string
          artifact_id: string | null
          artifact_key: string | null
          at: string
          db_user: string
          declared_actor: string | null
          jwt_role: string | null
          outcome: string
          reason: string | null
        }
        Insert: {
          access_id?: number
          action: string
          artifact_id?: string | null
          artifact_key?: string | null
          at?: string
          db_user: string
          declared_actor?: string | null
          jwt_role?: string | null
          outcome: string
          reason?: string | null
        }
        Update: {
          access_id?: number
          action?: string
          artifact_id?: string | null
          artifact_key?: string | null
          at?: string
          db_user?: string
          declared_actor?: string | null
          jwt_role?: string | null
          outcome?: string
          reason?: string | null
        }
        Relationships: []
      }
      protected_artifact_annotations: {
        Row: {
          annotation_id: number
          artifact_id: string
          at: string
          authored_by: string
          kind: string
          note: string
        }
        Insert: {
          annotation_id?: number
          artifact_id: string
          at?: string
          authored_by: string
          kind: string
          note: string
        }
        Update: {
          annotation_id?: number
          artifact_id?: string
          at?: string
          authored_by?: string
          kind?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "protected_artifact_annotations_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "effective_artifacts"
            referencedColumns: ["artifact_id"]
          },
          {
            foreignKeyName: "protected_artifact_annotations_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "protected_artifacts"
            referencedColumns: ["artifact_id"]
          },
        ]
      }
      protected_artifacts: {
        Row: {
          activation_gate: string | null
          artifact_class: string
          artifact_id: string
          artifact_key: string
          byte_count: number
          cid: string | null
          content_bytes: string | null
          distribution_policy: string
          ingested_at: string
          ingested_by: string
          mutation_policy: string
          notes: string | null
          provenance: string
          registration_state: string
          runtime_status: string
          sha256: string | null
          source_authority: string
          source_location: string
          source_sha1: string | null
          supersedes_artifact_id: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant: string | null
          version: number
        }
        Insert: {
          activation_gate?: string | null
          artifact_class: string
          artifact_id?: string
          artifact_key: string
          byte_count: number
          cid?: string | null
          content_bytes?: string | null
          distribution_policy: string
          ingested_at?: string
          ingested_by: string
          mutation_policy?: string
          notes?: string | null
          provenance: string
          registration_state?: string
          runtime_status: string
          sha256?: string | null
          source_authority: string
          source_location: string
          source_sha1?: string | null
          supersedes_artifact_id?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant?: string | null
          version: number
        }
        Update: {
          activation_gate?: string | null
          artifact_class?: string
          artifact_id?: string
          artifact_key?: string
          byte_count?: number
          cid?: string | null
          content_bytes?: string | null
          distribution_policy?: string
          ingested_at?: string
          ingested_by?: string
          mutation_policy?: string
          notes?: string | null
          provenance?: string
          registration_state?: string
          runtime_status?: string
          sha256?: string | null
          source_authority?: string
          source_location?: string
          source_sha1?: string | null
          supersedes_artifact_id?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant?: string | null
          version?: number
        }
        Relationships: []
      }
      protected_kernel_registry: {
        Row: {
          added_at: string
          added_by: string
          cid: string
          part: string
          protection_id: string
          reason: string
          release_reason: string | null
          released_at: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          added_at?: string
          added_by: string
          cid: string
          part: string
          protection_id?: string
          reason: string
          release_reason?: string | null
          released_at?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          added_at?: string
          added_by?: string
          cid?: string
          part?: string
          protection_id?: string
          reason?: string
          release_reason?: string | null
          released_at?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: []
      }
      provisioning_receipt: {
        Row: {
          action: string
          at: string
          cid: string
          object_class: string
          object_id: string
          program_version: string
          receipt_id: string
          request_id: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          action: string
          at?: string
          cid: string
          object_class: string
          object_id: string
          program_version: string
          receipt_id?: string
          request_id: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          action?: string
          at?: string
          cid?: string
          object_class?: string
          object_id?: string
          program_version?: string
          receipt_id?: string
          request_id?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: [
          {
            foreignKeyName: "provisioning_receipt_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "provisioning_request"
            referencedColumns: ["request_id"]
          },
        ]
      }
      provisioning_request: {
        Row: {
          attempts: number
          cid: string
          completed_at: string | null
          last_error: string | null
          program_version: string
          request_id: string
          requested_at: string
          state: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          attempts?: number
          cid: string
          completed_at?: string | null
          last_error?: string | null
          program_version: string
          request_id?: string
          requested_at?: string
          state?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          attempts?: number
          cid?: string
          completed_at?: string | null
          last_error?: string | null
          program_version?: string
          request_id?: string
          requested_at?: string
          state?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: [
          {
            foreignKeyName: "provisioning_request_cid_fkey"
            columns: ["cid"]
            isOneToOne: true
            referencedRelation: "hq_readiness"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "provisioning_request_cid_fkey"
            columns: ["cid"]
            isOneToOne: true
            referencedRelation: "identity_census"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "provisioning_request_cid_fkey"
            columns: ["cid"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "provisioning_request_program_version_fkey"
            columns: ["program_version"]
            isOneToOne: false
            referencedRelation: "onboarding_program"
            referencedColumns: ["program_version"]
          },
        ]
      }
      rate_limits: {
        Row: {
          key: string
          request_count: number
          window_start: string
        }
        Insert: {
          key: string
          request_count?: number
          window_start?: string
        }
        Update: {
          key?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      reconciliation_run: {
        Row: {
          cid: string
          conflicts: number | null
          destination_count: number | null
          destination_only: number | null
          matching_hashes: number | null
          ran_at: string
          register_key: string
          run_id: string
          source_count: number | null
          source_only: number | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          unresolved: number | null
          verdict: string
        }
        Insert: {
          cid: string
          conflicts?: number | null
          destination_count?: number | null
          destination_only?: number | null
          matching_hashes?: number | null
          ran_at?: string
          register_key: string
          run_id?: string
          source_count?: number | null
          source_only?: number | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          unresolved?: number | null
          verdict: string
        }
        Update: {
          cid?: string
          conflicts?: number | null
          destination_count?: number | null
          destination_only?: number | null
          matching_hashes?: number | null
          ran_at?: string
          register_key?: string
          run_id?: string
          source_count?: number | null
          source_only?: number | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          unresolved?: number | null
          verdict?: string
        }
        Relationships: []
      }
      record_files: {
        Row: {
          account_id: string
          created_at: string
          file_name: string
          id: string
          item_id: string | null
          kind: string
          size_bytes: number
          storage_path: string
          superseded_by: string | null
          uploaded_by: string | null
          workspace_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          file_name: string
          id?: string
          item_id?: string | null
          kind?: string
          size_bytes?: number
          storage_path: string
          superseded_by?: string | null
          uploaded_by?: string | null
          workspace_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          file_name?: string
          id?: string
          item_id?: string | null
          kind?: string
          size_bytes?: number
          storage_path?: string
          superseded_by?: string | null
          uploaded_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "record_files_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_files_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_files_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "record_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_files_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      recovery_source_status: {
        Row: {
          cid: string
          evidence: string
          source_key: string
          status: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          verified_at: string
        }
        Insert: {
          cid: string
          evidence: string
          source_key: string
          status: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          verified_at?: string
        }
        Update: {
          cid?: string
          evidence?: string
          source_key?: string
          status?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recovery_source_status_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "hq_readiness"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "recovery_source_status_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "identity_census"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "recovery_source_status_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
          },
        ]
      }
      register_cadence: {
        Row: {
          enabled: boolean
          max_silence: string
          note: string | null
          register_key: string
          ts_col: string
        }
        Insert: {
          enabled?: boolean
          max_silence: string
          note?: string | null
          register_key: string
          ts_col: string
        }
        Update: {
          enabled?: boolean
          max_silence?: string
          note?: string | null
          register_key?: string
          ts_col?: string
        }
        Relationships: []
      }
      register_layer: {
        Row: {
          assigned_at: string
          evidence: string | null
          layer: Database["public"]["Enums"]["register_layer_t"] | null
          rationale: string
          register: string
          source: string
          status: string
        }
        Insert: {
          assigned_at?: string
          evidence?: string | null
          layer?: Database["public"]["Enums"]["register_layer_t"] | null
          rationale: string
          register: string
          source?: string
          status?: string
        }
        Update: {
          assigned_at?: string
          evidence?: string | null
          layer?: Database["public"]["Enums"]["register_layer_t"] | null
          rationale?: string
          register?: string
          source?: string
          status?: string
        }
        Relationships: []
      }
      register_migration_contract: {
        Row: {
          authority_policy: string
          canonical_reader: string
          canonical_writer: string
          cid: string
          conflict_policy: string
          cutover_state: string
          destination_register: string
          direct_source_edits_allowed: boolean
          merge_policy: string
          mirror_target: string
          reconciliation_method: string
          register_key: string
          rollback_method: string
          source_system: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          authority_policy: string
          canonical_reader?: string
          canonical_writer?: string
          cid: string
          conflict_policy: string
          cutover_state?: string
          destination_register: string
          direct_source_edits_allowed?: boolean
          merge_policy: string
          mirror_target?: string
          reconciliation_method?: string
          register_key: string
          rollback_method?: string
          source_system?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          authority_policy?: string
          canonical_reader?: string
          canonical_writer?: string
          cid?: string
          conflict_policy?: string
          cutover_state?: string
          destination_register?: string
          direct_source_edits_allowed?: boolean
          merge_policy?: string
          mirror_target?: string
          reconciliation_method?: string
          register_key?: string
          rollback_method?: string
          source_system?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: [
          {
            foreignKeyName: "register_migration_contract_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "hq_readiness"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "register_migration_contract_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "identity_census"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "register_migration_contract_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
          },
        ]
      }
      revenue_occurrence_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          new_amount_usd: number | null
          new_date: string | null
          note: string | null
          occurrence_month: string
          override_kind: string
          schedule_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          new_amount_usd?: number | null
          new_date?: string | null
          note?: string | null
          occurrence_month: string
          override_kind: string
          schedule_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          new_amount_usd?: number | null
          new_date?: string | null
          note?: string | null
          occurrence_month?: string
          override_kind?: string
          schedule_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_occurrence_overrides_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "revenue_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_schedules: {
        Row: {
          account_id: string
          amount_usd: number
          cadence: string
          counted: boolean
          created_at: string
          description: string
          end_date: string | null
          id: string
          invoice_separately: boolean
          item_id: string | null
          kind: string
          metadata: Json
          next_due: string | null
          start_date: string | null
          status: string
          stripe_invoice_id: string | null
          stripe_payment_link: string | null
          stripe_price_id: string | null
          stripe_product_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_id: string
          amount_usd: number
          cadence: string
          counted?: boolean
          created_at?: string
          description: string
          end_date?: string | null
          id?: string
          invoice_separately?: boolean
          item_id?: string | null
          kind: string
          metadata?: Json
          next_due?: string | null
          start_date?: string | null
          status?: string
          stripe_invoice_id?: string | null
          stripe_payment_link?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_id?: string
          amount_usd?: number
          cadence?: string
          counted?: boolean
          created_at?: string
          description?: string
          end_date?: string | null
          id?: string
          invoice_separately?: boolean
          item_id?: string | null
          kind?: string
          metadata?: Json
          next_due?: string | null
          start_date?: string | null
          status?: string
          stripe_invoice_id?: string | null
          stripe_payment_link?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_schedules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_schedules_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_schedules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      revocation_audit: {
        Row: {
          audited_at: string
          caller_role: string
          dispatch: string
          function_name: string
          id: string
          real_callers: string
          reason: string
          revoked_from: string
          verdict: string
        }
        Insert: {
          audited_at?: string
          caller_role: string
          dispatch: string
          function_name: string
          id?: string
          real_callers: string
          reason: string
          revoked_from: string
          verdict: string
        }
        Update: {
          audited_at?: string
          caller_role?: string
          dispatch?: string
          function_name?: string
          id?: string
          real_callers?: string
          reason?: string
          revoked_from?: string
          verdict?: string
        }
        Relationships: []
      }
      ritual_runs: {
        Row: {
          cid: string | null
          created_at: string
          duration_ms: number | null
          id: string
          layers: Json
          outcome: string
          ritual: string
          session_id: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant: string
          unsaved: Json
        }
        Insert: {
          cid?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          layers?: Json
          outcome: string
          ritual: string
          session_id?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant: string
          unsaved?: Json
        }
        Update: {
          cid?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          layers?: Json
          outcome?: string
          ritual?: string
          session_id?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant?: string
          unsaved?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ritual_runs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      rollback_receipt: {
        Row: {
          at: string
          cid: string
          lease_id: string | null
          reason: string
          receipt_id: string
          register_key: string
          restored_reader: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          at?: string
          cid: string
          lease_id?: string | null
          reason: string
          receipt_id?: string
          register_key: string
          restored_reader: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          at?: string
          cid?: string
          lease_id?: string | null
          reason?: string
          receipt_id?: string
          register_key?: string
          restored_reader?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: []
      }
      route_audit: {
        Row: {
          audit_id: string
          cid: string
          claim_id: string | null
          created_at: string
          domain_key: string
          mean_conf: number | null
          memory_id: string | null
          passes: number
          reason: string
          resolved_as: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          state: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          votes: number
        }
        Insert: {
          audit_id?: string
          cid: string
          claim_id?: string | null
          created_at?: string
          domain_key: string
          mean_conf?: number | null
          memory_id?: string | null
          passes: number
          reason: string
          resolved_as?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          state?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          votes: number
        }
        Update: {
          audit_id?: string
          cid?: string
          claim_id?: string | null
          created_at?: string
          domain_key?: string
          mean_conf?: number | null
          memory_id?: string | null
          passes?: number
          reason?: string
          resolved_as?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          state?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          votes?: number
        }
        Relationships: [
          {
            foreignKeyName: "route_audit_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "world_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_audit_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "world_delta_v"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "route_audit_domain_key_fkey"
            columns: ["domain_key"]
            isOneToOne: false
            referencedRelation: "domain_taxonomy"
            referencedColumns: ["domain_key"]
          },
          {
            foreignKeyName: "route_audit_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: false
            referencedRelation: "memory_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      route_eval_baseline: {
        Row: {
          claim_id: string | null
          confidence: number | null
          domain_key: string | null
        }
        Insert: {
          claim_id?: string | null
          confidence?: number | null
          domain_key?: string | null
        }
        Update: {
          claim_id?: string | null
          confidence?: number | null
          domain_key?: string | null
        }
        Relationships: []
      }
      route_eval_dr2: {
        Row: {
          claim_id: string | null
          confidence: number | null
          domain_key: string | null
        }
        Insert: {
          claim_id?: string | null
          confidence?: number | null
          domain_key?: string | null
        }
        Update: {
          claim_id?: string | null
          confidence?: number | null
          domain_key?: string | null
        }
        Relationships: []
      }
      route_eval_dr3: {
        Row: {
          claim_id: string | null
          confidence: number | null
          domain_key: string | null
        }
        Insert: {
          claim_id?: string | null
          confidence?: number | null
          domain_key?: string | null
        }
        Update: {
          claim_id?: string | null
          confidence?: number | null
          domain_key?: string | null
        }
        Relationships: []
      }
      rule_relation: {
        Row: {
          a_id: string
          b_id: string
          cid: string | null
          found_at: string
          found_by: string
          kind: string
          note: string | null
          relation_id: string
          resolved_at: string | null
          state: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          a_id: string
          b_id: string
          cid?: string | null
          found_at?: string
          found_by: string
          kind: string
          note?: string | null
          relation_id?: string
          resolved_at?: string | null
          state?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          a_id?: string
          b_id?: string
          cid?: string | null
          found_at?: string
          found_by?: string
          kind?: string
          note?: string | null
          relation_id?: string
          resolved_at?: string | null
          state?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: [
          {
            foreignKeyName: "rule_relation_a_fk"
            columns: ["a_id"]
            isOneToOne: false
            referencedRelation: "directives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_relation_b_fk"
            columns: ["b_id"]
            isOneToOne: false
            referencedRelation: "directives"
            referencedColumns: ["id"]
          },
        ]
      }
      save_attempt: {
        Row: {
          canonicalization_version: string | null
          cid: string | null
          client_request_id: string
          completed_at: string | null
          external_identity_id: string | null
          failure_stage: string | null
          layer_results: Json | null
          payload_hash: string
          payload_hash_algorithm: string | null
          payload_hash_key_version: string | null
          possible_duplicate: boolean
          principal_id: string | null
          received_at: string
          recovery_expires_at: string | null
          recovery_payload: Json | null
          recovery_state: string
          requested_layer_counts: Json
          ritual: string | null
          save_attempt_id: string
          save_id: string | null
          schema_version: string | null
          session_id: string | null
          status: string
          surface: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tool_version: string | null
        }
        Insert: {
          canonicalization_version?: string | null
          cid?: string | null
          client_request_id: string
          completed_at?: string | null
          external_identity_id?: string | null
          failure_stage?: string | null
          layer_results?: Json | null
          payload_hash: string
          payload_hash_algorithm?: string | null
          payload_hash_key_version?: string | null
          possible_duplicate?: boolean
          principal_id?: string | null
          received_at?: string
          recovery_expires_at?: string | null
          recovery_payload?: Json | null
          recovery_state?: string
          requested_layer_counts: Json
          ritual?: string | null
          save_attempt_id?: string
          save_id?: string | null
          schema_version?: string | null
          session_id?: string | null
          status?: string
          surface?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tool_version?: string | null
        }
        Update: {
          canonicalization_version?: string | null
          cid?: string | null
          client_request_id?: string
          completed_at?: string | null
          external_identity_id?: string | null
          failure_stage?: string | null
          layer_results?: Json | null
          payload_hash?: string
          payload_hash_algorithm?: string | null
          payload_hash_key_version?: string | null
          possible_duplicate?: boolean
          principal_id?: string | null
          received_at?: string
          recovery_expires_at?: string | null
          recovery_payload?: Json | null
          recovery_state?: string
          requested_layer_counts?: Json
          ritual?: string | null
          save_attempt_id?: string
          save_id?: string | null
          schema_version?: string | null
          session_id?: string | null
          status?: string
          surface?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tool_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "save_attempt_save_id_fkey"
            columns: ["save_id"]
            isOneToOne: false
            referencedRelation: "save_receipts"
            referencedColumns: ["save_id"]
          },
        ]
      }
      save_receipt_layers: {
        Row: {
          attempted: number
          error_code: string | null
          error_message: string | null
          failed: number
          id: string
          layer: string
          layer_state: string
          record_ids: Json
          requested: number
          retryable: boolean | null
          save_id: string
          saved: number
          updated: number
          verified: boolean
          verified_at: string | null
        }
        Insert: {
          attempted?: number
          error_code?: string | null
          error_message?: string | null
          failed?: number
          id?: string
          layer: string
          layer_state: string
          record_ids?: Json
          requested?: number
          retryable?: boolean | null
          save_id: string
          saved?: number
          updated?: number
          verified?: boolean
          verified_at?: string | null
        }
        Update: {
          attempted?: number
          error_code?: string | null
          error_message?: string | null
          failed?: number
          id?: string
          layer?: string
          layer_state?: string
          record_ids?: Json
          requested?: number
          retryable?: boolean | null
          save_id?: string
          saved?: number
          updated?: number
          verified?: boolean
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "save_receipt_layers_save_id_fkey"
            columns: ["save_id"]
            isOneToOne: false
            referencedRelation: "save_receipts"
            referencedColumns: ["save_id"]
          },
        ]
      }
      save_receipts: {
        Row: {
          cid: string
          client_request_id: string
          completed_at: string | null
          created_at: string
          overall_status: string
          payload_hash: string | null
          provenance: string
          save_id: string
          session_id: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          watermark: string
        }
        Insert: {
          cid: string
          client_request_id: string
          completed_at?: string | null
          created_at?: string
          overall_status: string
          payload_hash?: string | null
          provenance?: string
          save_id?: string
          session_id?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          watermark?: string
        }
        Update: {
          cid?: string
          client_request_id?: string
          completed_at?: string | null
          created_at?: string
          overall_status?: string
          payload_hash?: string | null
          provenance?: string
          save_id?: string
          session_id?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          watermark?: string
        }
        Relationships: []
      }
      save_recovery_access_log: {
        Row: {
          access_id: string
          action: string
          actor_principal: string | null
          actor_subject: string | null
          at: string
          authorized_by: string | null
          reason: string
          vault_id: string
        }
        Insert: {
          access_id?: string
          action: string
          actor_principal?: string | null
          actor_subject?: string | null
          at?: string
          authorized_by?: string | null
          reason: string
          vault_id: string
        }
        Update: {
          access_id?: string
          action?: string
          actor_principal?: string | null
          actor_subject?: string | null
          at?: string
          authorized_by?: string | null
          reason?: string
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "save_recovery_access_log_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "save_recovery_vault"
            referencedColumns: ["vault_id"]
          },
        ]
      }
      save_recovery_vault: {
        Row: {
          aad: string
          alg: string
          ciphertext: string
          created_at: string
          erase_reason: string | null
          erased_at: string | null
          expires_at: string
          iv: string
          master_key_version: string
          plaintext_bytes: number
          save_attempt_id: string
          vault_id: string
          wrap_iv: string
          wrapped_dek: string | null
        }
        Insert: {
          aad: string
          alg?: string
          ciphertext: string
          created_at?: string
          erase_reason?: string | null
          erased_at?: string | null
          expires_at: string
          iv: string
          master_key_version: string
          plaintext_bytes: number
          save_attempt_id: string
          vault_id?: string
          wrap_iv: string
          wrapped_dek?: string | null
        }
        Update: {
          aad?: string
          alg?: string
          ciphertext?: string
          created_at?: string
          erase_reason?: string | null
          erased_at?: string | null
          expires_at?: string
          iv?: string
          master_key_version?: string
          plaintext_bytes?: number
          save_attempt_id?: string
          vault_id?: string
          wrap_iv?: string
          wrapped_dek?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "save_recovery_vault_save_attempt_id_fkey"
            columns: ["save_attempt_id"]
            isOneToOne: false
            referencedRelation: "save_attempt"
            referencedColumns: ["save_attempt_id"]
          },
        ]
      }
      scheduled_actions: {
        Row: {
          attempts: number
          blueprint_id: string | null
          build_spec: string | null
          cadence: string | null
          cid: string | null
          cid_quarantine_reason: string | null
          claim_expires_at: string | null
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          created_at: string
          detail: string | null
          fired_at: string | null
          gates_passed: number | null
          gates_total: number | null
          id: string
          last_error: string | null
          last_receipt: Json | null
          outcome: string | null
          owner: string
          program: string | null
          run_at: string | null
          seq: number | null
          spec_accepted_at: string | null
          spec_accepted_by: string | null
          spec_author: string | null
          spec_status: string | null
          status: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id: string
          title: string
          trigger_ref: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          blueprint_id?: string | null
          build_spec?: string | null
          cadence?: string | null
          cid?: string | null
          cid_quarantine_reason?: string | null
          claim_expires_at?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          created_at?: string
          detail?: string | null
          fired_at?: string | null
          gates_passed?: number | null
          gates_total?: number | null
          id?: string
          last_error?: string | null
          last_receipt?: Json | null
          outcome?: string | null
          owner?: string
          program?: string | null
          run_at?: string | null
          seq?: number | null
          spec_accepted_at?: string | null
          spec_accepted_by?: string | null
          spec_author?: string | null
          spec_status?: string | null
          status?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id: string
          title: string
          trigger_ref?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          blueprint_id?: string | null
          build_spec?: string | null
          cadence?: string | null
          cid?: string | null
          cid_quarantine_reason?: string | null
          claim_expires_at?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          created_at?: string
          detail?: string | null
          fired_at?: string | null
          gates_passed?: number | null
          gates_total?: number | null
          id?: string
          last_error?: string | null
          last_receipt?: Json | null
          outcome?: string | null
          owner?: string
          program?: string | null
          run_at?: string | null
          seq?: number | null
          spec_accepted_at?: string | null
          spec_accepted_by?: string | null
          spec_author?: string | null
          spec_status?: string | null
          status?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant_id?: string
          title?: string
          trigger_ref?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_actions_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "blueprints"
            referencedColumns: ["id"]
          },
        ]
      }
      service_delegations: {
        Row: {
          authorized_by: string | null
          cid: string
          created_at: string
          delegation_id: string
          expires_at: string | null
          human_principal_id: string | null
          purpose: string
          revoked_at: string | null
          scopes: string[]
          service_principal_id: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          authorized_by?: string | null
          cid: string
          created_at?: string
          delegation_id?: string
          expires_at?: string | null
          human_principal_id?: string | null
          purpose: string
          revoked_at?: string | null
          scopes?: string[]
          service_principal_id: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          authorized_by?: string | null
          cid?: string
          created_at?: string
          delegation_id?: string
          expires_at?: string | null
          human_principal_id?: string | null
          purpose?: string
          revoked_at?: string | null
          scopes?: string[]
          service_principal_id?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: [
          {
            foreignKeyName: "service_delegations_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "hq_readiness"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "service_delegations_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "identity_census"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "service_delegations_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "service_delegations_human_principal_id_fkey"
            columns: ["human_principal_id"]
            isOneToOne: false
            referencedRelation: "principals"
            referencedColumns: ["principal_id"]
          },
          {
            foreignKeyName: "service_delegations_service_principal_id_fkey"
            columns: ["service_principal_id"]
            isOneToOne: false
            referencedRelation: "principals"
            referencedColumns: ["principal_id"]
          },
        ]
      }
      session_checkpoints: {
        Row: {
          cid: string | null
          created_at: string
          decisions_pending: Json
          deferrals: Json
          financial_residue: string | null
          id: string
          kind: string
          notion_page_id: string | null
          open_loops: Json
          principal_state: string | null
          session_id: string | null
          staleness_flags: Json
          task_states: Json
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant: string
        }
        Insert: {
          cid?: string | null
          created_at?: string
          decisions_pending?: Json
          deferrals?: Json
          financial_residue?: string | null
          id?: string
          kind: string
          notion_page_id?: string | null
          open_loops?: Json
          principal_state?: string | null
          session_id?: string | null
          staleness_flags?: Json
          task_states?: Json
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant: string
        }
        Update: {
          cid?: string | null
          created_at?: string
          decisions_pending?: Json
          deferrals?: Json
          financial_residue?: string | null
          id?: string
          kind?: string
          notion_page_id?: string | null
          open_loops?: Json
          principal_state?: string | null
          session_id?: string | null
          staleness_flags?: Json
          task_states?: Json
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_checkpoints_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_event: {
        Row: {
          arg_digest: string | null
          cid: string
          created_at: string
          error_code: string | null
          event_id: string
          latency_ms: number | null
          ok: boolean
          result_digest: string | null
          session_id: string | null
          session_source: string | null
          surface: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tool: string
          tool_manifest_version: string | null
        }
        Insert: {
          arg_digest?: string | null
          cid: string
          created_at?: string
          error_code?: string | null
          event_id?: string
          latency_ms?: number | null
          ok: boolean
          result_digest?: string | null
          session_id?: string | null
          session_source?: string | null
          surface?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tool: string
          tool_manifest_version?: string | null
        }
        Update: {
          arg_digest?: string | null
          cid?: string
          created_at?: string
          error_code?: string | null
          event_id?: string
          latency_ms?: number | null
          ok?: boolean
          result_digest?: string | null
          session_id?: string | null
          session_source?: string | null
          surface?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tool?: string
          tool_manifest_version?: string | null
        }
        Relationships: []
      }
      session_transcript: {
        Row: {
          body_md: string
          chars: number | null
          cid: string
          created_at: string
          fidelity: string
          occurred_at: string | null
          part: number
          parts_total: number
          scrub_note: string | null
          scrubbed: boolean
          session_id: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          transcript_id: string
          written_by: string | null
        }
        Insert: {
          body_md: string
          chars?: number | null
          cid: string
          created_at?: string
          fidelity: string
          occurred_at?: string | null
          part?: number
          parts_total?: number
          scrub_note?: string | null
          scrubbed?: boolean
          session_id?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          transcript_id?: string
          written_by?: string | null
        }
        Update: {
          body_md?: string
          chars?: number | null
          cid?: string
          created_at?: string
          fidelity?: string
          occurred_at?: string | null
          part?: number
          parts_total?: number
          scrub_note?: string | null
          scrubbed?: boolean
          session_id?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          transcript_id?: string
          written_by?: string | null
        }
        Relationships: []
      }
      sessions: {
        Row: {
          cid: string | null
          close_kind: string | null
          closed_at: string | null
          id: string
          kernel_version: number | null
          meta: Json
          opened_at: string
          surface: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant: string
          title: string | null
          titled_at: string | null
          titled_by: string | null
          tool_manifest_version: string | null
        }
        Insert: {
          cid?: string | null
          close_kind?: string | null
          closed_at?: string | null
          id?: string
          kernel_version?: number | null
          meta?: Json
          opened_at?: string
          surface?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant: string
          title?: string | null
          titled_at?: string | null
          titled_by?: string | null
          tool_manifest_version?: string | null
        }
        Update: {
          cid?: string | null
          close_kind?: string | null
          closed_at?: string | null
          id?: string
          kernel_version?: number | null
          meta?: Json
          opened_at?: string
          surface?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant?: string
          title?: string | null
          titled_at?: string | null
          titled_by?: string | null
          tool_manifest_version?: string | null
        }
        Relationships: []
      }
      signal_sighting: {
        Row: {
          at: string
          cid: string
          detail_md: string | null
          link: Json | null
          raised_by: string
          session_id: string | null
          sighting_id: string
          signal_id: string | null
          signal_key: string
          subject: string | null
          surface: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tool: string | null
        }
        Insert: {
          at?: string
          cid: string
          detail_md?: string | null
          link?: Json | null
          raised_by?: string
          session_id?: string | null
          sighting_id?: string
          signal_id?: string | null
          signal_key: string
          subject?: string | null
          surface?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tool?: string | null
        }
        Update: {
          at?: string
          cid?: string
          detail_md?: string | null
          link?: Json | null
          raised_by?: string
          session_id?: string | null
          sighting_id?: string
          signal_id?: string | null
          signal_key?: string
          subject?: string | null
          surface?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tool?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signal_sighting_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "improvement_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      site_events: {
        Row: {
          event: string
          id: string
          referrer: string | null
          route: string | null
          session_id: string | null
          ts: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          event: string
          id?: string
          referrer?: string | null
          route?: string | null
          session_id?: string | null
          ts?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          event?: string
          id?: string
          referrer?: string | null
          route?: string | null
          session_id?: string | null
          ts?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      start1a_rollback_snapshot: {
        Row: {
          created_at: string | null
          id: string | null
          name: string | null
          slug: string | null
          snapshot_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          name?: string | null
          slug?: string | null
          snapshot_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          name?: string | null
          slug?: string | null
          snapshot_at?: string | null
        }
        Relationships: []
      }
      storyline: {
        Row: {
          body_md: string
          cid: string
          cites: Json | null
          created_at: string
          curn: string | null
          embedding: string | null
          grade: string
          id: string
          kind: string
          lane: string | null
          period_end: string | null
          period_start: string | null
          revision: number
          status: string
          supersedes: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          title: string
        }
        Insert: {
          body_md: string
          cid: string
          cites?: Json | null
          created_at?: string
          curn?: string | null
          embedding?: string | null
          grade?: string
          id?: string
          kind: string
          lane?: string | null
          period_end?: string | null
          period_start?: string | null
          revision?: number
          status?: string
          supersedes?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          title: string
        }
        Update: {
          body_md?: string
          cid?: string
          cites?: Json | null
          created_at?: string
          curn?: string | null
          embedding?: string | null
          grade?: string
          id?: string
          kind?: string
          lane?: string | null
          period_end?: string | null
          period_start?: string | null
          revision?: number
          status?: string
          supersedes?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "storyline_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "hq_readiness"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "storyline_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "identity_census"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "storyline_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "storyline_supersedes_fkey"
            columns: ["supersedes"]
            isOneToOne: false
            referencedRelation: "storyline"
            referencedColumns: ["id"]
          },
        ]
      }
      study_agents: {
        Row: {
          cid: string | null
          cid_quarantine_reason: string | null
          created_at: string
          id: string
          name: string
          persona_md: string | null
          role_summary: string | null
          scope: string
          status: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id: string | null
          version: number
        }
        Insert: {
          cid?: string | null
          cid_quarantine_reason?: string | null
          created_at?: string
          id?: string
          name: string
          persona_md?: string | null
          role_summary?: string | null
          scope?: string
          status?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id?: string | null
          version?: number
        }
        Update: {
          cid?: string | null
          cid_quarantine_reason?: string | null
          created_at?: string
          id?: string
          name?: string
          persona_md?: string | null
          role_summary?: string | null
          scope?: string
          status?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant_id?: string | null
          version?: number
        }
        Relationships: []
      }
      study_skills: {
        Row: {
          body_md: string | null
          category: string
          changelog: string | null
          cid: string | null
          cid_quarantine_reason: string | null
          created_at: string
          distribution_status: string
          id: string
          name: string
          observed_at: string | null
          observed_body_version: string | null
          observed_bytes: number | null
          observed_in_manifest: boolean | null
          observed_sha256: string | null
          observed_source: string | null
          reconciliation_state: string | null
          scope: string
          sha256: string | null
          status: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id: string | null
          version: string
          version_state: string | null
        }
        Insert: {
          body_md?: string | null
          category: string
          changelog?: string | null
          cid?: string | null
          cid_quarantine_reason?: string | null
          created_at?: string
          distribution_status?: string
          id?: string
          name: string
          observed_at?: string | null
          observed_body_version?: string | null
          observed_bytes?: number | null
          observed_in_manifest?: boolean | null
          observed_sha256?: string | null
          observed_source?: string | null
          reconciliation_state?: string | null
          scope?: string
          sha256?: string | null
          status?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id?: string | null
          version: string
          version_state?: string | null
        }
        Update: {
          body_md?: string | null
          category?: string
          changelog?: string | null
          cid?: string | null
          cid_quarantine_reason?: string | null
          created_at?: string
          distribution_status?: string
          id?: string
          name?: string
          observed_at?: string | null
          observed_body_version?: string | null
          observed_bytes?: number | null
          observed_in_manifest?: boolean | null
          observed_sha256?: string | null
          observed_source?: string | null
          reconciliation_state?: string | null
          scope?: string
          sha256?: string | null
          status?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant_id?: string | null
          version?: string
          version_state?: string | null
        }
        Relationships: []
      }
      suppression_list: {
        Row: {
          contact_id: string | null
          created_at: string
          email: string
          id: string
          reason: string
          scope: string
          source: string
          workspace_id: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          email: string
          id?: string
          reason: string
          scope?: string
          source: string
          workspace_id: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          email?: string
          id?: string
          reason?: string
          scope?: string
          source?: string
          workspace_id?: string
        }
        Relationships: []
      }
      surface_pin: {
        Row: {
          cid: string
          held: boolean
          pinned_at: string
          pinned_by: string | null
          surface_key: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          version: string
        }
        Insert: {
          cid: string
          held?: boolean
          pinned_at?: string
          pinned_by?: string | null
          surface_key: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          version: string
        }
        Update: {
          cid?: string
          held?: boolean
          pinned_at?: string
          pinned_by?: string | null
          surface_key?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "surface_pin_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "hq_readiness"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "surface_pin_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "identity_census"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "surface_pin_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
          },
        ]
      }
      surface_version: {
        Row: {
          author: string | null
          body: string
          bytes: number | null
          created_at: string
          encoding: string
          has_body: boolean | null
          id: number
          published_at: string | null
          reason: string | null
          sha256: string | null
          state: string
          surface_key: string
          version: string
        }
        Insert: {
          author?: string | null
          body?: string
          bytes?: number | null
          created_at?: string
          encoding?: string
          has_body?: boolean | null
          id?: number
          published_at?: string | null
          reason?: string | null
          sha256?: string | null
          state?: string
          surface_key: string
          version: string
        }
        Update: {
          author?: string | null
          body?: string
          bytes?: number | null
          created_at?: string
          encoding?: string
          has_body?: boolean | null
          id?: number
          published_at?: string | null
          reason?: string | null
          sha256?: string | null
          state?: string
          surface_key?: string
          version?: string
        }
        Relationships: []
      }
      taylor_messages: {
        Row: {
          cid: string
          content: string
          created_at: string
          id: string
          is_synthetic: boolean
          role: string
          surface: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          thread_id: string
        }
        Insert: {
          cid: string
          content: string
          created_at?: string
          id?: string
          is_synthetic?: boolean
          role: string
          surface: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          thread_id: string
        }
        Update: {
          cid?: string
          content?: string
          created_at?: string
          id?: string
          is_synthetic?: boolean
          role?: string
          surface?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "taylor_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "taylor_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      taylor_questions: {
        Row: {
          answer: string | null
          answered_at: string | null
          cid: string | null
          cid_quarantine_reason: string | null
          context: string
          created_at: string
          id: string
          question: string
          status: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id: string
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          cid?: string | null
          cid_quarantine_reason?: string | null
          context?: string
          created_at?: string
          id?: string
          question: string
          status?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant_id: string
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          cid?: string | null
          cid_quarantine_reason?: string | null
          context?: string
          created_at?: string
          id?: string
          question?: string
          status?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "taylor_questions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "onboarding_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      taylor_threads: {
        Row: {
          cid: string
          created_at: string
          id: string
          status: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          cid: string
          created_at?: string
          id?: string
          status?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          cid?: string
          created_at?: string
          id?: string
          status?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: []
      }
      taylor_turn_receipts: {
        Row: {
          auth_user_id: string
          cid: string
          client_request_id: string
          created_at: string
          fact_id: string | null
          onboarding_id: string
          outcome: string
          question_id: string | null
          receipt_id: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          auth_user_id: string
          cid: string
          client_request_id: string
          created_at?: string
          fact_id?: string | null
          onboarding_id: string
          outcome: string
          question_id?: string | null
          receipt_id?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          auth_user_id?: string
          cid?: string
          client_request_id?: string
          created_at?: string
          fact_id?: string | null
          onboarding_id?: string
          outcome?: string
          question_id?: string | null
          receipt_id?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: []
      }
      templates: {
        Row: {
          body: string
          channel: string
          created_at: string
          id: string
          subject: string | null
          template_type: string
          tone: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          body: string
          channel?: string
          created_at?: string
          id?: string
          subject?: string | null
          template_type: string
          tone?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          id?: string
          subject?: string | null
          template_type?: string
          tone?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tenancy_freeze: {
        Row: {
          frozen_at: string
          frozen_by: string
          id: number
          rule_md: string
        }
        Insert: {
          frozen_at?: string
          frozen_by: string
          id?: number
          rule_md: string
        }
        Update: {
          frozen_at?: string
          frozen_by?: string
          id?: number
          rule_md?: string
        }
        Relationships: []
      }
      tenancy_quarantine: {
        Row: {
          detected_at: string
          id: string
          reason: string
          resolved_at: string | null
          table_name: string
          total_rows: number
          unclassified_rows: number
        }
        Insert: {
          detected_at?: string
          id?: string
          reason: string
          resolved_at?: string | null
          table_name: string
          total_rows: number
          unclassified_rows: number
        }
        Update: {
          detected_at?: string
          id?: string
          reason?: string
          resolved_at?: string | null
          table_name?: string
          total_rows?: number
          unclassified_rows?: number
        }
        Relationships: []
      }
      tenancy_quarantine_row: {
        Row: {
          id: string
          quarantined_at: string
          reason: string
          row_json: Json
          row_pk: string | null
          table_name: string
        }
        Insert: {
          id?: string
          quarantined_at?: string
          reason: string
          row_json: Json
          row_pk?: string | null
          table_name: string
        }
        Update: {
          id?: string
          quarantined_at?: string
          reason?: string
          row_json?: Json
          row_pk?: string | null
          table_name?: string
        }
        Relationships: []
      }
      tenant_alias: {
        Row: {
          alias: string
          ambiguous: boolean
          cid: string | null
          created_at: string
          key_space: string
          note: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          alias: string
          ambiguous?: boolean
          cid?: string | null
          created_at?: string
          key_space: string
          note?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          alias?: string
          ambiguous?: boolean
          cid?: string | null
          created_at?: string
          key_space?: string
          note?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: [
          {
            foreignKeyName: "tenant_alias_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "hq_readiness"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "tenant_alias_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "identity_census"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "tenant_alias_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
          },
        ]
      }
      tenant_members: {
        Row: {
          auth_user_id: string
          cid: string
          created_at: string
          granted_at: string | null
          granted_by: string | null
          provenance_ref: string | null
          provenance_type: string | null
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          role: string
          status: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          auth_user_id: string
          cid: string
          created_at?: string
          granted_at?: string | null
          granted_by?: string | null
          provenance_ref?: string | null
          provenance_type?: string | null
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role?: string
          status?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          auth_user_id?: string
          cid?: string
          created_at?: string
          granted_at?: string | null
          granted_by?: string | null
          provenance_ref?: string | null
          provenance_type?: string | null
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role?: string
          status?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "hq_readiness"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "tenant_members_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "identity_census"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "tenant_members_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
          },
        ]
      }
      tenant_memberships_v2: {
        Row: {
          authority_receipt: string | null
          authorized_by: string | null
          cid: string
          effective_at: string | null
          membership_id: string
          principal_id: string
          revoked_at: string | null
          role: string
          scopes: string[]
          status: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          authority_receipt?: string | null
          authorized_by?: string | null
          cid: string
          effective_at?: string | null
          membership_id?: string
          principal_id: string
          revoked_at?: string | null
          role?: string
          scopes?: string[]
          status?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          authority_receipt?: string | null
          authorized_by?: string | null
          cid?: string
          effective_at?: string | null
          membership_id?: string
          principal_id?: string
          revoked_at?: string | null
          role?: string
          scopes?: string[]
          status?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: [
          {
            foreignKeyName: "tenant_memberships_v2_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "hq_readiness"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "tenant_memberships_v2_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "identity_census"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "tenant_memberships_v2_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "tenant_memberships_v2_principal_id_fkey"
            columns: ["principal_id"]
            isOneToOne: false
            referencedRelation: "principals"
            referencedColumns: ["principal_id"]
          },
        ]
      }
      tenant_migration: {
        Row: {
          cid: string
          client_verification_owner: string | null
          cutover_owner: string | null
          identity_mode: string
          last_verified_at: string | null
          migration_wave: number
          notes: string | null
          public_ref: string | null
          source_canon: string
          started_at: string | null
          target_canon: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          cid: string
          client_verification_owner?: string | null
          cutover_owner?: string | null
          identity_mode?: string
          last_verified_at?: string | null
          migration_wave?: number
          notes?: string | null
          public_ref?: string | null
          source_canon?: string
          started_at?: string | null
          target_canon?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          cid?: string
          client_verification_owner?: string | null
          cutover_owner?: string | null
          identity_mode?: string
          last_verified_at?: string | null
          migration_wave?: number
          notes?: string | null
          public_ref?: string | null
          source_canon?: string
          started_at?: string | null
          target_canon?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: [
          {
            foreignKeyName: "tenant_migration_cid_fkey"
            columns: ["cid"]
            isOneToOne: true
            referencedRelation: "hq_readiness"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "tenant_migration_cid_fkey"
            columns: ["cid"]
            isOneToOne: true
            referencedRelation: "identity_census"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "tenant_migration_cid_fkey"
            columns: ["cid"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
          },
        ]
      }
      tenant_offices: {
        Row: {
          boardroom_db: string
          cid: string | null
          cid_quarantine_reason: string | null
          created_at: string
          label: string | null
          provider: string
          provisioned_by: string | null
          status: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant: string
          token_ref: string | null
          updated_at: string
        }
        Insert: {
          boardroom_db: string
          cid?: string | null
          cid_quarantine_reason?: string | null
          created_at?: string
          label?: string | null
          provider?: string
          provisioned_by?: string | null
          status?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant: string
          token_ref?: string | null
          updated_at?: string
        }
        Update: {
          boardroom_db?: string
          cid?: string | null
          cid_quarantine_reason?: string | null
          created_at?: string
          label?: string | null
          provider?: string
          provisioned_by?: string | null
          status?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant?: string
          token_ref?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tenant_session_context: {
        Row: {
          auth_user_id: string | null
          cid: string
          established_at: string
          expires_at: string | null
          revoked_at: string | null
          session_id: string
          source: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          auth_user_id?: string | null
          cid: string
          established_at?: string
          expires_at?: string | null
          revoked_at?: string | null
          session_id: string
          source?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          auth_user_id?: string | null
          cid?: string
          established_at?: string
          expires_at?: string | null
          revoked_at?: string | null
          session_id?: string
          source?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: [
          {
            foreignKeyName: "tsc_membership_fk"
            columns: ["auth_user_id", "cid"]
            isOneToOne: false
            referencedRelation: "tenant_members"
            referencedColumns: ["auth_user_id", "cid"]
          },
        ]
      }
      tenant_surfaces: {
        Row: {
          cid: string | null
          cid_quarantine_reason: string | null
          created_at: string
          kind: string
          label: string | null
          notion_id: string
          status: string
          surface_key: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant: string
          updated_at: string
          write_policy: string
        }
        Insert: {
          cid?: string | null
          cid_quarantine_reason?: string | null
          created_at?: string
          kind: string
          label?: string | null
          notion_id: string
          status?: string
          surface_key: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenant: string
          updated_at?: string
          write_policy?: string
        }
        Update: {
          cid?: string | null
          cid_quarantine_reason?: string | null
          created_at?: string
          kind?: string
          label?: string | null
          notion_id?: string
          status?: string
          surface_key?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenant?: string
          updated_at?: string
          write_policy?: string
        }
        Relationships: []
      }
      tenants: {
        Row: {
          cid: string
          cob_name: string | null
          cob_name_normalized: string | null
          created_at: string
          display_name: string
          enterprise: string | null
          normalized_at: string | null
          normalizer_version: string | null
          notes: string | null
          office_mode: string
          onboarding_key: string | null
          principal: string | null
          public_ref: string | null
          status: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tier: string
          timezone: string
          updated_at: string
        }
        Insert: {
          cid: string
          cob_name?: string | null
          cob_name_normalized?: string | null
          created_at?: string
          display_name: string
          enterprise?: string | null
          normalized_at?: string | null
          normalizer_version?: string | null
          notes?: string | null
          office_mode?: string
          onboarding_key?: string | null
          principal?: string | null
          public_ref?: string | null
          status?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tier?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          cid?: string
          cob_name?: string | null
          cob_name_normalized?: string | null
          created_at?: string
          display_name?: string
          enterprise?: string | null
          normalized_at?: string | null
          normalizer_version?: string | null
          notes?: string | null
          office_mode?: string
          onboarding_key?: string | null
          principal?: string | null
          public_ref?: string | null
          status?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tier?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      timeline_events: {
        Row: {
          account_id: string
          body: string | null
          channel: string
          contact_id: string | null
          direction: Database["public"]["Enums"]["item_direction"]
          id: string
          item_id: string | null
          occurred_at: string
          raw_json: Json | null
          summary: string
        }
        Insert: {
          account_id: string
          body?: string | null
          channel?: string
          contact_id?: string | null
          direction?: Database["public"]["Enums"]["item_direction"]
          id?: string
          item_id?: string | null
          occurred_at?: string
          raw_json?: Json | null
          summary: string
        }
        Update: {
          account_id?: string
          body?: string | null
          channel?: string
          contact_id?: string | null
          direction?: Database["public"]["Enums"]["item_direction"]
          id?: string
          item_id?: string | null
          occurred_at?: string
          raw_json?: Json | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "timeline_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_catalog: {
        Row: {
          circuit: string | null
          created_at: string
          degraded_behavior: string | null
          family: string
          id: number
          notes: string | null
          provenance: string
          purpose: string
          reads: string | null
          status: string
          surface: string
          tenant_scoped: boolean
          tool_key: string
          updated_at: string
          verified_at: string | null
          verified_how: string | null
          writes: string | null
        }
        Insert: {
          circuit?: string | null
          created_at?: string
          degraded_behavior?: string | null
          family: string
          id?: number
          notes?: string | null
          provenance: string
          purpose: string
          reads?: string | null
          status?: string
          surface?: string
          tenant_scoped?: boolean
          tool_key: string
          updated_at?: string
          verified_at?: string | null
          verified_how?: string | null
          writes?: string | null
        }
        Update: {
          circuit?: string | null
          created_at?: string
          degraded_behavior?: string | null
          family?: string
          id?: number
          notes?: string | null
          provenance?: string
          purpose?: string
          reads?: string | null
          status?: string
          surface?: string
          tenant_scoped?: boolean
          tool_key?: string
          updated_at?: string
          verified_at?: string | null
          verified_how?: string | null
          writes?: string | null
        }
        Relationships: []
      }
      tool_contract_mode: {
        Row: {
          changed_at: string
          mode: string
          only_row: boolean
          reason: string | null
        }
        Insert: {
          changed_at?: string
          mode?: string
          only_row?: boolean
          reason?: string | null
        }
        Update: {
          changed_at?: string
          mode?: string
          only_row?: boolean
          reason?: string | null
        }
        Relationships: []
      }
      tool_contract_violation: {
        Row: {
          actor: string | null
          at: string
          cid: string | null
          declared_writes: string | null
          id: number
          ledger_id: number | null
          mode: string
          op: string | null
          register: string
          tool_key: string | null
        }
        Insert: {
          actor?: string | null
          at?: string
          cid?: string | null
          declared_writes?: string | null
          id?: number
          ledger_id?: number | null
          mode: string
          op?: string | null
          register: string
          tool_key?: string | null
        }
        Update: {
          actor?: string | null
          at?: string
          cid?: string | null
          declared_writes?: string | null
          id?: number
          ledger_id?: number | null
          mode?: string
          op?: string | null
          register?: string
          tool_key?: string | null
        }
        Relationships: []
      }
      tool_function_map: {
        Row: {
          created_at: string
          edge_function: string | null
          fn_name: string | null
          note: string | null
          tool_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          edge_function?: string | null
          fn_name?: string | null
          note?: string | null
          tool_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          edge_function?: string | null
          fn_name?: string | null
          note?: string | null
          tool_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_function_map_tool_key_fkey"
            columns: ["tool_key"]
            isOneToOne: true
            referencedRelation: "tool_catalog"
            referencedColumns: ["tool_key"]
          },
        ]
      }
      tool_manifest_registry: {
        Row: {
          first_seen_at: string
          renames: Json
          tools: string[]
          version: string
        }
        Insert: {
          first_seen_at?: string
          renames?: Json
          tools: string[]
          version: string
        }
        Update: {
          first_seen_at?: string
          renames?: Json
          tools?: string[]
          version?: string
        }
        Relationships: []
      }
      unbound_principals: {
        Row: {
          bound_at: string | null
          bound_by: string | null
          cid: string | null
          created_at: string
          escalated_at: string | null
          escalation_curn: string | null
          evidence_needed: string
          first_seen_at: string
          id: string
          issuer: string | null
          last_seen_at: string
          principal_id: string | null
          provider_subject: string
          resolution_mode: string
          sightings: number
          status: string
          tenant_claim: string | null
          updated_at: string
        }
        Insert: {
          bound_at?: string | null
          bound_by?: string | null
          cid?: string | null
          created_at?: string
          escalated_at?: string | null
          escalation_curn?: string | null
          evidence_needed?: string
          first_seen_at?: string
          id?: string
          issuer?: string | null
          last_seen_at?: string
          principal_id?: string | null
          provider_subject: string
          resolution_mode: string
          sightings?: number
          status?: string
          tenant_claim?: string | null
          updated_at?: string
        }
        Update: {
          bound_at?: string | null
          bound_by?: string | null
          cid?: string | null
          created_at?: string
          escalated_at?: string | null
          escalation_curn?: string | null
          evidence_needed?: string
          first_seen_at?: string
          id?: string
          issuer?: string | null
          last_seen_at?: string
          principal_id?: string | null
          provider_subject?: string
          resolution_mode?: string
          sightings?: number
          status?: string
          tenant_claim?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          action_id: string
          billing_period: string
          channel: string
          event_type: string
          id: string
          metadata: Json
          recorded_at: string
          stripe_reported: boolean
          unit_count: number
          workspace_id: string
        }
        Insert: {
          action_id: string
          billing_period?: string
          channel?: string
          event_type?: string
          id?: string
          metadata?: Json
          recorded_at?: string
          stripe_reported?: boolean
          unit_count?: number
          workspace_id: string
        }
        Update: {
          action_id?: string
          billing_period?: string
          channel?: string
          event_type?: string
          id?: string
          metadata?: Json
          recorded_at?: string
          stripe_reported?: boolean
          unit_count?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_state_alias: {
        Row: {
          alias: string
          canonical: string
        }
        Insert: {
          alias: string
          canonical: string
        }
        Update: {
          alias?: string
          canonical?: string
        }
        Relationships: []
      }
      vertical_packs: {
        Row: {
          config: Json
          created_at: string
          id: string
          name: string
          workspace_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          name: string
          workspace_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vertical_packs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      vocabulary_writer_registry: {
        Row: {
          added_at: string
          note: string | null
          value: string
          vocabulary: string
          writer: string
        }
        Insert: {
          added_at?: string
          note?: string | null
          value: string
          vocabulary: string
          writer: string
        }
        Update: {
          added_at?: string
          note?: string | null
          value?: string
          vocabulary?: string
          writer?: string
        }
        Relationships: []
      }
      wire_grants: {
        Row: {
          cid: string
          created_at: string
          grant_status: string
          granted_at: string | null
          id: string
          notes: string | null
          provider: string
          source: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          updated_at: string
        }
        Insert: {
          cid: string
          created_at?: string
          grant_status?: string
          granted_at?: string | null
          id?: string
          notes?: string | null
          provider?: string
          source: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          updated_at?: string
        }
        Update: {
          cid?: string
          created_at?: string
          grant_status?: string
          granted_at?: string | null
          id?: string
          notes?: string | null
          provider?: string
          source?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          updated_at?: string
        }
        Relationships: []
      }
      work_item: {
        Row: {
          answered_by_claim: string | null
          answered_by_memory: string | null
          cid: string
          close_reason: string | null
          closed_at: string | null
          consequence: string | null
          consequence_note: string | null
          created_at: string
          date_basis: string | null
          date_kind: string | null
          dedup_key: string
          detail: string | null
          due_date: string | null
          kind: string
          lane: string | null
          last_surfaced: string | null
          origin: string
          owner: string | null
          principal_acts: boolean | null
          ref_date: string | null
          relationship: number | null
          significance: number | null
          snooze_until: string | null
          state: string
          subject_id: string | null
          superseded_by: string | null
          surfaced_count: number
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          title: string
          trigger: string | null
          updated_at: string
          urgency: number | null
          work_id: string
        }
        Insert: {
          answered_by_claim?: string | null
          answered_by_memory?: string | null
          cid: string
          close_reason?: string | null
          closed_at?: string | null
          consequence?: string | null
          consequence_note?: string | null
          created_at?: string
          date_basis?: string | null
          date_kind?: string | null
          dedup_key: string
          detail?: string | null
          due_date?: string | null
          kind?: string
          lane?: string | null
          last_surfaced?: string | null
          origin: string
          owner?: string | null
          principal_acts?: boolean | null
          ref_date?: string | null
          relationship?: number | null
          significance?: number | null
          snooze_until?: string | null
          state?: string
          subject_id?: string | null
          superseded_by?: string | null
          surfaced_count?: number
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          title: string
          trigger?: string | null
          updated_at?: string
          urgency?: number | null
          work_id?: string
        }
        Update: {
          answered_by_claim?: string | null
          answered_by_memory?: string | null
          cid?: string
          close_reason?: string | null
          closed_at?: string | null
          consequence?: string | null
          consequence_note?: string | null
          created_at?: string
          date_basis?: string | null
          date_kind?: string | null
          dedup_key?: string
          detail?: string | null
          due_date?: string | null
          kind?: string
          lane?: string | null
          last_surfaced?: string | null
          origin?: string
          owner?: string | null
          principal_acts?: boolean | null
          ref_date?: string | null
          relationship?: number | null
          significance?: number | null
          snooze_until?: string | null
          state?: string
          subject_id?: string | null
          superseded_by?: string | null
          surfaced_count?: number
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          title?: string
          trigger?: string | null
          updated_at?: string
          urgency?: number | null
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_item_answered_by_claim_fkey"
            columns: ["answered_by_claim"]
            isOneToOne: false
            referencedRelation: "world_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_answered_by_claim_fkey"
            columns: ["answered_by_claim"]
            isOneToOne: false
            referencedRelation: "world_delta_v"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "work_item_answered_by_memory_fkey"
            columns: ["answered_by_memory"]
            isOneToOne: false
            referencedRelation: "memory_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "entity_resolvable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "world_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "work_item"
            referencedColumns: ["work_id"]
          },
          {
            foreignKeyName: "work_item_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "work_ranked"
            referencedColumns: ["work_id"]
          },
        ]
      }
      work_link: {
        Row: {
          cid: string
          created_at: string
          link_id: number
          ref_id: string
          registry: string
          role: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          work_id: string
        }
        Insert: {
          cid: string
          created_at?: string
          link_id?: number
          ref_id: string
          registry: string
          role?: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          work_id: string
        }
        Update: {
          cid?: string
          created_at?: string
          link_id?: number
          ref_id?: string
          registry?: string
          role?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_link_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "work_item"
            referencedColumns: ["work_id"]
          },
          {
            foreignKeyName: "work_link_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "work_ranked"
            referencedColumns: ["work_id"]
          },
        ]
      }
      work_merge_receipt: {
        Row: {
          cid: string
          created_at: string
          decision: string
          discarded: Json
          incoming_fingerprint: string | null
          incoming_title: string
          kept_fingerprint: string | null
          kept_title: string | null
          kept_work_id: string | null
          merge_receipt_id: string
          refusal_reason: string | null
          signature_incoming: Json
          signature_kept: Json
          similarity_score: number | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          cid: string
          created_at?: string
          decision: string
          discarded?: Json
          incoming_fingerprint?: string | null
          incoming_title: string
          kept_fingerprint?: string | null
          kept_title?: string | null
          kept_work_id?: string | null
          merge_receipt_id?: string
          refusal_reason?: string | null
          signature_incoming?: Json
          signature_kept?: Json
          similarity_score?: number | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          cid?: string
          created_at?: string
          decision?: string
          discarded?: Json
          incoming_fingerprint?: string | null
          incoming_title?: string
          kept_fingerprint?: string | null
          kept_title?: string | null
          kept_work_id?: string | null
          merge_receipt_id?: string
          refusal_reason?: string | null
          signature_incoming?: Json
          signature_kept?: Json
          similarity_score?: number | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: []
      }
      work_orders: {
        Row: {
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          id: string
          item_id: string
          order_type: string
          params: Json
          result_note: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          item_id: string
          order_type: string
          params?: Json
          result_note?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          item_id?: string
          order_type?: string
          params?: Json
          result_note?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      work_reschedule_receipt: {
        Row: {
          cid: string
          created_at: string
          date_kind: string | null
          direction: string
          from_due: string | null
          id: string
          moved_by: string
          reason: string
          surface: string | null
          title: string | null
          to_due: string
          urgency_after: number | null
          urgency_before: number | null
          work_id: string
        }
        Insert: {
          cid: string
          created_at?: string
          date_kind?: string | null
          direction: string
          from_due?: string | null
          id?: string
          moved_by: string
          reason: string
          surface?: string | null
          title?: string | null
          to_due: string
          urgency_after?: number | null
          urgency_before?: number | null
          work_id: string
        }
        Update: {
          cid?: string
          created_at?: string
          date_kind?: string | null
          direction?: string
          from_due?: string | null
          id?: string
          moved_by?: string
          reason?: string
          surface?: string | null
          title?: string | null
          to_due?: string
          urgency_after?: number | null
          urgency_before?: number | null
          work_id?: string
        }
        Relationships: []
      }
      workspace_billing: {
        Row: {
          created_at: string
          id: string
          monthly_action_limit: number
          plan: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          monthly_action_limit?: number
          plan?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          monthly_action_limit?: number
          plan?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_billing_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          cid: string | null
          classified_at: string | null
          classified_by: string | null
          created_at: string
          id: string
          lifecycle_status: string
          name: string
          settings: Json | null
          slug: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenancy_quarantine_reason: string | null
          updated_at: string
          workspace_kind: string
        }
        Insert: {
          cid?: string | null
          classified_at?: string | null
          classified_by?: string | null
          created_at?: string
          id?: string
          lifecycle_status?: string
          name: string
          settings?: Json | null
          slug: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          tenancy_quarantine_reason?: string | null
          updated_at?: string
          workspace_kind?: string
        }
        Update: {
          cid?: string | null
          classified_at?: string | null
          classified_by?: string | null
          created_at?: string
          id?: string
          lifecycle_status?: string
          name?: string
          settings?: Json | null
          slug?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          tenancy_quarantine_reason?: string | null
          updated_at?: string
          workspace_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "hq_readiness"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "workspaces_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "identity_census"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "workspaces_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
          },
        ]
      }
      world_claims: {
        Row: {
          cid: string
          confidence: number | null
          created_at: string
          created_by: string | null
          embedding: string | null
          grade: string
          id: string
          miner: string | null
          object_id: string | null
          observed_at: string
          predicate: string
          sensitivity: string
          source_id: string | null
          source_ref: string | null
          status: string
          subject_id: string
          supersedes: string | null
          synthetic: boolean
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          valid_from: string | null
          valid_to: string | null
          value_text: string | null
          wave: number | null
        }
        Insert: {
          cid: string
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          embedding?: string | null
          grade?: string
          id?: string
          miner?: string | null
          object_id?: string | null
          observed_at?: string
          predicate: string
          sensitivity?: string
          source_id?: string | null
          source_ref?: string | null
          status?: string
          subject_id: string
          supersedes?: string | null
          synthetic?: boolean
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          valid_from?: string | null
          valid_to?: string | null
          value_text?: string | null
          wave?: number | null
        }
        Update: {
          cid?: string
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          embedding?: string | null
          grade?: string
          id?: string
          miner?: string | null
          object_id?: string | null
          observed_at?: string
          predicate?: string
          sensitivity?: string
          source_id?: string | null
          source_ref?: string | null
          status?: string
          subject_id?: string
          supersedes?: string | null
          synthetic?: boolean
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          valid_from?: string | null
          valid_to?: string | null
          value_text?: string | null
          wave?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "world_claims_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "entity_resolvable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_claims_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "world_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_claims_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "world_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_claims_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "entity_resolvable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_claims_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "world_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_claims_supersedes_fkey"
            columns: ["supersedes"]
            isOneToOne: false
            referencedRelation: "world_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_claims_supersedes_fkey"
            columns: ["supersedes"]
            isOneToOne: false
            referencedRelation: "world_delta_v"
            referencedColumns: ["claim_id"]
          },
        ]
      }
      world_edges: {
        Row: {
          cid: string
          created_at: string
          dst_id: string
          etype: string
          id: string
          meta: Json
          src_id: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          cid: string
          created_at?: string
          dst_id: string
          etype: string
          id?: string
          meta?: Json
          src_id: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          cid?: string
          created_at?: string
          dst_id?: string
          etype?: string
          id?: string
          meta?: Json
          src_id?: string
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: [
          {
            foreignKeyName: "world_edges_dst_id_fkey"
            columns: ["dst_id"]
            isOneToOne: false
            referencedRelation: "entity_resolvable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_edges_dst_id_fkey"
            columns: ["dst_id"]
            isOneToOne: false
            referencedRelation: "world_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_edges_src_id_fkey"
            columns: ["src_id"]
            isOneToOne: false
            referencedRelation: "entity_resolvable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_edges_src_id_fkey"
            columns: ["src_id"]
            isOneToOne: false
            referencedRelation: "world_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      world_entities: {
        Row: {
          cid: string
          created_at: string
          end_date: string | null
          etype: string
          id: string
          lifecycle: string | null
          merged_into: string | null
          meta: Json
          name: string
          occurred_at: string | null
          origin_date: string | null
          resolution_keys: Json
          sensitivity: string
          status: string
          tag: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          updated_at: string
        }
        Insert: {
          cid: string
          created_at?: string
          end_date?: string | null
          etype: string
          id?: string
          lifecycle?: string | null
          merged_into?: string | null
          meta?: Json
          name: string
          occurred_at?: string | null
          origin_date?: string | null
          resolution_keys?: Json
          sensitivity?: string
          status?: string
          tag?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          updated_at?: string
        }
        Update: {
          cid?: string
          created_at?: string
          end_date?: string | null
          etype?: string
          id?: string
          lifecycle?: string | null
          merged_into?: string | null
          meta?: Json
          name?: string
          occurred_at?: string | null
          origin_date?: string | null
          resolution_keys?: Json
          sensitivity?: string
          status?: string
          tag?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_entities_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "entity_resolvable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_entities_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "world_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      world_items: {
        Row: {
          body: string
          cid: string
          confidence: number | null
          created_at: string
          domain_key: string | null
          first_seen: string
          id: string
          item_type: string
          occurred_at: string | null
          provenance: Json
          provenance_refs: Json
          sensitivity: string
          source: string
          synthetic: boolean
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          cid: string
          confidence?: number | null
          created_at?: string
          domain_key?: string | null
          first_seen?: string
          id?: string
          item_type: string
          occurred_at?: string | null
          provenance?: Json
          provenance_refs?: Json
          sensitivity?: string
          source: string
          synthetic?: boolean
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          cid?: string
          confidence?: number | null
          created_at?: string
          domain_key?: string | null
          first_seen?: string
          id?: string
          item_type?: string
          occurred_at?: string | null
          provenance?: Json
          provenance_refs?: Json
          sensitivity?: string
          source?: string
          synthetic?: boolean
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_items_domain_key_fkey"
            columns: ["domain_key"]
            isOneToOne: false
            referencedRelation: "domain_taxonomy"
            referencedColumns: ["domain_key"]
          },
        ]
      }
      world_sources: {
        Row: {
          cid: string
          connected_at: string | null
          created_at: string
          id: string
          kind: string
          label: string | null
          last_mined_at: string | null
          last_wave: number
          meta: Json
          scope: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Insert: {
          cid: string
          connected_at?: string | null
          created_at?: string
          id?: string
          kind: string
          label?: string | null
          last_mined_at?: string | null
          last_wave?: number
          meta?: Json
          scope?: string | null
          tenancy: Database["public"]["Enums"]["tenancy_t"]
        }
        Update: {
          cid?: string
          connected_at?: string | null
          created_at?: string
          id?: string
          kind?: string
          label?: string | null
          last_mined_at?: string | null
          last_wave?: number
          meta?: Json
          scope?: string | null
          tenancy?: Database["public"]["Enums"]["tenancy_t"]
        }
        Relationships: []
      }
      write_refusal: {
        Row: {
          at: string
          caller_cid: string | null
          cid: string | null
          detail: string | null
          id: string
          refusal: string
          tool: string
        }
        Insert: {
          at?: string
          caller_cid?: string | null
          cid?: string | null
          detail?: string | null
          id?: string
          refusal: string
          tool: string
        }
        Update: {
          at?: string
          caller_cid?: string | null
          cid?: string | null
          detail?: string | null
          id?: string
          refusal?: string
          tool?: string
        }
        Relationships: []
      }
    }
    Views: {
      admin_activity_feed: {
        Row: {
          at: string | null
          cid: string | null
          detail_a: string | null
          detail_b: string | null
          payload: Json | null
          ref: string | null
          stream: string | null
          subject: string | null
          tenant_label: string | null
          verb: string | null
        }
        Relationships: []
      }
      assurance_asserted_state_without_substrate: {
        Row: {
          asserted_without_substrate: number | null
          body_col: string | null
          hash_col: string | null
          table_name: string | null
          total: number | null
          verdict: string | null
        }
        Relationships: []
      }
      assurance_name_keyed_tenancy: {
        Row: {
          has_cid_column: boolean | null
          name_keyed_column: unknown
          table_name: unknown
          verdict: string | null
        }
        Relationships: []
      }
      assurance_tenancy_freeze_violations: {
        Row: {
          frozen_at: string | null
          name_keyed_column: unknown
          table_name: unknown
          verdict: string | null
        }
        Relationships: []
      }
      boot_coverage_faults: {
        Row: {
          boot_relationship: string | null
          fault: string | null
          plane: string | null
          system_role: string | null
          table_name: string | null
          tenant_scoped: boolean | null
        }
        Insert: {
          boot_relationship?: string | null
          fault?: never
          plane?: string | null
          system_role?: string | null
          table_name?: string | null
          tenant_scoped?: never
        }
        Update: {
          boot_relationship?: string | null
          fault?: never
          plane?: string | null
          system_role?: string | null
          table_name?: string | null
          tenant_scoped?: never
        }
        Relationships: []
      }
      connector_identity_shadow_report_v1: {
        Row: {
          count: number | null
          evidence_scope: string | null
          latest_observation_at: string | null
          match_state: string | null
          observation_day: string | null
          surface: string | null
        }
        Relationships: []
      }
      effective_artifacts: {
        Row: {
          activation_gate: string | null
          annotations: number | null
          artifact_id: string | null
          artifact_key: string | null
          byte_count: number | null
          cid: string | null
          distribution_policy: string | null
          effective_class: string | null
          effective_state: string | null
          ingested_at: string | null
          mutation_policy: string | null
          provenance: string | null
          registration_state: string | null
          runtime_status: string | null
          sha256: string | null
          source_authority: string | null
          source_location: string | null
          source_sha1: string | null
          superseded_by_key: string | null
          tenant: string | null
          version: number | null
        }
        Relationships: []
      }
      entity_resolvable: {
        Row: {
          cid: string | null
          created_at: string | null
          end_date: string | null
          etype: string | null
          id: string | null
          lifecycle: string | null
          merged_into: string | null
          meta: Json | null
          name: string | null
          origin_date: string | null
          resolution_keys: Json | null
          sensitivity: string | null
          status: string | null
          tag: string | null
          updated_at: string | null
        }
        Insert: {
          cid?: string | null
          created_at?: string | null
          end_date?: string | null
          etype?: string | null
          id?: string | null
          lifecycle?: string | null
          merged_into?: string | null
          meta?: Json | null
          name?: string | null
          origin_date?: string | null
          resolution_keys?: Json | null
          sensitivity?: string | null
          status?: string | null
          tag?: string | null
          updated_at?: string | null
        }
        Update: {
          cid?: string | null
          created_at?: string | null
          end_date?: string | null
          etype?: string | null
          id?: string | null
          lifecycle?: string | null
          merged_into?: string | null
          meta?: Json | null
          name?: string | null
          origin_date?: string | null
          resolution_keys?: Json | null
          sensitivity?: string | null
          status?: string | null
          tag?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "world_entities_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "entity_resolvable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_entities_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "world_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      hq_readiness: {
        Row: {
          blocking_gap: string | null
          cid: string | null
          cob_name: string | null
          kernel: number | null
          pinned_steps: number | null
          primary_ws: number | null
          prov: string | null
          readiness: string | null
          subjects: number | null
          verified_saves: number | null
        }
        Relationships: []
      }
      identity_census: {
        Row: {
          active_kernel: number | null
          active_memberships: number | null
          alias_resolves_to: string | null
          ambiguous_alias: boolean | null
          canonical_principals: number | null
          cid: string | null
          cob_name: string | null
          current_resolution_path: string | null
          identity_mode: string | null
        }
        Insert: {
          active_kernel?: never
          active_memberships?: never
          alias_resolves_to?: never
          ambiguous_alias?: never
          canonical_principals?: never
          cid?: string | null
          cob_name?: string | null
          current_resolution_path?: never
          identity_mode?: never
        }
        Update: {
          active_kernel?: never
          active_memberships?: never
          alias_resolves_to?: never
          ambiguous_alias?: never
          canonical_principals?: never
          cid?: string | null
          cob_name?: string | null
          current_resolution_path?: never
          identity_mode?: never
        }
        Relationships: []
      }
      risky_grants_report: {
        Row: {
          grantee: unknown
          privs: string | null
          table_name: unknown
        }
        Relationships: []
      }
      surface_pin_unrestorable: {
        Row: {
          cid: string | null
          has_body: boolean | null
          held: boolean | null
          pinned_at: string | null
          pinned_by: string | null
          reason: string | null
          state: string | null
          surface_key: string | null
          version: string | null
        }
        Relationships: [
          {
            foreignKeyName: "surface_pin_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "hq_readiness"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "surface_pin_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "identity_census"
            referencedColumns: ["cid"]
          },
          {
            foreignKeyName: "surface_pin_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
          },
        ]
      }
      tool_catalog_health: {
        Row: {
          degraded_unknown: number | null
          family: string | null
          never_verified: number | null
          own_probed: number | null
          tools: number | null
        }
        Relationships: []
      }
      work_ranked: {
        Row: {
          answered_by_claim: string | null
          answered_by_memory: string | null
          attention: number | null
          cid: string | null
          close_reason: string | null
          closed_at: string | null
          consequence: string | null
          consequence_note: string | null
          created_at: string | null
          date_basis: string | null
          date_kind: string | null
          dedup_key: string | null
          detail: string | null
          due_date: string | null
          kind: string | null
          last_surfaced: string | null
          origin: string | null
          owner: string | null
          principal_acts: boolean | null
          ref_date: string | null
          relationship: number | null
          significance: number | null
          snooze_until: string | null
          state: string | null
          subject_id: string | null
          superseded_by: string | null
          surfaced_count: number | null
          title: string | null
          trigger: string | null
          updated_at: string | null
          urgency: number | null
          work_id: string | null
        }
        Insert: {
          answered_by_claim?: string | null
          answered_by_memory?: string | null
          attention?: never
          cid?: string | null
          close_reason?: string | null
          closed_at?: string | null
          consequence?: string | null
          consequence_note?: string | null
          created_at?: string | null
          date_basis?: string | null
          date_kind?: string | null
          dedup_key?: string | null
          detail?: string | null
          due_date?: string | null
          kind?: string | null
          last_surfaced?: string | null
          origin?: string | null
          owner?: string | null
          principal_acts?: boolean | null
          ref_date?: string | null
          relationship?: number | null
          significance?: number | null
          snooze_until?: string | null
          state?: string | null
          subject_id?: string | null
          superseded_by?: string | null
          surfaced_count?: number | null
          title?: string | null
          trigger?: string | null
          updated_at?: string | null
          urgency?: number | null
          work_id?: string | null
        }
        Update: {
          answered_by_claim?: string | null
          answered_by_memory?: string | null
          attention?: never
          cid?: string | null
          close_reason?: string | null
          closed_at?: string | null
          consequence?: string | null
          consequence_note?: string | null
          created_at?: string | null
          date_basis?: string | null
          date_kind?: string | null
          dedup_key?: string | null
          detail?: string | null
          due_date?: string | null
          kind?: string | null
          last_surfaced?: string | null
          origin?: string | null
          owner?: string | null
          principal_acts?: boolean | null
          ref_date?: string | null
          relationship?: number | null
          significance?: number | null
          snooze_until?: string | null
          state?: string | null
          subject_id?: string | null
          superseded_by?: string | null
          surfaced_count?: number | null
          title?: string | null
          trigger?: string | null
          updated_at?: string | null
          urgency?: number | null
          work_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_item_answered_by_claim_fkey"
            columns: ["answered_by_claim"]
            isOneToOne: false
            referencedRelation: "world_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_answered_by_claim_fkey"
            columns: ["answered_by_claim"]
            isOneToOne: false
            referencedRelation: "world_delta_v"
            referencedColumns: ["claim_id"]
          },
          {
            foreignKeyName: "work_item_answered_by_memory_fkey"
            columns: ["answered_by_memory"]
            isOneToOne: false
            referencedRelation: "memory_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "entity_resolvable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "world_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "work_item"
            referencedColumns: ["work_id"]
          },
          {
            foreignKeyName: "work_item_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "work_ranked"
            referencedColumns: ["work_id"]
          },
        ]
      }
      world_delta_v: {
        Row: {
          cid: string | null
          claim_id: string | null
          grade: string | null
          observed_at: string | null
          predicate: string | null
          sensitivity: string | null
          source_ref: string | null
          subject_id: string | null
          value_text: string | null
        }
        Insert: {
          cid?: string | null
          claim_id?: string | null
          grade?: string | null
          observed_at?: string | null
          predicate?: string | null
          sensitivity?: string | null
          source_ref?: string | null
          subject_id?: string | null
          value_text?: string | null
        }
        Update: {
          cid?: string | null
          claim_id?: string | null
          grade?: string | null
          observed_at?: string | null
          predicate?: string | null
          sensitivity?: string | null
          source_ref?: string | null
          subject_id?: string | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "world_claims_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "entity_resolvable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_claims_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "world_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      world_timeline_v: {
        Row: {
          cid: string | null
          grade: string | null
          predicate: string | null
          status: string | null
          subject_id: string | null
          valid_from: string | null
          valid_to: string | null
          value_text: string | null
        }
        Insert: {
          cid?: string | null
          grade?: string | null
          predicate?: string | null
          status?: string | null
          subject_id?: string | null
          valid_from?: string | null
          valid_to?: string | null
          value_text?: string | null
        }
        Update: {
          cid?: string | null
          grade?: string | null
          predicate?: string | null
          status?: string | null
          subject_id?: string | null
          valid_from?: string | null
          valid_to?: string | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "world_claims_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "entity_resolvable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_claims_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "world_entities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_activity_read: {
        Args: {
          p_before?: string
          p_cid?: string
          p_limit?: number
          p_since?: string
          p_streams?: string[]
        }
        Returns: Json
      }
      admin_cid_audit: { Args: { p_cid: string }; Returns: Json }
      admin_fleet_board: { Args: never; Returns: Json }
      admin_fleet_live: { Args: { p_since?: string }; Returns: Json }
      admin_guard: { Args: never; Returns: undefined }
      admin_guard_action: {
        Args: { p_action: string; p_target_cid?: string; p_write?: boolean }
        Returns: undefined
      }
      admin_set_page: {
        Args: {
          p_cid: string
          p_enabled: boolean
          p_page: string
          p_reason?: string
        }
        Returns: Json
      }
      amend_doctrine_rule: {
        Args: {
          p_actor: string
          p_new_text: string
          p_reason: string
          p_receipt?: string
          p_rule_key: string
        }
        Returns: Json
      }
      assurance_integrity_scan: {
        Args: never
        Returns: {
          body_col: string
          contract: string
          hash_col: string
          hash_mismatch: number
          table_name: string
          total: number
          verdict: string
          with_body: number
        }[]
      }
      assurance_substrate_scan: {
        Args: never
        Returns: {
          asserted_without_substrate: number
          body_col: string
          hash_col: string
          table_name: string
          total: number
        }[]
      }
      authority_receipt: {
        Args: {
          p_action: string
          p_decision: string
          p_reason?: string
          p_target_cid: string
        }
        Returns: undefined
      }
      authority_secdef_candidates: {
        Args: never
        Returns: {
          callers: string
          fn_args: string
          fn_name: string
          reachable_anon: boolean
          reachable_auth: boolean
          trigger_bound: boolean
        }[]
      }
      authority_secdef_report: { Args: never; Returns: Json }
      authority_secdef_sync: { Args: never; Returns: Json }
      authorize_identity_observation: {
        Args: {
          p_authorized_by: string
          p_observation_id: string
          p_principal_id: string
          p_receipt: string
        }
        Returns: Json
      }
      bind_principal: {
        Args: {
          p_auth_user_id: string
          p_cid: string
          p_evidence?: Json
          p_role?: string
        }
        Returns: Json
      }
      board_configuration_leak_check: {
        Args: { p_cid?: string }
        Returns: Json
      }
      board_render: {
        Args: { p_bump?: boolean; p_cid?: string; p_limit?: number }
        Returns: Json
      }
      board_respond: {
        Args: {
          p_cid?: string
          p_items: Json
          p_session_id?: string
          p_timezone?: string
        }
        Returns: Json
      }
      board_supersede: {
        Args: { p_cid?: string; p_duplicate: string; p_keep: string }
        Returns: Json
      }
      board_title_writethrough: {
        Args: { p_cid: string; p_loop_id: string; p_title: string }
        Returns: string
      }
      board_update: { Args: { p_cid?: string; p_items: Json }; Returns: Json }
      boot_layer_plan: { Args: { p_cid?: string }; Returns: Json }
      boot_payload_measure: { Args: { p_cid: string }; Returns: Json }
      bridge_claim_next: {
        Args: never
        Returns: {
          attempt_count: number
          channel_id: string
          cid: string
          claimed_at: string | null
          event_id: string
          event_type: string
          id: string
          last_error: string | null
          message_ts: string
          payload: Json
          processed_at: string | null
          received_at: string
          slack_user_id: string | null
          status: string
          target_agent: string | null
          team_id: string
          tenancy: Database["public"]["Enums"]["tenancy_t"]
          thread_ts: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "bridge_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      bridge_reap_stale_claims: {
        Args: never
        Returns: {
          dead: number
          requeued: number
        }[]
      }
      bringup_state: {
        Args: { p_tenant: string }
        Returns: {
          evidence: string
          seq: number
          stage: string
          state: string
        }[]
      }
      caller_is_service_role: { Args: never; Returns: boolean }
      campaign_raise_tasks: { Args: { p_cid: string }; Returns: Json }
      canary_assert_no_regression: { Args: { p_label: string }; Returns: Json }
      canary_by_design_refusal: { Args: { p_msg: string }; Returns: boolean }
      change_actor: { Args: never; Returns: string }
      change_feed: {
        Args: { p_cid?: string; p_limit?: number; p_since?: string }
        Returns: Json
      }
      change_history: {
        Args: { p_row_pk: string; p_table: string }
        Returns: Json
      }
      check_rate_limit: {
        Args: { p_key: string; p_max_requests: number; p_window_ms: number }
        Returns: Json
      }
      cid_null_watchdog: { Args: never; Returns: number }
      clean_expired_rate_limits: { Args: never; Returns: number }
      client_access_canary: {
        Args: { p_label?: string; p_phase?: string }
        Returns: Json
      }
      client_access_canary_tick: { Args: never; Returns: Json }
      close_board_v2: {
        Args: { p_cid?: string; p_session_id?: string }
        Returns: Json
      }
      close_save_attempt: {
        Args: {
          p_failure_stage?: string
          p_layer_results?: Json
          p_save_attempt_id: string
          p_status: string
        }
        Returns: Json
      }
      close_session_context: { Args: { p_session_id: string }; Returns: Json }
      cob_blueprint_write: {
        Args: {
          p_cid: string
          p_current_state?: string
          p_id?: string
          p_intent?: string
          p_loop_cadence?: string
          p_milestones?: Json
          p_next_action?: string
          p_owner?: string
          p_status?: string
          p_title?: string
        }
        Returns: Json
      }
      cob_comm_write: {
        Args: {
          p_action?: string
          p_body_md: string
          p_channel: string
          p_cid: string
          p_external_id?: string
          p_external_url?: string
          p_id?: string
          p_reason?: string
          p_subject?: string
          p_to?: string
        }
        Returns: Json
      }
      cob_decision_write:
        | {
            Args: {
              p_cid: string
              p_decided_by?: string
              p_decision_md: string
              p_minute_id?: string
              p_rationale_md?: string
              p_reversibility?: string
              p_session_id?: string
              p_supersedes?: string
              p_title: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_cid: string
              p_decided_by?: string
              p_decision_md: string
              p_minute_id?: string
              p_rationale_md?: string
              p_reversibility?: string
              p_session_id?: string
              p_supersedes?: string
              p_test_run_id?: string
              p_title: string
              p_verification_state?: string
            }
            Returns: Json
          }
      cob_domain_suggest: {
        Args: { p_scope?: string; p_text: string }
        Returns: Json
      }
      cob_fetch: { Args: { p_cid: string; p_id: string }; Returns: Json }
      cob_guard: { Args: { p_cid: string }; Returns: string }
      cob_identity_gaps: { Args: { p_cid: string }; Returns: Json }
      cob_memory_write: {
        Args: {
          p_action?: string
          p_body_md?: string
          p_category?: string
          p_cid: string
          p_id?: string
          p_lane?: string
          p_reason?: string
          p_title?: string
        }
        Returns: Json
      }
      cob_name_normalize: { Args: { raw: string }; Returns: string }
      cob_narrative_write: {
        Args: {
          p_body_md: string
          p_cid: string
          p_expected_revision?: number
          p_kind: string
          p_lane: string
          p_title?: string
        }
        Returns: Json
      }
      cob_recall: {
        Args: {
          p_cid: string
          p_limit?: number
          p_max_entities?: number
          p_per_entity?: number
          p_qvec?: string
          p_text: string
        }
        Returns: Json
      }
      cob_record_file: {
        Args: {
          p_cid: string
          p_kind?: string
          p_link?: string
          p_linked_decision?: string
          p_linked_entity?: string
          p_name: string
          p_note?: string
          p_record_date?: string
          p_source_ref?: string
        }
        Returns: Json
      }
      cob_registers_read: {
        Args: { p_cid: string; p_limit?: number }
        Returns: Json
      }
      cob_request_resolve: {
        Args: {
          p_cid: string
          p_note?: string
          p_request_id: string
          p_state: string
        }
        Returns: Json
      }
      cob_rule_write: {
        Args: {
          p_action?: string
          p_cid: string
          p_id?: string
          p_rank?: number
          p_reason?: string
          p_scope?: string
          p_tenancy?: string
          p_text?: string
          p_title?: string
        }
        Returns: Json
      }
      cob_search: {
        Args: { p_cid: string; p_limit?: number; p_q: string }
        Returns: Json
      }
      cob_signal_raise: {
        Args: {
          p_audience?: string
          p_cid: string
          p_detail?: string
          p_key: string
          p_link?: Json
          p_session_id?: string
          p_subject?: string
          p_surface?: string
          p_tool?: string
        }
        Returns: Json
      }
      cob_signal_raise_internal: {
        Args: {
          p_audience?: string
          p_cid: string
          p_detail?: string
          p_key: string
          p_link?: Json
          p_raised_by?: string
          p_session_id?: string
          p_subject?: string
          p_surface?: string
          p_tool?: string
        }
        Returns: string
      }
      cob_tenant_key: { Args: { p_cid: string }; Returns: string }
      cob_tenant_key_or_cid: { Args: { p_cid: string }; Returns: string }
      cob_tenant_labels: { Args: { p_cid: string }; Returns: string[] }
      cob_text_overlap: { Args: { a: string; b: string }; Returns: number }
      cob_tool_problem_raise: {
        Args: {
          p_cid: string
          p_detail: string
          p_elapsed_seconds?: number
          p_failure_mode: string
          p_surface?: string
          p_tool: string
          p_transport_detail?: string
        }
        Returns: Json
      }
      cob_world_read: {
        Args: { p_cid: string; p_limit?: number; p_q?: string }
        Returns: Json
      }
      code_claim: {
        Args: {
          p_cid?: string
          p_claim: string
          p_code: string
          p_confidence?: number
        }
        Returns: Json
      }
      council_minute_watchdog: { Args: never; Returns: number }
      crypto_erase_expired_recovery: {
        Args: { p_reason?: string }
        Returns: Json
      }
      current_cid: { Args: never; Returns: string }
      derive_tool_contract: { Args: never; Returns: Json }
      entity_block: {
        Args: { p_cid: string; p_threshold?: number }
        Returns: number
      }
      entity_is_bridge: {
        Args: { p_cid: string; p_id: string }
        Returns: boolean
      }
      entity_norm: { Args: { p_name: string }; Returns: string }
      er_identity_keys_only: { Args: { j: Json }; Returns: boolean }
      escalation_rank: { Args: { p_state: string }; Returns: number }
      fleet_authority: { Args: never; Returns: Json }
      fleet_surfacing_health: { Args: never; Returns: Json }
      fn_degraded_sentence: { Args: { p_fn: string }; Returns: string }
      fn_tables_touched: {
        Args: { p_fn: string; p_mode: string }
        Returns: string[]
      }
      get_action_response_status: {
        Args: { p_action_id: string }
        Returns: Json
      }
      get_cron_headers: { Args: never; Returns: Json }
      get_load_test_headers: { Args: never; Returns: Json }
      get_scheduler_health: { Args: { p_workspace_id: string }; Returns: Json }
      guard_names_are_never_keys: {
        Args: never
        Returns: {
          evidence: string
          fn_name: string
        }[]
      }
      hq_act: {
        Args: { p_action: string; p_id?: string; p_params?: Json }
        Returns: Json
      }
      hq_blueprints_read:
        | {
            Args: never
            Returns: {
              current_state: string
              id: string
              intent: string
              loop_cadence: string
              milestones: Json
              next_action: string
              owner: string
              status: string
              title: string
              updated_at: string
              version: number
            }[]
          }
        | {
            Args: { p_cid: string }
            Returns: {
              current_state: string
              id: string
              intent: string
              loop_cadence: string
              milestones: Json
              next_action: string
              owner: string
              status: string
              title: string
              updated_at: string
              version: number
            }[]
          }
        | {
            Args: { p_workspace_id: string }
            Returns: {
              current_state: string
              id: string
              intent: string
              loop_cadence: string
              milestones: Json
              next_action: string
              owner: string
              status: string
              title: string
              updated_at: string
              version: number
            }[]
          }
      hq_boardroom_read: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: Json
      }
      hq_comms_read: { Args: { p_limit?: number }; Returns: Json }
      hq_decisions_read: { Args: { p_limit?: number }; Returns: Json }
      hq_memory_counts: { Args: never; Returns: Json }
      hq_memory_lineage: {
        Args: { p_limit?: number }
        Returns: {
          new_id: string
          new_title: string
          old_category: string
          old_created_at: string
          old_id: string
          old_title: string
          superseded_at: string
        }[]
      }
      hq_memory_read: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          body_md: string
          category: string
          confidence: number
          created_at: string
          created_by: string
          id: string
          lane: string
          notion_block_ref: string
          session_id: string
          status: string
          supersedes: string
          title: string
          updated_at: string
        }[]
      }
      hq_memory_search: {
        Args: { p_limit?: number; p_q: string }
        Returns: {
          body_md: string
          category: string
          confidence: number
          created_at: string
          id: string
          rank: number
          status: string
          title: string
        }[]
      }
      hq_my_pages: { Args: never; Returns: Json }
      hq_my_requests: { Args: { p_limit?: number }; Returns: Json }
      hq_next_run: { Args: { p_cid: string }; Returns: Json }
      hq_next_run_me: { Args: never; Returns: Json }
      hq_open_requests: { Args: { p_cid?: string }; Returns: Json }
      hq_pages_for: { Args: { p_cid: string }; Returns: Json }
      hq_progress_bar: { Args: { p_cid: string }; Returns: Json }
      hq_progress_bar_me: { Args: never; Returns: Json }
      hq_records_counts_v1: {
        Args: { _cid: string }
        Returns: {
          last_write: string
          register: string
          row_count: number
        }[]
      }
      hq_records_fleet_v1: {
        Args: never
        Returns: {
          cid: string
          cob_name: string
          decisions_count: number
          display_name: string
          last_write: string
          loops_open: number
          memory_count: number
          memory_last: string
          minutes_count: number
          principal: string
          sessions_count: number
          sessions_last: string
          status: string
        }[]
      }
      hq_records_keys_v1: { Args: { _cid: string }; Returns: string[] }
      hq_request_action: {
        Args: { p_action: string; p_params?: Json; p_title?: string }
        Returns: Json
      }
      hq_rules_read: { Args: never; Returns: Json }
      hq_scheduled_read:
        | {
            Args: never
            Returns: {
              blueprint_id: string
              cadence: string
              detail: string
              gates_passed: number
              gates_total: number
              id: string
              outcome: string
              owner: string
              program: string
              run_at: string
              seq: number
              spec_status: string
              status: string
              title: string
            }[]
          }
        | {
            Args: { p_cid: string }
            Returns: {
              blueprint_id: string
              cadence: string
              detail: string
              gates_passed: number
              gates_total: number
              id: string
              outcome: string
              owner: string
              program: string
              run_at: string
              seq: number
              spec_status: string
              status: string
              title: string
            }[]
          }
        | {
            Args: { p_workspace_id: string }
            Returns: {
              blueprint_id: string
              cadence: string
              detail: string
              gates_passed: number
              gates_total: number
              id: string
              outcome: string
              owner: string
              program: string
              run_at: string
              seq: number
              spec_status: string
              status: string
              title: string
            }[]
          }
      hq_sessions_read: { Args: { p_limit?: number }; Returns: Json }
      hq_signals_fleet: { Args: { p_limit?: number }; Returns: Json }
      hq_signals_read: { Args: { p_limit?: number }; Returns: Json }
      hq_tasks_read: { Args: { p_limit?: number }; Returns: Json }
      ingest_budget: {
        Args: {
          p_envelope_left: number
          p_program: string
          p_used_units: number
        }
        Returns: Json
      }
      ingest_campaign_open: {
        Args: {
          p_cadence?: string
          p_cid: string
          p_label: string
          p_minutes?: number
          p_total_basis: string
          p_total_items: number
        }
        Returns: Json
      }
      ingest_campaign_record_run:
        | {
            Args: {
              p_campaign: string
              p_headline?: string
              p_program: string
              p_since?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_campaign: string
              p_headline?: string
              p_program: string
              p_since?: string
              p_until?: string
            }
            Returns: Json
          }
      ingest_catchall: { Args: { p_cid: string }; Returns: Json }
      ingest_claim: {
        Args: {
          p_holder: string
          p_lease_seconds?: number
          p_phase: string
          p_program: string
        }
        Returns: {
          attempts: number
          item_count: number
          payload: Json
          reclaimed: boolean
          unit_id: string
        }[]
      }
      ingest_commit: {
        Args: {
          p_holder: string
          p_items?: number
          p_position?: string
          p_unit: string
        }
        Returns: boolean
      }
      ingest_dupes: { Args: { p_cid: string }; Returns: Json }
      ingest_enqueue: {
        Args: {
          p_idem: string
          p_items?: number
          p_payload?: Json
          p_phase: string
          p_priority?: number
          p_program: string
          p_seq?: number
          p_source: string
        }
        Returns: string
      }
      ingest_fail: {
        Args: {
          p_error: string
          p_holder: string
          p_permanent?: boolean
          p_unit: string
        }
        Returns: undefined
      }
      ingest_gate: { Args: { p_program: string }; Returns: Json }
      ingest_indicators: { Args: { p_program: string }; Returns: Json }
      ingest_release: {
        Args: { p_holder: string; p_unit: string }
        Returns: undefined
      }
      ingest_session_close: {
        Args: {
          p_holder: string
          p_items: number
          p_program: string
          p_reason: string
          p_units: number
        }
        Returns: Json
      }
      ingest_session_open: {
        Args: { p_holder: string; p_program: string }
        Returns: Json
      }
      is_cob_operator: { Args: never; Returns: boolean }
      is_fleet_operator: { Args: never; Returns: boolean }
      is_fleet_operator_cid: { Args: { p_cid: string }; Returns: boolean }
      is_fleet_operator_write: { Args: never; Returns: boolean }
      is_onboarding_admin: { Args: never; Returns: boolean }
      is_operator: { Args: { _user_id: string }; Returns: boolean }
      is_tool_problem_signal: {
        Args: { p_detail: string; p_key: string; p_pattern: string }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      kernel_activate: {
        Args: { p_actor: string; p_kernel_id: string }
        Returns: {
          activated: string
          receipt: string
          retired: string
        }[]
      }
      kernel_boot_scorecard: {
        Args: { p_cid?: string; p_days?: number }
        Returns: Json
      }
      kernel_boot_watchdog: { Args: never; Returns: number }
      kernel_challenge_attest:
        | { Args: { p_cid: string; p_phrase: string }; Returns: Json }
        | {
            Args: { p_cid: string; p_phrase?: string; p_phrases?: Json }
            Returns: Json
          }
      kernel_challenge_issue: {
        Args: {
          p_bytes?: number
          p_cid: string
          p_kernel_id?: string
          p_parts?: number
          p_session_ref?: string
          p_surface?: string
        }
        Returns: Json
      }
      kernel_challenge_sweep: { Args: never; Returns: number }
      kernel_state_pointer_compose: { Args: { p_cid: string }; Returns: string }
      kernel_state_pointer_refresh: { Args: { p_cid?: string }; Returns: Json }
      kernel_validate: {
        Args: { p_kernel_id: string }
        Returns: {
          check_name: string
          detail: string
          verdict: string
        }[]
      }
      lane_a_commit2_selftest: {
        Args: never
        Returns: {
          detail: string
          result: string
          test: string
        }[]
      }
      log_kernel_access: {
        Args: {
          p_access_kind: string
          p_auth_subject: string
          p_bytes: number
          p_cid: string
          p_issuer?: string
          p_kernel_id: string
          p_part: string
          p_purpose?: string
          p_resolved_keyed_by?: string
          p_seq: number
          p_session_id: string
          p_surface: string
          p_tenant_claim?: string
          p_token_version?: string
        }
        Returns: string
      }
      memory_edit_v1: {
        Args: {
          p_actor?: string
          p_body_md?: string
          p_category?: string
          p_cid: string
          p_confidence?: number
          p_id: string
          p_title?: string
        }
        Returns: Json
      }
      memory_entity_relink: {
        Args: { p_cid: string; p_memory_id?: string }
        Returns: Json
      }
      memory_module_read: {
        Args: { p_cid: string; p_limit?: number }
        Returns: Json
      }
      memory_search_read: {
        Args: { p_cid: string; p_limit?: number; p_q: string }
        Returns: Json
      }
      memory_set_status_v1: {
        Args: {
          p_actor?: string
          p_cid: string
          p_id: string
          p_reason?: string
          p_status: string
        }
        Returns: Json
      }
      memory_signal: {
        Args: {
          p_actor: string
          p_change: string
          p_entity_id: string
          p_summary: string
          p_tenant: string
        }
        Returns: string
      }
      memory_supersede_v1: {
        Args: {
          p_actor?: string
          p_body_md: string
          p_category?: string
          p_cid: string
          p_confidence?: number
          p_old_id: string
          p_session_id?: string
          p_title: string
        }
        Returns: Json
      }
      memory_write_v1: {
        Args: {
          p_actor?: string
          p_body_md: string
          p_category?: string
          p_cid: string
          p_confidence?: number
          p_notion_block_ref?: string
          p_session_id?: string
          p_status?: string
          p_title: string
        }
        Returns: Json
      }
      mint_tenant: {
        Args: {
          p_cob_name: string
          p_display_name: string
          p_email: string
          p_user: string
        }
        Returns: string
      }
      mint_tenant_v1_archived: { Args: never; Returns: string }
      my_cob: { Args: never; Returns: Json }
      my_tenant: { Args: never; Returns: Json }
      next_cid: { Args: never; Returns: string }
      next_curn: { Args: { p_cid: string; p_kind: string }; Returns: string }
      next_invoice_number: { Args: { p_workspace_id: string }; Returns: string }
      normalize_owner_label: { Args: { p_owner: string }; Returns: string }
      observe_external_identity: {
        Args: {
          p_issuer: string
          p_provider_subject: string
          p_surface?: string
          p_tenant_claim?: string
          p_token_version?: string
          p_verified_email?: string
        }
        Returns: Json
      }
      open_save_attempt:
        | {
            Args: {
              p_cid: string
              p_client_request_id: string
              p_payload_hash?: string
              p_requested_layer_counts: Json
              p_ritual: string
              p_session_id: string
              p_surface?: string
              p_tool_version?: string
            }
            Returns: string
          }
        | {
            Args: {
              p_cid: string
              p_client_request_id: string
              p_external_identity_id?: string
              p_payload: Json
              p_principal_id?: string
              p_session_id: string
              p_surface: string
              p_tool_version: string
            }
            Returns: Json
          }
      open_save_attempt_v2: {
        Args: {
          p_aad?: string
          p_alg?: string
          p_canonicalization_version?: string
          p_cid?: string
          p_ciphertext_b64?: string
          p_client_request_id: string
          p_external_identity_id?: string
          p_hash_algorithm?: string
          p_iv_b64?: string
          p_master_key_version?: string
          p_payload_hash: string
          p_plaintext_bytes?: number
          p_principal_id?: string
          p_recovery_expires_at?: string
          p_requested_layer_counts: Json
          p_ritual?: string
          p_schema_version?: string
          p_session_id?: string
          p_surface?: string
          p_tool_version?: string
          p_wrap_iv_b64?: string
          p_wrapped_dek_b64?: string
        }
        Returns: Json
      }
      open_session_context: {
        Args: {
          p_auth_user_id?: string
          p_cid: string
          p_session_id: string
          p_source?: string
          p_ttl?: string
        }
        Returns: Json
      }
      operator_read_guard: {
        Args: { p_action: string; p_target_cid: string }
        Returns: boolean
      }
      probe_method_is_entry_point: {
        Args: { p_method: string }
        Returns: boolean
      }
      probe_method_is_observation: {
        Args: { p_method: string }
        Returns: boolean
      }
      probe_method_writes_subject: {
        Args: { p_method: string; p_subject_ref: string }
        Returns: boolean
      }
      propose_doctrine_rule: {
        Args: {
          p_actor: string
          p_cid?: string
          p_rule_key: string
          p_rule_text: string
          p_scope?: string
          p_source: string
          p_tier: number
        }
        Returns: Json
      }
      propose_doctrine_rule_as_cid: {
        Args: {
          p_cid: string
          p_reason?: string
          p_rule_key: string
          p_rule_text: string
          p_tier?: number
        }
        Returns: Json
      }
      provision_client_hq: { Args: { p_cid: string }; Returns: Json }
      publish_doctrine: {
        Args: { p_note?: string; p_published_by: string }
        Returns: Json
      }
      ratify_doctrine_rule: {
        Args: {
          p_ratified_by: string
          p_receipt: string
          p_rule_key: string
          p_version: number
        }
        Returns: Json
      }
      reap_stale_action_claims: { Args: never; Returns: number }
      reconcile_kernel_absent_signals: { Args: never; Returns: number }
      record_decision: {
        Args: {
          p_authority_tier?: string
          p_cid?: string
          p_client_ref?: string
          p_decision_md: string
          p_decision_owner?: string
          p_execution_owner?: string
          p_provenance?: string
          p_rationale_md?: string
          p_reversibility?: string
          p_source_session_id?: string
          p_source_subject?: string
          p_source_surface?: string
          p_test_run_id?: string
          p_title: string
          p_tool_version?: string
          p_verification_state?: string
        }
        Returns: Json
      }
      record_fleet_write_denial: {
        Args: {
          p_cid?: string
          p_identity: Json
          p_principal: string
          p_table: string
        }
        Returns: string
      }
      record_probe: {
        Args: {
          p_cid?: string
          p_claim: string
          p_expected: string
          p_method: string
          p_observed: string
          p_passed: boolean
          p_probe_kind?: string
          p_subject_kind: string
          p_subject_ref: string
        }
        Returns: Json
      }
      record_save_receipt: {
        Args: {
          p_cid?: string
          p_client_request_id: string
          p_layers: Json
          p_payload_hash: string
          p_session_id: string
        }
        Returns: Json
      }
      record_signal: {
        Args: {
          p_cid?: string
          p_client_ref?: string
          p_detail_md?: string
          p_pattern?: string
          p_provenance?: string
          p_signal_type?: string
          p_source_session_id?: string
          p_source_subject?: string
          p_source_surface?: string
          p_status?: string
          p_title: string
          p_tool_version?: string
        }
        Returns: Json
      }
      record_taylor_turn: {
        Args: {
          p_answer: string
          p_client_request_id: string
          p_fact?: string
          p_fact_section?: string
          p_question_id?: string
          p_session_id?: string
        }
        Returns: Json
      }
      record_unbound_principal: {
        Args: {
          p_cid?: string
          p_issuer: string
          p_principal_id?: string
          p_provider_subject: string
          p_resolution_mode: string
          p_tenant_claim?: string
        }
        Returns: Json
      }
      record_write_refusal: {
        Args: {
          p_caller_cid?: string
          p_cid: string
          p_detail?: string
          p_refusal: string
          p_tool: string
        }
        Returns: undefined
      }
      redeem_access_code: {
        Args: { p_cob_name?: string; p_code: string; p_display_name: string }
        Returns: Json
      }
      register_layer_evidence_pass: { Args: never; Returns: Json }
      register_layer_report: { Args: never; Returns: Json }
      register_layer_sync: { Args: never; Returns: Json }
      register_silence_watchdog: { Args: never; Returns: number }
      rekey_status: {
        Args: never
        Returns: {
          attributed: number
          quarantined: number
          table_name: string
          total: number
        }[]
      }
      render_local: { Args: { p_cid: string; p_ts: string }; Returns: Json }
      resolve_cid: { Args: { k: string }; Returns: string }
      resolve_cid_strict: { Args: { k: string }; Returns: string }
      resolve_hq_authority_v1: {
        Args: { p_auth_user_id: string; p_session_id?: string }
        Returns: Json
      }
      resolve_identity_v2: {
        Args: { p_issuer: string; p_provider_subject: string }
        Returns: Json
      }
      resolve_principal_context: {
        Args: { p_issuer: string; p_provider_subject: string }
        Returns: Json
      }
      resolve_tenant_context: {
        Args: { p_session_id?: string }
        Returns: {
          out_cid: string
          out_role: string
          out_source: string
          out_status: string
        }[]
      }
      resolve_write_cid: {
        Args: { p_row_cid: string; p_tool: string }
        Returns: string
      }
      retire_doctrine_rule: {
        Args: {
          p_actor: string
          p_reason: string
          p_receipt?: string
          p_rule_key: string
        }
        Returns: Json
      }
      revert_change: {
        Args: { p_cid?: string; p_ledger_id: number; p_reason: string }
        Returns: Json
      }
      route_evidence_gaps: {
        Args: { p_cid: string }
        Returns: {
          claim_id: string
          expected: string
          snippet: string
        }[]
      }
      route_evidence_match: {
        Args: { p_cid: string }
        Returns: {
          claim_id: string
          domain_key: string
        }[]
      }
      route_orbit_rescue: { Args: { p_cid: string }; Returns: Json }
      route_outliers: {
        Args: { p_cid: string; p_min_claims?: number }
        Returns: {
          domain_key: string
          entity: string
          entity_claims: number
          hits: number
          share: number
        }[]
      }
      route_resolve_audit: { Args: { p_cid: string }; Returns: Json }
      run_scheduled_actions: { Args: { p_limit?: number }; Returns: Json }
      save_attempt_status: {
        Args: { p_completed_at: string; p_layer_results: Json }
        Returns: string
      }
      save_attempts_in_flight: {
        Args: { p_older_than_minutes?: number }
        Returns: {
          cid: string
          in_flight: number
          oldest: string
          ritual: string
        }[]
      }
      save_health: { Args: { p_cid: string; p_last?: number }; Returns: Json }
      scheduled_action_hold_reason: {
        Args: { r: Database["public"]["Tables"]["scheduled_actions"]["Row"] }
        Returns: string
      }
      scheduled_action_receipt: {
        Args: {
          p_detail: Json
          p_phase: string
          p_row: Database["public"]["Tables"]["scheduled_actions"]["Row"]
        }
        Returns: undefined
      }
      session_boot_state: { Args: { p_cid: string }; Returns: string }
      session_context_purge: { Args: never; Returns: number }
      session_id_for_context: {
        Args: { p_session_id: string }
        Returns: string
      }
      session_raise: {
        Args: {
          p_cid: string
          p_detail?: string
          p_due?: string
          p_kind?: string
          p_origin: string
          p_owner?: string
          p_principal_acts?: boolean
          p_session_id?: string
          p_title: string
        }
        Returns: Json
      }
      session_title_rule: { Args: never; Returns: string }
      session_transcript_read: { Args: { p_session_id: string }; Returns: Json }
      session_transcript_write: {
        Args: {
          p_body_md: string
          p_cid?: string
          p_fidelity?: string
          p_part?: number
          p_parts_total?: number
          p_scrub_note?: string
          p_scrubbed?: boolean
          p_session_id: string
        }
        Returns: Json
      }
      set_doctrine_tier: {
        Args: {
          p_actor: string
          p_new_tier: number
          p_reason: string
          p_receipt?: string
          p_rule_key: string
        }
        Returns: Json
      }
      set_my_cob_name: { Args: { p_name: string }; Returns: Json }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      stamp_save_attempt: {
        Args: {
          p_cid?: string
          p_failure_stage?: string
          p_recovery_expires_at?: string
          p_save_attempt_id: string
          p_save_id?: string
          p_status: string
        }
        Returns: Json
      }
      sweep_unreachable: {
        Args: { p_raise?: boolean }
        Returns: {
          detail: string
          finding_kind: string
          object_name: string
        }[]
      }
      sweep_unreachable_raise: { Args: { p_cid?: string }; Returns: number }
      sync_tool_catalog: { Args: { p_version?: string }; Returns: Json }
      sync_tool_contract_edge: { Args: { p_payload: Json }; Returns: Json }
      tenant_clock: { Args: { p_cid: string }; Returns: Json }
      tenant_keys: { Args: { p_cid: string }; Returns: string[] }
      tenant_lanes: { Args: { p_cid: string }; Returns: string[] }
      tenant_timezone: { Args: { p_cid: string }; Returns: string }
      tool_latency_report: {
        Args: { p_min_calls?: number; p_tools?: string[] }
        Returns: Json
      }
      tool_manifest_descriptions: { Args: never; Returns: Json }
      tool_problem_report: { Args: { p_cid?: string }; Returns: Json }
      unbound_principal_escalate: { Args: never; Returns: Json }
      unbound_principals_report: { Args: never; Returns: Json }
      verify_cron_token: {
        Args: { p_timestamp: string; p_token: string }
        Returns: boolean
      }
      verify_dissertation_depth_v1: {
        Args: { _cid: string }
        Returns: {
          axis: string
          detail: string
          pass: boolean
          score: number
          target: number
        }[]
      }
      verify_load_test_token: {
        Args: { p_timestamp: string; p_token: string }
        Returns: boolean
      }
      vocabulary_gaps: {
        Args: never
        Returns: {
          value: string
          verdict: string
          vocabulary: string
          writer: string
        }[]
      }
      watchdog_health: { Args: never; Returns: number }
      work_close: {
        Args: {
          p_claim?: string
          p_memory?: string
          p_reason: string
          p_state: string
          p_work: string
        }
        Returns: undefined
      }
      work_dispose: {
        Args: {
          p_cid?: string
          p_date_kind?: string
          p_disposition: string
          p_lane?: string
          p_principal_acts?: boolean
          p_reason?: string
          p_work: string
        }
        Returns: Json
      }
      work_disposition_queue: {
        Args: { p_cid: string; p_limit?: number }
        Returns: Json
      }
      work_extract_dates: {
        Args: { p_cid: string }
        Returns: {
          deadlines: number
          refs: number
          scanned: number
        }[]
      }
      work_fingerprint: { Args: { p_title: string }; Returns: string }
      work_raise: {
        Args: {
          p_cid: string
          p_detail?: string
          p_due?: string
          p_kind: string
          p_origin: string
          p_owner?: string
          p_ref: string
          p_registry: string
          p_subject?: string
          p_title: string
        }
        Returns: string
      }
      work_reschedule: {
        Args: {
          p_cid?: string
          p_date_kind?: string
          p_new_due: string
          p_reason: string
          p_work: string
        }
        Returns: Json
      }
      work_rescore: { Args: { p_cid: string }; Returns: number }
      work_score: { Args: { p_cid: string }; Returns: number }
      work_sync_loops: { Args: { p_cid: string }; Returns: Json }
      work_title_signature: { Args: { p_title: string }; Returns: Json }
      work_unassessed: {
        Args: { p_cid: string; p_limit?: number }
        Returns: {
          detail: string
          due_date: string
          kind: string
          ref_date: string
          subject: string
          title: string
          work_id: string
        }[]
      }
      work_unassessed_count: { Args: { p_cid: string }; Returns: number }
      work_urgency: {
        Args: {
          p_consequence: string
          p_due: string
          p_kind: string
          p_principal_acts: boolean
        }
        Returns: number
      }
      world_build_all_v1: {
        Args: { _cid: string }
        Returns: {
          result: string
          step: string
        }[]
      }
      world_build_events_v1: {
        Args: { _cid: string }
        Returns: {
          events_created: number
          links_created: number
        }[]
      }
      world_build_events_v2: {
        Args: { _cid: string }
        Returns: {
          events_created: number
          links_created: number
        }[]
      }
      world_build_events_v3: {
        Args: { _cid: string }
        Returns: {
          events_created: number
          links_created: number
        }[]
      }
      world_build_spine_v1: {
        Args: { _cid: string }
        Returns: {
          ended_ct: number
          entities_dated: number
          live_ct: number
          unknown_ct: number
        }[]
      }
      world_claim_write: {
        Args: {
          p_cid: string
          p_confidence?: number
          p_grade?: string
          p_miner?: string
          p_observed: string
          p_predicate: string
          p_sensitivity?: string
          p_source_id: string
          p_source_ref: string
          p_subject: string
          p_text: string
          p_valid_from?: string
          p_valid_to?: string
        }
        Returns: string
      }
      world_entity_heat_v1: {
        Args: { _cid: string }
        Returns: {
          claims: number
          degree: number
          entity_id: string
          etype: string
          heat: number
          lanes: number
          last_touch: string
          name: string
        }[]
      }
      world_entity_heat_v2: {
        Args: { _cid: string }
        Returns: {
          claims: number
          degree: number
          etype: string
          folders: number
          heat: number
          last_touch: string
          name: string
          why: string
        }[]
      }
      world_entity_upsert: {
        Args: { p_cid: string; p_etype?: string; p_name: string }
        Returns: string
      }
      world_hubs_v1: {
        Args: { _cid: string }
        Returns: {
          degree: number
          etype: string
          folder_list: string
          folders: number
          is_hub: boolean
          name: string
        }[]
      }
      world_lane_heat_v1: {
        Args: { _cid: string }
        Returns: {
          entries: number
          heat: number
          lane: string
          last_touch: string
          open_items: number
          subjects: number
          why: string
        }[]
      }
      world_link_mentions_v1: {
        Args: { _cid: string }
        Returns: {
          edges_written: number
          pairs_found: number
        }[]
      }
      world_resolve_entity_v1: {
        Args: { p_cid: string; p_etype: string; p_keys?: Json; p_name: string }
        Returns: Json
      }
      world_search_v1: {
        Args: { _cid: string; _limit?: number; _q: string; _qvec?: string }
        Returns: {
          lane: string
          rank: number
          register: string
          rid: string
          snippet: string
          title: string
        }[]
      }
    }
    Enums: {
      action_status:
        | "pending_approval"
        | "scheduled"
        | "running"
        | "completed"
        | "failed"
        | "approved"
        | "canceled"
      item_direction: "inbound" | "outbound" | "system"
      register_layer_t: "CONFIGURATION" | "PRODUCTION"
      tenancy_t: "FLEET" | "TENANT"
      workspace_role: "owner" | "admin" | "member" | "viewer"
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
      action_status: [
        "pending_approval",
        "scheduled",
        "running",
        "completed",
        "failed",
        "approved",
        "canceled",
      ],
      item_direction: ["inbound", "outbound", "system"],
      register_layer_t: ["CONFIGURATION", "PRODUCTION"],
      tenancy_t: ["FLEET", "TENANT"],
      workspace_role: ["owner", "admin", "member", "viewer"],
    },
  },
} as const

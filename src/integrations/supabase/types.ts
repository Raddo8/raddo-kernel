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
      access_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          grants: string
          issued_to: string | null
          label: string | null
          max_uses: number
          revoked: boolean
          uses: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          grants?: string
          issued_to?: string | null
          label?: string | null
          max_uses?: number
          revoked?: boolean
          uses?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          grants?: string
          issued_to?: string | null
          label?: string | null
          max_uses?: number
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
      blueprints: {
        Row: {
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
          tenant_id: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
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
          tenant_id: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
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
          fallback_used: boolean
          id: string
          kernel_version: number | null
          meta: Json | null
          surface: string | null
          tenant_id: string
        }
        Insert: {
          booted_at?: string
          fallback_used?: boolean
          id?: string
          kernel_version?: number | null
          meta?: Json | null
          surface?: string | null
          tenant_id: string
        }
        Update: {
          booted_at?: string
          fallback_used?: boolean
          id?: string
          kernel_version?: number | null
          meta?: Json | null
          surface?: string | null
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
          priority: string
          seen: boolean
          seen_at: string | null
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
          priority?: string
          seen?: boolean
          seen_at?: string | null
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
          priority?: string
          seen?: boolean
          seen_at?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulletins_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
          },
        ]
      }
      change_log: {
        Row: {
          actor: string | null
          at: string
          change: string
          entity: string
          entity_id: string | null
          id: string
          summary: string | null
          tenant_id: string
        }
        Insert: {
          actor?: string | null
          at?: string
          change: string
          entity: string
          entity_id?: string | null
          id?: string
          summary?: string | null
          tenant_id: string
        }
        Update: {
          actor?: string | null
          at?: string
          change?: string
          entity?: string
          entity_id?: string | null
          id?: string
          summary?: string | null
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
      client_intake: {
        Row: {
          cid: string
          content_md: string
          id: string
          recorded_at: string
          source: string
          topic: string
        }
        Insert: {
          cid: string
          content_md: string
          id?: string
          recorded_at?: string
          source: string
          topic: string
        }
        Update: {
          cid?: string
          content_md?: string
          id?: string
          recorded_at?: string
          source?: string
          topic?: string
        }
        Relationships: [
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
        }
        Insert: {
          auth_user_id: string
          cid?: string | null
          code: string
          id?: string
          redeemed_at?: string
        }
        Update: {
          auth_user_id?: string
          cid?: string | null
          code?: string
          id?: string
          redeemed_at?: string
        }
        Relationships: [
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
      council_minutes: {
        Row: {
          cid: string
          convened_at: string
          curn: string | null
          dissent_md: string | null
          eps: number | null
          id: string
          lenses: Json | null
          question: string
          rho: number | null
          session_id: string | null
          verdict_md: string | null
        }
        Insert: {
          cid: string
          convened_at?: string
          curn?: string | null
          dissent_md?: string | null
          eps?: number | null
          id?: string
          lenses?: Json | null
          question: string
          rho?: number | null
          session_id?: string | null
          verdict_md?: string | null
        }
        Update: {
          cid?: string
          convened_at?: string
          curn?: string | null
          dissent_md?: string | null
          eps?: number | null
          id?: string
          lenses?: Json | null
          question?: string
          rho?: number | null
          session_id?: string | null
          verdict_md?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "council_minutes_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
          },
        ]
      }
      decisions: {
        Row: {
          authority_tier: string | null
          cid: string
          curn: string | null
          decided_at: string
          decided_by: string | null
          decision_md: string
          id: string
          minute_id: string | null
          rationale_md: string | null
          reversibility: string | null
          superseded_by: string | null
          title: string
        }
        Insert: {
          authority_tier?: string | null
          cid: string
          curn?: string | null
          decided_at?: string
          decided_by?: string | null
          decision_md: string
          id?: string
          minute_id?: string | null
          rationale_md?: string | null
          reversibility?: string | null
          superseded_by?: string | null
          title: string
        }
        Update: {
          authority_tier?: string | null
          cid?: string
          curn?: string | null
          decided_at?: string
          decided_by?: string | null
          decision_md?: string
          id?: string
          minute_id?: string | null
          rationale_md?: string | null
          reversibility?: string | null
          superseded_by?: string | null
          title?: string
        }
        Relationships: [
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
          created_at: string
          id: string
          requested_by: string
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          requested_by: string
          status?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          requested_by?: string
          status?: string
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
        }
        Relationships: [
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
          confirmed_at: string | null
          created_at: string
          id: string
          rank: number | null
          scope: string
          status: string
          tenant_id: string
          text: string
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          id?: string
          rank?: number | null
          scope?: string
          status?: string
          tenant_id: string
          text: string
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          id?: string
          rank?: number | null
          scope?: string
          status?: string
          tenant_id?: string
          text?: string
          updated_at?: string
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
        }
        Relationships: [
          {
            foreignKeyName: "document_registry_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
          },
        ]
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
          notes: Json
          observed_effects: Json
          outcome: string
          request_id: string
          started_at: string | null
          surface: string | null
          tenant_display: string | null
          tool: string
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
          notes?: Json
          observed_effects?: Json
          outcome: string
          request_id: string
          started_at?: string | null
          surface?: string | null
          tenant_display?: string | null
          tool: string
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
          notes?: Json
          observed_effects?: Json
          outcome?: string
          request_id?: string
          started_at?: string | null
          surface?: string | null
          tenant_display?: string | null
          tool?: string
          undeclared_effects?: Json
        }
        Relationships: []
      }
      goals: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          priority: number | null
          status: string
          target_date: string | null
          tenant_id: string
          title: string
          updated_at: string
          value_pillar: string
          version: number
          why: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          priority?: number | null
          status?: string
          target_date?: string | null
          tenant_id: string
          title: string
          updated_at?: string
          value_pillar: string
          version?: number
          why?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          priority?: number | null
          status?: string
          target_date?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
          value_pillar?: string
          version?: number
          why?: string | null
        }
        Relationships: []
      }
      improvement_signals: {
        Row: {
          audience: string
          cid: string
          curn: string | null
          detail_md: string | null
          first_seen: string
          id: string
          last_seen: string
          pattern: string
          recurrence: number
          silent: boolean
          status: string
        }
        Insert: {
          audience?: string
          cid: string
          curn?: string | null
          detail_md?: string | null
          first_seen?: string
          id?: string
          last_seen?: string
          pattern: string
          recurrence?: number
          silent?: boolean
          status?: string
        }
        Update: {
          audience?: string
          cid?: string
          curn?: string | null
          detail_md?: string | null
          first_seen?: string
          id?: string
          last_seen?: string
          pattern?: string
          recurrence?: number
          silent?: boolean
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "improvement_signals_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
          },
        ]
      }
      intake_facts: {
        Row: {
          created_at: string
          fact: string
          id: string
          section: string | null
          source: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          fact: string
          id?: string
          section?: string | null
          source?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          fact?: string
          id?: string
          section?: string | null
          source?: string
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
          file_name: string
          id: string
          kind: string
          size_bytes: number | null
          storage_path: string
          tenant_id: string
          uploaded_at: string
        }
        Insert: {
          file_name: string
          id?: string
          kind: string
          size_bytes?: number | null
          storage_path: string
          tenant_id: string
          uploaded_at?: string
        }
        Update: {
          file_name?: string
          id?: string
          kind?: string
          size_bytes?: number | null
          storage_path?: string
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
          created_at: string
          id: string
          question_key: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          answer?: string | null
          chapter: number
          created_at?: string
          id?: string
          question_key: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          answer?: string | null
          chapter?: number
          created_at?: string
          id?: string
          question_key?: string
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
      kernel_activation_receipts: {
        Row: {
          activated_at: string
          activated_by: string
          cid: string
          kernel_id: string
          part_manifest: Json
          receipt_id: string
          retired_kernel_id: string | null
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
      kernel_parts: {
        Row: {
          bytes: number
          content_md: string
          id: string
          kernel_id: string
          part: string
          seq: number
          sha256: string
        }
        Insert: {
          bytes: number
          content_md: string
          id?: string
          kernel_id: string
          part: string
          seq?: number
          sha256: string
        }
        Update: {
          bytes?: number
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
      kernels: {
        Row: {
          activated_at: string | null
          cid: string
          created_at: string
          id: string
          notes: string | null
          status: string
          tenant_id: string
          verification_state: string | null
          version: number
        }
        Insert: {
          activated_at?: string | null
          cid: string
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          tenant_id: string
          verification_state?: string | null
          version?: number
        }
        Update: {
          activated_at?: string | null
          cid?: string
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          tenant_id?: string
          verification_state?: string | null
          version?: number
        }
        Relationships: [
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
          confidence: number | null
          content_md: string | null
          created_at: string
          id: string
          source: string
          status: string
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          category: string
          confidence?: number | null
          content_md?: string | null
          created_at?: string
          id?: string
          source?: string
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          category?: string
          confidence?: number | null
          content_md?: string | null
          created_at?: string
          id?: string
          source?: string
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      mcp_usage_events: {
        Row: {
          agent_id: string | null
          created_at: string
          id: string
          metadata: Json
          model_breakdown: Json
          tenant: string
          tool: string
          total_cost_usd: number
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          model_breakdown?: Json
          tenant: string
          tool: string
          total_cost_usd?: number
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          model_breakdown?: Json
          tenant?: string
          tool?: string
          total_cost_usd?: number
        }
        Relationships: []
      }
      memory_entries: {
        Row: {
          body_md: string
          category: string | null
          confidence: number
          created_at: string
          id: string
          notion_block_ref: string | null
          session_id: string | null
          status: string
          superseded_by: string | null
          tenant: string
          title: string
        }
        Insert: {
          body_md: string
          category?: string | null
          confidence?: number
          created_at?: string
          id?: string
          notion_block_ref?: string | null
          session_id?: string | null
          status?: string
          superseded_by?: string | null
          tenant: string
          title: string
        }
        Update: {
          body_md?: string
          category?: string | null
          confidence?: number
          created_at?: string
          id?: string
          notion_block_ref?: string | null
          session_id?: string | null
          status?: string
          superseded_by?: string | null
          tenant?: string
          title?: string
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
          created_at: string
          id: string
          reason: string
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          status?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          status?: string
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
      onboarding_progress: {
        Row: {
          cid: string
          detail: string | null
          source: string
          status: string
          step_key: string
          updated_at: string
        }
        Insert: {
          cid: string
          detail?: string | null
          source: string
          status?: string
          step_key: string
          updated_at?: string
        }
        Update: {
          cid?: string
          detail?: string | null
          source?: string
          status?: string
          step_key?: string
          updated_at?: string
        }
        Relationships: [
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
      onboarding_tenants: {
        Row: {
          cid: string | null
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
          cid?: string | null
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
          cid?: string | null
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
        Relationships: [
          {
            foreignKeyName: "onboarding_tenants_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
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
          created_at: string
          id: string
          last_surfaced: string | null
          notion_page_id: string | null
          owner: string | null
          snooze_until: string | null
          state: string | null
          surfaced_count: number
          tenant: string
          title: string
          trigger: string | null
          updated_at: string
        }
        Insert: {
          brief_status?: string
          created_at?: string
          id?: string
          last_surfaced?: string | null
          notion_page_id?: string | null
          owner?: string | null
          snooze_until?: string | null
          state?: string | null
          surfaced_count?: number
          tenant: string
          title: string
          trigger?: string | null
          updated_at?: string
        }
        Update: {
          brief_status?: string
          created_at?: string
          id?: string
          last_surfaced?: string | null
          notion_page_id?: string | null
          owner?: string | null
          snooze_until?: string | null
          state?: string | null
          surfaced_count?: number
          tenant?: string
          title?: string
          trigger?: string | null
          updated_at?: string
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
      ritual_runs: {
        Row: {
          created_at: string
          duration_ms: number | null
          id: string
          layers: Json
          outcome: string
          ritual: string
          session_id: string | null
          tenant: string
          unsaved: Json
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          id?: string
          layers?: Json
          outcome: string
          ritual: string
          session_id?: string | null
          tenant: string
          unsaved?: Json
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          id?: string
          layers?: Json
          outcome?: string
          ritual?: string
          session_id?: string | null
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
      scheduled_actions: {
        Row: {
          blueprint_id: string | null
          cadence: string | null
          completed_at: string | null
          created_at: string
          detail: string | null
          fired_at: string | null
          id: string
          outcome: string | null
          owner: string
          program: string | null
          run_at: string | null
          seq: number | null
          status: string
          tenant_id: string
          title: string
          trigger_ref: string | null
          updated_at: string
        }
        Insert: {
          blueprint_id?: string | null
          cadence?: string | null
          completed_at?: string | null
          created_at?: string
          detail?: string | null
          fired_at?: string | null
          id?: string
          outcome?: string | null
          owner?: string
          program?: string | null
          run_at?: string | null
          seq?: number | null
          status?: string
          tenant_id: string
          title: string
          trigger_ref?: string | null
          updated_at?: string
        }
        Update: {
          blueprint_id?: string | null
          cadence?: string | null
          completed_at?: string | null
          created_at?: string
          detail?: string | null
          fired_at?: string | null
          id?: string
          outcome?: string | null
          owner?: string
          program?: string | null
          run_at?: string | null
          seq?: number | null
          status?: string
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
      scores: {
        Row: {
          account_id: string | null
          computed_at: string
          id: string
          item_id: string | null
          score_type: string
          value: number
        }
        Insert: {
          account_id?: string | null
          computed_at?: string
          id?: string
          item_id?: string | null
          score_type: string
          value?: number
        }
        Update: {
          account_id?: string | null
          computed_at?: string
          id?: string
          item_id?: string | null
          score_type?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "scores_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      session_checkpoints: {
        Row: {
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
          tenant: string
        }
        Insert: {
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
          tenant: string
        }
        Update: {
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
      sessions: {
        Row: {
          close_kind: string | null
          closed_at: string | null
          id: string
          kernel_version: number | null
          meta: Json
          opened_at: string
          surface: string | null
          tenant: string
        }
        Insert: {
          close_kind?: string | null
          closed_at?: string | null
          id?: string
          kernel_version?: number | null
          meta?: Json
          opened_at?: string
          surface?: string | null
          tenant: string
        }
        Update: {
          close_kind?: string | null
          closed_at?: string | null
          id?: string
          kernel_version?: number | null
          meta?: Json
          opened_at?: string
          surface?: string | null
          tenant?: string
        }
        Relationships: []
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
      storyline: {
        Row: {
          body_md: string
          cid: string
          cites: Json | null
          created_at: string
          curn: string | null
          grade: string
          id: string
          kind: string
          period_end: string | null
          period_start: string | null
          title: string
        }
        Insert: {
          body_md: string
          cid: string
          cites?: Json | null
          created_at?: string
          curn?: string | null
          grade?: string
          id?: string
          kind: string
          period_end?: string | null
          period_start?: string | null
          title: string
        }
        Update: {
          body_md?: string
          cid?: string
          cites?: Json | null
          created_at?: string
          curn?: string | null
          grade?: string
          id?: string
          kind?: string
          period_end?: string | null
          period_start?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "storyline_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
          },
        ]
      }
      study_agents: {
        Row: {
          created_at: string
          id: string
          name: string
          persona_md: string | null
          role_summary: string | null
          scope: string
          status: string
          tenant_id: string | null
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          persona_md?: string | null
          role_summary?: string | null
          scope?: string
          status?: string
          tenant_id?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          persona_md?: string | null
          role_summary?: string | null
          scope?: string
          status?: string
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
          created_at: string
          distribution_status: string
          id: string
          name: string
          scope: string
          sha256: string | null
          status: string
          tenant_id: string | null
          version: string
        }
        Insert: {
          body_md?: string | null
          category: string
          changelog?: string | null
          created_at?: string
          distribution_status?: string
          id?: string
          name: string
          scope?: string
          sha256?: string | null
          status?: string
          tenant_id?: string | null
          version: string
        }
        Update: {
          body_md?: string | null
          category?: string
          changelog?: string | null
          created_at?: string
          distribution_status?: string
          id?: string
          name?: string
          scope?: string
          sha256?: string | null
          status?: string
          tenant_id?: string | null
          version?: string
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
          version: string
        }
        Insert: {
          cid: string
          held?: boolean
          pinned_at?: string
          pinned_by?: string | null
          surface_key: string
          version: string
        }
        Update: {
          cid?: string
          held?: boolean
          pinned_at?: string
          pinned_by?: string | null
          surface_key?: string
          version?: string
        }
        Relationships: [
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
      taylor_questions: {
        Row: {
          answer: string | null
          answered_at: string | null
          context: string
          created_at: string
          id: string
          question: string
          status: string
          tenant_id: string
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          context?: string
          created_at?: string
          id?: string
          question: string
          status?: string
          tenant_id: string
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          context?: string
          created_at?: string
          id?: string
          question?: string
          status?: string
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
      tenant_alias: {
        Row: {
          alias: string
          ambiguous: boolean
          cid: string | null
          created_at: string
          key_space: string
          note: string | null
        }
        Insert: {
          alias: string
          ambiguous?: boolean
          cid?: string | null
          created_at?: string
          key_space: string
          note?: string | null
        }
        Update: {
          alias?: string
          ambiguous?: boolean
          cid?: string | null
          created_at?: string
          key_space?: string
          note?: string | null
        }
        Relationships: [
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
          role: string
        }
        Insert: {
          auth_user_id: string
          cid: string
          created_at?: string
          role?: string
        }
        Update: {
          auth_user_id?: string
          cid?: string
          created_at?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_cid_fkey"
            columns: ["cid"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["cid"]
          },
        ]
      }
      tenant_offices: {
        Row: {
          boardroom_db: string
          created_at: string
          label: string | null
          provider: string
          provisioned_by: string | null
          status: string
          tenant: string
          token_ref: string | null
          updated_at: string
        }
        Insert: {
          boardroom_db: string
          created_at?: string
          label?: string | null
          provider?: string
          provisioned_by?: string | null
          status?: string
          tenant: string
          token_ref?: string | null
          updated_at?: string
        }
        Update: {
          boardroom_db?: string
          created_at?: string
          label?: string | null
          provider?: string
          provisioned_by?: string | null
          status?: string
          tenant?: string
          token_ref?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tenant_surfaces: {
        Row: {
          created_at: string
          kind: string
          label: string | null
          notion_id: string
          status: string
          surface_key: string
          tenant: string
          updated_at: string
          write_policy: string
        }
        Insert: {
          created_at?: string
          kind: string
          label?: string | null
          notion_id: string
          status?: string
          surface_key: string
          tenant: string
          updated_at?: string
          write_policy?: string
        }
        Update: {
          created_at?: string
          kind?: string
          label?: string | null
          notion_id?: string
          status?: string
          surface_key?: string
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
          created_at: string
          display_name: string
          enterprise: string | null
          notes: string | null
          office_mode: string
          onboarding_key: string | null
          principal: string | null
          status: string
          tier: string
          updated_at: string
        }
        Insert: {
          cid: string
          cob_name?: string | null
          created_at?: string
          display_name: string
          enterprise?: string | null
          notes?: string | null
          office_mode?: string
          onboarding_key?: string | null
          principal?: string | null
          status?: string
          tier?: string
          updated_at?: string
        }
        Update: {
          cid?: string
          cob_name?: string | null
          created_at?: string
          display_name?: string
          enterprise?: string | null
          notes?: string | null
          office_mode?: string
          onboarding_key?: string | null
          principal?: string | null
          status?: string
          tier?: string
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
          created_at: string
          id: string
          name: string
          settings: Json | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          settings?: Json | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          settings?: Json | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
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
    }
    Functions: {
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
      check_rate_limit: {
        Args: { p_key: string; p_max_requests: number; p_window_ms: number }
        Returns: Json
      }
      clean_expired_rate_limits: { Args: never; Returns: number }
      current_cid: { Args: never; Returns: string }
      get_action_response_status: {
        Args: { p_action_id: string }
        Returns: Json
      }
      get_cron_headers: { Args: never; Returns: Json }
      get_load_test_headers: { Args: never; Returns: Json }
      get_scheduler_health: { Args: { p_workspace_id: string }; Returns: Json }
      is_cob_operator: { Args: never; Returns: boolean }
      is_onboarding_admin: { Args: never; Returns: boolean }
      is_operator: { Args: { _user_id: string }; Returns: boolean }
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
      kernel_validate: {
        Args: { p_kernel_id: string }
        Returns: {
          check_name: string
          detail: string
          verdict: string
        }[]
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
      my_tenant: { Args: never; Returns: Json }
      next_cid: { Args: never; Returns: string }
      next_invoice_number: { Args: { p_workspace_id: string }; Returns: string }
      redeem_access_code: {
        Args: { p_cob_name?: string; p_code: string; p_display_name: string }
        Returns: Json
      }
      resolve_cid: { Args: { k: string }; Returns: string }
      verify_cron_token: {
        Args: { p_timestamp: string; p_token: string }
        Returns: boolean
      }
      verify_load_test_token: {
        Args: { p_timestamp: string; p_token: string }
        Returns: boolean
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
      workspace_role: ["owner", "admin", "member", "viewer"],
    },
  },
} as const

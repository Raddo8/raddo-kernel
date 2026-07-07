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
      accounts: {
        Row: {
          created_at: string
          id: string
          metadata: Json | null
          name: string
          primary_contact_id: string | null
          status: string | null
          type: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json | null
          name: string
          primary_contact_id?: string | null
          status?: string | null
          type?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json | null
          name?: string
          primary_contact_id?: string | null
          status?: string | null
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
          created_at: string
          description: string
          end_date: string | null
          id: string
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
          created_at?: string
          description: string
          end_date?: string | null
          id?: string
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
          created_at?: string
          description?: string
          end_date?: string | null
          id?: string
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
      [_ in never]: never
    }
    Functions: {
      check_rate_limit: {
        Args: { p_key: string; p_max_requests: number; p_window_ms: number }
        Returns: Json
      }
      clean_expired_rate_limits: { Args: never; Returns: number }
      get_action_response_status: {
        Args: { p_action_id: string }
        Returns: Json
      }
      get_cron_headers: { Args: never; Returns: Json }
      get_load_test_headers: { Args: never; Returns: Json }
      get_scheduler_health: { Args: { p_workspace_id: string }; Returns: Json }
      is_operator: { Args: { _user_id: string }; Returns: boolean }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
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

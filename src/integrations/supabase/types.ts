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
      business_leads: {
        Row: {
          audience: string
          company_name: string
          contact_name: string
          created_at: string
          id: string
          message: string | null
          role: string | null
          source: string | null
          team_size: number
          use_case: string | null
          user_id: string | null
          work_email: string
        }
        Insert: {
          audience: string
          company_name: string
          contact_name: string
          created_at?: string
          id?: string
          message?: string | null
          role?: string | null
          source?: string | null
          team_size: number
          use_case?: string | null
          user_id?: string | null
          work_email: string
        }
        Update: {
          audience?: string
          company_name?: string
          contact_name?: string
          created_at?: string
          id?: string
          message?: string | null
          role?: string | null
          source?: string | null
          team_size?: number
          use_case?: string | null
          user_id?: string | null
          work_email?: string
        }
        Relationships: []
      }
      countdowns: {
        Row: {
          created_at: string
          event_date: string | null
          event_type: string | null
          id: string
          is_deleted: boolean
          name: string
          payload: Json | null
          repeat: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_date?: string | null
          event_type?: string | null
          id: string
          is_deleted?: boolean
          name?: string
          payload?: Json | null
          repeat?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_date?: string | null
          event_type?: string | null
          id?: string
          is_deleted?: boolean
          name?: string
          payload?: Json | null
          repeat?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      device_registry: {
        Row: {
          created_at: string
          device_id: string
          id: string
          is_deleted: boolean
          last_seen_at: string
          last_sync_timestamp: string
          platform: string
          push_token: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          id?: string
          is_deleted?: boolean
          last_seen_at?: string
          last_sync_timestamp?: string
          platform: string
          push_token?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          id?: string
          is_deleted?: boolean
          last_seen_at?: string
          last_sync_timestamp?: string
          platform?: string
          push_token?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      feedback: {
        Row: {
          app_version: string | null
          category: string
          created_at: string
          id: string
          message: string
          platform: string | null
          screenshot_url: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          app_version?: string | null
          category?: string
          created_at?: string
          id?: string
          message: string
          platform?: string | null
          screenshot_url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          app_version?: string | null
          category?: string
          created_at?: string
          id?: string
          message?: string
          platform?: string | null
          screenshot_url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      file_attachments: {
        Row: {
          created_at: string
          file_name: string
          id: string
          is_deleted: boolean
          mime_type: string | null
          parent_id: string
          parent_type: string
          size_bytes: number | null
          storage_path: string
          thumbnail_path: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          is_deleted?: boolean
          mime_type?: string | null
          parent_id: string
          parent_type: string
          size_bytes?: number | null
          storage_path: string
          thumbnail_path?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          is_deleted?: boolean
          mime_type?: string | null
          parent_id?: string
          parent_type?: string
          size_bytes?: number | null
          storage_path?: string
          thumbnail_path?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      folders: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          is_deleted: boolean
          name: string
          order_index: number
          parent_folder_id: string | null
          payload: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_deleted?: boolean
          name: string
          order_index?: number
          parent_folder_id?: string | null
          payload?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_deleted?: boolean
          name?: string
          order_index?: number
          parent_folder_id?: string | null
          payload?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "folders_parent_folder_id_fkey"
            columns: ["parent_folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      habit_certificates: {
        Row: {
          created_at: string
          earned_at: string
          habit_id: string
          id: string
          is_deleted: boolean
          milestone: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          earned_at?: string
          habit_id: string
          id?: string
          is_deleted?: boolean
          milestone: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          earned_at?: string
          habit_id?: string
          id?: string
          is_deleted?: boolean
          milestone?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_certificates_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
        ]
      }
      habit_logs: {
        Row: {
          completed_on: string
          created_at: string
          habit_id: string
          id: string
          is_deleted: boolean
          note: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_on: string
          created_at?: string
          habit_id: string
          id?: string
          is_deleted?: boolean
          note?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_on?: string
          created_at?: string
          habit_id?: string
          id?: string
          is_deleted?: boolean
          note?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_logs_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
        ]
      }
      habit_sections: {
        Row: {
          created_at: string
          id: string
          is_deleted: boolean
          name: string
          order_index: number
          payload: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id: string
          is_deleted?: boolean
          name?: string
          order_index?: number
          payload?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_deleted?: boolean
          name?: string
          order_index?: number
          payload?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      habits: {
        Row: {
          color: string | null
          created_at: string
          current_streak: number
          frequency: string
          frequency_config: Json
          icon: string | null
          id: string
          is_deleted: boolean
          longest_streak: number
          name: string
          payload: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          current_streak?: number
          frequency?: string
          frequency_config?: Json
          icon?: string | null
          id?: string
          is_deleted?: boolean
          longest_streak?: number
          name: string
          payload?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          current_streak?: number
          frequency?: string
          frequency_config?: Json
          icon?: string | null
          id?: string
          is_deleted?: boolean
          longest_streak?: number
          name?: string
          payload?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lists: {
        Row: {
          color: string | null
          created_at: string
          folder_id: string | null
          icon: string | null
          id: string
          is_deleted: boolean
          name: string
          order_index: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          folder_id?: string | null
          icon?: string | null
          id?: string
          is_deleted?: boolean
          name: string
          order_index?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          folder_id?: string | null
          icon?: string | null
          id?: string
          is_deleted?: boolean
          name?: string
          order_index?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lists_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      note_versions: {
        Row: {
          body_snapshot: string | null
          created_at: string
          device_id: string | null
          id: string
          is_deleted: boolean
          note_id: string
          saved_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body_snapshot?: string | null
          created_at?: string
          device_id?: string | null
          id?: string
          is_deleted?: boolean
          note_id: string
          saved_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body_snapshot?: string | null
          created_at?: string
          device_id?: string | null
          id?: string
          is_deleted?: boolean
          note_id?: string
          saved_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_versions_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          body: string | null
          created_at: string
          folder_id: string | null
          id: string
          is_deleted: boolean
          is_pinned: boolean
          list_id: string | null
          payload: Json
          tags: string[]
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          folder_id?: string | null
          id?: string
          is_deleted?: boolean
          is_pinned?: boolean
          list_id?: string | null
          payload?: Json
          tags?: string[]
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          folder_id?: string | null
          id?: string
          is_deleted?: boolean
          is_pinned?: boolean
          list_id?: string | null
          payload?: Json
          tags?: string[]
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_responses: {
        Row: {
          created_at: string
          device_id: string | null
          devices: Json | null
          frustration: string | null
          goals: Json | null
          id: string
          journey_selected: string | null
          language: string | null
          note_created: boolean | null
          notes_folders_count: number | null
          offline_preference: string | null
          previous_app: string | null
          sketch_created: boolean | null
          slowdown_reason: string | null
          source: string | null
          task_view_preference: string | null
          tasks_created_count: number | null
          tasks_folders_count: number | null
          unfinished_reason: string | null
          user_email: string | null
          user_name: string | null
          why_apps_fail: string | null
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          devices?: Json | null
          frustration?: string | null
          goals?: Json | null
          id?: string
          journey_selected?: string | null
          language?: string | null
          note_created?: boolean | null
          notes_folders_count?: number | null
          offline_preference?: string | null
          previous_app?: string | null
          sketch_created?: boolean | null
          slowdown_reason?: string | null
          source?: string | null
          task_view_preference?: string | null
          tasks_created_count?: number | null
          tasks_folders_count?: number | null
          unfinished_reason?: string | null
          user_email?: string | null
          user_name?: string | null
          why_apps_fail?: string | null
        }
        Update: {
          created_at?: string
          device_id?: string | null
          devices?: Json | null
          frustration?: string | null
          goals?: Json | null
          id?: string
          journey_selected?: string | null
          language?: string | null
          note_created?: boolean | null
          notes_folders_count?: number | null
          offline_preference?: string | null
          previous_app?: string | null
          sketch_created?: boolean | null
          slowdown_reason?: string | null
          source?: string | null
          task_view_preference?: string | null
          tasks_created_count?: number | null
          tasks_folders_count?: number | null
          unfinished_reason?: string | null
          user_email?: string | null
          user_name?: string | null
          why_apps_fail?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          cover_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          cover_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          cover_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      public_notes: {
        Row: {
          content: string
          cover_image: string | null
          created_at: string
          id: string
          note_id: string
          published_at: string
          slug: string
          title: string
          updated_at: string
          user_id: string
          view_count: number
        }
        Insert: {
          content?: string
          cover_image?: string | null
          created_at?: string
          id?: string
          note_id: string
          published_at?: string
          slug: string
          title?: string
          updated_at?: string
          user_id: string
          view_count?: number
        }
        Update: {
          content?: string
          cover_image?: string | null
          created_at?: string
          id?: string
          note_id?: string
          published_at?: string
          slug?: string
          title?: string
          updated_at?: string
          user_id?: string
          view_count?: number
        }
        Relationships: []
      }
      sections: {
        Row: {
          created_at: string
          folder_id: string | null
          id: string
          is_deleted: boolean
          list_id: string | null
          name: string
          order_index: number
          payload: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          folder_id?: string | null
          id?: string
          is_deleted?: boolean
          list_id?: string | null
          name: string
          order_index?: number
          payload?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          folder_id?: string | null
          id?: string
          is_deleted?: boolean
          list_id?: string | null
          name?: string
          order_index?: number
          payload?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sections_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_status: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          is_deleted: boolean
          plan_name: string
          started_at: string
          store: string | null
          store_transaction_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          plan_name?: string
          started_at?: string
          store?: string | null
          store_transaction_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          plan_name?: string
          started_at?: string
          store?: string | null
          store_transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          is_trialing: boolean
          plan_type: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string
          user_email: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          is_trialing?: boolean
          plan_type?: string
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string
          user_email: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          is_trialing?: boolean
          plan_type?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string
          user_email?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          due_date: string | null
          folder_id: string | null
          id: string
          is_completed: boolean
          is_deleted: boolean
          list_id: string | null
          notes: string | null
          order_index: number
          parent_task_id: string | null
          payload: Json
          priority: number
          reminder_at: string | null
          section_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          folder_id?: string | null
          id?: string
          is_completed?: boolean
          is_deleted?: boolean
          list_id?: string | null
          notes?: string | null
          order_index?: number
          parent_task_id?: string | null
          payload?: Json
          priority?: number
          reminder_at?: string | null
          section_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          folder_id?: string | null
          id?: string
          is_completed?: boolean
          is_deleted?: boolean
          list_id?: string | null
          notes?: string | null
          order_index?: number
          parent_task_id?: string | null
          payload?: Json
          priority?: number
          reminder_at?: string | null
          section_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      user_daily_ai_usage: {
        Row: {
          count: number
          created_at: string
          feature: string
          id: string
          identifier: string
          identifier_type: string
          updated_at: string
          usage_date: string
        }
        Insert: {
          count?: number
          created_at?: string
          feature: string
          id?: string
          identifier: string
          identifier_type: string
          updated_at?: string
          usage_date: string
        }
        Update: {
          count?: number
          created_at?: string
          feature?: string
          id?: string
          identifier?: string
          identifier_type?: string
          updated_at?: string
          usage_date?: string
        }
        Relationships: []
      }
      user_entitlements: {
        Row: {
          app_user_id: string
          created_at: string
          expires_at: string | null
          grace_period_expires_at: string | null
          id: string
          is_active: boolean
          product_id: string | null
          updated_at: string
        }
        Insert: {
          app_user_id: string
          created_at?: string
          expires_at?: string | null
          grace_period_expires_at?: string | null
          id?: string
          is_active?: boolean
          product_id?: string | null
          updated_at?: string
        }
        Update: {
          app_user_id?: string
          created_at?: string
          expires_at?: string | null
          grace_period_expires_at?: string | null
          id?: string
          is_active?: boolean
          product_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_lifetime_counters: {
        Row: {
          created_at: string
          id: string
          identifier: string
          identifier_type: string
          note_folders_created: number
          notes_created: number
          task_folders_created: number
          task_sections_created: number
          tasks_created: number
          trial_device_fingerprint: string | null
          trial_started_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          identifier: string
          identifier_type: string
          note_folders_created?: number
          notes_created?: number
          task_folders_created?: number
          task_sections_created?: number
          tasks_created?: number
          trial_device_fingerprint?: string | null
          trial_started_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          identifier?: string
          identifier_type?: string
          note_folders_created?: number
          notes_created?: number
          task_folders_created?: number
          task_sections_created?: number
          tasks_created?: number
          trial_device_fingerprint?: string | null
          trial_started_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_refresh_tokens: {
        Row: {
          created_at: string
          google_refresh_token: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          google_refresh_token: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          google_refresh_token?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string
          date_format: string
          display_options: Json
          first_day_of_week: number
          id: string
          is_deleted: boolean
          language: string
          notification_preferences: Json
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date_format?: string
          display_options?: Json
          first_day_of_week?: number
          id?: string
          is_deleted?: boolean
          language?: string
          notification_preferences?: Json
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date_format?: string
          display_options?: Json
          first_day_of_week?: number
          id?: string
          is_deleted?: boolean
          language?: string
          notification_preferences?: Json
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      decrement_ai_usage: {
        Args: {
          p_feature: string
          p_identifier: string
          p_identifier_type: string
          p_usage_date: string
        }
        Returns: undefined
      }
      increment_ai_usage_if_under_limit: {
        Args: {
          p_feature: string
          p_identifier: string
          p_identifier_type: string
          p_limit: number
          p_usage_date: string
        }
        Returns: {
          allowed: boolean
          new_count: number
        }[]
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
    Enums: {},
  },
} as const

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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      api_keys: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          key: string
          last_used_at: string | null
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          last_used_at?: string | null
          name?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          last_used_at?: string | null
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      api_usage_logs: {
        Row: {
          api_key: string | null
          api_key_id: string | null
          created_at: string
          endpoint: string
          id: string
          method: string
          status_code: number
          user_id: string
        }
        Insert: {
          api_key?: string | null
          api_key_id?: string | null
          created_at?: string
          endpoint: string
          id?: string
          method?: string
          status_code?: number
          user_id: string
        }
        Update: {
          api_key?: string | null
          api_key_id?: string | null
          created_at?: string
          endpoint?: string
          id?: string
          method?: string
          status_code?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_logs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      content_posts: {
        Row: {
          author: string | null
          category: string
          content: string
          created_at: string
          excerpt: string
          id: string
          image_url: string | null
          is_published: boolean
          meta_description: string | null
          meta_keywords: string[] | null
          meta_title: string | null
          published_at: string | null
          slug: string
          status: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          author?: string | null
          category?: string
          content?: string
          created_at?: string
          excerpt?: string
          id?: string
          image_url?: string | null
          is_published?: boolean
          meta_description?: string | null
          meta_keywords?: string[] | null
          meta_title?: string | null
          published_at?: string | null
          slug?: string
          status?: string
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          author?: string | null
          category?: string
          content?: string
          created_at?: string
          excerpt?: string
          id?: string
          image_url?: string | null
          is_published?: boolean
          meta_description?: string | null
          meta_keywords?: string[] | null
          meta_title?: string | null
          published_at?: string | null
          slug?: string
          status?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      internal_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          sender_id: string
          team_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          sender_id: string
          team_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          sender_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_messages_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      issue_reports: {
        Row: {
          created_at: string
          description: string | null
          id: string
          priority: string
          status: string
          title: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          status?: string
          title: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          status?: string
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      job_applications: {
        Row: {
          cover_letter: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          job_id: string
          name: string
          phone: string | null
          portfolio_url: string | null
          resume_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          cover_letter?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          job_id: string
          name: string
          phone?: string | null
          portfolio_url?: string | null
          resume_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          cover_letter?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          job_id?: string
          name?: string
          phone?: string | null
          portfolio_url?: string | null
          resume_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      job_positions: {
        Row: {
          created_at: string
          department: string
          description: string
          id: string
          is_active: boolean
          location: string
          requirements: string[]
          title: string
        }
        Insert: {
          created_at?: string
          department?: string
          description?: string
          id?: string
          is_active?: boolean
          location?: string
          requirements?: string[]
          title: string
        }
        Update: {
          created_at?: string
          department?: string
          description?: string
          id?: string
          is_active?: boolean
          location?: string
          requirements?: string[]
          title?: string
        }
        Relationships: []
      }
      server_status_logs: {
        Row: {
          created_at: string
          id: string
          status: string
          uptime_percentage: number
        }
        Insert: {
          created_at?: string
          id?: string
          status?: string
          uptime_percentage?: number
        }
        Update: {
          created_at?: string
          id?: string
          status?: string
          uptime_percentage?: number
        }
        Relationships: []
      }
      system_incidents: {
        Row: {
          affected_services: string[]
          body: string
          created_at: string
          id: string
          resolved_at: string | null
          severity: string
          status: string
          title: string
        }
        Insert: {
          affected_services?: string[]
          body?: string
          created_at?: string
          id?: string
          resolved_at?: string | null
          severity?: string
          status?: string
          title: string
        }
        Update: {
          affected_services?: string[]
          body?: string
          created_at?: string
          id?: string
          resolved_at?: string | null
          severity?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      system_services: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          status: string
          uptime_90_days: number
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          name: string
          status?: string
          uptime_90_days?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          status?: string
          uptime_90_days?: number
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assigned_to: string | null
          assignee_id: string | null
          created_at: string
          creator_id: string | null
          description: string | null
          due_date: string | null
          id: string
          priority: string
          status: string
          team_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          assignee_id?: string | null
          created_at?: string
          creator_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          status?: string
          team_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          assignee_id?: string | null
          created_at?: string
          creator_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          status?: string
          team_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          role: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          description: string | null
          id: string
          manager_id: string | null
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          manager_id?: string | null
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          manager_id?: string | null
          name?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          created_at: string
          currency: string
          description: string | null
          id: string
          refunded_amount: number | null
          status: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          refunded_amount?: number | null
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          refunded_amount?: number | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      user_feedback: {
        Row: {
          created_at: string
          email: string | null
          id: string
          message: string
          priority: string
          status: string
          subject: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          message: string
          priority?: string
          status?: string
          subject: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          message?: string
          priority?: string
          status?: string
          subject?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      user_ratings: {
        Row: {
          approved: boolean
          conversation_id: string | null
          created_at: string
          display_name: string | null
          id: string
          rating: number
          review: string | null
          user_id: string
        }
        Insert: {
          approved?: boolean
          conversation_id?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          rating?: number
          review?: string | null
          user_id: string
        }
        Update: {
          approved?: boolean
          conversation_id?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          rating?: number
          review?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          api_key: string | null
          api_requests_reset_at: string | null
          api_requests_today: number
          auto_renew: boolean
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          is_banned: boolean
          last_login: string | null
          plan_duration_days: number
          role: string
          subscription_active: boolean
          subscription_expires_at: string | null
          tier: Database["public"]["Enums"]["subscription_tier"]
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key?: string | null
          api_requests_reset_at?: string | null
          api_requests_today?: number
          auto_renew?: boolean
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          is_banned?: boolean
          last_login?: string | null
          plan_duration_days?: number
          role?: string
          subscription_active?: boolean
          subscription_expires_at?: string | null
          tier?: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string | null
          api_requests_reset_at?: string | null
          api_requests_today?: number
          auto_renew?: boolean
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          is_banned?: boolean
          last_login?: string | null
          plan_duration_days?: number
          role?: string
          subscription_active?: boolean
          subscription_expires_at?: string | null
          tier?: Database["public"]["Enums"]["subscription_tier"]
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
      get_system_stats: { Args: never; Returns: Json }
      increment_api_usage: {
        Args: { user_id_param: string }
        Returns: undefined
      }
      refresh_my_subscription: { Args: never; Returns: undefined }
      set_user_subscription_plan: {
        Args: {
          auto_renew_param?: boolean
          duration_days?: number
          new_tier: string
          target_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      subscription_tier: "free" | "basic" | "pro" | "enterprise"
      user_role: "admin" | "user"
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
      subscription_tier: ["free", "basic", "pro", "enterprise"],
      user_role: ["admin", "user"],
    },
  },
} as const

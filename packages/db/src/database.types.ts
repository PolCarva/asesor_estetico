export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      ai_usage: {
        Row: {
          created_at: string;
          duration_ms: number;
          estimated_cost_usd: number;
          id: string;
          image_count: number;
          input_tokens: number;
          job_id: string | null;
          metadata: NonNullable<Json>;
          model: string;
          operation: Database["public"]["Enums"]["ai_operation"];
          output_tokens: number;
          provider: string;
          success: boolean;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          duration_ms?: number;
          estimated_cost_usd?: number;
          id?: string;
          image_count?: number;
          input_tokens?: number;
          job_id?: string | null;
          metadata?: NonNullable<Json>;
          model: string;
          operation: Database["public"]["Enums"]["ai_operation"];
          output_tokens?: number;
          provider: string;
          success?: boolean;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          duration_ms?: number;
          estimated_cost_usd?: number;
          id?: string;
          image_count?: number;
          input_tokens?: number;
          job_id?: string | null;
          metadata?: NonNullable<Json>;
          model?: string;
          operation?: Database["public"]["Enums"]["ai_operation"];
          output_tokens?: number;
          provider?: string;
          success?: boolean;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_usage_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_usage_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      analytics_events: {
        Row: {
          anonymous_id: string | null;
          created_at: string;
          id: string;
          name: string;
          path: string | null;
          properties: NonNullable<Json>;
          user_id: string | null;
        };
        Insert: {
          anonymous_id?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          path?: string | null;
          properties?: NonNullable<Json>;
          user_id?: string | null;
        };
        Update: {
          anonymous_id?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          path?: string | null;
          properties?: NonNullable<Json>;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "analytics_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      cart_items: {
        Row: {
          cart_id: string;
          created_at: string;
          currency_snapshot: Database["public"]["Enums"]["currency_code"];
          id: string;
          price_amount_snapshot: number;
          product_id: string;
          quantity: number;
          updated_at: string;
          variant_id: string | null;
        };
        Insert: {
          cart_id: string;
          created_at?: string;
          currency_snapshot: Database["public"]["Enums"]["currency_code"];
          id?: string;
          price_amount_snapshot: number;
          product_id: string;
          quantity?: number;
          updated_at?: string;
          variant_id?: string | null;
        };
        Update: {
          cart_id?: string;
          created_at?: string;
          currency_snapshot?: Database["public"]["Enums"]["currency_code"];
          id?: string;
          price_amount_snapshot?: number;
          product_id?: string;
          quantity?: number;
          updated_at?: string;
          variant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey";
            columns: ["cart_id"];
            isOneToOne: false;
            referencedRelation: "carts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cart_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      carts: {
        Row: {
          created_at: string;
          id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "carts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_messages: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          metadata: NonNullable<Json>;
          role: Database["public"]["Enums"]["chat_role"];
          thread_id: string;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          metadata?: NonNullable<Json>;
          role: Database["public"]["Enums"]["chat_role"];
          thread_id: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          metadata?: NonNullable<Json>;
          role?: Database["public"]["Enums"]["chat_role"];
          thread_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_messages_thread_id_fkey";
            columns: ["thread_id"];
            isOneToOne: false;
            referencedRelation: "chat_threads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_messages_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_threads: {
        Row: {
          created_at: string;
          id: string;
          look_id: string | null;
          title: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          look_id?: string | null;
          title?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          look_id?: string | null;
          title?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_threads_look_id_fkey";
            columns: ["look_id"];
            isOneToOne: false;
            referencedRelation: "looks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_threads_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      favorites: {
        Row: {
          created_at: string;
          id: string;
          look_id: string | null;
          product_id: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          look_id?: string | null;
          product_id?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          look_id?: string | null;
          product_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "favorites_look_id_fkey";
            columns: ["look_id"];
            isOneToOne: false;
            referencedRelation: "looks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "favorites_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "favorites_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      jobs: {
        Row: {
          attempts: number;
          created_at: string;
          finished_at: string | null;
          id: string;
          idempotency_key: string | null;
          last_error: string | null;
          locked_at: string | null;
          locked_by: string | null;
          max_attempts: number;
          payload: NonNullable<Json>;
          priority: number;
          result: Json | null;
          scheduled_at: string;
          status: Database["public"]["Enums"]["job_status"];
          type: Database["public"]["Enums"]["job_type"];
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          finished_at?: string | null;
          id?: string;
          idempotency_key?: string | null;
          last_error?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          max_attempts?: number;
          payload?: NonNullable<Json>;
          priority?: number;
          result?: Json | null;
          scheduled_at?: string;
          status?: Database["public"]["Enums"]["job_status"];
          type: Database["public"]["Enums"]["job_type"];
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          finished_at?: string | null;
          id?: string;
          idempotency_key?: string | null;
          last_error?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          max_attempts?: number;
          payload?: NonNullable<Json>;
          priority?: number;
          result?: Json | null;
          scheduled_at?: string;
          status?: Database["public"]["Enums"]["job_status"];
          type?: Database["public"]["Enums"]["job_type"];
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "jobs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      look_products: {
        Row: {
          created_at: string;
          garment_slot: string;
          id: string;
          look_id: string;
          product_id: string;
          rank: number;
          score: number;
          score_breakdown: NonNullable<Json>;
        };
        Insert: {
          created_at?: string;
          garment_slot: string;
          id?: string;
          look_id: string;
          product_id: string;
          rank: number;
          score: number;
          score_breakdown?: NonNullable<Json>;
        };
        Update: {
          created_at?: string;
          garment_slot?: string;
          id?: string;
          look_id?: string;
          product_id?: string;
          rank?: number;
          score?: number;
          score_breakdown?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "look_products_look_id_fkey";
            columns: ["look_id"];
            isOneToOne: false;
            referencedRelation: "looks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "look_products_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      looks: {
        Row: {
          created_at: string;
          id: string;
          image_storage_path: string | null;
          name: string;
          position: number;
          preview_storage_path: string | null;
          spec_json: NonNullable<Json>;
          status: Database["public"]["Enums"]["look_status"];
          style_profile_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          image_storage_path?: string | null;
          name: string;
          position: number;
          preview_storage_path?: string | null;
          spec_json: NonNullable<Json>;
          status?: Database["public"]["Enums"]["look_status"];
          style_profile_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          image_storage_path?: string | null;
          name?: string;
          position?: number;
          preview_storage_path?: string | null;
          spec_json?: NonNullable<Json>;
          status?: Database["public"]["Enums"]["look_status"];
          style_profile_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "looks_style_profile_id_fkey";
            columns: ["style_profile_id"];
            isOneToOne: false;
            referencedRelation: "style_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "looks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_events: {
        Row: {
          created_at: string;
          error: string | null;
          event_id: string;
          event_type: string;
          id: string;
          payload: NonNullable<Json>;
          processed_at: string | null;
          provider: Database["public"]["Enums"]["payment_provider"];
          status: Database["public"]["Enums"]["payment_event_status"];
        };
        Insert: {
          created_at?: string;
          error?: string | null;
          event_id: string;
          event_type: string;
          id?: string;
          payload: NonNullable<Json>;
          processed_at?: string | null;
          provider: Database["public"]["Enums"]["payment_provider"];
          status?: Database["public"]["Enums"]["payment_event_status"];
        };
        Update: {
          created_at?: string;
          error?: string | null;
          event_id?: string;
          event_type?: string;
          id?: string;
          payload?: NonNullable<Json>;
          processed_at?: string | null;
          provider?: Database["public"]["Enums"]["payment_provider"];
          status?: Database["public"]["Enums"]["payment_event_status"];
        };
        Relationships: [];
      };
      product_variants: {
        Row: {
          availability: Database["public"]["Enums"]["product_availability"];
          color: string | null;
          created_at: string;
          currency: Database["public"]["Enums"]["currency_code"] | null;
          external_id: string;
          id: string;
          price_amount: number | null;
          product_id: string;
          size: string | null;
          sku: string | null;
          updated_at: string;
        };
        Insert: {
          availability?: Database["public"]["Enums"]["product_availability"];
          color?: string | null;
          created_at?: string;
          currency?: Database["public"]["Enums"]["currency_code"] | null;
          external_id: string;
          id?: string;
          price_amount?: number | null;
          product_id: string;
          size?: string | null;
          sku?: string | null;
          updated_at?: string;
        };
        Update: {
          availability?: Database["public"]["Enums"]["product_availability"];
          color?: string | null;
          created_at?: string;
          currency?: Database["public"]["Enums"]["currency_code"] | null;
          external_id?: string;
          id?: string;
          price_amount?: number | null;
          product_id?: string;
          size?: string | null;
          sku?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          availability: Database["public"]["Enums"]["product_availability"];
          brand: string | null;
          category: Database["public"]["Enums"]["product_category"];
          colors: string[];
          created_at: string;
          currency: Database["public"]["Enums"]["currency_code"] | null;
          data_json: NonNullable<Json>;
          description: string | null;
          external_id: string;
          fit: string | null;
          id: string;
          image_url: string | null;
          last_fetched_at: string;
          materials: string[];
          price_amount: number | null;
          store_domain: string;
          store_name: string;
          title: string;
          updated_at: string;
          url: string;
        };
        Insert: {
          availability?: Database["public"]["Enums"]["product_availability"];
          brand?: string | null;
          category: Database["public"]["Enums"]["product_category"];
          colors?: string[];
          created_at?: string;
          currency?: Database["public"]["Enums"]["currency_code"] | null;
          data_json?: NonNullable<Json>;
          description?: string | null;
          external_id: string;
          fit?: string | null;
          id?: string;
          image_url?: string | null;
          last_fetched_at?: string;
          materials?: string[];
          price_amount?: number | null;
          store_domain: string;
          store_name: string;
          title: string;
          updated_at?: string;
          url: string;
        };
        Update: {
          availability?: Database["public"]["Enums"]["product_availability"];
          brand?: string | null;
          category?: Database["public"]["Enums"]["product_category"];
          colors?: string[];
          created_at?: string;
          currency?: Database["public"]["Enums"]["currency_code"] | null;
          data_json?: NonNullable<Json>;
          description?: string | null;
          external_id?: string;
          fit?: string | null;
          id?: string;
          image_url?: string | null;
          last_fetched_at?: string;
          materials?: string[];
          price_amount?: number | null;
          store_domain?: string;
          store_name?: string;
          title?: string;
          updated_at?: string;
          url?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          age_confirmed_at: string | null;
          country_code: string;
          created_at: string;
          display_name: string | null;
          id: string;
          onboarding_completed: boolean;
          role: Database["public"]["Enums"]["user_role"];
          style_risk_level: Database["public"]["Enums"]["style_risk_level"];
          tattoo_preference: Database["public"]["Enums"]["tattoo_preference"];
          updated_at: string;
        };
        Insert: {
          age_confirmed_at?: string | null;
          country_code?: string;
          created_at?: string;
          display_name?: string | null;
          id: string;
          onboarding_completed?: boolean;
          role?: Database["public"]["Enums"]["user_role"];
          style_risk_level?: Database["public"]["Enums"]["style_risk_level"];
          tattoo_preference?: Database["public"]["Enums"]["tattoo_preference"];
          updated_at?: string;
        };
        Update: {
          age_confirmed_at?: string | null;
          country_code?: string;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          onboarding_completed?: boolean;
          role?: Database["public"]["Enums"]["user_role"];
          style_risk_level?: Database["public"]["Enums"]["style_risk_level"];
          tattoo_preference?: Database["public"]["Enums"]["tattoo_preference"];
          updated_at?: string;
        };
        Relationships: [];
      };
      style_advice: {
        Row: {
          advice_json: NonNullable<Json>;
          created_at: string;
          style_profile_id: string;
          user_id: string;
        };
        Insert: {
          advice_json: NonNullable<Json>;
          created_at?: string;
          style_profile_id: string;
          user_id: string;
        };
        Update: {
          advice_json?: NonNullable<Json>;
          created_at?: string;
          style_profile_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "style_advice_style_profile_id_user_id_fkey";
            columns: ["style_profile_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "style_profiles";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "style_advice_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      style_profiles: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          profile_json: NonNullable<Json>;
          user_id: string;
          version: number;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          profile_json: NonNullable<Json>;
          user_id: string;
          version: number;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          profile_json?: NonNullable<Json>;
          user_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "style_profiles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean;
          created_at: string;
          currency: Database["public"]["Enums"]["currency_code"];
          current_period_end: string | null;
          current_period_start: string | null;
          id: string;
          plan: string;
          price_amount: number;
          provider: Database["public"]["Enums"]["payment_provider"];
          provider_subscription_id: string | null;
          status: Database["public"]["Enums"]["subscription_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          cancel_at_period_end?: boolean;
          created_at?: string;
          currency?: Database["public"]["Enums"]["currency_code"];
          current_period_end?: string | null;
          current_period_start?: string | null;
          id?: string;
          plan?: string;
          price_amount?: number;
          provider: Database["public"]["Enums"]["payment_provider"];
          provider_subscription_id?: string | null;
          status?: Database["public"]["Enums"]["subscription_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          cancel_at_period_end?: boolean;
          created_at?: string;
          currency?: Database["public"]["Enums"]["currency_code"];
          current_period_end?: string | null;
          current_period_start?: string | null;
          id?: string;
          plan?: string;
          price_amount?: number;
          provider?: Database["public"]["Enums"]["payment_provider"];
          provider_subscription_id?: string | null;
          status?: Database["public"]["Enums"]["subscription_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_photos: {
        Row: {
          created_at: string;
          id: string;
          metadata_json: NonNullable<Json>;
          mime_type: string;
          size_bytes: number;
          status: Database["public"]["Enums"]["user_photo_status"];
          storage_path: string;
          type: Database["public"]["Enums"]["user_photo_type"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          metadata_json?: NonNullable<Json>;
          mime_type: string;
          size_bytes: number;
          status?: Database["public"]["Enums"]["user_photo_status"];
          storage_path: string;
          type: Database["public"]["Enums"]["user_photo_type"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          metadata_json?: NonNullable<Json>;
          mime_type?: string;
          size_bytes?: number;
          status?: Database["public"]["Enums"]["user_photo_status"];
          storage_path?: string;
          type?: Database["public"]["Enums"]["user_photo_type"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_photos_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_event_counts: {
        Args: { p_days?: number };
        Returns: {
          name: string;
          total: number;
          unique_users: number;
        }[];
      };
      admin_overview_metrics: { Args: Record<PropertyKey, never>; Returns: Json };
      can_read_generated_look: { Args: { p_object_name: string }; Returns: boolean };
      claim_next_job: {
        Args: {
          p_lock_timeout_seconds?: number;
          p_types?: Database["public"]["Enums"]["job_type"][];
          p_worker_id: string;
        };
        Returns: {
          attempts: number;
          created_at: string;
          finished_at: string | null;
          id: string;
          idempotency_key: string | null;
          last_error: string | null;
          locked_at: string | null;
          locked_by: string | null;
          max_attempts: number;
          payload: NonNullable<Json>;
          priority: number;
          result: Json | null;
          scheduled_at: string;
          status: Database["public"]["Enums"]["job_status"];
          type: Database["public"]["Enums"]["job_type"];
          updated_at: string;
          user_id: string | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "jobs";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      complete_job: {
        Args: { p_job_id: string; p_result?: Json; p_worker_id: string };
        Returns: {
          attempts: number;
          created_at: string;
          finished_at: string | null;
          id: string;
          idempotency_key: string | null;
          last_error: string | null;
          locked_at: string | null;
          locked_by: string | null;
          max_attempts: number;
          payload: NonNullable<Json>;
          priority: number;
          result: Json | null;
          scheduled_at: string;
          status: Database["public"]["Enums"]["job_status"];
          type: Database["public"]["Enums"]["job_type"];
          updated_at: string;
          user_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "jobs";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_style_profile_with_looks: {
        Args: { p_advice: Json; p_looks: Json; p_profile: Json; p_user_id: string };
        Returns: {
          look_id: string;
          look_position: number;
          style_profile_id: string;
        }[];
      };
      current_user_is_premium: { Args: Record<PropertyKey, never>; Returns: boolean };
      enqueue_job: {
        Args: {
          p_idempotency_key?: string;
          p_max_attempts?: number;
          p_payload?: Json;
          p_priority?: number;
          p_scheduled_at?: string;
          p_type: Database["public"]["Enums"]["job_type"];
          p_user_id?: string;
        };
        Returns: {
          attempts: number;
          created_at: string;
          finished_at: string | null;
          id: string;
          idempotency_key: string | null;
          last_error: string | null;
          locked_at: string | null;
          locked_by: string | null;
          max_attempts: number;
          payload: NonNullable<Json>;
          priority: number;
          result: Json | null;
          scheduled_at: string;
          status: Database["public"]["Enums"]["job_status"];
          type: Database["public"]["Enums"]["job_type"];
          updated_at: string;
          user_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "jobs";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      fail_job: {
        Args: {
          p_error: string;
          p_job_id: string;
          p_retry_delay_seconds?: number;
          p_retryable?: boolean;
          p_worker_id: string;
        };
        Returns: {
          attempts: number;
          created_at: string;
          finished_at: string | null;
          id: string;
          idempotency_key: string | null;
          last_error: string | null;
          locked_at: string | null;
          locked_by: string | null;
          max_attempts: number;
          payload: NonNullable<Json>;
          priority: number;
          result: Json | null;
          scheduled_at: string;
          status: Database["public"]["Enums"]["job_status"];
          type: Database["public"]["Enums"]["job_type"];
          updated_at: string;
          user_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "jobs";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      retry_job: {
        Args: { p_job_id: string };
        Returns: {
          attempts: number;
          created_at: string;
          finished_at: string | null;
          id: string;
          idempotency_key: string | null;
          last_error: string | null;
          locked_at: string | null;
          locked_by: string | null;
          max_attempts: number;
          payload: NonNullable<Json>;
          priority: number;
          result: Json | null;
          scheduled_at: string;
          status: Database["public"]["Enums"]["job_status"];
          type: Database["public"]["Enums"]["job_type"];
          updated_at: string;
          user_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "jobs";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      ai_operation:
        | "VALIDATE_PHOTOS"
        | "ANALYZE_STYLE_PROFILE"
        | "GENERATE_LOOK_SPECS"
        | "GENERATE_LOOK_IMAGE"
        | "CHAT";
      chat_role: "user" | "assistant";
      currency_code: "UYU" | "USD";
      job_status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
      job_type:
        | "VALIDATE_PHOTOS"
        | "ANALYZE_STYLE_PROFILE"
        | "GENERATE_LOOK_PREVIEW"
        | "GENERATE_LOOK"
        | "GENERATE_STYLE_BOARD"
        | "SEARCH_PRODUCTS"
        | "REFRESH_PRODUCT";
      look_status: "PENDING" | "GENERATING" | "READY" | "FAILED";
      payment_event_status: "RECEIVED" | "PROCESSED" | "IGNORED" | "FAILED";
      payment_provider: "MOCK" | "MERCADOPAGO";
      product_availability: "IN_STOCK" | "OUT_OF_STOCK" | "UNKNOWN" | "IN_STORE_ONLY";
      product_category:
        | "SHIRT"
        | "T_SHIRT"
        | "KNITWEAR"
        | "TOP"
        | "OUTERWEAR"
        | "BLAZER"
        | "PANTS"
        | "JEANS"
        | "SHORTS"
        | "SKIRT"
        | "DRESS"
        | "SHOES"
        | "BAG"
        | "BELT"
        | "JEWELRY"
        | "EYEWEAR"
        | "WATCH"
        | "HAT"
        | "SCARF"
        | "OTHER";
      style_risk_level: "CONSERVATIVE" | "BALANCED" | "BOLD";
      subscription_status: "FREE" | "PENDING" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED";
      tattoo_preference: "HIGHLIGHT" | "NEUTRAL" | "COVER";
      user_photo_status: "UPLOADED" | "VALIDATING" | "VALID" | "INVALID";
      user_photo_type: "MAIN_BODY" | "FACE_DETAIL";
      user_role: "user" | "admin";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      ai_operation: [
        "VALIDATE_PHOTOS",
        "ANALYZE_STYLE_PROFILE",
        "GENERATE_LOOK_SPECS",
        "GENERATE_LOOK_IMAGE",
        "CHAT",
      ],
      chat_role: ["user", "assistant"],
      currency_code: ["UYU", "USD"],
      job_status: ["QUEUED", "RUNNING", "COMPLETED", "FAILED"],
      job_type: [
        "VALIDATE_PHOTOS",
        "ANALYZE_STYLE_PROFILE",
        "GENERATE_LOOK_PREVIEW",
        "GENERATE_LOOK",
        "GENERATE_STYLE_BOARD",
        "SEARCH_PRODUCTS",
        "REFRESH_PRODUCT",
      ],
      look_status: ["PENDING", "GENERATING", "READY", "FAILED"],
      payment_event_status: ["RECEIVED", "PROCESSED", "IGNORED", "FAILED"],
      payment_provider: ["MOCK", "MERCADOPAGO"],
      product_availability: ["IN_STOCK", "OUT_OF_STOCK", "UNKNOWN", "IN_STORE_ONLY"],
      product_category: [
        "SHIRT",
        "T_SHIRT",
        "KNITWEAR",
        "TOP",
        "OUTERWEAR",
        "BLAZER",
        "PANTS",
        "JEANS",
        "SHORTS",
        "SKIRT",
        "DRESS",
        "SHOES",
        "BAG",
        "BELT",
        "JEWELRY",
        "EYEWEAR",
        "WATCH",
        "HAT",
        "SCARF",
        "OTHER",
      ],
      style_risk_level: ["CONSERVATIVE", "BALANCED", "BOLD"],
      subscription_status: ["FREE", "PENDING", "ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED"],
      tattoo_preference: ["HIGHLIGHT", "NEUTRAL", "COVER"],
      user_photo_status: ["UPLOADED", "VALIDATING", "VALID", "INVALID"],
      user_photo_type: ["MAIN_BODY", "FACE_DETAIL"],
      user_role: ["user", "admin"],
    },
  },
} as const;

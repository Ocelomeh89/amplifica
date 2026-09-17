export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          monthly_savings_contribution: number;
          net_worth_goal: number;
          monthly_cashflow_goal: number;
          external_net_worth: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          monthly_savings_contribution?: number;
          net_worth_goal?: number;
          monthly_cashflow_goal?: number;
          external_net_worth?: number;
        };
        Update: {
          monthly_savings_contribution?: number;
          net_worth_goal?: number;
          monthly_cashflow_goal?: number;
          external_net_worth?: number;
        };
        Relationships: [];
      };
      amplicons: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          ai_type: string;
          face_value: number;
          term_months: number;
          interest_pct: number;
          start_date: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          name: string;
          ai_type?: string;
          face_value: number;
          term_months: number;
          interest_pct: number;
          start_date: string;
        };
        Update: {
          name?: string;
          ai_type?: string;
          face_value?: number;
          term_months?: number;
          interest_pct?: number;
          start_date?: string;
        };
        Relationships: [];
      };
      locs: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          loc_type: "HELOC" | "PLOC";
          size: number;
          utilization: number;
          utilization_updated_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          name: string;
          loc_type: "HELOC" | "PLOC";
          size: number;
          utilization?: number;
        };
        Update: {
          name?: string;
          loc_type?: "HELOC" | "PLOC";
          size?: number;
          utilization?: number;
          utilization_updated_at?: string;
        };
        Relationships: [];
      };
      projections: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          msc: number;
          investment_size_factor: number;
          term_months: number;
          investment_interest_pct: number;
          loc_increase: number;
          loc_interest_pct: number;
          market_return_pct: number;
          payoff_upgrade_months: number;
          continuous_growth: boolean;
          perpetual_mix: number;
          perpetual_yield_pct: number;
          perpetual_trigger_size: number;
          msc_end_month: number | null;
          withdrawal_amount: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          name?: string;
          msc?: number;
          investment_size_factor?: number;
          term_months?: number;
          investment_interest_pct?: number;
          loc_increase?: number;
          loc_interest_pct?: number;
          market_return_pct?: number;
          payoff_upgrade_months?: number;
          continuous_growth?: boolean;
          perpetual_mix?: number;
          perpetual_yield_pct?: number;
          perpetual_trigger_size?: number;
          msc_end_month?: number | null;
          withdrawal_amount?: number;
        };
        Update: {
          name?: string;
          msc?: number;
          investment_size_factor?: number;
          term_months?: number;
          investment_interest_pct?: number;
          loc_increase?: number;
          loc_interest_pct?: number;
          market_return_pct?: number;
          payoff_upgrade_months?: number;
          continuous_growth?: boolean;
          perpetual_mix?: number;
          perpetual_yield_pct?: number;
          perpetual_trigger_size?: number;
          msc_end_month?: number | null;
          withdrawal_amount?: number;
        };
        Relationships: [];
      };
      leads: {
        Row: {
          id: string;
          email: string;
          source: string;
          utm_source: string | null;
          utm_medium: string | null;
          utm_campaign: string | null;
          user_agent: string | null;
          beehiiv_synced: boolean;
          created_at: string;
        };
        Insert: {
          email: string;
          source?: string;
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          user_agent?: string | null;
          beehiiv_synced?: boolean;
        };
        Update: {
          beehiiv_synced?: boolean;
        };
        Relationships: [];
      };
      content_sources: {
        Row: {
          id: string;
          user_id: string;
          kind: "granola" | "wispr" | "plaud" | "vault" | "url" | "upload" | "comment" | "scan" | "manual";
          external_id: string;
          title: string;
          url: string | null;
          occurred_at: string | null;
          status: "allowed" | "denied" | "pending" | "mined";
          requested_at: string | null;
          mined_at: string | null;
          meta: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          kind: "granola" | "wispr" | "plaud" | "vault" | "url" | "upload" | "comment" | "scan" | "manual";
          external_id: string;
          title?: string;
          url?: string | null;
          occurred_at?: string | null;
          status?: "allowed" | "denied" | "pending" | "mined";
          requested_at?: string | null;
          mined_at?: string | null;
          meta?: Json;
        };
        Update: {
          title?: string;
          url?: string | null;
          occurred_at?: string | null;
          status?: "allowed" | "denied" | "pending" | "mined";
          requested_at?: string | null;
          mined_at?: string | null;
          meta?: Json;
        };
        Relationships: [];
      };
      content_source_rules: {
        Row: {
          id: string;
          user_id: string;
          kind: "allow" | "deny";
          field: "title" | "participant";
          pattern: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          kind: "allow" | "deny";
          field: "title" | "participant";
          pattern: string;
        };
        Update: {
          kind?: "allow" | "deny";
          field?: "title" | "participant";
          pattern?: string;
        };
        Relationships: [];
      };
      content_ideas: {
        Row: {
          id: string;
          user_id: string;
          source_id: string | null;
          format: "reel" | "youtube" | "newsletter" | "story" | "x";
          title: string;
          hook: string;
          hook_alt: string | null;
          belief_attacked: string;
          value_to_listener: string;
          why_it_stops: string;
          outline: Json;
          quote: string;
          quote_ref: string;
          pillar: string;
          hook_type: string;
          chain_id: string | null;
          score: number;
          batch_date: string;
          status: "inbox" | "queued" | "rejected" | "posted" | "archived";
          queue_rank: number | null;
          feedback_reason: string | null;
          feedback_at: string | null;
          clickup_task_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          source_id?: string | null;
          format: "reel" | "youtube" | "newsletter" | "story" | "x";
          title: string;
          hook: string;
          hook_alt?: string | null;
          belief_attacked?: string;
          value_to_listener?: string;
          why_it_stops?: string;
          outline?: Json;
          quote?: string;
          quote_ref?: string;
          pillar?: string;
          hook_type?: string;
          chain_id?: string | null;
          score?: number;
          batch_date?: string;
          status?: "inbox" | "queued" | "rejected" | "posted" | "archived";
          queue_rank?: number | null;
        };
        Update: {
          status?: "inbox" | "queued" | "rejected" | "posted" | "archived";
          queue_rank?: number | null;
          feedback_reason?: string | null;
          feedback_at?: string | null;
          clickup_task_id?: string | null;
          score?: number;
        };
        Relationships: [];
      };
      content_drafts: {
        Row: {
          id: string;
          user_id: string;
          idea_id: string;
          version: number;
          stage: "raw" | "humanized" | "edited";
          body: string;
          lint: Json;
          model: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          idea_id: string;
          version: number;
          stage: "raw" | "humanized" | "edited";
          body?: string;
          lint?: Json;
          model?: string;
        };
        Update: {
          body?: string;
          lint?: Json;
          stage?: "raw" | "humanized" | "edited";
        };
        Relationships: [];
      };
      content_taste_rules: {
        Row: {
          id: string;
          user_id: string;
          rule: string;
          evidence_count: number;
          origin: "derived" | "manual";
          active: boolean;
          last_evidence_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          rule: string;
          evidence_count?: number;
          origin?: "derived" | "manual";
          active?: boolean;
          last_evidence_at?: string | null;
        };
        Update: {
          rule?: string;
          evidence_count?: number;
          active?: boolean;
          last_evidence_at?: string | null;
        };
        Relationships: [];
      };
      content_voice: {
        Row: {
          id: string;
          user_id: string;
          profile_md: string;
          exemplars: Json;
          built_from: Json;
          built_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          profile_md?: string;
          exemplars?: Json;
          built_from?: Json;
          built_at?: string | null;
        };
        Update: {
          profile_md?: string;
          exemplars?: Json;
          built_from?: Json;
          built_at?: string | null;
        };
        Relationships: [];
      };
      content_posts: {
        Row: {
          id: string;
          user_id: string;
          idea_id: string | null;
          platform: "instagram" | "youtube" | "beehiiv" | "x";
          external_id: string;
          url: string;
          format: string;
          posted_at: string;
          hook_used: string;
          caption: string;
          pillar: string;
          hook_type: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          idea_id?: string | null;
          platform: "instagram" | "youtube" | "beehiiv" | "x";
          external_id: string;
          url?: string;
          format?: string;
          posted_at?: string;
          hook_used?: string;
          caption?: string;
          pillar?: string;
          hook_type?: string;
        };
        Update: {
          idea_id?: string | null;
          url?: string;
          format?: string;
          posted_at?: string;
          hook_used?: string;
          caption?: string;
          pillar?: string;
          hook_type?: string;
        };
        Relationships: [];
      };
      content_metrics: {
        Row: {
          id: string;
          user_id: string;
          post_id: string;
          captured_at: string;
          metrics: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          post_id: string;
          captured_at?: string;
          metrics?: Json;
        };
        Update: {
          metrics?: Json;
        };
        Relationships: [];
      };
      content_reviews: {
        Row: {
          id: string;
          user_id: string;
          week_start: string;
          narrative_md: string;
          double_down: Json;
          stop: Json;
          best_times: Json;
          plan: Json;
          replies_owed: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          week_start: string;
          narrative_md?: string;
          double_down?: Json;
          stop?: Json;
          best_times?: Json;
          plan?: Json;
          replies_owed?: Json;
        };
        Update: {
          narrative_md?: string;
          double_down?: Json;
          stop?: Json;
          best_times?: Json;
          plan?: Json;
          replies_owed?: Json;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};

export type Amplicon = Database["public"]["Tables"]["amplicons"]["Row"];
export type AmpliconInsert = Database["public"]["Tables"]["amplicons"]["Insert"];
export type AmpliconUpdate = Database["public"]["Tables"]["amplicons"]["Update"];
export type LoC = Database["public"]["Tables"]["locs"]["Row"];
export type LoCInsert = Database["public"]["Tables"]["locs"]["Insert"];
export type LoCUpdate = Database["public"]["Tables"]["locs"]["Update"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];
export type Projection = Database["public"]["Tables"]["projections"]["Row"];
export type ProjectionInsert = Database["public"]["Tables"]["projections"]["Insert"];
export type ProjectionUpdate = Database["public"]["Tables"]["projections"]["Update"];
export type Lead = Database["public"]["Tables"]["leads"]["Row"];
export type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];
export type ContentSource = Database["public"]["Tables"]["content_sources"]["Row"];
export type ContentSourceInsert = Database["public"]["Tables"]["content_sources"]["Insert"];
export type ContentSourceRule = Database["public"]["Tables"]["content_source_rules"]["Row"];
export type ContentIdea = Database["public"]["Tables"]["content_ideas"]["Row"];
export type ContentIdeaInsert = Database["public"]["Tables"]["content_ideas"]["Insert"];
export type ContentIdeaUpdate = Database["public"]["Tables"]["content_ideas"]["Update"];
export type ContentDraft = Database["public"]["Tables"]["content_drafts"]["Row"];
export type ContentTasteRule = Database["public"]["Tables"]["content_taste_rules"]["Row"];
export type ContentVoice = Database["public"]["Tables"]["content_voice"]["Row"];
export type ContentPost = Database["public"]["Tables"]["content_posts"]["Row"];
export type ContentPostInsert = Database["public"]["Tables"]["content_posts"]["Insert"];
export type ContentMetric = Database["public"]["Tables"]["content_metrics"]["Row"];
export type ContentReview = Database["public"]["Tables"]["content_reviews"]["Row"];

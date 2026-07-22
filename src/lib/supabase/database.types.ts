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

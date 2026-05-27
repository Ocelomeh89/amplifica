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
      };
    };
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

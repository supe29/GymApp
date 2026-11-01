// Typed bindings for the schema created by /supabase/migrations/0001-0009.
//
// Hand-authored to match those migrations exactly, because generating this
// file the normal way (`supabase gen types typescript --local`) requires a
// running local Supabase stack (Docker), which was not available when this
// file was written. Regenerate with that command and diff against this file
// once Docker/a linked project is available, per plan.md Phase 1.
//
// `Relationships: never[]` is required on every table by
// @supabase/supabase-js's generic constraints (it mirrors the CLI-generated
// shape, which always includes this field for typed embedded-resource
// queries); an empty array is accurate here since no code in this package
// does embedded `select('*, other_table(*)')` queries.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          user_id: string;
          age: number;
          height_cm: number;
          weight_kg: number;
          biological_sex: 'male' | 'female' | 'prefer_not_to_say';
          fitness_level: 'beginner' | 'intermediate' | 'advanced';
          goal: 'fat_loss' | 'muscle_gain' | 'strength' | 'general_fitness';
          training_days_per_week: number;
          unit_preference: 'metric' | 'imperial';
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['profiles']['Row'],
          'created_at' | 'updated_at' | 'unit_preference'
        > & {
          unit_preference?: 'metric' | 'imperial';
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: never[];
      };
      equipment_items: {
        Row: {
          id: string;
          key: string;
          display_name: string;
          category: 'free_weights' | 'machines' | 'bodyweight_other';
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['equipment_items']['Row'], 'id' | 'created_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['equipment_items']['Insert']>;
        Relationships: never[];
      };
      user_equipment: {
        Row: {
          user_id: string;
          equipment_item_id: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['user_equipment']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['user_equipment']['Insert']>;
        Relationships: never[];
      };
      muscle_groups: {
        Row: {
          id: string;
          key: string;
          display_name: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['muscle_groups']['Row'], 'id' | 'created_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['muscle_groups']['Insert']>;
        Relationships: never[];
      };
      exercises: {
        Row: {
          id: string;
          name: string;
          instructions: string | null;
          difficulty: 'beginner' | 'intermediate' | 'advanced';
          category: string | null;
          mechanic: 'compound' | 'isolation' | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['exercises']['Row'],
          'id' | 'created_at' | 'updated_at'
        > & { id?: string };
        Update: Partial<Database['public']['Tables']['exercises']['Insert']>;
        Relationships: never[];
      };
      exercise_muscles: {
        Row: {
          exercise_id: string;
          muscle_group_id: string;
          role: 'primary' | 'secondary';
        };
        Insert: Database['public']['Tables']['exercise_muscles']['Row'];
        Update: Partial<Database['public']['Tables']['exercise_muscles']['Insert']>;
        Relationships: never[];
      };
      exercise_equipment: {
        Row: {
          exercise_id: string;
          equipment_item_id: string;
        };
        Insert: Database['public']['Tables']['exercise_equipment']['Row'];
        Update: Partial<Database['public']['Tables']['exercise_equipment']['Insert']>;
        Relationships: never[];
      };
      workout_plans: {
        Row: {
          id: string;
          user_id: string;
          split_type: 'full_body' | 'upper_lower' | 'push_pull_legs';
          plan_version: number;
          effective_from: string;
          superseded_at: string | null;
          created_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['workout_plans']['Row'],
          'id' | 'plan_version' | 'effective_from' | 'superseded_at' | 'created_at'
        > & {
          id?: string;
          // Omitted on insert in the normal case — the DB auto-assigns the
          // next monotonic version (see 0009_plan_target_versioning.sql).
          plan_version?: number;
        };
        // Only ever set by the DB trigger; not directly mutable by clients
        // (see the immutability trigger in 0009).
        Update: never;
        Relationships: never[];
      };
      planned_sessions: {
        Row: {
          id: string;
          workout_plan_id: string;
          user_id: string;
          day_order: number;
          name: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['planned_sessions']['Row'], 'id' | 'created_at'> & {
          id?: string;
        };
        // Never updated once written (see 0008 RLS comments).
        Update: never;
        Relationships: never[];
      };
      planned_session_exercises: {
        Row: {
          id: string;
          planned_session_id: string;
          user_id: string;
          exercise_id: string;
          order_index: number;
          target_sets: number;
          target_reps_min: number;
          target_reps_max: number | null;
          target_weight_kg: number | null;
          intensity_note: string | null;
          created_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['planned_session_exercises']['Row'],
          'id' | 'created_at'
        > & { id?: string };
        Update: never;
        Relationships: never[];
      };
      workout_sessions: {
        Row: {
          id: string;
          user_id: string;
          planned_session_id: string | null;
          workout_plan_id: string | null;
          status: 'in_progress' | 'completed';
          started_at: string;
          completed_at: string | null;
          created_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['workout_sessions']['Row'],
          'id' | 'created_at' | 'workout_plan_id' | 'status' | 'started_at'
        > & {
          id?: string;
          // Derived server-side from planned_session_id (see 0009); do not set.
          workout_plan_id?: never;
          status?: 'in_progress' | 'completed';
          started_at?: string;
        };
        Update: Partial<
          Pick<Database['public']['Tables']['workout_sessions']['Row'], 'status' | 'completed_at'>
        >;
        Relationships: never[];
      };
      set_logs: {
        Row: {
          id: string;
          workout_session_id: string;
          user_id: string;
          exercise_id: string;
          set_index: number;
          weight_kg: number | null;
          reps: number | null;
          rpe: number | null;
          logged_at: string;
        };
        Insert: Omit<Database['public']['Tables']['set_logs']['Row'], 'id' | 'logged_at'> & {
          id?: string;
          logged_at?: string;
        };
        Update: Partial<Database['public']['Tables']['set_logs']['Insert']>;
        Relationships: never[];
      };
      progression_suggestions: {
        Row: {
          id: string;
          user_id: string;
          exercise_id: string;
          source_workout_session_id: string;
          action: 'increase_weight' | 'increase_reps' | 'hold';
          suggested_weight_kg: number | null;
          suggested_reps: number | null;
          rationale: string;
          status: 'pending' | 'accepted' | 'declined' | 'overridden';
          overridden_weight_kg: number | null;
          overridden_reps: number | null;
          created_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['progression_suggestions']['Row'],
          'id' | 'created_at' | 'status'
        > & { id?: string; status?: 'pending' | 'accepted' | 'declined' | 'overridden' };
        Update: Partial<
          Pick<
            Database['public']['Tables']['progression_suggestions']['Row'],
            'status' | 'overridden_weight_kg' | 'overridden_reps'
          >
        >;
        Relationships: never[];
      };
      nutrition_targets: {
        Row: {
          id: string;
          user_id: string;
          daily_calories: number;
          protein_g: number;
          carbs_g: number;
          fat_g: number;
          target_version: number;
          effective_from: string;
          superseded_at: string | null;
          created_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['nutrition_targets']['Row'],
          'id' | 'target_version' | 'effective_from' | 'superseded_at' | 'created_at'
        > & { id?: string; target_version?: number };
        Update: never;
        Relationships: never[];
      };
      food_items: {
        Row: {
          id: string;
          name: string;
          brand: string | null;
          barcode: string | null;
          portion_description: string;
          calories_per_portion: number;
          protein_g_per_portion: number;
          carbs_g_per_portion: number;
          fat_g_per_portion: number;
          source: 'external' | 'user_created';
          created_by_user_id: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['food_items']['Row'], 'id' | 'created_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['food_items']['Insert']>;
        Relationships: never[];
      };
      food_log_entries: {
        Row: {
          id: string;
          user_id: string;
          food_item_id: string;
          nutrition_target_id: string;
          meal_slot: 'breakfast' | 'lunch' | 'dinner' | 'snack';
          portion_quantity: number;
          log_date: string;
          logged_at: string;
          created_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['food_log_entries']['Row'],
          'id' | 'created_at' | 'logged_at'
        > & { id?: string; logged_at?: string };
        Update: Partial<Database['public']['Tables']['food_log_entries']['Insert']>;
        Relationships: never[];
      };
      weight_entries: {
        Row: {
          id: string;
          user_id: string;
          weight_kg: number;
          measured_at: string;
          created_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['weight_entries']['Row'],
          'id' | 'created_at' | 'measured_at'
        > & { id?: string; measured_at?: string };
        Update: Partial<Database['public']['Tables']['weight_entries']['Insert']>;
        Relationships: never[];
      };
      personal_records: {
        Row: {
          id: string;
          user_id: string;
          exercise_id: string;
          set_log_id: string;
          rep_count: number;
          weight_kg: number;
          estimated_one_rm: number | null;
          achieved_at: string;
          created_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['personal_records']['Row'],
          'id' | 'created_at' | 'achieved_at'
        > & { id?: string; achieved_at?: string };
        // Append-only (see 0008 RLS comments) — no update policy exists.
        Update: never;
        Relationships: never[];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

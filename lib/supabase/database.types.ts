// Generated from the live schema by Supabase. Regenerate rather than edit.
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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      analyses: {
        Row: {
          adapter: string | null
          commit_sha: string | null
          completed_at: string | null
          coverage: Json | null
          created_at: string
          error_message: string | null
          failed_stage: string | null
          id: string
          organization_id: string
          project_id: string
          stage_message: string | null
          started_at: string
          status: string
        }
        Insert: {
          adapter?: string | null
          commit_sha?: string | null
          completed_at?: string | null
          coverage?: Json | null
          created_at?: string
          error_message?: string | null
          failed_stage?: string | null
          id?: string
          organization_id: string
          project_id: string
          stage_message?: string | null
          started_at?: string
          status?: string
        }
        Update: {
          adapter?: string | null
          commit_sha?: string | null
          completed_at?: string | null
          coverage?: Json | null
          created_at?: string
          error_message?: string | null
          failed_stage?: string | null
          id?: string
          organization_id?: string
          project_id?: string
          stage_message?: string | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "analyses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analyses_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      edges: {
        Row: {
          analysis_id: string
          id: string
          kind: string
          organization_id: string
          source_file_id: string
          target_file_id: string
        }
        Insert: {
          analysis_id: string
          id?: string
          kind: string
          organization_id: string
          source_file_id: string
          target_file_id: string
        }
        Update: {
          analysis_id?: string
          id?: string
          kind?: string
          organization_id?: string
          source_file_id?: string
          target_file_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "edges_analysis_id_organization_id_fkey"
            columns: ["analysis_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "edges_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edges_source_file_id_organization_id_fkey"
            columns: ["source_file_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "edges_target_file_id_organization_id_fkey"
            columns: ["target_file_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      explanations: {
        Row: {
          analysis_id: string
          body: string
          content_hash: string
          created_at: string
          id: string
          model: string
          organization_id: string
          subject_kind: string
          subject_path: string
        }
        Insert: {
          analysis_id: string
          body: string
          content_hash: string
          created_at?: string
          id?: string
          model: string
          organization_id: string
          subject_kind: string
          subject_path: string
        }
        Update: {
          analysis_id?: string
          body?: string
          content_hash?: string
          created_at?: string
          id?: string
          model?: string
          organization_id?: string
          subject_kind?: string
          subject_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "explanations_analysis_id_organization_id_fkey"
            columns: ["analysis_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "explanations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      file_roles: {
        Row: {
          file_id: string
          id: string
          organization_id: string
          role: string
          source: string
        }
        Insert: {
          file_id: string
          id?: string
          organization_id: string
          role: string
          source: string
        }
        Update: {
          file_id?: string
          id?: string
          organization_id?: string
          role?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_roles_file_id_organization_id_fkey"
            columns: ["file_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "file_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          analysis_id: string
          content_hash: string
          folder: string
          id: string
          line_count: number
          organization_id: string
          path: string
        }
        Insert: {
          analysis_id: string
          content_hash: string
          folder: string
          id?: string
          line_count: number
          organization_id: string
          path: string
        }
        Update: {
          analysis_id?: string
          content_hash?: string
          folder?: string
          id?: string
          line_count?: number
          organization_id?: string
          path?: string
        }
        Relationships: [
          {
            foreignKeyName: "files_analysis_id_organization_id_fkey"
            columns: ["analysis_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "files_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      insights: {
        Row: {
          analysis_id: string
          id: string
          kind: string
          organization_id: string
          paths: string[]
        }
        Insert: {
          analysis_id: string
          id?: string
          kind: string
          organization_id: string
          paths: string[]
        }
        Update: {
          analysis_id?: string
          id?: string
          kind?: string
          organization_id?: string
          paths?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "insights_analysis_id_organization_id_fkey"
            columns: ["analysis_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "insights_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
        }
        Insert: {
          created_at?: string
          id: string
        }
        Update: {
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
          owner: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
          owner: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          owner?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          analysis_id: string
          file_id: string
          id: string
          line: number
          method: string
          organization_id: string
          pattern: string
        }
        Insert: {
          analysis_id: string
          file_id: string
          id?: string
          line: number
          method: string
          organization_id: string
          pattern: string
        }
        Update: {
          analysis_id?: string
          file_id?: string
          id?: string
          line?: number
          method?: string
          organization_id?: string
          pattern?: string
        }
        Relationships: [
          {
            foreignKeyName: "routes_analysis_id_organization_id_fkey"
            columns: ["analysis_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "routes_file_id_organization_id_fkey"
            columns: ["file_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "routes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

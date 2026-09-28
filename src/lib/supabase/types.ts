/**
 * Database types.
 *
 * Hand-written to mirror supabase/migrations/*.sql. If you change a migration,
 * change the matching type here in the same commit — this file is the contract
 * every query in the app is checked against.
 *
 * Convention:
 *   Row    — what a select returns
 *   Insert — what an insert accepts (columns with defaults are optional,
 *            generated columns are absent entirely)
 *   Update — all columns optional
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Makes the listed keys optional: columns the database fills in for you. */
type Defaulted<Row, K extends keyof Row> = Omit<Row, K> & Partial<Pick<Row, K>>;

// ------------------------------------------------------------ enum unions ---

export type Locale = "en" | "sv";
/** Who the week belongs to. See 0009_segments.sql and lib/segments.ts. */
export type Segment = "student" | "professional";
export type InstitutionType = "university" | "college" | "school" | "other";
export type TaskType =
  // Coursework
  | "assignment"
  | "exam"
  | "reading"
  | "project"
  | "lab"
  | "presentation"
  | "revision"
  | "other"
  // The rest of the week — see 0008_errands.sql
  | "application"
  | "appointment"
  | "admin"
  | "errand";

export type TaskStatus = "not_started" | "in_progress" | "completed" | "cancelled";
export type StudyMethod =
  "pomodoro" | "active_recall" | "spaced_repetition" | "deep_work" | "interleaving" | "group_work";
export type CalendarProvider = "google" | "ics_url";
export type SyncStatus = "pending" | "active" | "error" | "revoked";
export type EventSource = "manual" | "ics" | "google";
export type CalendarSourceKind = "study" | "work" | "personal";
/** What a day dominated by one calendar does to study time. See 0007. */
export type DayEffect = "none" | "reduce" | "block";
export type EventType = "lecture" | "seminar" | "lab" | "exam" | "deadline" | "personal" | "other";
export type BreakMethod = "pomodoro" | "fifty_ten" | "ninety_twenty" | "none";
export type PlanningFlexibility = "strict" | "balanced" | "flexible";
export type PlanStatus = "draft" | "approved" | "superseded" | "discarded";
export type SessionStatus = "planned" | "completed" | "missed" | "partial" | "cancelled";
export type RuleType = "available" | "unavailable" | "preferred";
export type NotificationType =
  | "session_starting"
  | "break_time"
  | "session_ended"
  | "deadline_approaching"
  | "weekly_plan_incomplete"
  | "session_missed"
  | "plan_ready";
export type NotificationStatus = "pending" | "sent" | "dismissed" | "failed";
export type ConsentType = "analytics" | "product_improvement" | "ai_processing";

/** See 0011_course_knowledge.sql, and docs/PLAN.md §40. */
export type CourseDocumentType = "syllabus" | "schedule" | "assessment_guide" | "reading_list" | "other";
export type DocumentProcessingStatus = "pending" | "processing" | "completed" | "failed";
export type RequirementType = "reading" | "topic" | "exam_format" | "grading" | "policy" | "other";
/** How sure the extraction is that a fact was actually stated, not inferred. Never a scheduling constraint on its own — see AGENTS.md's AI-layer notes. */
export type ExtractionConfidence = "high" | "medium" | "low";
export type AssessmentFormat = "individual" | "group" | "presentation" | "exam" | "other";
export type CourseMilestoneType =
  | "teaching_period"
  | "reading_week"
  | "assessment_period"
  | "exam_period"
  | "other";
export type CourseKnowledgeChangeType =
  | "deadline_changed"
  | "weight_changed"
  | "requirement_added"
  | "requirement_removed"
  | "milestone_changed"
  | "other";

// ------------------------------------------------------------------- rows ---

export type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  timezone: string;
  locale: Locale;
  /** Student or working professional — changes defaults and framing, not the engine. */
  segment: Segment;
  onboarding_completed: boolean;
  onboarding_step: number;
  created_at: string;
  updated_at: string;
};

export type InstitutionRow = {
  id: string;
  user_id: string;
  name: string;
  type: InstitutionType;
  created_at: string;
};

export type ProgramRow = {
  id: string;
  user_id: string;
  institution_id: string | null;
  name: string;
  start_date: string | null;
  end_date: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
};

export type CourseRow = {
  id: string;
  user_id: string;
  program_id: string | null;
  code: string | null;
  name: string;
  description: string | null;
  color: string | null;
  difficulty: number;
  priority: number;
  target_grade: string | null;
  estimated_weekly_hours: number | null;
  start_date: string | null;
  end_date: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

export type TaskRow = {
  id: string;
  user_id: string;
  course_id: string | null;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  task_type: TaskType;
  status: TaskStatus;
  priority: number;
  difficulty: number;
  deadline: string | null;
  /** A to-do with a time of its own: an obstacle, not schedulable work. */
  fixed_start_at: string | null;
  estimated_minutes: number;
  completed_minutes: number;
  /** Generated by the database; never written directly. */
  remaining_minutes: number;
  preferred_study_method: StudyMethod | null;
  created_at: string;
  updated_at: string;
};

export type TaskDependencyRow = {
  task_id: string;
  depends_on_task_id: string;
  user_id: string;
  created_at: string;
};

export type CourseDocumentRow = {
  id: string;
  user_id: string;
  course_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  /** Path inside the `course-documents` storage bucket. Always `${user_id}/...`. */
  storage_path: string;
  document_type: CourseDocumentType;
  processing_status: DocumentProcessingStatus;
  processing_error: string | null;
  uploaded_at: string;
  processed_at: string | null;
};

export type CourseRequirementRow = {
  id: string;
  user_id: string;
  course_id: string;
  document_id: string | null;
  type: RequirementType;
  title: string;
  description: string | null;
  source_page: number | null;
  source_text: string | null;
  confidence: ExtractionConfidence;
  verified_by_user: boolean;
  created_at: string;
};

/** 1:1 with a `tasks` row — the syllabus metadata `tasks` has no column for. */
export type AssessmentDetailRow = {
  id: string;
  user_id: string;
  task_id: string;
  course_id: string;
  document_id: string | null;
  weight_percent: number | null;
  word_count: number | null;
  assessment_format: AssessmentFormat | null;
  source_page: number | null;
  source_text: string | null;
  confidence: ExtractionConfidence;
  verified_by_user: boolean;
  created_at: string;
  updated_at: string;
};

export type CourseMilestoneRow = {
  id: string;
  user_id: string;
  course_id: string;
  document_id: string | null;
  title: string;
  milestone_date: string;
  type: CourseMilestoneType;
  description: string | null;
  source_page: number | null;
  source_text: string | null;
  confidence: ExtractionConfidence;
  verified_by_user: boolean;
  created_at: string;
};

export type CourseKnowledgeUpdateRow = {
  id: string;
  user_id: string;
  course_id: string;
  document_id: string | null;
  change_type: CourseKnowledgeChangeType;
  field_label: string;
  old_value: string | null;
  new_value: string | null;
  impact: string | null;
  resolved: boolean;
  created_at: string;
};

export type CalendarConnectionRow = {
  id: string;
  user_id: string;
  provider: CalendarProvider;
  external_account_id: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  expires_at: string | null;
  sync_status: SyncStatus;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type CalendarSourceRow = {
  id: string;
  user_id: string;
  name: string;
  kind: CalendarSourceKind;
  color: string | null;
  import_url: string | null;
  last_imported_at: string | null;
  day_effect: DayEffect;
  /** Minutes of this calendar's events on one local day before the effect applies. */
  day_effect_threshold_minutes: number;
  reduced_daily_minutes: number;
  created_at: string;
  updated_at: string;
};

export type CalendarEventRow = {
  id: string;
  user_id: string;
  course_id: string | null;
  /** Which imported calendar this came from. Null for manual events. */
  source_id: string | null;
  external_event_id: string | null;
  source: EventSource;
  event_type: EventType;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  timezone: string;
  location: string | null;
  is_fixed: boolean;
  is_all_day: boolean;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type StudyPreferencesRow = {
  id: string;
  user_id: string;
  weekly_target_minutes: number;
  minimum_session_minutes: number;
  maximum_session_minutes: number;
  preferred_session_minutes: number;
  maximum_daily_minutes: number;
  /** Wall-clock "HH:MM:SS", not an instant. */
  earliest_start_time: string;
  latest_end_time: string;
  /** ISO weekdays, 1 = Monday .. 7 = Sunday. */
  preferred_days: number[];
  avoid_days: number[];
  weekend_allowed: boolean;
  break_method: BreakMethod;
  buffer_percentage: number;
  planning_flexibility: PlanningFlexibility;
  energy_profile: Json;
  created_at: string;
  updated_at: string;
};

export type AvailabilityRuleRow = {
  id: string;
  user_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  rule_type: RuleType;
  priority: number;
  label: string | null;
  created_at: string;
};

export type StudyPlanRow = {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  status: PlanStatus;
  generation_version: string;
  total_planned_minutes: number;
  explanation: string | null;
  warnings: Json;
  created_at: string;
  approved_at: string | null;
};

export type StudySessionRow = {
  id: string;
  user_id: string;
  study_plan_id: string | null;
  task_id: string | null;
  course_id: string | null;
  title: string;
  start_at: string;
  end_at: string;
  planned_minutes: number;
  completed_minutes: number;
  status: SessionStatus;
  is_locked: boolean;
  generation_reason: string | null;
  manually_modified: boolean;
  created_at: string;
  updated_at: string;
};

export type PlannerRunRow = {
  id: string;
  user_id: string;
  study_plan_id: string | null;
  input_snapshot: Json;
  result_snapshot: Json;
  warnings: Json;
  algorithm_version: string;
  seed: string | null;
  duration_ms: number | null;
  created_at: string;
};

export type NotificationRow = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  scheduled_for: string;
  sent_at: string | null;
  read_at: string | null;
  status: NotificationStatus;
  related_entity_type: string | null;
  related_entity_id: string | null;
  created_at: string;
};

export type NotificationSettingsRow = {
  id: string;
  user_id: string;
  session_starting: boolean;
  session_starting_lead: number;
  break_time: boolean;
  session_ended: boolean;
  deadline_approaching: boolean;
  deadline_lead_days: number;
  weekly_plan_incomplete: boolean;
  session_missed: boolean;
  channel_in_app: boolean;
  channel_email: boolean;
  channel_push: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  updated_at: string;
};

export type UserConsentRow = {
  id: string;
  user_id: string;
  consent_type: ConsentType;
  granted: boolean;
  granted_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type StudyGroupRow = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  join_code: string;
  weekly_session_goal: number;
  created_at: string;
  updated_at: string;
};

export type StudyGroupMemberRow = {
  id: string;
  group_id: string;
  user_id: string;
  role: "owner" | "member";
  share_level: "adherence" | "hours" | "courses";
  display_name: string | null;
  status: "active" | "paused";
  joined_at: string;
};

export type StudyGroupScoreRow = {
  id: string;
  group_id: string;
  user_id: string;
  period_start: string;
  period_end: string;
  planned_minutes: number;
  completed_minutes: number;
  adherence_percent: number;
  sessions_completed: number;
  current_streak_days: number;
  computed_at: string;
};

export type AuditLogRow = {
  id: string;
  user_id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Json;
  created_at: string;
};

// --------------------------------------------------------------- Database ---

type Table<Row, DefaultedKeys extends keyof Row, Generated extends keyof Row = never> = {
  Row: Row;
  Insert: Defaulted<Omit<Row, Generated>, Extract<DefaultedKeys, keyof Omit<Row, Generated>>>;
  Update: Partial<Omit<Row, Generated>>;
  Relationships: [];
};

type Timestamps = "created_at" | "updated_at";

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        ProfileRow,
        | Timestamps
        | "timezone"
        | "locale"
        | "segment"
        | "onboarding_completed"
        | "onboarding_step"
        | "full_name"
      >;
      institutions: Table<InstitutionRow, "id" | "created_at" | "type">;
      programs: Table<
        ProgramRow,
        "id" | Timestamps | "institution_id" | "start_date" | "end_date" | "color"
      >;
      courses: Table<
        CourseRow,
        | "id"
        | Timestamps
        | "program_id"
        | "code"
        | "description"
        | "color"
        | "difficulty"
        | "priority"
        | "target_grade"
        | "estimated_weekly_hours"
        | "start_date"
        | "end_date"
        | "archived"
      >;
      tasks: Table<
        TaskRow,
        | "id"
        | Timestamps
        | "course_id"
        | "parent_task_id"
        | "description"
        | "task_type"
        | "status"
        | "priority"
        | "difficulty"
        | "deadline"
        | "fixed_start_at"
        | "estimated_minutes"
        | "completed_minutes"
        | "preferred_study_method",
        "remaining_minutes"
      >;
      task_dependencies: Table<TaskDependencyRow, "created_at">;
      course_documents: Table<
        CourseDocumentRow,
        "id" | "document_type" | "processing_status" | "processing_error" | "uploaded_at" | "processed_at"
      >;
      course_requirements: Table<
        CourseRequirementRow,
        | "id"
        | "created_at"
        | "document_id"
        | "description"
        | "source_page"
        | "source_text"
        | "confidence"
        | "verified_by_user"
      >;
      assessment_details: Table<
        AssessmentDetailRow,
        | "id"
        | Timestamps
        | "document_id"
        | "weight_percent"
        | "word_count"
        | "assessment_format"
        | "source_page"
        | "source_text"
        | "confidence"
        | "verified_by_user"
      >;
      course_milestones: Table<
        CourseMilestoneRow,
        | "id"
        | "created_at"
        | "document_id"
        | "type"
        | "description"
        | "source_page"
        | "source_text"
        | "confidence"
        | "verified_by_user"
      >;
      course_knowledge_updates: Table<
        CourseKnowledgeUpdateRow,
        "id" | "created_at" | "document_id" | "old_value" | "new_value" | "impact" | "resolved"
      >;
      calendar_connections: Table<
        CalendarConnectionRow,
        | "id"
        | Timestamps
        | "external_account_id"
        | "access_token_encrypted"
        | "refresh_token_encrypted"
        | "expires_at"
        | "sync_status"
        | "last_synced_at"
        | "last_error"
      >;
      calendar_sources: Table<
        CalendarSourceRow,
        | "id"
        | Timestamps
        | "kind"
        | "color"
        | "import_url"
        | "last_imported_at"
        | "day_effect"
        | "day_effect_threshold_minutes"
        | "reduced_daily_minutes"
      >;
      calendar_events: Table<
        CalendarEventRow,
        | "id"
        | Timestamps
        | "course_id"
        | "source_id"
        | "external_event_id"
        | "source"
        | "event_type"
        | "description"
        | "timezone"
        | "location"
        | "is_fixed"
        | "is_all_day"
        | "metadata"
      >;
      study_preferences: Table<
        StudyPreferencesRow,
        | "id"
        | Timestamps
        | "weekly_target_minutes"
        | "minimum_session_minutes"
        | "maximum_session_minutes"
        | "preferred_session_minutes"
        | "maximum_daily_minutes"
        | "earliest_start_time"
        | "latest_end_time"
        | "preferred_days"
        | "avoid_days"
        | "weekend_allowed"
        | "break_method"
        | "buffer_percentage"
        | "planning_flexibility"
        | "energy_profile"
      >;
      availability_rules: Table<
        AvailabilityRuleRow,
        "id" | "created_at" | "rule_type" | "priority" | "label"
      >;
      study_plans: Table<
        StudyPlanRow,
        | "id"
        | "created_at"
        | "status"
        | "generation_version"
        | "total_planned_minutes"
        | "explanation"
        | "warnings"
        | "approved_at"
      >;
      study_sessions: Table<
        StudySessionRow,
        | "id"
        | Timestamps
        | "study_plan_id"
        | "task_id"
        | "course_id"
        | "completed_minutes"
        | "status"
        | "is_locked"
        | "generation_reason"
        | "manually_modified"
      >;
      planner_runs: Table<
        PlannerRunRow,
        "id" | "created_at" | "study_plan_id" | "warnings" | "seed" | "duration_ms"
      >;
      notifications: Table<
        NotificationRow,
        | "id"
        | "created_at"
        | "body"
        | "scheduled_for"
        | "sent_at"
        | "read_at"
        | "status"
        | "related_entity_type"
        | "related_entity_id"
      >;
      notification_settings: Table<
        NotificationSettingsRow,
        | "id"
        | "updated_at"
        | "session_starting"
        | "session_starting_lead"
        | "break_time"
        | "session_ended"
        | "deadline_approaching"
        | "deadline_lead_days"
        | "weekly_plan_incomplete"
        | "session_missed"
        | "channel_in_app"
        | "channel_email"
        | "channel_push"
        | "quiet_hours_start"
        | "quiet_hours_end"
      >;
      user_consents: Table<UserConsentRow, "id" | "created_at" | "granted_at" | "revoked_at">;
      audit_log: Table<AuditLogRow, "id" | "created_at" | "entity_type" | "entity_id" | "metadata">;
      study_groups: Table<StudyGroupRow, "id" | Timestamps | "description" | "weekly_session_goal">;
      study_group_members: Table<
        StudyGroupMemberRow,
        "id" | "joined_at" | "role" | "share_level" | "display_name" | "status"
      >;
      study_group_scores: Table<
        StudyGroupScoreRow,
        | "id"
        | "computed_at"
        | "planned_minutes"
        | "completed_minutes"
        | "adherence_percent"
        | "sessions_completed"
        | "current_streak_days"
      >;
    };
    Views: Record<never, never>;
    Functions: {
      /** Resolves an invite code to a group id, or null. See 0006_study_groups.sql. */
      resolve_join_code: {
        Args: { code: string };
        Returns: string | null;
      };
      /** Recomputes the caller's own weekly adherence score in every group. */
      refresh_my_group_scores: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      /** Deletes the caller's own auth.users row; every table cascades from it. See 0010_account_deletion.sql. */
      delete_my_account: {
        Args: Record<string, never>;
        Returns: undefined;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

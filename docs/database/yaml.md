# HireD Database Submission Manifest

This is a human-readable YAML summary of the database submission. It gives reviewers a fast overview before they open the ERD.

```yaml
project:
  name: HireD
  phase: "Phase 1 MVP"
  domain: "B2B transport operations"
  primary_database: PostgreSQL
  database_style: relational_sql
  id_strategy: UUID
  naming_convention: snake_case
  design_status: proposed_not_implemented
  prd_version: "0.2"
  prd_reviewed_on: "2026-10-04"
  prd_source: "https://github.com/shahid123s/buildathon-resources/blob/main/hire_d_prd_doc.md"

application_surfaces:
  - admin_portal
  - b2b_partner_portal
  - driver_mobile_app

core_workflow:
  - partner_or_admin_creates_order
  - admin_accepts_or_rejects_order
  - accepted_order_creates_trip
  - admin_assigns_driver
  - driver_starts_trip_and_logs_expenses
  - driver_closes_trip_with_partner_otp
  - system_generates_trip_report_and_wallet_credit
  - admin_generates_monthly_statement
  - creator_and_second_admin_approve_statement
  - verified_statement_is_published_to_partner

core_tables:
  identity: [users, auth_sessions]
  companies: [companies, company_users, company_payout_rates]
  drivers:
    - drivers
    - driver_documents
    - driver_availability_dates
    - driver_performance_summaries
    - driver_score_events
  operations:
    - orders
    - trips
    - trip_assignments
    - trip_selfies
    - trip_expenses
    - trip_reports
  finance:
    - trip_payroll_records
    - wallet_accounts
    - wallet_transactions
    - statements
    - statement_items
    - statement_approvals
  platform_support: [file_assets, notifications, audit_logs]

security:
  passwords: hashed
  refresh_tokens: hashed
  otp_validation: hashed
  partner_otp_display: application_encrypted
  uploaded_files: private_object_storage
  database_file_storage: metadata_and_storage_key_only
  audit_logging: enabled

financial_safety:
  money_type: numeric
  applied_rate_snapshot: trip_payroll_records
  wallet_credit_idempotency: "close-trip:<trip_id>"
  duplicate_credit_prevention: unique_idempotency_key_and_partial_unique_index
  transaction_boundary: trip_close
  report_snapshot_contract: docs/database/trip-report-snapshot.schema.json

reviewed_contracts:
  eta: order_and_trip_maps_duration_with_admin_override
  onboarding: operational_status_and_first_activation_actor_time
  expense_category: optional_label_default_other
  expense_description: required_nonempty
  notification_events: [order_accepted, order_rejected, statement_published]
  notifications: transactional_outbox_with_recipient_resource_scope_and_retries
  reports: seven_admin_reports_with_one_many_or_all_company_filters
  statement_publication: versioned_creator_and_second_admin_approval_then_publisher_timestamp
  proposed_partner_statement_gate: published_only
  optional_extensions: [driver_scores, streaks, push, in_app]

required_integrity_rules:
  - company_payout_percentages_must_total_100
  - one_trip_per_accepted_order
  - one_active_assignment_per_trip
  - one_current_document_per_driver_and_document_type
  - one_trip_credit_per_trip
  - statement_requires_creator_and_second_admin_approval_before_publish
  - statement_approval_version_matches_frozen_content
  - report_and_statement_company_matches_source_payroll
  - notification_intent_is_atomic_with_business_transition
  - report_snapshot_is_immutable_and_excludes_secrets

submission_artifacts:
  erd_source: docs/database/hired.dbml
  erd_pdf: docs/database/HireD_Phase_1_Database_ERD.pdf
  database_design: docs/database/database-design.md
  database_research: docs/database/database-research.md
  indexing_strategy: docs/database/indexing-strategy.md
  industry_insights: docs/database/industry-insights-research.md
  prd_validation: docs/database/prd-validation.md
  report_snapshot_schema: docs/database/trip-report-snapshot.schema.json
  submission_checklist: docs/database/database-research.md
```

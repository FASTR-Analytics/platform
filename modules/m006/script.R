COUNTRY_ISO3 <- "ZMB"

DENOMINATOR_CHAIN <- "auto"  # Options: "auto", "anc1", "delivery", "bcg", "penta1"
                             # Must match M005's DENOMINATOR_CHAIN setting.
                             # "auto" uses M005's chain selection (recommended).

#-------------------------------------------------------------------------------------------------------------
# CB - R code FASTR PROJECT
# Last edit: 2026 Mar 27
# Module: COVERAGE ESTIMATES (PART2 - DENOMINATOR SELECTION & SURVEY PROJECTION)
#-------------------------------------------------------------------------------------------------------------

# ------------------------------ Load Required Libraries -----------------------------------------------------
library(dplyr)
library(tidyr)
library(zoo)
library(stringr)
library(purrr)

# ------------------------------ Define Analysis Parameters --------------------------------------------------
# These parameters control the administrative levels (national, admin2, admin3)
# for which the analysis will be performed.
RUN_NATIONAL <- TRUE  # Always run national
RUN_ADMIN2 <- TRUE   # Will be set based on data availability
RUN_ADMIN3 <- TRUE   # Will be set based on data availability

#------------------------------- Load the Data ---------------------------------------------------------------
# Load combined results from Part 1 (contains coverage estimates for all denominators)
combined_results_national <- transform(read.csv("M5_combined_results_national.csv", fileEncoding = "UTF-8"), admin_area_2 = "NATIONAL")
combined_results_admin2 <- read.csv("M5_combined_results_admin2.csv", fileEncoding = "UTF-8")
combined_results_admin3 <- read.csv("M5_combined_results_admin3.csv", fileEncoding = "UTF-8")

# Check which admin levels have data and update global parameters
RUN_ADMIN2 <- nrow(combined_results_admin2) > 0
RUN_ADMIN3 <- nrow(combined_results_admin3) > 0

# Message about data availability
if (!RUN_ADMIN2) message("No data in admin2 combined results - admin2 analysis will be skipped")
if (!RUN_ADMIN3) message("No data in admin3 combined results - admin3 analysis will be skipped")

# Load raw survey data (needed for projection baseline)
# Extract survey data from combined results
extract_survey_from_combined <- function(combined_df) {
  result <- combined_df %>%
    filter(denominator_best_or_survey == "survey") %>%
    mutate(survey_value = value)

  # Select columns dynamically based on what exists
  cols <- c("admin_area_1")
  if ("admin_area_2" %in% names(result)) cols <- c(cols, "admin_area_2")
  if ("admin_area_3" %in% names(result)) cols <- c(cols, "admin_area_3")
  cols <- c(cols, "year", "indicator_common_id", "survey_value")
  # Include source columns if present (written by m005)
  if ("source" %in% names(result)) cols <- c(cols, "source")
  if ("source_detail" %in% names(result)) cols <- c(cols, "source_detail")

  result %>% select(all_of(cols))
}

survey_raw_national <- extract_survey_from_combined(combined_results_national)
if (RUN_ADMIN2) survey_raw_admin2 <- extract_survey_from_combined(combined_results_admin2)
if (RUN_ADMIN3) survey_raw_admin3 <- extract_survey_from_combined(combined_results_admin3)


# ------------------------------ Define Functions ------------------------------------------------------------

# Part 1 — calculate delta per indicator × denominator × geo
coverage_deltas <- function(coverage_df,
                            lag_n = 1,
                            complete_years = TRUE) {
  stopifnot(is.data.frame(coverage_df))
  if (!"coverage" %in% names(coverage_df)) stop("`coverage_df` must contain `coverage`.")
  if (!"denominator" %in% names(coverage_df)) stop("`coverage_df` must contain `denominator`.")
  if (!"admin_area_2" %in% names(coverage_df)) {
    coverage_df <- mutate(coverage_df, admin_area_2 = "NATIONAL")
  }
  
  # Determine group keys based on available columns
  group_keys <- c("admin_area_1", "admin_area_2", "indicator_common_id", "denominator")
  if ("admin_area_3" %in% names(coverage_df)) {
    group_keys <- c(group_keys, "admin_area_3")
  }
  
  coverage_df %>%
    mutate(year = as.integer(year)) %>%
    group_by(across(all_of(group_keys))) %>%
    { if (complete_years) complete(., year = full_seq(year, 1)) else . } %>%
    arrange(year, .by_group = TRUE) %>%
    mutate(delta = coverage - lag(coverage, n = lag_n)) %>%
    ungroup()
}

# Part 2 — project survey values using coverage deltas
project_survey_from_deltas <- function(deltas_df, survey_raw_long) {
  stopifnot(is.data.frame(deltas_df), is.data.frame(survey_raw_long))
  
  # Add admin_area_2 if missing from survey_raw_long
  if (!"admin_area_2" %in% names(survey_raw_long)) {
    survey_raw_long <- survey_raw_long %>% mutate(admin_area_2 = "NATIONAL")
  }
  
  # Determine required columns based on available admin levels
  need_d <- c("admin_area_1","admin_area_2","year","indicator_common_id","denominator","coverage")
  need_s <- c("admin_area_1","admin_area_2","year","indicator_common_id","survey_value")
  
  if ("admin_area_3" %in% names(deltas_df)) {
    need_d <- c(need_d, "admin_area_3")
  }
  if ("admin_area_3" %in% names(survey_raw_long)) {
    need_s <- c(need_s, "admin_area_3")
  }
  
  # Check required columns exist
  missing_d <- setdiff(need_d, names(deltas_df))
  missing_s <- setdiff(need_s, names(survey_raw_long))
  
  if (length(missing_d) > 0) {
    stop(paste("Missing columns in deltas_df:", paste(missing_d, collapse = ", ")))
  }
  if (length(missing_s) > 0) {
    stop(paste("Missing columns in survey_raw_long:", paste(missing_s, collapse = ", ")))
  }
  
  # Determine grouping keys
  group_keys <- c("admin_area_1", "admin_area_2", "indicator_common_id")
  if ("admin_area_3" %in% names(survey_raw_long)) {
    group_keys <- c(group_keys, "admin_area_3")
  }
  
  # last observed survey per (geo, indicator)
  baseline <- survey_raw_long %>%
    group_by(across(all_of(group_keys))) %>%
    filter(year == max(year, na.rm = TRUE)) %>%
    slice_tail(n = 1) %>%   # tie-break safety
    ungroup() %>%
    transmute(
      across(all_of(group_keys)),
      baseline_year = as.integer(year),
      baseline_value = as.numeric(survey_value)
    )
  
  # Determine delta grouping keys
  delta_group_keys <- c(group_keys, "denominator")
  
  # compute year-on-year deltas (ensure strictly by denominator)
  deltas <- deltas_df %>%
    group_by(across(all_of(delta_group_keys))) %>%
    arrange(year, .by_group = TRUE) %>%
    mutate(delta = coverage - lag(coverage)) %>%
    ungroup() %>%
    filter(!is.na(delta)) # only years with a defined lag
  
  # attach baseline to every denom path for that (geo, indicator)
  seeds <- deltas %>%
    distinct(across(all_of(delta_group_keys))) %>%
    left_join(baseline, by = group_keys) %>%
    filter(!is.na(baseline_year), !is.na(baseline_value))
  
  # build projections
  proj <- deltas %>%
    inner_join(seeds, by = delta_group_keys) %>%
    group_by(across(all_of(delta_group_keys))) %>%
    # ensure we start at baseline_year (copy forward baseline to first delta year)
    arrange(year, .by_group = TRUE) %>%
    mutate(
      # cumulative sum of deltas AFTER the baseline year
      cum_delta = cumsum(if_else(year > baseline_year, delta, 0)),
      projected = baseline_value + cum_delta
    ) %>%
    ungroup() %>%
    select(
      all_of(group_keys), year, indicator_common_id, denominator,
      baseline_year, projected
    )

  # also include an explicit baseline row for traceability (optional)
  baseline_rows <- seeds %>%
    transmute(
      across(all_of(group_keys)),
      year = baseline_year,
      indicator_common_id, denominator,
      baseline_year, projected = baseline_value
    )

  # NEW: Carry forward baseline value to fill gap between last survey and first HMIS year
  # For each geo×indicator×denominator, find the gap years and fill with baseline_value
  carry_forward_rows <- seeds %>%
    # Join with the first projection year to find the gap
    left_join(
      proj %>%
        filter(year > baseline_year) %>%
        group_by(across(all_of(delta_group_keys))) %>%
        summarise(first_proj_year = min(year, na.rm = TRUE), .groups = "drop"),
      by = delta_group_keys
    ) %>%
    # Only create carry-forward rows if there's a gap (first_proj_year > baseline_year + 1)
    filter(!is.na(first_proj_year), first_proj_year > baseline_year + 1) %>%
    # Create rows for all gap years using map2 to handle vectorized seq()
    mutate(gap_years = map2(baseline_year, first_proj_year, ~seq(.x + 1, .y - 1))) %>%
    unnest(gap_years) %>%
    transmute(
      across(all_of(group_keys)),
      year = as.integer(gap_years),
      indicator_common_id, denominator,
      baseline_year, projected = baseline_value
    )

  bind_rows(proj, baseline_rows, carry_forward_rows) %>%
    distinct() %>%
    arrange(across(all_of(c(group_keys, "indicator_common_id", "denominator", "year"))))
}

# Part 3 - prepare result tables
build_final_results <- function(coverage_df, proj_df, survey_raw_df = NULL) {
  
  # Ensure admin_area_2 exists
  if (!"admin_area_2" %in% names(coverage_df)) coverage_df <- mutate(coverage_df, admin_area_2 = "NATIONAL")
  if (!"admin_area_2" %in% names(proj_df))     proj_df     <- mutate(proj_df,     admin_area_2 = "NATIONAL")
  if (!is.null(survey_raw_df) && !"admin_area_2" %in% names(survey_raw_df)) {
    survey_raw_df <- mutate(survey_raw_df, admin_area_2 = "NATIONAL")
  }
  
  # Required columns
  need_cov  <- c("admin_area_1","admin_area_2","year","indicator_common_id","denominator","coverage")
  need_proj <- c("admin_area_1","admin_area_2","year","indicator_common_id","denominator","projected")
  if ("admin_area_3" %in% names(coverage_df)) need_cov  <- c(need_cov, "admin_area_3")
  if ("admin_area_3" %in% names(proj_df))     need_proj <- c(need_proj, "admin_area_3")
  stopifnot(all(need_cov  %in% names(coverage_df)))
  stopifnot(all(need_proj %in% names(proj_df)))

  # Keys
  base_keys <- c("admin_area_1", "admin_area_2")
  if ("admin_area_3" %in% names(coverage_df)) base_keys <- c(base_keys, "admin_area_3")
  join_keys <- c(base_keys, "year", "indicator_common_id", "denominator")

  # 1) HMIS coverage
  cov_base <- coverage_df %>%
    select(
      all_of(base_keys), year,
      indicator_common_id, denominator,
      coverage_cov = coverage
    )
  
  # 2) Projections - use full_join to include carry-forward years (e.g., 2016-2018)
  cov_proj <- cov_base %>%
    full_join(
      proj_df %>%
        select(
          all_of(base_keys), year,
          indicator_common_id, denominator,
          coverage_avgsurveyprojection = projected
        ),
      by = join_keys
    )
  
  # If no survey: return HMIS + projections only
  if (is.null(survey_raw_df)) {
    return(
      cov_proj %>%
        mutate(
          coverage_original_estimate = NA_real_,
          survey_raw_source = NA_character_,
          survey_raw_source_detail = NA_character_
        ) %>%
        distinct() %>%
        arrange(across(all_of(c(base_keys, "indicator_common_id", "denominator", "year"))))
    )
  }

  # 3) Collapse survey RAW (preserve source and source_detail)
  survey_group_keys <- base_keys
  if ("admin_area_3" %in% names(survey_raw_df)) survey_group_keys <- c(survey_group_keys, "admin_area_3")
  survey_group_keys <- c(survey_group_keys, "year", "indicator_common_id")

  survey_slim <- survey_raw_df %>%
    group_by(across(all_of(survey_group_keys))) %>%
    summarise(
      coverage_original_estimate = mean(survey_value, na.rm = TRUE),
      survey_raw_source = if("source" %in% names(cur_data())) first(source[!is.na(source)]) else NA_character_,
      survey_raw_source_detail = if("source_detail" %in% names(cur_data())) first(source_detail[!is.na(source_detail)]) else NA_character_,
      .groups = "drop"
    )
  
  # 4) Denominator universe
  denom_index_keys <- c(base_keys, "indicator_common_id")
  denom_index <- coverage_df %>%
    distinct(across(all_of(c(denom_index_keys, "denominator"))))

  # 5) Expand survey across ALL denominators
  survey_expanded <- denom_index %>%
    inner_join(survey_slim, by = denom_index_keys)

  # 6) Union HMIS+proj with survey-expanded
  final_join_keys <- c(base_keys, "year", "indicator_common_id", "denominator")
  
  final <- cov_proj %>%
    full_join(survey_expanded, by = final_join_keys) %>%
    distinct() %>%
    arrange(across(all_of(c(base_keys, "indicator_common_id", "denominator", "year")))) %>%

    # For each (geo, indicator, denominator):
    # 1) Find pivot year (first year with coverage_cov)
    # 2) Forward-fill survey up to and including pivot year
    # 3) Calculate projections starting FROM pivot year using additive formula:
    #    proj[t] = last_survey + (coverage_cov[t] - coverage_cov[pivot_year])
    group_by(across(all_of(c(base_keys, "indicator_common_id", "denominator")))) %>%
    mutate(
      # Find pivot year (first year with coverage_cov)
      .pivot_year = suppressWarnings(min(year[!is.na(coverage_cov)], na.rm = TRUE)),
      .pivot_year = ifelse(is.infinite(.pivot_year), NA_real_, .pivot_year),

      # Find last survey year (max year with non-NA coverage_original_estimate)
      .last_survey_year = suppressWarnings(max(year[!is.na(coverage_original_estimate)], na.rm = TRUE)),
      .last_survey_year = ifelse(is.infinite(.last_survey_year), NA_real_, .last_survey_year),

      # Get last survey value
      .last_survey_value = if_else(
        !is.na(.last_survey_year),
        coverage_original_estimate[year == .last_survey_year][1],
        NA_real_
      ),

      # Get coverage_cov at last survey year (for delta calculation)
      .baseline_cov = if_else(
        !is.na(.last_survey_year),
        coverage_cov[year == .last_survey_year][1],
        NA_real_
      ),

      # Keep coverage_original_estimate as-is - preserve all actual survey values

      # Calculate projections starting FROM last survey year
      # At last survey year: copy survey value (anchor point)
      # After: proj[t] = last_survey_value + (coverage_cov[t] - coverage_cov[last_survey_year])
      coverage_avgsurveyprojection = case_when(
        # Preserve values from proj_df ONLY if at or after last survey year
        !is.na(coverage_avgsurveyprojection) & year >= .last_survey_year ~ coverage_avgsurveyprojection,
        # No projection if no baseline
        is.na(.last_survey_value) | is.na(.last_survey_year) | is.na(.baseline_cov) ~ NA_real_,
        # At last survey year: copy survey value (anchor point)
        year == .last_survey_year ~ .last_survey_value,
        # After last survey year: additive projection
        year > .last_survey_year & !is.na(coverage_cov) ~
          .last_survey_value + (coverage_cov - .baseline_cov),
        # Otherwise NA (including years before last survey)
        TRUE ~ NA_real_
      )
    ) %>%
    ungroup() %>%
    select(-.pivot_year, -.last_survey_year, -.last_survey_value, -.baseline_cov)
  
  final
}

# ------------------------------ Helper Functions for New Approach ---------------------------

# Function to filter combined results based on chain-based denominator selection
filter_by_denominator_selection <- function(combined_results_df, chain_param = "auto") {

  # Chain prefixes
  chain_prefixes <- c(
    anc1     = "danc1_",
    delivery = "ddelivery_",
    bcg      = "dbcg_",
    penta1   = "dpenta1_"
  )

  if (chain_param == "auto") {
    # Use M005's chain selection — filter for "best" rows
    selected_data <- combined_results_df %>%
      filter(denominator_best_or_survey == "best")
  } else {
    # Manual chain override — filter by prefix
    if (!chain_param %in% names(chain_prefixes)) {
      stop("Invalid DENOMINATOR_CHAIN: '", chain_param,
           "'. Options: auto, ", paste(names(chain_prefixes), collapse = ", "))
    }
    prefix <- chain_prefixes[[chain_param]]
    selected_data <- combined_results_df %>%
      filter(startsWith(denominator_best_or_survey, prefix))
  }

  if (nrow(selected_data) == 0) {
    warning("No rows found for chain '", chain_param, "'. Check M005 output.")
    return(data.frame())
  }

  # Convert to coverage format expected by downstream functions
  selected_data %>%
    mutate(
      denominator = denominator_best_or_survey,
      coverage = value
    ) %>%
    filter(denominator_best_or_survey != "survey") %>%
    select(-denominator_best_or_survey, -value)
}

# ------------------------------ Main Execution ------------------------------

# ===== NATIONAL (always) =====
message("Step 1 (NATIONAL): Filtering combined results by user denominator selection...")
coverage_national <- filter_by_denominator_selection(
  combined_results_national,
  DENOMINATOR_CHAIN
)
message("✓ Coverage filtering complete: ", nrow(coverage_national), " records selected")

message("Step 2 (NATIONAL): Computing deltas...")
coverage_delta_national <- coverage_deltas(coverage_national)
message("✓ Deltas complete")

message("Step 3 (NATIONAL): Projecting survey from deltas...")
proj_survey_national <- project_survey_from_deltas(
  deltas_df       = coverage_delta_national,
  survey_raw_long = survey_raw_national
)
message("✓ Projection complete")

message("Step 4 (NATIONAL): Preparing final results...")
final_national <- build_final_results(
  coverage_df   = coverage_national,
  proj_df       = proj_survey_national,
  survey_raw_df = survey_raw_national
)
message("✓ Final results (NATIONAL) ready")

# ===== ADMIN2 (conditional) =====
if (RUN_ADMIN2) {
  message("Step 1 (ADMIN2): Filtering combined results by user denominator selection...")
  coverage_admin2 <- filter_by_denominator_selection(
    combined_results_admin2,
    DENOMINATOR_CHAIN
  )
  message("✓ Coverage filtering complete: ", nrow(coverage_admin2), " records selected")

  message("Step 2 (ADMIN2): Computing deltas...")
  coverage_delta_admin2 <- coverage_deltas(coverage_admin2)
  message("✓ Deltas complete")

  message("Step 3 (ADMIN2): Projecting survey from deltas...")
  proj_survey_admin2 <- project_survey_from_deltas(
    deltas_df       = coverage_delta_admin2,
    survey_raw_long = survey_raw_admin2
  )
  message("✓ Projection complete")

  message("Step 4 (ADMIN2): Preparing final results...")
  final_admin2 <- build_final_results(
    coverage_df   = coverage_admin2,
    proj_df       = proj_survey_admin2,
    survey_raw_df = survey_raw_admin2
  )
  message("✓ Final results (ADMIN2) ready")
} else {
  message("Admin2 disabled or no data; skipping ADMIN2 block.")
}

# ===== ADMIN3 (conditional) =====
if (RUN_ADMIN3) {
  message("Step 1 (ADMIN3): Filtering combined results by user denominator selection...")
  coverage_admin3 <- filter_by_denominator_selection(
    combined_results_admin3,
    DENOMINATOR_CHAIN
  )
  message("✓ Coverage filtering complete: ", nrow(coverage_admin3), " records selected")

  message("Step 2 (ADMIN3): Computing deltas...")
  coverage_delta_admin3 <- coverage_deltas(coverage_admin3)
  message("✓ Deltas complete")

  message("Step 3 (ADMIN3): Projecting survey from deltas...")
  proj_survey_admin3 <- project_survey_from_deltas(
    deltas_df       = coverage_delta_admin3,
    survey_raw_long = survey_raw_admin3
  )
  message("✓ Projection complete")

  message("Step 4 (ADMIN3): Preparing final results...")
  final_admin3 <- build_final_results(
    coverage_df   = coverage_admin3,
    proj_df       = proj_survey_admin3,
    survey_raw_df = survey_raw_admin3
  )
  message("✓ Final results (ADMIN3) ready")
} else {
  message("Admin3 disabled or no data; skipping ADMIN3 block.")
}

# ==============================================================================
# ============================ SAVE CSV OUTPUTS ================================
# ==============================================================================
message("Saving CSVs...")

# ---- Required fields ----
nat_required_cols <- c(
  "admin_area_1",
  "year",
  "indicator_common_id",
  "denominator",
  "coverage_original_estimate",
  "coverage_avgsurveyprojection",
  "coverage_cov"
)

admin2_required_cols <- c(
  "admin_area_1",
  "admin_area_2",
  "year",
  "indicator_common_id",
  "denominator",
  "coverage_original_estimate",
  "coverage_avgsurveyprojection",
  "coverage_cov"
)

admin3_required_cols <- c(
  "admin_area_1",
  "admin_area_3",  # Changed from admin_area_2 to admin_area_3
  "year",
  "indicator_common_id",
  "denominator",
  "coverage_original_estimate",
  "coverage_avgsurveyprojection",
  "coverage_cov"
)

# ---------------- NATIONAL (no admin_area_2) ----------------
if (exists("final_national") && is.data.frame(final_national) && nrow(final_national) > 0) {
  # drop admin_area_2 if it exists
  if ("admin_area_2" %in% names(final_national)) {
    final_national <- final_national %>% select(-admin_area_2)
  }
  # drop admin_area_3 if it exists (shouldn't be in national)
  if ("admin_area_3" %in% names(final_national)) {
    final_national <- final_national %>% select(-admin_area_3)
  }
  # add any missing cols as NA, and order
  for (cn in setdiff(nat_required_cols, names(final_national))) final_national[[cn]] <- NA
  final_national <- final_national[, nat_required_cols]
  write.csv(final_national, "M6_coverage_estimation_national.csv", row.names = FALSE, fileEncoding = "UTF-8")
  message("✓ Saved M6_coverage_estimation_national.csv: ", nrow(final_national), " rows")
} else {
  dummy_nat <- data.frame(
    admin_area_1 = character(),
    year = integer(),
    indicator_common_id = character(),
    denominator = character(),
    coverage_original_estimate = double(),
    coverage_avgsurveyprojection = double(),
    coverage_cov = double(),
    stringsAsFactors = FALSE
  )
  write.csv(dummy_nat, "M6_coverage_estimation_national.csv", row.names = FALSE, fileEncoding = "UTF-8")
  message("✓ No NATIONAL final results - saved empty file")
}

# ---------------- ADMIN2 (keeps admin_area_2) ----------------
if (exists("final_admin2") && is.data.frame(final_admin2) && nrow(final_admin2) > 0) {
  # drop admin_area_3 if it exists (shouldn't be in admin2)
  if ("admin_area_3" %in% names(final_admin2)) final_admin2$admin_area_3 <- NULL
  for (cn in setdiff(admin2_required_cols, names(final_admin2))) final_admin2[[cn]] <- NA
  final_admin2 <- final_admin2[, admin2_required_cols]
  write.csv(final_admin2, "M6_coverage_estimation_admin2.csv", row.names = FALSE, fileEncoding = "UTF-8")
  message("✓ Saved M6_coverage_estimation_admin2.csv: ", nrow(final_admin2), " rows")
} else {
  dummy_a2 <- data.frame(
    admin_area_1 = character(),
    admin_area_2 = character(),
    year = integer(),
    indicator_common_id = character(),
    denominator = character(),
    coverage_original_estimate = double(),
    coverage_avgsurveyprojection = double(),
    coverage_cov = double(),
    stringsAsFactors = FALSE
  )
  write.csv(dummy_a2, "M6_coverage_estimation_admin2.csv", row.names = FALSE, fileEncoding = "UTF-8")
  message("✓ No ADMIN2 final results - saved empty file (or ADMIN2 skipped)")
}

# ---------------- ADMIN3 (keeps admin_area_3, removes admin_area_2) ----------------
if (exists("final_admin3") && is.data.frame(final_admin3) && nrow(final_admin3) > 0) {
  # Remove admin_area_2 if it exists (it was added by our functions but shouldn't be in final output)
  if ("admin_area_2" %in% names(final_admin3)) final_admin3$admin_area_2 <- NULL
  # Add any missing columns as NA
  for (cn in setdiff(admin3_required_cols, names(final_admin3))) final_admin3[[cn]] <- NA
  # Reorder columns to match schema
  final_admin3 <- final_admin3[, admin3_required_cols]
  write.csv(final_admin3, "M6_coverage_estimation_admin3.csv", row.names = FALSE, fileEncoding = "UTF-8")
  message("✓ Saved M6_coverage_estimation_admin3.csv: ", nrow(final_admin3), " rows")
} else {
  dummy_a3 <- data.frame(
    admin_area_1 = character(),
    admin_area_3 = character(),
    year = integer(),
    indicator_common_id = character(),
    denominator = character(),
    coverage_original_estimate = double(),
    coverage_avgsurveyprojection = double(),
    coverage_cov = double(),
    stringsAsFactors = FALSE
  )
  write.csv(dummy_a3, "M6_coverage_estimation_admin3.csv", row.names = FALSE, fileEncoding = "UTF-8")
  message("✓ No ADMIN3 final results - saved empty file (or ADMIN3 skipped)")
}

message("✓ All done.")
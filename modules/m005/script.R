COUNTRY_ISO3 <- "ZMB"

SELECTED_COUNT_VARIABLE <- "count_final_both"  # Options: "count_final_none", "count_final_outlier", "count_final_completeness", "count_final_both"

PREGNANCY_LOSS_RATE <- 0.03
TWIN_RATE <- 0.015
STILLBIRTH_RATE <- 0.02
P1_NMR <- 0.039     #Default = 0.03
P2_PNMR <- 0.028
INFANT_MORTALITY_RATE <- 0.063  

UNDER5_MORTALITY_RATE <- 0.103  


ANALYSIS_LEVEL <- "NATIONAL_PLUS_AA2" # Options: "NATIONAL_ONLY", "NATIONAL_PLUS_AA2", "NATIONAL_PLUS_AA2_AA3"

DENOMINATOR_CHAIN <- "auto"  # Options: "auto", "anc1", "delivery", "bcg", "penta1"

#-------------------------------------------------------------------------------------------------------------
# CB - R code FASTR PROJECT
# Last edit: 2026 Mar 25
# Module: COVERAGE ESTIMATES (PART1 - DENOMINATORS)
#-------------------------------------------------------------------------------------------------------------

# ------------------------------ Load Required Libraries -----------------------------------------------------
library(dplyr)
library(tidyr)
library(zoo)
library(stringr)
library(purrr)

# ------------------------------ Define File Paths -----------------------------------------------------------
# Use local files for testing (comment out GitHub URLs when testing local changes)
PROJECT_DATA_COVERAGE <- "https://raw.githubusercontent.com/FASTR-Analytics/modules/main/survey_data_unified.csv"
PROJECT_DATA_POPULATION <- "https://raw.githubusercontent.com/FASTR-Analytics/modules/main/population_estimates_only.csv"


CURRENT_YEAR <- as.numeric(format(Sys.Date(), "%Y"))  # Dynamically get current year
MIN_YEAR <- 2000  # Set a fixed minimum year for filtering

message("✓ Step 1/7: Loading input datasets...")

# Input Datasets
message("  → Loading adjusted HMIS data (national)...")
adjusted_volume_data <- read.csv("M2_adjusted_data_national.csv", fileEncoding = "UTF-8") %>%
  mutate(iso3_code = COUNTRY_ISO3)

message("  → Loading adjusted HMIS data (subnational)...")
adjusted_volume_data_subnational <- read.csv("M2_adjusted_data_admin_area.csv", fileEncoding = "UTF-8") %>%
  mutate(iso3_code = COUNTRY_ISO3)

message("  → Loading survey data from GitHub...")
survey_data_unified <- read.csv(PROJECT_DATA_COVERAGE, fileEncoding = "UTF-8")

# Filter by ISO3 code
if ("iso3_code" %in% names(survey_data_unified)) {
  survey_data_unified <- survey_data_unified %>% filter(iso3_code == COUNTRY_ISO3)
  message("    Filtered survey data for ISO3: ", COUNTRY_ISO3)

  # Check if data exists for this country
  if (nrow(survey_data_unified) == 0) {
    warning("WARNING: No survey data found for country ISO3 code '", COUNTRY_ISO3, "'. Analysis will proceed with UNWPP data only where available.")
    # Create empty survey data structure to prevent crashes
    survey_data_unified <- data.frame(
      iso3_code = character(),
      admin_area_1 = character(),
      admin_area_2 = character(),
      year = integer(),
      indicator_common_id = character(),
      survey_value = numeric(),
      source = character(),
      source_detail = character(),
      stringsAsFactors = FALSE
    )
  } else {
    message("    ✓ Found ", nrow(survey_data_unified), " survey records for ", COUNTRY_ISO3)
  }
} else {
  warning("iso3_code column not found in survey data - cannot filter by country")
}

message("  → Loading population estimates from GitHub...")
population_estimates_only <- read.csv(PROJECT_DATA_POPULATION, fileEncoding = "UTF-8")

# Filter by ISO3 code
if ("iso3_code" %in% names(population_estimates_only)) {
  population_estimates_only <- population_estimates_only %>% filter(iso3_code == COUNTRY_ISO3)
  message("    Filtered population data for ISO3: ", COUNTRY_ISO3)

  # Check if data exists for this country
  if (nrow(population_estimates_only) == 0) {
    stop("ERROR: No population data found for country ISO3 code '", COUNTRY_ISO3, "'. Please check the ISO3 code and data availability.")
  }
  message("    ✓ Found ", nrow(population_estimates_only), " population records for ", COUNTRY_ISO3)
} else {
  warning("iso3_code column not found in population data - cannot filter by country")
}

message("✓ Step 1/7 completed: All datasets loaded successfully!")
message("================================================================================")

# ------------------------------ Prepare Data for Analysis ---------------------------------------------------

message("\n✓ Step 2/7: Preparing data for analysis...")

# Extract country name from HMIS data (used for joins and display)
message("  → Extracting country name from HMIS data...")
COUNTRY_NAME <- unique(adjusted_volume_data$admin_area_1)

if (length(COUNTRY_NAME) > 1) {
  warning("More than one country detected in adjusted_volume_data. Using the first one found: ", COUNTRY_NAME[1])
  COUNTRY_NAME <- COUNTRY_NAME[1]
}

message("Analyzing data for country: ", COUNTRY_NAME, " (ISO3: ", COUNTRY_ISO3, ")")

message("Analysis mode: ", ANALYSIS_LEVEL)

# Always run national analysis
survey_data_national <- survey_data_unified %>% filter(admin_area_2 == "NATIONAL")

# Check if we have any national survey data
if (nrow(survey_data_national) == 0) {
  warning("No national-level survey data available for ", COUNTRY_ISO3, ". Analysis will use UNWPP population data only.")
}

# Initialize subnational variables
hmis_data_subnational <- NULL
survey_data_subnational <- NULL
combined_admin2_export <- NULL
combined_admin3_export <- NULL

# Validate and prepare subnational data based on ANALYSIS_LEVEL
if (ANALYSIS_LEVEL %in% c("NATIONAL_PLUS_AA2", "NATIONAL_PLUS_AA2_AA3")) {

  # First check: Do we have any subnational survey data?
  survey_data_subnational <- survey_data_unified %>% filter(admin_area_2 != "NATIONAL")

  if (nrow(survey_data_subnational) == 0) {
    message("SAFEGUARD: No subnational survey data found. Falling back to: NATIONAL_ONLY")
    original_level <- ANALYSIS_LEVEL
    ANALYSIS_LEVEL <- "NATIONAL_ONLY"
    hmis_data_subnational <- NULL
    survey_data_subnational <- NULL
  } else {
    message("  ✓ Found ", nrow(survey_data_subnational), " subnational survey records")
    
    # Check if admin_area_3 data can be used for NATIONAL_PLUS_AA2_AA3
    if (ANALYSIS_LEVEL == "NATIONAL_PLUS_AA2_AA3") {
      has_admin3_hmis <- "admin_area_3" %in% names(adjusted_volume_data_subnational)
      
      if (has_admin3_hmis) {
        hmis_admin3_values <- adjusted_volume_data_subnational %>%
          filter(!is.na(admin_area_3) & admin_area_3 != "" & admin_area_3 != "ZONE") %>%
          distinct(admin_area_3) %>% pull(admin_area_3)
        
        survey_admin2_values <- survey_data_subnational %>%
          distinct(admin_area_2) %>% pull(admin_area_2)
        
        matching_areas <- intersect(hmis_admin3_values, survey_admin2_values)
        has_usable_admin3 <- length(matching_areas) > 0
        
        if (length(matching_areas) > 0) {
          message("✓ admin_area_3 validation passed: ", length(matching_areas), "/", length(hmis_admin3_values), " areas match")
        }
      } else {
        has_usable_admin3 <- FALSE
      }
      
      if (!has_usable_admin3) {
        message("SAFEGUARD: admin_area_3 data not usable. Falling back to: NATIONAL_PLUS_AA2")
        original_level <- ANALYSIS_LEVEL
        ANALYSIS_LEVEL <- "NATIONAL_PLUS_AA2"
      }
    }
    
    # Prepare HMIS data based on final analysis level
    hmis_data_subnational <- adjusted_volume_data_subnational
  }
}

message("Final analysis level: ", ANALYSIS_LEVEL)

message("✓ Step 2/7 completed: Data preparation finished!")
message("================================================================================")

# ------------------------------ Define Parameters -----------------------------------------------------------
# Coverage Estimation Parameters
coverage_params <- list(
  indicators = c(
    "anc1",
    "anc4",
    "delivery",
    "sba",
    "bcg",
    "penta1",
    "penta3",
    "measles1",
    "measles2",
    "rota1",
    "rota2",
    "opv1",
    "opv2",
    "opv3",
    "pnc1",
    "pnc1_mother",
    "nmr",
    "imr",
    "vitaminA",
    "fully_immunized"
  )
)

# List of survey variables to carry forward (for forward-fill and projections)
survey_vars <- c(
  "avgsurvey_anc1",
  "avgsurvey_anc4",
  "avgsurvey_delivery",
  "avgsurvey_sba",
  "avgsurvey_bcg",
  "avgsurvey_penta1",
  "avgsurvey_penta3",
  "avgsurvey_measles1",
  "avgsurvey_measles2",
  "avgsurvey_rota1",
  "avgsurvey_rota2",
  "avgsurvey_opv1",
  "avgsurvey_opv2",
  "avgsurvey_opv3",
  "avgsurvey_pnc1",
  "avgsurvey_pnc1_mother",
  "avgsurvey_nmr",
  "avgsurvey_imr",
  "postnmr",
  "avgsurvey_vitaminA",
  "avgsurvey_fully_immunized"
)

# ------------------------------ Define Functions ------------------------------------------------------------
# Part 1 - prepare hmis data
process_hmis_adjusted_volume <- function(adjusted_volume_data, count_col = SELECTED_COUNT_VARIABLE) {

  expected_indicators <- c(
    # Core RMNCH indicators
    "anc1", "anc4", "delivery", "sba", "bcg", "penta1", "penta3", "nmr", "imr",
    "measles1", "measles2", "rota1", "rota2", "opv1", "opv2", "opv3", "pnc1", "pnc1_mother",
    "vitaminA", "fully_immunized"
  )

  # Keep pnc1 and pnc1_mother as-is in HMIS data
  # Survey duplication logic will ensure both indicators exist in survey reference data
  
  
  has_admin2 <- "admin_area_2" %in% names(adjusted_volume_data)
  
  # Ensure year and month exist
  if (!all(c("year", "month") %in% names(adjusted_volume_data))) {
    adjusted_volume_data <- adjusted_volume_data %>%
      mutate(
        year = as.integer(substr(period_id, 1, 4)),
        month = as.integer(substr(period_id, 5, 6))
      )
  }
  
  has_iso3 <- "iso3_code" %in% names(adjusted_volume_data)
  group_vars <- if (has_admin2) c("admin_area_1", "admin_area_2", "year") else c("admin_area_1", "year")
  if (has_iso3) group_vars <- c("iso3_code", group_vars)
  
  adjusted_volume <- adjusted_volume_data %>%
    mutate(count = .data[[count_col]]) %>%
    select(any_of(c("iso3_code", "admin_area_1", "admin_area_2", "year", "month", "indicator_common_id", "count"))) %>%
    arrange(across(any_of(c("admin_area_1", "admin_area_2", "year", "month", "indicator_common_id"))))
  
  missing <- setdiff(expected_indicators, unique(adjusted_volume$indicator_common_id))
  if (length(missing) > 0) {
    warning("The following indicators are not available in the HMIS data: ", paste(missing, collapse = ", "))
  }

  hmis_countries <- unique(adjusted_volume$admin_area_1)
  
  nummonth_data <- adjusted_volume %>%
    distinct(across(all_of(c(group_vars, "month")))) %>%
    group_by(across(all_of(group_vars))) %>%
    summarise(nummonth = n_distinct(month, na.rm = TRUE), .groups = "drop")

  annual_hmis <- adjusted_volume %>%
    group_by(across(all_of(c(group_vars, "indicator_common_id")))) %>%
    summarise(count = sum(count, na.rm = TRUE), .groups = "drop") %>%
    pivot_wider(
      names_from = indicator_common_id,
      values_from = count,
      names_prefix = "count",
      values_fill = list(count = 0)
    ) %>%
    left_join(nummonth_data, by = group_vars) %>%
    arrange(across(all_of(group_vars)))
  
  # Extract ISO3 code if available
  hmis_iso3 <- if ("iso3_code" %in% names(adjusted_volume_data)) {
    unique(adjusted_volume_data$iso3_code)
  } else {
    NULL
  }

  list(
    annual_hmis = annual_hmis,
    hmis_countries = hmis_countries,
    hmis_iso3 = hmis_iso3
  )
}

# Part 2 - prepare survey data (DHS-preferred, preserves source_detail, robust to missing columns)
process_survey_data <- function(survey_data, hmis_countries, hmis_iso3 = NULL,
                                min_year = MIN_YEAR, max_year = CURRENT_YEAR,
                                national_reference = NULL) {

  # --- Harmonize, scope, coerce ---
  # For national data, filter by ISO3 if available; otherwise use admin_area_1
  if (!is.null(hmis_iso3) && "iso3_code" %in% names(survey_data)) {
    survey_data <- survey_data %>%
      filter(iso3_code %in% hmis_iso3) %>%
      mutate(
        source = tolower(source),
        year   = as.integer(year)
      )
  } else {
    survey_data <- survey_data %>%
      filter(admin_area_1 %in% hmis_countries) %>%
      mutate(
        source = tolower(source),
        year   = as.integer(year)
      )
  }

  # Apply recoding logic
  survey_data <- survey_data %>%
    mutate(
      indicator_common_id = recode(
        indicator_common_id,
        "polio1" = "opv1", "polio2" = "opv2", "polio3" = "opv3",
        "vitamina" = "vitaminA",
        .default = indicator_common_id
      )
    )

  # Keep pnc1 and pnc1_mother as-is - duplication logic will handle creating both versions
  
  # national vs subnational
  is_national <- all(survey_data$admin_area_2 == "NATIONAL", na.rm = TRUE)

  indicators <- c(
    "anc1","anc4","delivery","sba","bcg","penta1","penta3",
    "measles1","measles2","rota1","rota2","opv1","opv2","opv3",
    "pnc1","pnc1_mother","nmr","imr",
    "vitaminA","fully_immunized"
  )
  
  survey_filtered <- if (is_national) {
    survey_data %>% filter(admin_area_2 == "NATIONAL")
  } else {
    survey_data %>% filter(admin_area_2 != "NATIONAL")
  }
  
  # normalize source labels
  # Standardize source names - DHS variants → "dhs", MICS → "mics", UNWPP → "unwpp", others keep lowercase
  survey_filtered <- survey_filtered %>%
    mutate(source = case_when(
      str_detect(tolower(source), "dhs")   ~ "dhs",
      str_detect(tolower(source), "mics")  ~ "mics",
      str_detect(tolower(source), "unwpp") ~ "unwpp",
      TRUE ~ tolower(source)
    ))

  # Get unique sources available (excluding unwpp which is for population data)
  available_sources <- survey_filtered %>%
    filter(source != "unwpp") %>%
    distinct(source) %>%
    pull(source)

  # Priority order: DHS first, then any other source, MICS last (least preferred)
  # This ensures DHS > other surveys > MICS when multiple exist for same year
  source_priority <- c("dhs", setdiff(available_sources, c("dhs", "mics")), "mics")
  source_priority <- source_priority[source_priority %in% available_sources]

  if (length(source_priority) > 0) {
    message("    Survey sources available: ", paste(source_priority, collapse = ", "),
            " (priority: DHS > other > MICS)")
  }

  # Aggregate within (geo, year, indicator, source), pick best source per priority
  raw_pick_long <- survey_filtered %>%
    filter(source %in% source_priority,
           year >= min_year, year <= max_year) %>%
    group_by(admin_area_1, admin_area_2, year, indicator_common_id, source) %>%
    summarise(
      survey_value   = mean(survey_value, na.rm = TRUE),
      source_detail  = first(source_detail[!is.na(source_detail)], default = NA_character_),
      .groups = "drop"
    ) %>%
    # Pick best source based on priority order (DHS > other > MICS)
    group_by(admin_area_1, admin_area_2, year, indicator_common_id) %>%
    arrange(factor(source, levels = source_priority)) %>%
    slice(1) %>%
    ungroup() %>%
    drop_na(survey_value)

  # Add fallback rows for SBA (from delivery) if missing
  if (!"sba" %in% raw_pick_long$indicator_common_id && "delivery" %in% raw_pick_long$indicator_common_id) {
    sba_fallback <- raw_pick_long %>%
      filter(indicator_common_id == "delivery") %>%
      mutate(indicator_common_id = "sba")
    raw_pick_long <- bind_rows(raw_pick_long, sba_fallback)
  }

  # Add fallback rows for pnc1_mother (from pnc1) if missing
  if (!"pnc1_mother" %in% raw_pick_long$indicator_common_id && "pnc1" %in% raw_pick_long$indicator_common_id) {
    pnc1_mother_fallback <- raw_pick_long %>%
      filter(indicator_common_id == "pnc1") %>%
      mutate(indicator_common_id = "pnc1_mother")
    raw_pick_long <- bind_rows(raw_pick_long, pnc1_mother_fallback)
  }

  # wide values + sources + details (for convenience)
  raw_vals_wide <- raw_pick_long %>%
    select(admin_area_1, admin_area_2, year, indicator_common_id, survey_value) %>%
    pivot_wider(
      names_from  = indicator_common_id,
      values_from = survey_value,
      names_glue  = "rawsurvey_{indicator_common_id}"
    )
  
  raw_srcs_wide <- raw_pick_long %>%
    select(admin_area_1, admin_area_2, year, indicator_common_id, source) %>%
    pivot_wider(
      names_from  = indicator_common_id,
      values_from = source,
      names_glue  = "rawsource_{indicator_common_id}"
    )
  
  raw_detail_wide <- raw_pick_long %>%
    select(admin_area_1, admin_area_2, year, indicator_common_id, source_detail) %>%
    pivot_wider(
      names_from  = indicator_common_id,
      values_from = source_detail,
      names_glue  = "rawdetail_{indicator_common_id}"
    )
  
  raw_survey_values <- raw_vals_wide %>%
    left_join(raw_srcs_wide,   by = c("admin_area_1","admin_area_2","year")) %>%
    left_join(raw_detail_wide, by = c("admin_area_1","admin_area_2","year"))

  # Fallback for SBA raw values (from delivery)
  if (!"rawsurvey_sba" %in% names(raw_survey_values) && "rawsurvey_delivery" %in% names(raw_survey_values)) {
    raw_survey_values$rawsurvey_sba <- raw_survey_values$rawsurvey_delivery
    if ("rawsource_delivery" %in% names(raw_survey_values)) {
      raw_survey_values$rawsource_sba <- raw_survey_values$rawsource_delivery
    }
    if ("rawdetail_delivery" %in% names(raw_survey_values)) {
      raw_survey_values$rawdetail_sba <- raw_survey_values$rawdetail_delivery
    }
  }

  # Fallback for pnc1_mother raw values (from pnc1)
  if (!"rawsurvey_pnc1_mother" %in% names(raw_survey_values) && "rawsurvey_pnc1" %in% names(raw_survey_values)) {
    raw_survey_values$rawsurvey_pnc1_mother <- raw_survey_values$rawsurvey_pnc1
    if ("rawsource_pnc1" %in% names(raw_survey_values)) {
      raw_survey_values$rawsource_pnc1_mother <- raw_survey_values$rawsource_pnc1
    }
    if ("rawdetail_pnc1" %in% names(raw_survey_values)) {
      raw_survey_values$rawdetail_pnc1_mother <- raw_survey_values$rawdetail_pnc1
    }
  }


  full_years <- seq(min_year, max_year)
  group_keys <- if (is_national)
    c("admin_area_1","indicator_common_id","source")
  else
    c("admin_area_1","admin_area_2","indicator_common_id","source")
  
  survey_extended <- survey_filtered %>%
    filter(year %in% full_years) %>%
    group_by(across(all_of(group_keys)), .drop = FALSE) %>%
    group_modify(~{
      if (nrow(.x) == 0) return(tibble::tibble())
      .x %>%
        complete(year = full_years) %>%
        arrange(year) %>%
        mutate(survey_value_carry = zoo::na.locf(survey_value, na.rm = FALSE))
    }) %>%
    ungroup()
  
  survey_wide <- survey_extended %>%
    select(all_of(c("admin_area_1", if (!is_national) "admin_area_2")),
                  year, indicator_common_id, source, survey_value_carry) %>%
    pivot_wider(
      names_from = c(source, indicator_common_id),
      values_from = survey_value_carry,
      names_glue  = "{indicator_common_id}_{source}",
      values_fn   = mean
    )
  
  # geo×year grid
  geo_keys <- if (is_national) c("admin_area_1") else c("admin_area_1","admin_area_2")
  geos <- (if (nrow(survey_wide)) survey_wide else survey_filtered) %>%
    distinct(across(all_of(geo_keys)))
  grid <- expand_grid(geos, year = full_years)
  
  build_last_table <- function(sf, src_label, last_name) {
    yrs <- sf %>%
      filter(source == src_label, year %in% full_years) %>%
      distinct(across(all_of(geo_keys)), year)
    grid %>%
      left_join(yrs %>% mutate(obs = 1L), by = c(geo_keys, "year")) %>%
      group_by(across(all_of(geo_keys))) %>%
      arrange(year, .by_group = TRUE) %>%
      mutate(
        tmp = if_else(!is.na(obs) & obs == 1L, year, NA_integer_),
        !!last_name := zoo::na.locf(tmp, na.rm = FALSE)
      ) %>%
      ungroup() %>%
      select(all_of(c(geo_keys, "year", last_name)))
  }
  
  dhs_last  <- build_last_table(survey_filtered, "dhs",  "dhs_lastyear")
  mics_last <- build_last_table(survey_filtered, "mics", "mics_lastyear")
  
  survey_wide <- survey_wide %>%
    right_join(grid, by = c(geo_keys, "year")) %>%
    left_join(dhs_last,  by = c(geo_keys, "year")) %>%
    left_join(mics_last, by = c(geo_keys, "year"))
  
  # Choose most-recent source per year - priority: DHS > other > MICS
  # Updated to handle any source, not just DHS and MICS
  choose_most_recent <- function(df, ind, all_sources) {
    avg_col <- paste0("avgsurvey_", ind)

    # Find all available columns for this indicator
    ind_cols <- grep(paste0("^", ind, "_"), names(df), value = TRUE)

    if (length(ind_cols) == 0) {
      df[[avg_col]] <- NA_real_
      return(df)
    }

    # Extract sources from column names
    available_sources <- sub(paste0("^", ind, "_"), "", ind_cols)

    # Priority: DHS first, then other sources (alphabetically), MICS last
    other_sources <- setdiff(available_sources, c("dhs", "mics"))
    source_order <- c("dhs", sort(other_sources), "mics")
    source_order <- source_order[source_order %in% available_sources]

    # Use first available source in priority order
    if (length(source_order) == 0) {
      df[[avg_col]] <- NA_real_
    } else {
      best_col <- paste0(ind, "_", source_order[1])
      df[[avg_col]] <- as.numeric(df[[best_col]])
    }
    df
  }
  for (ind in indicators) survey_wide <- choose_most_recent(survey_wide, ind, available_sources)
  
  # postnmr
  survey_wide <- survey_wide %>%
    mutate(postnmr = ifelse("avgsurvey_imr" %in% names(.) & "avgsurvey_nmr" %in% names(.),
                                   avgsurvey_imr - avgsurvey_nmr, NA_real_))
  
  # carried panel
  carry_group <- if (is_national) "admin_area_1" else c("admin_area_1","admin_area_2")
  survey_carried <- survey_wide %>%
    group_by(across(all_of(carry_group))) %>%
    complete(year = full_seq(year, 1)) %>%
    arrange(across(all_of(carry_group)), year) %>%
    mutate(across(everything(), ~ zoo::na.locf(.x, na.rm = FALSE))) %>%
    ungroup()
  
  for (ind in c(indicators, "postnmr")) {
    avg_col   <- paste0("avgsurvey_", ind)
    carry_col <- paste0(ind, "carry")
    if (avg_col %in% names(survey_carried)) {
      survey_carried[[carry_col]] <- survey_carried[[avg_col]]
    }
  }

  # If sba reference doesn't exist, use delivery reference as fallback
  if (!"sbacarry" %in% names(survey_carried) && "deliverycarry" %in% names(survey_carried)) {
    survey_carried$sbacarry <- survey_carried$deliverycarry
  }

  # defaults for subnational when missing - use national coverage estimate
  # If no national reference is available, leave as NA (no coverage calculation)
  if (!is_national && !is.null(national_reference)) {
    # Extract national coverage values by year for all indicators (from survey file)
    for (ind in c("anc1", "anc4", "delivery", "sba", "bcg", "penta1", "penta3",
                  "measles1", "measles2", "opv1", "opv2", "opv3", "rota1", "rota2",
                  "pnc1", "vitaminA", "fully_immunized")) {
      carry_col <- paste0(ind, "carry")
      nat_col <- paste0("avgsurvey_", ind)

      # If national reference data is provided, join and use national values as defaults
      if (nat_col %in% names(national_reference)) {
        national_vals <- national_reference %>%
          select(year, national_value = all_of(nat_col)) %>%
          distinct()

        survey_carried <- survey_carried %>%
          left_join(national_vals, by = "year")

        # Only fill missing values with national estimates; if national is also NA, leave as NA
        if (!(carry_col %in% names(survey_carried))) {
          survey_carried[[carry_col]] <- survey_carried$national_value
        } else {
          survey_carried[[carry_col]] <- ifelse(is.na(survey_carried[[carry_col]]),
                                                survey_carried$national_value,
                                                survey_carried[[carry_col]])
        }

        # Clean up temporary column
        survey_carried <- survey_carried %>% select(-national_value)
      }
    }
  }
  
  # tag NATIONAL if needed
  if (is_national) {
    survey_carried    <- survey_carried    %>% mutate(admin_area_2 = "NATIONAL")
    raw_survey_values <- raw_survey_values %>% mutate(admin_area_2 = "NATIONAL")
    raw_pick_long     <- raw_pick_long     %>% mutate(admin_area_2 = "NATIONAL")
  }

  # Carry iso3_code through to outputs so downstream joins can use it
  if (!is.null(hmis_iso3)) {
    survey_carried    <- survey_carried    %>% mutate(iso3_code = hmis_iso3[1])
    raw_survey_values <- raw_survey_values %>% mutate(iso3_code = hmis_iso3[1])
    raw_pick_long     <- raw_pick_long     %>% mutate(iso3_code = hmis_iso3[1])
  }

  # Always duplicate pnc1carry → pnc1_mothercarry (survey only has pnc1)
  if ("pnc1carry" %in% names(survey_carried)) {
    survey_carried$pnc1_mothercarry <- survey_carried$pnc1carry
  }

  list(
    carried  = survey_carried %>% arrange(across(any_of(c("admin_area_1", if (!is_national) "admin_area_2", "year")))),
    raw      = raw_survey_values,   # wide: rawsurvey_* + rawsource_* + rawdetail_* per indicator
    raw_long = raw_pick_long        # long: single row per geo–year–indicator; DHS-preferred; keeps source_detail
  )
}

# Part 2b - prepare unwpp data
process_national_population_data <- function(population_data, hmis_countries, hmis_iso3 = NULL,
                                             min_year = MIN_YEAR, max_year = CURRENT_YEAR) {

  # For national data, filter by ISO3 if available; otherwise use admin_area_1
  if (!is.null(hmis_iso3) && "iso3_code" %in% names(population_data)) {
    base <- population_data %>%
      filter(admin_area_2 == "NATIONAL",
                    iso3_code %in% hmis_iso3) %>%
      mutate(
        source = tolower(source),
        year   = as.integer(year)
      )
  } else {
    base <- population_data %>%
      filter(admin_area_2 == "NATIONAL",
                    admin_area_1 %in% hmis_countries) %>%
      mutate(
        source = tolower(source),
        year   = as.integer(year)
      )
  }
  
  #original wide
  wide <- base %>%
    select(any_of("iso3_code"), admin_area_1, year, indicator_common_id, survey_value, source) %>%
    pivot_wider(
      names_from  = c(indicator_common_id, source),
      values_from = survey_value,
      names_glue  = "{indicator_common_id}_{source}",
      values_fn   = mean
    )
  # Ensure iso3_code is carried through for downstream joins
  if (!is.null(hmis_iso3) && !"iso3_code" %in% names(wide)) {
    wide <- wide %>% mutate(iso3_code = hmis_iso3[1])
  }
  
  #raw
  raw_long <- base %>%
    filter(source == "unwpp",
                  between(year, min_year, max_year)) %>%
    select(admin_area_1, year, indicator_common_id,
                  survey_value, source, any_of("source_detail")) %>%
    mutate(admin_area_2 = "NATIONAL") %>%
    relocate(admin_area_2, .after = admin_area_1)
  
  # ensure source_detail exists if absent
  if (!"source_detail" %in% names(raw_long)) raw_long$source_detail <- NA_character_
  
  raw_long <- raw_long %>%
    select(admin_area_1, admin_area_2, year,
                  indicator_common_id, source, source_detail, survey_value) %>%
    arrange(admin_area_1, admin_area_2, year, indicator_common_id)
  
  list(wide = wide, raw_long = raw_long)
}

#Part 3 - calculate denominators
calculate_denominators <- function(hmis_data, survey_data, population_data = NULL) {
  # nmrcarry is handled by the survey data processing, no need for redundant check here
  
  has_admin_area_2 <- "admin_area_2" %in% names(hmis_data)
  use_iso <- "iso3_code" %in% names(hmis_data) && "iso3_code" %in% names(survey_data)

  if (has_admin_area_2) {
    # Standard join admin_area_2 to admin_area_2 (survey data is restructured)
    join_keys <- if (use_iso) c("iso3_code", "admin_area_2", "year") else c("admin_area_1", "admin_area_2", "year")
    data <- hmis_data %>%
      full_join(survey_data, by = join_keys)
  } else {
    join_keys <- if (use_iso) c("iso3_code", "year") else c("admin_area_1", "year")
    use_iso_pop <- use_iso && !is.null(population_data) && "iso3_code" %in% names(population_data)
    join_keys_pop <- if (use_iso_pop) c("iso3_code", "year") else c("admin_area_1", "year")
    data <- hmis_data %>%
      full_join(survey_data, by = join_keys) %>%
      { if (!is.null(population_data)) full_join(., population_data, by = join_keys_pop) else . }
  }
  
  indicator_vars <- list(
    anc1 = c("countanc1", "anc1carry"),
    anc4 = c("countanc4", "anc4carry"),
    delivery = c("countdelivery", "deliverycarry"),
    sba = c("countsba", "sbacarry"),
    penta1 = c("countpenta1", "penta1carry"),
    penta2 = c("countpenta2", "penta2carry"),
    penta3 = c("countpenta3", "penta3carry"),
    opv1 = c("countopv1", "opv1carry"),
    opv2 = c("countopv2", "opv2carry"),
    opv3 = c("countopv3", "opv3carry"),
    measles1 = c("countmeasles1", "measles1carry"),
    measles2 = c("countmeasles2", "measles2carry"),
    bcg = c("countbcg", "bcgcarry"),
    livebirth = c("countlivebirth", "livebirthcarry"),
    pnc1_mother = c("countpnc1_mother", "pnc1_mothercarry"),
    pnc1 = c("countpnc1", "pnc1carry"),
    nmr = c("countnmr", "nmrcarry"),
    vitaminA = c("countvitaminA", "vitaminAcarry"),
    fully_immunized = c("countfully_immunized", "fully_immunizedcarry")
  )
  
  available_vars <- names(data)
  
  safe_mutate <- function(var_name, formula) {
    required_vars <- indicator_vars[[var_name]]
    if (all(required_vars %in% available_vars)) formula else NA_real_
  }
  
  safe_calc <- function(expr) {
    tryCatch(expr, error = function(e) NA_real_)
  }
  
  # DENOMINATORS FROM LIVE BIRTH DATA
  if (all(indicator_vars$livebirth %in% available_vars)) {
    data <- data %>%
      mutate(
        countlivebirth = ifelse(is.na(countlivebirth), 0, countlivebirth),
        dlivebirths_livebirth = safe_mutate("livebirth", countlivebirth / livebirthcarry),
        dlivebirths_pregnancy = safe_calc(dlivebirths_livebirth * (1 - 0.5 * TWIN_RATE) / ((1 - STILLBIRTH_RATE) * (1 - PREGNANCY_LOSS_RATE))),
        dlivebirths_delivery = safe_calc(dlivebirths_pregnancy * (1 - PREGNANCY_LOSS_RATE)),
        dlivebirths_birth = safe_calc(dlivebirths_livebirth / (1 - STILLBIRTH_RATE)),
        dlivebirths_dpt = safe_calc(dlivebirths_livebirth * (1 - P1_NMR)),
        dlivebirths_measles1 = safe_calc(dlivebirths_dpt * (1 - P2_PNMR)),
        dlivebirths_measles2 = safe_calc(dlivebirths_dpt * (1 - 2 * P2_PNMR))
      )
  }
  
  # DENOMINATORS FROM ANC1 DATA
  if (all(indicator_vars$anc1 %in% available_vars)) {
    data <- data %>% mutate(
      danc1_pregnancy = safe_mutate("anc1", countanc1 / anc1carry),
      danc1_delivery = safe_calc(danc1_pregnancy * (1 - PREGNANCY_LOSS_RATE)),
      danc1_birth = safe_calc(danc1_delivery / (1 - 0.5 * TWIN_RATE)),
      danc1_livebirth = safe_calc(danc1_birth * (1 - STILLBIRTH_RATE)),
      danc1_dpt = safe_calc(danc1_livebirth * (1 - P1_NMR)),
      danc1_measles1 = safe_calc(danc1_dpt * (1 - P2_PNMR)),
      danc1_measles2 = safe_calc(danc1_dpt * (1 - 2 * P2_PNMR))
    )
  }
  
  # DENOMINATORS FROM DELIVERY DATA
  if (all(indicator_vars$delivery %in% available_vars)) {
    data <- data %>% mutate(
      ddelivery_livebirth = safe_mutate("delivery", countdelivery / deliverycarry),
      ddelivery_birth = safe_calc(ddelivery_livebirth / (1 - STILLBIRTH_RATE)),
      ddelivery_pregnancy = safe_calc(ddelivery_birth * (1 - 0.5 * TWIN_RATE) / (1 - PREGNANCY_LOSS_RATE)),
      ddelivery_dpt = safe_calc(ddelivery_livebirth * (1 - P1_NMR)),
      ddelivery_measles1 = safe_calc(ddelivery_dpt * (1 - P2_PNMR)),
      ddelivery_measles2 = safe_calc(ddelivery_dpt * (1 - 2 * P2_PNMR))
    )
  }

  # DENOMINATORS FROM SBA DATA (same formulas as delivery)
  if (all(indicator_vars$sba %in% available_vars)) {
    data <- data %>% mutate(
      dsba_livebirth = safe_mutate("sba", countsba / sbacarry),
      dsba_birth = safe_calc(dsba_livebirth / (1 - STILLBIRTH_RATE)),
      dsba_pregnancy = safe_calc(dsba_birth * (1 - 0.5 * TWIN_RATE) / (1 - PREGNANCY_LOSS_RATE)),
      dsba_dpt = safe_calc(dsba_livebirth * (1 - P1_NMR)),
      dsba_measles1 = safe_calc(dsba_dpt * (1 - P2_PNMR)),
      dsba_measles2 = safe_calc(dsba_dpt * (1 - 2 * P2_PNMR))
    )
  }

  # DENOMINATORS FROM PENTA1 DATA
  if (all(indicator_vars$penta1 %in% available_vars)) {
    data <- data %>% mutate(
      dpenta1_dpt = safe_mutate("penta1", countpenta1 / penta1carry),
      dpenta1_measles1 = safe_calc(dpenta1_dpt * (1 - P2_PNMR)),
      dpenta1_measles2 = safe_calc(dpenta1_dpt * (1 - 2 * P2_PNMR))
    )
  }
  
  # DENOMINATORS FROM BCG DATA (NATIONAL ANALYSIS ONLY)
  if (!has_admin_area_2 && all(indicator_vars$bcg %in% available_vars)) {
    data <- data %>% mutate(
      dbcg_pregnancy = safe_mutate("bcg", (countbcg / bcgcarry) / (1 - PREGNANCY_LOSS_RATE) / (1 + TWIN_RATE) / (1 - STILLBIRTH_RATE)),
      dbcg_livebirth = safe_mutate("bcg", countbcg / bcgcarry),
      dbcg_dpt = safe_mutate("bcg", (countbcg / bcgcarry) * (1 - P1_NMR))
    )
  }
  
  # DENOMINATORS FROM POPULATION DATA (NATIONAL ANALYSIS ONLY)
  # UNWPP-based denominators - ONLY use UNWPP source columns
  if (!has_admin_area_2) {
    has_crudebr_unwpp <- "crudebr_unwpp" %in% names(data)
    has_poptot_unwpp <- "poptot_unwpp" %in% names(data)
    has_totu1pop_unwpp <- "totu1pop_unwpp" %in% names(data)

    # Report what UNWPP data is available
    unwpp_available <- c()
    if (has_crudebr_unwpp) unwpp_available <- c(unwpp_available, "crudebr_unwpp")
    if (has_poptot_unwpp) unwpp_available <- c(unwpp_available, "poptot_unwpp")
    if (has_totu1pop_unwpp) unwpp_available <- c(unwpp_available, "totu1pop_unwpp")

    if (length(unwpp_available) > 0) {
      message("    UNWPP population data available: ", paste(unwpp_available, collapse = ", "))
    }

    # Report what's missing
    missing_unwpp <- c()
    if (!has_crudebr_unwpp) missing_unwpp <- c(missing_unwpp, "crudebr_unwpp")
    if (!has_poptot_unwpp) missing_unwpp <- c(missing_unwpp, "poptot_unwpp")
    if (!has_totu1pop_unwpp) missing_unwpp <- c(missing_unwpp, "totu1pop_unwpp")

    if (length(missing_unwpp) > 0) {
      message("    NOTE: UNWPP denominators limited - missing: ", paste(missing_unwpp, collapse = ", "))
    }

    data <- data %>%
      mutate(nummonth = if_else(is.na(nummonth) | nummonth == 0, 12, nummonth))

    # Calculate pregnancy/livebirth denominators if crudebr_unwpp AND poptot_unwpp are available
    if (has_crudebr_unwpp && has_poptot_unwpp) {
      data <- data %>%
        mutate(
          dwpp_pregnancy = if_else(!is.na(crudebr_unwpp) & !is.na(poptot_unwpp),
                                   (crudebr_unwpp / 1000) * poptot_unwpp / (1 + TWIN_RATE), NA_real_),
          dwpp_livebirth = if_else(!is.na(crudebr_unwpp) & !is.na(poptot_unwpp),
                                   (crudebr_unwpp / 1000) * poptot_unwpp, NA_real_)
        ) %>%
        mutate(
          dwpp_pregnancy = if_else(nummonth < 12, dwpp_pregnancy * (nummonth / 12), dwpp_pregnancy),
          dwpp_livebirth = if_else(nummonth < 12, dwpp_livebirth * (nummonth / 12), dwpp_livebirth)
        )
    }

    # Calculate DPT/measles denominators if totu1pop_unwpp is available
    if (has_totu1pop_unwpp) {
      data <- data %>%
        mutate(
          dwpp_dpt = if_else(!is.na(totu1pop_unwpp), totu1pop_unwpp, NA_real_),
          dwpp_measles1 = if_else(!is.na(totu1pop_unwpp) & !is.na(nmrcarry),
                                  totu1pop_unwpp * (1 - (nmrcarry / 100)), NA_real_),
          dwpp_measles2 = if_else(!is.na(totu1pop_unwpp) & !is.na(nmrcarry) & !is.na(postnmr),
                                  totu1pop_unwpp * (1 - (nmrcarry / 100)) * (1 - (2 * postnmr / 100)), NA_real_)
        ) %>%
        mutate(
          dwpp_dpt       = if_else(nummonth < 12, dwpp_dpt * (nummonth / 12), dwpp_dpt),
          dwpp_measles1  = if_else(nummonth < 12, dwpp_measles1 * (nummonth / 12), dwpp_measles1),
          dwpp_measles2  = if_else(nummonth < 12, dwpp_measles2 * (nummonth / 12), dwpp_measles2)
        )
    }
  }

  # STEP 3: Calculate vitaminA and fully_immunized denominators FROM all existing livebirth denominators
  # This happens AFTER all initial denominators are calculated
  # We loop through all d*_livebirth columns and create corresponding vitaminA and fully_immunized columns

  livebirth_cols <- grep("_livebirth$", names(data), value = TRUE)

  if (length(livebirth_cols) > 0) {
    for (lb_col in livebirth_cols) {
      # Extract the prefix (e.g., "danc1", "ddelivery", "dbcg", "dwpp")
      prefix <- sub("_livebirth$", "", lb_col)

      # Create new column names
      vitamin_col <- paste0(prefix, "_vitaminA")
      fic_col <- paste0(prefix, "_fully_immunized")

      # Calculate the new denominators
      data[[vitamin_col]] <- safe_calc(data[[lb_col]] * (1 - UNDER5_MORTALITY_RATE) * 4.5)
      data[[fic_col]] <- safe_calc(data[[lb_col]] * (1 - INFANT_MORTALITY_RATE))
    }
  }

  return(data)
}

#Part 4 - prepare summary results
create_denominator_summary <- function(denominators_data, analysis_type = "NATIONAL") {
  denominator_cols <- names(denominators_data)[grepl("^d(livebirths|anc1|delivery|sba|penta1|bcg|wpp)_", names(denominators_data))]
  if (length(denominator_cols) == 0) {
    warning("No denominator columns found"); return(NULL)
  }
  
  has_admin2 <- "admin_area_2" %in% names(denominators_data)
  has_admin3 <- "admin_area_3" %in% names(denominators_data)
  
  has_iso3 <- "iso3_code" %in% names(denominators_data)
  iso_prefix <- if (has_iso3) "iso3_code" else NULL

  select_cols <- if (has_admin3) {
    c(iso_prefix, "admin_area_1", "admin_area_3", "year", denominator_cols)
  } else if (has_admin2) {
    c(iso_prefix, "admin_area_1", "admin_area_2", "year", denominator_cols)
  } else {
    c(iso_prefix, "admin_area_1", "year", denominator_cols)
  }
  
  summary_stats <- denominators_data %>%
    select(all_of(select_cols)) %>%
    pivot_longer(
      cols = all_of(denominator_cols),
      names_to = "denominator_type",
      values_to = "value"
    ) %>%
    filter(!is.na(value)) %>%
    arrange(year, denominator_type)

  summary_stats
}


# Add denominator_label
add_denominator_labels <- function(df, denom_col = "denominator") {
  stopifnot(is.data.frame(df), denom_col %in% names(df))
  
  df %>%
    mutate(
      .den = .data[[denom_col]],
      source_indicator = str_replace(.den, "^d([^_]+)_.*$", "\\1"),
      target_population = str_replace(.den, "^d[^_]+_(.*)$", "\\1"),
      target_population = recode(target_population,
                              "livebirths" = "livebirth",
                              .default = target_population),
      source_phrase = case_when(
        source_indicator == "anc1"       ~ "derived from HMIS data on ANC 1st visits",
        source_indicator == "delivery"   ~ "derived from HMIS data on institutional deliveries",
        source_indicator == "bcg"        ~ "derived from HMIS data on BCG doses",
        source_indicator == "penta1"     ~ "derived from HMIS data on Penta-1 doses",
        source_indicator == "wpp"        ~ "based on UN WPP estimates",
        source_indicator == "livebirths" ~ "derived from HMIS data on live births",
        TRUE ~ "from other sources"
      ),
      target_phrase = case_when(
        target_population == "pregnancy" ~ "Estimated number of pregnancies",
        target_population == "delivery"  ~ "Estimated number of deliveries",
        target_population == "birth"     ~ "Estimated number of total births (live + stillbirths)",
        target_population == "livebirth" ~ "Estimated number of live births",
        target_population == "dpt"       ~ "Estimated number of infants eligible for DPT1",
        target_population == "measles1"  ~ "Estimated number of children eligible for measles dose 1 (MCV1)",
        target_population == "measles2"  ~ "Estimated number of children eligible for measles dose 2 (MCV2)",
        target_population == "vitaminA" ~ "Estimated number of children aged 6-59 months eligible for Vitamin A",
        target_population == "fully_immunized" ~ "Estimated number of children eligible for full immunization",
        TRUE ~ paste("Estimated population for target", target_population)
      ),
      denominator_label = paste0(target_phrase, " ", source_phrase, ".")
    ) %>%
    select(-.den, -source_phrase, -target_phrase)
}

# Helper function: Classify denominator source type (used by multiple functions)
classify_source_type <- function(denominator, ind) {
  if (startsWith(denominator, "danc1_")     && ind %in% c("anc1")) return("reference_based")
  if (startsWith(denominator, "ddelivery_") && ind %in% c("delivery"))    return("reference_based")
  if (startsWith(denominator, "dsba_")      && ind %in% c("sba"))         return("reference_based")
  if (startsWith(denominator, "dpenta1_")   && ind %in% c("penta1"))       return("reference_based")
  if (startsWith(denominator, "dbcg_")      && ind %in% c("bcg"))         return("reference_based")
  if (startsWith(denominator, "dwpp_"))                                   return("unwpp_based")
  "independent"
}

# Part 4b - Select best denominator chain (UNWPP proximity)
# Compares each HMIS chain to UNWPP and picks the one closest to ratio 1.0
# Or uses a manual override if DENOMINATOR_CHAIN != "auto"
select_best_chain <- function(denominators_national, chain_param = "auto") {

  # Available chains and their prefixes
  # bcg is national-only (not computed at subnational level), so excluded from auto
  chain_info_all <- list(
    anc1     = "danc1_",
    delivery = "ddelivery_",
    bcg      = "dbcg_",
    penta1   = "dpenta1_"
  )
  chain_info_auto <- chain_info_all[c("anc1", "delivery", "penta1")]  # exclude bcg from auto

  # If manual override, return immediately (allow all chains including bcg)
  if (chain_param != "auto") {
    if (!chain_param %in% names(chain_info_all)) {
      stop("Invalid DENOMINATOR_CHAIN: '", chain_param,
           "'. Options: auto, ", paste(names(chain_info_all), collapse = ", "))
    }
    prefix <- chain_info_all[[chain_param]]
    message("\n--- Chain Selection (manual override) ---")
    message("Selected chain: ", chain_param, " (prefix: ", prefix, ")")
    if (chain_param == "bcg") {
      message("  Note: bcg is national-only — subnational results will be empty")
    }
    return(list(chain = chain_param, prefix = prefix))
  }

  # Auto: compare each chain to UNWPP
  message("\n--- Chain Selection (UNWPP proximity) ---")

  # Target populations to compare (the main demographic quantities)
  targets <- c("pregnancy", "livebirth", "dpt")

  # Check which UNWPP columns exist
  unwpp_cols <- paste0("dwpp_", targets)
  available_unwpp <- unwpp_cols[unwpp_cols %in% names(denominators_national)]

  if (length(available_unwpp) == 0) {
    warning("No UNWPP denominators available for chain comparison. Defaulting to delivery chain.")
    return(list(chain = "delivery", prefix = "ddelivery_"))
  }

  available_targets <- sub("^dwpp_", "", available_unwpp)

  # Compare each chain to UNWPP
  chain_results <- data.frame(
    chain = character(),
    median_ratio = numeric(),
    n_comparisons = integer(),
    stringsAsFactors = FALSE
  )

  for (chain_name in names(chain_info_auto)) {
    prefix <- chain_info_auto[[chain_name]]
    ratios <- c()

    for (target in available_targets) {
      chain_col <- paste0(prefix, target)
      unwpp_col <- paste0("dwpp_", target)

      if (chain_col %in% names(denominators_national) &&
          unwpp_col %in% names(denominators_national)) {
        chain_vals <- denominators_national[[chain_col]]
        unwpp_vals <- denominators_national[[unwpp_col]]

        # Compute ratios where both are non-NA and positive
        valid <- !is.na(chain_vals) & !is.na(unwpp_vals) &
                 chain_vals > 0 & unwpp_vals > 0
        if (any(valid)) {
          ratios <- c(ratios, chain_vals[valid] / unwpp_vals[valid])
        }
      }
    }

    if (length(ratios) > 0) {
      chain_results <- rbind(chain_results, data.frame(
        chain = chain_name,
        median_ratio = median(ratios),
        n_comparisons = length(ratios),
        stringsAsFactors = FALSE
      ))
    }
  }

  if (nrow(chain_results) == 0) {
    warning("No HMIS chains have overlapping data with UNWPP. Defaulting to delivery chain.")
    return(list(chain = "delivery", prefix = "ddelivery_"))
  }

  # Pick chain closest to ratio = 1.0
  chain_results$distance <- abs(chain_results$median_ratio - 1.0)
  best_idx <- which.min(chain_results$distance)
  selected_chain <- chain_results$chain[best_idx]

  # Print summary table
  message(sprintf("%-12s | %-22s | %s", "Chain", "Median ratio to UNWPP", "Verdict"))
  for (i in seq_len(nrow(chain_results))) {
    ratio <- chain_results$median_ratio[i]
    pct <- round((ratio - 1) * 100)
    verdict <- if (chain_results$chain[i] == selected_chain) {
      "SELECTED (closest)"
    } else if (pct >= 0) {
      paste0(pct, "% above")
    } else {
      paste0(abs(pct), "% below")
    }
    message(sprintf("%-12s | %-22.2f | %s",
                    chain_results$chain[i], ratio, verdict))
  }
  message("Selected chain: ", selected_chain)

  return(list(chain = selected_chain, prefix = chain_info_auto[[selected_chain]]))
}

# Part 5 - Calculate coverage estimates (from Part 2)
calculate_coverage <- function(denominators_data, numerators_data) {

  # Dynamically determine geographic keys based on available columns
  # For national data, prefer iso3_code over admin_area_1 (more robust to name variations)
  has_iso_denom <- "iso3_code" %in% names(denominators_data)
  has_iso_numer <- "iso3_code" %in% names(numerators_data)
  use_iso <- has_iso_denom && has_iso_numer

  if (use_iso) {
    base_geo_keys <- c("iso3_code", "year")
  } else {
    base_geo_keys <- c("admin_area_1", "year")
  }

  # Add admin_area_2 if it exists, otherwise add a default
  if ("admin_area_2" %in% names(denominators_data)) {
    base_geo_keys <- c(base_geo_keys, "admin_area_2")
  } else {
    denominators_data <- denominators_data %>% mutate(admin_area_2 = "NATIONAL")
    numerators_data <- numerators_data %>% mutate(admin_area_2 = "NATIONAL")
    base_geo_keys <- c(base_geo_keys, "admin_area_2")
  }

  # Add admin_area_3 if it exists
  if ("admin_area_3" %in% names(denominators_data)) {
    geo_keys <- c(base_geo_keys, "admin_area_3")
  } else {
    geo_keys <- base_geo_keys
  }

  # Map denominator targets to indicators
  target_indicator_map <- tibble::tribble(
    ~target_population, ~indicators,
    "pregnancy", c("anc1", "anc4"),
    "livebirth", c("delivery", "sba", "bcg", "pnc1_mother", "pnc1"),
    "dpt",       c("penta1", "penta2", "penta3", "opv1", "opv2", "opv3",
                   "pcv1", "pcv2", "pcv3", "rota1", "rota2", "ipv1", "ipv2"),
    "measles1",  c("measles1"),
    "measles2",  c("measles2"),
    "vitaminA", c("vitaminA"),
    "fully_immunized", c("fully_immunized")
  )

  # Expand denominators to match indicators
  denominator_expanded <- denominators_data %>%
    left_join(target_indicator_map, by = "target_population") %>%
    unnest_longer(indicators) %>%
    filter(!is.na(indicators)) %>%
    rename(indicator_common_id = indicators,
           denominator_value = value) %>%
    select(all_of(geo_keys), denominator, source_indicator, target_population,
           indicator_common_id, denominator_value)

  # Join numerators with denominators and calculate coverage
  coverage_data <- numerators_data %>%
    rename(numerator = count) %>%
    left_join(denominator_expanded, by = c(geo_keys, "indicator_common_id")) %>%
    filter(!is.na(denominator_value), denominator_value > 0) %>%
    mutate(coverage = if_else(numerator == 0, NA_real_, numerator / denominator_value)) %>%
    filter(!is.na(coverage), !is.infinite(coverage))

  return(coverage_data)
}

# Part 6 - Compare coverage vs carried Survey (LONG format only)
# Uses a single selected chain for ALL target populations (one-chain approach)
compare_coverage_to_survey <- function(coverage_data, survey_expanded_df, selected_chain) {
  stopifnot(is.data.frame(coverage_data), is.data.frame(survey_expanded_df))
  need_long <- c("admin_area_1","year","indicator_common_id","reference_value")
  if (!all(need_long %in% names(survey_expanded_df))) {
    stop("survey_expanded_df must be LONG with columns: ",
         paste(need_long, collapse = ", "),
         " (admin_area_2 and admin_area_3 optional; defaults to 'NATIONAL').")
  }

  chain_prefix <- selected_chain$prefix
  chain_name <- selected_chain$chain

  # Determine which admin columns exist
  has_admin2_cov <- "admin_area_2" %in% names(coverage_data)
  has_admin2_sur <- "admin_area_2" %in% names(survey_expanded_df)
  has_admin3_cov <- "admin_area_3" %in% names(coverage_data)
  has_admin3_sur <- "admin_area_3" %in% names(survey_expanded_df)

  # Check if ISO code is available in both datasets (prefer for national comparisons)
  has_iso_cov <- "iso3_code" %in% names(coverage_data)
  has_iso_sur <- "iso3_code" %in% names(survey_expanded_df)
  is_national_data <- !has_admin2_cov || all(coverage_data$admin_area_2 == "NATIONAL", na.rm = TRUE)
  use_iso <- has_iso_cov && has_iso_sur && is_national_data

  # Add missing admin_area_2 only if neither dataset has admin_area_3
  if (!has_admin2_cov && !has_admin3_cov) coverage_data <- coverage_data %>% mutate(admin_area_2 = "NATIONAL")
  if (!has_admin2_sur && !has_admin3_sur) survey_expanded_df <- survey_expanded_df %>% mutate(admin_area_2 = "NATIONAL")

  # Refresh flags
  has_admin2_cov <- "admin_area_2" %in% names(coverage_data)
  has_admin2_sur <- "admin_area_2" %in% names(survey_expanded_df)

  # Build geo_keys dynamically - use ISO for national data when available
  if (use_iso) {
    geo_keys <- c("iso3_code")
  } else {
    geo_keys <- c("admin_area_1")
  }
  if (has_admin2_cov && has_admin2_sur) geo_keys <- c(geo_keys, "admin_area_2")
  if (has_admin3_cov && has_admin3_sur) geo_keys <- c(geo_keys, "admin_area_3")
  geo_keys <- c(geo_keys, "year")

  # Country-level grouping keys
  country_only_keys <- if (use_iso) "iso3_code" else "admin_area_1"

  # Types & keys
  coverage_data$year        <- as.integer(coverage_data$year)
  survey_expanded_df$year   <- as.integer(survey_expanded_df$year)

  # Filter coverage to selected chain only
  chain_coverage <- coverage_data %>%
    filter(startsWith(denominator, chain_prefix))

  if (nrow(chain_coverage) == 0) {
    warning("No coverage data found for chain '", chain_name, "' (prefix: ", chain_prefix, ")")
    return(list(coverage_comparison = data.frame(), denominator_mapping = data.frame()))
  }

  # Join with survey for diagnostics (squared_error) — NOT used for selection
  coverage_with_reference <- chain_coverage %>%
    left_join(
      survey_expanded_df %>%
        select(all_of(geo_keys), indicator_common_id, reference_value),
      by = c(geo_keys, "indicator_common_id")
    ) %>%
    mutate(
      squared_error = (coverage - reference_value)^2,
      rank = ifelse(!is.na((coverage - reference_value)^2), 1L, NA_integer_)
    )

  # Build denominator mapping: each indicator → the chain's denominator
  # BCG chain is national-only (not computed at subnational level)
  is_chain_national_only <- startsWith(chain_prefix, "dbcg_")

  denominator_mapping <- chain_coverage %>%
    distinct(indicator_common_id, target_population, denominator) %>%
    rename(best_denom = denominator) %>%
    mutate(
      second_best_denom = NA_character_,
      best_is_national_only = is_chain_national_only,
      second_is_national_only = NA
    )

  # Add country key
  if (use_iso) {
    country_key <- unique(coverage_data$iso3_code)[1]
    denominator_mapping <- denominator_mapping %>% mutate(iso3_code = country_key)
  } else {
    country_key <- unique(coverage_data$admin_area_1)[1]
    denominator_mapping <- denominator_mapping %>% mutate(admin_area_1 = country_key)
  }

  # Print selected denominators (grouped by target population)
  message(sprintf("  → Chain '%s' denominators applied to all indicators:", chain_name))
  denominator_mapping %>%
    distinct(target_population, best_denom) %>%
    arrange(target_population) %>%
    mutate(msg = sprintf("     - [%s] → %s", target_population, best_denom)) %>%
    pull(msg) %>%
    walk(message)

  return(list(
    coverage_comparison = coverage_with_reference,
    denominator_mapping = denominator_mapping
  ))
}

# Part 7 - Create combined coverage and survey result table
create_combined_results_table <- function(coverage_comparison, survey_raw_df, all_coverage_data = NULL) {

  # Get geographic keys based on what's available
  geo_keys <- c("admin_area_1", "year")
  if ("admin_area_2" %in% names(coverage_comparison)) geo_keys <- c(geo_keys, "admin_area_2")
  if ("admin_area_3" %in% names(coverage_comparison)) geo_keys <- c(geo_keys, "admin_area_3")

  # Step 1: Prepare ALL coverage results with original denominator names
  # Use all_coverage_data if provided (to include ALL denominators including UNWPP)
  # EXCLUDE reference-based denominators (per indicator)
  if (!is.null(all_coverage_data)) {
    coverage_all <- all_coverage_data %>%
      mutate(source_type = mapply(classify_source_type, denominator, indicator_common_id, SIMPLIFY = TRUE)) %>%
      filter(source_type != "reference_based") %>%
      select(
        all_of(geo_keys),
        indicator_common_id,
        denominator_best_or_survey = denominator,
        denominator_label,
        value = coverage
      )
  } else {
    # Fallback to using coverage_comparison data
    coverage_all <- coverage_comparison %>%
      select(
        all_of(geo_keys),
        indicator_common_id,
        denominator_best_or_survey = denominator,
        denominator_label,
        value = coverage,
        rank
      ) %>%
      select(-rank)
  }

  # Step 2: Create separate "best" entries (duplicate the rank=1 values)
  # Only create "best" entries where we actually have a rank (i.e., where survey comparison was possible)
  coverage_best <- coverage_comparison %>%
    filter(!is.na(rank), rank == 1) %>%
    mutate(denominator_best_or_survey = "best") %>%
    # Keep original denominator_label to show which denominator was selected as best
    select(
      all_of(geo_keys),
      indicator_common_id,
      denominator_best_or_survey,
      denominator_label,  # Keep original label
      value = coverage
    )

  # Step 3: Combine all coverage results (original denominators + best)
  coverage_results <- bind_rows(coverage_all, coverage_best)

  # Step 4: Prepare survey raw results
  # Ensure survey_raw_df has the same geographic structure as coverage
  if (!"admin_area_2" %in% names(survey_raw_df) && "admin_area_2" %in% geo_keys) {
    survey_raw_df <- survey_raw_df %>% mutate(admin_area_2 = "NATIONAL")
  }
  if (!"admin_area_3" %in% names(survey_raw_df) && "admin_area_3" %in% geo_keys) {
    survey_raw_df <- survey_raw_df %>% mutate(admin_area_3 = "NATIONAL")
  }

  # Get list of indicators that have coverage estimates
  coverage_indicators <- coverage_results %>%
    distinct(indicator_common_id) %>%
    pull(indicator_common_id)

  survey_results <- survey_raw_df %>%
    filter(!is.na(survey_value)) %>%  # Only actual survey observations
    filter(indicator_common_id %in% coverage_indicators) %>%  # Only indicators with coverage estimates
    mutate(
      denominator_best_or_survey = "survey",
      denominator_label = "Survey estimate"
    ) %>%
    select(
      all_of(geo_keys),
      indicator_common_id,
      denominator_best_or_survey,
      denominator_label,
      value = survey_value,
      any_of(c("source", "source_detail"))
    )

  # Step 5: Combine all results
  # Harmonize admin_area_1 so all rows use the same country name (from HMIS data)
  hmis_admin1 <- unique(coverage_results$admin_area_1)[1]
  if (!is.na(hmis_admin1)) {
    survey_results <- survey_results %>% mutate(admin_area_1 = hmis_admin1)
  }

  combined_results <- bind_rows(coverage_results, survey_results) %>%
    arrange(
      admin_area_1,
      if("admin_area_2" %in% names(.)) admin_area_2 else NULL,
      if("admin_area_3" %in% names(.)) admin_area_3 else NULL,
      indicator_common_id,
      year,
      denominator_best_or_survey
    )

  return(combined_results)
}

# ---- Helpers needed EARLY (moved up from the write-out section) ----

# Results 1: Numerators (HMIS annual counts)
make_numerators_long <- function(annual_hmis_df) {
  if (is.null(annual_hmis_df) || nrow(annual_hmis_df) == 0) return(NULL)
  annual_hmis_df %>%
    { if (!"admin_area_2" %in% names(.)) mutate(., admin_area_2 = "NATIONAL") else . } %>%
    pivot_longer(
      cols = starts_with("count"),
      names_to = "indicator_common_id",
      values_to = "count",
      names_pattern = "^count(.*)$"
    ) %>%
    select(any_of("iso3_code"), admin_area_1, admin_area_2, year, indicator_common_id, count) %>%
    arrange(admin_area_1, admin_area_2, year, indicator_common_id)
}

# Results 2: Denominators (from *_summary)
make_denominators_results <- function(summary_df) {
  if (is.null(summary_df) || nrow(summary_df) == 0) return(NULL)
  
  df <- summary_df
  if ("admin_area_3" %in% names(df) && !("admin_area_2" %in% names(df))) {
    df <- rename(df, admin_area_2 = admin_area_3)
  }
  if (!"admin_area_2" %in% names(df)) {
    df <- mutate(df, admin_area_2 = "NATIONAL")
  }
  
  df %>%
    mutate(
      source_indicator = str_replace(denominator_type, "^d([^_]+).*", "\\1"),
      target_population = str_replace(denominator_type, ".*_([^_]+)$", "\\1")
    ) %>%
    select(
      any_of("iso3_code"), admin_area_1, admin_area_2, year,
      denominator = denominator_type, source_indicator, target_population, value
    )
}

# Results 3: Survey RAW (long; DHS-preferred; keep source + detail)
make_survey_raw_long <- function(dhs_mics_raw_long, unwpp_raw_long = NULL) {
  norm <- function(df) {
    if (is.null(df) || !is.data.frame(df) || nrow(df) == 0) return(NULL)
    if (!"admin_area_2"  %in% names(df)) df$admin_area_2  <- "NATIONAL"
    if (!"source_detail" %in% names(df)) df$source_detail <- NA_character_
    if (!"source"        %in% names(df)) df$source        <- NA_character_
    if (!"survey_value"  %in% names(df)) df$survey_value  <- NA_real_
    
    df %>%
      mutate(
        admin_area_2 = if_else(is.na(admin_area_2) | admin_area_2 == "", "NATIONAL", admin_area_2),
        year = as.integer(year)
      ) %>%
      select(admin_area_1, admin_area_2, year,
             indicator_common_id, source, source_detail, survey_value) %>%
      distinct()
  }
  
  parts <- list(norm(dhs_mics_raw_long), norm(unwpp_raw_long))
  parts <- Filter(function(x) !is.null(x) && nrow(x) > 0, parts)
  if (length(parts) == 0) return(NULL)

  result <- bind_rows(parts)

  # Always duplicate pnc1 → pnc1_mother (survey only has pnc1)
  if ("pnc1" %in% result$indicator_common_id) {
    pnc_rows <- result %>% filter(indicator_common_id == "pnc1") %>% mutate(indicator_common_id = "pnc1_mother")
    result <- bind_rows(result, pnc_rows)
  }

  result %>% arrange(admin_area_1, admin_area_2, year, indicator_common_id)
}

# Results 4: Survey REFERENCE (from carried values)
make_survey_reference_long <- function(survey_expanded_df) {
  if (is.null(survey_expanded_df) || nrow(survey_expanded_df) == 0) return(NULL)

  # Determine which admin columns exist
  has_admin2 <- "admin_area_2" %in% names(survey_expanded_df)
  has_admin3 <- "admin_area_3" %in% names(survey_expanded_df)
  has_iso <- "iso3_code" %in% names(survey_expanded_df)

  # Build the list of admin columns to select
  # Include iso3_code if available (for robust national comparisons)
  admin_cols <- c("admin_area_1")
  if (has_iso) {
    admin_cols <- c(admin_cols, "iso3_code")
  }
  if (has_admin2) {
    admin_cols <- c(admin_cols, "admin_area_2")
  } else if (!has_admin2 && !has_admin3) {
    # Only add default admin_area_2 if neither admin2 nor admin3 exist
    survey_expanded_df$admin_area_2 <- "NATIONAL"
    admin_cols <- c(admin_cols, "admin_area_2")
  }
  if (has_admin3) {
    admin_cols <- c(admin_cols, "admin_area_3")
  }

  carry_cols <- grep("carry$", names(survey_expanded_df), value = TRUE)
  if (length(carry_cols) == 0) return(NULL)

  result <- survey_expanded_df |>
    select(all_of(admin_cols), year, all_of(carry_cols)) |>
    pivot_longer(
      cols          = all_of(carry_cols),
      names_to      = "indicator_common_id",
      names_pattern = "(.*)carry$",
      values_to     = "reference_value"
    ) |>
    filter(!is.na(reference_value)) |>
    mutate(
      year = as.integer(year)
    )

  # If delivery exists but sba doesn't, duplicate delivery rows as sba
  has_delivery <- "delivery" %in% unique(result$indicator_common_id)
  has_sba <- "sba" %in% unique(result$indicator_common_id)
  has_pnc1 <- "pnc1" %in% unique(result$indicator_common_id)
  has_pnc1_mother <- "pnc1_mother" %in% unique(result$indicator_common_id)

  if (has_delivery && !has_sba) {
    sba_refs <- result |>
      filter(indicator_common_id == "delivery") |>
      mutate(indicator_common_id = "sba")

    result <- bind_rows(result, sba_refs)
  }

  # Always duplicate pnc1 → pnc1_mother (survey only has pnc1)
  if (has_pnc1) {
    pnc_refs <- result |>
      filter(indicator_common_id == "pnc1") |>
      mutate(indicator_common_id = "pnc1_mother")
    result <- bind_rows(result, pnc_refs)
  }

  # Build arrange expression based on available columns
  arrange_cols <- c("admin_area_1")
  if ("admin_area_2" %in% names(result)) arrange_cols <- c(arrange_cols, "admin_area_2")
  if ("admin_area_3" %in% names(result)) arrange_cols <- c(arrange_cols, "admin_area_3")
  arrange_cols <- c(arrange_cols, "year", "indicator_common_id")

  result |>
    arrange(across(all_of(arrange_cols)))
}


# ============================== EXECUTION FLOW   ==============================

message("✓ Step 3/7: Processing national data")

# --- NATIONAL PREP ---
message("  → Processing HMIS adjusted volume data...")
hmis_processed <- process_hmis_adjusted_volume(adjusted_volume_data)

message("  → Processing survey data...")
survey_processed_national <- process_survey_data(
  survey_data    = survey_data_national,
  hmis_countries = hmis_processed$hmis_countries,
  hmis_iso3      = hmis_processed$hmis_iso3
)

message("  → Processing population data...")
national_population_processed <- process_national_population_data(
  population_data = population_estimates_only,
  hmis_countries  = hmis_processed$hmis_countries,
  hmis_iso3       = hmis_processed$hmis_iso3
)

message("  → Calculating denominators...")
denominators_national <- calculate_denominators(
  hmis_data      = hmis_processed$annual_hmis,
  survey_data    = survey_processed_national$carried,
  population_data= national_population_processed$wide
)

message("  → Creating denominator summary...")
national_summary <- create_denominator_summary(denominators_national, "NATIONAL")

# --- NATIONAL RESULTS BUILDERS (must come after summary) ---
numerators_national_long <- make_numerators_long(hmis_processed$annual_hmis)

denominators_national_results <- if (exists("national_summary")) make_denominators_results(national_summary) else NULL
if (!is.null(denominators_national_results)) {
  denominators_national_results <- add_denominator_labels(denominators_national_results, "denominator")
}

survey_raw_national_long <- make_survey_raw_long(
  dhs_mics_raw_long = survey_processed_national$raw_long,
  unwpp_raw_long    = national_population_processed$raw_long
)

survey_reference_national <- if (exists("survey_processed_national") &&
                                 is.list(survey_processed_national) &&
                                 "carried" %in% names(survey_processed_national) &&
                                 is.data.frame(survey_processed_national$carried) &&
                                 nrow(survey_processed_national$carried) > 0) {
  make_survey_reference_long(survey_processed_national$carried)
} else NULL

# --- NATIONAL COVERAGE / COMPARISON / COMBINED ---
if (!is.null(denominators_national_results) &&
    !is.null(numerators_national_long) &&
    !is.null(survey_reference_national)) {

  message("  → Calculating national coverage estimates...")
  national_coverage <- calculate_coverage(denominators_national_results, numerators_national_long)
  national_coverage <- add_denominator_labels(national_coverage)

  message("  → Selecting denominator chain...")
  selected_chain <- select_best_chain(denominators_national, DENOMINATOR_CHAIN)

  message("  → Comparing coverage to survey data...")
  national_comparison_result <- compare_coverage_to_survey(national_coverage, survey_reference_national, selected_chain)
  national_comparison <- national_comparison_result$coverage_comparison
  national_denominator_mapping <- national_comparison_result$denominator_mapping

  message("  → Creating combined results table...")
  national_combined_results <- create_combined_results_table(
    coverage_comparison = national_comparison,
    survey_raw_df       = survey_raw_national_long,
    all_coverage_data   = national_coverage
  )

  # Create denominator summary with geographic levels (one-chain approach)
  # All indicators use the same chain; subnational = same as national unless chain is national-only
  message("  → Creating denominator summary by geographic level...")
  best_denom_summary <- national_denominator_mapping %>%
    mutate(
      denominator_national = if_else(is.na(best_denom), "NOT_AVAILABLE", best_denom),
      # Subnational: same chain unless it's national-only (e.g. bcg)
      denominator_admin2 = if_else(best_is_national_only, "NOT_AVAILABLE", best_denom),
      denominator_admin3 = if_else(best_is_national_only, "NOT_AVAILABLE", best_denom)
    ) %>%
    mutate(
      denominator_national = replace_na(denominator_national, "NOT_AVAILABLE"),
      denominator_admin2 = replace_na(denominator_admin2, "NOT_AVAILABLE"),
      denominator_admin3 = replace_na(denominator_admin3, "NOT_AVAILABLE")
    ) %>%
    select(indicator_common_id, denominator_national, denominator_admin2, denominator_admin3) %>%
    arrange(indicator_common_id)
}


message("✓ Step 3/7 completed: National analysis finished!")
message("================================================================================")

# ============================ SUBNATIONAL FLOW (IF APPLICABLE) ============================

if (!is.null(hmis_data_subnational) && !is.null(survey_data_subnational)) {

  message("✓ Step 4/7: Processing subnational data")

  # Ensure admin_area_1 is consistent
  message("  → Ensuring data consistency...")
  admin_area_1_value <- adjusted_volume_data %>% distinct(admin_area_1) %>% pull(admin_area_1)
  hmis_data_subnational <- hmis_data_subnational %>% mutate(admin_area_1 = admin_area_1_value)

  # ----------------- ADMIN_AREA_2 -----------------
  if (ANALYSIS_LEVEL %in% c("NATIONAL_PLUS_AA2", "NATIONAL_PLUS_AA2_AA3")) {

    message("  → Processing admin area 2 data...")

    hmis_admin2 <- hmis_data_subnational %>% select(-admin_area_3)

    hmis_processed_admin2   <- process_hmis_adjusted_volume(hmis_admin2, SELECTED_COUNT_VARIABLE)

    # SAFEGUARD: Wrap survey processing in tryCatch to handle mismatched data
    survey_processed_admin2 <- tryCatch({
      process_survey_data(survey_data_subnational, hmis_processed_admin2$hmis_countries,
                          national_reference = survey_processed_national$carried)
    }, error = function(e) {
      message("================================================================================")
      warning("⚠️  MISMATCH DETECTED: admin_area_2 names differ between HMIS and survey data")
      warning("   Error: ", e$message)
      message("   → Skipping admin_area_2 analysis. Continuing with national only.")
      message("   → Please verify ISO3 code matches your HMIS data")
      message("================================================================================")
      NULL
    })

    # SAFEGUARD: Check if survey data is usable
    if (is.null(survey_processed_admin2) ||
        is.null(survey_processed_admin2$carried) ||
        nrow(survey_processed_admin2$carried) == 0 ||
        !"admin_area_2" %in% names(survey_processed_admin2$carried)) {
      if (!is.null(survey_processed_admin2)) {
        warning("SAFEGUARD: Survey data for admin_area_2 is empty or malformed.")
      }
      message("SAFEGUARD: Skipping admin_area_2 analysis. Continuing with national only.")
      ANALYSIS_LEVEL <- "NATIONAL_ONLY"
      matching_regions_admin2 <- character(0)
      # Ensure admin2 results are NULL
      denominators_admin2_results <- NULL
      admin2_combined_results <- NULL
    } else {
      # SAFEGUARD: Validate admin_area_2 matching between HMIS and survey data
      hmis_admin2_regions <- hmis_processed_admin2$annual_hmis %>%
        distinct(admin_area_2) %>%
        pull(admin_area_2)

      survey_admin2_regions <- survey_processed_admin2$carried %>%
        distinct(admin_area_2) %>%
        pull(admin_area_2)

      matching_regions_admin2 <- intersect(hmis_admin2_regions, survey_admin2_regions)
    }

    if (length(matching_regions_admin2) == 0 && ANALYSIS_LEVEL != "NATIONAL_ONLY") {
      message("================================================================================")
      warning("⚠️  MISMATCH: HMIS admin_area_2 does not match survey admin_area_2")

      # EDGE CASE DETECTION: Check if HMIS admin_area_3 matches survey admin_area_2
      USE_ADMIN3_AS_ADMIN2 <- FALSE
      if ("admin_area_3" %in% names(hmis_data_subnational)) {
        hmis_admin3_values <- hmis_data_subnational %>%
          filter(!is.na(admin_area_3) & admin_area_3 != "" & admin_area_3 != "ZONE") %>%
          distinct(admin_area_3) %>%
          pull(admin_area_3)

        if (length(hmis_admin3_values) > 0 && exists("survey_admin2_regions")) {
          matching_admin3_to_admin2 <- intersect(hmis_admin3_values, survey_admin2_regions)

          if (length(matching_admin3_to_admin2) > 0) {
            message("   ✓ DETECTED: HMIS admin_area_3 matches survey admin_area_2 (",
                    length(matching_admin3_to_admin2), "/", length(hmis_admin3_values), " regions)")
            message("   → Skipping admin_area_2 analysis")
            message("   → Will analyze at admin_area_3 level instead")
            USE_ADMIN3_AS_ADMIN2 <- TRUE
          }
        }
      }

      if (!USE_ADMIN3_AS_ADMIN2) {
        if (exists("hmis_admin2_regions") && exists("survey_admin2_regions")) {
          message("   HMIS regions (", length(hmis_admin2_regions), "): ", paste(head(hmis_admin2_regions, 5), collapse = ", "),
                  if(length(hmis_admin2_regions) > 5) "..." else "")
          message("   Survey regions (", length(survey_admin2_regions), "): ", paste(head(survey_admin2_regions, 5), collapse = ", "),
                  if(length(survey_admin2_regions) > 5) "..." else "")
        }
        message("   → Falling back to NATIONAL_ONLY analysis")
        message("   → Please verify ISO3 code and admin area names")
        ANALYSIS_LEVEL <- "NATIONAL_ONLY"
        denominators_admin2_results <- NULL
        admin2_combined_results <- NULL
      } else {
        # Ensure we proceed to admin_area_3 section
        if (ANALYSIS_LEVEL == "NATIONAL_PLUS_AA2") {
          ANALYSIS_LEVEL <- "NATIONAL_PLUS_AA2_AA3"
        }
        denominators_admin2_results <- NULL
        admin2_combined_results <- NULL
      }
      message("================================================================================")
    } else if (length(matching_regions_admin2) > 0) {
      message("✓ admin_area_2 validation passed: ", length(matching_regions_admin2), "/", length(hmis_admin2_regions), " regions match")

      # ONLY proceed if validation passed
      denominators_admin2 <- calculate_denominators(
        hmis_data   = hmis_processed_admin2$annual_hmis,
        survey_data = survey_processed_admin2$carried
      )

      admin2_summary <- create_denominator_summary(denominators_admin2, "ADMIN2")

      # --- ADMIN2 RESULTS BUILDERS ---
      numerators_admin2_long <- make_numerators_long(hmis_processed_admin2$annual_hmis)

      denominators_admin2_results <- if (exists("admin2_summary")) make_denominators_results(admin2_summary) else NULL
      if (!is.null(denominators_admin2_results)) {
        denominators_admin2_results <- add_denominator_labels(denominators_admin2_results, "denominator")
        # Filter to only include actual province-level rows (exclude district names)
        denominators_admin2_results <- denominators_admin2_results %>%
          filter(admin_area_2 %in% hmis_admin2_regions)
      }

      survey_raw_admin2_long <- make_survey_raw_long(
        dhs_mics_raw_long = survey_processed_admin2$raw_long,
        unwpp_raw_long    = NULL
      )

      survey_reference_admin2 <- if (exists("survey_processed_admin2") &&
                                     is.list(survey_processed_admin2) &&
                                     "carried" %in% names(survey_processed_admin2) &&
                                     is.data.frame(survey_processed_admin2$carried) &&
                                     nrow(survey_processed_admin2$carried) > 0) {
        make_survey_reference_long(survey_processed_admin2$carried)
      } else NULL

      # --- ADMIN2 COVERAGE / COMPARISON / COMBINED ---
      if (!is.null(denominators_admin2_results) &&
          !is.null(numerators_admin2_long) &&
          !is.null(survey_reference_admin2)) {

        message("  → Calculating admin area 2 coverage estimates...")
        admin2_coverage <- calculate_coverage(denominators_admin2_results, numerators_admin2_long)
        admin2_coverage <- add_denominator_labels(admin2_coverage)

        message("  → Applying chain '", selected_chain$chain, "' to admin area 2...")

        # Filter to selected chain's denominators
        admin2_coverage_temp <- admin2_coverage %>%
          inner_join(
            national_denominator_mapping %>%
              filter(!best_is_national_only) %>%
              select(indicator_common_id, best_denom),
            by = "indicator_common_id"
          ) %>%
          filter(denominator == best_denom) %>%
          select(-best_denom)

        gc(verbose = FALSE)

        # Join with survey reference for diagnostics
        survey_ref_subset <- survey_reference_admin2 %>%
          select(admin_area_1, admin_area_2, year, indicator_common_id, reference_value)

        admin2_coverage_filtered <- admin2_coverage_temp %>%
          left_join(survey_ref_subset, by = c("admin_area_1", "admin_area_2", "year", "indicator_common_id")) %>%
          mutate(
            squared_error = if_else(!is.na(reference_value), (coverage - reference_value)^2, NA_real_),
            rank = 1
          )

        rm(admin2_coverage_temp, survey_ref_subset)
        gc(verbose = FALSE)

        message("  → Chain '", selected_chain$chain, "' applied to admin_area_2")
        if (any(national_denominator_mapping$best_is_national_only)) {
          skipped <- national_denominator_mapping %>%
            filter(best_is_national_only) %>%
            pull(indicator_common_id) %>%
            unique()
          message("   Note: ", length(skipped), " indicators skipped (chain is national-only): ",
                  paste(skipped, collapse = ", "))
        }

        message("  → Creating admin area 2 combined results table...")
        admin2_combined_results <- create_combined_results_table(
          coverage_comparison = admin2_coverage_filtered,
          survey_raw_df       = survey_raw_admin2_long,
          all_coverage_data   = admin2_coverage
        )

        # Filter to only include actual province-level rows (exclude district names)
        admin2_combined_results <- admin2_combined_results %>%
          filter(admin_area_2 %in% hmis_admin2_regions)
      }
    }
  }

  # ----------------- ADMIN_AREA_3 -----------------
  if (ANALYSIS_LEVEL == "NATIONAL_PLUS_AA2_AA3" && "admin_area_3" %in% names(hmis_data_subnational)) {

    message("  → Processing admin area 3 data...")

    # Extract admin_area_2/3 mapping from HMIS before transformation
    admin23_mapping <- hmis_data_subnational %>%
      filter(!is.na(admin_area_3) & admin_area_3 != "" & admin_area_3 != "ZONE") %>%
      select(admin_area_2, admin_area_3) %>%
      distinct()

    hmis_admin3 <- hmis_data_subnational %>%
      filter(!is.na(admin_area_3) & admin_area_3 != "" & admin_area_3 != "ZONE") %>%
      rename(admin_area_3_temp = admin_area_3) %>%
      select(-admin_area_2) %>%
      rename(admin_area_2 = admin_area_3_temp)

    if (nrow(hmis_admin3) > 0) {
      hmis_processed_admin3   <- process_hmis_adjusted_volume(hmis_admin3, SELECTED_COUNT_VARIABLE)

      # SAFEGUARD: Wrap survey processing in tryCatch to handle mismatched data
      survey_processed_admin3 <- tryCatch({
        process_survey_data(survey_data_subnational, hmis_processed_admin3$hmis_countries,
                            national_reference = survey_processed_national$carried)
      }, error = function(e) {
        message("================================================================================")
        warning("⚠️  MISMATCH DETECTED: admin_area_3 names differ between HMIS and survey data")
        warning("   Error: ", e$message)
        message("   → Skipping admin_area_3 analysis.")
        message("   → Please verify ISO3 code matches your HMIS data")
        message("================================================================================")
        NULL
      })

      # SAFEGUARD: Check if survey data is usable
      if (is.null(survey_processed_admin3) ||
          is.null(survey_processed_admin3$carried) ||
          nrow(survey_processed_admin3$carried) == 0 ||
          !"admin_area_2" %in% names(survey_processed_admin3$carried)) {
        if (!is.null(survey_processed_admin3)) {
          warning("SAFEGUARD: Survey data for admin_area_3 is empty or malformed.")
        }
        message("SAFEGUARD: Skipping admin_area_3 analysis.")
        matching_regions_admin3 <- character(0)
        # Ensure admin3 results are NULL
        denominators_admin3_results <- NULL
        admin3_combined_results <- NULL
      } else {
        # SAFEGUARD: Validate admin_area_3 matching between HMIS and survey data
        # Note: HMIS admin_area_3 is renamed to admin_area_2 for processing
        hmis_admin3_regions <- hmis_processed_admin3$annual_hmis %>%
          distinct(admin_area_2) %>%
          pull(admin_area_2)

        survey_admin3_regions <- survey_processed_admin3$carried %>%
          distinct(admin_area_2) %>%
          pull(admin_area_2)

        matching_regions_admin3 <- intersect(hmis_admin3_regions, survey_admin3_regions)
      }

      if (length(matching_regions_admin3) == 0) {
        message("================================================================================")
        warning("⚠️  MISMATCH DETECTED: No matching admin_area_3 names between HMIS and survey data")
        if (exists("hmis_admin3_regions") && exists("survey_admin3_regions")) {
          message("   HMIS admin3 regions (", length(hmis_admin3_regions), "): ", paste(head(hmis_admin3_regions, 5), collapse = ", "),
                  if(length(hmis_admin3_regions) > 5) "..." else "")
          message("   Survey regions (", length(survey_admin3_regions), "): ", paste(head(survey_admin3_regions, 5), collapse = ", "),
                  if(length(survey_admin3_regions) > 5) "..." else "")
        }
        message("   → Skipping admin_area_3 analysis.")
        message("   → Please verify ISO3 code matches your HMIS data")
        message("================================================================================")
        # Ensure admin3 results are NULL
        denominators_admin3_results <- NULL
        admin3_combined_results <- NULL
      } else if (length(matching_regions_admin3) > 0) {
        message("✓ admin_area_3 validation passed: ", length(matching_regions_admin3), "/", length(hmis_admin3_regions), " regions match")

        # ONLY proceed if validation passed
        denominators_admin3 <- calculate_denominators(
          hmis_data   = hmis_processed_admin3$annual_hmis,
          survey_data = survey_processed_admin3$carried
        )

        admin3_summary <- create_denominator_summary(denominators_admin3, "ADMIN3")

        # --- ADMIN3 RESULTS BUILDERS ---
        numerators_admin3_long <- make_numerators_long(hmis_processed_admin3$annual_hmis) %>%
          rename(admin_area_3 = admin_area_2)

        denominators_admin3_results <- if (exists("admin3_summary")) make_denominators_results(admin3_summary) else NULL
        if (!is.null(denominators_admin3_results)) {
          denominators_admin3_results <- add_denominator_labels(denominators_admin3_results, "denominator") %>%
            rename(admin_area_3 = admin_area_2)
        }

        survey_raw_admin3_long <- make_survey_raw_long(
          dhs_mics_raw_long = survey_processed_admin3$raw_long,
          unwpp_raw_long    = NULL
        )

        # Expand survey raw data to admin_area_3 level
        # EDGE CASE: If USE_ADMIN3_AS_ADMIN2 is TRUE, survey is already at district level - just rename
        # NORMAL: Use mapping to expand zone-level survey to districts
        if (!is.null(survey_raw_admin3_long) && "admin_area_2" %in% names(survey_raw_admin3_long)) {
          if (exists("USE_ADMIN3_AS_ADMIN2") && USE_ADMIN3_AS_ADMIN2) {
            # Afghanistan edge case: survey already processed at district level
            survey_raw_admin3_long <- survey_raw_admin3_long %>%
              rename(admin_area_3 = admin_area_2)
          } else if (exists("admin23_mapping") && !is.null(admin23_mapping) && nrow(admin23_mapping) > 0) {
            # Normal case: expand zone survey to districts
            survey_raw_admin3_long <- survey_raw_admin3_long %>%
              left_join(admin23_mapping, by = "admin_area_2", relationship = "many-to-many")
          }
        }

        survey_reference_admin3 <- if (exists("survey_processed_admin3") &&
                                       is.list(survey_processed_admin3) &&
                                       "carried" %in% names(survey_processed_admin3) &&
                                       is.data.frame(survey_processed_admin3$carried) &&
                                       nrow(survey_processed_admin3$carried) > 0) {
          make_survey_reference_long(survey_processed_admin3$carried)
        } else NULL

        # Expand survey reference to admin_area_3 level
        # EDGE CASE: If USE_ADMIN3_AS_ADMIN2 is TRUE, survey is already at district level - just rename
        # NORMAL: Use mapping to expand zone-level survey to districts
        if (!is.null(survey_reference_admin3) && "admin_area_2" %in% names(survey_reference_admin3)) {
          if (exists("USE_ADMIN3_AS_ADMIN2") && USE_ADMIN3_AS_ADMIN2) {
            # Afghanistan edge case: survey already processed at district level
            survey_reference_admin3 <- survey_reference_admin3 %>%
              rename(admin_area_3 = admin_area_2)
          } else if (exists("admin23_mapping") && !is.null(admin23_mapping) && nrow(admin23_mapping) > 0) {
            # Normal case: expand zone survey to districts
            survey_reference_admin3 <- survey_reference_admin3 %>%
              left_join(admin23_mapping, by = "admin_area_2", relationship = "many-to-many")
          }
        }

        # Apply admin_area_2/3 mapping (from HMIS) to results
        if (exists("admin23_mapping") && !is.null(admin23_mapping) && nrow(admin23_mapping) > 0) {
          if (!is.null(numerators_admin3_long)) {
            numerators_admin3_long <- numerators_admin3_long %>%
              left_join(admin23_mapping, by = "admin_area_3")
          }
          if (!is.null(denominators_admin3_results)) {
            denominators_admin3_results <- denominators_admin3_results %>%
              left_join(admin23_mapping, by = "admin_area_3")
          }
        }

        # --- ADMIN3 COVERAGE / COMPARISON / COMBINED ---
        if (!is.null(denominators_admin3_results) &&
            !is.null(numerators_admin3_long) &&
            !is.null(survey_reference_admin3)) {

          message("  → Calculating admin area 3 coverage estimates...")
          admin3_coverage <- calculate_coverage(denominators_admin3_results, numerators_admin3_long)
          admin3_coverage <- add_denominator_labels(admin3_coverage)

          message("  → Applying chain '", selected_chain$chain, "' to admin area 3...")

          # Filter to selected chain's denominators
          admin3_coverage_temp <- admin3_coverage %>%
            inner_join(
              national_denominator_mapping %>%
                filter(!best_is_national_only) %>%
                select(indicator_common_id, best_denom),
              by = "indicator_common_id"
            ) %>%
            filter(denominator == best_denom) %>%
            select(-best_denom)

          gc(verbose = FALSE)

          # Join with survey reference for diagnostics
          survey_ref_subset <- survey_reference_admin3 %>%
            select(admin_area_1, admin_area_3, year, indicator_common_id, reference_value)

          admin3_coverage_filtered <- admin3_coverage_temp %>%
            left_join(survey_ref_subset, by = c("admin_area_1", "admin_area_3", "year", "indicator_common_id")) %>%
            mutate(
              squared_error = if_else(!is.na(reference_value), (coverage - reference_value)^2, NA_real_),
              rank = 1
            )

          rm(admin3_coverage_temp, survey_ref_subset)
          gc(verbose = FALSE)

          message("  → Chain '", selected_chain$chain, "' applied to admin_area_3")

          message("  → Creating admin area 3 combined results table...")
          admin3_combined_results <- create_combined_results_table(
            coverage_comparison = admin3_coverage_filtered,
            survey_raw_df       = survey_raw_admin3_long,
            all_coverage_data   = admin3_coverage
          )
        }
      }
    }
  }


  message("✓ Step 4/7 completed: Subnational analysis finished!")

} else {
  message("✓ Step 4/7 completed: No subnational analysis (national only)!")
}
message("================================================================================")

message("✓ Step 5/7: Data processing completed! Beginning output generation...")
message("================================================================================")

message("✓ Step 6/7: Saving coverage analysis results")

message("  → Saving denominators results...")
# National
if (exists("denominators_national_results") && is.data.frame(denominators_national_results) && nrow(denominators_national_results) > 0) {
  # Remove admin_area_2 and denominator_label, add prefixes to indicator values
  denominators_national_results %>%
    mutate(
      source_indicator = paste0("source_", source_indicator),
      target_population = paste0("target_", target_population)
    ) %>%
    select(-admin_area_2, -denominator_label, -any_of("iso3_code")) %>%
    write.csv("M5_denominators_national.csv", row.names = FALSE, fileEncoding = "UTF-8")
  message("✓ Saved denominators_national: ", nrow(denominators_national_results), " rows")
} else {
  dummy <- data.frame(
    admin_area_1      = character(),
    year              = integer(),
    denominator       = character(),
    source_indicator  = character(),
    target_population = character(),
    value             = double()
  )
  write.csv(dummy, "M5_denominators_national.csv", row.names = FALSE, fileEncoding = "UTF-8")
  message("✓ No denominators_national results - saved empty file")
}

# Admin2
if (exists("denominators_admin2_results") && is.data.frame(denominators_admin2_results) && nrow(denominators_admin2_results) > 0) {
  # Remove denominator_label, add prefixes to indicator values
  denominators_admin2_results %>%
    mutate(
      source_indicator = paste0("source_", source_indicator),
      target_population = paste0("target_", target_population)
    ) %>%
    select(-denominator_label, -any_of("iso3_code")) %>%
    write.csv("M5_denominators_admin2.csv", row.names = FALSE, fileEncoding = "UTF-8")
  message("✓ Saved denominators_admin2: ", nrow(denominators_admin2_results), " rows")
} else {
  dummy <- data.frame(
    admin_area_1      = character(),
    admin_area_2      = character(),
    year              = integer(),
    denominator       = character(),
    source_indicator  = character(),
    target_population = character(),
    value             = double()
  )
  write.csv(dummy, "M5_denominators_admin2.csv", row.names = FALSE, fileEncoding = "UTF-8")
  message("✓ No denominators_admin2 results - saved empty file")
}

# Admin3
if (exists("denominators_admin3_results") &&
    is.data.frame(denominators_admin3_results) &&
    nrow(denominators_admin3_results) > 0) {

  df <- denominators_admin3_results %>%
    mutate(
      source_indicator = paste0("source_", source_indicator),
      target_population = paste0("target_", target_population)
    ) %>%
    select(-any_of(c("denominator_label", "admin_area_2", "iso3_code")))

  write.csv(df, "M5_denominators_admin3.csv",
            row.names = FALSE, fileEncoding = "UTF-8")
  message("✓ Saved denominators_admin3: ", nrow(df), " rows")

} else {
  dummy <- data.frame(
    admin_area_1      = character(),
    admin_area_3      = character(),
    year              = integer(),
    denominator       = character(),
    source_indicator  = character(),
    target_population = character(),
    value             = double()
  )
  write.csv(dummy, "M5_denominators_admin3.csv",
            row.names = FALSE, fileEncoding = "UTF-8")
  message("✓ No denominators_admin3 results - saved empty file")
}

# Combined Coverage and Survey Results

message("  → Saving combined coverage and survey results...")
# ---------------- NATIONAL ------------------
if (exists("national_combined_results") && is.data.frame(national_combined_results) && nrow(national_combined_results) > 0) {
  # Remove admin_area_2 for national results
  if ("admin_area_2" %in% names(national_combined_results)) {
    national_combined_results <- national_combined_results %>% select(-admin_area_2)
  }
  # Remove denominator_label if present
  if ("denominator_label" %in% names(national_combined_results)) {
    national_combined_results <- national_combined_results %>% select(-denominator_label)
  }
  national_combined_results <- national_combined_results %>% select(-any_of(c("iso3_code", "source", "source_detail")))
  write.csv(national_combined_results, "M5_combined_results_national.csv", row.names = FALSE, fileEncoding = "UTF-8")
  message("✓ Saved combined_results_national: ", nrow(national_combined_results), " rows")
} else {
  dummy <- data.frame(
    admin_area_1 = character(),
    year = integer(),
    indicator_common_id = character(),
    denominator_best_or_survey = character(),
    value = double(),
    stringsAsFactors = FALSE
  )
  write.csv(dummy, "M5_combined_results_national.csv", row.names = FALSE, fileEncoding = "UTF-8")
  message("✓ No combined_results_national results - saved empty file")
}

# ---------------- ADMIN2 ----------------
if (exists("admin2_combined_results") && is.data.frame(admin2_combined_results) && nrow(admin2_combined_results) > 0) {
  if ("denominator_label" %in% names(admin2_combined_results)) {
    admin2_combined_results <- admin2_combined_results %>% select(-denominator_label)
  }
  admin2_combined_results <- admin2_combined_results %>% select(-any_of(c("iso3_code", "source", "source_detail")))
  write.csv(admin2_combined_results, "M5_combined_results_admin2.csv", row.names = FALSE, fileEncoding = "UTF-8")
  message("✓ Saved combined_results_admin2: ", nrow(admin2_combined_results), " rows")
} else {
  dummy <- data.frame(
    admin_area_1 = character(),
    admin_area_2 = character(),
    year = integer(),
    indicator_common_id = character(),
    denominator_best_or_survey = character(),
    value = double(),
    stringsAsFactors = FALSE
  )
  write.csv(dummy, "M5_combined_results_admin2.csv", row.names = FALSE, fileEncoding = "UTF-8")
  message("✓ No combined_results_admin2 results - saved empty file")
}

# ---------------- ADMIN3 ----------------
if (exists("admin3_combined_results") && is.data.frame(admin3_combined_results) && nrow(admin3_combined_results) > 0) {
  if ("admin_area_3" %in% names(admin3_combined_results)) {
    admin3_combined_results <- admin3_combined_results %>%
      filter(admin_area_3 != "NATIONAL")
  }
  admin3_combined_results <- admin3_combined_results %>%
    select(-any_of(c("denominator_label", "admin_area_2", "iso3_code", "source", "source_detail")))
  write.csv(admin3_combined_results, "M5_combined_results_admin3.csv", row.names = FALSE, fileEncoding = "UTF-8")
  message("✓ Saved combined_results_admin3: ", nrow(admin3_combined_results), " rows")
} else {
  dummy <- data.frame(
    admin_area_1 = character(),
    admin_area_3 = character(),
    year = integer(),
    indicator_common_id = character(),
    denominator_best_or_survey = character(),
    value = double(),
    stringsAsFactors = FALSE
  )
  write.csv(dummy, "M5_combined_results_admin3.csv", row.names = FALSE, fileEncoding = "UTF-8")
  message("✓ No combined_results_admin3 results - saved empty file")
}

# Export denominator summary
if (exists("best_denom_summary") && is.data.frame(best_denom_summary) && nrow(best_denom_summary) > 0) {
  write.csv(best_denom_summary %>% select(-any_of("iso3_code")), "M5_selected_denominator_per_indicator.csv", row.names = FALSE, fileEncoding = "UTF-8")
  message("✓ Saved denominator summary: M5_selected_denominator_per_indicator.csv")
} else {
  dummy <- data.frame(
    indicator_common_id = character(),
    denominator_national = character(),
    denominator_admin2 = character(),
    denominator_admin3 = character(),
    stringsAsFactors = FALSE
  )
  write.csv(dummy, "M5_selected_denominator_per_indicator.csv", row.names = FALSE, fileEncoding = "UTF-8")
  message("✓ No denominator summary - saved empty file")
}

message("✓ Step 6/7 completed: All results saved successfully!")
message("================================================================================")

message("✓ Step 7/7: COVERAGE ESTIMATION ANALYSIS COMPLETE!")
message("================================================================================")
message("All output files have been generated and saved.")
message("================================================================================")

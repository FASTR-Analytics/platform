COUNTRY_ISO3 <- "ZMB"

SELECTED_COUNT_VARIABLE <- "count_final_both"  # Options: "count_final_none", "count_final_outlier", "count_final_completeness", "count_final_both"


PREGNANCY_LOSS_RATE <- 0.03 
TWIN_RATE <- 0.015       
STILLBIRTH_RATE <- 0.02
P1_NMR <- 0.039      #Default = 0.03
P2_PNMR <- 0.028
INFANT_MORTALITY_RATE <- 0.063  #Default = 0.05

UNDER5_MORTALITY_RATE <- 0.103

ANALYSIS_LEVEL <- "NATIONAL_PLUS_AA2"      # Options: "NATIONAL_ONLY", "NATIONAL_PLUS_AA2", "NATIONAL_PLUS_AA2_AA3"

DENOMINATOR_CHAIN <- "auto"  # Options: "auto", "anc1", "delivery", "bcg", "penta1"

#-------------------------------------------------------------------------------------------------------------
# CB - R code FASTR PROJECT
# Last edit: 2026 Mar 25
# Module: COVERAGE ESTIMATES
#
# ------------------------------ Load Required Libraries -----------------------------------------------------
library(dplyr)
library(tidyr)
library(zoo)
library(stringr)
library(purrr)

# ------------------------------ Define File Paths -----------------------------
# Use local files for testing (comment out GitHub URLs when testing local changes)
PROJECT_DATA_COVERAGE <- "https://raw.githubusercontent.com/FASTR-Analytics/modules/refs/heads/main/survey_data_unified.csv"
PROJECT_DATA_POPULATION <- "https://raw.githubusercontent.com/FASTR-Analytics/modules/refs/heads/main/population_estimates_only.csv"

CURRENT_YEAR <- as.numeric(format(Sys.Date(), "%Y"))  # Dynamically get current year
MIN_YEAR <- 2000  # Set a fixed minimum year for filtering

message("✓ Step 1/6: Loading input datasets")

message("  → Loading adjusted HMIS data (national)...")
# Input Datasets
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
  message("Filtered survey data for ISO3: ", COUNTRY_ISO3)

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
    message("  → Found ", nrow(survey_data_unified), " survey records for ", COUNTRY_ISO3)
  }
} else {
  warning("iso3_code column not found in survey data - cannot filter by country")
}

message("  → Loading population estimates from GitHub...")
population_estimates_only <- read.csv(PROJECT_DATA_POPULATION, fileEncoding = "UTF-8")

# Filter by ISO3 code
if ("iso3_code" %in% names(population_estimates_only)) {
  population_estimates_only <- population_estimates_only %>% filter(iso3_code == COUNTRY_ISO3)
  message("  → Filtered population data for ISO3: ", COUNTRY_ISO3)

  # Check if data exists for this country
  if (nrow(population_estimates_only) == 0) {
    stop("ERROR: No population data found for country ISO3 code '", COUNTRY_ISO3, "'. Please check the ISO3 code and data availability.")
  }
  message("  → Found ", nrow(population_estimates_only), " population records for ", COUNTRY_ISO3)
} else {
  warning("iso3_code column not found in population data - cannot filter by country")
}


message("✓ Step 1/6 completed: All datasets loaded successfully!")

# ------------------------------ Prepare Data for Analysis -------------------------
# Removed: pnc1 renaming flag (no longer needed)

message("Analysis mode: ", ANALYSIS_LEVEL)

# Always run national analysis
survey_data_national <- survey_data_unified %>% filter(admin_area_2 == "NATIONAL")

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
    warning("SAFEGUARD: No subnational survey data found. Falling back to: NATIONAL_ONLY")
    original_level <- ANALYSIS_LEVEL
    ANALYSIS_LEVEL <- "NATIONAL_ONLY"
    hmis_data_subnational <- NULL
    survey_data_subnational <- NULL
  } else {
    
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
        warning("SAFEGUARD: admin_area_3 data not usable. Falling back to: NATIONAL_PLUS_AA2")
        original_level <- ANALYSIS_LEVEL
        ANALYSIS_LEVEL <- "NATIONAL_PLUS_AA2"
      }
    }
    
    # Prepare HMIS data based on final analysis level
    hmis_data_subnational <- adjusted_volume_data_subnational
  }
}

message("Final analysis level: ", ANALYSIS_LEVEL)

# ------------------------------ Define Parameters --------------------------------
# Coverage Estimation Parameters
coverage_params <- list(
  indicators = c(
    # Core
    "anc1", "anc4", "delivery", "sba", "bcg",
    "penta1", "penta3",
    "measles1", "measles2",
    "rota1", "rota2",
    "opv1", "opv2", "opv3",
    "pnc1", "pnc1_mother",
    "nmr", "imr",
    "vitaminA",
    "fully_immunized"
  )
)

# List of survey variables to carry forward (for forward-fill and projections)
survey_vars <- c(
  "avgsurvey_anc1", "avgsurvey_anc4", "avgsurvey_delivery", "avgsurvey_sba",
  "avgsurvey_bcg",
  "avgsurvey_penta1", "avgsurvey_penta3",
  "avgsurvey_measles1", "avgsurvey_measles2",
  "avgsurvey_rota1", "avgsurvey_rota2",
  "avgsurvey_opv1", "avgsurvey_opv2", "avgsurvey_opv3",
  "avgsurvey_pnc1", "avgsurvey_pnc1_mother",
  "avgsurvey_nmr", "avgsurvey_imr", "postnmr",
  "avgsurvey_vitaminA",
  "avgsurvey_fully_immunized"
)

# ------------------------------ Define Functions --------------------------------
# Part 1 - prepare hmis data
process_hmis_adjusted_volume <- function(adjusted_volume_data, count_col = SELECTED_COUNT_VARIABLE) {
  
  expected_indicators <- c(
    # Core RMNCH indicators
    "anc1", "anc4", "delivery", "sba", "bcg", "penta1", "penta3", "nmr", "imr",
    "measles1", "measles2", "rota1", "rota2", "opv1", "opv2", "opv3", "pnc1", "pnc1_mother",
    "vitaminA", "fully_immunized"
  )
  
  message("Loading and mapping adjusted HMIS volume...")
  
  # Removed: pnc1 renaming in HMIS (handled via survey duplication instead)

  has_admin2 <- "admin_area_2" %in% names(adjusted_volume_data)
  has_iso3 <- "iso3_code" %in% names(adjusted_volume_data)

  # Ensure year and month exist
  if (!all(c("year", "month") %in% names(adjusted_volume_data))) {
    adjusted_volume_data <- adjusted_volume_data %>%
      mutate(
        year = as.integer(substr(period_id, 1, 4)),
        month = as.integer(substr(period_id, 5, 6))
      )
  }

  group_vars <- if (has_admin2) c("admin_area_1", "admin_area_2", "year") else c("admin_area_1", "year")
  if (has_iso3) group_vars <- c("iso3_code", group_vars)

  adjusted_volume <- adjusted_volume_data %>%
    mutate(count = .data[[count_col]]) %>%
    dplyr::select(any_of(c("iso3_code", "admin_area_1", "admin_area_2", "year", "month", "indicator_common_id", "count"))) %>%
    arrange(across(any_of(c("admin_area_1", "admin_area_2", "year", "month", "indicator_common_id"))))
  
  missing <- setdiff(expected_indicators, unique(adjusted_volume$indicator_common_id))
  if (length(missing) > 0) {
    warning("The following indicators are not available in the HMIS data: ", paste(missing, collapse = ", "))
  }
  
  hmis_countries <- unique(adjusted_volume$admin_area_1)
  message("HMIS data for country: ", paste(hmis_countries, collapse = ", "))
  
  nummonth_data <- adjusted_volume %>%
    distinct(across(all_of(c(group_vars, "month")))) %>%
    group_by(across(all_of(group_vars))) %>%
    summarise(nummonth = n_distinct(month, na.rm = TRUE), .groups = "drop")
  
  message("Aggregating HMIS volume to annual level...")
  
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

# Part 2 - prepare survey data - UPDATED HARMONIZATION
process_survey_data <- function(survey_data, hmis_countries, hmis_iso3 = NULL, min_year = MIN_YEAR, max_year = CURRENT_YEAR,
                                national_reference = NULL) {

  # Filter by ISO3 if available, otherwise use admin_area_1
  if (!is.null(hmis_iso3) && "iso3_code" %in% names(survey_data)) {
    survey_data <- survey_data %>% filter(iso3_code %in% hmis_iso3)
  } else {
    survey_data <- survey_data %>% filter(admin_area_1 %in% hmis_countries)
  }

  # Harmonize indicator names used in survey to match HMIS format
  survey_data <- survey_data %>%
    mutate(indicator_common_id = recode(indicator_common_id,
                                        "polio1" = "opv1",
                                        "polio2" = "opv2",
                                        "polio3" = "opv3",
                                        "vitamina" = "vitaminA"
    ))
  
  is_national <- all(unique(survey_data$admin_area_2) == "NATIONAL")

  indicators <- c("anc1", "anc4", "delivery", "sba", "bcg", "penta1", "penta3", "measles1", "measles2",
                  "rota1", "rota2", "opv1", "opv2", "opv3", "pnc1", "pnc1_mother", "nmr", "imr",
                  "vitaminA","fully_immunized")
  
  survey_filtered <- if (is_national) {
    survey_data %>% filter(admin_area_2 == "NATIONAL")
  } else {
    survey_data %>% filter(admin_area_2 != "NATIONAL")
  }
  
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

  # Ensure source_detail exists (may be absent in older survey CSVs)
  if (!"source_detail" %in% names(survey_filtered)) survey_filtered$source_detail <- NA_character_

  # Pick best source per (geo, year, indicator) — keep source + source_detail
  raw_pick_long <- survey_filtered %>%
    filter(source %in% source_priority,
           year >= min_year, year <= max_year) %>%
    group_by(admin_area_1, admin_area_2, year, indicator_common_id, source) %>%
    summarise(
      survey_value  = mean(survey_value, na.rm = TRUE),
      source_detail = first(source_detail[!is.na(source_detail)], default = NA_character_),
      .groups = "drop"
    ) %>%
    group_by(admin_area_1, admin_area_2, year, indicator_common_id) %>%
    arrange(factor(source, levels = source_priority)) %>%
    slice(1) %>%
    ungroup() %>%
    drop_na(survey_value)

  # Wide tables: values + sources + details (matching m005 pattern)
  raw_vals_wide <- raw_pick_long %>%
    select(admin_area_1, admin_area_2, year, indicator_common_id, survey_value) %>%
    pivot_wider(names_from = indicator_common_id, values_from = survey_value,
                names_glue = "rawsurvey_{indicator_common_id}")

  raw_srcs_wide <- raw_pick_long %>%
    select(admin_area_1, admin_area_2, year, indicator_common_id, source) %>%
    pivot_wider(names_from = indicator_common_id, values_from = source,
                names_glue = "rawsource_{indicator_common_id}")

  raw_detail_wide <- raw_pick_long %>%
    select(admin_area_1, admin_area_2, year, indicator_common_id, source_detail) %>%
    pivot_wider(names_from = indicator_common_id, values_from = source_detail,
                names_glue = "rawdetail_{indicator_common_id}")

  raw_survey_values <- raw_vals_wide %>%
    left_join(raw_srcs_wide,   by = c("admin_area_1", "admin_area_2", "year")) %>%
    left_join(raw_detail_wide, by = c("admin_area_1", "admin_area_2", "year"))

  full_years <- seq(min_year, max_year)
  group_keys <- if (is_national) {
    c("admin_area_1", "indicator_common_id", "source")
  } else {
    c("admin_area_1", "admin_area_2", "indicator_common_id", "source")
  }

  survey_extended <- survey_filtered %>%
    filter(year %in% full_years) %>%
    group_by(across(all_of(group_keys)), .drop = FALSE) %>%
    group_modify(~ {
      if (nrow(.x) == 0) return(tibble())
      .x %>% complete(year = full_years) %>% arrange(year) %>%
        mutate(survey_value_carry = zoo::na.locf(survey_value, na.rm = FALSE))
    }) %>%
    ungroup()
  
  survey_wide <- survey_extended %>%
    select(all_of(c("admin_area_1", if (!is_national) "admin_area_2")),
           year, indicator_common_id, source, survey_value_carry) %>%
    pivot_wider(names_from = c(source, indicator_common_id),
                values_from = survey_value_carry,
                names_glue = "{indicator_common_id}_{source}",
                values_fn = mean)

  # NEW: Time-aware source selection - prefer most recent source (ties → DHS)
  # Build geo×year grid for tracking last appearance of each source
  geo_keys <- if (is_national) c("admin_area_1") else c("admin_area_1", "admin_area_2")
  geos <- (if (nrow(survey_wide)) survey_wide else survey_filtered) %>%
    distinct(across(all_of(geo_keys)))
  grid <- expand_grid(geos, year = full_years)

  # Helper function to track last year each source appeared
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
  # Also records which source was selected as avgsource_{ind}
  choose_most_recent <- function(df, ind, all_sources) {
    avg_col <- paste0("avgsurvey_", ind)
    src_col <- paste0("avgsource_", ind)

    # Find all available columns for this indicator
    ind_cols <- grep(paste0("^", ind, "_"), names(df), value = TRUE)

    if (length(ind_cols) == 0) {
      df[[avg_col]] <- NA_real_
      df[[src_col]] <- NA_character_
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
      df[[src_col]] <- NA_character_
    } else {
      best_col <- paste0(ind, "_", source_order[1])
      df[[avg_col]] <- as.numeric(df[[best_col]])
      df[[src_col]] <- ifelse(!is.na(df[[avg_col]]), source_order[1], NA_character_)
    }
    df
  }
  for (ind in indicators) survey_wide <- choose_most_recent(survey_wide, ind, available_sources)
  
  survey_wide <- survey_wide %>%
    mutate(postnmr = ifelse("avgsurvey_imr" %in% names(.) & "avgsurvey_nmr" %in% names(.),
                            avgsurvey_imr - avgsurvey_nmr, NA_real_))
  
  carry_group <- if (is_national) "admin_area_1" else c("admin_area_1", "admin_area_2")
  
  survey_carried <- survey_wide %>%
    group_by(across(all_of(carry_group))) %>%
    complete(year = full_seq(year, 1)) %>%
    arrange(across(all_of(carry_group)), year) %>%
    mutate(across(everything(), ~ zoo::na.locf(.x, na.rm = FALSE))) %>%
    ungroup()
  
  for (ind in c(indicators, "postnmr")) {
    avg_col <- paste0("avgsurvey_", ind)
    carry_col <- paste0(ind, "carry")
    if (avg_col %in% names(survey_carried)) {
      survey_carried[[carry_col]] <- survey_carried[[avg_col]]
    }
    # Also carry forward source attribution
    src_col <- paste0("avgsource_", ind)
    carry_src_col <- paste0(ind, "carry_source")
    if (src_col %in% names(survey_carried)) {
      survey_carried[[carry_src_col]] <- survey_carried[[src_col]]
    }
  }

  # If sba reference doesn't exist or is all NA, use delivery reference as fallback
  sba_carry_missing <- !"sbacarry" %in% names(survey_carried) ||
    all(is.na(survey_carried$sbacarry))
  if (sba_carry_missing && "deliverycarry" %in% names(survey_carried)) {
    survey_carried$sbacarry <- survey_carried$deliverycarry
  }

  # defaults for subnational when missing - use national coverage estimate
  # If no national reference is available, leave as NA (no coverage calculation)
  if (!is_national && !is.null(national_reference)) {
    # Extract national coverage values by year for vaccination indicators
    for (ind in c("anc1","anc4","delivery","sba","bcg","penta1","penta3",
                  "measles1","measles2","opv1","opv2","opv3","rota1","rota2",
                  "pnc1","vitaminA","fully_immunized")) {
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
  
  if (is_national) {
    survey_carried <- survey_carried %>% mutate(admin_area_2 = "NATIONAL")
    raw_survey_values <- raw_survey_values %>% mutate(admin_area_2 = "NATIONAL")
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

  return(list(
    carried  = survey_carried %>% arrange(across(any_of(c("admin_area_1", if (!is_national) "admin_area_2", "year")))),
    raw      = raw_survey_values,
    raw_long = raw_pick_long
  ))
}

#Part 2b - prepare unwpp data
process_national_population_data <- function(population_data, hmis_countries, hmis_iso3 = NULL) {

  # Filter by ISO3 if available, otherwise use admin_area_1
  if (!is.null(hmis_iso3) && "iso3_code" %in% names(population_data)) {
    population_data <- population_data %>%
      filter(admin_area_2 == "NATIONAL",
             iso3_code %in% hmis_iso3)
  } else {
    population_data <- population_data %>%
      filter(admin_area_2 == "NATIONAL",
             admin_area_1 %in% hmis_countries)
  }

  wide <- population_data %>%
    mutate(source = tolower(source)) %>%
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

  wide
}

#Part 3 - calculate denominators
calculate_denominators <- function(hmis_data, survey_data, population_data = NULL) {
  # nmrcarry is handled by the survey data processing, no need for redundant check here

  has_admin_area_2 <- "admin_area_2" %in% names(hmis_data)
  use_iso <- "iso3_code" %in% names(hmis_data) && "iso3_code" %in% names(survey_data)

  # When joining on iso3_code, drop admin_area_1 from non-HMIS sides to avoid duplicates
  if (use_iso) {
    survey_data <- survey_data %>% select(-any_of("admin_area_1"))
    if (!is.null(population_data)) {
      population_data <- population_data %>% select(-any_of("admin_area_1"))
    }
  }

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

    # Backfill admin_area_1 for survey/pop-only rows created by full_join
    if (use_iso && "admin_area_1" %in% names(data)) {
      hmis_admin1 <- unique(na.omit(data$admin_area_1))
      if (length(hmis_admin1) == 1) {
        data <- data %>% mutate(admin_area_1 = coalesce(admin_area_1, hmis_admin1))
      }
    }
  }

  indicator_vars <- list(
    anc1      = c("countanc1", "anc1carry"),
    anc4      = c("countanc4", "anc4carry"),
    delivery  = c("countdelivery", "deliverycarry"),
    sba       = c("countsba", "sbacarry"),
    penta1    = c("countpenta1", "penta1carry"),
    penta2    = c("countpenta2", "penta2carry"),
    penta3    = c("countpenta3", "penta3carry"),
    opv1      = c("countopv1", "opv1carry"),
    opv2      = c("countopv2", "opv2carry"),
    opv3      = c("countopv3", "opv3carry"),
    measles1  = c("countmeasles1", "measles1carry"),
    measles2  = c("countmeasles2", "measles2carry"),
    bcg       = c("countbcg", "bcgcarry"),
    livebirth = c("countlivebirth", "livebirthcarry"),
    pnc1      = c("countpnc1", "pnc1carry"),
    pnc1_mother = c("countpnc1_mother", "pnc1_mothercarry"),
    nmr       = c("countnmr", "nmrcarry"),
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
  
  if (all(indicator_vars$livebirth %in% available_vars)) {
    data <- data %>% mutate(
      countlivebirth = ifelse(is.na(countlivebirth), 0, countlivebirth),
      dlivebirths_livebirth   = safe_mutate("livebirth", countlivebirth / livebirthcarry),
      dlivebirths_pregnancy   = safe_calc(dlivebirths_livebirth * (1 - 0.5 * TWIN_RATE) / ((1 - STILLBIRTH_RATE) * (1 - PREGNANCY_LOSS_RATE))),
      dlivebirths_delivery    = safe_calc(dlivebirths_pregnancy * (1 - PREGNANCY_LOSS_RATE)),
      dlivebirths_birth       = safe_calc(dlivebirths_livebirth / (1 - STILLBIRTH_RATE)),
      dlivebirths_dpt         = safe_calc(dlivebirths_livebirth * (1 - P1_NMR)),
      dlivebirths_measles1    = safe_calc(dlivebirths_dpt * (1 - P2_PNMR)),
      dlivebirths_measles2    = safe_calc(dlivebirths_dpt * (1 - 2 * P2_PNMR))
    )
  }
  
  if (all(indicator_vars$anc1 %in% available_vars)) {
    data <- data %>% mutate(
      danc1_pregnancy         = safe_mutate("anc1", countanc1 / anc1carry),
      danc1_delivery          = safe_calc(danc1_pregnancy * (1 - PREGNANCY_LOSS_RATE)),
      danc1_birth             = safe_calc(danc1_delivery / (1 - 0.5 * TWIN_RATE)),
      danc1_livebirth         = safe_calc(danc1_birth * (1 - STILLBIRTH_RATE)),
      danc1_dpt               = safe_calc(danc1_livebirth * (1 - P1_NMR)),
      danc1_measles1          = safe_calc(danc1_dpt * (1 - P2_PNMR)),
      danc1_measles2          = safe_calc(danc1_dpt * (1 - 2 * P2_PNMR))
    )
  }
  
  if (all(indicator_vars$delivery %in% available_vars)) {
    data <- data %>% mutate(
      ddelivery_livebirth     = safe_mutate("delivery", countdelivery / deliverycarry),
      ddelivery_birth         = safe_calc(ddelivery_livebirth / (1 - STILLBIRTH_RATE)),
      ddelivery_pregnancy     = safe_calc(ddelivery_birth * (1 - 0.5 * TWIN_RATE) / (1 - PREGNANCY_LOSS_RATE)),
      ddelivery_dpt           = safe_calc(ddelivery_livebirth * (1 - P1_NMR)),
      ddelivery_measles1      = safe_calc(ddelivery_dpt * (1 - P2_PNMR)),
      ddelivery_measles2      = safe_calc(ddelivery_dpt * (1 - 2 * P2_PNMR))
    )
  }

  if (all(indicator_vars$sba %in% available_vars)) {
    data <- data %>% mutate(
      dsba_livebirth     = safe_mutate("sba", countsba / sbacarry),
      dsba_birth         = safe_calc(dsba_livebirth / (1 - STILLBIRTH_RATE)),
      dsba_pregnancy     = safe_calc(dsba_birth * (1 - 0.5 * TWIN_RATE) / (1 - PREGNANCY_LOSS_RATE)),
      dsba_dpt           = safe_calc(dsba_livebirth * (1 - P1_NMR)),
      dsba_measles1      = safe_calc(dsba_dpt * (1 - P2_PNMR)),
      dsba_measles2      = safe_calc(dsba_dpt * (1 - 2 * P2_PNMR))
    )
  }

  if (all(indicator_vars$penta1 %in% available_vars)) {
    data <- data %>% mutate(
      dpenta1_dpt             = safe_mutate("penta1", countpenta1 / penta1carry),
      dpenta1_measles1        = safe_calc(dpenta1_dpt * (1 - P2_PNMR)),
      dpenta1_measles2        = safe_calc(dpenta1_dpt * (1 - 2 * P2_PNMR))
    )
  }
  
  if (!has_admin_area_2 && all(indicator_vars$bcg %in% available_vars)) {
    data <- data %>% mutate(
      dbcg_pregnancy = safe_mutate("bcg", (countbcg / bcgcarry) / (1 - PREGNANCY_LOSS_RATE) / (1 + TWIN_RATE) / (1 - STILLBIRTH_RATE)),
      dbcg_livebirth = safe_mutate("bcg", countbcg / bcgcarry),
      dbcg_dpt = safe_mutate("bcg", (countbcg / bcgcarry) * (1 - P1_NMR)),
      dbcg_mcv = safe_mutate("bcg", (countbcg / bcgcarry) * (1 - P1_NMR) * (1 - P2_PNMR))
    )
  }
  
  if (!has_admin_area_2) {
    # UNWPP-based denominators - ONLY use UNWPP source columns
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

# Part 3b - Select best denominator chain (UNWPP proximity)
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

#Part 4 - calculate coverage and compare all denominators
evaluate_coverage_by_denominator <- function(data) {
  # Determine if this is national-level data
  has_admin_area_2 <- "admin_area_2" %in% names(data)
  is_national_level <- has_admin_area_2 && all(data$admin_area_2 == "NATIONAL")
  
  geo_keys <- if (has_admin_area_2) {
    c("admin_area_1", "admin_area_2", "year")
  } else {
    c("admin_area_1", "year")
  }
  
  # Numerators
  numerator_long <- data %>%
    select(all_of(geo_keys), starts_with("count")) %>%
    pivot_longer(
      cols = -all_of(geo_keys),
      names_to = "numerator_col",
      values_to = "numerator"
    ) %>%
    filter(numerator_col != "count") %>%
    mutate(indicator_common_id = str_remove(numerator_col, "^count")) %>%
    select(-numerator_col) %>%
    distinct()
  
  # Denominator pattern: match all relevant *_suffix style names
  denom_pattern <- "^(d.*)_(pregnancy|livebirth|dpt|measles1|measles2|vitaminA|fully_immunized)$"
  
  # Denominator-to-indicator map (based on suffix only)
  suffix_indicator_map <- tribble(
    ~suffix,       ~indicators,

    # Used for indicators related to pregnancy services and ANC
    "pregnancy",   c("anc1", "anc4"),

    # Used for indicators that apply to newborns or children under 5
    "livebirth",   c("delivery", "sba", "bcg", "pnc1", "pnc1_mother"),

    # Used for infant immunization indicators (0–1 year)
    "dpt",         c("penta1", "penta2", "penta3", "opv1", "opv2", "opv3",
                     "pcv1", "pcv2", "pcv3", "rota1", "rota2", "ipv1", "ipv2"),

    # Used for coverage of first measles dose
    "measles1",    c("measles1"),

    # Used for coverage of second measles dose
    "measles2",    c("measles2"),

    # Used for vitamin A supplementation (children 6-59 months)
    "vitaminA",    c("vitaminA"),

    # Used for fully immunized children
    "fully_immunized", c("fully_immunized")
  )
  
  #Denominators
  denominator_long <- data %>%
    select(all_of(geo_keys), matches(denom_pattern)) %>%
    pivot_longer(
      cols = -all_of(geo_keys),
      names_to = "denominator",
      values_to = "denominator_value"
    ) %>%
    mutate(
      denominator_type = str_extract(denominator, "(pregnancy|livebirth|dpt|measles1|measles2|vitaminA|fully_immunized)"),
      indicator_common_id = purrr::map(denominator_type, ~ {
        matched <- suffix_indicator_map %>% filter(suffix == .x)
        if (nrow(matched) == 0) NA_character_ else matched$indicators[[1]]
      })
    ) %>%
    unnest_longer(indicator_common_id) %>%
    filter(!is.na(indicator_common_id)) %>%
    distinct()
  
  numerator_long <- distinct(numerator_long)
  denominator_long <- distinct(denominator_long)
  
  # Join numerator and denominator
  # NOTE: Don't drop NA coverage yet - we need to preserve survey-only years
  coverage_data <- full_join(
    numerator_long,
    denominator_long,
    by = c(geo_keys, "indicator_common_id")
  ) %>%
    filter(!is.na(denominator_value), denominator_value > 0) %>%
    mutate(coverage = if_else(numerator == 0, NA_real_, numerator / denominator_value)) %>%
    filter(!is.na(coverage), !is.infinite(coverage))

  # Reference values
  carry_cols <- grep("carry$", names(data), value = TRUE)
  carry_values <- data %>%
    select(all_of(geo_keys), all_of(carry_cols)) %>%
    pivot_longer(
      cols = all_of(carry_cols),
      names_to = "indicator_common_id",
      names_pattern = "(.*)carry$",
      values_to = "reference_value"
    ) %>%
    drop_na(reference_value) %>%
    group_by(across(all_of(c(geo_keys, "indicator_common_id")))) %>%
    summarise(reference_value = mean(reference_value, na.rm = TRUE), .groups = "drop")

  # Calculate error
  # Join coverage data with reference values, keeping survey-only years
  coverage_with_error <- full_join(
    coverage_data,
    carry_values,
    by = c(geo_keys, "indicator_common_id")
  ) %>%
    # NOW filter to keep only rows with coverage OR reference_value (or both)
    filter(!is.na(coverage) | !is.na(reference_value)) %>%
    mutate(
      squared_error = (coverage - reference_value)^2,
      source_type = case_when(
        str_starts(denominator, "danc1_")      & indicator_common_id == "anc1"     ~ "reference_based",
        str_starts(denominator, "ddelivery_")  & indicator_common_id == "delivery" ~ "reference_based",
        str_starts(denominator, "dsba_")       & indicator_common_id == "sba"      ~ "reference_based",
        str_starts(denominator, "dpenta1_")    & indicator_common_id == "penta1"   ~ "reference_based",
        str_starts(denominator, "dbcg_")       & indicator_common_id == "bcg"      ~ "reference_based",
        str_starts(denominator, "dwpp_")                                       ~ "unwpp_based",
        TRUE ~ "independent"
      )
    )
  
  # Rank by error
  # For survey-only years: squared_error is NA (no HMIS coverage to compare), but keep them unranked
  ranked <- coverage_with_error %>%
    group_by(across(all_of(geo_keys)), indicator_common_id) %>%
    arrange(squared_error) %>%
    mutate(rank = if_else(is.na(squared_error), NA_integer_, as.integer(row_number()))) %>%
    ungroup()
  
  # Best-only output
  best <- ranked %>%
    filter(rank == 1) %>%
    select(all_of(geo_keys), indicator_common_id,
           coverage, reference_value, denominator, denominator_type, squared_error)
  
  list(
    full_ranking = ranked,
    best_only = best
  )
}

#Part 5 - run projections
project_coverage_from_all <- function(ranked_coverage, survey_raw_long = NULL) {
  message("Projecting survey coverage forward using HMIS deltas...")

  if (!"reference_value" %in% names(ranked_coverage)) {
    stop("ERROR!! 'reference_value' column not found in ranked_coverage.")
  }

  has_admin_area_2 <- "admin_area_2" %in% names(ranked_coverage)
  geo_keys <- if (has_admin_area_2) {
    c("admin_area_1", "admin_area_2", "indicator_common_id", "denominator")
  } else {
    c("admin_area_1", "indicator_common_id", "denominator")
  }

  # Compute year-on-year deltas
  ranked_with_delta <- ranked_coverage %>%
    arrange(across(all_of(c(geo_keys, "year")))) %>%
    group_by(across(all_of(geo_keys))) %>%
    mutate(
      coverage_delta = coverage - lag(coverage)
    ) %>%
    ungroup()

  # Find baseline: last survey year OVERALL (matching m006 pattern)
  baseline_join_keys <- intersect(c("admin_area_1", "admin_area_2", "indicator_common_id"), names(ranked_coverage))

  if (!is.null(survey_raw_long) && nrow(survey_raw_long) > 0) {
    survey_baseline_keys <- c(intersect(c("admin_area_1", "admin_area_2"), names(survey_raw_long)), "indicator_common_id")
    baseline_info <- survey_raw_long %>%
      group_by(across(all_of(survey_baseline_keys))) %>%
      filter(year == max(year, na.rm = TRUE)) %>%
      slice_tail(n = 1) %>%
      ungroup() %>%
      transmute(
        across(all_of(survey_baseline_keys)),
        baseline_year = as.integer(year),
        baseline_value = as.numeric(survey_value)
      )
  } else {
    # Fallback: derive baseline from ranked_coverage reference_value
    baseline_info <- ranked_coverage %>%
      filter(!is.na(reference_value)) %>%
      group_by(across(all_of(baseline_join_keys))) %>%
      filter(year == max(year, na.rm = TRUE)) %>%
      slice_tail(n = 1) %>%
      ungroup() %>%
      transmute(
        across(all_of(baseline_join_keys)),
        baseline_year = as.integer(year),
        baseline_value = as.numeric(reference_value)
      )
  }

  # Join baseline and compute projections (matching m006: cumsum only from baseline_year+1)
  all_projected <- ranked_with_delta %>%
    left_join(baseline_info, by = baseline_join_keys) %>%
    group_by(across(all_of(geo_keys))) %>%
    arrange(year) %>%
    mutate(
      cum_delta = cumsum(if_else(year > baseline_year & !is.na(coverage_delta), coverage_delta, 0)),
      avgsurveyprojection = if_else(
        is.na(coverage),
        reference_value,
        baseline_value + cum_delta
      ),
      projection_source = paste0("avgsurveyprojection_", denominator)
    ) %>%
    select(-cum_delta, -baseline_year, -baseline_value) %>%
    ungroup()

  # Carry forward baseline value to fill gap between last survey and first HMIS year
  baseline_and_gaps <- tryCatch({
    gap_summary <- ranked_with_delta %>%
      left_join(baseline_info, by = baseline_join_keys) %>%
      group_by(across(all_of(geo_keys))) %>%
      summarise(
        baseline_year = first(baseline_year),
        baseline_value = first(baseline_value),
        first_hmis_year = suppressWarnings(min(year[!is.na(coverage)], na.rm = TRUE)),
        .groups = "drop"
      ) %>%
      filter(!is.na(baseline_year), is.finite(first_hmis_year),
             first_hmis_year > baseline_year + 1)

    message("  → Gap analysis: ", nrow(gap_summary), " groups have gaps")

    gap_summary %>%
      mutate(gap_years = purrr::map2(baseline_year, first_hmis_year,
                                      ~seq(.x + 1, .y - 1))) %>%
      tidyr::unnest(gap_years) %>%
      transmute(
        across(all_of(geo_keys)),
        year = as.integer(gap_years),
        reference_value = baseline_value,
        coverage = NA_real_,
        coverage_delta = 0,
        avgsurveyprojection = baseline_value,
        projection_source = paste0("gap_fill_", baseline_year)
      )
  }, error = function(e) {
    message("Note: Gap filling skipped - ", e$message)
    data.frame()
  })

  if (nrow(baseline_and_gaps) > 0) {
    message("  → Added ", nrow(baseline_and_gaps), " gap-fill rows")
    all_projected <- bind_rows(all_projected, baseline_and_gaps) %>%
      arrange(across(all_of(c(geo_keys, "year")))) %>%
      distinct()
  }

  return(all_projected)
}

#Part 6 - prepare outputs
prepare_combined_coverage_from_projected <- function(projected_data, raw_survey_wide) {
  has_admin_area_2 <- "admin_area_2" %in% names(projected_data)
  use_iso <- "iso3_code" %in% names(projected_data) && "iso3_code" %in% names(raw_survey_wide)

  # Use iso3_code instead of admin_area_1 for joins when available
  geo_key <- if (use_iso) "iso3_code" else "admin_area_1"
  join_keys <- if (has_admin_area_2) {
    c(geo_key, "admin_area_2", "year", "indicator_common_id")
  } else {
    c(geo_key, "year", "indicator_common_id")
  }
  
  # Pivot raw survey values
  raw_vals_long <- raw_survey_wide %>%
    pivot_longer(
      cols = starts_with("rawsurvey_"),
      names_to = "indicator_common_id",
      names_prefix = "rawsurvey_",
      values_to = "coverage_original_estimate"
    ) %>%
    filter(!is.na(coverage_original_estimate)) %>%
    select(all_of(join_keys), coverage_original_estimate) %>%
    distinct()

  # Pivot raw source labels
  raw_src_long <- if (any(grepl("^rawsource_", names(raw_survey_wide)))) {
    raw_survey_wide %>%
      pivot_longer(
        cols = starts_with("rawsource_"),
        names_to = "indicator_common_id",
        names_prefix = "rawsource_",
        values_to = "survey_source"
      ) %>%
      filter(!is.na(survey_source)) %>%
      select(all_of(join_keys), survey_source) %>%
      distinct()
  } else NULL

  # Pivot raw source detail strings
  raw_det_long <- if (any(grepl("^rawdetail_", names(raw_survey_wide)))) {
    raw_survey_wide %>%
      pivot_longer(
        cols = starts_with("rawdetail_"),
        names_to = "indicator_common_id",
        names_prefix = "rawdetail_",
        values_to = "survey_source_detail"
      ) %>%
      filter(!is.na(survey_source_detail)) %>%
      select(all_of(join_keys), survey_source_detail) %>%
      distinct()
  } else NULL

  # Combine values with source info
  raw_survey_long <- raw_vals_long
  if (!is.null(raw_src_long)) {
    raw_survey_long <- raw_survey_long %>% left_join(raw_src_long, by = join_keys)
  } else {
    raw_survey_long$survey_source <- NA_character_
  }
  if (!is.null(raw_det_long)) {
    raw_survey_long <- raw_survey_long %>% left_join(raw_det_long, by = join_keys)
  } else {
    raw_survey_long$survey_source_detail <- NA_character_
  }
  
  min_years <- raw_survey_long %>%
    filter(!is.na(year)) %>%
    group_by(across(setdiff(join_keys, "year"))) %>%
    summarise(min_year = min(year), .groups = "drop") %>%
    filter(!is.na(min_year) & is.finite(min_year))
  
  max_year <- max(projected_data$year, na.rm = TRUE)

  # Safety check: if max_year is not finite, return empty result
  if (!is.finite(max_year)) {
    warning("No valid projection data available - returning empty result")
    return(data.frame())
  }

  # Updated valid suffix-to-indicator map
  valid_suffix_map <- list(
    pregnancy  = c("anc1", "anc4"),
    livebirth  = c("bcg", "delivery", "sba", "pnc1", "pnc1_mother"),
    dpt        = c("penta1", "penta2", "penta3", "opv1", "opv2", "opv3",
                   "pcv1", "pcv2", "pcv3", "rota1", "rota2", "ipv1", "ipv2"),
    measles1   = c("measles1"),
    measles2   = c("measles2"),
    vitaminA   = c("vitaminA"),
    fully_immunized = c("fully_immunized")
  )
  
  # Filter projected_data to only keep valid denominator-indicator pairs
  valid_denominator_map <- projected_data %>%
    select(
      any_of(c("iso3_code", "admin_area_1")),
      admin_area_2 = if (has_admin_area_2) "admin_area_2" else NULL,
      indicator_common_id,
      denominator
    ) %>%
    distinct() %>%
    mutate(
      suffix = str_extract(denominator, "(pregnancy|livebirth|dpt|measles1|measles2|vitaminA|fully_immunized)")
    ) %>%
    filter(map2_lgl(indicator_common_id, suffix, ~ .x %in% valid_suffix_map[[.y]])) %>%
    select(-suffix)
  
  expansion_grid <- min_years %>%
    inner_join(valid_denominator_map, by = setdiff(join_keys, "year")) %>%
    mutate(year = purrr::map(min_year, ~ seq.int(.x, max_year))) %>%
    unnest(year) %>%
    select(-min_year)
  
  survey_expanded <- left_join(
    expansion_grid,
    raw_survey_long,
    by = join_keys
  )
  
  combined <- full_join(
    projected_data,
    survey_expanded,
    by = c(join_keys, "denominator")
  )

  is_national <- all(is.na(combined$admin_area_2)) || all(combined$admin_area_2 == "NATIONAL")
  
  combined <- combined %>%
    mutate(
      coverage_original_estimate = ifelse(is.nan(coverage_original_estimate), NA_real_, coverage_original_estimate),
      admin_area_2 = if (!has_admin_area_2) "NATIONAL" else admin_area_2
    )
  
  if ("coverage_original_estimate" %in% names(combined)) {
    combined <- combined %>%
      group_by(across(all_of(c(setdiff(join_keys, "year"), "denominator")))) %>%
      mutate(
        .last_survey_year = suppressWarnings(if (all(is.na(coverage_original_estimate))) NA_real_ else max(year[!is.na(coverage_original_estimate)], na.rm = TRUE)),
        .last_survey_value = if_else(!is.na(.last_survey_year), coverage_original_estimate[year == .last_survey_year][1], NA_real_),
        .baseline_cov = if_else(!is.na(.last_survey_year), coverage[year == .last_survey_year][1], NA_real_),
        avgsurveyprojection = case_when(
          year == .last_survey_year ~ .last_survey_value,
          year > .last_survey_year & !is.na(coverage) ~
            .last_survey_value + (coverage - .baseline_cov),
          TRUE ~ NA_real_
        ),
        coverage_original_estimate = ifelse(
          year > .last_survey_year,
          NA_real_,
          coverage_original_estimate
        )
      ) %>%
      ungroup() %>%
      select(-.last_survey_year, -.last_survey_value, -.baseline_cov)
  }
  
  # Ensure source columns exist even if survey data had none
  if (!"survey_source" %in% names(combined)) combined$survey_source <- NA_character_
  if (!"survey_source_detail" %in% names(combined)) combined$survey_source_detail <- NA_character_

  combined <- combined %>%
    transmute(
      across(any_of("iso3_code")),
      admin_area_1,
      admin_area_2,
      year,
      indicator_common_id,
      denominator,
      coverage_original_estimate,
      survey_source,
      survey_source_detail,
      coverage_avgsurveyprojection = avgsurveyprojection,
      coverage_cov = coverage,
      rank,
      source_type
    )

  combined <- combined %>%
    select(
      any_of("iso3_code"),
      admin_area_1,
      admin_area_2,
      indicator_common_id,
      year,
      denominator,
      everything()
    )
  
  return(combined)
}

# ------------------------------ Main Execution ---------------------------------------------------------------

message("✓ Step 2/6: Processing national data")

# 1 - prepare the hmis data
message("  → Preparing HMIS adjusted volume data...")
hmis_processed <- process_hmis_adjusted_volume(adjusted_volume_data)

# 2 - prepare the survey data
message("  → Preparing survey data...")
survey_processed_national <- process_survey_data(
  survey_data = survey_data_national,
  hmis_countries = hmis_processed$hmis_countries,
  hmis_iso3 = hmis_processed$hmis_iso3
)

message("  → Preparing population data...")
national_population_processed <- process_national_population_data(
  population_data = population_estimates_only,
  hmis_countries = hmis_processed$hmis_countries,
  hmis_iso3 = hmis_processed$hmis_iso3
)

# 3 - calculate the denominators
message("  → Calculating denominators...")
denominators_national <- calculate_denominators(
  hmis_data = hmis_processed$annual_hmis,
  survey_data = survey_processed_national$carried,
  population_data = national_population_processed
)

# 4 - calculate coverage and compare the denominators
message("  → Evaluating coverage by denominator...")
national_coverage_eval <- evaluate_coverage_by_denominator(denominators_national)

# 5 - project survey coverage forward using HMIS deltas
message("  → Projecting coverage forward...")
national_coverage_projected <- project_coverage_from_all(national_coverage_eval$full_ranking,
                                                          survey_raw_long = survey_processed_national$raw_long)


# 6 - prepare results and save
message("  → Preparing combined coverage results...")

combined_national <- prepare_combined_coverage_from_projected(
  projected_data = national_coverage_projected,
  raw_survey_wide = survey_processed_national$raw
)

# 7 - Select ONE chain for ALL target populations (one-chain approach)
# Instead of picking different chains per target population, compare all HMIS chains
# to UNWPP and pick the single chain closest to ratio 1.0.
message("  → Selecting denominator chain...")
selected_chain <- select_best_chain(denominators_national, DENOMINATOR_CHAIN)

# Build indicator → group lookup from the data
indicator_group_lookup <- national_coverage_eval$full_ranking %>%
  distinct(denominator_type, indicator_common_id)

# BCG chain is national-only (not computed at subnational level)
is_chain_national_only <- startsWith(selected_chain$prefix, "dbcg_")

# Build denominator mapping: filter to selected chain's denominators
chain_denoms <- national_coverage_eval$full_ranking %>%
  filter(startsWith(denominator, selected_chain$prefix)) %>%
  distinct(admin_area_1, indicator_common_id, denominator_type, denominator) %>%
  rename(best_denom = denominator) %>%
  mutate(
    second_best_denom = NA_character_,
    best_is_national_only = is_chain_national_only,
    second_is_national_only = NA
  )

national_denominator_mapping <- chain_denoms %>%
  select(admin_area_1, indicator_common_id, denominator_type,
         best_denom, second_best_denom, best_is_national_only, second_is_national_only)

# Print chain summary
message("  → Chain '", selected_chain$chain, "' applied to all indicators:")
national_denominator_mapping %>%
  distinct(denominator_type, best_denom) %>%
  arrange(denominator_type) %>%
  mutate(msg = sprintf("     - [%s] → %s", denominator_type, best_denom)) %>%
  pull(msg) %>%
  walk(message)

# Safety check: if combined_national is empty, skip exports
if (nrow(combined_national) == 0 || !all(c("admin_area_1", "indicator_common_id") %in% names(combined_national))) {
  warning("Combined national data is empty or malformed - skipping main export")
  main_export <- data.frame()
} else if (nrow(national_denominator_mapping) == 0 || !all(c("indicator_common_id", "best_denom") %in% names(national_denominator_mapping))) {
  warning("Denominator mapping is empty or malformed - skipping main export")
  main_export <- data.frame()
} else {
  main_export <- combined_national %>%
    inner_join(
      national_denominator_mapping %>% select(indicator_common_id, best_denom),
      by = "indicator_common_id"
    ) %>%
    filter(denominator == best_denom) %>%
    select(admin_area_1, indicator_common_id, year, denominator,
           coverage_original_estimate, survey_source, survey_source_detail,
           coverage_avgsurveyprojection, coverage_cov)
}

early_survey <- if (nrow(combined_national) > 0) {
  combined_national %>%
    filter(is.na(coverage_cov) & !is.na(coverage_original_estimate)) %>%
    select(admin_area_1, indicator_common_id, year,
           coverage_original_estimate, survey_source, survey_source_detail) %>%
    distinct()
} else {
  data.frame()
} %>%
  mutate(
    denominator = NA_character_,
    coverage_avgsurveyprojection = NA_real_,
    coverage_cov = NA_real_
  ) %>%
  select(indicator_common_id, year,
         coverage_original_estimate, survey_source, survey_source_detail,
         coverage_avgsurveyprojection, coverage_cov)

combined_national_export <- bind_rows(
  if (nrow(main_export) > 0 && "coverage_cov" %in% names(main_export)) {
    main_export %>%
      mutate(coverage_cov = if_else(abs(coverage_cov) < 1e-8, NA_real_, coverage_cov)) %>%
      select(indicator_common_id,
             year,
             coverage_original_estimate,
             survey_source,
             survey_source_detail,
             coverage_avgsurveyprojection,
             coverage_cov)
  } else {
    data.frame()
  },
  if (nrow(early_survey) > 0 && "coverage_cov" %in% names(early_survey)) {
    early_survey %>%
      mutate(coverage_cov = if_else(abs(coverage_cov) < 1e-8, NA_real_, coverage_cov))
  } else {
    data.frame()
  }
)


message("✓ Step 2/6 completed: National data processing finished!")

message("✓ Step 3/6: Finalizing national results")

combined_national_export_fixed <- combined_national_export %>%
  arrange(indicator_common_id, year) %>%
  group_by(indicator_common_id, year) %>%
  summarise(
    coverage_original_estimate = first(coverage_original_estimate),
    survey_source = first(survey_source),
    survey_source_detail = first(survey_source_detail),
    coverage_avgsurveyprojection = first(coverage_avgsurveyprojection),
    coverage_cov = first(coverage_cov),
    .groups = "drop"
  ) %>%
  group_by(indicator_common_id) %>%
  group_modify(~ {
    df <- .x
    df <- df %>% arrange(year)

    # Find last survey year (max year with non-NA coverage_original_estimate)
    last_survey_year <- suppressWarnings(max(df$year[!is.na(df$coverage_original_estimate)], na.rm = TRUE))
    if (is.infinite(last_survey_year)) last_survey_year <- NA

    # Get last survey value
    last_survey_value <- NA_real_
    if (!is.na(last_survey_year)) {
      last_survey_idx <- which(df$year == last_survey_year)[1]
      if (length(last_survey_idx) > 0) {
        last_survey_value <- df$coverage_original_estimate[last_survey_idx]
      }
    }

    # Get coverage_cov at last survey year (for delta calculation)
    baseline_cov <- NA_real_
    if (!is.na(last_survey_year)) {
      last_survey_idx <- which(df$year == last_survey_year)[1]
      if (length(last_survey_idx) > 0) {
        baseline_cov <- df$coverage_cov[last_survey_idx]
      }
    }

    # Keep coverage_original_estimate as-is - preserve all actual survey values

    # Use coverage_avgsurveyprojection if it already exists (from project_coverage_from_all)
    # Otherwise calculate it here
    if ("coverage_avgsurveyprojection" %in% names(df) && any(!is.na(df$coverage_avgsurveyprojection))) {
      # Already calculated - just rename for consistency
      df$avgsurveyprojection <- df$coverage_avgsurveyprojection
    } else {
      # Calculate projections starting FROM last survey year
      # At last survey year: copy survey value
      # After: proj[t] = last_survey_value + (coverage_cov[t] - coverage_cov[last_survey_year])
      df$avgsurveyprojection <- NA_real_

      if (!is.na(last_survey_value) && !is.na(last_survey_year) && !is.na(baseline_cov)) {
        # At last survey year: copy survey value
        df$avgsurveyprojection[df$year == last_survey_year] <- last_survey_value

        # After last survey year: additive projection
        after_survey <- df$year > last_survey_year
        df$avgsurveyprojection[after_survey] <- ifelse(
          !is.na(df$coverage_cov[after_survey]),
          last_survey_value + (df$coverage_cov[after_survey] - baseline_cov),
          NA_real_
        )
      }
    }

    # Store last actual survey year for cleanup later
    df$last_actual_survey_year <- if (!is.na(last_survey_year)) last_survey_year else -Inf
    
    return(df)
  }) %>%
  ungroup() %>%
  select(
    indicator_common_id,
    year,
    coverage_original_estimate,
    survey_source,
    survey_source_detail,
    coverage_avgsurveyprojection = avgsurveyprojection,
    coverage_cov
  )

# Create denominator summary with geographic levels (one-chain approach)
# All indicators use the same chain; subnational = same as national unless chain is national-only
best_denom_summary <- national_denominator_mapping %>%
  mutate(
    denominator_national = if_else(is.na(best_denom), "NOT_AVAILABLE", best_denom),
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


message("✓ Step 3/6 completed: National results finalized!")

# ------------------------------ Subnational Analysis -------------------------
# Run separate analyses for admin_area_2 and admin_area_3 to get distinct output files
if (!is.null(hmis_data_subnational) && !is.null(survey_data_subnational)) {

  message("✓ Step 4/6: Processing subnational data")
  
  # Get admin_area_1 value for consistency
  admin_area_1_value <- adjusted_volume_data %>% distinct(admin_area_1) %>% pull(admin_area_1)
  hmis_data_subnational <- hmis_data_subnational %>% mutate(admin_area_1 = admin_area_1_value)
  
  # Initialize export variables
  combined_admin2_export <- NULL
  combined_admin3_export <- NULL
  
  # === ADMIN_AREA_2 ANALYSIS ===
  if (ANALYSIS_LEVEL %in% c("NATIONAL_PLUS_AA2", "NATIONAL_PLUS_AA2_AA3")) {
    message("  → Processing admin area 2 data...")
    
    # Prepare HMIS admin_area_2 data
    hmis_admin2 <- hmis_data_subnational %>% select(-admin_area_3)
    
    # Run pipeline up to coverage evaluation
    hmis_processed_admin2 <- process_hmis_adjusted_volume(hmis_admin2, SELECTED_COUNT_VARIABLE)

    # SAFEGUARD: Wrap survey processing in tryCatch to handle mismatched data
    survey_processed_admin2 <- tryCatch({
      process_survey_data(survey_data_subnational, hmis_processed_admin2$hmis_countries,
                          hmis_iso3 = hmis_processed_admin2$hmis_iso3,
                          national_reference = survey_processed_national$carried)
    }, error = function(e) {
      message("================================================================================")
      warning("⚠️  MISMATCH: HMIS admin_area_2 does not match survey admin_area_2")
      message("   Actual error: ", e$message)
      message("   HMIS admin_area_2 regions: ", paste(unique(hmis_admin2$admin_area_2), collapse = ", "))
      message("   Survey admin_area_2 regions: ", paste(unique(survey_data_subnational$admin_area_2), collapse = ", "))
      message("================================================================================")
      NULL
    })

    # EDGE CASE DETECTION: Check if HMIS admin_area_3 matches survey admin_area_2
    USE_ADMIN3_AS_ADMIN2 <- FALSE
    if (is.null(survey_processed_admin2) && "admin_area_3" %in% names(hmis_data_subnational)) {
      survey_admin2_regions <- survey_data_subnational %>% distinct(admin_area_2) %>% pull(admin_area_2)
      hmis_admin3_values <- hmis_data_subnational %>%
        filter(!is.na(admin_area_3) & admin_area_3 != "" & admin_area_3 != "ZONE") %>%
        distinct(admin_area_3) %>%
        pull(admin_area_3)

      if (length(hmis_admin3_values) > 0 && length(survey_admin2_regions) > 0) {
        matching_admin3_to_admin2 <- intersect(hmis_admin3_values, survey_admin2_regions)

        if (length(matching_admin3_to_admin2) > 0) {
          message("   ✓ DETECTED: HMIS admin_area_3 matches survey admin_area_2 (",
                  length(matching_admin3_to_admin2), "/", length(hmis_admin3_values), " regions)")
          message("   → Skipping admin_area_2 analysis")
          message("   → Will analyze at admin_area_3 level instead")
          USE_ADMIN3_AS_ADMIN2 <- TRUE

          # Force admin_area_3 processing
          if (ANALYSIS_LEVEL == "NATIONAL_PLUS_AA2") {
            ANALYSIS_LEVEL <- "NATIONAL_PLUS_AA2_AA3"
          }
        }
      }

      if (!USE_ADMIN3_AS_ADMIN2) {
        message("   → Falling back to NATIONAL_ONLY analysis")
        message("   → Please verify ISO3 code and admin area names")
      }
      message("================================================================================")
    }

    # SAFEGUARD: Check if survey processing succeeded
    if (is.null(survey_processed_admin2)) {
      combined_admin2_export <- NULL
    } else {
      denominators_admin2 <- calculate_denominators(hmis_processed_admin2$annual_hmis, survey_processed_admin2$carried)
      coverage_eval_admin2 <- evaluate_coverage_by_denominator(denominators_admin2)

      # Apply national denominator mapping with fallback logic for national-only denominators
      message("  → Applying national denominator selection to admin_area_2...")

      # Apply national mapping with fallback logic
      # Build subnational source lookup from raw survey data (most recent source per region × indicator)
      admin2_source_lookup <- if (!is.null(survey_processed_admin2$raw_long) && nrow(survey_processed_admin2$raw_long) > 0) {
        survey_processed_admin2$raw_long %>%
          select(admin_area_2, year, indicator_common_id, survey_source = source, survey_source_detail = source_detail) %>%
          distinct() %>%
          group_by(admin_area_2, indicator_common_id) %>%
          arrange(desc(year)) %>%
          summarise(
            survey_source = first(survey_source),
            survey_source_detail = first(survey_source_detail),
            .groups = "drop"
          )
      } else NULL

      # Filter to selected chain's denominators (one-chain approach)
      combined_admin2_export <- coverage_eval_admin2$full_ranking %>%
        inner_join(
          national_denominator_mapping %>%
            filter(!best_is_national_only) %>%
            select(indicator_common_id, best_denom),
          by = "indicator_common_id"
        ) %>%
        filter(denominator == best_denom) %>%
        filter(!is.na(coverage)) %>%
        select(admin_area_2, indicator_common_id, year, coverage) %>%
        rename(coverage_cov = coverage)

      # Join survey source info (by region × indicator, not year)
      if (!is.null(admin2_source_lookup)) {
        combined_admin2_export <- combined_admin2_export %>%
          left_join(admin2_source_lookup, by = c("admin_area_2", "indicator_common_id"))
      } else {
        combined_admin2_export$survey_source <- NA_character_
        combined_admin2_export$survey_source_detail <- NA_character_
      }

      message("  → Chain '", selected_chain$chain, "' applied to admin_area_2: ",
              nrow(combined_admin2_export), " result rows")

      # FALLBACK: If admin2 produced 0 results, check for admin3 edge case
      if (nrow(combined_admin2_export) == 0 && "admin_area_3" %in% names(hmis_data_subnational)) {
        message("   → Admin area 2 produced 0 results - checking for admin3 fallback...")

        survey_admin2_regions <- survey_data_subnational %>% distinct(admin_area_2) %>% pull(admin_area_2)
        hmis_admin3_values <- hmis_data_subnational %>%
          filter(!is.na(admin_area_3) & admin_area_3 != "" & admin_area_3 != "ZONE") %>%
          distinct(admin_area_3) %>%
          pull(admin_area_3)

        if (length(hmis_admin3_values) > 0 && length(survey_admin2_regions) > 0) {
          matching_admin3_to_admin2 <- intersect(hmis_admin3_values, survey_admin2_regions)

          if (length(matching_admin3_to_admin2) > 0) {
            message("   ✓ DETECTED: HMIS admin_area_3 matches survey admin_area_2 (",
                    length(matching_admin3_to_admin2), "/", length(hmis_admin3_values), " regions)")
            message("   → Switching to admin_area_3 analysis")
            USE_ADMIN3_AS_ADMIN2 <- TRUE
            ANALYSIS_LEVEL <- "NATIONAL_PLUS_AA2_AA3"
            combined_admin2_export <- NULL  # Clear empty results
          }
        }
      }
    }
  }

  # === ADMIN_AREA_3 ANALYSIS ===
  if (ANALYSIS_LEVEL == "NATIONAL_PLUS_AA2_AA3") {
    message("  → Processing admin area 3 data...")

    # Check if admin_area_3 data is actually usable
    if ("admin_area_3" %in% names(hmis_data_subnational)) {
      # Prepare HMIS admin_area_3 data (rename admin_area_3 to admin_area_2 for pipeline)
      hmis_admin3 <- hmis_data_subnational %>%
        filter(!is.na(admin_area_3) & admin_area_3 != "" & admin_area_3 != "ZONE") %>%
        select(-admin_area_2) %>%
        rename(admin_area_2 = admin_area_3)

      # Capture valid admin_area_3 names (now renamed to admin_area_2) for filtering exports
      valid_admin3_areas <- unique(hmis_admin3$admin_area_2)

      if (nrow(hmis_admin3) > 0) {
        # Run pipeline up to coverage evaluation (skip projection)
        hmis_processed_admin3 <- process_hmis_adjusted_volume(hmis_admin3, SELECTED_COUNT_VARIABLE)

        # VALIDATION: Check if survey and HMIS regions match
        if (exists("USE_ADMIN3_AS_ADMIN2") && USE_ADMIN3_AS_ADMIN2) {
          hmis_regions <- hmis_processed_admin3$annual_hmis %>% distinct(admin_area_2) %>% pull()
          survey_regions <- survey_data_subnational %>% distinct(admin_area_2) %>% pull()
          matching <- intersect(hmis_regions, survey_regions)
          message("   → Admin3 validation: ", length(matching), "/", length(hmis_regions), " HMIS districts match survey regions")
        }

        # SAFEGUARD: Wrap survey processing in tryCatch to handle mismatched data
        survey_processed_admin3 <- tryCatch({
          process_survey_data(survey_data_subnational, hmis_processed_admin3$hmis_countries,
                              hmis_iso3 = hmis_processed_admin3$hmis_iso3,
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

        # SAFEGUARD: Check if survey processing succeeded
        if (is.null(survey_processed_admin3)) {
          combined_admin3_export <- NULL
        } else {
          denominators_admin3 <- calculate_denominators(hmis_processed_admin3$annual_hmis, survey_processed_admin3$carried)
          coverage_eval_admin3 <- evaluate_coverage_by_denominator(denominators_admin3)

          # Apply national denominator mapping with fallback logic for national-only denominators
          message("  → Applying national denominator selection to admin_area_3...")

          # Build subnational source lookup from raw survey data (most recent source per region × indicator)
          admin3_source_lookup <- if (!is.null(survey_processed_admin3$raw_long) && nrow(survey_processed_admin3$raw_long) > 0) {
            survey_processed_admin3$raw_long %>%
              select(admin_area_2, year, indicator_common_id, survey_source = source, survey_source_detail = source_detail) %>%
              distinct() %>%
              group_by(admin_area_2, indicator_common_id) %>%
              arrange(desc(year)) %>%
              summarise(
                survey_source = first(survey_source),
                survey_source_detail = first(survey_source_detail),
                .groups = "drop"
              )
          } else NULL

          # Filter to selected chain's denominators (one-chain approach)
          combined_admin3_export <- coverage_eval_admin3$full_ranking %>%
            inner_join(
              national_denominator_mapping %>%
                filter(!best_is_national_only) %>%
                select(indicator_common_id, best_denom),
              by = "indicator_common_id"
            ) %>%
            filter(denominator == best_denom) %>%
            filter(!is.na(coverage)) %>%
            filter(admin_area_2 %in% valid_admin3_areas) %>%
            select(admin_area_2, indicator_common_id, year, coverage) %>%
            rename(admin_area_3 = admin_area_2, coverage_cov = coverage)

          # Join survey source info (by region × indicator, not year)
          if (!is.null(admin3_source_lookup)) {
            combined_admin3_export <- combined_admin3_export %>%
              left_join(admin3_source_lookup %>% rename(admin_area_3 = admin_area_2),
                        by = c("admin_area_3", "indicator_common_id"))
          } else {
            combined_admin3_export$survey_source <- NA_character_
            combined_admin3_export$survey_source_detail <- NA_character_
          }

          message("  → Chain '", selected_chain$chain, "' applied to admin_area_3: ",
                  nrow(combined_admin3_export), " result rows")
        }
      } else {
        message("  → No usable admin_area_3 data found")
      }
    } else {
      message("  → No admin_area_3 column found in HMIS data")
    }
  }

  
  message("✓ Step 4/6 completed: Subnational analysis finished!")

} else {
  message("✓ Step 4/6 completed: No subnational analysis (national only)!")
  combined_admin2_export <- NULL
  combined_admin3_export <- NULL
}

message("✓ Step 5/6: Finalizing results and preparing outputs")

# ------------------------------ Write Output Files -------------------------
# Removed: pnc1_mother back-renaming (no longer needed)

message("✓ Step 5/6 completed: Results finalized!")

message("✓ Step 6/6: Saving output files")

# Write national CSV
message("  → Saving national results...")
write.csv(combined_national_export_fixed %>% select(-any_of(c("iso3_code", "survey_source", "survey_source_detail"))), "M4_coverage_estimation.csv", row.names = FALSE, fileEncoding = "UTF-8")
message("✓ Saved national results: M4_coverage_estimation.csv")

# Best denominator summary
message("  → Saving denominator summary...")
write.csv(best_denom_summary %>% select(-any_of("iso3_code")), "M4_selected_denominator_per_indicator.csv", row.names = FALSE)
message("✓ Saved denominator summary: M4_selected_denominator_per_indicator.csv")

# Write admin_area_2 CSV
message("  → Saving subnational results...")
if (exists("combined_admin2_export") &&
    is.data.frame(combined_admin2_export) &&
    nrow(combined_admin2_export) > 0) {
  write.csv(combined_admin2_export %>% select(-any_of(c("iso3_code", "survey_source", "survey_source_detail"))), "M4_coverage_estimation_admin_area_2.csv", row.names = FALSE, fileEncoding = "UTF-8")
  message("✓ Saved admin_area_2 results: ", nrow(combined_admin2_export), " rows")
} else {
  # Create empty file
  dummy_data_admin2 <- data.frame(admin_area_2 = character(), indicator_common_id = character(),
                                  year = numeric(), coverage_cov = numeric())
  write.csv(dummy_data_admin2, "M4_coverage_estimation_admin_area_2.csv", row.names = FALSE)
  message("✓ No admin_area_2 results - saved empty file")
}

# Write admin_area_3 CSV
if (exists("combined_admin3_export") &&
    is.data.frame(combined_admin3_export) &&
    nrow(combined_admin3_export) > 0) {
  write.csv(combined_admin3_export %>% select(-any_of(c("iso3_code", "survey_source", "survey_source_detail"))), "M4_coverage_estimation_admin_area_3.csv", row.names = FALSE, fileEncoding = "UTF-8")
  message("✓ Saved admin_area_3 results: ", nrow(combined_admin3_export), " rows")
} else {
  # Create empty file
  dummy_data_admin3 <- data.frame(admin_area_3 = character(), indicator_common_id = character(),
                                  year = numeric(), coverage_cov = numeric())
  write.csv(dummy_data_admin3, "M4_coverage_estimation_admin_area_3.csv", row.names = FALSE)
  message("✓ No admin_area_3 results - saved empty file")
}


message("✓ Step 6/6 completed: All output files saved!")

message("\n================================================================================")
message("✓ COVERAGE ESTIMATION ANALYSIS COMPLETE!")
message("================================================================================")
message("Analysis level: ", ANALYSIS_LEVEL)
if (exists("original_level") && original_level != ANALYSIS_LEVEL) {
  message("  (Originally requested: ", original_level, ", adjusted due to data availability)")
}
message("\nOutput files:")
message("  - M4_coverage_estimation.csv (national)")
message("  - M4_coverage_estimation_admin_area_2.csv (zone/province level)")
message("  - M4_coverage_estimation_admin_area_3.csv (district level)")
message("  - M4_selected_denominator_per_indicator.csv (denominator summary)")
message("================================================================================")

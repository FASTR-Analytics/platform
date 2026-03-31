COUNTRY_ISO3 <- "ZMB"
OUTLIER_PROPORTION_THRESHOLD <- 0.8  # Proportion threshold for outlier detection
MINIMUM_COUNT_THRESHOLD <- 100       # Minimum count threshold for consideration
MADS <- 10                           # Number of MADs
GEOLEVEL <- "admin_area_3"           # Admin level used to join facilities to corresponding geo-consistency
DQA_INDICATORS <- c("penta1", "anc1", "opd")
CONSISTENCY_PAIRS_USED <- c("penta", "anc")  # current options: "penta", "anc", "delivery", "malaria"


PROJECT_DATA_HMIS <- "hmis_ZMB.csv"

#-------------------------------------------------------------------------------------------------------------
# CB - R code FASTR PROJECT
# Last edit: 2026 Jan 06
# Module: DATA QUALITY ASSESSMENT

# This script is designed to evaluate the reliability of HMIS data by
# examining three key components: outliers, completeness, and consistency.  

# Ce script est conçu pour évaluer la fiabilité des données du HMIS en analysant 
# trois éléments clés : la détection des valeurs aberrantes, l’évaluation de la complétude et la mesure de la cohérence.


# ------------------------------------- PARAMETERS -----------------------------------------------------------
# Consistency pair indicator definitions
PAIR_PENTA_A    <- "penta1"
PAIR_PENTA_B    <- "penta3"
PAIR_ANC_A      <- "anc1"
PAIR_ANC_B      <- "anc4"
PAIR_DELIVERY_A <- "bcg"
# Dynamic rule: will be set to "delivery" if available, otherwise "sba"
PAIR_DELIVERY_B <- NULL  # Will be determined dynamically based on available indicators
PAIR_MALARIA_A  <- "rdt_positive_plus_micro"
PAIR_MALARIA_B  <- "confirmed_malaria_treated_with_act"

# Outlier Analysis Parameters
outlier_params <- list(
  outlier_pc_threshold = OUTLIER_PROPORTION_THRESHOLD,  # Threshold for proportional contribution to flag outliers
  count_threshold = MINIMUM_COUNT_THRESHOLD             # Minimum count to consider for outlier adjustment
)


# Consistency Analysis Parameters
# Edit July 30 - for anc and penta.. allow the later contact to be up to 5% higher before flagging as inconsistent
all_consistency_ranges <- list(
  pair_penta    = c(lower = 0.95, upper = Inf),
  pair_anc      = c(lower = 0.95, upper = Inf),
  pair_delivery = c(lower = 0.7, upper = 1.3),
  pair_malaria  = c(lower = 0.9, upper = 1.1)
)

# Note: all_consistency_pairs and consistency_params will be created dynamically
# after data loading to allow for dynamic selection of delivery vs sba


# DQA Rules
default_dqa_ind <- DQA_INDICATORS


dqa_rules <- list(
  completeness = 1,   # Completeness must be flagged as 1
  outlier_flag = 0,   # Outliers must not be flagged
  sconsistency = 1    # Consistency must be flagged as 1
)

# ------------------------------------- KEY OUTPUTS ----------------------------------------------------------
# FILE: M1_output_outliers.csv             # Detailed facility-level data with identified outliers and adjusted volumes.
# FILE: M1_output_completeness.csv         # Facility-level completeness data in a detailed long format, including reported and expected months.
# FILE: M1_output_consistency_geo.csv      # District-level consistency results - use in visualizer
# FILE: M1_facility_dqa.csv                # Facility-level results from DQA analysis.

# Load Required Libraries ------------------------------------------------------------------------------------
library(zoo)
library(stringr)
library(dplyr)       
library(tidyr)
library(data.table)

# Define Functions ------------------------------------------------------------------------------------------
load_and_preprocess_data <- function(file_path) {
  print("Loading and preprocessing data...")
  
  data <- read.csv(file_path) %>%
    mutate(
      # trust period_id is YYYYMM integer or string; coerce to Date for ordering only
      period_id = as.integer(period_id),
      date = as.Date(sprintf("%04d-%02d-01", period_id %/% 100, period_id %% 100))
    )
  
  geo_cols <- colnames(data)[grepl("^admin_area_", colnames(data))]
  
  # Optional: Add malaria consistency composite if both components exist
  malaria_indicators <- c("rdt_positive", "micro_positive", "confirmed_malaria_treated_with_act")
  available_malaria <- malaria_indicators %in% unique(data$indicator_common_id)
  
  if (all(available_malaria)) {
    print("Adding malaria consistency indicator: rdt_positive_plus_micro")
    
    malaria_sum <- data %>%
      filter(indicator_common_id %in% c("rdt_positive", "micro_positive")) %>%
      group_by(facility_id, period_id, across(all_of(geo_cols))) %>%
      summarise(count = sum(count, na.rm = TRUE), .groups = "drop") %>%
      mutate(
        indicator_common_id = "rdt_positive_plus_micro",
        # ensure date exists for downstream ordering
        date = as.Date(sprintf("%04d-%02d-01", period_id %/% 100, period_id %% 100))
      )
    
    data <- bind_rows(data, malaria_sum)
  } else {
    print("Skipping malaria consistency: one or more indicators missing")
  }
  
  return(list(data = data, geo_cols = geo_cols))
}

# Function to validate admin areas for result objects
detect_admin_cols <- function(data) {
  geo_cols_export <- grep("^admin_area_[2-9]$", colnames(data), value = TRUE)
  
  print(paste("Detected admin area columns for export:", paste(geo_cols_export, collapse = ", ")))
  return(geo_cols_export)
}

# Function to validate consistency pairs
validate_consistency_pairs <- function(consistency_params, data) {
  print("Validating consistency pairs based on available indicators...")

  # Early return if no consistency pairs were specified
  if (length(consistency_params$consistency_pairs) == 0) {
    message("No consistency pairs specified. Skipping consistency analysis.")
    return(consistency_params)
  }

  if (!"indicator_common_id" %in% names(data)) {
    stop("Column 'indicator_common_id' not found in input data.")
  }

  available_indicators <- unique(data$indicator_common_id)
  consistency_pairs_names <- names(consistency_params$consistency_pairs)
  
  valid_consistency_pairs <- consistency_params$consistency_pairs[sapply(
    consistency_params$consistency_pairs, 
    function(pair) all(pair %in% available_indicators)
  )]
  
  consistency_params$consistency_pairs <- valid_consistency_pairs
  consistency_params$consistency_ranges <- consistency_params$consistency_ranges[names(valid_consistency_pairs)]
  
  if (length(valid_consistency_pairs) < length(consistency_pairs_names)) {
    removed_pairs <- setdiff(consistency_pairs_names, names(valid_consistency_pairs))
    warning(paste("The following consistency pairs were removed due to missing indicators:", 
                  paste(removed_pairs, collapse = ", ")))
  }
  
  if (length(valid_consistency_pairs) == 0) {
    message("No valid consistency pairs found. Skipping consistency analysis.")
  }

  return(consistency_params)
}

# PART 1 OUTLIERS ----------------------------------------------------------------------------------------------
outlier_analysis <- function(data, geo_cols, outlier_params) {
  print("Performing outlier analysis...")
  
  # median + MAD by facility × indicator
  data <- data %>%
    group_by(facility_id, indicator_common_id) %>%
    mutate(median_volume = median(count, na.rm = TRUE)) %>%
    ungroup() %>%
    group_by(facility_id, indicator_common_id) %>%
    mutate(
      mad_volume   = ifelse(!is.na(count), mad(count[count >= median_volume], na.rm = TRUE), NA_real_),
      mad_residual = ifelse(!is.na(mad_volume) & mad_volume > 0, abs(count - median_volume) / mad_volume, NA_real_),
      outlier_mad  = ifelse(!is.na(mad_residual) & mad_residual > MADS, 1L, 0L)
    ) %>%
    ungroup()
  
  # proportional contribution within calendar year (derived from period_id)
  data <- data %>%
    mutate(year_key = period_id %/% 100L) %>%  # transient
    group_by(facility_id, indicator_common_id, year_key) %>%
    mutate(
      pc = count / sum(count, na.rm = TRUE),
      outlier_pc = ifelse(!is.na(pc) & pc > outlier_params$outlier_pc_threshold, 1L, 0L)
    ) %>%
    ungroup() %>%
    select(-year_key)
  
  # combine flags
  data <- data %>%
    mutate(
      outlier_flag = ifelse((outlier_mad == 1L | outlier_pc == 1L) & count > outlier_params$count_threshold, 1L, 0L)
    )
  
  # export (period_id only; no year/quarter_id)
  outlier_data <- data %>%
    select(
      facility_id, all_of(geo_cols), indicator_common_id, period_id, count,
      median_volume, mad_volume, mad_residual, outlier_mad, pc, outlier_flag
    )
  
  return(outlier_data)
}

# PART 2-A Consistency Analysis - Geo Level -----------------------------------------------------------------
geo_consistency_analysis <- function(data, geo_cols, geo_level, consistency_params) {
  required_pairs     <- consistency_params$consistency_pairs
  consistency_ranges <- consistency_params$consistency_ranges
  
  geo_levels <- c("admin_area_1","admin_area_2","admin_area_3","admin_area_4","admin_area_5","admin_area_6","admin_area_7","admin_area_8")
  relevant_geo_cols <- geo_levels[seq_len(match(geo_level, geo_levels, nomatch = length(geo_levels)))]
  relevant_geo_cols <- intersect(relevant_geo_cols, geo_cols)
  
  # drop outliers
  data <- data %>% mutate(count = ifelse(outlier_flag == 1, NA_real_, count))
  
  # aggregate to selected geo level per period_id
  aggregated_data <- data %>%
    group_by(across(all_of(c(relevant_geo_cols, "indicator_common_id", "period_id")))) %>%
    summarise(count = sum(count, na.rm = TRUE), .groups = "drop")
  
  # wide per period_id
  wide_data <- aggregated_data %>%
    pivot_wider(
      id_cols = c(all_of(relevant_geo_cols), period_id),
      names_from = "indicator_common_id",
      values_from = "count",
      values_fill = list(count = NA_real_)
    )
  
  print("Checking available indicators in dataset...")
  print(unique(data$indicator_common_id))
  
  pair_results <- list()
  for (pair_name in names(required_pairs)) {
    pair <- required_pairs[[pair_name]]
    col1 <- pair[1]; col2 <- pair[2]
    
    if (all(c(col1, col2) %in% colnames(wide_data))) {
      range <- consistency_ranges[[pair_name]]
      if (is.list(range)) {
        lower_bound <- range$lower; upper_bound <- range$upper
      } else if (is.vector(range) && !is.null(names(range))) {
        lower_bound <- as.numeric(range["lower"]); upper_bound <- as.numeric(range["upper"])
      } else {
        lower_bound <- NA_real_; upper_bound <- NA_real_
        warning(paste("Unexpected range structure for:", pair_name))
      }
      
      pair_data <- wide_data %>%
        mutate(
          ratio_type = pair_name,
          consistency_ratio = if_else(.data[[col2]] > 0, .data[[col1]] / .data[[col2]], NA_real_),
          sconsistency = case_when(
            !is.na(consistency_ratio) & consistency_ratio >= lower_bound & consistency_ratio <= upper_bound ~ 1L,
            !is.na(consistency_ratio) ~ 0L,
            TRUE ~ NA_integer_
          )
        ) %>%
        select(all_of(relevant_geo_cols), period_id, ratio_type, consistency_ratio, sconsistency)
      
      pair_results[[pair_name]] <- pair_data
    } else {
      print(paste("Skipping pair - missing columns:", col1, col2))
    }
  }
  
  combined_data <- bind_rows(pair_results) %>%
    mutate(sconsistency = as.integer(sconsistency))
  
  return(combined_data)
}

expand_geo_consistency_to_facilities <- function(facility_metadata, geo_consistency_results, geo_level) {
  print(paste("Expanding geo-level consistency results using:", geo_level, "..."))
  # Detect all available geographic levels in `facility_metadata`
  available_geo_levels <- grep("^admin_area_[0-9]+$", colnames(facility_metadata), value = TRUE)
  
  # Ensure the chosen geo_level exists, fallback to the lowest available level if missing
  if (!(geo_level %in% available_geo_levels)) {
    geo_level <- tail(sort(available_geo_levels), 1)  # Pick the lowest available (highest number)
    print(paste("Chosen geo_level not found! Falling back to:", geo_level))
  } else {
    print(paste("Using user-specified geo_level:", geo_level))
  }
  # Step 1: Extract facility list with the specified geographic level
  facility_list <- facility_metadata %>%
    select(facility_id, all_of(geo_level)) %>%
    distinct()

  
  # Step 2: Expand geo consistency results by duplicating values across all facilities in the same area
  facility_consistency_results <- facility_list %>%
    left_join(geo_consistency_results, by = geo_level, relationship = "many-to-many")
  
  print("Successfully expanded geo-level consistency results to all facilities")
  return(facility_consistency_results)
}

# PART 3 COMPLETENESS ---------------------------------------------------------------------------------------
# Function to generate full time series per indicator
generate_full_series_per_indicator <- function(outlier_data, indicator_id, timeframe) {
  print(paste("Processing indicator:", indicator_id))
  
  indicator_subset <- outlier_data[indicator_common_id == indicator_id, .(facility_id, indicator_common_id, period_id, count)]
  print(paste("Subset data size for", indicator_id, ":", nrow(indicator_subset)))
  
  time_range <- timeframe[indicator_common_id == indicator_id]
  first_pid <- time_range$first_pid
  last_pid  <- time_range$last_pid
  
  # build monthly period_id sequence between first_pid and last_pid
  month_seq_dates <- seq(
    from = as.Date(sprintf("%04d-%02d-01", first_pid %/% 100, first_pid %% 100)),
    to   = as.Date(sprintf("%04d-%02d-01",  last_pid %/% 100,  last_pid %% 100)),
    by = "1 month"
  )
  month_seq_pid <- as.integer(format(month_seq_dates, "%Y%m"))
  
  complete_grid <- CJ(
    facility_id = unique(indicator_subset$facility_id),
    period_id   = month_seq_pid
  )[, `:=`(indicator_common_id = indicator_id,
           date = as.Date(sprintf("%04d-%02d-01", period_id %/% 100, period_id %% 100)))]
  
  indicator_subset[, date := as.Date(sprintf("%04d-%02d-01", period_id %/% 100, period_id %% 100))]
  
  complete_data <- merge(
    complete_grid, indicator_subset,
    by = c("facility_id", "indicator_common_id", "period_id", "date"),
    all.x = TRUE
  )[, .(facility_id, indicator_common_id, period_id, date, count)]
  
  print(paste("Merged data size for", indicator_id, ":", nrow(complete_data)))
  return(complete_data)
}

# Main processing function
process_completeness <- function(outlier_data_main) {
  print("Starting completeness processing...")
  setDT(outlier_data_main)
  
  # ensure period_id int and date exist
  outlier_data_main[, period_id := as.integer(period_id)]
  outlier_data_main[, date := as.Date(sprintf("%04d-%02d-01", period_id %/% 100, period_id %% 100))]
  
  # first/last period_id per indicator
  indicator_timeframe <- outlier_data_main[, .(
    first_pid = min(period_id, na.rm = TRUE),
    last_pid  = max(period_id, na.rm = TRUE)
  ), by = indicator_common_id]
  
  print(paste("Identified timeframes for", nrow(indicator_timeframe), "indicators"))
  
  geo_lookup <- unique(outlier_data_main[, .SD, .SDcols = c("facility_id", geo_cols)])
  
  completeness_list <- lapply(unique(outlier_data_main$indicator_common_id), function(ind) {
    print(paste("Starting processing for indicator:", ind))
    complete_data <- generate_full_series_per_indicator(outlier_data_main, ind, indicator_timeframe)
    
    print(paste("Applying completeness tagging for", ind))
    setorder(complete_data, facility_id, date)
    
    complete_data[, has_reported := !is.na(count), by = facility_id]
    complete_data[, first_report_idx := cumsum(has_reported) > 0, by = facility_id]
    complete_data[, last_report_idx  := rev(cumsum(rev(has_reported)) > 0), by = facility_id]
    
    complete_data[, missing_group := rleid(has_reported), by = facility_id]
    complete_data[, missing_count := .N, by = .(facility_id, missing_group)]
    
    complete_data[, offline_flag := fifelse(
      (missing_group == 1 & missing_count >= 6 & !first_report_idx) |
        (missing_group == max(missing_group) & missing_count >= 6 & !last_report_idx),
      2L, 0L
    ), by = facility_id]
    
    complete_data[, completeness_flag := fifelse(
      offline_flag == 2L, 2L, fifelse(has_reported, 1L, 0L)
    ), by = facility_id]
    
    complete_data <- merge(complete_data, geo_lookup, by = "facility_id", all.x = TRUE)
    
    result <- complete_data[completeness_flag != 2L,
                            c("facility_id","indicator_common_id","period_id","completeness_flag", geo_cols),
                            with = FALSE]
    print(paste("Final dataset size for", ind, ":", nrow(result)))
    return(result)
  })
  
  print("Combining all indicator datasets...")
  completeness_long <- rbindlist(completeness_list, use.names = TRUE, fill = TRUE)
  if ("facility_id.1" %in% colnames(completeness_long)) {
    completeness_long <- completeness_long[, !("facility_id.1"), with = FALSE]
  }
  print("Completeness processing finished!")
  return(completeness_long)
}

# PART 4 DQA ------------------------------------------------------------------------------------------------
# 1. dqa_with_consistency: Includes consistency checks
# 2. dqa_without_consistency: Excludes consistency checks

# DQA Function Including Consistency Checks
dqa_with_consistency <- function(
    completeness_data,
    consistency_data,
    outlier_data,
    geo_cols,
    dqa_rules
) {
  print("Performing DQA analysis with strict consistency checks...")
  
  completeness_data <- completeness_data %>%
    filter(indicator_common_id %in% dqa_indicators_to_use)
  
  outlier_data <- outlier_data %>%
    filter(indicator_common_id %in% dqa_indicators_to_use)
  
  merged_data <- completeness_data %>%
    left_join(
      outlier_data %>% select(facility_id, indicator_common_id, period_id, all_of(geo_cols), outlier_flag),
      by = c("facility_id", "indicator_common_id", "period_id", geo_cols)
    ) %>%
    mutate(
      outlier_flag = replace_na(outlier_flag, 0L),
      completeness_pass = ifelse(completeness_flag == dqa_rules$completeness, 1L, 0L),
      outlier_pass      = ifelse(outlier_flag       == dqa_rules$outlier_flag, 1L, 0L)
    )
  
  dqa_facility_month <- merged_data %>%
    group_by(facility_id, period_id, !!!syms(geo_cols)) %>%
    summarise(
      total_indicator_points = sum(completeness_pass + outlier_pass, na.rm = TRUE),
      max_points = 2L * length(dqa_indicators_to_use),
      completeness_outlier_score = total_indicator_points / max_points,
      dqa_outlier_completeness   = ifelse(total_indicator_points == max_points, 1L, 0L),
      .groups = "drop"
    )
  
  dqa_data <- dqa_facility_month %>%
    left_join(
      consistency_expanded %>% select(facility_id, period_id, starts_with("pair_")),
      by = c("facility_id","period_id")
    )
    # Don't replace NA with 0 - NA means indicator doesn't exist and should be excluded from scoring
  
  if ("pair_delivery" %in% colnames(dqa_data)) {
    dqa_data <- dqa_data %>% select(-pair_delivery)
  }
  
  consistency_cols <- grep("^pair_", names(dqa_data), value = TRUE)

  dqa_data <- dqa_data %>%
    mutate(
      # Count how many consistency pairs are actually scoreable (not NA - meaning indicator exists)
      pairs_available = if (length(consistency_cols) > 0)
        rowSums(!is.na(across(all_of(consistency_cols)))) else 0L,

      # Count passing scores (only from available pairs)
      total_consistency_pass = if (length(consistency_cols) > 0)
        rowSums(across(all_of(consistency_cols)) == 1L, na.rm = TRUE) else 0L,

      # Divide by AVAILABLE pairs, not total pairs (excludes missing indicators from denominator)
      # If no pairs available (all denominators = 0), score as 0 (fail - can't verify consistency)
      consistency_score = ifelse(pairs_available > 0,
                                  total_consistency_pass / pairs_available,
                                  0),

      # Pass only if ALL available pairs pass
      all_pairs_pass = ifelse(pairs_available > 0 & total_consistency_pass == pairs_available, 1L, 0L),

      dqa_mean = (completeness_outlier_score + consistency_score) / 2,

      # DQA score = 1 only when ALL conditions pass: completeness, outliers, AND consistency
      dqa_score = ifelse(completeness_outlier_score == 1 & all_pairs_pass == 1, 1L, 0L)
    ) %>%
    select(all_of(geo_cols), facility_id, period_id,
           completeness_outlier_score, consistency_score, dqa_mean, dqa_score)
  
  return(dqa_data)
}

dqa_without_consistency <- function(
    completeness_data,
    outlier_data,
    geo_cols,
    dqa_rules
) {
  print("Performing DQA analysis without consistency checks...")
  
  completeness_data <- completeness_data %>%
    filter(indicator_common_id %in% dqa_indicators_to_use)
  
  outlier_data <- outlier_data %>%
    filter(indicator_common_id %in% dqa_indicators_to_use)
  
  merged_data <- completeness_data %>%
    left_join(
      outlier_data %>% select(facility_id, indicator_common_id, period_id, all_of(geo_cols), outlier_flag),
      by = c("facility_id", "indicator_common_id", "period_id", geo_cols)
    ) %>%
    mutate(
      outlier_flag       = replace_na(outlier_flag, 0L),
      completeness_pass  = ifelse(completeness_flag == dqa_rules$completeness, 1L, 0L),
      outlier_pass       = ifelse(outlier_flag       == dqa_rules$outlier_flag, 1L, 0L)
    )
  
  dqa_results <- merged_data %>%
    group_by(facility_id, period_id, !!!syms(geo_cols)) %>%
    summarise(
      total_indicator_points = sum(completeness_pass + outlier_pass, na.rm = TRUE),
      max_points = 2L * length(dqa_indicators_to_use),
      completeness_outlier_score = total_indicator_points / max_points,
      dqa_mean   = total_indicator_points / max_points,  # Same as completeness_outlier_score when no consistency checks
      dqa_score  = ifelse(total_indicator_points == max_points, 1L, 0L),
      .groups = "drop"
    )

  return(dqa_results)
}

# ------------------- Main Execution ----------------------------------------------------------------------------
inputs <- load_and_preprocess_data(PROJECT_DATA_HMIS)
data <- inputs$data
geo_cols <- inputs$geo_cols

geo_columns_export <- detect_admin_cols(data)

# Dynamic rule: Set PAIR_DELIVERY_B based on available indicators
available_indicators <- unique(data$indicator_common_id)
if ("delivery" %in% available_indicators) {
  PAIR_DELIVERY_B <- "delivery"
  print("Using 'delivery' for PAIR_DELIVERY_B")
} else if ("sba" %in% available_indicators) {
  PAIR_DELIVERY_B <- "sba"
  print("Using 'sba' for PAIR_DELIVERY_B (delivery not found)")
} else {
  PAIR_DELIVERY_B <- "delivery"  # Default fallback
  print("Neither 'delivery' nor 'sba' found - defaulting to 'delivery'")
}

# Update the consistency pairs with the dynamically selected delivery indicator
all_consistency_pairs <- list(
  pair_penta    = c(PAIR_PENTA_A, PAIR_PENTA_B),
  pair_anc      = c(PAIR_ANC_A, PAIR_ANC_B),
  pair_delivery = c(PAIR_DELIVERY_A, PAIR_DELIVERY_B),
  pair_malaria  = c(PAIR_MALARIA_A, PAIR_MALARIA_B)
)

# Dynamically select only specified pairs
consistency_params <- list(
  consistency_pairs  = all_consistency_pairs[names(all_consistency_pairs) %in% paste0("pair_", CONSISTENCY_PAIRS_USED)],
  consistency_ranges = all_consistency_ranges[names(all_consistency_ranges) %in% paste0("pair_", CONSISTENCY_PAIRS_USED)]
)

# Validate Consistency Pairs
consistency_params <- validate_consistency_pairs(consistency_params, data)


# Dynamically set DQA_INDICATORS based on available indicators
dqa_indicators_to_use <- intersect(DQA_INDICATORS, unique(data$indicator_common_id))

# Ensure DQA_INDICATORS is empty if none of the key indicators exist
if (length(dqa_indicators_to_use) == 0) {
  dqa_indicators_to_use <- character(0)  # Empty vector
}

print(paste("DQA indicators selected:", ifelse(length(dqa_indicators_to_use) > 0, paste(dqa_indicators_to_use, collapse = ", "), "None found")))

# Run Outlier Analysis
print("Running outlier analysis...")
outlier_data_main <- outlier_analysis(data, geo_cols, outlier_params)

# Prepare Completeness Analysis
print("Running completeness analysis...")
completeness_results <- process_completeness(outlier_data_main)

# Run consistency analysis
geo_cols_filtered <- setdiff(geo_cols, "facility_id")

# Extract unique facilities and their geo/admin_area columns
facility_metadata <- completeness_results %>%
  select(any_of(c("facility_id", geo_cols_filtered))) %>%
  distinct()

# Run Consistency Analysis (if applicable)
if (length(consistency_params$consistency_pairs) > 0) {
  print("Running consistency analysis...")
  geo_consistency_results <- geo_consistency_analysis(
    data = outlier_data_main, 
    geo_cols = geo_cols, 
    geo_level = GEOLEVEL,
    consistency_params = consistency_params
  )
  
  # Only proceed if we got valid results
  if (!is.null(geo_consistency_results) && nrow(geo_consistency_results) > 0) {
    print("Expanding geo-level consistency results to facilities...")
    facility_consistency_results <- expand_geo_consistency_to_facilities(
      facility_metadata = facility_metadata,  
      geo_consistency_results = geo_consistency_results,  
      geo_level = GEOLEVEL  
    )
    
    # Create consistency_expanded by pivoting the facility results
    if (!is.null(facility_consistency_results) && nrow(facility_consistency_results) > 0) {
      print("Creating expanded consistency dataset...")
      consistency_expanded <- facility_consistency_results %>%
        pivot_wider(
          id_cols = c(facility_id, period_id, any_of(geo_cols)),
          names_from = ratio_type,
          values_from = sconsistency,
          values_fill = list(sconsistency = NA_integer_)  # Keep NA for missing indicators
        ) %>%
        # Don't replace NA with 0 - NA means indicator doesn't exist, should be excluded from scoring
        distinct(facility_id, period_id, .keep_all = TRUE)
    } else {
      consistency_expanded <- NULL
    }
  } else {
    print("No valid geo consistency results generated.")
    facility_consistency_results <- NULL
    consistency_expanded <- NULL
  }
} else {
  print("No valid consistency pairs found. Skipping consistency analysis...")
  facility_consistency_results <- NULL
  consistency_expanded <- NULL
}

# Check if we should run DQA at all
run_dqa <- length(dqa_indicators_to_use) > 0

# RUN Data Quality Assessment (DQA) - only if required indicators are available
if (run_dqa) {
  if (!is.null(consistency_expanded)) {
    print("Running DQA analysis with consistency checks...")
    dqa_results <- dqa_with_consistency(
      completeness_data = completeness_results,
      consistency_data = consistency_expanded,
      outlier_data = outlier_data_main,
      geo_cols = geo_cols,
      dqa_rules = dqa_rules
      # REMOVED: available_indicators = dqa_indicators_to_use
    )
  } else {
    print("Running DQA analysis without consistency checks...")
    dqa_results <- dqa_without_consistency(  # FIXED: was dqa_lite_analysis
      completeness_data = completeness_results,
      outlier_data = outlier_data_main,
      geo_cols = geo_cols,
      dqa_rules = dqa_rules
      # REMOVED: available_indicators = dqa_indicators_to_use
    )
  }
} else {
  print("Skipping DQA analysis - none of the required indicators found in dataset.")
  print(paste("Required indicators:", paste(DQA_INDICATORS, collapse = ", ")))
  print(paste("Available indicators:", paste(unique(data$indicator_common_id), collapse = ", ")))
  dqa_results <- NULL
}

# -------------------------------- SAVE DATA OUTPUTS ------------------------------------------------------------
print("Preparing and saving outlier list...")

outlier_list_export <- outlier_data_main %>%
  filter(outlier_flag == 1) %>%
  select(facility_id, 
         all_of(geo_columns_export), 
         indicator_common_id, 
         period_id, 
         count)

write.csv(outlier_list_export, "M1_output_outlier_list.csv", row.names = FALSE)


print("Preparing and saving results from outlier analysis...")

outlier_data_export <- outlier_data_main %>%
  select(facility_id,
         all_of(geo_columns_export),
         period_id,
         indicator_common_id,
         outlier_flag)

write.csv(outlier_data_export, "M1_output_outliers.csv", row.names = FALSE)


# Save consistency results with dummy data if needed
if (!is.null(facility_consistency_results) && nrow(facility_consistency_results) > 0) {
  print("Preparing and saving consistency analysis results...")
  
  # Prepare geo-level output
  if (!is.null(geo_consistency_results) && nrow(geo_consistency_results) > 0) {
    # Detect available admin columns dynamically
    geo_cols_for_export <- detect_admin_cols(geo_consistency_results)
    
    geo_consistency_export <- geo_consistency_results %>%
      select(
        all_of(geo_cols_for_export),  # Dynamic geo columns
        period_id,
        ratio_type,
        sconsistency
      )
    write.csv(geo_consistency_export, "M1_output_consistency_geo.csv", row.names = FALSE)
  } else {
    # Create dummy geo consistency data with fallback admin columns
    dummy_geo_consistency <- data.frame(
      admin_area_3 = character(0),
      admin_area_2 = character(0),
      period_id = integer(0),
      ratio_type = character(0),
      sconsistency = integer(0)
    )
    write.csv(dummy_geo_consistency, "M1_output_consistency_geo.csv", row.names = FALSE)
  }
  
  # Prepare facility-level output
  # Detect available admin columns dynamically
  facility_geo_cols_for_export <- detect_admin_cols(facility_consistency_results)
  print(facility_geo_cols_for_export)
  
  facility_consistency_export <- facility_consistency_results %>%
    select(
      facility_id,
      all_of(facility_geo_cols_for_export),  # Dynamic geo columns
      period_id,
      ratio_type,
      sconsistency
    )
  write.csv(facility_consistency_export, "M1_output_consistency_facility.csv", row.names = FALSE)
  
} else {
  print("No consistency results to save - creating dummy files with headers...")
  
  # Create dummy geo consistency data with fallback admin columns
  dummy_geo_consistency <- data.frame(
    admin_area_3 = character(0),
    admin_area_2 = character(0),
    period_id = integer(0),
    ratio_type = character(0),
    sconsistency = integer(0)
  )
  write.csv(dummy_geo_consistency, "M1_output_consistency_geo.csv", row.names = FALSE)
  
  # Create dummy facility consistency data with fallback admin columns
  dummy_facility_consistency <- data.frame(
    facility_id = character(0),
    admin_area_3 = character(0),
    admin_area_2 = character(0),
    period_id = integer(0),
    ratio_type = character(0),
    sconsistency = integer(0)
  )
  write.csv(dummy_facility_consistency, "M1_output_consistency_facility.csv", row.names = FALSE)
}

print("Preparing and saving results from completeness analysis...")
completeness_export <- completeness_results %>%
  select(
    facility_id,
    all_of(geo_columns_export),
    indicator_common_id,
    period_id,
    completeness_flag
  )

write.csv(completeness_export, "M1_output_completeness.csv", row.names = FALSE)

# Save DQA results with dummy data if needed
if (run_dqa && !is.null(dqa_results) && nrow(dqa_results) > 0) {
  print("Preparing and saving results from DQA analysis...")
  dqa_export <- dqa_results %>%
    select(
      facility_id,
      all_of(geo_columns_export),
      period_id,
      dqa_mean,
      dqa_score
    )
  write.csv(dqa_export, "M1_output_dqa.csv", row.names = FALSE)
} else {
  print("No DQA results to save - creating dummy file with headers...")
  
  # Create dummy DQA data with dynamic geo columns
  dummy_dqa_cols <- list(
    facility_id = character(0),
    period_id = integer(0),
    dqa_mean = numeric(0),
    dqa_score = numeric(0)
  )
  
  # Add geo columns dynamically
  if (length(geo_columns_export) > 0) {
    for (geo_col in geo_columns_export) {
      dummy_dqa_cols[[geo_col]] <- character(0)
    }
  }
  
  dummy_dqa <- data.frame(dummy_dqa_cols)
  write.csv(dummy_dqa, "M1_output_dqa.csv", row.names = FALSE)
}

print("DQA Analysis completed. All outputs saved (with dummy files where no data available).")

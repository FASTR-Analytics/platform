*======================================================================
* Vaccine availability — Stata replication of the FASTR platform (M10)
* Sierra Leone HFA, Round 1. National, all facility types.
*
* Inputs:  data_raw.csv  weights.csv   (same folder as this do-file)
* Output:  vaccine_availability_results.log
*
* Replicates the platform pipeline:
*   - One row per facility: the FIRST submission in file order wins;
*     later rows with the same id_fac_txt are dropped (this is what the
*     platform does with repeat/failed attempts).
*   - Answers (select_one): 1 = Yes, 2 = No, -99 = Don't know/Refused,
*     blank = no interview.
*   - Facilities with no weight row get weight 1 (platform fallback).
*======================================================================
version 16
clear all
set more off

* How to treat "Don't know" (-99):
*   0 = count as No        (DONT_KNOW_TREATMENT = "no" — what the prod run used)
*   . = exclude facility   (DONT_KNOW_TREATMENT = "missing" — platform default)
local dk_value .

capture log close
log using "vaccine_availability_results.log", replace text

*--- Weights ----------------------------------------------------------
import delimited "weights.csv", varnames(1) clear
keep id_fac_txt wgt
drop if missing(id_fac_txt)
tempfile weights
save `weights'

*--- Survey data ------------------------------------------------------
import delimited "data_raw.csv", varnames(1) clear
keep id_fac_txt sup_05aaa_a sup_05aaa_b sup_05aaa_c ///
    sup_05aaa_d sup_05aaa_e sup_05aaa_f
drop if missing(id_fac_txt)

* One row per facility: first submission in file order wins
gen long row_in_file = _n
bysort id_fac_txt (row_in_file): keep if _n == 1
sort row_in_file
drop row_in_file

* Attach weights; facilities without a weight row get weight 1
merge m:1 id_fac_txt using `weights', keep(master match) nogenerate
gen double weight = cond(missing(wgt), 1, wgt)

*--- Indicators: vaccine available today at the facility --------------
* Each line recodes one survey question to a 0/1 indicator: Yes (1) -> 1,
* No (2) -> 0, Don't know (-99) -> `dk_value', blank -> missing.
gen vac_measles = cond(missing(sup_05aaa_a), ., cond(sup_05aaa_a == -99, `dk_value', sup_05aaa_a == 1))   // ind160
gen vac_penta   = cond(missing(sup_05aaa_b), ., cond(sup_05aaa_b == -99, `dk_value', sup_05aaa_b == 1))   // ind166
gen vac_bcg     = cond(missing(sup_05aaa_c), ., cond(sup_05aaa_c == -99, `dk_value', sup_05aaa_c == 1))   // ind172
gen vac_polio   = cond(missing(sup_05aaa_d), ., cond(sup_05aaa_d == -99, `dk_value', sup_05aaa_d == 1))   // ind178
gen vac_pcv     = cond(missing(sup_05aaa_e), ., cond(sup_05aaa_e == -99, `dk_value', sup_05aaa_e == 1))   // ind184
gen vac_hpv     = cond(missing(sup_05aaa_f), ., cond(sup_05aaa_f == -99, `dk_value', sup_05aaa_f == 1))   // ind190

* Index: share of the six tracer vaccines available;
* missing if any component is missing                                                                     // ind274
gen vac_index = (vac_measles + vac_penta + vac_bcg + vac_polio + vac_pcv + vac_hpv) / 6

*--- Results: national, all facility types ----------------------------
display _newline as text "Unweighted (platform USE_SAMPLE_WEIGHTS = FALSE)"
tabstat vac_measles vac_penta vac_bcg vac_polio vac_pcv vac_hpv vac_index, ///
    statistics(count mean) columns(statistics) format(%9.5f)

display _newline as text "Weighted (platform USE_SAMPLE_WEIGHTS = TRUE)"
tabstat vac_measles vac_penta vac_bcg vac_polio vac_pcv vac_hpv vac_index ///
    [aweight = weight], statistics(mean) columns(statistics) format(%9.5f)

log close

*======================================================================
* Vaccine availability — Viviane's method (matches the survey firm's
* cleaning, per her email). Sierra Leone HFA, Round 1. National.
*
* Inputs:  data_raw.csv  HFA_SL_R1_weigths_NEW.csv
* Output:  vaccine_availability_viviane_results.log
*
* Differs from vaccine_availability.do (the platform replication) in:
*   - Weights come from HFA_SL_R1_weigths_NEW.csv (365 facilities,
*     including 374, 98, 427 which the old file was missing).
*   - Keep only facilities that consented (id_resp_consent == 1).
*   - The two facilities with duplicate consented interviews are
*     resolved the way the firm did: facility 433 keeps _index 60
*     (drops 827); facility 442 keeps _index 430 (drops 301).
*======================================================================
version 16
clear all
set more off

* How to treat "Don't know" (-99):
*   0 = count as No        (DONT_KNOW_TREATMENT = "no" — what the prod run used)
*   . = exclude facility   (DONT_KNOW_TREATMENT = "missing" — platform default)
local dk_value .

capture log close
log using "vaccine_availability_viviane_results.log", replace text

*--- Weights ----------------------------------------------------------
import delimited "HFA_SL_R1_weigths_NEW.csv", varnames(1) clear
keep id_fac_txt wgt
drop if missing(id_fac_txt)
tempfile weights
save `weights'

*--- Survey data ------------------------------------------------------
import delimited "data_raw.csv", varnames(1) clear
keep id_fac_txt id_resp_consent _index sup_05aaa_a sup_05aaa_b sup_05aaa_c ///
    sup_05aaa_d sup_05aaa_e sup_05aaa_f
drop if missing(id_fac_txt)

* Keep only facilities that consented to the survey
keep if id_resp_consent == 1

* Two facilities have duplicate consented interviews; keep the row the
* firm kept in their cleaning (the _index column)
drop if _index == 827   // facility 433: keep _index 60
drop if _index == 301   // facility 442: keep _index 430
isid id_fac_txt

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
display _newline as text "Unweighted"
tabstat vac_measles vac_penta vac_bcg vac_polio vac_pcv vac_hpv vac_index, ///
    statistics(count mean) columns(statistics) format(%9.5f)

display _newline as text "Weighted"
tabstat vac_measles vac_penta vac_bcg vac_polio vac_pcv vac_hpv vac_index ///
    [aweight = weight], statistics(mean) columns(statistics) format(%9.5f)

log close

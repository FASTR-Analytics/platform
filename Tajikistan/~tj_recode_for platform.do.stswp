//==============================================================================
// Project: WB GFF FASTR
//
//
//			FASTR SURVEY COUNTRY-SPECIFIC DATA RECODE DO-FILE
//			
//			COUNTRY: TAJIKISTAN
//
// -------------------------------------------------
//
// Author: Viviane Azaïs
// Purpose: This do-file is an intermediary, country-specific do-file ran within 
// the general "FASTR clean" do-file
// --------------------------------------------------
//
// File structure: 
//		 	A.	Country-round specific recodes
//			B.	Recodes across all rounds within country
//
// Last updated: 23 August 2024
//==============================================================================

/* Things done in the recoding:
- Removing useless variables
- Renaming variables (pay specific attention to qualitative variables/multiple select variables)
- Correcting value labels 
- Create country-round, or country-specific variables 
*/

*Recode all the rounds of survey at the same time

local files : dir "$path_raw\\Stata format" files "*.dta" 		//identify list of all .dta files in raw data folder (Stata formatted)
di "$country'"

foreach f of local files {
	if strpos("`f'", "$country")>0  { 			//loop through each of the TJ raw datasets
		
*A/ Country-round specific recodes 
*-------------------------------------------------------------------------------

//Round #1
		if strpos("`f'", "tj_r1")>0  { 						
			use "$path_raw\\Stata format\\tj_r1.dta", replace	
			//destring *, replace
			//local countryround2 "tj_r1"
			
// 			* Check the problematic variables - variables that aren't in the data dictionary at all (probably need renaming, need to check the ODK)				
// 			local expVarlistall `"$expVarlistall"'
// 			foreach v of varlist _all {
// 				local i : list posof "`v'" in expVarlistall
// 				if `i' == 0 { 		//if the variable is not in the DD
// 					di "`v'"
// 				}
// 			}
			
			* Rename variables	
// 			drop id_fac
// 			rename id_fac_txt id_fac 
// 			rename serv_08a_R1 serv_08a_aa_tj
// 			rename serv_08a_R2 serv_08a_a
// 			rename serv_08_1 serv_08_aa_tj
// 			rename serv_08_2 serv_08_a 
// 			rename inf_03a_R1 inf_03a_a
// 			rename inf_03a_R2 inf_03a_b 
// 			rename hr_02_other hr_02a_tj
// 			rename hr_03_d_tj_other hr_03da_tj 
// 			rename fin_05_ba_rj fin_05_ba_tj
// 			rename sup_01_aa_tj	sup_01a_aa_tj	
// 			rename sup_01_ab_tj	sup_01a_ab_tj	
// 			rename sup_01_ac_tj	sup_01a_ac_tj	
// 			rename sup_01_ad_tj	sup_01a_ad_tj
// 			rename sup_01_ae_tj	sup_01a_ae_tj
// 			rename sup_01_af_tj	sup_01a_af_tj
// 			rename sup_01_ag_tj	sup_01a_ag_tj
// 			rename sup_01_ah_tj	sup_01a_ah_tj
// 			rename sup_01_ai_tj	sup_01a_ai_tj
// 			rename sup_01_aj_tj sup_01a_aj_tj
// 			rename sup_01_2_R1 sup_01a_h
// 			rename sup_01_2_R2	sup_01a_b
// 			rename sup_01_2_R3	sup_01a_a
// 			rename sup_01_2_R4	sup_01a_d
// 			rename sup_01_2_R5	sup_01a_ak_tj
// 			rename sup_01_2_R6	sup_01a_al_tj
// 			rename sup_01_2_R7	sup_01a_am_tj
// 			rename sup_01_2_R8	sup_01a_an_tj
// 			rename sup_01_2_R9	sup_01a_e
// 			rename sup_05_tj_a_tj	sup_05aa_a_tj
// 			rename sup_05_tj_b_tj	sup_05aa_b_tj
// 			rename sup_05_tj_c_tj	sup_05aa_c_tj
// 			rename sup_05_tj_d_tj	sup_05aa_d_tj
// 			rename sup_05_tj_e  sup_05aa_e		
// 			rename sup_05_tj_e_tj	sup_05aa_e_tj	
// 			rename sup_05_tj_f_tj	sup_05aa_f_tj
// 			rename sup_05_tj_g_tj	sup_05aa_g_tj
// 			rename sup_05_tj_h_tj	sup_05aa_h_tj
// 			rename sup_05_tj_i_tj	sup_05aa_i_tj
// 			rename sup_05_tj_j_tj	sup_05aa_j_tj
// 			rename sup_05_tj_k_tj	sup_05aa_k_tj
// 			rename sup_05_tj_l sup_05aa_l
// 			rename sup_05_tj_r sup_05aa_r
// 			rename lc_03_R1	lc_03_a
// 			rename lc_03_R2	lc_03_b
// 			rename lc_03_R3 lc_03_c
// 			rename lc_04_d lc_04_g
// 			rename lc_06_1 lc_06_a
// 			rename lc_06_2 lc_06_b 
// 			rename lc_06_3 lc_06_c
// 			rename lc_06_4 lc_06_ca 
// 			rename lc_06_5 lc_06_g 
// 			rename lc_06_96 lc_06_x 
// 			rename lc_06_97 lc_06_w 
// 			rename lc_06_99 lc_06_y 				
// 			rename lc_10b_tj_1 lc_10b_tj_a
// 			rename lc_10b_tj_2 lc_10b_tj_b
// 			rename lc_10b_tj_3 lc_10b_tj_c
// 			rename lc_10b_tj_4 lc_10b_tj_d
// 			rename lc_10b_tj_5 lc_10b_tj_e
// 			rename lc_10b_tj_6 lc_10b_tj_f
// 			rename lc_10b_tj_7 lc_10b_tj_g
// 			rename lc_10b_tj_8 lc_10b_tj_h
// 			rename lc_10b_tj_96 lc_10b_tj_x
// 			rename lc_10b_tj_99 lc_10b_tj_y
// 			rename qoc_01f_1 qoc_01f_a
// 			rename qoc_01f_2 qoc_01f_b
// 			rename qoc_01f_3 qoc_01f_c
// 			rename qoc_01f_4 qoc_01f_d
// 			rename qoc_01f_5 qoc_01f_e
// 			rename qoc_01f_6 qoc_01f_f
// 			rename qoc_01f_7 qoc_01f_g
// 			rename qoc_01f_8 qoc_01f_h
// 			rename qoc_01f_9 qoc_01f_i
// 			rename qoc_01f_96 qoc_01f_x
// 			rename qoc_01f_99 qoc_01f_y	
// 			rename id_enum_TEXT id_enum_other 
// 			rename inf_01_TEXT inf_01_other 
// 			rename inf_11_TEXT inf_11_other
// 			rename inf_04_TEXT inf_04_other
// 			rename lc_10b_tj_96_TEXT lc_10b_tj_other 
// 			rename result_TEXT result_other 
// 			rename serv_04_a serv_04_tj_a 
// 			rename serv_04_b serv_04_tj_b
// 			rename serv_04_c serv_04_tj_c
// 			rename serv_04_d serv_04_tj_d
// 			rename serv_04_e serv_04_tj_e
// 			rename serv_04_h serv_04_tj_h
// 			rename serv_04_i serv_04_tj_i
// 			rename com_04_a com_04_tj_a
// 			rename com_04_b com_04_tj_b
// 			rename com_04_c com_04_tj_c
// 			rename com_04_d com_04_tj_e		//recent changes
// 			rename com_04_f com_04_tj_f
// 			rename com_04_x com_04_tj_x
// 			rename com_04a com_04_other
// 			rename inf_02_tj inf_02a_tj
// 			*rename hr_09_p_tj hr_09_r_tj 		//there was a DD issue with that one - should not have been renamed!
// 			rename inf_05a_c inf_05a_d  //recent changes
// 			rename inf_05a_b inf_05a_c //recent changes
// 			rename inf_23 inf_23_tj	//recent changes
// 			rename inf_25 inf_25_tj //recent changes
// 			rename fin_03c fin_03d	//recent changes
// 			*drop id_fac 
// 			*rename id_unique id_fac
// 			drop com_02a
				
// 			*Drop variables that are not in the DD
// 			local expVarlistall `"$expVarlistall"'
// 			foreach v of varlist _all {
// 				local i : list posof "`v'" in expVarlistall
// 				if `i' == 0 { 		//if the variable is not in the DD
// 					drop `v'
// 				}
// 			}
			
			
			* Recode variables 	
			recode sh_01_c (. = 2)
			recode sh_01_d (2 = 1) (.=2)
			recode sh_01_x (3 = 1) (.=2)
			recode sh_01_z (-97 = 1) (.=2)
			tostring sh_03, replace
			replace sh_03 = "c" if sh_03 == "1"
			replace sh_03 = "d" if sh_03 == "2"
			replace sh_03 = "x" if sh_03 == "-96"
			replace sh_03 = "" if sh_03 == "."
			replace inf_06_tj = . if inf_05a_a == 2   
			replace inf_06a_tj =. if inf_05a_d == 2 
			drop if missing(id_fac)
			recode fin_06 fin_06a_* fin_06b fin_07 fin_04a fin_05_* fin_05a fin_07b_a fin_07b_b (nonmiss = .) if fin_01aa_tj !=1 | id_fac_type == 31 //issues with skip patterns not well coded by firm
			replace fin_05_a = 2 if fin_05_c_tj == 1 | fin_05_g_tj == 1 | fin_05_m_tj == 1 | fin_05_n_tj == 1 | fin_05_o_tj == 1 | fin_05_ba_tj == 1 | fin_05_bb_tj == 1 | fin_05_x ==1 //issues with skip patterns not well coded by firm
			recode fin_03d (3 = 2)	//issue in programming of survey (neither important nor unimportant was coded as 3 instead of 2)
			cap: recode inf_07 (nonmiss =.)
			cap: recode inf_07d (nonmiss =.)
			recode serv_gen_01_b (nonmiss=.)		//remove Hepatitis B immunization from the list of GBV services
			
			*Create new variables (note: those need to be added to the DD, with a label and a response option)
			recode sup_02_a (2 = 1) (3 =2), gen(sup_02a_a)	//change this 15 jan 2025 - use to be (3 = 2) ie. available for all patients that need it vs not available
			recode sup_02_b (2 = 1) (3 =2), gen(sup_02a_b)
			recode sup_02_c (2 = 1) (3 =2), gen(sup_02a_c)
			recode sup_02_d (2 = 1) (3 =2), gen(sup_02a_d)
			recode sup_02_e  (2 = 1) (3 =2), gen(sup_02a_e)
			recode sup_02_f  (2 = 1) (3 =2), gen(sup_02a_f)
			recode sup_02_g_tj  (2 = 1) (3 =2), gen(sup_02a_g_tj)
			recode sup_02_h_tj  (2 = 1) (3 =2), gen(sup_02a_h_tj)
			recode sup_02_i_tj  (2 = 1) (3 =2), gen(sup_02a_i_tj)
			recode sup_03_a (2 = 1) (3 =2), gen(sup_03a_a)
			recode sup_03_b  (2 = 1) (3 =2), gen(sup_03a_b)
			recode sup_03_c  (2 = 1) (3 =2), gen(sup_03a_c)
			recode sup_05a_a  (2 = 1) (3 =2), gen(sup_05aaa_a)
			recode sup_05a_b  (2 = 1) (3 =2), gen(sup_05aaa_b)
			recode sup_05a_c  (2 = 1) (3 =2), gen(sup_05aaa_c)
			recode sup_05a_d (2 = 1) (3 =2), gen(sup_05aaa_d)
			recode sup_05a_e (2 = 1) (3 =2), gen(sup_05aaa_e)	
		}
		
 //Round #2
 		if strpos("`f'", "tj_r2")>0  {  	
			use "$path_raw\\Stata format\\tj_r2.dta", replace	
			local countryround2 "tj_r2"	
			
			destring *, replace
			
			*Rename variables
			drop id_fac
			rename id_fac_txt id_fac 
			rename serv_05_b_tj serv_05_b 
			rename inf_01_text inf_01_other 
			rename inf_11_text inf_11_other 
			rename inf_04_text inf_04_other
			rename inf_05a_c inf_05a_d 
			rename inf_05a_b inf_05a_c
			rename inf_07e_tj inf_07c 		//mixup in the variable names: inf_07d was properly named initially
			rename sup_01_ag_tj sup_01a_ag_tj
			rename sup_01_ac_tj sup_01a_ac_tj
			rename sup_01_ad_tj sup_01a_ad_tj
			rename sup_01_h sup_01a_h
			rename sup_01_b sup_01a_b
			rename sup_01_a sup_01a_a
			rename sup_01_d sup_01a_d
			rename sup_01_al_tj sup_01a_al_tj
			rename sup_01_an_tj sup_01a_an_tj
			rename sup_01_am_tj sup_01a_am_tj
			rename sup_01_ak_tj sup_01a_ak_tj
			rename sup_01_e sup_01a_e
			rename sup_02_a sup_02a_a
			rename sup_02_aa_tj sup_02a_aa_tj
			rename sup_02_ab_tj sup_02a_ab_tj
			rename sup_02_ac_tj sup_02a_ac_tj
			rename sup_02_b sup_02a_b
			rename sup_02_c sup_02a_c
			rename sup_02_d sup_02a_d
			rename sup_02_e sup_02a_e
			rename sup_02_f sup_02a_f
			rename sup_02_g_tj sup_02a_g_tj
			rename sup_02_h_tj sup_02a_h_tj
			rename sup_02_i_tj sup_02a_i_tj
			rename sup_03_a sup_03a_a
			rename sup_03_b sup_03a_b
			rename sup_03_c sup_03a_c
			rename sup_05_tj_a sup_05aa_a_tj
			rename sup_05_tj_b sup_05aa_b_tj
			rename sup_05_tj_c sup_05aa_c_tj
			rename sup_05_tj_d sup_05aa_d_tj
			rename sup_05_tj_f sup_05aa_f_tj
			rename sup_05_tj_g sup_05aa_g_tj
			rename sup_05_tj_m sup_05aa_e //this was a weird one
			rename sup_05_tj_h sup_05aa_h_tj
			rename sup_05_tj_i sup_05aa_i_tj
			rename sup_05_tj_j sup_05aa_j_tj
			rename sup_05_tj_k sup_05aa_k_tj
			rename sup_05_tj_r sup_05aa_r
			rename sup_05_tj_l sup_05aa_l 
			rename sup_05_tj_e sup_05aa_e_tj 
			rename sup_05a_a sup_05aaa_a
			rename sup_05a_b sup_05aaa_b
			rename sup_05a_c sup_05aaa_c
			rename sup_05a_d sup_05aaa_d
			rename sup_05a_e sup_05aaa_e
			rename lc_10a_tj lc_10a
			rename lc_04_d lc_04_g
			rename lc_06_d lc_06_g
			rename lc_04_x_text lc_04_other
			rename lc_06_x_text inf_06_other
			rename lc_10b_tj_x_text lc_10b_tj_other 
			rename com_02a_tj_text com_02a_tj_other			
			rename qoc_01b qoc_01bb_tj
			rename qoc_01c qoc_01c_tj			
			rename qoc_01fa_tj_1 qoc_01f_c 
			rename qoc_01fa_tj_2 qoc_01f_d 
			rename qoc_01fa_tj_3 qoc_01f_f 
			rename qoc_01fa_tj_4 qoc_01f_i 
			rename qoc_01fa_tj_y qoc_01f_y
			
			drop qoc_01f_tj	qoc_01g_tj	qoc_01h_tj	qoc_01l_tj
		
			* Recode variables
			recode inf_11 (41 = 76241) (42 = 76242) (43 = 42) (53 = 76253)
			recode inf_07 (1 = 76211) (2 = 76212) (3 = 2)
			replace inf_06_tj = . if inf_05a_a == 2   
			replace inf_06a_tj =. if inf_05a_d == 2 
			
			recode lc_04_a lc_04_b lc_04_c lc_04_ca lc_04_g lc_04_x lc_04_w lc_04_y lc_06_a lc_06_b lc_06_c lc_06_ca lc_06_g lc_06_x lc_06_w lc_06_y lc_10b_tj_a lc_10b_tj_b lc_10b_tj_c	lc_10b_tj_d	lc_10b_tj_e	lc_10b_tj_f	lc_10b_tj_g	lc_10b_tj_h	lc_10b_tj_i	lc_10b_tj_x	lc_10b_tj_y qoc_01f_c qoc_01f_d qoc_01f_f qoc_01f_i  qoc_01f_y (1 2 3 4 5 6 7 8 9 10 -96 -99 -98 = 1) (missing = 2)
			recode lc_06_a lc_06_b lc_06_c lc_06_ca lc_06_g lc_06_x lc_06_w lc_06_y (nonmiss = .) if id_fac_type == 31
			recode lc_10b_tj_a	lc_10b_tj_b	lc_10b_tj_c	lc_10b_tj_d	lc_10b_tj_e	lc_10b_tj_f	lc_10b_tj_g	lc_10b_tj_h	lc_10b_tj_i	lc_10b_tj_x	lc_10b_tj_y (nonmiss = .) if lc_10a !=1
			recode qoc_01f_c qoc_01f_d qoc_01f_f qoc_01f_i  qoc_01f_y (nonmiss = .) if qoc_01e !=1
			cap: recode inf_07 (nonmiss =.)
			cap: recode inf_07d (nonmiss =.)
			replace inf_22_tj =. if id_fac_type == 23 | id_fac_type == 31 		//new (may 2026)
			
			*Fix facility types
			
			*replace id_fac_type=21 if id_fac_txt=="513_1"	//was considered as a 22 in the survey - Etoile confirmed that this is a FMD DHC (22) (FASTR R2 had it ok but SDI had it wrong)
			*replace id_fac_type=23 if id_fac_txt=="204_3" //was considered as a 31 in the survey - Etoile confirmed that this is a health house (31) in both FASTR R2 and SDI
			*replace id_fac_type=23 if id_fac_txt=="213_7" //was considered as a 31 in the survey - Etoile confirmed that this is a rural health center (23) (FASTR R2 had it wrong but ok in SDI)
			*replace id_fac_type=21 if id_fac_txt=="217_900" //was considered as a 23 in the survey - Etoile confirmed that this is a rural health center (23) (FASTR R2 had it ok but wrong in SDI)
			*replace id_fac_type=31 if id_fac_txt=="321_901" //was considered as a 23 in the survey - Etoile confirmed that this is a rural health center (23) (wrong in SDI)

			
			*Drop variables that are not in the DD
			local expVarlistall `"$expVarlistall"'
			foreach v of varlist _all {
				local i : list posof "`v'" in expVarlistall
				if `i' == 0 { 		//if the variable is not in the DD
					drop `v'
				}
			}
			
		
		}
 
 //Round #3
 		if strpos("`f'", "tj_r3")>0  { 					
			use "$path_raw\\Stata format\\tj_r3.dta", replace	
			local countryround2 "tj_r3"
				
			*Rename variables 
			drop id_fac
			rename unique_id id_fac 
			rename Stratum stratum 
			rename wgt_r3 wgt 
			rename sh_01c sh_01_c 
			rename sh_01da_tj sh_01_da_tj 
			rename sh_01db_tj sh_01_db_tj 
			rename sh_01h_tj sh_01_h_tj 
			rename sh_01x sh_01_x 
			rename sh_01z sh_01_z
			drop sh_01_other 
			rename sh_01_otherENG sh_01_other
			drop sh_03b_other
			rename sh_03b_otherENG sh_03b_other
			drop serv_04b_txt
			rename serv_04b_txtENG serv_04b_txt
			drop chal_03_txt 
			rename chal_03_txtENG  chal_03_txt 
			drop com_04_other
			rename com_04_otherENG com_04_other
			drop sup_05e_other 
			rename  sup_05e_otherENG sup_05e_other 
			drop end_observations
			rename end_observationsENG end_observations
			
			*Recode variables
			replace id_admin1_name = "GBAO"            if id_admin1_name == "ГБАО"
			replace id_admin1_name = "Dushanbe"       if id_admin1_name == "Душанбе"
			replace id_admin1_name = "DRS"            if id_admin1_name == "РРП"
			replace id_admin1_name = "Sughd region"   if id_admin1_name == "Согдийская"
			replace id_admin1_name = "Khatlon region" if id_admin1_name == "Хатлонская"
			
			replace id_admin1_name = "Sughd region"   if missing(id_admin1_name) //one missing admin1 name, infered the region based on the stratum
			
			gen sh_01_d = (sh_01_da_tj == 1 | sh_01_db_tj == 1) 	//combine measles and other than meales into single pandemic var for consistency with R1
			recode sh_01_d (0 =2)
			
			*Recode 'other' options
			replace sup_05e = 7625 if strpos(sup_05e_other, "They deliver a specific batch of vaccines")>0
	
			
			*Drop variables that are not in the DD
			local expVarlistall `"$expVarlistall"'
			foreach v of varlist _all {
				local i : list posof "`v'" in expVarlistall
				if `i' == 0 { 		//if the variable is not in the DD
					drop `v'
				}
			}		
			
		}
		
//Round #4
 		if strpos("`f'", "tj_r4")>0  { 		
			use "$path_raw\\Stata format\\tj_r4.dta", replace	
			local countryround2 "tj_r4"

						
			*Rename variables 
			drop id_fac
			rename unique_id id_fac 
			rename Stratum stratum 
			rename wgt_r4 wgt 
			drop inf_01_other
			rename inf_01_otherENG inf_01_other 
			drop inf_11_other
			rename inf_11_otherENG inf_11_other 
			drop lc_10b_tj_other
			rename lc_10b_tj_otherENG  lc_10b_tj_other
			drop end_observations
			rename end_observationsENG end_observations
			rename inf_25 inf_25_tj
			rename lc_04a  lc_04_a
			rename lc_04b  lc_04_b
			rename lc_04c  lc_04_c
			rename lc_04ca lc_04_ca
			rename lc_04g  lc_04_g
			rename lc_04x  lc_04_x
			rename lc_04w  lc_04_w
			rename lc_04y  lc_04_y			
			rename lc_06a  lc_06_a
			rename lc_06b  lc_06_b
			rename lc_06c  lc_06_c
			rename lc_06ca lc_06_ca
			rename lc_06g  lc_06_g
			rename lc_06x  lc_06_x
			rename lc_06w  lc_06_w
			rename lc_06y  lc_06_y
			rename lc_10b_tj5 lc_10b_tj_e
			rename lc_10b_tj6 lc_10b_tj_f
			rename lc_10b_tj7 lc_10b_tj_g
			rename lc_10b_tj8 lc_10b_tj_h
			rename lc_10b_tj96 lc_10b_tj_x
			rename lc_10b_tj99 lc_10b_tj_y
			rename lc_10b_tj1 lc_10b_tj_aa
		
			*Recode variables
			replace id_admin1_name = "GBAO"            if id_admin1_name == "ГБАО"
			replace id_admin1_name = "Dushanbe"       if id_admin1_name == "Душанбе"
			replace id_admin1_name = "DRS"            if id_admin1_name == "РРП"
			replace id_admin1_name = "Sughd region"   if id_admin1_name == "Согдийская"
			replace id_admin1_name = "Khatlon region" if id_admin1_name == "Хатлонская"
			*Recode 'other' options
		
			
			*Drop variables that are not in the DD
			local expVarlistall `"$expVarlistall"'
			foreach v of varlist _all {
				local i : list posof "`v'" in expVarlistall
				if `i' == 0 { 		//if the variable is not in the DD
					drop `v'
				}
			}
			
		}
		
			
*B/ Recodes across all rounds within country 
*-------------------------------------------------------------------------------
	
	*Generate a survey weight of one (if does not exist)
	cap: gen wgt = 1 
	
	
	*BCG vaccination - 'Not applicable' in r1 changed to 'Not available' due to questionnaire restructuring (Sven request). Now decided to do this for all medical supplies in R1
	cap: recode sup_02a_* sup_03a_* sup_05aa_* sup_05aaa_*  (-98 =2)
	
	*Remove some of the equipment/diagnostics for health houses (Sven request) - should not have been asked + fix some potential wrong skip patterns
	cap: recode hr_02 (nonmiss=.) if id_fac_type == 31 //remove doctors for health houses
	cap: recode sup_01a_aa_tj (nonmiss =.) if id_fac_type == 31  //ophtalmoscope
	cap: recode sup_01a_ab_tj (nonmiss =.) if id_fac_type == 31  //electrocardiograph
	cap: recode sup_01a_ae_tj (nonmiss =.) if id_fac_type == 31  //autoclave
	cap: recode sup_01a_ah_tj (nonmiss =.) if id_fac_type == 31  //intubation and tracheostomy kits
	cap: recode sup_01a_ai_tj (nonmiss =.) if id_fac_type == 31  //splints
	cap: recode sup_01a_aj_tj (nonmiss =.) if id_fac_type == 31  //sanitary stretcher
	cap: recode sup_01a_ac_tj (nonmiss =.) if id_fac_type == 31  //blood glucose meter
	cap: recode sup_01a_ad_tj (nonmiss =.) if id_fac_type == 31  //centrifuge
	cap: recode sup_01a_an_tj (nonmiss =.) if id_fac_type == 31  //microscope
	cap: recode sup_01a_ak_tj (nonmiss =.) if id_fac_type == 31  //otoscope
	cap: recode sup_02a_* (nonmiss=.) if id_fac_type == 31	//remove all diagnostics for health houses
	*cap: recode sup_05aa_e_tj (nonmiss=.) if id_fac_type == 31	| id_fac_type == 23 //MoH request: remove hydralazine from denom for HH and RHCs//nov 2025 update: MoH indicated that hydralazine is expected at all facilities
	*cap: recode sup_05aa_l (nonmiss=.) if id_fac_type == 31	| id_fac_type == 23  //MoH request: remove oxytocin from denom for HH and RHCs //nov 2025 update: MoH indicated that oxytocin is expected at all facilities
	
*----  // PHYLLISA > changes added BASED ON EXCEL FILE PROVIDED BY SDI TEAM \\---*

	/* 						Date : 20-june-2025
	
	id_fac_type answer options and labels:
					
					21	Family medicine department of city health center
					22	Family medicine department of district health center
					23	Rural health center
					31  Health house / health point
	*/
	
	
	cap: recode serv_05_ka_tj (nonmiss =.) if id_fac_type == 31  	 //Hypertension services 
	cap: recode serv_05_kb_tj (nonmiss =.) if id_fac_type == 31  	 //Diabetes services
	cap: recode serv_05_kc_tj (nonmiss =.) if id_fac_type == 31  	 //Chronic respiratory diseases services	
	cap: recode serv_05_ja_tj (nonmiss =.) if id_fac_type == 31  	 //HIV/AIDS services
	cap: recode serv_05_jb_tj (nonmiss =.)						 	 //Tuberculosis is shown to be missing for all facilities in SDI excel provided 

	cap: recode sup_02a_a 	  (nonmiss =.) if id_fac_type == 23  	 //urine dipstick test including urine protein, glucose, and ketone bodies
	cap: recode sup_02a_ac_tj (nonmiss =.) if id_fac_type == 23  	 //Urine dipstick test for ketone bodies
	cap: recode sup_02a_e 	  (nonmiss =.) if id_fac_type == 23  	 //Urine pregnancy test
	cap: recode sup_02a_h_tj  (nonmiss =.) if id_fac_type == 23  	 //Hepatitis B
	cap: recode sup_02a_i_tj  (nonmiss =.) if id_fac_type == 23  	 //Hepatitis C
	cap: recode sup_02a_f     (nonmiss =.) if id_fac_type == 23  	 //Syphilis diagnostic
	cap: recode sup_02a_d     (nonmiss =.) if id_fac_type == 23  	 //HIV diagnostic test
	cap: recode sup_02a_b     (nonmiss =.) if id_fac_type == 23  	 //Blood glucose testing // Nov 2025 update based on new list shared by Joe: appears that blood glucose testing in the form of glucometers is avaialable at RHCs.  // update again: remove this as was removed from the tool in R3 for this facility type
	
	cap: recode sup_01a_ag_tj (nonmiss =.) if id_fac_type == 31  	 //Hemoglobinometer
	cap: recode sup_01a_e     (nonmiss =.) if id_fac_type == 31  	 //Oxygen delivery service
	cap: recode sup_01a_af_tj     (nonmiss =.) if id_fac_type == 31  	 //Coagulator

	cap: recode sup_05aaa_c  (nonmiss =.)							 //BCG vaccine is shown to be missing for all facilities in SDI excel provided  	 
	
	
*----- // End changes added BASED ON EXCEL FILE PROVIDED BY SDI TEAM \\  ------*
	
	
	cap: recode lc_06_a lc_06_b lc_06_c lc_06_ca lc_06_g lc_06_x lc_06_w lc_06_y (nonmiss =.) if id_fac_type == 31  //based on questionnaire skips
	cap: recode qoc_01bb_tj (nonmiss =.) if id_fac_type == 31  //based on questionnaire skips
	cap: recode qoc_01c_tj (nonmiss =.) if id_fac_type == 31  //based on questionnaire skips
	cap: recode lc_01 (nonmiss =.) if id_fac_type == 31  //based on questionnaire skips
	cap: recode lc_03_a lc_03_b lc_03_c (nonmiss =.) if id_fac_type == 31  //based on questionnaire skips
	cap: recode hr_07 (nonmiss =.) if id_fac_type == 31  //based on questionnaire skips
	cap: tostring serv_04b_txt, replace

	*Times, strings
	tostring *_other, replace
	tostring id_admin0, replace 
	tostring id_admin0_iso2, replace 
	replace id_admin0 = "Tajikistan"
	replace id_admin0_iso2 = "TJ"
	drop if missing(id_fac)
	
	*Other facility type var (Sven request)
	gen id_fac_type2 = id_fac_type
	recode id_fac_type2 (21 22 = 20)
	tostring id_fac_type2, gen(temp)
	gen factypereg = id_admin1_name + "_" + temp
	drop temp
		
	*WB priority
	cap: replace wb_priority=. if id_fac_type !=23
	*Recode "other" options - will need to be completed


save "$path_clean\\clean_`countryround2'.dta", replace				

	}
}


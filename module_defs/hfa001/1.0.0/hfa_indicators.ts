// Auto-generated cleaned HFA indicators array
// QIDs use actual dataset variable names
// rCode contains simplified business logic only (missingness handled by script generation)

import type { HfaIndicator } from "lib";

export interface IndicatorDefinition {
  type: "Analysis" | "Descriptive" | "Index";
  category: string;
  definition: string;
  QIDs: string[];
  varName: string;
  stataCode: string;
  rCode: string;
  skipBecauseTooComplex?: boolean;
  notBinary?: boolean;
}

export const indicators: IndicatorDefinition[] = [
  {
    category: "External shocks",
    type: "Analysis",
    definition:
      "Percentage of facilities facing at least one shock affecting the communities it serves",
    QIDs: ["sh_01"],
    varName: "choccomatleast1",
    stataCode:
      "levelsof sh_01, local(levels)\nforeach l of local levels {\ngen sh_01_`l'= strpos(sh_01,\"`l'\")>0\n}\ngen choccomatleast1= (sh_01_z != 1)\nreplace choccomatleast1 =. if missing(sh_01)\nta choccomatleast1",
    rCode: '!str_detect(sh_01, "z")',
  },
  {
    category: "External shocks",
    type: "Analysis",
    definition:
      "Percentage of facilities facing at least one shock affecting their ability to provide services",
    QIDs: ["sh_01", "sh_03"],
    varName: "choccareatleast1",
    stataCode:
      "levelsof sh_03, local(levels)\nforeach l of local levels {\ngen sh_03_`l'= strpos(sh_03,\"`l'\")>0\n}\ngen choccareatleast1 = (sh_03_z != 1 & sh_01_z!= 1)\nreplace choccareatleast1 =. if missing(sh_01)\nta choccareatleast1",
    rCode: '!str_detect(sh_03, "z") & !str_detect(sh_01, "z")',
  },
  {
    category: "External shocks",
    type: "Descriptive",
    definition:
      "Percentage of facilities reporting each type of disruptive event affecting the community in the past 3 months",
    QIDs: [
      "sh_01c_c",
      "sh_01d_d",
      "sh_01e_e",
      "sh_01f_f",
      "sh_01g_g",
      "sh_01x_x",
      "sh_01z_z",
    ],
    varName: "sh_01c_c",
    stataCode:
      'recode sh_01_c sh_01_d sh_01_e sh_01_f sh_01_g sh_01_x sh_01_z (1=100)\ngraph hbar (mean) sh_01_z sh_01_c sh_01_d sh_01_e sh_01_f sh_01_g sh_01_x, ascategory ///\nyvar(relabel(1 "`: var label sh_01_z\'" 2 "`: var label sh_01_c\'" 3 "`: var label sh_01_d\'" 4 "`: var label sh_01_e\'" 5 "`: var label sh_01_f\'" 6 "`: var label sh_01_g\'" 7 "`: var label sh_01_x\'")) ///\nblabel(bar, format(%9.1f) size(4)) ylab(0 25 50 75 100, labsize(medsmall)) ///\nytitle("Percentage", size(3)) scale(0.75) scheme(burd)\ngr_edit .plotregion1.GraphEdit,cmd(_set_sort_height 1)',
    rCode:
      "c(sh_01c_c, sh_01d_d, sh_01e_e, sh_01f_f, sh_01g_g, sh_01x_x, sh_01z_z)",
    notBinary: true,
  },
  {
    category: "External shocks",
    type: "Descriptive",
    definition:
      "Percentage of facilities reporting each of the shocks to have the largest impact",
    QIDs: ["sh_03"],
    varName: "sh_03",
    stataCode: "ta sh_03",
    rCode: "sh_03",
    notBinary: true,
  },
  {
    category: "External shocks",
    type: "Analysis",
    definition:
      "Average number of months the shock with largest impact has been reported to be occurring",
    QIDs: ["sh_04a_m", "sh_04a_y"],
    varName: "m_shock",
    stataCode:
      "gen m_shock = sh_04a_y * 12 + sh_04a_m\nta sh_03, su(m_shock) //review and report for main shock",
    rCode: "sh_04a_y * 12 + sh_04a_m",
    notBinary: true,
  },
  {
    category: "External shocks",
    type: "Descriptive",
    definition: "Impact of the main shock on health service utilization",
    QIDs: ["sh_03a"],
    varName: "sh_03a",
    stataCode: "ta sh_03a",
    rCode: "sh_03a",
    notBinary: true,
  },
  {
    category: "External shocks",
    type: "Descriptive",
    definition:
      "Primary reason the main shock affected health service utilization",
    QIDs: ["sh_03b"],
    varName: "sh_03b",
    stataCode: "ta sh_03b",
    rCode: "sh_03b",
    notBinary: true,
  },
  {
    category: "External shocks",
    type: "Descriptive",
    definition:
      "Percentage of facilities reporting each type of challenge with service delivery that has been caused or worsened by recent shocks",
    QIDs: [
      "sh_05a_a",
      "sh_05b_b",
      "sh_05c_c",
      "sh_05d_d",
      "sh_05e_e",
      "sh_05f_f",
      "sh_05h_h",
    ],
    varName: "sh_05a_a",
    stataCode:
      'recode sh_05_a sh_05_b sh_05_c sh_05_d sh_05_e sh_05_f sh_05_h (3 4 5 =0) (1 2 =100)\ngraph hbar (mean) sh_05_a sh_05_b sh_05_c sh_05_d sh_05_e sh_05_f sh_05_h, ascategory ///\nyvar(relabel(1 "`: var label sh_05_a\'" 2 "`: var label sh_05_b\'" 3 "`: var label sh_05_c\'" 4 "`: var label sh_05_d\'" 5 "`: var label sh_05_e\'" 6 "`: var label sh_05_f\'" 7 "`: var label sh_05_h\'")) ///\nblabel(bar, format(%9.1f) size(4)) ylab(0 25 50 75 100, labsize(medsmall)) ///\nytitle("Percentage", size(3)) scale(0.75) scheme(burd)\ngr_edit .plotregion1.GraphEdit,cmd(_set_sort_height 1)',
    rCode:
      "c(sh_05a_a, sh_05b_b, sh_05c_c, sh_05d_d, sh_05e_e, sh_05f_f, sh_05h_h)",
    notBinary: true,
  },
  {
    category: "Resilience to shocks",
    type: "Analysis",
    definition:
      "Percentage of facilities that report having received additional financial support due to a shock",
    QIDs: ["fin_sh_01"],
    varName: "choc_fin",
    stataCode:
      "gen choc_fin = (fin_sh_01==1)\nreplace choc_fin =. if missing(fin_sh_01) | fin_sh_01==-99\nta choc_fin",
    rCode: "fin_sh_01 == 1",
  },
  {
    category: "Resilience to shocks",
    type: "Analysis",
    definition:
      "Percentage of facilities that report having received additional supplies due to a shock",
    QIDs: ["sup_sh_01"],
    varName: "choc_sup1",
    stataCode:
      "gen choc_sup1 = (sup_sh_01==1)\nreplace choc_sup1 =. if missing(sup_sh_01) | sup_sh_01==-99\nta choc_sup1",
    rCode: "sup_sh_01 == 1",
  },
  {
    category: "Resilience to shocks",
    type: "Analysis",
    definition:
      "Percentage of facilities that report damaged supplies due to a shock",
    QIDs: ["sup_sh_03"],
    varName: "choc_sup3",
    stataCode:
      "gen choc_sup3 = (sup_sh_03==1)\nreplace choc_sup3 =. if missing(sup_sh _03) | sup_sh_03==-99\nta choc_sup3",
    rCode: "sup_sh_03 == 1",
  },
  {
    category: "Resilience to shocks",
    type: "Analysis",
    definition:
      "Percentage of facilities that report no damaged supplies due to a shock",
    QIDs: ["sup_sh_03"],
    varName: "choc_sup3_no",
    stataCode:
      "gen choc_sup3_no = (sup_sh_03==2)\nreplace choc_sup3_no =. if missing(sup_sh _03) | sup_sh_03==-99\nta choc_sup3_no",
    rCode: "sup_sh_03 == 2",
  },
  {
    category: "Resilience to shocks",
    type: "Analysis",
    definition:
      "Percentage of facilities that report a focal person or team to support response to the shock",
    QIDs: ["lc_sh_04"],
    varName: "choc_lc",
    stataCode:
      "gen choc_lc = (lc_sh_04==1)\nreplace choc_lc =. if missing(lc_sh _04) | lc_sh_04==-99\ntab choco_lc",
    rCode: "lc_sh_04 == 1",
  },
  {
    category: "Resilience to shocks",
    type: "Analysis",
    definition:
      "Percentage of facilities that report waiting areas for patients with symptoms of a contagious disease",
    QIDs: ["inf_16"],
    varName: "choc_room",
    stataCode:
      "gen choc_room = (inf_16==1)\nreplace choc_room =. if missing(inf_16) | inf_16==-99\ntab choc_room",
    rCode: "inf_16 == 1",
  },
  {
    category: "Resilience to shocks",
    type: "Analysis",
    definition:
      "Percentage of facilities that report a designated site for patient isolation",
    QIDs: ["inf_17"],
    varName: "choc_iso",
    stataCode:
      "gen choc_iso = (inf_17==1)\nreplace choc_iso =. if missing(inf_17) | inf_17==-99\ntab choc_iso",
    rCode: "inf_17 == 1",
  },
  {
    category: "Resilience to shocks",
    type: "Analysis",
    definition:
      "Percentage of facilities that report a workforce adaptation due to the shock",
    QIDs: [
      "hr_sh_02a_a",
      "hr_sh_02b_b",
      "hr_sh_02c_c",
      "hr_sh_02d_d",
      "hr_sh_02e_e",
      "hr_sh_02f_f",
      "hr_sh_02g_g",
    ],
    varName: "choc_hr",
    stataCode:
      "recode hr_sh_02_* (1=1) (2=0) (-99=.)\negen total = rowtotal(hr_sh_02_a-hr_sh_02_g)\negen totalnomiss = rownonmiss(hr_sh_02_a-hr_sh_02_g)\ngen choc_hr = (total >=1) if totalnomiss > 0\ndrop total totalnomiss\ntab choc_hr",
    rCode:
      "rowSums(across(c(hr_sh_02_a, hr_sh_02_b, hr_sh_02_c, hr_sh_02_d, hr_sh_02_e, hr_sh_02_f, hr_sh_02_g), ~. == 1), na.rm = FALSE) >= 1",
    skipBecauseTooComplex: true,
  },
  {
    category: "Resilience to shocks",
    type: "Descriptive",
    definition:
      "Percentage of facilities reporting each type of workforce adaptation due to the shock",
    QIDs: ["HR_SH_02_*"],
    varName: "HR_SH_02_*",
    stataCode:
      'recode hr_sh_02_* (1=100) (2=0) (-99=.)\ngraph hbar (mean) hr_sh_02_a hr_sh_02_b hr_sh_02_c hr_sh_02_d hr_sh_02_e hr_sh_02_f hr_sh_02_g hr_sh_02_x, ascategory ///\nyvar(relabel(1 "`: var label hr_sh_02_a\'" 2 "`: var label hr_sh_02_b\'" 3 "`: var label hr_sh_02_c\'" 4 "`: var label hr_sh_02_d\'" 5 "`: var label hr_sh_02_e\'" 6 "`: var label hr_sh_02_f\'" 7 "`: var label hr_sh_02_g\'" 8 "`: var label hr_sh_02_x\'")) ///\nblabel(bar, format(%9.1f) size(4)) ylab(0 25 50 75 100, labsize(medsmall)) ///\nytitle("Percentage", size(3)) scale(0.75) scheme(burd)\ngr_edit .plotregion1.GraphEdit,cmd(_set_sort_height 1)',
    rCode: "HR_SH_02_*",
    skipBecauseTooComplex: true,
    notBinary: true,
  },
  {
    category: "Resilience to shocks",
    type: "Index",
    definition:
      "Percentage of facilities that have resiliency to respond/adapt in the face of shocks",
    QIDs: [
      "fin_sh_01",
      "sup_sh_01",
      "choc_sup3_no",
      "lc_sh_04",
      "inf_16",
      "inf_17",
      "choc_hr",
      "serv_sh_01",
      "com_sh_03",
    ],
    varName: "choc_res",
    stataCode:
      "// This uses previously constructed variables\negen total = rowtotal(choc_fin choc_sup1 choc_sup3_no choc_lc choc_room choc_iso choc_hr choc_serv1 choc_com)\negen totalnomiss = rownonmiss(choc_fin choc_sup1 choc_sup3_no choc_lc choc_room choc_iso choc_hr choc_serv1 choc_com)\ngen choc_res = (total == totalnomiss) if totalnomiss>0\ndrop total totalnomiss\ntab choc_res",
    rCode:
      "rowSums(across(c(fin_sh_01, sup_sh_01, choc_sup3_no, lc_sh_04, inf_16, inf_17, choc_hr, serv_sh_01, com_sh_03)), na.rm = FALSE) == rowSums(across(c(fin_sh_01, sup_sh_01, choc_sup3_no, lc_sh_04, inf_16, inf_17, choc_hr, serv_sh_01, com_sh_03), ~!is.na(.)))",
    skipBecauseTooComplex: true,
  },
  {
    category: "Service availability",
    type: "Analysis",
    definition:
      "Percentage of facilities that report offering antenatal care to women",
    QIDs: ["ser_08_a"],
    varName: "off_anc",
    stataCode:
      "gen off_anc = (ser_08_a==1)\nreplace off_anc =. if missing(ser_08_a) | ser_08_a==-99\nta off_anc",
    rCode: "ser_08_a == 1",
  },
  {
    category: "Service availability",
    type: "Analysis",
    definition:
      "Percentage of facilities that report offering family planning services",
    QIDs: ["ser_08_b"],
    varName: "off_fp",
    stataCode:
      "gen off_fp = (ser_08_b==1)\nreplace off_fp =. if missing(ser_08_b) | ser_08_b==-99\nta off_fp",
    rCode: "ser_08_b == 1",
  },
  {
    category: "Service availability",
    type: "Analysis",
    definition:
      "Percentage of facilities that report offering delivery services",
    QIDs: ["ser_08_c"],
    varName: "off_delivery",
    stataCode:
      "gen off_delivery = (ser_08_c==1)\nreplace off_delivery =. if missing(ser_08_c) | ser_08_c==-99\nta off_delivery",
    rCode: "ser_08_c == 1",
  },
  {
    category: "Service availability",
    type: "Analysis",
    definition: "Percentage of facilities that report offering postnatal care",
    QIDs: ["ser_08_d"],
    varName: "off_pnc",
    stataCode:
      "gen off_pnc = (ser_08_d==1)\nreplace off_pnc =. if missing(ser_08_d) | ser_08_d==-99\nta off_pnc",
    rCode: "ser_08_d == 1",
  },
  {
    category: "Service availability",
    type: "Analysis",
    definition:
      "Percentage of facilities that report offering child immunization",
    QIDs: ["ser_08_e"],
    varName: "off_immu",
    stataCode:
      "gen off_immu = (ser_08_e==1)\nreplace off_immu =. if missing(ser_08_e) | ser_08_e==-99\nta off_immu",
    rCode: "ser_08_e == 1",
  },
  {
    category: "Service availability",
    type: "Analysis",
    definition:
      "Percentage of facilities that report offering well-child visits",
    QIDs: ["ser_08_f"],
    varName: "off_wellchild",
    stataCode:
      "gen off_wellchild = (ser_08_f==1)\nreplace off_wellchild =. if missing(ser_08_f) | ser_08_f==-99\nta off_wellchild",
    rCode: "ser_08_f == 1",
  },
  {
    category: "Service availability",
    type: "Analysis",
    definition:
      "Percentage of facilities that report offering child curative care",
    QIDs: ["ser_08_g"],
    varName: "off_curative",
    stataCode:
      "gen off_curative = (ser_08_g==1)\nreplace off_curative =. if missing(ser_08_g) | ser_08_g==-99\nta off_curative",
    rCode: "ser_08_g == 1",
  },
  {
    category: "Service availability",
    type: "Analysis",
    definition:
      "Percentage of facilities that report offering child nutritional screening and counseling",
    QIDs: ["ser_08_h"],
    varName: "off_nutrition",
    stataCode:
      "gen off_nutrition = (ser_08_h==1)\nreplace off_nutrition =. if missing(ser_08_h) | ser_08_h==-99\nta off_nutrition",
    rCode: "ser_08_h == 1",
  },
  {
    category: "Service availability",
    type: "Index",
    definition: "Service availability index",
    QIDs: [
      "ser_08_a",
      "ser_08_b",
      "ser_08_c",
      "ser_08_d",
      "ser_08_e",
      "ser_08_f",
      "ser_08_g",
      "ser_08_h",
    ],
    varName: "servIndex",
    stataCode:
      "recode ser_08_* (1=1) (2=0) (-99=.)\negen servnumber = rowtotal(ser_08_a-ser_08_h)\negen servnumbernonmiss = rownonmiss(ser_08_a-ser_08_h)\ngen servIndex = servnumber / servnumbernonmiss\nreplace servIndex = . if servnumbernonmiss == 0\ndrop servnumber servnumbernonmiss\nta servIndex",
    rCode:
      "rowMeans(across(c(ser_08_a, ser_08_b, ser_08_c, ser_08_d, ser_08_e, ser_08_f, ser_08_g, ser_08_h), ~as.numeric(. == 1)), na.rm = FALSE)",
    skipBecauseTooComplex: true,
    notBinary: true,
  },
  {
    category: "Infrastructure",
    type: "Analysis",
    definition:
      "Percentage of facilities that report uninterrupted electrical power during operating hours",
    QIDs: ["inf_01"],
    varName: "uninterrupt_power",
    stataCode:
      "gen uninterrupt_power = (inf_01==1)\nreplace uninterrupt_power =. if missing(inf_01) | inf_01==-99\nta uninterrupt_power",
    rCode: "inf_01 == 1",
  },
  {
    category: "Infrastructure",
    type: "Analysis",
    definition:
      "Percentage of facilities that report access to an improved water source on premises",
    QIDs: ["inf_02"],
    varName: "improved_water",
    stataCode:
      "gen improved_water = (inf_02==1)\nreplace improved_water =. if missing(inf_02) | inf_02==-99\nta improved_water",
    rCode: "inf_02 == 1",
  },
  {
    category: "Infrastructure",
    type: "Analysis",
    definition:
      "Percentage of facilities that report functional handwashing facilities for staff",
    QIDs: ["inf_04"],
    varName: "handwash_staff",
    stataCode:
      "gen handwash_staff = (inf_04==1)\nreplace handwash_staff =. if missing(inf_04) | inf_04==-99\nta handwash_staff",
    rCode: "inf_04 == 1",
  },
  {
    category: "Infrastructure",
    type: "Analysis",
    definition:
      "Percentage of facilities that report functional handwashing facilities for patients/clients",
    QIDs: ["inf_05"],
    varName: "handwash_client",
    stataCode:
      "gen handwash_client = (inf_05==1)\nreplace handwash_client =. if missing(inf_05) | inf_05==-99\nta handwash_client",
    rCode: "inf_05 == 1",
  },
  {
    category: "Infrastructure",
    type: "Analysis",
    definition:
      "Percentage of facilities that report functional toilet/latrine facilities for staff",
    QIDs: ["inf_06"],
    varName: "toilet_staff",
    stataCode:
      "gen toilet_staff = (inf_06==1)\nreplace toilet_staff =. if missing(inf_06) | inf_06==-99\nta toilet_staff",
    rCode: "inf_06 == 1",
  },
  {
    category: "Infrastructure",
    type: "Analysis",
    definition:
      "Percentage of facilities that report functional toilet/latrine facilities for patients/clients",
    QIDs: ["inf_07"],
    varName: "toilet_client",
    stataCode:
      "gen toilet_client = (inf_07==1)\nreplace toilet_client =. if missing(inf_07) | inf_07==-99\nta toilet_client",
    rCode: "inf_07 == 1",
  },
  {
    category: "Infrastructure",
    type: "Analysis",
    definition:
      "Percentage of facilities that report connection to the internet",
    QIDs: ["inf_10"],
    varName: "internet_conn",
    stataCode:
      "gen internet_conn = (inf_10==1)\nreplace internet_conn =. if missing(inf_10) | inf_10==-99\nta internet_conn",
    rCode: "inf_10 == 1",
  },
  {
    category: "Infrastructure",
    type: "Analysis",
    definition: "Percentage of facilities that report having computer(s)",
    QIDs: ["inf_11"],
    varName: "computers",
    stataCode:
      "gen computers = (inf_11==1)\nreplace computers =. if missing(inf_11) | inf_11==-99\nta computers",
    rCode: "inf_11 == 1",
  },
  {
    category: "Infrastructure",
    type: "Analysis",
    definition:
      "Percentage of facilities that report having a functional cold chain system",
    QIDs: ["inf_12"],
    varName: "coldchain",
    stataCode:
      "gen coldchain = (inf_12==1)\nreplace coldchain =. if missing(inf_12) | inf_12==-99\nta coldchain",
    rCode: "inf_12 == 1",
  },
  {
    category: "Infrastructure",
    type: "Analysis",
    definition:
      "Percentage of facilities that report adequate space for service delivery in delivery room",
    QIDs: ["inf_13_a"],
    varName: "space_delivery",
    stataCode:
      "gen space_delivery = (inf_13_a==1)\nreplace space_delivery =. if missing(inf_13_a) | inf_13_a==-99\nta space_delivery",
    rCode: "inf_13_a == 1",
  },
  {
    category: "Infrastructure",
    type: "Analysis",
    definition:
      "Percentage of facilities that report adequate space for service delivery in consultation room",
    QIDs: ["inf_13_b"],
    varName: "space_consult",
    stataCode:
      "gen space_consult = (inf_13_b==1)\nreplace space_consult =. if missing(inf_13_b) | inf_13_b==-99\nta space_consult",
    rCode: "inf_13_b == 1",
  },
  {
    category: "Infrastructure",
    type: "Analysis",
    definition:
      "Percentage of facilities that report adequate space for service delivery in waiting area",
    QIDs: ["inf_13_c"],
    varName: "space_waiting",
    stataCode:
      "gen space_waiting = (inf_13_c==1)\nreplace space_waiting =. if missing(inf_13_c) | inf_13_c==-99\nta space_waiting",
    rCode: "inf_13_c == 1",
  },
  {
    category: "Infrastructure",
    type: "Index",
    definition: "Infrastructure index",
    QIDs: [
      "inf_01",
      "inf_02",
      "inf_04",
      "inf_05",
      "inf_06",
      "inf_07",
      "inf_10",
      "inf_11",
      "inf_12",
    ],
    varName: "infIndex",
    stataCode:
      "recode inf_01 inf_02 inf_04 inf_05 inf_06 inf_07 inf_10 inf_11 inf_12 (1=1) (2=0) (-99=.)\negen infnumber = rowtotal(inf_01 inf_02 inf_04 inf_05 inf_06 inf_07 inf_10 inf_11 inf_12)\negen infnumbernonmiss = rownonmiss(inf_01 inf_02 inf_04 inf_05 inf_06 inf_07 inf_10 inf_11 inf_12)\ngen infIndex = infnumber / infnumbernonmiss\nreplace infIndex = . if infnumbernonmiss == 0\ndrop infnumber infnumbernonmiss\nta infIndex",
    rCode:
      "rowMeans(across(c(inf_01, inf_02, inf_04, inf_05, inf_06, inf_07, inf_10, inf_11, inf_12), ~as.numeric(. == 1)), na.rm = FALSE)",
    skipBecauseTooComplex: true,
    notBinary: true,
  },
  {
    category: "Medical supplies",
    type: "Analysis",
    definition:
      "Percentage of facilities that report having syringes with needles available",
    QIDs: ["sup_01_a"],
    varName: "syringes",
    stataCode:
      "gen syringes = (sup_01_a==1)\nreplace syringes =. if missing(sup_01_a) | sup_01_a==-99\nta syringes",
    rCode: "sup_01_a == 1",
  },
  {
    category: "Medical supplies",
    type: "Analysis",
    definition:
      "Percentage of facilities that report having disposable gloves available",
    QIDs: ["sup_01_b"],
    varName: "gloves",
    stataCode:
      "gen gloves = (sup_01_b==1)\nreplace gloves =. if missing(sup_01_b) | sup_01_b==-99\nta gloves",
    rCode: "sup_01_b == 1",
  },
  {
    category: "Medical supplies",
    type: "Analysis",
    definition:
      "Percentage of facilities that report having antiseptic available",
    QIDs: ["sup_01_c"],
    varName: "antiseptic",
    stataCode:
      "gen antiseptic = (sup_01_c==1)\nreplace antiseptic =. if missing(sup_01_c) | sup_01_c==-99\nta antiseptic",
    rCode: "sup_01_c == 1",
  },
  {
    category: "Medical supplies",
    type: "Analysis",
    definition:
      "Percentage of facilities that report having thermometer available",
    QIDs: ["sup_01_d"],
    varName: "thermometer",
    stataCode:
      "gen thermometer = (sup_01_d==1)\nreplace thermometer =. if missing(sup_01_d) | sup_01_d==-99\nta thermometer",
    rCode: "sup_01_d == 1",
  },
  {
    category: "Medical supplies",
    type: "Analysis",
    definition:
      "Percentage of facilities that report having BP measurement device available",
    QIDs: ["sup_01_e"],
    varName: "bp_device",
    stataCode:
      "gen bp_device = (sup_01_e==1)\nreplace bp_device =. if missing(sup_01_e) | sup_01_e==-99\nta bp_device",
    rCode: "sup_01_e == 1",
  },
  {
    category: "Medical supplies",
    type: "Analysis",
    definition:
      "Percentage of facilities that report having weighing scale for adults available",
    QIDs: ["sup_01_f"],
    varName: "scale_adult",
    stataCode:
      "gen scale_adult = (sup_01_f==1)\nreplace scale_adult =. if missing(sup_01_f) | sup_01_f==-99\nta scale_adult",
    rCode: "sup_01_f == 1",
  },
  {
    category: "Medical supplies",
    type: "Analysis",
    definition:
      "Percentage of facilities that report having weighing scale for infants available",
    QIDs: ["sup_01_g"],
    varName: "scale_infant",
    stataCode:
      "gen scale_infant = (sup_01_g==1)\nreplace scale_infant =. if missing(sup_01_g) | sup_01_g==-99\nta scale_infant",
    rCode: "sup_01_g == 1",
  },
  {
    category: "Medical supplies",
    type: "Analysis",
    definition:
      "Percentage of facilities that report having height board for children available",
    QIDs: ["sup_01_h"],
    varName: "height_board",
    stataCode:
      "gen height_board = (sup_01_h==1)\nreplace height_board =. if missing(sup_01_h) | sup_01_h==-99\nta height_board",
    rCode: "sup_01_h == 1",
  },
  {
    category: "Medical supplies",
    type: "Analysis",
    definition:
      "Percentage of facilities that report having MUAC tape available",
    QIDs: ["sup_01_i"],
    varName: "muac_tape",
    stataCode:
      "gen muac_tape = (sup_01_i==1)\nreplace muac_tape =. if missing(sup_01_i) | sup_01_i==-99\nta muac_tape",
    rCode: "sup_01_i == 1",
  },
  {
    category: "Medical supplies",
    type: "Analysis",
    definition:
      "Percentage of facilities that report having stethoscope available",
    QIDs: ["sup_01_j"],
    varName: "stethoscope",
    stataCode:
      "gen stethoscope = (sup_01_j==1)\nreplace stethoscope =. if missing(sup_01_j) | sup_01_j==-99\nta stethoscope",
    rCode: "sup_01_j == 1",
  },
  {
    category: "Medical supplies",
    type: "Analysis",
    definition:
      "Percentage of facilities that report having examination light available",
    QIDs: ["sup_01_k"],
    varName: "exam_light",
    stataCode:
      "gen exam_light = (sup_01_k==1)\nreplace exam_light =. if missing(sup_01_k) | sup_01_k==-99\nta exam_light",
    rCode: "sup_01_k == 1",
  },
  {
    category: "Medical supplies",
    type: "Index",
    definition: "Basic equipment index",
    QIDs: [
      "sup_01_a",
      "sup_01_b",
      "sup_01_c",
      "sup_01_d",
      "sup_01_e",
      "sup_01_f",
      "sup_01_g",
      "sup_01_h",
      "sup_01_i",
      "sup_01_j",
      "sup_01_k",
    ],
    varName: "basicequipIndex",
    stataCode:
      "recode sup_01_* (1=1) (2=0) (-99=.)\negen basicequipnumber = rowtotal(sup_01_a-sup_01_k)\negen basicequipnumbernonmiss = rownonmiss(sup_01_a-sup_01_k)\ngen basicequipIndex = basicequipnumber / basicequipnumbernonmiss\nreplace basicequipIndex = . if basicequipnumbernonmiss == 0\ndrop basicequipnumber basicequipnumbernonmiss\nta basicequipIndex",
    rCode:
      "rowMeans(across(c(sup_01_a, sup_01_b, sup_01_c, sup_01_d, sup_01_e, sup_01_f, sup_01_g, sup_01_h, sup_01_i, sup_01_j, sup_01_k), ~as.numeric(. == 1)), na.rm = FALSE)",
    skipBecauseTooComplex: true,
    notBinary: true,
  },
  {
    category: "Medical supplies",
    type: "Analysis",
    definition:
      "Percentage of facilities that report having amoxicillin available",
    QIDs: ["sup_02_a"],
    varName: "amoxicillin",
    stataCode:
      "gen amoxicillin = (sup_02_a==1)\nreplace amoxicillin =. if missing(sup_02_a) | sup_02_a==-99\nta amoxicillin",
    rCode: "sup_02_a == 1",
  },
  {
    category: "Medical supplies",
    type: "Analysis",
    definition: "Percentage of facilities that report having ORS available",
    QIDs: ["sup_02_b"],
    varName: "ors",
    stataCode:
      "gen ors = (sup_02_b==1)\nreplace ors =. if missing(sup_02_b) | sup_02_b==-99\nta ors",
    rCode: "sup_02_b == 1",
  },
  {
    category: "Medical supplies",
    type: "Analysis",
    definition: "Percentage of facilities that report having zinc available",
    QIDs: ["sup_02_c"],
    varName: "zinc",
    stataCode:
      "gen zinc = (sup_02_c==1)\nreplace zinc =. if missing(sup_02_c) | sup_02_c==-99\nta zinc",
    rCode: "sup_02_c == 1",
  },
  {
    category: "Medical supplies",
    type: "Analysis",
    definition:
      "Percentage of facilities that report having paracetamol available",
    QIDs: ["sup_02_d"],
    varName: "paracetamol",
    stataCode:
      "gen paracetamol = (sup_02_d==1)\nreplace paracetamol =. if missing(sup_02_d) | sup_02_d==-99\nta paracetamol",
    rCode: "sup_02_d == 1",
  },
  {
    category: "Medical supplies",
    type: "Analysis",
    definition:
      "Percentage of facilities that report having iron/folate available",
    QIDs: ["sup_02_e"],
    varName: "iron_folate",
    stataCode:
      "gen iron_folate = (sup_02_e==1)\nreplace iron_folate =. if missing(sup_02_e) | sup_02_e==-99\nta iron_folate",
    rCode: "sup_02_e == 1",
  },
  {
    category: "Medical supplies",
    type: "Index",
    definition: "Child medicines index",
    QIDs: ["sup_02_a", "sup_02_b", "sup_02_c", "sup_02_d"],
    varName: "childmedIndex",
    stataCode:
      "recode sup_02_a sup_02_b sup_02_c sup_02_d (1=1) (2=0) (-99=.)\negen childmednumber = rowtotal(sup_02_a sup_02_b sup_02_c sup_02_d)\negen childmednumbernonmiss = rownonmiss(sup_02_a sup_02_b sup_02_c sup_02_d)\ngen childmedIndex = childmednumber / childmednumbernonmiss\nreplace childmedIndex = . if childmednumbernonmiss == 0\ndrop childmednumber childmednumbernonmiss\nta childmedIndex",
    rCode:
      "rowMeans(across(c(sup_02_a, sup_02_b, sup_02_c, sup_02_d), ~as.numeric(. == 1)), na.rm = FALSE)",
    skipBecauseTooComplex: true,
    notBinary: true,
  },
  {
    category: "Medical supplies",
    type: "Analysis",
    definition: "Percentage of facilities that report having condoms available",
    QIDs: ["sup_03_a"],
    varName: "condoms",
    stataCode:
      "gen condoms = (sup_03_a==1)\nreplace condoms =. if missing(sup_03_a) | sup_03_a==-99\nta condoms",
    rCode: "sup_03_a == 1",
  },
  {
    category: "Medical supplies",
    type: "Analysis",
    definition:
      "Percentage of facilities that report having combined oral contraceptives available",
    QIDs: ["sup_03_b"],
    varName: "oral_contraceptive",
    stataCode:
      "gen oral_contraceptive = (sup_03_b==1)\nreplace oral_contraceptive =. if missing(sup_03_b) | sup_03_b==-99\nta oral_contraceptive",
    rCode: "sup_03_b == 1",
  },
  {
    category: "Medical supplies",
    type: "Analysis",
    definition:
      "Percentage of facilities that report having injectable contraceptives available",
    QIDs: ["sup_03_c"],
    varName: "inject_contraceptive",
    stataCode:
      "gen inject_contraceptive = (sup_03_c==1)\nreplace inject_contraceptive =. if missing(sup_03_c) | sup_03_c==-99\nta inject_contraceptive",
    rCode: "sup_03_c == 1",
  },
  {
    category: "Medical supplies",
    type: "Analysis",
    definition:
      "Percentage of facilities that report having implants available",
    QIDs: ["sup_03_d"],
    varName: "implants",
    stataCode:
      "gen implants = (sup_03_d==1)\nreplace implants =. if missing(sup_03_d) | sup_03_d==-99\nta implants",
    rCode: "sup_03_d == 1",
  },
  {
    category: "Medical supplies",
    type: "Analysis",
    definition: "Percentage of facilities that report having IUD available",
    QIDs: ["sup_03_e"],
    varName: "iud",
    stataCode:
      "gen iud = (sup_03_e==1)\nreplace iud =. if missing(sup_03_e) | sup_03_e==-99\nta iud",
    rCode: "sup_03_e == 1",
  },
  {
    category: "Medical supplies",
    type: "Index",
    definition: "Family planning methods index",
    QIDs: ["sup_03_a", "sup_03_b", "sup_03_c", "sup_03_d", "sup_03_e"],
    varName: "fpIndex",
    stataCode:
      "recode sup_03_* (1=1) (2=0) (-99=.)\negen fpnumber = rowtotal(sup_03_a-sup_03_e)\negen fpnumbernonmiss = rownonmiss(sup_03_a-sup_03_e)\ngen fpIndex = fpnumber / fpnumbernonmiss\nreplace fpIndex = . if fpnumbernonmiss == 0\ndrop fpnumber fpnumbernonmiss\nta fpIndex",
    rCode:
      "rowMeans(across(c(sup_03_a, sup_03_b, sup_03_c, sup_03_d, sup_03_e), ~as.numeric(. == 1)), na.rm = FALSE)",
    skipBecauseTooComplex: true,
    notBinary: true,
  },
  {
    category: "Medical supplies",
    type: "Analysis",
    definition:
      "Percentage of facilities that report having vaccines available",
    QIDs: ["sup_04"],
    varName: "vaccines",
    stataCode:
      "gen vaccines = (sup_04==1)\nreplace vaccines =. if missing(sup_04) | sup_04==-99\nta vaccines",
    rCode: "sup_04 == 1",
  },
  {
    category: "Human resources",
    type: "Analysis",
    definition:
      "Percentage of facilities that report meeting the basic minimum staffing requirements for the facility's level of care",
    QIDs: ["hr_01", "min_staff_req"],
    varName: "HR_1",
    stataCode:
      "gen HR_1 = (hr_01 >= min_staff_req)\nreplace HR_1 =. if missing(hr_01)\nta HR_1",
    rCode: "hr_01 >= min_staff_req",
  },
  {
    category: "Human resources",
    type: "Descriptive",
    definition:
      "Average number of health workers reported as working at health facilities",
    QIDs: ["hr_01"],
    varName: "hr_01",
    stataCode: "summarize hr_01",
    rCode: "hr_01",
    notBinary: true,
  },
  {
    category: "Human resources",
    type: "Analysis",
    definition:
      "Percentage of facilities that report the availability of CHWs working in their catchment area",
    QIDs: ["hr_06"],
    varName: "HR_3",
    stataCode:
      "gen HR_3 = (hr_06 >= 1)\nreplace HR_3 =. if missing(hr_06)\nta HR_3",
    rCode: "hr_06 > 0",
  },
  {
    category: "Human resources",
    type: "Analysis",
    definition:
      "Percentage of respondents that report that human resources are a challenge at the health facility",
    QIDs: ["hr_ch_01a"],
    varName: "HR_4",
    stataCode:
      "gen HR_4 = (hr_ch_01a==1 | hr_ch_01a==2)\nreplace HR_4 =. if missing(hr_ch_01a)\nta HR_4",
    rCode: "hr_ch_01a == 1 | hr_ch_01a == 2",
  },
  {
    category: "Human resources",
    type: "Analysis",
    definition:
      "Percentage of respondents that report that human resource challenges are limiting or preventing the facility's ability to deliver health services",
    QIDs: ["hr_ch_01a", "hr_ch_01"],
    varName: "HR_5",
    stataCode:
      "gen HR_5 = (hr_ch_01==1)\nreplace HR_5 =. if missing(hr_ch_01)\nta HR_5",
    rCode: "(hr_ch_01a == 1 | hr_ch_01a == 2) & hr_ch_01 == 1",
  },
  {
    category: "Financing",
    type: "Analysis",
    definition:
      "Percentage of facilities that report any source of direct facility financing",
    QIDs: ["fin_01a"],
    varName: "FIN_1",
    stataCode:
      'gen FIN_1 = (fin_01a != "A")\nreplace FIN_1 =. if missing(fin_01a)\nta FIN_1',
    rCode: 'fin_01a != "A"',
  },
  {
    category: "Financing",
    type: "Analysis",
    definition:
      "Percentage of facilities that report having an officially allocated budget",
    QIDs: ["fin_02a"],
    varName: "FIN_2",
    stataCode:
      "gen FIN_2 = (fin_02a==1)\nreplace FIN_2 =. if missing(fin_02a)\nta FIN_2",
    rCode: "fin_02a == 1",
  },
  {
    category: "Financing",
    type: "Analysis",
    definition:
      "Percentage of facilities that report receiving their expected allocated budget on time and in full",
    QIDs: ["fin_02a", "fin_02b", "fin_02d"],
    varName: "FIN_3",
    stataCode:
      "gen FIN_3 = (fin_02b==1 & fin_02d==2) if fin_02a==1\nreplace FIN_3 =. if missing(fin_02a) | fin_02a!=1\nta FIN_3",
    rCode: "fin_02a == 1 & fin_02b == 1 & fin_02d == 2",
  },
  {
    category: "Financing",
    type: "Analysis",
    definition:
      "Percentage of facilities that report charging user fees for any services",
    QIDs: ["fin_04"],
    varName: "FIN_10",
    stataCode:
      "gen FIN_10 = (fin_04==1)\nreplace FIN_10 =. if missing(fin_04)\nta FIN_10",
    rCode: "fin_04 == 1",
  },
  {
    category: "Financing",
    type: "Analysis",
    definition:
      "Percentage of respondents that report financing challenges that are limiting or preventing the facility's ability to deliver health services",
    QIDs: ["fin_ch_01", "fin_ch_01a"],
    varName: "FIN_13",
    stataCode:
      "gen FIN_13 = ((fin_ch_01a==1 | fin_ch_01a==2) & fin_ch_01==1)\nreplace FIN_13 =. if missing(fin_ch_01a) | missing(fin_ch_01)\nta FIN_13",
    rCode: "(fin_ch_01a == 1 | fin_ch_01a == 2) & fin_ch_01 == 1",
  },
  {
    category: "Leadership and coordination",
    type: "Index",
    definition: "PHC facility leadership and coordination index",
    QIDs: ["lc_08", "lc_10", "lc_11", "lc_12", "lc_13"],
    varName: "LEAD_1",
    stataCode:
      "recode lc_08 lc_10 lc_11 lc_12 lc_13 (1=1) (2=0) (-99=.)\negen leadnumber = rowtotal(lc_08 lc_10 lc_11 lc_12 lc_13)\negen leadnumbernonmiss = rownonmiss(lc_08 lc_10 lc_11 lc_12 lc_13)\ngen LEAD_1 = leadnumber / leadnumbernonmiss\nreplace LEAD_1 = . if leadnumbernonmiss == 0\ndrop leadnumber leadnumbernonmiss\nta LEAD_1",
    rCode:
      "rowMeans(across(c(lc_08, lc_10, lc_11, lc_12, lc_13), ~as.numeric(. == 1)), na.rm = FALSE)",
    skipBecauseTooComplex: true,
    notBinary: true,
  },
  {
    category: "Leadership and coordination",
    type: "Analysis",
    definition:
      "Percentage of facilities that report having protocols or guidelines for referring patients to other facilities",
    QIDs: ["lc_11"],
    varName: "LEAD_3",
    stataCode:
      "gen LEAD_3 = (lc_11==1)\nreplace LEAD_3 =. if missing(lc_11)\nta LEAD_3",
    rCode: "lc_11 == 1",
  },
  {
    category: "Leadership and coordination",
    type: "Analysis",
    definition:
      "Percentage of facilities that report a supportive supervision visit in the past 12 months",
    QIDs: ["lc_10a"],
    varName: "LEAD_6",
    stataCode:
      "gen LEAD_6 = (lc_10a==1)\nreplace LEAD_6 =. if missing(lc_10a)\nta LEAD_6",
    rCode: "lc_10a == 1",
  },
  {
    category: "Leadership and coordination",
    type: "Analysis",
    definition:
      "Percentage of respondents that report that leadership and coordination is a challenge at the health facility",
    QIDs: ["lc_ch_01a"],
    varName: "LEAD_8",
    stataCode:
      "gen LEAD_8 = (lc_ch_01a==1 | lc_ch_01a==2)\nreplace LEAD_8 =. if missing(lc_ch_01a)\nta LEAD_8",
    rCode: "lc_ch_01a == 1 | lc_ch_01a == 2",
  },
  {
    category: "Community engagement",
    type: "Index",
    definition: "PHC facility community engagement index",
    QIDs: [
      "cbind",
      "com_02",
      "com_02aa",
      "com_03",
      "com_engage1",
      "com_engage2",
      "com_engage3",
      "lc_08",
    ],
    varName: "COM_1",
    stataCode:
      "gen com_engage1 = (com_02==1 & com_02aa==1)\ngen com_engage2 = (com_03==1)\ngen com_engage3 = (lc_08==1)\nrecode com_engage* (1=1) (0=0) (.=.)\negen comnumber = rowtotal(com_engage1 com_engage2 com_engage3)\negen comnumbernonmiss = rownonmiss(com_engage1 com_engage2 com_engage3)\ngen COM_1 = comnumber / comnumbernonmiss\nreplace COM_1 = . if comnumbernonmiss == 0\ndrop com_engage* comnumber comnumbernonmiss\nta COM_1",
    rCode:
      "rowMeans(across(c((com_02 == 1 & com_02aa == 1), com_03 == 1, lc_08 == 1)), na.rm = FALSE)",
    skipBecauseTooComplex: true,
    notBinary: true,
  },
  {
    category: "Community engagement",
    type: "Analysis",
    definition:
      "Percentage of facilities that report community advisory board or committee meetings in the past 12 months",
    QIDs: ["com_02", "com_02aa"],
    varName: "COM_3",
    stataCode:
      "gen COM_3 = (com_02==1 & com_02aa==1)\nreplace COM_3 =. if missing(com_02) | missing(com_02aa)\nta COM_3",
    rCode: "com_02 == 1 & com_02aa == 1",
  },
  {
    category: "Community engagement",
    type: "Analysis",
    definition:
      "Percentage of facilities that report formal linkages with CHWs",
    QIDs: ["lc_08"],
    varName: "COM_5",
    stataCode:
      "gen COM_5 = (lc_08==1)\nreplace COM_5 =. if missing(lc_08)\nta COM_5",
    rCode: "lc_08 == 1",
  },
  {
    category: "Community engagement",
    type: "Analysis",
    definition:
      "Percentage of respondents that report that community engagement is a challenge at the health facility",
    QIDs: ["com_ch_01a"],
    varName: "COM_6",
    stataCode:
      "gen COM_6 = (com_ch_01a==1 | com_ch_01a==2)\nreplace COM_6 =. if missing(com_ch_01a)\nta COM_6",
    rCode: "com_ch_01a == 1 | com_ch_01a == 2",
  },
  {
    category: "Quality improvement processes",
    type: "Index",
    definition: "PHC facilities quality improvement index",
    QIDs: [
      "qoc_01a",
      "qoc_01b_a",
      "qoc_01b_b",
      "qoc_01e",
      "qoc_02",
      "qoc_03a",
      "qoc_03b",
      "qoc_team",
    ],
    varName: "QOC_1",
    stataCode:
      "gen qoc_team = (qoc_01b_a==1 | qoc_01b_b==1)\nrecode qoc_01a qoc_01e qoc_02 qoc_03a qoc_03b qoc_team (1=1) (0=0) (.=.)\negen qocnumber = rowtotal(qoc_01a qoc_team qoc_01e qoc_02 qoc_03a qoc_03b)\negen qocnumbernonmiss = rownonmiss(qoc_01a qoc_team qoc_01e qoc_02 qoc_03a qoc_03b)\ngen QOC_1 = qocnumber / qocnumbernonmiss\nreplace QOC_1 = . if qocnumbernonmiss == 0\ndrop qoc_team qocnumber qocnumbernonmiss\nta QOC_1",
    rCode:
      "rowMeans(across(c(qoc_01a, (qoc_01b_a == 1 | qoc_01b_b == 1), qoc_01e, qoc_02, qoc_03a, qoc_03b), ~as.numeric(. == 1)), na.rm = FALSE)",
    skipBecauseTooComplex: true,
    notBinary: true,
  },
  {
    category: "Quality improvement processes",
    type: "Analysis",
    definition:
      "Percentage of facilities that report routinely carrying out quality improvement activities",
    QIDs: ["qoc_01a"],
    varName: "QOC_3",
    stataCode:
      "gen QOC_3 = (qoc_01a==1)\nreplace QOC_3 =. if missing(qoc_01a)\nta QOC_3",
    rCode: "qoc_01a == 1",
  },
  {
    category: "Quality improvement processes",
    type: "Analysis",
    definition:
      "Percentage of facilities that report monitoring the facility's own data to make decisions",
    QIDs: ["qoc_01e"],
    varName: "QOC_5",
    stataCode:
      "gen QOC_5 = (qoc_01e==1)\nreplace QOC_5 =. if missing(qoc_01e)\nta QOC_5",
    rCode: "qoc_01e == 1",
  },
  {
    category: "Quality improvement processes",
    type: "Analysis",
    definition:
      "Percentage of respondents that report that quality improvement is a challenge at the health facility",
    QIDs: ["qoc_ch_01a"],
    varName: "QOC_9",
    stataCode:
      "gen QOC_9 = (qoc_ch_01a==1 | qoc_ch_01a==2)\nreplace QOC_9 =. if missing(qoc_ch_01a)\nta QOC_9",
    rCode: "qoc_ch_01a == 1 | qoc_ch_01a == 2",
  },
  {
    category: "Emergency preparedness and response",
    type: "Index",
    definition: "PHC facility emergency preparedness index",
    QIDs: [
      "com_01",
      "fin_03",
      "hr_07",
      "inf_08",
      "inf_09",
      "inf_18",
      "lc_01",
      "lc_03",
    ],
    varName: "EMERGPREP_1",
    stataCode:
      "recode inf_09 inf_08 fin_03 lc_01 lc_03 com_01 hr_07 inf_18 (1=1) (2=0) (-99=.)\negen emergprepnumber = rowtotal(inf_09 inf_08 fin_03 lc_01 lc_03 com_01 hr_07 inf_18)\negen emergprepnumbernonmiss = rownonmiss(inf_09 inf_08 fin_03 lc_01 lc_03 com_01 hr_07 inf_18)\ngen EMERGPREP_1 = emergprepnumber / emergprepnumbernonmiss\nreplace EMERGPREP_1 = . if emergprepnumbernonmiss == 0\ndrop emergprepnumber emergprepnumbernonmiss\nta EMERGPREP_1",
    rCode:
      "rowMeans(across(c(inf_09, inf_08, fin_03, lc_01, lc_03, com_01, hr_07, inf_18), ~as.numeric(. == 1)), na.rm = FALSE)",
    skipBecauseTooComplex: true,
    notBinary: true,
  },
  {
    category: "Emergency preparedness and response",
    type: "Analysis",
    definition:
      "Percentage of facilities that report the reporting of nationally notifiable diseases",
    QIDs: ["inf_09"],
    varName: "EMERGPREP_3",
    stataCode:
      "gen EMERGPREP_3 = (inf_09==1)\nreplace EMERGPREP_3 =. if missing(inf_09)\nta EMERGPREP_3",
    rCode: "inf_09 == 1",
  },
  {
    category: "Emergency preparedness and response",
    type: "Analysis",
    definition:
      "Percentage of facilities that report functional sample transport systems",
    QIDs: ["inf_08"],
    varName: "EMERGPREP_4",
    stataCode:
      "gen EMERGPREP_4 = (inf_08==1)\nreplace EMERGPREP_4 =. if missing(inf_08)\nta EMERGPREP_4",
    rCode: "inf_08 == 1",
  },
  {
    category: "Emergency preparedness and response",
    type: "Analysis",
    definition:
      "Percentage of facilities that report the presence of IPC guidelines at facilities",
    QIDs: ["inf_18"],
    varName: "EMERGPREP_9",
    stataCode:
      "gen EMERGPREP_9 = (inf_18==1)\nreplace EMERGPREP_9 =. if missing(inf_18)\nta EMERGPREP_9",
    rCode: "inf_18 == 1",
  },
];

export function convertToHfaIndicators(indicators: IndicatorDefinition[]) {
  return indicators
    .filter((indicator) => !indicator.skipBecauseTooComplex)
    .filter((indicator) => !indicator.notBinary)
    .map<HfaIndicator>((indicator) => ({
      category: indicator.category,
      definition: indicator.definition,
      rFilterCode: "",
      varName: indicator.varName,
      rCode: indicator.rCode,
      type: indicator.notBinary ? "numeric" : "binary",
    }));
}

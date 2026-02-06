--
-- PostgreSQL database dump
--

-- Dumped from database version 17.4 (Debian 17.4-1.pgdg120+2)
-- Dumped by pg_dump version 17.4 (Debian 17.4-1.pgdg120+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: datasets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.datasets (
    dataset_type text NOT NULL,
    info text NOT NULL,
    last_updated text NOT NULL
);


ALTER TABLE public.datasets OWNER TO postgres;

--
-- Name: facilities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.facilities (
    facility_id text NOT NULL,
    admin_area_4 text NOT NULL,
    admin_area_3 text NOT NULL,
    admin_area_2 text NOT NULL,
    admin_area_1 text NOT NULL,
    facility_name text,
    facility_type text,
    facility_ownership text,
    facility_custom_1 text,
    facility_custom_2 text,
    facility_custom_3 text,
    facility_custom_4 text,
    facility_custom_5 text
);


ALTER TABLE public.facilities OWNER TO postgres;

--
-- Name: global_last_updated; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.global_last_updated (
    id text NOT NULL,
    last_updated text NOT NULL
);


ALTER TABLE public.global_last_updated OWNER TO postgres;

--
-- Name: indicators; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.indicators (
    indicator_common_id text NOT NULL,
    indicator_common_label text NOT NULL
);


ALTER TABLE public.indicators OWNER TO postgres;

--
-- Name: indicators_hfa; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.indicators_hfa (
    var_name text NOT NULL
);


ALTER TABLE public.indicators_hfa OWNER TO postgres;

--
-- Name: modules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.modules (
    id text NOT NULL,
    module_definition text NOT NULL,
    date_installed text NOT NULL,
    config_type text NOT NULL,
    config_selections text NOT NULL,
    last_updated text NOT NULL,
    last_run text NOT NULL,
    dirty text NOT NULL
);


ALTER TABLE public.modules OWNER TO postgres;

--
-- Name: presentation_objects; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.presentation_objects (
    id text NOT NULL,
    module_id text NOT NULL,
    results_object_id text NOT NULL,
    results_value text NOT NULL,
    is_default_visualization boolean NOT NULL,
    label text NOT NULL,
    config text NOT NULL,
    last_updated text NOT NULL
);


ALTER TABLE public.presentation_objects OWNER TO postgres;

--
-- Name: report_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.report_items (
    id text NOT NULL,
    report_id text NOT NULL,
    sort_order integer NOT NULL,
    config text NOT NULL,
    last_updated text NOT NULL
);


ALTER TABLE public.report_items OWNER TO postgres;

--
-- Name: reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reports (
    id text NOT NULL,
    report_type text NOT NULL,
    config text NOT NULL,
    last_updated text NOT NULL,
    is_deleted boolean NOT NULL
);


ALTER TABLE public.reports OWNER TO postgres;

--
-- Name: results_objects; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.results_objects (
    id text NOT NULL,
    module_id text NOT NULL,
    description text NOT NULL,
    column_definitions text
);


ALTER TABLE public.results_objects OWNER TO postgres;

--
-- Name: results_values; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.results_values (
    id text NOT NULL,
    results_object_id text NOT NULL,
    module_id text NOT NULL,
    label text NOT NULL,
    value_func text NOT NULL,
    format_as text NOT NULL,
    value_props text NOT NULL,
    period_options text NOT NULL,
    disaggregation_options text NOT NULL,
    value_label_replacements text,
    post_aggregation_expression text,
    auto_include_facility_columns boolean DEFAULT false,
    CONSTRAINT results_values_format_as_check CHECK ((format_as = ANY (ARRAY['percent'::text, 'number'::text]))),
    CONSTRAINT results_values_value_func_check CHECK ((value_func = ANY (ARRAY['SUM'::text, 'AVG'::text, 'COUNT'::text, 'MIN'::text, 'MAX'::text, 'identity'::text])))
);


ALTER TABLE public.results_values OWNER TO postgres;

--
-- Name: ro_m1_output_completeness_csv; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ro_m1_output_completeness_csv (
    facility_id text NOT NULL,
    admin_area_2 text NOT NULL,
    admin_area_3 text NOT NULL,
    admin_area_4 text NOT NULL,
    indicator_common_id text NOT NULL,
    period_id integer NOT NULL,
    completeness_flag integer NOT NULL
);


ALTER TABLE public.ro_m1_output_completeness_csv OWNER TO postgres;

--
-- Name: ro_m1_output_consistency_geo_csv; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ro_m1_output_consistency_geo_csv (
    admin_area_2 text NOT NULL,
    admin_area_3 text NOT NULL,
    period_id integer NOT NULL,
    ratio_type text NOT NULL,
    sconsistency integer
);


ALTER TABLE public.ro_m1_output_consistency_geo_csv OWNER TO postgres;

--
-- Name: ro_m1_output_dqa_csv; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ro_m1_output_dqa_csv (
    facility_id text NOT NULL,
    admin_area_2 text NOT NULL,
    admin_area_3 text NOT NULL,
    admin_area_4 text NOT NULL,
    period_id integer NOT NULL,
    dqa_mean numeric NOT NULL,
    dqa_score numeric NOT NULL
);


ALTER TABLE public.ro_m1_output_dqa_csv OWNER TO postgres;

--
-- Name: ro_m1_output_outlier_list_csv; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ro_m1_output_outlier_list_csv (
    facility_id text NOT NULL,
    admin_area_2 text NOT NULL,
    admin_area_3 text NOT NULL,
    admin_area_4 text NOT NULL,
    indicator_common_id text NOT NULL,
    period_id integer NOT NULL,
    count numeric NOT NULL
);


ALTER TABLE public.ro_m1_output_outlier_list_csv OWNER TO postgres;

--
-- Name: ro_m1_output_outliers_csv; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ro_m1_output_outliers_csv (
    facility_id text NOT NULL,
    admin_area_2 text NOT NULL,
    admin_area_3 text NOT NULL,
    admin_area_4 text NOT NULL,
    period_id integer NOT NULL,
    indicator_common_id text NOT NULL,
    outlier_flag integer NOT NULL
);


ALTER TABLE public.ro_m1_output_outliers_csv OWNER TO postgres;

--
-- Name: ro_m2_adjusted_data_csv; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ro_m2_adjusted_data_csv (
    facility_id text NOT NULL,
    admin_area_2 text NOT NULL,
    admin_area_3 text NOT NULL,
    admin_area_4 text NOT NULL,
    period_id integer NOT NULL,
    indicator_common_id text NOT NULL,
    count_final_none numeric,
    count_final_outliers numeric,
    count_final_completeness numeric,
    count_final_both numeric
);


ALTER TABLE public.ro_m2_adjusted_data_csv OWNER TO postgres;

--
-- Name: ro_m2_low_volume_exclusions_csv; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ro_m2_low_volume_exclusions_csv (
    indicator_common_id text NOT NULL,
    low_volume_exclude text NOT NULL
);


ALTER TABLE public.ro_m2_low_volume_exclusions_csv OWNER TO postgres;

--
-- Name: ro_m3_all_indicators_shortfalls_csv; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ro_m3_all_indicators_shortfalls_csv (
    admin_area_1 text NOT NULL,
    indicator_common_id text NOT NULL,
    period_id integer NOT NULL,
    count_sum numeric,
    count_expect_sum numeric,
    shortfall_absolute numeric,
    shortfall_percent numeric,
    surplus_absolute numeric,
    surplus_percent numeric
);


ALTER TABLE public.ro_m3_all_indicators_shortfalls_csv OWNER TO postgres;

--
-- Name: ro_m3_disruptions_analysis_admin_area_1_csv; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ro_m3_disruptions_analysis_admin_area_1_csv (
    admin_area_1 text NOT NULL,
    indicator_common_id text NOT NULL,
    period_id integer NOT NULL,
    count_sum numeric,
    count_expect_sum numeric,
    count_expected_if_above_diff_threshold numeric
);


ALTER TABLE public.ro_m3_disruptions_analysis_admin_area_1_csv OWNER TO postgres;

--
-- Name: ro_m3_disruptions_analysis_admin_area_2_csv; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ro_m3_disruptions_analysis_admin_area_2_csv (
    admin_area_2 text NOT NULL,
    indicator_common_id text NOT NULL,
    period_id integer NOT NULL,
    count_sum numeric,
    count_expect_sum numeric,
    count_expected_if_above_diff_threshold numeric
);


ALTER TABLE public.ro_m3_disruptions_analysis_admin_area_2_csv OWNER TO postgres;

--
-- Name: ro_m3_disruptions_analysis_admin_area_3_csv; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ro_m3_disruptions_analysis_admin_area_3_csv (
    admin_area_2 text NOT NULL,
    admin_area_3 text NOT NULL,
    indicator_common_id text NOT NULL,
    period_id integer NOT NULL,
    count_sum numeric,
    count_expect_sum numeric,
    count_expected_if_above_diff_threshold numeric
);


ALTER TABLE public.ro_m3_disruptions_analysis_admin_area_3_csv OWNER TO postgres;

--
-- Name: ro_m3_disruptions_analysis_admin_area_4_csv; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ro_m3_disruptions_analysis_admin_area_4_csv (
    admin_area_2 text NOT NULL,
    admin_area_3 text NOT NULL,
    admin_area_4 text NOT NULL,
    indicator_common_id text NOT NULL,
    period_id integer NOT NULL,
    count_sum numeric,
    count_expect_sum numeric,
    count_expected_if_above_diff_threshold numeric
);


ALTER TABLE public.ro_m3_disruptions_analysis_admin_area_4_csv OWNER TO postgres;

--
-- Name: ro_m3_service_utilization_csv; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ro_m3_service_utilization_csv (
    facility_id text NOT NULL,
    admin_area_2 text NOT NULL,
    admin_area_3 text NOT NULL,
    admin_area_4 text NOT NULL,
    period_id integer NOT NULL,
    indicator_common_id text NOT NULL,
    count_final_none numeric,
    count_final_outliers numeric,
    count_final_completeness numeric,
    count_final_both numeric
);


ALTER TABLE public.ro_m3_service_utilization_csv OWNER TO postgres;

--
-- Name: ro_m4_coverage_estimation_admin_area_2_csv; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ro_m4_coverage_estimation_admin_area_2_csv (
    admin_area_2 text NOT NULL,
    indicator_common_id text NOT NULL,
    year integer NOT NULL,
    coverage_cov numeric
);


ALTER TABLE public.ro_m4_coverage_estimation_admin_area_2_csv OWNER TO postgres;

--
-- Name: ro_m4_coverage_estimation_admin_area_3_csv; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ro_m4_coverage_estimation_admin_area_3_csv (
    admin_area_3 text NOT NULL,
    indicator_common_id text NOT NULL,
    year integer NOT NULL,
    coverage_cov numeric
);


ALTER TABLE public.ro_m4_coverage_estimation_admin_area_3_csv OWNER TO postgres;

--
-- Name: ro_m4_coverage_estimation_csv; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ro_m4_coverage_estimation_csv (
    indicator_common_id text NOT NULL,
    year integer NOT NULL,
    coverage_original_estimate numeric,
    coverage_avgsurveyprojection numeric,
    coverage_cov numeric
);


ALTER TABLE public.ro_m4_coverage_estimation_csv OWNER TO postgres;

--
-- Name: ro_m4_selected_denominator_per_indicator_csv; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ro_m4_selected_denominator_per_indicator_csv (
    indicator_common_id text NOT NULL,
    denominator text NOT NULL
);


ALTER TABLE public.ro_m4_selected_denominator_per_indicator_csv OWNER TO postgres;

--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.schema_migrations (
    migration_id text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.schema_migrations OWNER TO postgres;

--
-- Name: datasets datasets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.datasets
    ADD CONSTRAINT datasets_pkey PRIMARY KEY (dataset_type);


--
-- Name: facilities facilities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.facilities
    ADD CONSTRAINT facilities_pkey PRIMARY KEY (facility_id);


--
-- Name: global_last_updated global_last_updated_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.global_last_updated
    ADD CONSTRAINT global_last_updated_pkey PRIMARY KEY (id);


--
-- Name: indicators_hfa indicators_hfa_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.indicators_hfa
    ADD CONSTRAINT indicators_hfa_pkey PRIMARY KEY (var_name);


--
-- Name: indicators indicators_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.indicators
    ADD CONSTRAINT indicators_pkey PRIMARY KEY (indicator_common_id);


--
-- Name: modules modules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.modules
    ADD CONSTRAINT modules_pkey PRIMARY KEY (id);


--
-- Name: presentation_objects presentation_objects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.presentation_objects
    ADD CONSTRAINT presentation_objects_pkey PRIMARY KEY (id);


--
-- Name: report_items report_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_items
    ADD CONSTRAINT report_items_pkey PRIMARY KEY (id);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: results_objects results_objects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.results_objects
    ADD CONSTRAINT results_objects_pkey PRIMARY KEY (id);


--
-- Name: results_values results_values_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.results_values
    ADD CONSTRAINT results_values_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (migration_id);


--
-- Name: idx_facilities_admin_area_1; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_facilities_admin_area_1 ON public.facilities USING btree (admin_area_1);


--
-- Name: idx_facilities_admin_area_2; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_facilities_admin_area_2 ON public.facilities USING btree (admin_area_2);


--
-- Name: idx_facilities_admin_area_3; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_facilities_admin_area_3 ON public.facilities USING btree (admin_area_3);


--
-- Name: idx_facilities_admin_area_4; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_facilities_admin_area_4 ON public.facilities USING btree (admin_area_4);


--
-- Name: idx_facilities_admin_areas; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_facilities_admin_areas ON public.facilities USING btree (admin_area_4, admin_area_3, admin_area_2, admin_area_1);


--
-- Name: idx_global_last_updated_last_updated; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_global_last_updated_last_updated ON public.global_last_updated USING btree (last_updated);


--
-- Name: idx_modules_dirty; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_modules_dirty ON public.modules USING btree (dirty);


--
-- Name: idx_modules_last_run; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_modules_last_run ON public.modules USING btree (last_run);


--
-- Name: idx_modules_last_updated; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_modules_last_updated ON public.modules USING btree (last_updated);


--
-- Name: idx_presentation_objects_last_updated; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_presentation_objects_last_updated ON public.presentation_objects USING btree (last_updated);


--
-- Name: idx_presentation_objects_module_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_presentation_objects_module_id ON public.presentation_objects USING btree (module_id);


--
-- Name: idx_presentation_objects_results_object_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_presentation_objects_results_object_id ON public.presentation_objects USING btree (results_object_id);


--
-- Name: idx_report_items_last_updated; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_report_items_last_updated ON public.report_items USING btree (last_updated);


--
-- Name: idx_report_items_report_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_report_items_report_id ON public.report_items USING btree (report_id);


--
-- Name: idx_report_items_sort_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_report_items_sort_order ON public.report_items USING btree (report_id, sort_order);


--
-- Name: idx_reports_is_deleted; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reports_is_deleted ON public.reports USING btree (is_deleted);


--
-- Name: idx_reports_last_updated; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reports_last_updated ON public.reports USING btree (last_updated);


--
-- Name: idx_reports_report_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reports_report_type ON public.reports USING btree (report_type);


--
-- Name: idx_results_objects_module_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_results_objects_module_id ON public.results_objects USING btree (module_id);


--
-- Name: idx_results_values_module_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_results_values_module_id ON public.results_values USING btree (module_id);


--
-- Name: idx_results_values_results_object_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_results_values_results_object_id ON public.results_values USING btree (results_object_id);


--
-- Name: report_items report_items_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_items
    ADD CONSTRAINT report_items_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.reports(id) ON DELETE CASCADE;


--
-- Name: results_objects results_objects_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.results_objects
    ADD CONSTRAINT results_objects_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.modules(id) ON DELETE CASCADE;


--
-- Name: results_values results_values_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.results_values
    ADD CONSTRAINT results_values_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.modules(id) ON DELETE CASCADE;


--
-- Name: results_values results_values_results_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.results_values
    ADD CONSTRAINT results_values_results_object_id_fkey FOREIGN KEY (results_object_id) REFERENCES public.results_objects(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


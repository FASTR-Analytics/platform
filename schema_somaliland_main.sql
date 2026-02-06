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
-- Name: admin_areas_1; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admin_areas_1 (
    admin_area_1 text NOT NULL
);


ALTER TABLE public.admin_areas_1 OWNER TO postgres;

--
-- Name: admin_areas_2; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admin_areas_2 (
    admin_area_2 text NOT NULL,
    admin_area_1 text NOT NULL
);


ALTER TABLE public.admin_areas_2 OWNER TO postgres;

--
-- Name: admin_areas_3; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admin_areas_3 (
    admin_area_3 text NOT NULL,
    admin_area_2 text NOT NULL,
    admin_area_1 text NOT NULL
);


ALTER TABLE public.admin_areas_3 OWNER TO postgres;

--
-- Name: admin_areas_4; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admin_areas_4 (
    admin_area_4 text NOT NULL,
    admin_area_3 text NOT NULL,
    admin_area_2 text NOT NULL,
    admin_area_1 text NOT NULL
);


ALTER TABLE public.admin_areas_4 OWNER TO postgres;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_logs (
    id integer NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    user_email text NOT NULL,
    project_id text,
    action text NOT NULL,
    resource_type text,
    resource_id text,
    method text,
    path text,
    details text,
    success boolean NOT NULL,
    error_message text,
    session_id text
);


ALTER TABLE public.audit_logs OWNER TO postgres;

--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.audit_logs_id_seq OWNER TO postgres;

--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: dataset_hfa; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dataset_hfa (
    facility_id text NOT NULL,
    time_point text NOT NULL,
    var_name text NOT NULL,
    value text NOT NULL,
    version_id integer NOT NULL
);


ALTER TABLE public.dataset_hfa OWNER TO postgres;

--
-- Name: dataset_hfa_upload_attempts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dataset_hfa_upload_attempts (
    id text DEFAULT 'single_row'::text NOT NULL,
    date_started text NOT NULL,
    step integer NOT NULL,
    status text NOT NULL,
    status_type text NOT NULL,
    source_type text NOT NULL,
    step_1_result text,
    step_2_result text,
    step_3_result text,
    CONSTRAINT dataset_hfa_upload_attempts_id_check CHECK ((id = 'single_row'::text))
);


ALTER TABLE public.dataset_hfa_upload_attempts OWNER TO postgres;

--
-- Name: dataset_hfa_versions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dataset_hfa_versions (
    id integer NOT NULL,
    n_rows_total_imported integer NOT NULL,
    n_rows_inserted integer,
    n_rows_updated integer,
    staging_result text
);


ALTER TABLE public.dataset_hfa_versions OWNER TO postgres;

--
-- Name: dataset_hmis; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dataset_hmis (
    facility_id text NOT NULL,
    indicator_raw_id text NOT NULL,
    period_id integer NOT NULL,
    count integer NOT NULL,
    version_id integer NOT NULL,
    CONSTRAINT dataset_hmis_count_check CHECK ((count >= 0)),
    CONSTRAINT dataset_hmis_period_id_check CHECK (((period_id >= 190001) AND (period_id <= 205012) AND (((period_id % 100) >= 1) AND ((period_id % 100) <= 12))))
);


ALTER TABLE public.dataset_hmis OWNER TO postgres;

--
-- Name: dataset_hmis_upload_attempts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dataset_hmis_upload_attempts (
    id text DEFAULT 'single_row'::text NOT NULL,
    date_started text NOT NULL,
    step integer NOT NULL,
    status text NOT NULL,
    status_type text NOT NULL,
    source_type text,
    step_1_result text,
    step_2_result text,
    step_3_result text,
    CONSTRAINT dataset_hmis_upload_attempts_id_check CHECK ((id = 'single_row'::text))
);


ALTER TABLE public.dataset_hmis_upload_attempts OWNER TO postgres;

--
-- Name: dataset_hmis_versions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dataset_hmis_versions (
    id integer NOT NULL,
    n_rows_total_imported integer NOT NULL,
    n_rows_inserted integer,
    n_rows_updated integer,
    staging_result text
);


ALTER TABLE public.dataset_hmis_versions OWNER TO postgres;

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
-- Name: indicator_mappings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.indicator_mappings (
    indicator_raw_id text NOT NULL,
    indicator_common_id text NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.indicator_mappings OWNER TO postgres;

--
-- Name: indicators; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.indicators (
    indicator_common_id text NOT NULL,
    indicator_common_label text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.indicators OWNER TO postgres;

--
-- Name: indicators_raw; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.indicators_raw (
    indicator_raw_id text NOT NULL,
    indicator_raw_label text NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.indicators_raw OWNER TO postgres;

--
-- Name: instance_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.instance_config (
    config_key text NOT NULL,
    config_json_value text NOT NULL
);


ALTER TABLE public.instance_config OWNER TO postgres;

--
-- Name: project_user_roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.project_user_roles (
    email text NOT NULL,
    project_id text NOT NULL,
    role text NOT NULL
);


ALTER TABLE public.project_user_roles OWNER TO postgres;

--
-- Name: projects; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.projects (
    id text NOT NULL,
    label text NOT NULL,
    ai_context text NOT NULL,
    is_locked boolean DEFAULT false NOT NULL
);


ALTER TABLE public.projects OWNER TO postgres;

--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.schema_migrations (
    migration_id text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.schema_migrations OWNER TO postgres;

--
-- Name: structure_upload_attempts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.structure_upload_attempts (
    id text DEFAULT 'single_row'::text NOT NULL,
    date_started text NOT NULL,
    step integer NOT NULL,
    status text NOT NULL,
    status_type text NOT NULL,
    source_type text,
    step_1_result text,
    step_2_result text,
    step_3_result text,
    CONSTRAINT structure_upload_attempts_id_check CHECK ((id = 'single_row'::text))
);


ALTER TABLE public.structure_upload_attempts OWNER TO postgres;

--
-- Name: uploaded_hmis_data_staging_ready_for_integration; Type: TABLE; Schema: public; Owner: postgres
--

CREATE UNLOGGED TABLE public.uploaded_hmis_data_staging_ready_for_integration (
    facility_id text NOT NULL,
    indicator_raw_id text NOT NULL,
    period_id integer NOT NULL,
    count integer NOT NULL
);


ALTER TABLE public.uploaded_hmis_data_staging_ready_for_integration OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    email text NOT NULL,
    is_admin boolean NOT NULL
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: admin_areas_1 admin_areas_1_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_areas_1
    ADD CONSTRAINT admin_areas_1_pkey PRIMARY KEY (admin_area_1);


--
-- Name: admin_areas_2 admin_areas_2_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_areas_2
    ADD CONSTRAINT admin_areas_2_pkey PRIMARY KEY (admin_area_2, admin_area_1);


--
-- Name: admin_areas_3 admin_areas_3_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_areas_3
    ADD CONSTRAINT admin_areas_3_pkey PRIMARY KEY (admin_area_3, admin_area_2, admin_area_1);


--
-- Name: admin_areas_4 admin_areas_4_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_areas_4
    ADD CONSTRAINT admin_areas_4_pkey PRIMARY KEY (admin_area_4, admin_area_3, admin_area_2, admin_area_1);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: dataset_hfa dataset_hfa_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dataset_hfa
    ADD CONSTRAINT dataset_hfa_pkey PRIMARY KEY (facility_id, time_point, var_name);


--
-- Name: dataset_hfa_upload_attempts dataset_hfa_upload_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dataset_hfa_upload_attempts
    ADD CONSTRAINT dataset_hfa_upload_attempts_pkey PRIMARY KEY (id);


--
-- Name: dataset_hfa_versions dataset_hfa_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dataset_hfa_versions
    ADD CONSTRAINT dataset_hfa_versions_pkey PRIMARY KEY (id);


--
-- Name: dataset_hmis dataset_hmis_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dataset_hmis
    ADD CONSTRAINT dataset_hmis_pkey PRIMARY KEY (facility_id, indicator_raw_id, period_id);


--
-- Name: dataset_hmis_upload_attempts dataset_hmis_upload_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dataset_hmis_upload_attempts
    ADD CONSTRAINT dataset_hmis_upload_attempts_pkey PRIMARY KEY (id);


--
-- Name: dataset_hmis_versions dataset_hmis_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dataset_hmis_versions
    ADD CONSTRAINT dataset_hmis_versions_pkey PRIMARY KEY (id);


--
-- Name: facilities facilities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.facilities
    ADD CONSTRAINT facilities_pkey PRIMARY KEY (facility_id);


--
-- Name: indicator_mappings indicator_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.indicator_mappings
    ADD CONSTRAINT indicator_mappings_pkey PRIMARY KEY (indicator_raw_id, indicator_common_id);


--
-- Name: indicators indicators_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.indicators
    ADD CONSTRAINT indicators_pkey PRIMARY KEY (indicator_common_id);


--
-- Name: indicators_raw indicators_raw_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.indicators_raw
    ADD CONSTRAINT indicators_raw_pkey PRIMARY KEY (indicator_raw_id);


--
-- Name: instance_config instance_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.instance_config
    ADD CONSTRAINT instance_config_pkey PRIMARY KEY (config_key);


--
-- Name: project_user_roles project_user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_user_roles
    ADD CONSTRAINT project_user_roles_pkey PRIMARY KEY (email, project_id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (migration_id);


--
-- Name: structure_upload_attempts structure_upload_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.structure_upload_attempts
    ADD CONSTRAINT structure_upload_attempts_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (email);


--
-- Name: idx_admin_areas_2_admin_area_1; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_admin_areas_2_admin_area_1 ON public.admin_areas_2 USING btree (admin_area_1);


--
-- Name: idx_admin_areas_2_admin_area_2; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_admin_areas_2_admin_area_2 ON public.admin_areas_2 USING btree (admin_area_2);


--
-- Name: idx_admin_areas_3_admin_area_2; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_admin_areas_3_admin_area_2 ON public.admin_areas_3 USING btree (admin_area_2);


--
-- Name: idx_admin_areas_3_admin_area_2_admin_area_1; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_admin_areas_3_admin_area_2_admin_area_1 ON public.admin_areas_3 USING btree (admin_area_2, admin_area_1);


--
-- Name: idx_admin_areas_3_admin_area_3; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_admin_areas_3_admin_area_3 ON public.admin_areas_3 USING btree (admin_area_3);


--
-- Name: idx_admin_areas_4_admin_area_3_admin_area_2_admin_area_1; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_admin_areas_4_admin_area_3_admin_area_2_admin_area_1 ON public.admin_areas_4 USING btree (admin_area_3, admin_area_2, admin_area_1);


--
-- Name: idx_admin_areas_4_admin_area_4; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_admin_areas_4_admin_area_4 ON public.admin_areas_4 USING btree (admin_area_4);


--
-- Name: idx_audit_logs_action; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action);


--
-- Name: idx_audit_logs_project_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_project_id ON public.audit_logs USING btree (project_id) WHERE (project_id IS NOT NULL);


--
-- Name: idx_audit_logs_resource; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_resource ON public.audit_logs USING btree (resource_type, resource_id) WHERE ((resource_type IS NOT NULL) AND (resource_id IS NOT NULL));


--
-- Name: idx_audit_logs_session; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_session ON public.audit_logs USING btree (session_id, "timestamp" DESC) WHERE (session_id IS NOT NULL);


--
-- Name: idx_audit_logs_timestamp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_timestamp ON public.audit_logs USING btree ("timestamp" DESC);


--
-- Name: idx_audit_logs_user_activity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_user_activity ON public.audit_logs USING btree (user_email, action, "timestamp" DESC) WHERE (action = ANY (ARRAY['USER_LOGIN'::text, 'USER_LOGOUT'::text, 'USER_ACTIVITY'::text]));


--
-- Name: idx_audit_logs_user_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_user_email ON public.audit_logs USING btree (user_email);


--
-- Name: idx_dataset_hfa_covering; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_dataset_hfa_covering ON public.dataset_hfa USING btree (var_name, facility_id, time_point) INCLUDE (value);


--
-- Name: idx_dataset_hfa_facility_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_dataset_hfa_facility_id ON public.dataset_hfa USING btree (facility_id);


--
-- Name: idx_dataset_hfa_upload_attempts_date_started; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_dataset_hfa_upload_attempts_date_started ON public.dataset_hfa_upload_attempts USING btree (date_started);


--
-- Name: idx_dataset_hfa_upload_attempts_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_dataset_hfa_upload_attempts_status ON public.dataset_hfa_upload_attempts USING btree (status);


--
-- Name: idx_dataset_hfa_upload_attempts_status_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_dataset_hfa_upload_attempts_status_type ON public.dataset_hfa_upload_attempts USING btree (status_type);


--
-- Name: idx_dataset_hfa_value; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_dataset_hfa_value ON public.dataset_hfa USING btree (value) WHERE (length(value) <= 50);


--
-- Name: idx_dataset_hfa_var_facility; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_dataset_hfa_var_facility ON public.dataset_hfa USING btree (var_name, facility_id);


--
-- Name: idx_dataset_hfa_var_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_dataset_hfa_var_name ON public.dataset_hfa USING btree (var_name);


--
-- Name: idx_dataset_hfa_version_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_dataset_hfa_version_id ON public.dataset_hfa USING btree (version_id);


--
-- Name: idx_dataset_hmis_facility_period; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_dataset_hmis_facility_period ON public.dataset_hmis USING btree (facility_id, period_id);


--
-- Name: idx_dataset_hmis_indicator_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_dataset_hmis_indicator_id ON public.dataset_hmis USING btree (indicator_raw_id);


--
-- Name: idx_dataset_hmis_indicator_period; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_dataset_hmis_indicator_period ON public.dataset_hmis USING btree (indicator_raw_id, period_id);


--
-- Name: idx_dataset_hmis_period_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_dataset_hmis_period_id ON public.dataset_hmis USING btree (period_id);


--
-- Name: idx_dataset_hmis_period_indicator; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_dataset_hmis_period_indicator ON public.dataset_hmis USING btree (period_id, indicator_raw_id);


--
-- Name: idx_dataset_hmis_upload_attempts_date_started; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_dataset_hmis_upload_attempts_date_started ON public.dataset_hmis_upload_attempts USING btree (date_started);


--
-- Name: idx_dataset_hmis_upload_attempts_status_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_dataset_hmis_upload_attempts_status_type ON public.dataset_hmis_upload_attempts USING btree (status_type);


--
-- Name: idx_dataset_hmis_version_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_dataset_hmis_version_id ON public.dataset_hmis USING btree (version_id);


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
-- Name: idx_facilities_facility_ownership; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_facilities_facility_ownership ON public.facilities USING btree (facility_ownership) WHERE (facility_ownership IS NOT NULL);


--
-- Name: idx_facilities_facility_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_facilities_facility_type ON public.facilities USING btree (facility_type) WHERE (facility_type IS NOT NULL);


--
-- Name: idx_indicator_mappings_common_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_indicator_mappings_common_id ON public.indicator_mappings USING btree (indicator_common_id);


--
-- Name: idx_indicator_mappings_raw_common; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_indicator_mappings_raw_common ON public.indicator_mappings USING btree (indicator_raw_id, indicator_common_id);


--
-- Name: idx_indicator_mappings_raw_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_indicator_mappings_raw_id ON public.indicator_mappings USING btree (indicator_raw_id);


--
-- Name: idx_indicator_mappings_updated_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_indicator_mappings_updated_at ON public.indicator_mappings USING btree (updated_at DESC);


--
-- Name: idx_project_user_roles_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_project_user_roles_email ON public.project_user_roles USING btree (email);


--
-- Name: idx_project_user_roles_project_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_project_user_roles_project_id ON public.project_user_roles USING btree (project_id);


--
-- Name: admin_areas_2 admin_areas_2_admin_area_1_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_areas_2
    ADD CONSTRAINT admin_areas_2_admin_area_1_fkey FOREIGN KEY (admin_area_1) REFERENCES public.admin_areas_1(admin_area_1) ON DELETE CASCADE;


--
-- Name: admin_areas_3 admin_areas_3_admin_area_2_admin_area_1_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_areas_3
    ADD CONSTRAINT admin_areas_3_admin_area_2_admin_area_1_fkey FOREIGN KEY (admin_area_2, admin_area_1) REFERENCES public.admin_areas_2(admin_area_2, admin_area_1) ON DELETE CASCADE;


--
-- Name: admin_areas_4 admin_areas_4_admin_area_3_admin_area_2_admin_area_1_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_areas_4
    ADD CONSTRAINT admin_areas_4_admin_area_3_admin_area_2_admin_area_1_fkey FOREIGN KEY (admin_area_3, admin_area_2, admin_area_1) REFERENCES public.admin_areas_3(admin_area_3, admin_area_2, admin_area_1) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_user_email_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_email_fkey FOREIGN KEY (user_email) REFERENCES public.users(email) ON DELETE CASCADE;


--
-- Name: dataset_hfa dataset_hfa_facility_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dataset_hfa
    ADD CONSTRAINT dataset_hfa_facility_id_fkey FOREIGN KEY (facility_id) REFERENCES public.facilities(facility_id) ON DELETE RESTRICT DEFERRABLE;


--
-- Name: dataset_hfa dataset_hfa_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dataset_hfa
    ADD CONSTRAINT dataset_hfa_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.dataset_hfa_versions(id) ON DELETE RESTRICT;


--
-- Name: dataset_hmis dataset_hmis_facility_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dataset_hmis
    ADD CONSTRAINT dataset_hmis_facility_id_fkey FOREIGN KEY (facility_id) REFERENCES public.facilities(facility_id) ON DELETE RESTRICT DEFERRABLE;


--
-- Name: dataset_hmis dataset_hmis_indicator_raw_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dataset_hmis
    ADD CONSTRAINT dataset_hmis_indicator_raw_id_fkey FOREIGN KEY (indicator_raw_id) REFERENCES public.indicators_raw(indicator_raw_id) ON DELETE RESTRICT DEFERRABLE;


--
-- Name: dataset_hmis dataset_hmis_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dataset_hmis
    ADD CONSTRAINT dataset_hmis_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.dataset_hmis_versions(id) ON DELETE RESTRICT;


--
-- Name: facilities facilities_admin_area_4_admin_area_3_admin_area_2_admin_ar_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.facilities
    ADD CONSTRAINT facilities_admin_area_4_admin_area_3_admin_area_2_admin_ar_fkey FOREIGN KEY (admin_area_4, admin_area_3, admin_area_2, admin_area_1) REFERENCES public.admin_areas_4(admin_area_4, admin_area_3, admin_area_2, admin_area_1) ON DELETE CASCADE;


--
-- Name: indicator_mappings indicator_mappings_indicator_common_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.indicator_mappings
    ADD CONSTRAINT indicator_mappings_indicator_common_id_fkey FOREIGN KEY (indicator_common_id) REFERENCES public.indicators(indicator_common_id) ON DELETE CASCADE;


--
-- Name: indicator_mappings indicator_mappings_indicator_raw_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.indicator_mappings
    ADD CONSTRAINT indicator_mappings_indicator_raw_id_fkey FOREIGN KEY (indicator_raw_id) REFERENCES public.indicators_raw(indicator_raw_id) ON DELETE CASCADE;


--
-- Name: project_user_roles project_user_roles_email_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_user_roles
    ADD CONSTRAINT project_user_roles_email_fkey FOREIGN KEY (email) REFERENCES public.users(email) ON DELETE CASCADE;


--
-- Name: project_user_roles project_user_roles_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_user_roles
    ADD CONSTRAINT project_user_roles_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


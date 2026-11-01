--
-- PostgreSQL database dump
--

\restrict BfzO9wAeLyQHE0UbBFxFltIRyOtCxY8YQaP9UipSkPd7fBJe2JXPbr2sd1UsAoc

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: cart_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cart_lines (
    cart_id uuid NOT NULL,
    product_id text NOT NULL,
    quantity integer NOT NULL,
    unit_price integer NOT NULL,
    latest_price integer,
    CONSTRAINT cart_lines_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT cart_lines_unit_price_check CHECK ((unit_price >= 0))
);


--
-- Name: carts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.carts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    coupon_code text,
    currency text,
    expires_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT carts_status_check CHECK ((status = ANY (ARRAY['active'::text, 'checked_out'::text])))
);


--
-- Name: coupons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupons (
    code text NOT NULL,
    percent_off integer NOT NULL,
    expires_at timestamp with time zone,
    CONSTRAINT coupons_percent_off_check CHECK (((percent_off >= 1) AND (percent_off <= 100)))
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    name text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cart_lines cart_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_lines
    ADD CONSTRAINT cart_lines_pkey PRIMARY KEY (cart_id, product_id);


--
-- Name: carts carts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carts
    ADD CONSTRAINT carts_pkey PRIMARY KEY (id);


--
-- Name: coupons coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_pkey PRIMARY KEY (code);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (name);


--
-- Name: cart_lines_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cart_lines_product_idx ON public.cart_lines USING btree (product_id);


--
-- Name: carts_one_active_per_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX carts_one_active_per_user ON public.carts USING btree (user_id) WHERE ((user_id IS NOT NULL) AND (status = 'active'::text));


--
-- Name: cart_lines cart_lines_cart_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_lines
    ADD CONSTRAINT cart_lines_cart_id_fkey FOREIGN KEY (cart_id) REFERENCES public.carts(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict BfzO9wAeLyQHE0UbBFxFltIRyOtCxY8YQaP9UipSkPd7fBJe2JXPbr2sd1UsAoc


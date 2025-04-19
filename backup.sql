--
-- PostgreSQL database dump
--

-- Dumped from database version 14.17 (Debian 14.17-1.pgdg120+1)
-- Dumped by pg_dump version 14.17 (Debian 14.17-1.pgdg120+1)

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

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Cards; Type: TABLE; Schema: public; Owner: marius
--

CREATE TABLE public."Cards" (
    "idCard" integer NOT NULL,
    "idGame" integer,
    "idUserHoldingIt" integer,
    "Picture" character varying(255) NOT NULL,
    "CardState" character varying(50) NOT NULL,
    CONSTRAINT check_card_state CHECK ((("CardState")::text = ANY ((ARRAY['in_deck'::character varying, 'in_hand'::character varying, 'played'::character varying, 'discarded'::character varying])::text[])))
);


ALTER TABLE public."Cards" OWNER TO marius;

--
-- Name: Cards_idCard_seq; Type: SEQUENCE; Schema: public; Owner: marius
--

CREATE SEQUENCE public."Cards_idCard_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public."Cards_idCard_seq" OWNER TO marius;

--
-- Name: Cards_idCard_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: marius
--

ALTER SEQUENCE public."Cards_idCard_seq" OWNED BY public."Cards"."idCard";


--
-- Name: ChatMessages; Type: TABLE; Schema: public; Owner: marius
--

CREATE TABLE public."ChatMessages" (
    "idMessages" integer NOT NULL,
    "idGame" integer,
    "TextContent" text NOT NULL,
    "Timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public."ChatMessages" OWNER TO marius;

--
-- Name: ChatMessages_idMessages_seq; Type: SEQUENCE; Schema: public; Owner: marius
--

CREATE SEQUENCE public."ChatMessages_idMessages_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public."ChatMessages_idMessages_seq" OWNER TO marius;

--
-- Name: ChatMessages_idMessages_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: marius
--

ALTER SEQUENCE public."ChatMessages_idMessages_seq" OWNED BY public."ChatMessages"."idMessages";


--
-- Name: Game; Type: TABLE; Schema: public; Owner: marius
--

CREATE TABLE public."Game" (
    "idGame" integer NOT NULL,
    "DateCreated" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    "GameType" character varying(50) NOT NULL,
    CONSTRAINT check_game_type CHECK ((("GameType")::text = ANY ((ARRAY['classic'::character varying, 'timed'::character varying, 'tournament'::character varying])::text[])))
);


ALTER TABLE public."Game" OWNER TO marius;

--
-- Name: Game_Users; Type: TABLE; Schema: public; Owner: marius
--

CREATE TABLE public."Game_Users" (
    "idUsers" integer NOT NULL,
    "idGame" integer NOT NULL
);


ALTER TABLE public."Game_Users" OWNER TO marius;

--
-- Name: Game_idGame_seq; Type: SEQUENCE; Schema: public; Owner: marius
--

CREATE SEQUENCE public."Game_idGame_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public."Game_idGame_seq" OWNER TO marius;

--
-- Name: Game_idGame_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: marius
--

ALTER SEQUENCE public."Game_idGame_seq" OWNED BY public."Game"."idGame";


--
-- Name: GamesResults; Type: TABLE; Schema: public; Owner: marius
--

CREATE TABLE public."GamesResults" (
    "idGame" integer NOT NULL,
    "idUser" integer NOT NULL,
    "FinalScore" integer NOT NULL,
    "DatePlayed" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public."GamesResults" OWNER TO marius;

--
-- Name: User; Type: TABLE; Schema: public; Owner: marius
--

CREATE TABLE public."User" (
    "idUser" integer NOT NULL,
    "Username" character varying(50) NOT NULL,
    "Password" character varying(255) NOT NULL,
    "Profile_picture" character varying(255),
    "isAdmin" boolean DEFAULT false
);


ALTER TABLE public."User" OWNER TO marius;

--
-- Name: User_idUser_seq; Type: SEQUENCE; Schema: public; Owner: marius
--

CREATE SEQUENCE public."User_idUser_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public."User_idUser_seq" OWNER TO marius;

--
-- Name: User_idUser_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: marius
--

ALTER SEQUENCE public."User_idUser_seq" OWNED BY public."User"."idUser";


--
-- Name: Cards idCard; Type: DEFAULT; Schema: public; Owner: marius
--

ALTER TABLE ONLY public."Cards" ALTER COLUMN "idCard" SET DEFAULT nextval('public."Cards_idCard_seq"'::regclass);


--
-- Name: ChatMessages idMessages; Type: DEFAULT; Schema: public; Owner: marius
--

ALTER TABLE ONLY public."ChatMessages" ALTER COLUMN "idMessages" SET DEFAULT nextval('public."ChatMessages_idMessages_seq"'::regclass);


--
-- Name: Game idGame; Type: DEFAULT; Schema: public; Owner: marius
--

ALTER TABLE ONLY public."Game" ALTER COLUMN "idGame" SET DEFAULT nextval('public."Game_idGame_seq"'::regclass);


--
-- Name: User idUser; Type: DEFAULT; Schema: public; Owner: marius
--

ALTER TABLE ONLY public."User" ALTER COLUMN "idUser" SET DEFAULT nextval('public."User_idUser_seq"'::regclass);


--
-- Data for Name: Cards; Type: TABLE DATA; Schema: public; Owner: marius
--

COPY public."Cards" ("idCard", "idGame", "idUserHoldingIt", "Picture", "CardState") FROM stdin;
\.


--
-- Data for Name: ChatMessages; Type: TABLE DATA; Schema: public; Owner: marius
--

COPY public."ChatMessages" ("idMessages", "idGame", "TextContent", "Timestamp") FROM stdin;
\.


--
-- Data for Name: Game; Type: TABLE DATA; Schema: public; Owner: marius
--

COPY public."Game" ("idGame", "DateCreated", "GameType") FROM stdin;
\.


--
-- Data for Name: Game_Users; Type: TABLE DATA; Schema: public; Owner: marius
--

COPY public."Game_Users" ("idUsers", "idGame") FROM stdin;
\.


--
-- Data for Name: GamesResults; Type: TABLE DATA; Schema: public; Owner: marius
--

COPY public."GamesResults" ("idGame", "idUser", "FinalScore", "DatePlayed") FROM stdin;
\.


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: marius
--

COPY public."User" ("idUser", "Username", "Password", "Profile_picture", "isAdmin") FROM stdin;
\.


--
-- Name: Cards_idCard_seq; Type: SEQUENCE SET; Schema: public; Owner: marius
--

SELECT pg_catalog.setval('public."Cards_idCard_seq"', 1, false);


--
-- Name: ChatMessages_idMessages_seq; Type: SEQUENCE SET; Schema: public; Owner: marius
--

SELECT pg_catalog.setval('public."ChatMessages_idMessages_seq"', 1, false);


--
-- Name: Game_idGame_seq; Type: SEQUENCE SET; Schema: public; Owner: marius
--

SELECT pg_catalog.setval('public."Game_idGame_seq"', 1, false);


--
-- Name: User_idUser_seq; Type: SEQUENCE SET; Schema: public; Owner: marius
--

SELECT pg_catalog.setval('public."User_idUser_seq"', 1, false);


--
-- Name: Cards Cards_pkey; Type: CONSTRAINT; Schema: public; Owner: marius
--

ALTER TABLE ONLY public."Cards"
    ADD CONSTRAINT "Cards_pkey" PRIMARY KEY ("idCard");


--
-- Name: ChatMessages ChatMessages_pkey; Type: CONSTRAINT; Schema: public; Owner: marius
--

ALTER TABLE ONLY public."ChatMessages"
    ADD CONSTRAINT "ChatMessages_pkey" PRIMARY KEY ("idMessages");


--
-- Name: Game_Users Game_Users_pkey; Type: CONSTRAINT; Schema: public; Owner: marius
--

ALTER TABLE ONLY public."Game_Users"
    ADD CONSTRAINT "Game_Users_pkey" PRIMARY KEY ("idUsers", "idGame");


--
-- Name: Game Game_pkey; Type: CONSTRAINT; Schema: public; Owner: marius
--

ALTER TABLE ONLY public."Game"
    ADD CONSTRAINT "Game_pkey" PRIMARY KEY ("idGame");


--
-- Name: GamesResults GamesResults_pkey; Type: CONSTRAINT; Schema: public; Owner: marius
--

ALTER TABLE ONLY public."GamesResults"
    ADD CONSTRAINT "GamesResults_pkey" PRIMARY KEY ("idGame", "idUser");


--
-- Name: User User_Username_key; Type: CONSTRAINT; Schema: public; Owner: marius
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_Username_key" UNIQUE ("Username");


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: marius
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY ("idUser");


--
-- Name: Cards Cards_idGame_fkey; Type: FK CONSTRAINT; Schema: public; Owner: marius
--

ALTER TABLE ONLY public."Cards"
    ADD CONSTRAINT "Cards_idGame_fkey" FOREIGN KEY ("idGame") REFERENCES public."Game"("idGame");


--
-- Name: Cards Cards_idUserHoldingIt_fkey; Type: FK CONSTRAINT; Schema: public; Owner: marius
--

ALTER TABLE ONLY public."Cards"
    ADD CONSTRAINT "Cards_idUserHoldingIt_fkey" FOREIGN KEY ("idUserHoldingIt") REFERENCES public."User"("idUser");


--
-- Name: ChatMessages ChatMessages_idGame_fkey; Type: FK CONSTRAINT; Schema: public; Owner: marius
--

ALTER TABLE ONLY public."ChatMessages"
    ADD CONSTRAINT "ChatMessages_idGame_fkey" FOREIGN KEY ("idGame") REFERENCES public."Game"("idGame");


--
-- Name: Game_Users Game_Users_idGame_fkey; Type: FK CONSTRAINT; Schema: public; Owner: marius
--

ALTER TABLE ONLY public."Game_Users"
    ADD CONSTRAINT "Game_Users_idGame_fkey" FOREIGN KEY ("idGame") REFERENCES public."Game"("idGame");


--
-- Name: Game_Users Game_Users_idUsers_fkey; Type: FK CONSTRAINT; Schema: public; Owner: marius
--

ALTER TABLE ONLY public."Game_Users"
    ADD CONSTRAINT "Game_Users_idUsers_fkey" FOREIGN KEY ("idUsers") REFERENCES public."User"("idUser");


--
-- Name: GamesResults GamesResults_idGame_fkey; Type: FK CONSTRAINT; Schema: public; Owner: marius
--

ALTER TABLE ONLY public."GamesResults"
    ADD CONSTRAINT "GamesResults_idGame_fkey" FOREIGN KEY ("idGame") REFERENCES public."Game"("idGame");


--
-- Name: GamesResults GamesResults_idUser_fkey; Type: FK CONSTRAINT; Schema: public; Owner: marius
--

ALTER TABLE ONLY public."GamesResults"
    ADD CONSTRAINT "GamesResults_idUser_fkey" FOREIGN KEY ("idUser") REFERENCES public."User"("idUser");


--
-- PostgreSQL database dump complete
--


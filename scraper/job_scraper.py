#!/usr/bin/env python3
"""
Job Scraper — Remote AI/ML/Engineering positions from public ATS APIs.
No auth required. Targets major tech, fintech, and AI-finance companies.

Requirements: pip install requests
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests

# ---------------------------------------------------------------------------
# Company Registry
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Inactive slugs (quarantine list)
# ---------------------------------------------------------------------------
#
# Companies in this set are skipped by `pipeline.py` and the CLI scraper.
# They are kept in COMPANIES for documentation; flipping a slug back on is
# a single-line removal once a new working slug/ATS is identified.
#
# Audit 2026-05-16: each entry below returned HTTP 404 or no data from the
# public ATS API. Most have moved to a private Greenhouse SaaS board (auth
# required), to Workday, or to an in-house careers page. See
# `scripts/audit_ci_companies.py` to re-run the audit. Re-enable an entry
# only after verifying `scripts/audit_ci_companies.py --ats <ats>` shows
# a non-zero raw count for it.

INACTIVE_SLUGS: set[tuple[str, str]] = {
    # Greenhouse — 76 entries returning HTTP 404 / empty (audit 2026-05-16)
    ("greenhouse", "1password"),
    ("greenhouse", "airwallex"),
    ("greenhouse", "aledade"),
    ("greenhouse", "anduril"),
    ("greenhouse", "arcadiasolutions"),
    ("greenhouse", "arcadia"),
    ("greenhouse", "atlassian"),
    ("greenhouse", "audible"),
    ("greenhouse", "bloomenergy"),
    ("greenhouse", "bloomberg"),
    ("greenhouse", "bolt"),
    ("greenhouse", "brainly"),
    ("greenhouse", "canva"),
    ("greenhouse", "checkoutcom"),
    ("greenhouse", "chegg"),
    ("greenhouse", "chewy"),
    ("greenhouse", "cityblockhealth"),
    ("greenhouse", "classdojo"),
    ("greenhouse", "coinbase"),
    ("greenhouse", "colorgenomics"),
    ("greenhouse", "confluent"),
    ("greenhouse", "crowdstrike"),
    ("greenhouse", "devoted"),
    ("greenhouse", "doordash"),
    ("greenhouse", "enphaseenergy"),
    ("greenhouse", "etsy"),
    ("greenhouse", "fanatics"),
    ("greenhouse", "formenergy"),
    ("greenhouse", "forrester"),
    ("greenhouse", "goodrx"),
    ("greenhouse", "gopuff"),
    ("greenhouse", "handshake"),
    ("greenhouse", "hashicorp"),
    ("greenhouse", "himshers"),
    ("greenhouse", "includedhealth"),
    ("greenhouse", "instructure"),
    ("greenhouse", "klarna"),
    ("greenhouse", "kong"),
    ("greenhouse", "maxar"),
    ("greenhouse", "miro"),
    ("greenhouse", "netflix"),
    ("greenhouse", "notion"),
    ("greenhouse", "openai"),
    ("greenhouse", "oscarhealth"),
    ("greenhouse", "outschool"),
    ("greenhouse", "pachama"),
    ("greenhouse", "plaid"),
    ("greenhouse", "primer"),
    ("greenhouse", "quantumscape"),
    ("greenhouse", "quizlet"),
    ("greenhouse", "ramp"),
    ("greenhouse", "rebelliondefense"),
    ("greenhouse", "remitly"),
    ("greenhouse", "rivian"),
    ("greenhouse", "ro"),
    ("greenhouse", "secondfrontsystems"),
    ("greenhouse", "shieldai"),
    ("greenhouse", "shopify"),
    ("greenhouse", "slalom"),
    ("greenhouse", "snap"),
    ("greenhouse", "snowflake"),
    ("greenhouse", "span"),
    ("greenhouse", "spotify"),
    ("greenhouse", "substack"),
    ("greenhouse", "swordhealth"),
    ("greenhouse", "tempus"),
    ("greenhouse", "thredup"),
    ("greenhouse", "uber"),
    ("greenhouse", "veeva"),
    ("greenhouse", "verily"),
    ("greenhouse", "warbyparker"),
    ("greenhouse", "wayfair"),
    ("greenhouse", "wealthfront"),
    ("greenhouse", "westmonroe"),
    ("greenhouse", "transferwise"),
    ("greenhouse", "mondaycom"),
    # Lever — 2 entries (audit 2026-05-16)
    ("lever", "scaleai"),
    ("lever", "stratadecision"),
    # Ashby — 1 entry (audit 2026-05-16)
    ("ashby", "anthropic"),
}


def is_active(company: dict) -> bool:
    """Return False if this company's (ats, slug) is quarantined.

    Used by `pipeline.py` and the standalone CLI to skip companies whose
    public ATS endpoint is known-broken. Quarantine is data, not logic:
    edit `INACTIVE_SLUGS` to flip a company back on or to add new ones.
    """
    return (company.get("ats"), company.get("slug")) not in INACTIVE_SLUGS


COMPANIES = [
    # FAANG / Big Tech
    {"name": "Netflix",      "ats": "greenhouse", "slug": "netflix",      "category": "big_tech"},
    {"name": "NVIDIA",       "ats": "workday",    "slug": "nvidia",        "category": "big_tech",
     "workday": {"tenant": "nvidia", "host": "wd5", "site": "NVIDIAExternalCareerSite"}},
    {"name": "Google",       "ats": "custom",     "slug": "google",        "category": "big_tech",
     "careers_url": "https://careers.google.com/jobs/results/?category=DATA_CENTER_OPERATIONS&category=DEVELOPER_RELATIONS&category=HARDWARE_ENGINEERING&category=INFORMATION_TECHNOLOGY&category=MANUFACTURING_SUPPLY_CHAIN&category=NETWORK_ENGINEERING&category=PRODUCT_MANAGEMENT&category=PROGRAM_MANAGEMENT&category=SOFTWARE_ENGINEERING&category=TECHNICAL_INFRASTRUCTURE_ENGINEERING&category=TECHNICAL_WRITING&category=USER_EXPERIENCE&employment_type=FULL_TIME"},
    {"name": "Apple",        "ats": "custom",     "slug": "apple",         "category": "big_tech",
     "careers_url": "https://jobs.apple.com/en-us/search"},
    {"name": "Amazon",       "ats": "custom",     "slug": "amazon",        "category": "big_tech",
     "careers_url": "https://amazon.jobs/en/search?base_query=machine+learning&loc_query=&job_count=10&result_limit=10&sort=relevant&category%5B%5D=machine-learning-science&category%5B%5D=software-development"},
    {"name": "Meta",         "ats": "custom",     "slug": "meta",          "category": "big_tech",
     "careers_url": "https://www.metacareers.com/jobs/?teams%5B0%5D=Data%20%26%20Analytics&teams%5B1%5D=Machine%20Learning&teams%5B2%5D=Software%20Engineering"},
    {"name": "Microsoft",    "ats": "custom",     "slug": "microsoft",     "category": "big_tech",
     "careers_url": "https://careers.microsoft.com/v2/global/en/search?q=machine+learning&lc=United+States&l=en_us&pgSz=20&o=Relevance&flt=true"},

    # Major Fintech
    {"name": "Stripe",       "ats": "greenhouse", "slug": "stripe",        "category": "fintech"},
    {"name": "Block",        "ats": "greenhouse", "slug": "block",         "category": "fintech"},
    {"name": "Plaid",        "ats": "ashby",      "slug": "plaid",         "category": "fintech"},
    {"name": "Affirm",       "ats": "greenhouse", "slug": "affirm",        "category": "fintech"},
    {"name": "Robinhood",    "ats": "greenhouse", "slug": "robinhood",     "category": "fintech"},
    {"name": "Coinbase",     "ats": "greenhouse", "slug": "coinbase",      "category": "fintech"},
    {"name": "Ripple",       "ats": "greenhouse", "slug": "ripple",        "category": "fintech"},
    {"name": "Ramp",         "ats": "greenhouse", "slug": "ramp",          "category": "fintech"},
    {"name": "Brex",         "ats": "greenhouse", "slug": "brex",          "category": "fintech"},
    {"name": "Chime",        "ats": "greenhouse", "slug": "chime",         "category": "fintech"},
    {"name": "Marqeta",      "ats": "greenhouse", "slug": "marqeta",       "category": "fintech"},
    {"name": "Upstart",      "ats": "greenhouse", "slug": "upstart",       "category": "fintech"},
    {"name": "SoFi",         "ats": "greenhouse", "slug": "sofi",          "category": "fintech"},
    {"name": "Remitly",      "ats": "greenhouse", "slug": "remitly",       "category": "fintech"},
    {"name": "Wise",         "ats": "greenhouse", "slug": "transferwise",  "category": "fintech"},
    {"name": "Toast",        "ats": "greenhouse", "slug": "toast",         "category": "fintech"},
    {"name": "Bill.com",     "ats": "greenhouse", "slug": "billcom",       "category": "fintech"},
    {"name": "Wealthfront",  "ats": "greenhouse", "slug": "wealthfront",   "category": "fintech"},
    {"name": "Betterment",   "ats": "greenhouse", "slug": "betterment",    "category": "fintech"},
    {"name": "Airwallex",    "ats": "greenhouse", "slug": "airwallex",     "category": "fintech"},
    {"name": "Mercury",      "ats": "greenhouse", "slug": "mercury",       "category": "fintech"},
    {"name": "Carta",        "ats": "greenhouse", "slug": "carta",         "category": "fintech"},
    {"name": "Gusto",        "ats": "greenhouse", "slug": "gusto",         "category": "fintech"},
    {"name": "Deel",         "ats": "ashby",      "slug": "deel",          "category": "fintech"},
    {"name": "Klarna",       "ats": "greenhouse", "slug": "klarna",        "category": "fintech"},
    {"name": "PayPal",       "ats": "custom",     "slug": "paypal",        "category": "fintech",
     "careers_url": "https://careers.pypl.com/home/"},
    {"name": "Mastercard",   "ats": "custom",     "slug": "mastercard",    "category": "fintech",
     "careers_url": "https://careers.mastercard.com/us/en/search-results"},
    {"name": "Visa",         "ats": "custom",     "slug": "visa",          "category": "fintech",
     "careers_url": "https://corporate.visa.com/en/jobs.html"},
    {"name": "Adyen",        "ats": "greenhouse", "slug": "adyen",         "category": "fintech"},
    {"name": "Checkout.com", "ats": "greenhouse", "slug": "checkoutcom",   "category": "fintech"},

    # Growth-Stage / AI-Finance
    {"name": "Anthropic",   "ats": "greenhouse", "slug": "anthropic",     "category": "ai_tech"},
    {"name": "OpenAI",      "ats": "ashby",      "slug": "openai",        "category": "ai_tech"},
    {"name": "Datadog",     "ats": "greenhouse", "slug": "datadog",       "category": "ai_tech"},
    {"name": "Databricks",  "ats": "greenhouse", "slug": "databricks",    "category": "ai_tech"},
    {"name": "Scale AI",    "ats": "greenhouse", "slug": "scaleai",       "category": "ai_tech"},
    {"name": "Anduril",     "ats": "greenhouse", "slug": "anduril",       "category": "ai_tech"},
    {"name": "Palantir",    "ats": "lever",      "slug": "palantir",      "category": "ai_tech"},
    {"name": "Notion",      "ats": "ashby",      "slug": "notion",        "category": "ai_tech"},
    {"name": "Figma",       "ats": "greenhouse", "slug": "figma",         "category": "ai_tech"},
    {"name": "Vercel",      "ats": "greenhouse", "slug": "vercel",        "category": "ai_tech"},
    {"name": "Supabase",    "ats": "ashby",      "slug": "supabase",      "category": "ai_tech"},
    {"name": "Klaviyo",     "ats": "greenhouse", "slug": "klaviyo",       "category": "ai_tech"},

    # HealthTech-FinTech Crossover
    {"name": "Arcadia",          "ats": "greenhouse", "slug": "arcadiasolutions", "category": "healthtech"},
    {"name": "Strata Decision",  "ats": "lever",      "slug": "stratadecision",   "category": "healthtech"},
    {"name": "Oscar Health",     "ats": "greenhouse", "slug": "oscarhealth",      "category": "healthtech"},
    {"name": "Devoted Health",   "ats": "greenhouse", "slug": "devoted",          "category": "healthtech"},
    {"name": "Cityblock Health", "ats": "greenhouse", "slug": "cityblockhealth",  "category": "healthtech"},

    # Trading / Quantitative
    {"name": "Citadel",          "ats": "custom", "slug": "citadel",      "category": "quant",
     "careers_url": "https://www.citadel.com/careers/open-opportunities/"},
    {"name": "Two Sigma",        "ats": "custom", "slug": "twosigma",     "category": "quant",
     "careers_url": "https://careers.twosigma.com/careers/JobSearch?query=&location="},
    {"name": "Jane Street",      "ats": "custom", "slug": "janestreet",   "category": "quant",
     "careers_url": "https://www.janestreet.com/join-jane-street/open-roles/"},
    {"name": "DE Shaw",          "ats": "custom", "slug": "deshaw",       "category": "quant",
     "careers_url": "https://www.deshaw.com/careers"},
    {"name": "Jump Trading",     "ats": "custom", "slug": "jumptrading",  "category": "quant",
     "careers_url": "https://www.jumptrading.com/careers/"},
    {"name": "Hudson River",     "ats": "custom", "slug": "hrt",          "category": "quant",
     "careers_url": "https://www.hudsonrivertrading.com/careers/"},

    # Workday tenants — Fortune-500-scale employers using the public CXS API.
    # Tenant slugs / site names verified against each careers page bundle.
    {"name": "CVS Health",   "ats": "workday", "slug": "cvshealth",   "category": "healthtech",
     "workday": {"tenant": "cvshealth",  "host": "wd1",  "site": "CVS_Health_Careers"}},
    {"name": "Humana",       "ats": "workday", "slug": "humana",      "category": "healthtech",
     "workday": {"tenant": "humana",     "host": "wd5",  "site": "Humana_External_Career_Site"}},
    {"name": "Walmart",      "ats": "workday", "slug": "walmart",     "category": "big_tech",
     "workday": {"tenant": "walmart",    "host": "wd5",  "site": "WalmartExternal"}},
    {"name": "Disney",       "ats": "workday", "slug": "disney",      "category": "big_tech",
     "workday": {"tenant": "disney",     "host": "wd5",  "site": "disneycareer"}},
    {"name": "Citi",         "ats": "workday", "slug": "citi",        "category": "fintech",
     "workday": {"tenant": "citi",       "host": "wd5",  "site": "2"}},
    {"name": "Salesforce",   "ats": "workday", "slug": "salesforce",  "category": "ai_tech",
     "workday": {"tenant": "salesforce", "host": "wd12", "site": "External_Career_Site"}},

    # ─── Industry pack expansion (109 net new sources from industry_packs.py) ────

    # Healthcare & Life Sciences
    {"name": "Veeva Systems",   "ats": "greenhouse", "slug": "veeva",          "category": "healthcare"},
    {"name": "Flatiron Health", "ats": "greenhouse", "slug": "flatironhealth", "category": "healthcare"},
    {"name": "Tempus",          "ats": "greenhouse", "slug": "tempus",         "category": "healthcare"},
    {"name": "Color Health",    "ats": "greenhouse", "slug": "colorgenomics",  "category": "healthcare"},
    {"name": "Ro",              "ats": "greenhouse", "slug": "ro",             "category": "healthcare"},
    {"name": "Hims & Hers",     "ats": "greenhouse", "slug": "himshers",       "category": "healthcare"},
    {"name": "GoodRx",          "ats": "greenhouse", "slug": "goodrx",         "category": "healthcare"},
    {"name": "Zocdoc",          "ats": "greenhouse", "slug": "zocdoc",         "category": "healthcare"},
    {"name": "Aledade",         "ats": "greenhouse", "slug": "aledade",        "category": "healthcare"},
    {"name": "Included Health", "ats": "greenhouse", "slug": "includedhealth", "category": "healthcare"},
    {"name": "Sword Health",    "ats": "greenhouse", "slug": "swordhealth",    "category": "healthcare"},
    {"name": "Komodo Health",   "ats": "greenhouse", "slug": "komodohealth",   "category": "healthcare"},
    {"name": "Verily",          "ats": "greenhouse", "slug": "verily",         "category": "healthcare"},

    # Consulting & Professional Services
    {"name": "Slalom",       "ats": "greenhouse", "slug": "slalom",       "category": "consulting"},
    {"name": "Thoughtworks", "ats": "greenhouse", "slug": "thoughtworks", "category": "consulting"},
    {"name": "Forrester",    "ats": "greenhouse", "slug": "forrester",    "category": "consulting"},
    {"name": "West Monroe",  "ats": "greenhouse", "slug": "westmonroe",   "category": "consulting"},
    {"name": "Point72",      "ats": "greenhouse", "slug": "point72",      "category": "consulting"},

    # E-commerce & Retail
    {"name": "Shopify",      "ats": "greenhouse", "slug": "shopify",     "category": "retail"},
    {"name": "Instacart",    "ats": "greenhouse", "slug": "instacart",   "category": "retail"},
    {"name": "DoorDash",     "ats": "greenhouse", "slug": "doordash",    "category": "retail"},
    {"name": "Uber",         "ats": "greenhouse", "slug": "uber",        "category": "retail"},
    {"name": "Lyft",         "ats": "greenhouse", "slug": "lyft",        "category": "retail"},
    {"name": "Airbnb",       "ats": "greenhouse", "slug": "airbnb",      "category": "retail"},
    {"name": "Etsy",         "ats": "greenhouse", "slug": "etsy",        "category": "retail"},
    {"name": "Wayfair",      "ats": "greenhouse", "slug": "wayfair",     "category": "retail"},
    {"name": "Chewy",        "ats": "greenhouse", "slug": "chewy",       "category": "retail"},
    {"name": "Stitch Fix",   "ats": "greenhouse", "slug": "stitchfix",   "category": "retail"},
    {"name": "ThredUp",      "ats": "greenhouse", "slug": "thredup",     "category": "retail"},
    {"name": "Faire",        "ats": "greenhouse", "slug": "faire",       "category": "retail"},
    {"name": "Flexport",     "ats": "greenhouse", "slug": "flexport",    "category": "retail"},
    {"name": "Bolt",         "ats": "greenhouse", "slug": "bolt",        "category": "retail"},
    {"name": "Fanatics",     "ats": "greenhouse", "slug": "fanatics",    "category": "retail"},
    {"name": "Warby Parker", "ats": "greenhouse", "slug": "warbyparker", "category": "retail"},
    {"name": "Peloton",      "ats": "greenhouse", "slug": "peloton",     "category": "retail"},
    {"name": "Gopuff",       "ats": "greenhouse", "slug": "gopuff",      "category": "retail"},

    # Media & Entertainment
    {"name": "Spotify",            "ats": "lever",      "slug": "spotify",         "category": "media"},
    {"name": "Roblox",             "ats": "greenhouse", "slug": "roblox",          "category": "media"},
    {"name": "Unity",              "ats": "greenhouse", "slug": "unity3d",         "category": "media"},
    {"name": "Epic Games",         "ats": "greenhouse", "slug": "epicgames",       "category": "media"},
    {"name": "Riot Games",         "ats": "greenhouse", "slug": "riotgames",       "category": "media"},
    {"name": "Reddit",             "ats": "greenhouse", "slug": "reddit",          "category": "media"},
    {"name": "Pinterest",          "ats": "greenhouse", "slug": "pinterest",       "category": "media"},
    {"name": "Snap",               "ats": "greenhouse", "slug": "snap",            "category": "media"},
    {"name": "Discord",            "ats": "greenhouse", "slug": "discord",         "category": "media"},
    {"name": "Twitch",             "ats": "greenhouse", "slug": "twitch",          "category": "media"},
    {"name": "The New York Times", "ats": "greenhouse", "slug": "thenewyorktimes", "category": "media"},
    {"name": "Bloomberg",          "ats": "greenhouse", "slug": "bloomberg",       "category": "media"},
    {"name": "Vox Media",          "ats": "greenhouse", "slug": "voxmedia",        "category": "media"},
    {"name": "Substack",           "ats": "ashby",      "slug": "substack",        "category": "media"},
    {"name": "Audible",            "ats": "greenhouse", "slug": "audible",         "category": "media"},

    # Enterprise SaaS
    {"name": "Snowflake",    "ats": "ashby",      "slug": "snowflake",    "category": "enterprise_saas"},
    {"name": "Confluent",    "ats": "ashby",      "slug": "confluent",    "category": "enterprise_saas"},
    {"name": "MongoDB",      "ats": "greenhouse", "slug": "mongodb",      "category": "enterprise_saas"},
    {"name": "Elastic",      "ats": "greenhouse", "slug": "elastic",      "category": "enterprise_saas"},
    {"name": "HashiCorp",    "ats": "greenhouse", "slug": "hashicorp",    "category": "enterprise_saas"},
    {"name": "Cloudflare",   "ats": "greenhouse", "slug": "cloudflare",   "category": "enterprise_saas"},
    {"name": "Twilio",       "ats": "greenhouse", "slug": "twilio",       "category": "enterprise_saas"},
    {"name": "Okta",         "ats": "greenhouse", "slug": "okta",         "category": "enterprise_saas"},
    {"name": "CrowdStrike",  "ats": "greenhouse", "slug": "crowdstrike",  "category": "enterprise_saas"},
    {"name": "Zscaler",      "ats": "greenhouse", "slug": "zscaler",      "category": "enterprise_saas"},
    {"name": "New Relic",    "ats": "greenhouse", "slug": "newrelic",     "category": "enterprise_saas"},
    {"name": "PagerDuty",    "ats": "greenhouse", "slug": "pagerduty",    "category": "enterprise_saas"},
    {"name": "Atlassian",    "ats": "greenhouse", "slug": "atlassian",    "category": "enterprise_saas"},
    {"name": "Asana",        "ats": "greenhouse", "slug": "asana",        "category": "enterprise_saas"},
    {"name": "monday.com",   "ats": "greenhouse", "slug": "mondaycom",    "category": "enterprise_saas"},
    {"name": "Airtable",     "ats": "greenhouse", "slug": "airtable",     "category": "enterprise_saas"},
    {"name": "Canva",        "ats": "greenhouse", "slug": "canva",        "category": "enterprise_saas"},
    {"name": "Miro",         "ats": "greenhouse", "slug": "miro",         "category": "enterprise_saas"},
    {"name": "Linear",       "ats": "ashby",      "slug": "linear",       "category": "enterprise_saas"},
    {"name": "1Password",    "ats": "greenhouse", "slug": "1password",    "category": "enterprise_saas"},
    {"name": "GitLab",       "ats": "greenhouse", "slug": "gitlab",       "category": "enterprise_saas"},
    {"name": "JFrog",        "ats": "greenhouse", "slug": "jfrog",        "category": "enterprise_saas"},
    {"name": "LaunchDarkly", "ats": "greenhouse", "slug": "launchdarkly", "category": "enterprise_saas"},
    {"name": "Postman",      "ats": "greenhouse", "slug": "postman",      "category": "enterprise_saas"},
    {"name": "Kong",         "ats": "greenhouse", "slug": "kong",         "category": "enterprise_saas"},
    {"name": "Grafana Labs", "ats": "greenhouse", "slug": "grafanalabs",  "category": "enterprise_saas"},

    # Education
    {"name": "Coursera",     "ats": "greenhouse", "slug": "coursera",    "category": "education"},
    {"name": "Duolingo",     "ats": "greenhouse", "slug": "duolingo",    "category": "education"},
    {"name": "Khan Academy", "ats": "greenhouse", "slug": "khanacademy", "category": "education"},
    {"name": "Chegg",        "ats": "greenhouse", "slug": "chegg",       "category": "education"},
    {"name": "Instructure",  "ats": "greenhouse", "slug": "instructure", "category": "education"},
    {"name": "2U",           "ats": "greenhouse", "slug": "2u",          "category": "education"},
    {"name": "Skillsoft",    "ats": "greenhouse", "slug": "skillsoft",   "category": "education"},
    {"name": "Brainly",      "ats": "greenhouse", "slug": "brainly",     "category": "education"},
    {"name": "Handshake",    "ats": "greenhouse", "slug": "handshake",   "category": "education"},
    {"name": "ClassDojo",    "ats": "greenhouse", "slug": "classdojo",   "category": "education"},
    {"name": "Quizlet",      "ats": "greenhouse", "slug": "quizlet",     "category": "education"},
    {"name": "Outschool",    "ats": "greenhouse", "slug": "outschool",   "category": "education"},

    # Government & Defense
    {"name": "Shield AI",            "ats": "greenhouse", "slug": "shieldai",           "category": "govdef"},
    {"name": "SpaceX",               "ats": "greenhouse", "slug": "spacex",             "category": "govdef"},
    {"name": "Maxar",                "ats": "greenhouse", "slug": "maxar",              "category": "govdef"},
    {"name": "Rebellion Defense",    "ats": "greenhouse", "slug": "rebelliondefense",   "category": "govdef"},
    {"name": "Govini",               "ats": "greenhouse", "slug": "govini",             "category": "govdef"},
    {"name": "Primer AI",            "ats": "greenhouse", "slug": "primer",             "category": "govdef"},
    {"name": "Second Front Systems", "ats": "greenhouse", "slug": "secondfrontsystems", "category": "govdef"},
    {"name": "Vannevar Labs",        "ats": "greenhouse", "slug": "vannevarlabs",       "category": "govdef"},

    # Climate & Energy
    {"name": "Rivian",            "ats": "greenhouse", "slug": "rivian",           "category": "climate"},
    {"name": "Lucid Motors",      "ats": "greenhouse", "slug": "lucidmotors",      "category": "climate"},
    {"name": "ChargePoint",       "ats": "greenhouse", "slug": "chargepoint",      "category": "climate"},
    {"name": "Bloom Energy",      "ats": "greenhouse", "slug": "bloomenergy",      "category": "climate"},
    {"name": "Enphase Energy",    "ats": "greenhouse", "slug": "enphaseenergy",    "category": "climate"},
    {"name": "Arcadia",           "ats": "greenhouse", "slug": "arcadia",          "category": "climate"},
    {"name": "Span.IO",           "ats": "greenhouse", "slug": "span",             "category": "climate"},
    {"name": "Watershed",         "ats": "greenhouse", "slug": "watershed",        "category": "climate"},
    {"name": "Pachama",           "ats": "greenhouse", "slug": "pachama",          "category": "climate"},
    {"name": "Redwood Materials", "ats": "greenhouse", "slug": "redwoodmaterials", "category": "climate"},
    {"name": "Form Energy",       "ats": "greenhouse", "slug": "formenergy",       "category": "climate"},
    {"name": "QuantumScape",      "ats": "greenhouse", "slug": "quantumscape",     "category": "climate"},
]

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

TITLE_KEYWORDS = [
    "ai", "ml", "machine learning", "data scientist", "data science",
    "engineer", "architect", "director", "vp ", "vice president",
    "head of", "product manager", "program manager", "solutions",
    "data engineer", "platform engineer", "staff", "principal",
    "analytics", "research scientist", "llm", "nlp",
]

EXCLUDE_KEYWORDS = ["intern", "internship", "co-op", "coop", "apprentice"]

REMOTE_KEYWORDS = ["remote", "anywhere", "distributed", "us-based", "united states"]

SKILL_KEYWORDS = [
    "python", "typescript", "react", "machine learning", "ml", "ai",
    "llm", "infrastructure", "healthcare", "hipaa", "fintech",
    "multi-agent", "orchestration", "postgresql", "postgres",
    "data engineering", "data platform", "spark", "kafka", "kubernetes",
    "distributed systems", "real-time", "streaming", "etl", "dbt",
    "trading", "quantitative", "financial", "api", "microservices",
]

REQUEST_TIMEOUT = 15
RATE_LIMIT_SLEEP = 1.0

CATEGORY_LABELS = {
    "big_tech":   "FAANG / Big Tech",
    "fintech":    "Major Fintech",
    "ai_tech":    "Growth-Stage AI & Tech",
    "healthtech": "HealthTech / Health-Fintech",
    "quant":      "Trading / Quantitative",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get(url: str, params: dict = None) -> Optional[dict]:
    try:
        resp = requests.get(url, params=params, timeout=REQUEST_TIMEOUT,
                            headers={"User-Agent": "AriesLabs-JobScraper/1.0"})
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        return None


class FetchError(Exception):
    """Raised by ATS-API fetchers when the upstream call fails distinguishably
    (HTTP 4xx/5xx, network error, malformed JSON). The empty-list case is NOT
    a FetchError — that's a legitimate "no jobs match" response. This split
    lets `scrape_company` surface broken slugs in `stats["errors"]` instead of
    swallowing them as silent empties."""


def _get_with_status(url: str, params: dict = None) -> tuple[Optional[dict], Optional[str]]:
    """Like `_get`, but returns (data, error_msg). Used by ATS fetchers that
    need to tell `404` apart from `200 []`."""
    try:
        resp = requests.get(url, params=params, timeout=REQUEST_TIMEOUT,
                            headers={"User-Agent": "AriesLabs-JobScraper/1.0"})
        if resp.status_code != 200:
            return None, f"HTTP {resp.status_code}"
        return resp.json(), None
    except requests.exceptions.Timeout:
        return None, "timeout"
    except requests.exceptions.RequestException as exc:
        return None, f"network: {type(exc).__name__}"
    except ValueError as exc:  # JSON decode
        return None, f"invalid JSON: {exc}"


def _post(url: str, payload: dict) -> Optional[dict]:
    try:
        resp = requests.post(url, json=payload, timeout=REQUEST_TIMEOUT,
                             headers={"User-Agent": "AriesLabs-JobScraper/1.0",
                                      "Content-Type": "application/json"})
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        return None


def _normalize_location(loc: str) -> str:
    return (loc or "").strip()


def _is_remote(location: str) -> bool:
    loc = location.lower()
    return any(kw in loc for kw in REMOTE_KEYWORDS)


def _to_iso_z(value) -> Optional[str]:
    """Coerce ATS posted-date fields into a normalized ISO-8601 UTC string.

    Accepts:
      - epoch milliseconds (Lever returns this for `createdAt`)
      - ISO-8601 strings with or without trailing Z (Greenhouse `updated_at`,
        Ashby `publishedAt`, etc.) — re-emitted with `Z` for consistency.
    Returns None for anything we can't confidently parse so we don't
    pollute the column with garbage that breaks freshness math downstream.
    """
    if value is None or value == "":
        return None
    try:
        if isinstance(value, (int, float)):
            ts = float(value)
            if ts > 1e12:  # milliseconds
                ts = ts / 1000.0
            return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat().replace("+00:00", "Z")
        if isinstance(value, str):
            s = value.strip()
            if not s:
                return None
            # Numeric string?
            if s.isdigit():
                return _to_iso_z(int(s))
            # Already ISO-ish — let fromisoformat handle the common shapes,
            # then re-emit with `Z`.
            normalized = s.replace("Z", "+00:00")
            try:
                dt = datetime.fromisoformat(normalized)
            except ValueError:
                return None
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except (ValueError, TypeError, OverflowError):
        return None
    return None


def _passes_title_filter(title: str, extra_keywords: list[str] = None) -> bool:
    t = title.lower()
    if any(ex in t for ex in EXCLUDE_KEYWORDS):
        return False
    keywords = TITLE_KEYWORDS + (extra_keywords or [])
    return any(kw in t for kw in keywords)


def _relevance_score(title: str, description: str = "") -> int:
    text = (title + " " + description).lower()
    hits = sum(1 for kw in SKILL_KEYWORDS if kw in text)
    return min(100, round((hits / len(SKILL_KEYWORDS)) * 100))


# ---------------------------------------------------------------------------
# Compensation extraction (Greenhouse / Lever)
# ---------------------------------------------------------------------------

# Match "$60,000 - $120,000", "$60K – $120K", "$1.2M to $1.5M", optionally
# followed by "/year" or "annually". K/M/B suffixes get expanded; bare commas
# in values like 60,000 get stripped before parsing. The pattern is anchored
# on the dollar sign and a separator so we don't snag standalone numbers
# (e.g. "raised $50M Series B" doesn't satisfy the requirement of two amounts).
_SALARY_RANGE_RE = re.compile(
    r"\$\s*"                                 # leading $
    r"(?P<lo>\d{1,3}(?:[,\.]\d{3})*(?:\.\d+)?\s*[KkMmBb]?)"
    r"\s*(?:[\-–—]|to)\s*"                   # separator
    r"\$?\s*"                                # optional second $
    r"(?P<hi>\d{1,3}(?:[,\.]\d{3})*(?:\.\d+)?\s*[KkMmBb]?)"
    r"\s*(?:USD)?"
    r"\s*(?:per\s+year|/\s*(?:year|yr)|annual(?:ly)?)?",
    re.IGNORECASE,
)


def _parse_money_token(tok: str) -> Optional[int]:
    """Parse '$60,000' / '$60K' / '$1.2M' / '$200' → integer dollars."""
    if not tok:
        return None
    s = tok.strip().replace(",", "").upper()
    mult = 1
    if s.endswith("K"):
        mult = 1_000
        s = s[:-1].strip()
    elif s.endswith("M"):
        mult = 1_000_000
        s = s[:-1].strip()
    elif s.endswith("B"):
        mult = 1_000_000_000
        s = s[:-1].strip()
    try:
        return int(round(float(s) * mult))
    except (ValueError, TypeError):
        return None


# Phrases that strongly anchor a range to BASE COMPENSATION rather than
# total comp / signing bonus / fundraising amounts. Lever postings often
# include "sign-on bonus" + "Series B raised $X" right next to the salary,
# so we score nearby phrasing to avoid grabbing the wrong number.
_SALARY_CONTEXT_KEYWORDS = (
    "salary", "base salary", "annual salary", "base pay", "compensation",
    "pay range", "salary range", "base compensation",
)


def _extract_salary_from_text(text: str) -> dict:
    """Best-effort extraction of an annual base salary range from free text.

    Used by Greenhouse (HTML body) and Lever (`additionalPlain`) where comp
    isn't a structured field. Returns an empty dict when no confident match
    is found — callers should treat absence as "employer didn't disclose"
    rather than zero. Currency is assumed USD when only `$` is present;
    rejects ranges that resolve to obviously-wrong numbers (e.g. revenue
    multipliers, equity grants without a salary anchor).
    """
    if not text:
        return {}

    # Drop HTML-ish junk so the regex sees clean content. We don't care about
    # full HTML correctness — just enough that "<p>$60,000-$120,000</p>" isn't
    # broken across noise.
    cleaned = re.sub(r"<[^>]+>", " ", text)
    cleaned = re.sub(r"&[a-z]+;|&#\d+;", " ", cleaned, flags=re.IGNORECASE)

    best: Optional[dict] = None
    for m in _SALARY_RANGE_RE.finditer(cleaned):
        lo = _parse_money_token(m.group("lo"))
        hi = _parse_money_token(m.group("hi"))
        if lo is None or hi is None:
            continue
        if hi < lo:
            lo, hi = hi, lo
        # Sanity gates: real annual base salaries today land in [$30k, $2M].
        # Outside that window we're almost certainly looking at fundraising,
        # revenue, or equity-grant numbers in the same description.
        if lo < 30_000 or hi > 2_000_000:
            continue
        # Reject ranges that span > 5x — those are almost always two unrelated
        # figures glued together by the regex (e.g. "$50K – $5M" from a job
        # post that mentions both salary and a fundraising round).
        if hi > lo * 5:
            continue

        # Score the context window around the match. A nearby "salary" /
        # "base pay" anchor wins; otherwise we still take the first range
        # we see but flag it as low-confidence.
        window_start = max(0, m.start() - 180)
        window = cleaned[window_start:m.end() + 60].lower()
        anchored = any(kw in window for kw in _SALARY_CONTEXT_KEYWORDS)

        candidate = {
            "salary_min": lo,
            "salary_max": hi,
            "salary_currency": "USD",
            "_anchored": anchored,
        }

        if anchored:
            # An anchored hit beats anything else; take the FIRST one and bail.
            best = candidate
            break
        if best is None:
            best = candidate

    if not best:
        return {}
    best.pop("_anchored", None)
    return best


# Map Lever's lowercased workplaceType to the title-cased convention Ashby
# uses, so the column has consistent values across ATSes.
_LEVER_WORKPLACE_MAP = {
    "remote": "Remote",
    "hybrid": "Hybrid",
    "onsite": "OnSite",
    "on-site": "OnSite",
    "in-office": "OnSite",
}

# Map Lever's `categories.commitment` to Ashby's employmentType vocabulary.
_LEVER_COMMITMENT_MAP = {
    "full-time": "FullTime",
    "fulltime": "FullTime",
    "part-time": "PartTime",
    "parttime": "PartTime",
    "internship": "Intern",
    "intern": "Intern",
    "contract": "Contract",
    "contractor": "Contract",
    "fixed-term": "Contract",
    "temporary": "Temporary",
    "temp": "Temporary",
}


# ---------------------------------------------------------------------------
# ATS Fetchers
# ---------------------------------------------------------------------------

def fetch_greenhouse(slug: str, company_name: str) -> list[dict]:
    url = f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"
    data, err = _get_with_status(url, params={"content": "true"})
    if err:
        raise FetchError(f"greenhouse/{slug}: {err}")
    if not data or "jobs" not in data:
        return []

    jobs = []
    for j in data["jobs"]:
        title = j.get("title", "")
        location = _normalize_location(
            j.get("location", {}).get("name", "") if isinstance(j.get("location"), dict)
            else j.get("location", "")
        )
        dept = ""
        depts = j.get("departments", [])
        if depts:
            dept = depts[0].get("name", "")
        description = j.get("content", "") or ""
        # Greenhouse exposes `updated_at` (ISO-8601). It's not strictly the
        # original creation date, but it's the closest signal they give and
        # tracks employer-side staleness well.
        posted_at = _to_iso_z(j.get("updated_at") or j.get("first_published"))
        # Greenhouse's public board API doesn't return structured comp; pay
        # transparency law disclosures live inline in the description body.
        # Hit rate is low (~1% on Stripe) but free.
        salary = _extract_salary_from_text(description)
        jobs.append({
            "title": title,
            "location": location,
            "url": j.get("absolute_url", ""),
            "department": dept,
            "remote": _is_remote(location),
            "description_snippet": description[:500],
            # Greenhouse returns the full posting in `content` — keep all of it
            # so the cloud preprocessor can extract comp ranges, YoE, and the
            # complete responsibilities list (truncating to 500 chars dropped
            # those for ~99% of jobs in Phase 0).
            "description_full": description,
            "posted_at": posted_at,
            "salary_min": salary.get("salary_min"),
            "salary_max": salary.get("salary_max"),
            "salary_currency": salary.get("salary_currency"),
            "company": company_name,
        })
    return jobs


def fetch_lever(slug: str, company_name: str) -> list[dict]:
    url = f"https://api.lever.co/v0/postings/{slug}"
    data, err = _get_with_status(url, params={"limit": 500})
    if err:
        raise FetchError(f"lever/{slug}: {err}")
    if not isinstance(data, list):
        return []

    jobs = []
    for j in data:
        title = j.get("text", "")
        cats = j.get("categories", {})
        location = _normalize_location(cats.get("location", "") or cats.get("allLocations", ""))
        dept = cats.get("team", "") or cats.get("department", "")
        full_description = j.get("descriptionPlain", "") or j.get("description", "") or ""
        # Lever returns `createdAt` as epoch milliseconds.
        posted_at = _to_iso_z(j.get("createdAt"))

        # Lever returns workplaceType as lowercased; commitment as the
        # employer-typed string ("Full-time", "Internship", "Fixed-Term",
        # …). Normalize both to Ashby's vocabulary so the column is
        # consistent across ATSes; unknown values pass through unchanged
        # rather than getting silently dropped.
        wt = (j.get("workplaceType") or "").lower().strip()
        workplace_type = _LEVER_WORKPLACE_MAP.get(wt)
        commitment = (cats.get("commitment") or "").lower().strip()
        employment_type = _LEVER_COMMITMENT_MAP.get(commitment)

        # Lever stores comp + benefits in `additionalPlain` (formatted plain
        # text, very predictable phrasing). Hit rate ~70% on US-disclosing
        # employers like Palantir; 0% on EU-only boards.
        comp_text = j.get("additionalPlain") or full_description
        salary = _extract_salary_from_text(comp_text)

        jobs.append({
            "title": title,
            "location": location,
            "url": j.get("applyUrl", j.get("hostedUrl", "")),
            "department": dept,
            "remote": _is_remote(location) or workplace_type == "Remote",
            "workplace_type": workplace_type,
            "employment_type": employment_type,
            "description_snippet": full_description[:500],
            # Lever returns the full posting in `descriptionPlain` (or HTML in
            # `description`) — preserve it for cloud preprocessing so we can
            # extract comp / YoE / required experience that lives further in.
            "description_full": full_description,
            "posted_at": posted_at,
            "salary_min": salary.get("salary_min"),
            "salary_max": salary.get("salary_max"),
            "salary_currency": salary.get("salary_currency"),
            "company": company_name,
        })
    return jobs


def _ashby_extract_salary(compensation: dict) -> dict:
    """Pull a single Salary range + currency out of an Ashby compensation block.

    Ashby exposes geographic compensation tiers (e.g. "NY/SF" vs "Nationwide")
    plus a `summaryComponents` array that collapses them into one range per
    component type. Reading the Salary entry from `summaryComponents` gives us
    the union min/max without re-implementing the merge.

    `compensationTierSummary` is the human-readable string Ashby builds for
    its own posting page (e.g. "$211.4K – $290.6K • Offers Equity"); we keep
    it verbatim so the UI can render whatever the employer chose to publish.
    """
    out: dict = {
        "salary_min": None,
        "salary_max": None,
        "salary_currency": None,
        "comp_summary": None,
    }
    if not isinstance(compensation, dict):
        return out

    summary = compensation.get("compensationTierSummary")
    if isinstance(summary, str) and summary.strip():
        out["comp_summary"] = summary.strip()

    for comp in compensation.get("summaryComponents") or []:
        if not isinstance(comp, dict):
            continue
        if comp.get("compensationType") != "Salary":
            continue
        # `1 YEAR` is overwhelmingly the only interval used for Salary in the
        # public API; we don't normalize hourly/monthly bands today. If we see
        # something other than YEAR, skip rather than store a misleading number.
        if comp.get("interval") not in (None, "1 YEAR"):
            continue
        min_v = comp.get("minValue")
        max_v = comp.get("maxValue")
        if isinstance(min_v, (int, float)):
            out["salary_min"] = int(min_v)
        if isinstance(max_v, (int, float)):
            out["salary_max"] = int(max_v)
        cur = comp.get("currencyCode")
        if isinstance(cur, str) and cur.strip():
            out["salary_currency"] = cur.strip()
        break  # one Salary entry expected per posting

    return out


def fetch_ashby(slug: str, company_name: str) -> list[dict]:
    # `includeCompensation=true` is required to get compensationTiers /
    # summaryComponents — without it the `compensation` field is omitted
    # entirely. Free for the caller; employers control disclosure per posting.
    url = f"https://api.ashbyhq.com/posting-api/job-board/{slug}"
    data, primary_err = _get_with_status(url, params={"includeCompensation": "true"})
    if not data:
        # Fallback: try GraphQL endpoint
        gql_url = "https://jobs.ashbyhq.com/api/non-user-graphql"
        query = """
        query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) {
          jobBoard: jobBoardWithTeams(
            organizationHostedJobsPageName: $organizationHostedJobsPageName
          ) {
            jobPostings { id title locationName isRemote teamName applyLink }
          }
        }
        """
        payload = {
            "operationName": "ApiJobBoardWithTeams",
            "variables": {"organizationHostedJobsPageName": slug},
            "query": query,
        }
        gql_data = _post(gql_url, payload)
        if not gql_data:
            # Both REST and GraphQL paths failed — surface the primary REST
            # error so the operator can tell "Ashby returned 404" from "the
            # board legitimately has no postings".
            raise FetchError(f"ashby/{slug}: {primary_err or 'graphql empty'}")
        postings = (gql_data.get("data", {})
                            .get("jobBoard", {})
                            .get("jobPostings", []))
        jobs = []
        for j in postings:
            location = j.get("locationName", "")
            if j.get("isRemote"):
                location = location or "Remote"
            jobs.append({
                "title": j.get("title", ""),
                "location": _normalize_location(location),
                "url": j.get("applyLink", f"https://jobs.ashbyhq.com/{slug}"),
                "department": j.get("teamName", ""),
                "remote": j.get("isRemote", False) or _is_remote(location),
                "description_snippet": "",
                "company": company_name,
            })
        return jobs

    # Primary Ashby API response
    postings = data.get("jobs", data.get("jobPostings", []))
    jobs = []
    for j in postings:
        # Skip postings the employer has chosen to hide from their public board.
        # Ashby returns `isListed=false` for unpublished/hidden roles even
        # when the API key isn't required — respect that signal.
        if j.get("isListed") is False:
            continue

        location = j.get("location", j.get("locationName", ""))
        is_remote = j.get("isRemote", False)
        if is_remote:
            location = location or "Remote"
        # Ashby uses `publishedAt` on the posting-api endpoint and
        # `publishedDate` on the GraphQL one. Try both.
        posted_at = _to_iso_z(j.get("publishedAt") or j.get("publishedDate") or j.get("updatedAt"))

        # `descriptionPlain` is what fed the AI scorer was missing for Ashby
        # boards — without it `description_snippet` was empty and the LLM
        # was scoring on title + location alone. Greenhouse / Lever already
        # send plain text in this slot, so do the same here for parity.
        description_plain = j.get("descriptionPlain") or ""
        # Ashby posts `workplaceType` (OnSite / Remote / Hybrid) which is
        # finer than the `isRemote` boolean — keep both so existing remote
        # filtering still works while UI/scoring can opt into the trichotomy.
        workplace_type = j.get("workplaceType")
        # `team` is distinct from `department` — e.g. department="R&D",
        # team="Engineering". Fall back through whichever the employer fills.
        department = j.get("department") or j.get("teamName") or ""
        team = j.get("team") or ""

        salary = _ashby_extract_salary(j.get("compensation") or {})

        jobs.append({
            "title": j.get("title", ""),
            "location": _normalize_location(location),
            "url": j.get("applyLink", j.get("jobUrl", f"https://jobs.ashbyhq.com/{slug}")),
            "department": department,
            "team": team,
            "remote": is_remote or _is_remote(location),
            "workplace_type": workplace_type,
            "employment_type": j.get("employmentType"),
            "description_snippet": description_plain[:500],
            "description_full": description_plain,
            "posted_at": posted_at,
            "salary_min": salary["salary_min"],
            "salary_max": salary["salary_max"],
            "salary_currency": salary["salary_currency"],
            "comp_summary": salary["comp_summary"],
            "company": company_name,
        })
    return jobs


# Workday CXS pagination. The endpoint caps `limit` at 20 — anything higher
# returns 400 — so we paginate. 15 × 20 = 300 jobs/tenant: the title filter
# prunes ~95% of those, and roles are returned newest-first so further pages
# get rapidly diminishing returns. Half-second sleep between pages is courtesy.
_WORKDAY_PAGE_SIZE = 20
_WORKDAY_MAX_PAGES = 15
_WORKDAY_PAGE_SLEEP = 0.5


def _workday_cxs_url(company: dict) -> Optional[str]:
    """Resolve a tenant's CXS jobs endpoint from registry config.

    Preferred shape:
        workday: { tenant: "nvidia", host: "wd5", site: "NVIDIAExternalCareerSite" }

    Backwards-compatible shape (legacy):
        workday_url: "https://nvidia.wd5.myworkdayjobs.com/.../<site>/jobs"
        — we parse it to find tenant/host/site.
    """
    cfg = company.get("workday")
    if isinstance(cfg, dict):
        tenant = cfg.get("tenant")
        host = cfg.get("host", "wd5")
        site = cfg.get("site")
        if tenant and site:
            return f"https://{tenant}.{host}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs"

    legacy = company.get("workday_url", "")
    if legacy:
        # e.g. https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/jobs
        try:
            host_part = legacy.split("//", 1)[1].split("/", 1)[0]  # nvidia.wd5.myworkdayjobs.com
            tenant, host, *_ = host_part.split(".")
            path = legacy.split("myworkdayjobs.com", 1)[1].rstrip("/")
            segments = [s for s in path.split("/") if s and s != "jobs"]
            site = next((s for s in reversed(segments) if not s.startswith("en-")), None)
            if tenant and site:
                return f"https://{tenant}.{host}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs"
        except (IndexError, ValueError):
            pass
    return None


def _parse_workday_posted_on(value: str) -> Optional[str]:
    """Convert Workday's relative `postedOn` strings to a UTC ISO date.

    Examples:
        "Posted Today"          → today
        "Posted Yesterday"      → yesterday
        "Posted 7 Days Ago"     → today - 7d
        "Posted 30+ Days Ago"   → today - 30d  (floor; the value is "at least N")

    Resolution is intentionally one-day — Workday doesn't share the actual
    timestamp on these tenants. Returning None when we can't parse keeps
    `posted_at` honest rather than polluted with garbage.
    """
    if not value:
        return None
    s = value.strip().lower().removeprefix("posted ").strip()
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    if s in ("today", "just posted"):
        return today.isoformat().replace("+00:00", "Z")
    if s == "yesterday":
        return (today - timedelta(days=1)).isoformat().replace("+00:00", "Z")
    # "7 Days Ago" / "30+ Days Ago" — extract the leading integer
    digits = ""
    for ch in s:
        if ch.isdigit():
            digits += ch
        elif digits:
            break
    if digits:
        try:
            n = int(digits)
            if 0 <= n <= 365:
                return (today - timedelta(days=n)).isoformat().replace("+00:00", "Z")
        except ValueError:
            pass
    return None


def _fetch_workday_job_detail(api_root: str, external_path: str) -> Optional[dict]:
    """Best-effort fetch of the full job posting body. Workday exposes
    `/wday/cxs/{tenant}/{site}/job/{path}` for individual postings, returning
    `jobPostingInfo.jobDescription` (HTML). Failure is non-fatal; the listing
    row itself is enough for the feed."""
    try:
        # api_root is …/wday/cxs/{tenant}/{site}/jobs ; strip trailing /jobs.
        detail_url = api_root.rsplit("/", 1)[0] + "/job" + external_path
        return _get(detail_url)
    except Exception:
        return None


# Workday's edge (Akamai) rejects requests from cloud IP ranges with our
# custom UA. A real browser UA + a minimal Origin header pass through.
_WORKDAY_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Content-Type": "application/json",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
}


def _workday_paginate(
    api_url: str,
    search_text: str,
    company_name: str,
    legacy_url: str,
    seen_paths: set[str],
    max_pages: int = _WORKDAY_MAX_PAGES,
) -> list[dict]:
    """One pass through a Workday CXS endpoint with the given searchText.

    Skips postings whose `externalPath` is already in `seen_paths` (the
    caller's dedupe set). Returns IngestJob-shaped dicts and mutates
    `seen_paths` in place so subsequent passes don't re-emit the same
    role under a different query."""
    site_root = api_url.split("/wday/cxs/")[0]
    out: list[dict] = []
    advertised_total = 0

    # Per-tenant Origin/Referer lets the Akamai edge classify the request as
    # coming from the careers site itself rather than a generic bot.
    request_headers = {
        **_WORKDAY_HEADERS,
        "Origin": site_root,
        "Referer": f"{site_root}/",
    }

    for page in range(max_pages):
        offset = page * _WORKDAY_PAGE_SIZE
        try:
            resp = requests.post(
                api_url,
                json={
                    "appliedFacets": {},
                    "limit": _WORKDAY_PAGE_SIZE,
                    "offset": offset,
                    "searchText": search_text,
                },
                headers=request_headers,
                timeout=REQUEST_TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            # Surface in run logs so we can diagnose blocks/rate-limits without
            # having to guess. Only on first-page failures — subsequent failures
            # mean we already drained successfully and hit a tail edge case.
            if page == 0:
                status = getattr(getattr(exc, "response", None), "status_code", "?")
                print(
                    f"[workday] {company_name} pass={search_text!r} "
                    f"page={page} status={status} err={type(exc).__name__}: {exc}",
                    file=sys.stderr,
                )
            break

        postings = data.get("jobPostings") or []
        if not postings:
            break

        for j in postings:
            external_path = j.get("externalPath", "")
            if external_path and external_path in seen_paths:
                continue
            seen_paths.add(external_path)
            location = j.get("locationsText", "") or ""
            posted_at = _parse_workday_posted_on(j.get("postedOn", ""))
            # When we found this role via the remote-tagged search, trust
            # remote=True even if the location string doesn't contain a
            # keyword Workday's index thought was a remote match.
            is_remote = _is_remote(location) or bool(search_text)
            out.append({
                "title": j.get("title", ""),
                "location": _normalize_location(location),
                "url": f"{site_root}{external_path}" if external_path else legacy_url,
                "department": "",  # Workday doesn't expose this on the listing
                "remote": is_remote,
                "description_snippet": "",  # filled by Workers AI preprocess
                "description_full": "",
                "posted_at": posted_at,
                "company": company_name,
            })

        if page == 0:
            advertised_total = data.get("total") or 0
        if advertised_total and len(out) >= advertised_total:
            break
        if len(postings) < _WORKDAY_PAGE_SIZE:
            break
        time.sleep(_WORKDAY_PAGE_SLEEP)

    return out


def fetch_workday(company: dict, company_name: str) -> list[dict]:
    """Two-pass pull from a Workday tenant via the CXS POST endpoint.

    Pass 1: `searchText="remote"` — captures WFH-friendly roles first so we
            never miss a remote job to the per-tenant pagination cap, even
            on huge tenants like CVS Health (15k+ listings).
    Pass 2: `searchText=""`   — fills any remaining capacity with the
            general newest-first listing so onsite/hybrid tech-metro roles
            (NVIDIA Santa Clara, Salesforce SF) still come through.

    Both passes share a `seen_paths` set so the same job never appears
    twice. Each pass is capped at _WORKDAY_MAX_PAGES; in practice most
    tenants have far fewer than 300 remote postings, so the second pass
    runs at full budget on tenants where it matters most."""
    api_url = _workday_cxs_url(company)
    if not api_url:
        return []

    legacy_url = company.get("workday_url") or api_url.split("/wday/cxs/")[0]
    seen_paths: set[str] = set()

    remote_jobs = _workday_paginate(api_url, "remote", company_name, legacy_url, seen_paths)
    general_jobs = _workday_paginate(api_url, "", company_name, legacy_url, seen_paths)
    return remote_jobs + general_jobs


def fetch_custom(company: dict, company_name: str) -> list[dict]:
    careers_url = company.get("careers_url", f"https://careers.{company['slug']}.com")
    return [{
        "title": f"Visit {company_name} careers directly",
        "location": "See careers page",
        "url": careers_url,
        "department": "",
        "remote": False,
        "description_snippet": f"Custom ATS — no public API. Browse openings at: {careers_url}",
        "company": company_name,
        "_custom": True,
    }]


# ---------------------------------------------------------------------------
# Core Pipeline
# ---------------------------------------------------------------------------

def scrape_company(
    company: dict, extra_keywords: list[str], remote_only: bool
) -> tuple[list[dict], int, Optional[str]]:
    """Scrape one company. Returns (filtered_jobs, raw_count, error).

    `raw_count` is what the ATS API returned before any client-side filter,
    so per-company D1 health tracking can tell "company has no jobs matching
    our filter" apart from "company's ATS endpoint is broken / empty board".

    `error` is non-None when the ATS call itself failed (HTTP 4xx/5xx,
    network, unknown ATS). A legitimate empty board returns ([], 0, None).
    """
    ats = company["ats"]
    slug = company["slug"]
    name = company["name"]

    try:
        if ats == "greenhouse":
            raw = fetch_greenhouse(slug, name)
        elif ats == "lever":
            raw = fetch_lever(slug, name)
        elif ats == "ashby":
            raw = fetch_ashby(slug, name)
        elif ats == "workday":
            raw = fetch_workday(company, name)
        elif ats == "custom":
            raw = fetch_custom(company, name)
        else:
            return [], 0, f"Unknown ATS type: {ats}"
    except Exception as e:
        return [], 0, str(e)

    raw_count = len(raw)
    filtered = []
    for job in raw:
        if job.get("_custom"):
            filtered.append(job)
            continue

        if remote_only and not job["remote"]:
            continue

        if not _passes_title_filter(job["title"], extra_keywords):
            continue

        job["score"] = _relevance_score(job["title"], job.get("description_snippet", ""))
        filtered.append(job)

    return filtered, raw_count, None


def run_scraper(
    categories: list[str],
    extra_keywords: list[str],
    remote_only: bool,
    min_score: int,
    output_dir: str,
) -> None:
    print_banner()

    os.makedirs(output_dir, exist_ok=True)

    target_companies = [
        c for c in COMPANIES
        if (not categories or c["category"] in categories) and is_active(c)
    ]

    print(f"  Targeting {len(target_companies)} companies across "
          f"{len(set(c['category'] for c in target_companies))} categories\n")

    all_jobs: list[dict] = []
    errors: list[str] = []

    for i, company in enumerate(target_companies, 1):
        name = company["name"]
        ats  = company["ats"].upper()
        print(f"  [{i:02d}/{len(target_companies):02d}] {name:<22} ({ats})", end=" ... ", flush=True)

        jobs, _raw_count, error = scrape_company(company, extra_keywords, remote_only)

        if error:
            errors.append(f"{name}: {error}")
            print(f"ERROR: {error}")
        else:
            for j in jobs:
                j["category"] = company["category"]
            all_jobs.extend(jobs)
            label = f"{len(jobs)} jobs" if jobs else "0 jobs"
            print(label)

        if company["ats"] != "custom":
            time.sleep(RATE_LIMIT_SLEEP)

    # Apply min score filter (skip custom placeholder entries)
    scored = [j for j in all_jobs if j.get("_custom") or j.get("score", 0) >= min_score]
    scored.sort(key=lambda j: j.get("score", 0), reverse=True)

    # Save outputs
    json_path = os.path.join(output_dir, "job_results.json")
    md_path   = os.path.join(output_dir, "job_report.md")

    save_json(scored, json_path)
    save_markdown(scored, errors, md_path, remote_only, min_score)

    # Console summary
    real_jobs = [j for j in scored if not j.get("_custom")]
    print(f"\n{'='*60}")
    print(f"  Total jobs found:    {len(all_jobs)}")
    print(f"  After filters:       {len(real_jobs)}")
    print(f"  Errors:              {len(errors)}")
    print(f"  JSON output:         {json_path}")
    print(f"  Markdown report:     {md_path}")
    print(f"{'='*60}\n")

    if errors:
        print("  Failed companies:")
        for e in errors:
            print(f"    - {e}")
        print()


# ---------------------------------------------------------------------------
# Output Writers
# ---------------------------------------------------------------------------

def save_json(jobs: list[dict], path: str) -> None:
    output = {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "total": len(jobs),
        "jobs": jobs,
    }
    with open(path, "w") as f:
        json.dump(output, f, indent=2)


def save_markdown(
    jobs: list[dict],
    errors: list[str],
    path: str,
    remote_only: bool,
    min_score: int,
) -> None:
    by_category: dict[str, list[dict]] = {}
    for j in jobs:
        cat = j.get("category", "other")
        by_category.setdefault(cat, []).append(j)

    lines = [
        "# Job Search Report",
        f"\n_Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}_  ",
        f"_Remote only: {remote_only} | Min score: {min_score}_\n",
        "---\n",
    ]

    real_total = sum(1 for j in jobs if not j.get("_custom"))
    lines.append(f"**{real_total} matching positions** found across {len(by_category)} categories.\n")

    for cat_key in ["big_tech", "fintech", "ai_tech", "healthtech", "quant"]:
        cat_jobs = by_category.get(cat_key, [])
        if not cat_jobs:
            continue

        label = CATEGORY_LABELS.get(cat_key, cat_key)
        lines.append(f"\n## {label}\n")

        real = [j for j in cat_jobs if not j.get("_custom")]
        custom = [j for j in cat_jobs if j.get("_custom")]

        if real:
            lines.append("| Company | Role | Location | Score | Link |")
            lines.append("|---------|------|----------|-------|------|")
            for j in sorted(real, key=lambda x: x.get("score", 0), reverse=True):
                dept = f" · _{j['department']}_" if j.get("department") else ""
                loc = j["location"] or "—"
                score = j.get("score", 0)
                score_badge = f"`{score:3d}`"
                link = f"[Apply]({j['url']})" if j.get("url") else "—"
                lines.append(f"| {j['company']} | {j['title']}{dept} | {loc} | {score_badge} | {link} |")

        if custom:
            lines.append("\n**Custom ATS (visit directly):**\n")
            for j in custom:
                lines.append(f"- **{j['company']}** — [{j['description_snippet'].split(': ')[-1]}]({j['url']})")

    if errors:
        lines.append("\n\n---\n## Fetch Errors\n")
        for e in errors:
            lines.append(f"- {e}")

    lines.append("\n\n---\n_All positions are AI-research only. Verify details on the company's official careers page._\n")

    with open(path, "w") as f:
        f.write("\n".join(lines))


# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------

def print_banner() -> None:
    print()
    print("=" * 60)
    print("  AriesLabs Job Scraper")
    print("  Remote AI/ML/Engineering — Public ATS APIs")
    print(f"  {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print("=" * 60)
    print()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scrape remote AI/ML/engineering jobs from public ATS APIs.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--category",
        choices=list(CATEGORY_LABELS.keys()),
        help="Only scrape companies in this category.",
    )
    parser.add_argument(
        "--keyword",
        action="append",
        dest="keywords",
        default=[],
        metavar="KEYWORD",
        help="Additional title keyword filter (repeatable).",
    )
    parser.add_argument(
        "--remote-only",
        action="store_true",
        default=True,
        help="Only include remote-eligible positions (default: True).",
    )
    parser.add_argument(
        "--no-remote-filter",
        action="store_true",
        default=False,
        help="Include all positions regardless of remote status.",
    )
    parser.add_argument(
        "--min-score",
        type=int,
        default=10,
        metavar="N",
        help="Minimum relevance score 0-100 to include (default: 10).",
    )
    parser.add_argument(
        "--output-dir",
        default="/Users/arieslao/AriesLabs.ai/infrastructure/scripts/output",
        metavar="PATH",
        help="Directory for JSON and Markdown output.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()

    categories = [args.category] if args.category else []
    remote_only = args.remote_only and not args.no_remote_filter

    run_scraper(
        categories=categories,
        extra_keywords=args.keywords,
        remote_only=remote_only,
        min_score=args.min_score,
        output_dir=args.output_dir,
    )

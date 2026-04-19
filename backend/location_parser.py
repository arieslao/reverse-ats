"""
Best-effort parser for the unstructured location strings job boards return.

The jobs.location column is whatever the source ATS happened to write — values
range from clean ("San Francisco, CA, United States") to messy ("San Francisco,
CA • New York, NY • United States" or "Finland; Remote - Denmark; Stockholm,
Sweden"). We parse these strings into tokens classified as country / state /
city / remote-variant so the Feed page can offer a multi-select filter without
a schema migration.

Matching is intentionally permissive:
- US state full names AND 2-letter codes both classify as `state`
- Anything not recognized as country/state/remote falls through to `city`
- "Remote", "Remote - USA", "Remote India", etc. all classify under `remote`
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Iterable

# ---------------------------------------------------------------------------
# Reference data — kept small on purpose. We only need to recognize the most
# common values; everything else falls through to the "city" bucket and is
# still searchable via partial-match filtering.
# ---------------------------------------------------------------------------

US_STATE_NAMES = {
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
    "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
    "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine",
    "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
    "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
    "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
    "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
    "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia",
    "Washington", "West Virginia", "Wisconsin", "Wyoming",
    "District of Columbia", "Washington D.C.", "Washington DC",
}

US_STATE_CODES = {
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID",
    "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS",
    "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK",
    "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
    "WI", "WY", "DC",
}

# Map state codes to canonical full names so "CA" and "California" merge in
# the parsed output.
STATE_CODE_TO_NAME = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
    "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho",
    "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
    "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
    "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
    "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia",
    "WI": "Wisconsin", "WY": "Wyoming", "DC": "District of Columbia",
}

# Country aliases → canonical name. Add more if scraping new geographies.
COUNTRY_ALIASES = {
    "United States": "United States", "USA": "United States",
    "U.S.": "United States", "U.S.A.": "United States", "US": "United States",
    "United States of America": "United States", "America": "United States",
    "United Kingdom": "United Kingdom", "UK": "United Kingdom",
    "Great Britain": "United Kingdom",
    "Canada": "Canada", "Mexico": "Mexico",
    "India": "India", "Israel": "Israel", "Ireland": "Ireland",
    "Germany": "Germany", "France": "France", "Spain": "Spain",
    "Italy": "Italy", "Portugal": "Portugal", "Netherlands": "Netherlands",
    "Belgium": "Belgium", "Switzerland": "Switzerland", "Austria": "Austria",
    "Sweden": "Sweden", "Norway": "Norway", "Denmark": "Denmark",
    "Finland": "Finland", "Poland": "Poland", "Czech Republic": "Czech Republic",
    "Romania": "Romania", "Greece": "Greece", "Turkey": "Turkey",
    "Australia": "Australia", "New Zealand": "New Zealand",
    "Japan": "Japan", "South Korea": "South Korea", "Korea": "South Korea",
    "China": "China", "Singapore": "Singapore", "Hong Kong": "Hong Kong",
    "Taiwan": "Taiwan", "Philippines": "Philippines", "Indonesia": "Indonesia",
    "Vietnam": "Vietnam", "Thailand": "Thailand", "Malaysia": "Malaysia",
    "Brazil": "Brazil", "Argentina": "Argentina", "Chile": "Chile",
    "Colombia": "Colombia", "Peru": "Peru",
    "South Africa": "South Africa", "Egypt": "Egypt", "Nigeria": "Nigeria",
    "Kenya": "Kenya", "United Arab Emirates": "United Arab Emirates",
    "UAE": "United Arab Emirates", "Saudi Arabia": "Saudi Arabia",
}

# Splitters used to break a location string into individual tokens. Order
# doesn't matter — we use a regex with all of them.
_TOKEN_SPLIT_RE = re.compile(r"[,;|•·/]| or |\s+\|\s+|\s+•\s+")
# "Remote - California" / "Remote, USA" / "Remote within Canada" → both flag
# the remote bucket and yield the trailing geography to be re-classified.
_REMOTE_RE = re.compile(r"^\s*remote(?:\s*[-–:]\s*|\s+(?:within|in)\s+|\s*,\s*)?(.*)$", re.IGNORECASE)
_REMOTE_BARE_RE = re.compile(r"^\s*remote\s*$", re.IGNORECASE)
_REMOTE_PARENS_RE = re.compile(r"\(remote\)", re.IGNORECASE)
# "Canada - Remote", "USA - Remote", "Anywhere - Remote" → flag remote and
# keep the leading geography to be re-classified.
_GEO_REMOTE_RE = re.compile(r"^\s*(.+?)\s*[-–]\s*remote\s*(?:\(.*\))?\s*$", re.IGNORECASE)


def _classify(token: str) -> tuple[str, str]:
    """Return (bucket, canonical_value) for a single trimmed token.

    Buckets: 'country' | 'state' | 'city' | '' (skip).
    """
    t = token.strip().rstrip(".")
    if not t:
        return ("", "")

    # Country (full names + common aliases)
    canonical_country = COUNTRY_ALIASES.get(t)
    if canonical_country:
        return ("country", canonical_country)

    # US state — full name
    if t in US_STATE_NAMES:
        canonical = "Washington" if t == "Washington" else t
        return ("state", canonical)

    # US state — 2-letter code (uppercase only, to avoid catching e.g. "Or" in "Oregon or Remote")
    if t in US_STATE_CODES:
        return ("state", STATE_CODE_TO_NAME[t])

    # Anything else is a city candidate. Strip ZIP-like trailing tokens
    # ("Lomita, CA 90717" → token "CA 90717" — already broken by comma split,
    # but defensive).
    t = re.sub(r"\s+\d{4,}.*$", "", t).strip()
    if not t:
        return ("", "")

    return ("city", t)


def parse_one(location: str) -> dict[str, list[str]]:
    """Parse a single location string into bucketed tokens.

    Example:
        "San Francisco, CA, United States; Remote - California"
        → {
            'remote': True,
            'countries': ['United States'],
            'states':    ['California'],
            'cities':    ['San Francisco'],
          }
    """
    if not location:
        return {"remote": False, "countries": [], "states": [], "cities": []}

    is_remote = False
    countries: list[str] = []
    states: list[str] = []
    cities: list[str] = []

    # Strip "(Remote)" markers that appear inline e.g. "United States (Remote)"
    if _REMOTE_PARENS_RE.search(location):
        is_remote = True
        location = _REMOTE_PARENS_RE.sub("", location)

    # Strip any other parenthetical content — usually it's a list like
    # "(ON, AB, BC, or NS Only)" whose commas would otherwise wreck token
    # splitting. We'd rather lose the detail than mis-classify.
    location = re.sub(r"\([^)]*\)", "", location)

    raw_tokens = [t.strip() for t in _TOKEN_SPLIT_RE.split(location) if t and t.strip()]
    for raw in raw_tokens:
        # Bare "Remote"
        if _REMOTE_BARE_RE.match(raw):
            is_remote = True
            continue

        # "X - Remote" pattern: flag remote, classify the leading geography.
        m_geo = _GEO_REMOTE_RE.match(raw)
        if m_geo:
            is_remote = True
            head = m_geo.group(1).strip()
            if head:
                bucket, value = _classify(head)
                if bucket == "country" and value not in countries:
                    countries.append(value)
                elif bucket == "state" and value not in states:
                    states.append(value)
                elif bucket == "city" and value not in cities:
                    cities.append(value)
            continue

        # "Remote - X" / "Remote within X" / "Remote, X" → mark remote AND
        # classify the rest as a geography token.
        m = _REMOTE_RE.match(raw)
        if m:
            is_remote = True
            tail = m.group(1).strip()
            if tail:
                bucket, value = _classify(tail)
                if bucket == "country" and value not in countries:
                    countries.append(value)
                elif bucket == "state" and value not in states:
                    states.append(value)
                elif bucket == "city" and value not in cities:
                    cities.append(value)
            continue

        # Regular token
        bucket, value = _classify(raw)
        if bucket == "country" and value not in countries:
            countries.append(value)
        elif bucket == "state" and value not in states:
            states.append(value)
        elif bucket == "city" and value not in cities:
            cities.append(value)

    return {
        "remote": is_remote,
        "countries": countries,
        "states": states,
        "cities": cities,
    }


def parse_records(location: str) -> list[dict]:
    """Parse a location string into STRUCTURED records — one per geo group.

    Preserves parent-child relationships so picking "Canada" can correctly
    narrow the picker's other columns to only Canadian states/cities,
    instead of surfacing every US locale that happened to co-occur in the
    same multi-location string:

        "San Francisco, CA, US; Toronto, ON, Canada"
        → [
            {"country": "United States", "state": "California", "city": "San Francisco", "remote": False},
            {"country": "Canada",        "state": None,         "city": "Toronto",       "remote": False},
          ]
    """
    if not location:
        return []

    # 1. Strip parenthetical content FIRST — parens contain commas and "or"s
    #    ("ON, AB, BC, or NS Only") that would otherwise wreck splitting.
    cleaned = re.sub(r"\([^)]*\)", "", location)

    # 2. Split into geo groups on strong separators: semicolon, bullet,
    #    pipe, AND " or " (after parens are gone, "or" is now safe).
    groups = re.split(r"[;•·|]|\s+or\s+", cleaned)

    records: list[dict] = []
    for group in groups:
        group = group.strip()
        if not group:
            continue
        records.extend(_parse_one_group_to_records(group))
    return records


def _states_equal(a: str, b: str) -> bool:
    """True if a and b refer to the same US state (any combo of name/code)."""
    name_a = STATE_CODE_TO_NAME[a] if a in US_STATE_CODES else a
    name_b = STATE_CODE_TO_NAME[b] if b in US_STATE_CODES else b
    return name_a == name_b


def _parse_one_group_to_records(group: str) -> list[dict]:
    """Parse a single comma-separated group into one or more records.

    Handles the common pattern where a single comma-separated string
    encodes MULTIPLE geos: "San Francisco, CA, New York, NY, Portland, OR"
    → 3 records. Each (state-code-or-name) closes the current record;
    each (country) closes the current record AND assigns its country.
    """
    is_remote = False

    # Detect + strip remote phrases within this group
    if re.search(r"\bremote\b", group, re.I):
        is_remote = True
        group = re.sub(r"^\s*remote\s+(within|in)\s+", "", group, flags=re.I)
        group = re.sub(r"^\s*remote\s*[-–:,]?\s*", "", group, flags=re.I)
        group = re.sub(r"\s*[-–]\s*remote\s*$", "", group, flags=re.I)
        group = re.sub(r"\bremote\b", "", group, flags=re.I)
        group = group.strip(" ,-")

    if not group:
        return [{"country": None, "state": None, "city": None, "remote": is_remote}]

    parts = [p.strip().rstrip(".") for p in group.split(",") if p and p.strip()]
    if not parts:
        return [{"country": None, "state": None, "city": None, "remote": is_remote}]

    records: list[dict] = []
    current_city_parts: list[str] = []
    current_state: Optional[str] = None

    def flush(country: Optional[str] = None) -> None:
        nonlocal current_city_parts, current_state
        has_anything = bool(current_city_parts or current_state or country)
        if has_anything:
            city_str = " ".join(current_city_parts).strip() if current_city_parts else None
            # Drop ZIP-like trailing digits from the city
            if city_str:
                city_str = re.sub(r"\s+\d{4,}.*$", "", city_str).strip() or None
            country_str = country
            if country_str is None and current_state:
                country_str = "United States"
            records.append({
                "country": country_str,
                "state": current_state,
                "city": city_str,
                "remote": is_remote,
            })
        current_city_parts = []
        current_state = None

    i = 0
    while i < len(parts):
        p = parts[i]
        nxt = parts[i + 1] if i + 1 < len(parts) else None
        p_is_state = p in US_STATE_NAMES or p in US_STATE_CODES
        nxt_is_state = bool(nxt and (nxt in US_STATE_NAMES or nxt in US_STATE_CODES))

        # Country marker — closes current record with this country
        if p in COUNTRY_ALIASES:
            flush(country=COUNTRY_ALIASES[p])
            i += 1
            continue

        # "<State Name>, <State Code>" pattern (e.g. "New York, NY") where
        # both refer to the same state — interpret as city = state name,
        # state = the code. This is the convention some boards use for
        # large cities that share their state's name.
        if p_is_state and nxt_is_state and _states_equal(p, nxt):
            flush()
            current_city_parts.append(p)
            current_state = STATE_CODE_TO_NAME.get(nxt, nxt) if nxt in US_STATE_CODES else nxt
            flush()
            i += 2
            continue

        # Plain state — close any in-progress record first, then start fresh
        if p_is_state:
            if current_state is not None:
                flush()
            current_state = STATE_CODE_TO_NAME.get(p, p) if p in US_STATE_CODES else p
            i += 1
            continue

        # Anything else — accumulate into current city
        current_city_parts.append(p)
        i += 1

    flush()

    if not records:
        return [{"country": None, "state": None, "city": None, "remote": is_remote}]

    # Propagate is_remote flag to all emitted records (already done in flush
    # since we close over is_remote, but defensively ensure)
    for r in records:
        r["remote"] = r["remote"] or is_remote

    return records


def _record_matches(record: dict, needles_lower: set[str]) -> bool:
    """Return True if this record matches any of the selected location names.

    Match is case-insensitive equality against country / state / city.
    "Remote" as a needle is special-cased to match the remote flag.
    """
    if "remote" in needles_lower and record.get("remote"):
        return True
    for field in ("country", "state", "city"):
        v = record.get(field)
        if v and v.lower() in needles_lower:
            return True
    return False


def aggregate(locations: Iterable[str], filter_tokens: Optional[Iterable[str]] = None) -> dict[str, list[dict]]:
    """Aggregate parsed records across many job locations into ranked buckets.

    Args:
        locations: iterable of raw location strings (one per job).
        filter_tokens: if provided, only records that match any of these
            (case-insensitive equality on country/state/city or the remote
            flag) are counted. Powers hierarchical column narrowing.

    Returns:
        {
          'countries': [{'name': 'United States', 'count': 1234}, ...],
          'states':    [{'name': 'California',    'count':  321}, ...],
          'cities':    [{'name': 'San Francisco', 'count':  198}, ...],
          'remote':    {'count': 567}
        }
    """
    needles = {n.strip().lower() for n in (filter_tokens or []) if n and n.strip()}

    country_counts: Counter[str] = Counter()
    state_counts: Counter[str] = Counter()
    city_counts: Counter[str] = Counter()
    remote_count = 0

    for loc in locations:
        for record in parse_records(loc or ""):
            if needles and not _record_matches(record, needles):
                continue
            if record.get("remote"):
                remote_count += 1
            if record.get("country"):
                country_counts[record["country"]] += 1
            if record.get("state"):
                state_counts[record["state"]] += 1
            if record.get("city"):
                city_counts[record["city"]] += 1

    def _rank(counter: Counter[str]) -> list[dict]:
        return [{"name": name, "count": n} for name, n in counter.most_common()]

    return {
        "countries": _rank(country_counts),
        "states": _rank(state_counts),
        "cities": _rank(city_counts),
        "remote": {"count": remote_count},
    }

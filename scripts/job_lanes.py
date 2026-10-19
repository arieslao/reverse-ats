"""Shared "is this title in the candidate's lanes" filter.

Single source of truth for the title regex used by both
yc_to_local_sqlite.py and la_companies_to_local_sqlite.py — those loaders
pull from company-wide boards (not a pre-filtered role feed), so without a
lane filter a single large employer (e.g. SpaceX's ~2,700-job Greenhouse
board) would flood the DB with irrelevant engineering/retail/sales postings.
Each loader reads its own env var name (so they can be tuned independently)
but falls back to these same defaults — change the lane definition here and
both loaders pick it up.
"""

import re

DEFAULT_TITLE_REGEX = (
    r"\b(program manager|project manager|product manager|technical program|chief of staff|"
    r"operations|bizops|business operations|solutions? (engineer|architect|consultant|lead)|"
    r"forward.deployed|implementation|customer success|customer engineer|account manager|"
    r"technical account|strategy|head of|director|general manager|partnerships|enablement|"
    r"deployment|delivery|program lead|product lead|product ops|founding (pm|product|operator)|"
    r"IT (manager|strategy|director)|portfolio manager|business technology|AI (program|strategy|"
    r"transformation|adoption)|enterprise architect)\b"
)

# Titles the lane regex would otherwise admit through a shared word ("strategy",
# "head of", "director") but which are quota sales, pure engineering/eng
# management, or clearly out of scope for this candidate.
DEFAULT_TITLE_EXCLUDE = (
    r"\b(account executive|sales development|\bsdr\b|\bbdr\b|engineering manager|"
    r"head of (engineering|sales|marketing|design|people|talent)|"
    r"software engineer|senior software engineer|staff software engineer|"
    r"recruiter|recruiting coordinator|\bintern\b|internship)\b"
)


def compile_title_filter(include_src: str, exclude_src: str) -> tuple[re.Pattern | None, re.Pattern | None]:
    """Compile an (include, exclude) pair; '' for either disables that check."""
    inc = re.compile(include_src, re.IGNORECASE) if include_src else None
    exc = re.compile(exclude_src, re.IGNORECASE) if exclude_src else None
    return inc, exc


def title_in_lane(title: str, include_re: re.Pattern | None, exclude_re: re.Pattern | None) -> bool:
    if include_re and not include_re.search(title):
        return False
    if exclude_re and exclude_re.search(title):
        return False
    return True

"""Guards against the 'longest option is the answer' exploit.

The static bank was hand-authored with elaborate correct answers and terse
distractors: 87.9% of single cards had the correct option as the *strictly
longest*, so a student could score ~89% by blindly picking the longest option
without reading. The fix rebalances option lengths (same right/wrong meaning,
detail pushed into `explanation`) so length no longer signals correctness.

A topic is added to REBALANCED_TOPICS once its options have been rewritten; this
test then holds it to the length-neutral contract and blocks regressions. Topics
not yet rewritten are exempt so incremental commits stay green.
"""
from __future__ import annotations

from tools.flashcards.static_cards import FLASHCARDS

# Topics whose options have been length-balanced. Extend as each topic is done.
REBALANCED_TOPICS: set[str] = {
    "systemic_disease",
    "anatomy_physiology",
    "professional_ethics",
    "disorders_cornea_conjunctiva",
    "disorders_lens_cataract",
    "disorders_uvea_retina",
    "microbiology_infection",
    "ocular_emergencies",
    "glaucoma",
    "neuro_strabismus",
    "pharmacology",
    "disorders_eyelid_lacrimal_orbit",
    "eye_drops",
    "pupil_dilation",
    "red_eye",
    "triage",
    "history_taking",
    "distance_va",
    "near_vision",
    "pinhole",
    "iop_nct",
    "colour_vision",
    "amsler_macula",
    "fall_risk",
    "perioperative",
    "abbreviations",
    "oct_macula",
    "hvf",
    "gvf",
    "ascan_biometry",
    "optical_biometry",
    "endothelial",
    "asoct",
    "flare",
    "corneal_topography",
    "orthoptics",
    "auto_refraction",
    "aberrometry",
    "lens_meter",
    "dr_grading",
    "oct_rnfl",
    "dayward_theatre",
    "pam",
    "hrt",
    "retinal_imaging",
}

# A well-balanced 4-option card has the correct answer as the unique longest
# ~25% of the time by chance. Allow headroom for small per-topic N, but stay far
# below the 88% that made the exploit trivial — and cap the *shortest* rate too
# so we don't merely invert the tell.
MAX_UNIQ_LONGEST = 0.35
MAX_UNIQ_SHORTEST = 0.35
LEN_RATIO_BAND = (0.80, 1.25)  # mean(correct len) / mean(distractor len)


def _single_cards(topic_key: str) -> list[dict]:
    for _pool, topics in FLASHCARDS.items():
        by_diff = topics.get(topic_key)
        if by_diff:
            return [c for cards in by_diff.values() for c in cards
                    if c.get("qtype") == "single"]
    return []


def _tell_stats(cards: list[dict]) -> tuple[float, float, float]:
    """(uniq-longest rate, uniq-shortest rate, correct/distractor length ratio)."""
    n = len(cards)
    uniq_long = uniq_short = 0
    corr_len_tot = dist_len_tot = 0
    dist_n = 0
    for c in cards:
        opts = c["options"]
        ci = c["correct"][0]
        lens = [len(o) for o in opts]
        mx, mn = max(lens), min(lens)
        if lens[ci] == mx and lens.count(mx) == 1:
            uniq_long += 1
        if lens[ci] == mn and lens.count(mn) == 1:
            uniq_short += 1
        for i, L in enumerate(lens):
            if i == ci:
                corr_len_tot += L
            else:
                dist_len_tot += L
                dist_n += 1
    ratio = (corr_len_tot / n) / (dist_len_tot / dist_n) if dist_n else 1.0
    return uniq_long / n, uniq_short / n, ratio


def test_rebalanced_topics_have_no_length_tell():
    problems: list[str] = []
    for tk in sorted(REBALANCED_TOPICS):
        cards = _single_cards(tk)
        assert cards, f"{tk}: no single cards found (topic key wrong?)"
        long_rate, short_rate, ratio = _tell_stats(cards)
        if long_rate > MAX_UNIQ_LONGEST:
            problems.append(f"{tk}: correct is uniquely-longest in {long_rate:.0%} "
                            f"(> {MAX_UNIQ_LONGEST:.0%}) — longest-answer tell survives")
        if short_rate > MAX_UNIQ_SHORTEST:
            problems.append(f"{tk}: correct is uniquely-shortest in {short_rate:.0%} "
                            f"(> {MAX_UNIQ_SHORTEST:.0%}) — tell merely inverted")
        if not (LEN_RATIO_BAND[0] <= ratio <= LEN_RATIO_BAND[1]):
            problems.append(f"{tk}: correct/distractor length ratio {ratio:.2f} "
                            f"outside {LEN_RATIO_BAND}")
    assert not problems, "length tell present:\n  " + "\n  ".join(problems)


def test_naive_longest_picker_scores_near_chance_on_rebalanced():
    """End-to-end: a bot that always picks the longest option must not beat
    chance by much across all rebalanced single cards combined."""
    cards = [c for tk in REBALANCED_TOPICS for c in _single_cards(tk)]
    if not cards:
        return
    score = 0.0
    for c in cards:
        lens = [len(o) for o in c["options"]]
        mx = max(lens)
        longest = [i for i, L in enumerate(lens) if L == mx]
        score += (1.0 if c["correct"][0] in longest else 0.0) / len(longest)
    rate = score / len(cards)
    assert rate <= 0.40, (
        f"'always pick longest' scores {rate:.0%} across rebalanced cards "
        f"— length still leaks the answer")


# A student can only act on a length difference they can actually see. Options
# now sit within a few characters of each other, so we score the heuristic a
# real person could run: pick the longest option, but only when it stands out;
# otherwise you are guessing. This is the metric that matters, and it must land
# at chance (25% on a 4-option card).
VISIBLE_GAP = 5  # chars the longest must beat the runner-up by to be "obvious"


def test_visibly_longest_option_is_no_better_than_guessing():
    cards = [c for tk in REBALANCED_TOPICS for c in _single_cards(tk)]
    assert cards
    score = 0.0
    for c in cards:
        lens = [len(o) for o in c["options"]]
        ranked = sorted(lens, reverse=True)
        if ranked[0] - ranked[1] >= VISIBLE_GAP:
            picks = [i for i, L in enumerate(lens) if L == ranked[0]]
        else:
            picks = list(range(len(lens)))  # no visible tell, so guess
        score += (1.0 if c["correct"][0] in picks else 0.0) / len(picks)
    rate = score / len(cards)
    assert rate <= 0.30, (
        f"picking the visibly-longest option scores {rate:.0%} (chance is 25%) "
        f"— option length is still worth exploiting")

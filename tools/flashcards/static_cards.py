"""Static flashcard pool — self-contained MCQs organised as 45 sets per role.

Each card is a complete MCQ: stem, options, correct indices, qtype (single /
multi), kind (theory / practical), model-answer explanation, and a
reasoning_eligible flag. The browser grades MCQ correctness instantly (no AI);
a handful of reasoning-eligible cards per deck carry a compulsory typed box
graded by one background AI call.

Structure: FLASHCARDS[pool][topic_key][difficulty] = [ {MCQ card}, ... ].
Served via GET /api/flashcards/generate (optionally ?set_key=) using
tools.shared.static_pools.pick_next_unseen for per-user no-repeat rotation.

Pools mirror check-in pooling (see flashcard_sets.py):
- OT  -> "OT" pool (ophthalmic investigations / imaging).
- OA and PSA share the "CLINICAL" pool.
"""
from __future__ import annotations

from tools.flashcards.flashcard_sets import (
    DIFFICULTIES,
    pool_for_role,
    topics_for,
    make_set_key,
)

# FLASHCARDS[pool][topic_key][difficulty] = list of MCQ card dicts
FLASHCARDS: dict[str, dict[str, dict[str, list[dict]]]] = {
    "CLINICAL": {
        "triage": {
            "easy": [
                {
                    "stem": "Within how long must a Triage Category 1 case be seen?",
                    "options": ["Within 10 minutes", "Within 30 minutes",
                                "Within 60 minutes", "Within 2 hours"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Category 1 is the most urgent — it must be seen "
                                   "within 10 minutes (e.g. chemical burn, CRAO).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Within how long must a Triage Category 2 case be seen?",
                    "options": ["Within 10 minutes", "Within 30 minutes",
                                "Within 60 minutes", "Within 2 hours"],
                    "correct": [1],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Category 2 cases must be seen within 30 minutes.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Within how long must a Triage Category 3 case be seen?",
                    "options": ["Within 10 minutes", "Within 30 minutes",
                                "Within 60 minutes", "Within 2 hours"],
                    "correct": [2],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Category 3 cases must be seen within 60 minutes.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Within how long must a Triage Category 4 case be seen?",
                    "options": ["Within 10 minutes", "Within 30 minutes",
                                "Within 60 minutes", "Within 2 hours"],
                    "correct": [3],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Category 4 covers minor or chronic conditions and "
                                   "must be seen within 2 hours.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Which triage category does conjunctivitis fall under?",
                    "options": ["Category 1", "Category 2",
                                "Category 3", "Category 4"],
                    "correct": [3],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Conjunctivitis is a minor/chronic condition — "
                                   "Category 4 (within 2 hours).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What is the first action for a chemical eye burn?",
                    "options": ["Check visual acuity", "Start irrigation immediately",
                                "Instil anaesthetic drops", "Measure IOP"],
                    "correct": [1],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Chemical burns are Category 1 — start irrigation "
                                   "immediately to wash out the chemical and limit "
                                   "ongoing damage.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "How many triage categories are there in the SNEC system?",
                    "options": ["2", "3", "4", "5"],
                    "correct": [2],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "There are 4 triage categories: Category 1 (within "
                                   "10 min), Category 2 (within 30 min), Category 3 "
                                   "(within 60 min), and Category 4 (within 2 hours).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A stable chronic glaucoma review is which triage category?",
                    "options": ["Category 1", "Category 2",
                                "Category 3", "Category 4"],
                    "correct": [3],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A stable chronic glaucoma review is routine — "
                                   "Category 4 (within 2 hours).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Which triage category requires the patient to be seen most urgently?",
                    "options": ["Category 4", "Category 3",
                                "Category 2", "Category 1"],
                    "correct": [3],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Category 1 is the most urgent — the patient must "
                                   "be seen within 10 minutes.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A welder's flash burn is which triage category?",
                    "options": ["Category 1", "Category 2",
                                "Category 3", "Category 4"],
                    "correct": [2],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A welder's flash burn (painful red eye / "
                                   "photokeratitis) is Category 3 (within 60 minutes).",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "A total hyphaema is which triage category?",
                    "options": ["Category 1", "Category 2",
                                "Category 3", "Category 4"],
                    "correct": [1],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A total hyphaema (blood filling the anterior "
                                   "chamber) is Category 2 (within 30 minutes).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Central retinal artery occlusion (CRAO) with VA <6/60 "
                            "is which triage category?",
                    "options": ["Category 1", "Category 2",
                                "Category 3", "Category 4"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "CRAO with VA <6/60 is a sight-threatening "
                                   "emergency — Category 1 (within 10 minutes).",
                    "reasoning_eligible": True,
                },
            ],
            "medium": [
                {
                    "stem": "Which triage category is a chemical burn, and what is "
                            "the first action?",
                    "options": [
                        "Category 1 — start irrigation immediately",
                        "Category 2 — check visual acuity first",
                        "Category 3 — instil anaesthetic then irrigate",
                        "Category 1 — measure IOP first",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Chemical burns are Category 1 (within 10 minutes). "
                                   "The first action is immediate irrigation to wash "
                                   "out the chemical and limit damage.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "A patient with previous retinal history reports a sudden "
                            "increase in floaters. Which triage category?",
                    "options": ["Category 1", "Category 2",
                                "Category 3", "Category 4"],
                    "correct": [2],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Suspect retinal detachment — Category 3 (within "
                                   "60 minutes).",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Which of the following conditions is Triage Category 1?",
                    "options": ["Conjunctivitis", "Stable glaucoma review",
                                "Chemical eye burn", "Welder's flash burn"],
                    "correct": [2],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Chemical eye burn is Category 1 (within 10 "
                                   "minutes). Conjunctivitis and stable glaucoma are "
                                   "Category 4; a welder's flash burn is Category 3.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A patient presents with sudden painless loss of vision "
                            "in one eye. What is the appropriate triage action?",
                    "options": [
                        "Category 4 — schedule routine review",
                        "Category 1 — escalate immediately",
                        "Category 3 — see within 60 minutes",
                        "Category 2 — see within 30 minutes",
                    ],
                    "correct": [1],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Sudden painless loss of vision (e.g. CRAO, "
                                   "vitreous haemorrhage) is a sight-threatening "
                                   "emergency — Category 1, escalate immediately.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why must a chemical eye injury be irrigated before "
                            "checking visual acuity?",
                    "options": [
                        "Because irrigation improves visual acuity",
                        "To wash out the chemical and limit ongoing damage",
                        "Because VA cannot be measured with an injured eye",
                        "To reduce intraocular pressure first",
                    ],
                    "correct": [1],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Chemical burns cause ongoing tissue damage every "
                                   "second — irrigation must begin immediately to "
                                   "wash out the chemical. VA can wait.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Which of the following are Triage Category 2 conditions?",
                    "options": [
                        "Total hyphaema",
                        "Chemical burn",
                        "Conjunctivitis",
                        "Stable chronic glaucoma review",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Total hyphaema is Category 2 (within 30 minutes). "
                                   "Chemical burn is Category 1; conjunctivitis and "
                                   "stable glaucoma are Category 4.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A patient with acute angle-closure glaucoma presents "
                            "with severe eye pain, nausea, and a hazy cornea. "
                            "Which triage category?",
                    "options": ["Category 4", "Category 3",
                                "Category 2", "Category 1"],
                    "correct": [3],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Acute angle-closure glaucoma is a sight-threatening "
                                   "emergency — Category 1 (within 10 minutes).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A painful red eye with no discharge or visual loss "
                            "is likely which triage category?",
                    "options": ["Category 1", "Category 2",
                                "Category 3", "Category 4"],
                    "correct": [2],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A painful red eye without vision-threatening "
                                   "features (e.g. flash burn, mild keratitis) is "
                                   "typically Category 3 (within 60 minutes).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What distinguishes Category 1 from Category 2 in "
                            "terms of clinical urgency?",
                    "options": [
                        "Category 1 is seen within 10 minutes; Category 2 "
                        "within 30 minutes",
                        "Category 1 needs a doctor; Category 2 does not",
                        "Category 1 requires surgery; Category 2 does not",
                        "There is no difference",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Category 1 must be seen within 10 minutes "
                                   "(sight/life-threatening); Category 2 within "
                                   "30 minutes (urgent but not immediately "
                                   "sight-threatening).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL conditions that are Triage Category 3 "
                            "(seen within 60 minutes).",
                    "options": [
                        "Sudden increase in floaters with retinal history",
                        "Welder's flash burn",
                        "Chemical eye burn",
                        "Total hyphaema",
                    ],
                    "correct": [0, 1],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Sudden floaters (suspect retinal detachment) and "
                                   "welder's flash burn are both Category 3 (within "
                                   "60 minutes). Chemical burn is Category 1; total "
                                   "hyphaema is Category 2.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "A patient on anticoagulants has a partial hyphaema "
                            "after blunt trauma. What is the primary triage concern?",
                    "options": [
                        "The hyphaema may worsen due to bleeding risk",
                        "Anticoagulants prevent healing",
                        "The patient should stop the anticoagulant immediately",
                        "No special concern — treat as Category 4",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Anticoagulants increase bleeding risk, so the "
                                   "hyphaema may enlarge. Escalate urgently (do NOT "
                                   "stop anticoagulants without medical instruction).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "In triage, what is the purpose of assigning a category?",
                    "options": [
                        "To prioritise patients by clinical urgency",
                        "To decide which doctor sees the patient",
                        "To determine the treatment plan",
                        "To calculate the consultation fee",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Triage categories prioritise patients so the "
                                   "most urgent cases are seen first.",
                    "reasoning_eligible": False,
                },
            ],
            "hard": [
                {
                    "stem": "Select ALL conditions that are Triage Category 1 "
                            "(seen within 10 minutes).",
                    "options": [
                        "Chemical eye burn",
                        "Central retinal artery occlusion (CRAO)",
                        "Conjunctivitis",
                        "Stable chronic glaucoma review",
                    ],
                    "correct": [0, 1],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Chemical burns and CRAO are sight-threatening "
                                   "emergencies needing treatment within minutes. "
                                   "Conjunctivitis and a stable glaucoma review "
                                   "are routine (Category 4).",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "A patient presents with sudden painless vision loss, "
                            "VA <6/60, and a cherry-red spot on fundoscopy. "
                            "What is the most likely diagnosis and triage category?",
                    "options": [
                        "CRAO — Category 1",
                        "Retinal detachment — Category 3",
                        "Vitreous haemorrhage — Category 2",
                        "Optic neuritis — Category 3",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A cherry-red spot with sudden painless vision "
                                   "loss and VA <6/60 is classic for CRAO — "
                                   "Category 1 (within 10 minutes).",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "A patient splashed an unknown chemical in both eyes "
                            "5 minutes ago. As the first responder, what do you do?",
                    "options": [
                        "Start bilateral irrigation immediately",
                        "Identify the chemical before irrigating",
                        "Check visual acuity to assess severity",
                        "Instil anaesthetic drops and wait for the doctor",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Chemical burns are Category 1. Irrigate "
                                   "immediately — do not delay to identify the "
                                   "chemical or check VA. Every second counts.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why is acute angle-closure glaucoma classified as "
                            "Category 1 rather than Category 2?",
                    "options": [
                        "It can cause irreversible vision loss within minutes "
                        "if untreated",
                        "It is always bilateral",
                        "It only occurs in elderly patients",
                        "It requires surgery within 30 minutes",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Acute angle-closure glaucoma causes rapid, "
                                   "irreversible optic nerve damage from high IOP. "
                                   "It must be seen within 10 minutes (Category 1).",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Rank the following from most urgent to least urgent "
                            "triage category.",
                    "options": [
                        "Chemical burn > Total hyphaema > Flash burn > "
                        "Conjunctivitis",
                        "Total hyphaema > Chemical burn > Flash burn > "
                        "Conjunctivitis",
                        "Flash burn > Chemical burn > Conjunctivitis > "
                        "Total hyphaema",
                        "Conjunctivitis > Flash burn > Total hyphaema > "
                        "Chemical burn",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Chemical burn = Cat 1 (10 min) > Total hyphaema "
                                   "= Cat 2 (30 min) > Flash burn = Cat 3 (60 min) "
                                   "> Conjunctivitis = Cat 4 (2 hr).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A myopic patient with a history of retinal tears "
                            "reports a sudden shower of floaters and a curtain "
                            "across their vision. What triage category and why?",
                    "options": [
                        "Category 3 — suspect retinal detachment",
                        "Category 4 — floaters are benign",
                        "Category 1 — immediate surgery needed",
                        "Category 2 — moderate urgency",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A curtain plus shower of floaters in a myope with "
                                   "retinal history strongly suggests retinal "
                                   "detachment — Category 3 (within 60 minutes).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Two patients arrive simultaneously: one with "
                            "conjunctivitis and one with a chemical burn. "
                            "Who is seen first and why?",
                    "options": [
                        "Chemical burn — Category 1 is more urgent than "
                        "Category 4",
                        "Conjunctivitis — it arrived first",
                        "Both at the same time",
                        "Chemical burn — but only after checking VA on both",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Chemical burn is Category 1 (within 10 minutes); "
                                   "conjunctivitis is Category 4 (within 2 hours). "
                                   "The chemical burn patient is seen first.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL features that would make you assign "
                            "Category 1 to a red eye.",
                    "options": [
                        "Severe pain with nausea, vomiting, and a fixed "
                        "mid-dilated pupil",
                        "Chemical exposure requiring irrigation",
                        "Mild itchiness with watery discharge",
                        "Marked discharge with no pain",
                    ],
                    "correct": [0, 1],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Acute angle-closure glaucoma (severe pain, "
                                   "nausea, fixed dilated pupil) and chemical "
                                   "exposure are both Category 1. Mild itchiness "
                                   "and painless discharge are lower categories.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "A patient presents after blunt trauma with blood "
                            "filling the entire anterior chamber. What is the "
                            "condition and its triage category?",
                    "options": [
                        "Total hyphaema — Category 2",
                        "Hypopyon — Category 1",
                        "Subconjunctival haemorrhage — Category 4",
                        "Vitreous haemorrhage — Category 3",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Blood in the anterior chamber = hyphaema. A total "
                                   "hyphaema is Category 2 (within 30 minutes).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Which statement about triage categories is correct?",
                    "options": [
                        "Category 1 and 2 both require the patient to be seen "
                        "within 30 minutes",
                        "Category 3 is for minor or chronic conditions",
                        "Category 4 patients must be seen within 2 hours",
                        "Categories are assigned based on the patient's age",
                    ],
                    "correct": [2],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Category 4 = within 2 hours (minor/chronic). "
                                   "Category 1 = within 10 min (not 30). "
                                   "Category 3 = within 60 min (not minor). "
                                   "Categories are based on clinical urgency, not age.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why is it important not to delay irrigation for a "
                            "chemical burn even if the patient is in severe pain?",
                    "options": [
                        "The chemical causes ongoing tissue damage every second — "
                        "irrigation must not be delayed",
                        "Pain will resolve once irrigation starts",
                        "The chemical neutralises itself after 10 minutes",
                        "Irrigation is only effective within the first minute",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Chemical burns cause progressive tissue "
                                   "destruction. Immediate irrigation limits "
                                   "damage regardless of pain level.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A patient with uveitis (iritis) presents with "
                            "photophobia, a small pupil, and moderate pain. "
                            "What triage category?",
                    "options": [
                        "Category 1", "Category 2",
                        "Category 3", "Category 4",
                    ],
                    "correct": [1],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Uveitis is an ocular emergency. With moderate "
                                   "pain and photophobia, it is Category 2 (within "
                                   "30 minutes) unless vision is severely threatened, "
                                   "which would escalate to Category 1.",
                    "reasoning_eligible": False,
                },
            ],
        },
        "ocular_emergencies": {
            "easy": [
                {
                    "stem": "What is a hyphaema?",
                    "options": ["Blood in the anterior chamber",
                                "Pus in the anterior chamber",
                                "Blood in the vitreous cavity",
                                "Fluid under the retina"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "A hyphaema is blood in the anterior chamber — the "
                                   "front part of the eye, between the cornea and iris.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What is a hypopyon?",
                    "options": ["Pus in the anterior chamber",
                                "Blood in the anterior chamber",
                                "A clear fluid level in the eye",
                                "Swelling of the eyelid"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "A hypopyon is pus in the anterior chamber — a sign "
                                   "of infection or severe inflammation.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What is the classic pupil sign in acute angle-closure "
                            "glaucoma?",
                    "options": ["A fixed, mid-dilated, oval pupil",
                                "A small, constricted pupil",
                                "An irregular, peaked pupil",
                                "A normal, reactive pupil"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Acute angle-closure glaucoma classically shows a "
                                   "fixed, mid-dilated (large, oval) pupil.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Is acute glaucoma considered an ocular emergency?",
                    "options": ["Yes — it can cause rapid, permanent vision loss",
                                "No — it is a routine chronic condition",
                                "Only if both eyes are affected",
                                "Only in patients over 70"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Acute glaucoma is one of the recognised ocular "
                                   "emergencies — high pressure can damage the optic "
                                   "nerve within hours.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Which finding in the anterior chamber points to infection?",
                    "options": ["Hypopyon (pus)", "Hyphaema (blood)",
                                "A deep, quiet chamber", "A clear cornea"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "A hypopyon (pus in the anterior chamber) signals "
                                   "infection or severe inflammation.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A chemical is splashed into a patient's eye. What is the "
                            "single most important first action?",
                    "options": ["Start irrigation immediately",
                                "Measure the intraocular pressure",
                                "Check the visual acuity first",
                                "Identify the exact chemical"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Irrigate immediately to wash out the chemical and "
                                   "limit ongoing tissue damage — everything else waits.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "A welder has painful, red, watering eyes a few hours after "
                            "work. What is the likely cause?",
                    "options": ["Flash burn (photokeratitis) from UV exposure",
                                "Acute angle-closure glaucoma",
                                "Bacterial conjunctivitis",
                                "A hyphaema"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "UV exposure from welding causes a flash burn "
                                   "(photokeratitis); the pain is typically delayed by "
                                   "a few hours.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Which of these is NOT one of the recognised ocular "
                            "emergencies?",
                    "options": ["Presbyopia",
                                "Chemical injury",
                                "Acute glaucoma",
                                "Painless sudden loss of vision"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Presbyopia is a normal age-related loss of near "
                                   "focus, not an emergency. Chemical injury, acute "
                                   "glaucoma and sudden painless vision loss are all "
                                   "ocular emergencies.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What does 'photophobia' mean?",
                    "options": ["Sensitivity to light",
                                "Fear of the dark",
                                "Loss of colour vision",
                                "Double vision"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Photophobia means sensitivity to (discomfort in) "
                                   "light — common in uveitis and corneal problems.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Severe eye pain with headache, nausea and vomiting should "
                            "make you suspect which emergency?",
                    "options": ["Acute angle-closure glaucoma",
                                "Conjunctivitis",
                                "Presbyopia",
                                "A subconjunctival haemorrhage"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Severe pain with headache, nausea and vomiting is "
                                   "the classic picture of acute angle-closure glaucoma.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "How does the pupil typically appear in uveitis (iritis)?",
                    "options": ["Small or normal in size",
                                "Large, oval and fixed",
                                "Irregular and white",
                                "Always perfectly round and dilated"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "In uveitis the pupil is usually small or normal — "
                                   "unlike acute glaucoma, where it is large, oval and "
                                   "fixed.",
                    "reasoning_eligible": False,
                },
            ],
            "medium": [
                {
                    "stem": "Why must a chemical eye injury be irrigated before checking "
                            "the visual acuity?",
                    "options": [
                        "The chemical keeps damaging tissue every second — irrigation "
                        "cannot wait",
                        "Irrigation improves the visual acuity reading",
                        "Visual acuity cannot be measured in an injured eye",
                        "Irrigation lowers the eye pressure first",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "A chemical burn causes ongoing tissue damage every "
                                   "second. Immediate irrigation washes it out and "
                                   "limits the damage; visual acuity can wait.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "How does the pupil help separate acute glaucoma from "
                            "uveitis?",
                    "options": [
                        "Acute glaucoma: large, oval, fixed; uveitis: small or normal",
                        "Acute glaucoma: small; uveitis: large and fixed",
                        "Both have a large, fixed pupil",
                        "The pupil is normal in both",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Acute angle-closure glaucoma gives a large, oval, "
                                   "fixed pupil; uveitis gives a small or normal pupil. "
                                   "The pupil is a key distinguishing sign.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL features that point to acute angle-closure "
                            "glaucoma rather than a simple red eye.",
                    "options": [
                        "Severe pain with nausea and vomiting",
                        "Haloes around lights and a hazy cornea",
                        "A fixed, mid-dilated pupil",
                        "Mild itch with watery discharge",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Nausea/vomiting, haloes with a hazy cornea, and a "
                                   "fixed mid-dilated pupil all point to acute "
                                   "angle-closure glaucoma. Mild itch with watery "
                                   "discharge suggests simple conjunctivitis.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why is the pain from a welder's flash burn usually delayed "
                            "by several hours?",
                    "options": [
                        "The UV damage to the corneal surface takes time to become "
                        "symptomatic",
                        "Welders always wear protection during work",
                        "The eye numbs itself during exposure",
                        "Flash burns do not actually cause pain",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "UV exposure damages the corneal surface "
                                   "(photokeratitis), but the painful symptoms "
                                   "characteristically appear a few hours later.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A patient on warfarin develops a hyphaema after blunt "
                            "trauma. What is the main added concern?",
                    "options": [
                        "The anticoagulant raises the risk of further bleeding",
                        "The anticoagulant prevents the eye from healing",
                        "Warfarin makes the pupil dilate",
                        "There is no added concern",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Anticoagulants increase the risk of re-bleeding, so "
                                   "a traumatic hyphaema may worsen. Escalate; never "
                                   "stop the anticoagulant without medical instruction.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A hypopyon in a contact-lens wearer with a painful red eye "
                            "most suggests what?",
                    "options": [
                        "A serious corneal infection (microbial keratitis)",
                        "Simple allergic conjunctivitis",
                        "Presbyopia",
                        "A normal finding in lens wearers",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Pus in the anterior chamber (hypopyon) with a "
                                   "painful red eye in a lens wearer raises concern for "
                                   "sight-threatening microbial keratitis — escalate.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Sudden painless loss of vision in one eye — is this an "
                            "emergency?",
                    "options": [
                        "Yes — it is one of the recognised ocular emergencies",
                        "No — painless problems are never urgent",
                        "Only if the patient also has pain",
                        "Only if vision returns on its own",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Painless sudden loss of vision (e.g. CRAO, vitreous "
                                   "haemorrhage) is a recognised ocular emergency and "
                                   "must be escalated quickly.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Which red-flag combination most strongly suggests acute "
                            "angle-closure glaucoma in a red, painful eye?",
                    "options": [
                        "Hazy cornea, haloes, and a fixed mid-dilated pupil",
                        "Watery discharge with a normal pupil",
                        "Itchy lids with crusting",
                        "Gritty feeling that clears on blinking",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A hazy cornea, haloes around lights and a fixed "
                                   "mid-dilated pupil together strongly suggest acute "
                                   "angle-closure glaucoma.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why is a painful third-nerve (CN III) palsy treated as an "
                            "emergency?",
                    "options": [
                        "It may signal a compressive lesion such as an aneurysm",
                        "It always means the patient has glaucoma",
                        "It is only a cosmetic concern",
                        "It resolves within minutes on its own",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "A painful CN III palsy can be caused by a "
                                   "compressive lesion (e.g. an aneurysm), so it needs "
                                   "urgent assessment.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL of the following that are recognised ocular "
                            "emergencies.",
                    "options": [
                        "Chemical injury",
                        "Acute glaucoma",
                        "Uveitis",
                        "Presbyopia",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "Chemical injury, acute glaucoma and uveitis are all "
                                   "ocular emergencies. Presbyopia is a normal "
                                   "age-related change, not an emergency.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A patient reports severe pain, blurred vision and seeing "
                            "haloes around lights this evening. What should you do?",
                    "options": [
                        "Treat as a possible acute glaucoma and escalate urgently",
                        "Reassure and book a routine appointment",
                        "Give reading glasses",
                        "Advise warm compresses and discharge home",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Severe pain, blurred vision and haloes suggest "
                                   "acute angle-closure glaucoma — a sight-threatening "
                                   "emergency that must be escalated urgently.",
                    "reasoning_eligible": False,
                },
            ],
            "hard": [
                {
                    "stem": "A patient presents with a severely painful red eye, nausea, "
                            "a hazy cornea and a fixed mid-dilated pupil. What is the "
                            "most likely diagnosis and why is it urgent?",
                    "options": [
                        "Acute angle-closure glaucoma — high pressure can damage the "
                        "optic nerve within hours",
                        "Bacterial conjunctivitis — it spreads to others",
                        "Presbyopia — it worsens with age",
                        "Subconjunctival haemorrhage — it looks dramatic",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Severe pain, nausea, a hazy cornea and a fixed "
                                   "mid-dilated pupil are classic for acute "
                                   "angle-closure glaucoma. The very high pressure can "
                                   "cause irreversible optic nerve damage within hours.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Two patients arrive together: one with a chemical splash 3 "
                            "minutes ago, one with a hypopyon and a 2-day painful red "
                            "eye. Who is managed first and why?",
                    "options": [
                        "The chemical splash — irrigation is time-critical and cannot "
                        "be delayed",
                        "The hypopyon — pus is always more serious",
                        "Whoever registered first",
                        "Both can wait for the next routine slot",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A fresh chemical injury needs immediate irrigation "
                                   "(every second counts), so it is managed first. The "
                                   "hypopyon is serious and must also be escalated, but "
                                   "irrigation of the chemical burn cannot be delayed.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL signs that distinguish acute angle-closure "
                            "glaucoma from anterior uveitis.",
                    "options": [
                        "A large, oval, fixed pupil (vs small in uveitis)",
                        "Nausea and vomiting with severe pain",
                        "Haloes around lights with a hazy cornea",
                        "Marked discharge with normal vision",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "A large fixed pupil, systemic nausea/vomiting, and "
                                   "haloes with a hazy cornea point to acute glaucoma. "
                                   "Uveitis gives a small pupil. Marked discharge with "
                                   "normal vision suggests conjunctivitis, not either.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why should you NOT delay irrigating a chemical burn even to "
                            "instil anaesthetic or check vision?",
                    "options": [
                        "The chemical causes progressive tissue destruction every "
                        "second of contact",
                        "Anaesthetic neutralises the chemical",
                        "Vision testing is impossible in a red eye",
                        "Irrigation only works in the first 60 seconds",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Chemicals keep destroying tissue for as long as "
                                   "they remain in contact, so irrigation must start "
                                   "immediately — before anaesthetic or vision checks.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Rank these from most to least immediately sight-threatening.",
                    "options": [
                        "Chemical burn > acute angle-closure glaucoma > flash burn > "
                        "viral conjunctivitis",
                        "Viral conjunctivitis > flash burn > chemical burn > acute "
                        "glaucoma",
                        "Flash burn > chemical burn > conjunctivitis > acute glaucoma",
                        "Acute glaucoma > conjunctivitis > chemical burn > flash burn",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "A chemical burn and acute angle-closure glaucoma are "
                                   "the most immediately sight-threatening; a flash burn "
                                   "is painful but self-limiting; viral conjunctivitis "
                                   "is minor.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A trauma patient has blood filling the whole anterior "
                            "chamber. Name the sign and the main risk if missed.",
                    "options": [
                        "Total hyphaema — re-bleeding and a pressure rise can "
                        "threaten vision",
                        "Hypopyon — it will clear on its own",
                        "Subconjunctival haemorrhage — purely cosmetic",
                        "Cataract — it needs routine surgery",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Blood filling the anterior chamber is a total "
                                   "hyphaema. The main risks are re-bleeding and a rise "
                                   "in intraocular pressure, both of which can threaten "
                                   "vision — escalate.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A patient with a painful red eye, photophobia and a small "
                            "pupil has no discharge. What is the most likely diagnosis?",
                    "options": [
                        "Anterior uveitis (iritis)",
                        "Bacterial conjunctivitis",
                        "Acute angle-closure glaucoma",
                        "Dry eye",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Pain, photophobia and a small pupil with little or "
                                   "no discharge are typical of anterior uveitis "
                                   "(iritis).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL situations that warrant immediate escalation as "
                            "an ocular emergency.",
                    "options": [
                        "A fresh chemical splash to the eye",
                        "Sudden painless loss of vision",
                        "Severe pain with a fixed mid-dilated pupil",
                        "A mild gritty sensation that clears on blinking",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "A chemical splash, sudden painless vision loss, and "
                                   "severe pain with a fixed dilated pupil are all "
                                   "emergencies. A transient gritty feeling that clears "
                                   "is not.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why can acute angle-closure glaucoma cause vomiting?",
                    "options": [
                        "The sudden, very high eye pressure triggers a strong "
                        "vagal/autonomic response",
                        "The eye drops used always cause nausea",
                        "Vomiting lowers the eye pressure deliberately",
                        "It is unrelated — vomiting is coincidental",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "The abrupt, very high intraocular pressure in acute "
                                   "angle-closure glaucoma triggers an autonomic "
                                   "response that can cause nausea and vomiting — which "
                                   "can be mistaken for a stomach upset.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "A patient has a painful CN III palsy with a drooping lid "
                            "and a dilated pupil. Why is the dilated ('blown') pupil "
                            "especially concerning?",
                    "options": [
                        "Pupil involvement raises suspicion of a compressive aneurysm",
                        "It proves the cause is simply old age",
                        "A dilated pupil means the problem is minor",
                        "It indicates the patient needs reading glasses",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "In a third-nerve palsy, pupil involvement (a "
                                   "'blown' pupil) raises concern for a compressive "
                                   "cause such as an aneurysm — a neurosurgical "
                                   "emergency.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Which statement about anterior-chamber signs is correct?",
                    "options": [
                        "Hyphaema is blood and hypopyon is pus; both warrant "
                        "escalation",
                        "Hyphaema is pus and hypopyon is blood",
                        "Both are normal findings after dilation",
                        "Only hyphaema needs review; hypopyon can be ignored",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Hyphaema = blood in the anterior chamber; hypopyon "
                                   "= pus. Both are abnormal and should be flagged for "
                                   "the doctor.",
                    "reasoning_eligible": False,
                },
            ],
        },
        "red_eye": {
            "easy": [
                {
                    "stem": "In conjunctivitis, what is the discharge typically like?",
                    "options": ["Marked discharge",
                                "No discharge at all",
                                "Bloody discharge",
                                "Only at night"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Conjunctivitis typically produces marked discharge "
                                   "(watery, mucoid or purulent depending on the cause).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Does conjunctivitis usually reduce visual acuity?",
                    "options": ["No — vision is usually normal",
                                "Yes — vision drops markedly",
                                "Vision is always lost completely",
                                "Only colour vision is affected"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "In conjunctivitis visual acuity is usually normal. "
                                   "A red eye with reduced vision suggests something "
                                   "more serious.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What is the pupil like in acute (angle-closure) glaucoma?",
                    "options": ["Large, oval and fixed",
                                "Small and reactive",
                                "Pinpoint",
                                "Normal and round"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Acute glaucoma gives a large, oval, fixed pupil — a "
                                   "key warning sign in a painful red eye.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Which red-eye condition has marked photophobia but little "
                            "or no discharge?",
                    "options": ["Iritis (anterior uveitis)",
                                "Bacterial conjunctivitis",
                                "Allergic conjunctivitis",
                                "Subconjunctival haemorrhage"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Iritis (anterior uveitis) causes marked photophobia "
                                   "with little or no discharge.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL red-eye conditions that typically cause the "
                            "most severe pain.",
                    "options": ["Acute (angle-closure) glaucoma",
                                "Keratitis",
                                "Simple conjunctivitis",
                                "Subconjunctival haemorrhage"],
                    "correct": [0, 1],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "Acute glaucoma and keratitis cause the most severe "
                                   "pain. Conjunctivitis is uncomfortable but not "
                                   "severely painful, and a subconjunctival haemorrhage "
                                   "is usually painless.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What is the pupil like in iritis (anterior uveitis)?",
                    "options": ["Small (or normal)",
                                "Large, oval and fixed",
                                "White and irregular",
                                "Always widely dilated"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Iritis usually gives a small (or normal) pupil — "
                                   "the opposite of acute glaucoma's large fixed pupil.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Keratitis or a corneal abrasion typically causes what "
                            "pattern of pain and discharge?",
                    "options": ["Marked pain with little or no discharge",
                                "No pain with heavy discharge",
                                "No pain and no discharge",
                                "Mild pain with bloody discharge"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Keratitis and corneal abrasions cause marked pain "
                                   "with little or no discharge; vision varies with the "
                                   "site of the lesion.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A painless red eye with marked discharge and normal vision "
                            "is most likely what?",
                    "options": ["Conjunctivitis",
                                "Acute glaucoma",
                                "Iritis",
                                "Keratitis"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Marked discharge with no pain and normal vision is "
                                   "the classic picture of conjunctivitis.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Iritis is another name for which condition?",
                    "options": ["Anterior uveitis",
                                "Conjunctivitis",
                                "Glaucoma",
                                "Cataract"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Iritis is inflammation of the iris — a form of "
                                   "anterior uveitis.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Which red-eye condition is sight-threatening and needs "
                            "urgent care?",
                    "options": ["Acute (angle-closure) glaucoma",
                                "Allergic conjunctivitis",
                                "Subconjunctival haemorrhage",
                                "Mild dry eye"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Acute angle-closure glaucoma is sight-threatening "
                                   "and must be treated urgently; the others are far "
                                   "less serious.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A red eye with normal vision, no pain and a bright red "
                            "patch of blood on the white of the eye suggests what?",
                    "options": ["Subconjunctival haemorrhage",
                                "Acute glaucoma",
                                "Keratitis",
                                "Iritis"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A painless, flat, bright-red patch with normal "
                                   "vision is a subconjunctival haemorrhage — alarming "
                                   "to look at but usually harmless.",
                    "reasoning_eligible": False,
                },
            ],
            "medium": [
                {
                    "stem": "Marked discharge, no pain, no photophobia, normal vision "
                            "and a normal pupil. What is the diagnosis?",
                    "options": ["Conjunctivitis", "Iritis",
                                "Acute glaucoma", "Keratitis"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Marked discharge with no pain, normal vision and a "
                                   "normal pupil is conjunctivitis.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Marked pain, photophobia, reduced vision and a small pupil. "
                            "What is the diagnosis?",
                    "options": ["Iritis (anterior uveitis)", "Conjunctivitis",
                                "Subconjunctival haemorrhage", "Dry eye"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Pain, photophobia, reduced vision and a small pupil "
                                   "point to iritis (anterior uveitis).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Severe pain, reduced vision and a large, fixed, oval pupil. "
                            "What is the diagnosis?",
                    "options": ["Acute (angle-closure) glaucoma", "Conjunctivitis",
                                "Iritis", "Allergic eye disease"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Severe pain, reduced vision and a large, fixed, oval "
                                   "pupil are classic for acute angle-closure glaucoma.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "How does the pupil separate iritis from acute glaucoma?",
                    "options": [
                        "Iritis: small/normal pupil; acute glaucoma: large, oval, "
                        "fixed pupil",
                        "Both give a large fixed pupil",
                        "Iritis: large pupil; acute glaucoma: small pupil",
                        "The pupil is normal in both",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "The pupil is the key sign: small or normal in "
                                   "iritis, but large, oval and fixed in acute "
                                   "angle-closure glaucoma.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why is reduced visual acuity an important red flag in a "
                            "red eye?",
                    "options": [
                        "It suggests corneal or intraocular involvement, not simple "
                        "conjunctivitis",
                        "It always means the patient needs new glasses",
                        "It is normal in all red eyes",
                        "It rules out anything serious",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Conjunctivitis leaves vision normal. Reduced vision "
                                   "in a red eye points to the cornea or inside of the "
                                   "eye (keratitis, iritis, glaucoma) and needs review.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "A contact-lens wearer has a painful red eye with reduced "
                            "vision. What must you suspect?",
                    "options": [
                        "Microbial (infective) keratitis",
                        "Simple allergy",
                        "Presbyopia",
                        "A normal lens-wear sensation",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A painful red eye with reduced vision in a lens "
                                   "wearer must be treated as possible microbial "
                                   "keratitis — a sight-threatening infection.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL red-eye features that should prompt urgent "
                            "escalation rather than routine care.",
                    "options": [
                        "Reduced visual acuity",
                        "Severe pain with nausea",
                        "A fixed, mid-dilated pupil",
                        "Mild itch with watery discharge",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Reduced vision, severe pain with nausea, and a "
                                   "fixed dilated pupil are red flags. Mild itch with "
                                   "watery discharge suggests benign conjunctivitis.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Which red-eye condition is usually the LEAST urgent?",
                    "options": ["Conjunctivitis",
                                "Acute glaucoma",
                                "Keratitis with reduced vision",
                                "Iritis"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Simple conjunctivitis (normal vision, no severe "
                                   "pain) is the least urgent; the others can threaten "
                                   "sight.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Itchy, watery, bilateral red eyes in someone with hay "
                            "fever most suggest what?",
                    "options": ["Allergic conjunctivitis",
                                "Acute glaucoma",
                                "Keratitis",
                                "Iritis"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Itch, watering and both eyes affected in an "
                                   "atopic patient point to allergic conjunctivitis.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why does a hazy cornea in a red eye raise concern?",
                    "options": [
                        "It suggests corneal oedema from high pressure or "
                        "significant disease",
                        "It is a normal finding in conjunctivitis",
                        "It proves the cause is allergy",
                        "It means the eye is simply dry",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "A hazy (cloudy) cornea suggests corneal oedema, "
                                   "often from raised pressure (acute glaucoma) or "
                                   "serious corneal disease — not simple conjunctivitis.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A red eye with marked pain and a branching ('dendritic') "
                            "corneal pattern on staining suggests what?",
                    "options": ["Herpes simplex keratitis",
                                "Allergic conjunctivitis",
                                "Subconjunctival haemorrhage",
                                "Presbyopia"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A painful red eye with a branching (dendritic) "
                                   "corneal ulcer on fluorescein staining is typical of "
                                   "herpes simplex keratitis — flag for the doctor.",
                    "reasoning_eligible": False,
                },
            ],
            "hard": [
                {
                    "stem": "A patient has a painful red eye, severe headache, nausea, a "
                            "hazy cornea and a fixed mid-dilated pupil. What is the "
                            "diagnosis and the priority action?",
                    "options": [
                        "Acute angle-closure glaucoma — escalate immediately",
                        "Conjunctivitis — give antibiotic drops",
                        "Dry eye — advise lubricants",
                        "Allergy — give antihistamine",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "This cluster is classic for acute angle-closure "
                                   "glaucoma, a sight-threatening emergency that must "
                                   "be escalated immediately.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Match the pupil to the diagnosis: which option is correct?",
                    "options": [
                        "Small pupil → iritis; large fixed pupil → acute glaucoma; "
                        "normal pupil → conjunctivitis",
                        "Large pupil → iritis; small pupil → acute glaucoma",
                        "All three give a fixed dilated pupil",
                        "Pupil size is unrelated to the diagnosis",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Iritis → small pupil; acute angle-closure glaucoma "
                                   "→ large, fixed pupil; conjunctivitis → normal "
                                   "pupil. The pupil is a powerful triage clue.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL features that argue AGAINST simple "
                            "conjunctivitis in a red eye.",
                    "options": [
                        "Reduced visual acuity",
                        "Marked photophobia",
                        "Severe pain",
                        "Watery discharge with normal vision",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Reduced vision, marked photophobia and severe pain "
                                   "all point away from conjunctivitis toward keratitis, "
                                   "iritis or glaucoma. Watery discharge with normal "
                                   "vision fits conjunctivitis.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why must a painful red eye with reduced vision in a "
                            "contact-lens wearer never be dismissed as 'just irritation'?",
                    "options": [
                        "It may be microbial keratitis, which can scar the cornea and "
                        "destroy vision quickly",
                        "Lens wearers never get infections",
                        "Irritation always reduces vision harmlessly",
                        "It is only a cosmetic issue",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Contact-lens wearers are at high risk of microbial "
                                   "keratitis, which can rapidly scar the cornea and "
                                   "cause permanent vision loss — it must be escalated.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Rank these red eyes from most to least urgent.",
                    "options": [
                        "Acute glaucoma > microbial keratitis > iritis > "
                        "conjunctivitis",
                        "Conjunctivitis > iritis > keratitis > acute glaucoma",
                        "Iritis > conjunctivitis > acute glaucoma > keratitis",
                        "Subconjunctival haemorrhage > acute glaucoma > keratitis > "
                        "iritis",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Acute glaucoma and microbial keratitis are the most "
                                   "sight-threatening, then iritis; simple "
                                   "conjunctivitis is the least urgent.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A patient says one red eye is painful with watering but "
                            "denies discharge, and bright light hurts the SAME eye even "
                            "when shone in the other eye. What does this 'consensual "
                            "photophobia' suggest?",
                    "options": [
                        "Iritis (anterior uveitis)",
                        "Allergic conjunctivitis",
                        "Subconjunctival haemorrhage",
                        "Dry eye",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Pain in the affected eye when light is shone in the "
                                   "OTHER eye (consensual photophobia) is a classic sign "
                                   "of iritis.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Which combination best fits keratitis rather than iritis?",
                    "options": [
                        "Marked pain with a corneal lesion that stains, vision varies "
                        "with lesion site",
                        "Painless eye with marked discharge",
                        "Large fixed pupil with nausea",
                        "Bilateral itch with watering",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Keratitis features marked pain with a stainable "
                                   "corneal lesion, and vision that varies with the "
                                   "lesion site. Iritis is defined more by photophobia "
                                   "and a small pupil without a corneal ulcer.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL of the following that are typically PAINLESS "
                            "red eyes.",
                    "options": [
                        "Subconjunctival haemorrhage",
                        "Simple (viral) conjunctivitis",
                        "Acute angle-closure glaucoma",
                        "Microbial keratitis",
                    ],
                    "correct": [0, 1],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "Subconjunctival haemorrhage and viral conjunctivitis "
                                   "are usually painless (at most gritty). Acute "
                                   "glaucoma and keratitis are markedly painful.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why is it unsafe to give steroid drops to a red, painful "
                            "eye without a doctor's assessment?",
                    "options": [
                        "If the cause is herpes simplex keratitis, steroids can make "
                        "it dramatically worse",
                        "Steroids always cure red eyes instantly",
                        "Steroids have no effect on the eye",
                        "Steroids only help allergic eyes and nothing else",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Steroids can worsen an undiagnosed herpes simplex "
                                   "keratitis and raise eye pressure. A red painful eye "
                                   "needs a doctor's assessment before steroids.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "An elderly patient on warfarin has a large, painless, "
                            "bright-red patch on the white of the eye with normal "
                            "vision. What is the most appropriate response?",
                    "options": [
                        "Reassure — likely a subconjunctival haemorrhage; check BP and "
                        "note the anticoagulant",
                        "Treat as acute glaucoma and escalate immediately",
                        "Start antibiotic drops urgently",
                        "Patch the eye and send home with no follow-up",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A painless bright-red patch with normal vision is a "
                                   "subconjunctival haemorrhage — usually benign. In an "
                                   "anticoagulated patient it is worth checking blood "
                                   "pressure and noting the medication.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Which single feature most reliably separates a "
                            "sight-threatening red eye from a benign one?",
                    "options": [
                        "Whether visual acuity is reduced",
                        "Whether the eye waters",
                        "Whether the redness is bright or dull",
                        "Whether the patient is male or female",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Reduced visual acuity is the single most useful red "
                                   "flag — benign red eyes (conjunctivitis, "
                                   "subconjunctival haemorrhage) keep normal vision.",
                    "reasoning_eligible": True,
                },
            ],
        },
    },
    "OT": {
        "oct_macula": {
            "easy": [
                {
                    "stem": "What does a macular OCT image?",
                    "options": [
                        "A cross-sectional scan of the macula (central retina)",
                        "The optic disc and RNFL",
                        "The anterior chamber angle",
                        "The corneal endothelium",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Macular OCT produces a cross-sectional scan of "
                                   "the macula (the central retina).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Is OCT a contact or non-contact test?",
                    "options": [
                        "Contact — requires corneal applanation",
                        "Non-contact — it is a light-based scan",
                        "Contact — uses an ultrasound probe",
                        "Semi-contact — uses a coupling gel",
                    ],
                    "correct": [1],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "OCT is non-contact — it uses light (optical "
                                   "coherence) to image the retina.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Which condition is commonly monitored with "
                            "macular OCT?",
                    "options": [
                        "Diabetic macular oedema",
                        "Keratoconus",
                        "Strabismus",
                        "Blepharitis",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Macular OCT is used to monitor diabetic macular "
                                   "oedema (also age-related macular degeneration).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What indicates a good-quality macular OCT scan?",
                    "options": [
                        "Adequate signal strength and correct centration on the "
                        "fovea",
                        "Dilation is not required",
                        "The scan takes less than 1 second",
                        "The patient keeps both eyes open",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A good-quality macular OCT requires adequate "
                                   "signal strength and correct centration on the "
                                   "fovea.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What OCT finding suggests macular oedema?",
                    "options": [
                        "Increased macular thickness with intraretinal fluid",
                        "Decreased RNFL thickness",
                        "Normal foveal contour",
                        "Thin choroid",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Increased macular thickness with intraretinal "
                                   "fluid on OCT is the hallmark of macular oedema.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why is macular OCT important in AMD management?",
                    "options": [
                        "It detects and monitors subretinal or intraretinal "
                        "fluid indicating disease activity",
                        "It measures intraocular pressure",
                        "It replaces the need for fundus examination",
                        "It determines the patient's visual acuity",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "In AMD, macular OCT detects fluid (subretinal or "
                                   "intraretinal) that indicates active disease "
                                   "requiring treatment.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "OCT uses which type of energy to create images?",
                    "options": [
                        "Light (near-infrared)",
                        "Ultrasound",
                        "X-rays",
                        "Radio waves (MRI)",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "OCT uses near-infrared light to create "
                                   "cross-sectional images of the retina.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What must the scan be centred on for a macular OCT?",
                    "options": [
                        "The fovea",
                        "The optic disc",
                        "The limbus",
                        "The pupil",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A macular OCT must be centred on the fovea to "
                                   "accurately measure central retinal thickness.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why is a baseline macular OCT saved?",
                    "options": [
                        "For serial comparison to monitor disease and treatment "
                        "response",
                        "To calculate IOL power",
                        "To replace the visual field test",
                        "It is only needed once and never repeated",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A baseline scan is saved for serial comparison "
                                   "to monitor disease progression and response "
                                   "to treatment.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Which of the following are monitored with macular OCT?",
                    "options": [
                        "Diabetic macular oedema",
                        "Age-related macular degeneration",
                        "Keratoconus",
                        "Strabismus",
                    ],
                    "correct": [0, 1],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "Both diabetic macular oedema and AMD are "
                                   "monitored with macular OCT. Keratoconus is a "
                                   "corneal condition (topography); strabismus is "
                                   "an alignment issue (orthoptics).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Does macular OCT require pupil dilation?",
                    "options": [
                        "Often yes — dilation improves signal quality",
                        "Never — it always works through an undilated pupil",
                        "Only for patients under 40",
                        "Only if the patient has glaucoma",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Dilation is often performed before macular OCT "
                                   "to improve signal quality, especially with "
                                   "small pupils or media opacity.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What does 'OCT' stand for?",
                    "options": [
                        "Optical Coherence Tomography",
                        "Optic Canal Test",
                        "Ocular Corneal Topography",
                        "Ophthalmic Computed Tomography",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "OCT stands for Optical Coherence Tomography.",
                    "reasoning_eligible": False,
                },
            ],
            "medium": [
                {
                    "stem": "A diabetic has blurred central vision. What macular "
                            "OCT finding fits macular oedema?",
                    "options": [
                        "Increased central retinal thickness with intraretinal "
                        "(cystoid) fluid",
                        "Normal retinal thickness with no fluid",
                        "Thinning of the RNFL",
                        "Corneal oedema on ASOCT",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Diabetic macular oedema shows increased central "
                                   "retinal thickness with intraretinal (cystoid) "
                                   "fluid on macular OCT.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why might OCT signal strength be low in a cataract "
                            "patient?",
                    "options": [
                        "The cloudy lens (media opacity) reduces the light signal "
                        "reaching the retina",
                        "The pupil is too large",
                        "The patient is too young",
                        "OCT does not work through any lens",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "A cataract is a media opacity that blocks some "
                                   "of the OCT light signal, reducing signal "
                                   "strength and image quality.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "How can you improve a poor macular OCT caused by "
                            "dry eye?",
                    "options": [
                        "Ask the patient to blink or instil a lubricant, "
                        "then re-acquire",
                        "Increase the scan speed",
                        "Switch to ultrasound biometry",
                        "Dilate the pupil further",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Dry eye disrupts the tear film, scattering the "
                                   "OCT light. A blink or lubricant drop refreshes "
                                   "the tear film and improves signal quality.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "In wet AMD follow-up, what does persistent fluid on "
                            "OCT suggest?",
                    "options": [
                        "Ongoing disease activity that may need continued "
                        "treatment",
                        "The disease is cured",
                        "The OCT machine is miscalibrated",
                        "The patient needs cataract surgery",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Persistent subretinal or intraretinal fluid on "
                                   "OCT in wet AMD indicates ongoing disease "
                                   "activity that may need continued anti-VEGF "
                                   "treatment (the doctor decides).",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "What is the main difference between macular OCT and "
                            "RNFL OCT?",
                    "options": [
                        "Macular OCT images the central retina (macula); RNFL "
                        "OCT measures nerve fibre thickness around the optic "
                        "disc",
                        "There is no difference",
                        "RNFL OCT uses ultrasound; macular OCT uses light",
                        "Macular OCT measures IOP; RNFL OCT does not",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Macular OCT images the macula (central retina) "
                                   "for conditions like DME and AMD. RNFL OCT "
                                   "measures nerve fibre layer thickness around "
                                   "the optic disc for glaucoma monitoring.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A patient's macular OCT shows new subretinal fluid "
                            "compared to the baseline. What should the OT do?",
                    "options": [
                        "Flag the change and ensure the doctor reviews the "
                        "comparison",
                        "Repeat the scan next month",
                        "Ignore it — small changes are normal",
                        "Start anti-VEGF treatment",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "New subretinal fluid is a significant finding "
                                   "(possible disease progression). The OT should "
                                   "flag it for doctor review — treatment decisions "
                                   "are the doctor's responsibility.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL factors that can reduce OCT signal quality.",
                    "options": [
                        "Cataract (media opacity)",
                        "Dry eye (disrupted tear film)",
                        "Patient's age over 40",
                        "Using the wrong scan protocol",
                    ],
                    "correct": [0, 1],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Cataract blocks light and dry eye scatters it — "
                                   "both reduce OCT signal quality. Age alone does "
                                   "not reduce signal; using the wrong protocol is a "
                                   "procedural error, not a signal quality issue.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why is serial comparison of macular OCT scans "
                            "important?",
                    "options": [
                        "To detect changes in retinal thickness or fluid that "
                        "indicate disease progression or treatment response",
                        "To confirm the patient's identity",
                        "To determine the patient's refractive error",
                        "To replace the need for visual acuity testing",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Serial comparison tracks changes in retinal "
                                   "thickness and fluid over time, helping the "
                                   "doctor assess disease activity and treatment "
                                   "response.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What artifact can result from poor fixation during "
                            "a macular OCT scan?",
                    "options": [
                        "Motion artifact causing misalignment of retinal layers",
                        "A false increase in IOP reading",
                        "Corneal oedema artifact",
                        "Pupil dilation artifact",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Poor fixation causes motion artifact, which "
                                   "misaligns retinal layers and can make the "
                                   "scan unreliable.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What should you do if the OCT signal strength is "
                            "unacceptably low?",
                    "options": [
                        "Try to improve conditions (blink, lubricant, reposition) "
                        "and re-acquire; if still poor, document and flag",
                        "Accept the scan as-is",
                        "Switch to a visual field test instead",
                        "Cancel the test and reschedule",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "First try to improve the scan (blink, lubricant, "
                                   "reposition). If still unacceptable, document the "
                                   "low quality and flag it for the doctor.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Which retinal layer is most relevant to assess in "
                            "diabetic macular oedema on OCT?",
                    "options": [
                        "The central macular region (foveal thickness)",
                        "The retinal nerve fibre layer (peripapillary)",
                        "The corneal epithelium",
                        "The choroidal vasculature only",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "In diabetic macular oedema, central macular "
                                   "(foveal) thickness and intraretinal cystoid "
                                   "spaces are the key findings on OCT.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A patient with wet AMD has been receiving anti-VEGF "
                            "injections. Their latest OCT shows resolution of "
                            "subretinal fluid. What does this suggest?",
                    "options": [
                        "The treatment is working — the disease is responding",
                        "The patient no longer has AMD",
                        "The OCT machine is malfunctioning",
                        "The patient should stop all treatment",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Resolution of subretinal fluid on OCT indicates "
                                   "a positive treatment response. However, the "
                                   "doctor decides whether to continue, extend, "
                                   "or stop treatment.",
                    "reasoning_eligible": True,
                },
            ],
            "hard": [
                {
                    "stem": "A diabetic patient's macular OCT shows cystoid spaces "
                            "and increased central thickness compared to the "
                            "previous scan. What does this indicate and what "
                            "should the OT do?",
                    "options": [
                        "Worsening macular oedema — flag for urgent doctor "
                        "review",
                        "Normal diabetic changes — no action needed",
                        "The scan is unreliable — repeat next visit",
                        "Improvement — the treatment is working",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Increased cystoid spaces and central thickness "
                                   "compared to baseline indicate worsening diabetic "
                                   "macular oedema. The OT should flag for urgent "
                                   "doctor review.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL steps the OT should take when acquiring a "
                            "macular OCT on a patient with a dense cataract.",
                    "options": [
                        "Ensure the pupil is adequately dilated",
                        "Optimise alignment and re-acquire if signal is low",
                        "Refuse to scan — OCT never works through a cataract",
                        "Document the low signal quality if it persists",
                    ],
                    "correct": [0, 1, 3],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "With a dense cataract, the OT should dilate, "
                                   "optimise alignment, and re-acquire. If signal "
                                   "remains low, document it. OCT can still provide "
                                   "useful information even with reduced signal.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why does a disrupted tear film degrade OCT image "
                            "quality?",
                    "options": [
                        "An irregular tear film scatters the OCT light beam, "
                        "reducing the signal reaching the retina",
                        "Tears absorb all infrared light",
                        "The tear film blocks pupil dilation",
                        "Dry eye causes the retina to thin artificially",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "The OCT beam passes through the tear film. An "
                                   "irregular or dry tear film scatters the light, "
                                   "reducing signal strength and image quality. "
                                   "A blink or lubricant can restore it.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "In a patient with wet AMD, the OCT shows new "
                            "subretinal fluid after a period of stability. "
                            "What is the clinical significance?",
                    "options": [
                        "Disease reactivation — the doctor may resume or "
                        "intensify anti-VEGF treatment",
                        "The fluid is normal and expected",
                        "The patient should switch to glaucoma treatment",
                        "The scan was taken at the wrong angle",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "New subretinal fluid after a stable period "
                                   "indicates disease reactivation in wet AMD. "
                                   "The doctor may resume or intensify anti-VEGF "
                                   "treatment. The OT flags the change.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "What is the difference between intraretinal and "
                            "subretinal fluid on OCT?",
                    "options": [
                        "Intraretinal fluid is within the retinal layers "
                        "(cystoid spaces); subretinal fluid is between the "
                        "retina and RPE",
                        "They are the same thing",
                        "Intraretinal fluid is in the vitreous; subretinal "
                        "fluid is in the cornea",
                        "Subretinal fluid is always an artifact",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Intraretinal fluid appears as cystoid spaces "
                                   "within the retinal layers. Subretinal fluid "
                                   "collects between the neurosensory retina and "
                                   "the retinal pigment epithelium (RPE). Both "
                                   "indicate disease activity.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A macular OCT scan appears decentred — the foveal "
                            "dip is not in the centre of the scan. What should "
                            "the OT do?",
                    "options": [
                        "Re-acquire with correct centration on the fovea",
                        "Accept it — decentration does not affect results",
                        "Switch to RNFL OCT instead",
                        "Report the machine as broken",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A decentred macular OCT gives inaccurate "
                                   "thickness measurements. The OT should "
                                   "re-acquire with the fovea properly centred.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL quality checks the OT should perform "
                            "before saving a macular OCT scan.",
                    "options": [
                        "Adequate signal strength",
                        "Correct centration on the fovea",
                        "Absence of motion artifact",
                        "Patient's blood pressure is normal",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Before saving, the OT checks signal strength, "
                                   "foveal centration, and absence of motion "
                                   "artifact. Blood pressure is a systemic measure, "
                                   "not an OCT quality check.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "How does macular OCT complement fundus photography "
                            "in AMD monitoring?",
                    "options": [
                        "OCT shows cross-sectional retinal structure and fluid; "
                        "fundus photography shows the surface appearance",
                        "They measure the same thing",
                        "Fundus photography replaces OCT entirely",
                        "OCT measures IOP while photography does not",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "OCT provides cross-sectional detail (fluid, "
                                   "thickness, layer disruption) while fundus "
                                   "photography shows the surface appearance "
                                   "(drusen, haemorrhage). Together they give a "
                                   "more complete picture.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A patient's OCT signal is low due to a small, "
                            "undilated pupil. What is the best corrective action?",
                    "options": [
                        "Dilate the pupil to improve signal quality",
                        "Increase the room lighting",
                        "Ask the patient to remove their glasses",
                        "Use A-scan ultrasound instead",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A small undilated pupil limits the light entering "
                                   "the eye. Dilation widens the pupil and improves "
                                   "OCT signal quality.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why is it critical to compare the current macular OCT "
                            "to the baseline scan rather than just reading it in "
                            "isolation?",
                    "options": [
                        "A single scan cannot distinguish stable disease from "
                        "progression — comparison reveals change over time",
                        "The baseline scan calibrates the machine",
                        "Single scans are always unreliable",
                        "Comparison is only needed for glaucoma, not AMD or DME",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "A single scan shows the current state but cannot "
                                   "determine whether the disease is stable, "
                                   "improving, or worsening. Serial comparison "
                                   "reveals change and guides treatment decisions.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "What does the term 'cystoid macular oedema' describe "
                            "on OCT?",
                    "options": [
                        "Fluid-filled cyst-like spaces within the retinal layers "
                        "at the macula",
                        "A cyst on the corneal surface",
                        "A tumour in the vitreous cavity",
                        "Fluid in the anterior chamber",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Cystoid macular oedema appears as fluid-filled "
                                   "cyst-like (cystoid) spaces within the retinal "
                                   "layers at the macula on OCT.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A patient with treated diabetic macular oedema shows "
                            "stable central thickness and no new fluid on the "
                            "latest OCT. What does this indicate?",
                    "options": [
                        "Stable disease — the current treatment plan is effective",
                        "The patient is cured and needs no further monitoring",
                        "The OCT is unreliable",
                        "The disease has definitely progressed",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Stable central thickness and no new fluid "
                                   "suggest the current treatment is controlling "
                                   "the disease. The doctor decides whether to "
                                   "continue or modify the plan; ongoing monitoring "
                                   "is still needed.",
                    "reasoning_eligible": False,
                },
            ],
        },
    },
}


# ── Serving helpers ──────────────────────────────────────────────────────────

_PASSTHROUGH = ("stem", "options", "correct", "qtype", "kind",
                "explanation")


def _tag(topic_key: str, difficulty: str, card: dict) -> dict:
    out = {k: card[k] for k in _PASSTHROUGH if k in card}
    out["reasoning_eligible"] = bool(card.get("reasoning_eligible", False))
    out["topic_tag"] = topic_key
    out["difficulty"] = difficulty
    return out


def get_set_cards(role: str, topic_key: str, difficulty: str) -> list[dict]:
    """Cards for one (topic, difficulty) set, tagged for serving."""
    pool = FLASHCARDS.get(pool_for_role(role), {})
    cards = pool.get(topic_key, {}).get(difficulty, [])
    return [_tag(topic_key, difficulty, c) for c in cards]


def get_all_cards(role: str) -> list[dict]:
    """Every authored card for a role's pool (used by the no-arg rotation)."""
    pool = FLASHCARDS.get(pool_for_role(role), {})
    out: list[dict] = []
    for topic_key, _ in topics_for(role):
        by_diff = pool.get(topic_key, {})
        for difficulty in DIFFICULTIES:
            for c in by_diff.get(difficulty, []):
                out.append(_tag(topic_key, difficulty, c))
    return out


def set_card_counts(role: str) -> dict[str, int]:
    """{set_key: number of authored cards} for every set in the role's pool."""
    pool = FLASHCARDS.get(pool_for_role(role), {})
    counts: dict[str, int] = {}
    for topic_key, _ in topics_for(role):
        by_diff = pool.get(topic_key, {})
        for difficulty in DIFFICULTIES:
            counts[make_set_key(topic_key, difficulty)] = len(by_diff.get(difficulty, []))
    return counts


def card_by_stem(role: str) -> dict[str, dict]:
    """{stem: tagged card} index for the role pool — used to rehydrate MCQ fields
    onto SM-2 due cards (which the DB stores only as front/back)."""
    return {c["stem"]: c for c in get_all_cards(role)}


def mark_typed_cards(deck: list[dict], n: int) -> list[dict]:
    """Set requires_explanation=True on ~round(n/5) of the eligible cards in `deck`,
    spread across the deck. Mutates in place and returns the deck."""
    from tools.flashcards.flashcard_sets import typed_count
    want = typed_count(n)
    for c in deck:
        c["requires_explanation"] = False
    eligible = [i for i, c in enumerate(deck) if c.get("reasoning_eligible")]
    if not eligible or want <= 0:
        return deck
    take = min(want, len(eligible))
    # spread the picks evenly across the eligible indices
    step = len(eligible) / take
    chosen = {eligible[int(k * step)] for k in range(take)}
    for i in chosen:
        deck[i]["requires_explanation"] = True
    return deck

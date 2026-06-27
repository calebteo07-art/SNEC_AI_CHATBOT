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
        "history_taking": {
            "easy": [
                {
                    "stem": "Which systemic condition is especially important to ask "
                            "about in an eye history?",
                    "options": ["Diabetes", "Presbyopia",
                                "Colour blindness", "A common cold"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Diabetes (like hypertension) is a vascular disease "
                                   "that affects the eyes, so it is a key part of the "
                                   "history.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Which medication group must you specifically ask about "
                            "because it raises bleeding risk?",
                    "options": ["Anticoagulants", "Lubricant eye drops",
                                "Vitamin C", "Paracetamol"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Anticoagulants (blood thinners) increase bleeding "
                                   "risk during procedures or after trauma, so they "
                                   "must be asked about.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "For a visual complaint, which question is most important "
                            "to ask?",
                    "options": ["Was the change sudden or gradual?",
                                "What colour are your eyes?",
                                "Do you wear sunglasses?",
                                "How tall are you?"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Whether vision changed suddenly or gradually is a "
                                   "key question — sudden change is more likely to be "
                                   "urgent.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What scale is used to assess a patient's pain?",
                    "options": ["A 0-10 pain scale", "The Snellen chart",
                                "The Ishihara chart", "The 6/6 scale"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Pain is assessed on a 0-10 scale, where 0 is no "
                                   "pain and 10 is the worst imaginable.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Which condition is worth asking about in the FAMILY "
                            "ocular history?",
                    "options": ["Glaucoma", "Conjunctivitis",
                                "A stye", "A black eye"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Glaucoma (and cataract, retinal detachment, squint) "
                                   "can run in families, so family history matters.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why ask whether a visual change is in one eye or both?",
                    "options": [
                        "It helps localise the cause and judge urgency",
                        "It decides which eye is tested first",
                        "It changes the consultation fee",
                        "It is not actually important",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Whether one or both eyes are affected (and whether "
                                   "the loss is partial or total) helps localise the "
                                   "problem and judge how urgent it is.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL medication groups you should specifically ask "
                            "about in an eye history.",
                    "options": ["Anticoagulants", "Steroids",
                                "Herbal supplements and vitamins", "Toothpaste"],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "Anticoagulants, steroids, and herbal "
                                   "supplements/vitamins (and anti-malarials) all "
                                   "matter in an eye history. Toothpaste does not.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Which TWO vascular systemic diseases most commonly affect "
                            "the eyes?",
                    "options": ["Diabetes and hypertension",
                                "Asthma and eczema",
                                "Gout and reflux",
                                "Migraine and sinusitis"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Diabetes and hypertension are the key vascular "
                                   "diseases that damage the eye's blood vessels.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why ask about recent overseas travel when a patient has "
                            "purulent (pus-like) discharge?",
                    "options": [
                        "It may point to an acquired infection or poor hygiene",
                        "Travel improves eye health",
                        "It decides the triage category automatically",
                        "It is asked only for billing",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Recent travel with purulent discharge may indicate "
                                   "an acquired infection or exposure to poor hygiene "
                                   "conditions.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A myopic patient reports new flashes and floaters. Why does "
                            "this matter?",
                    "options": [
                        "Myopia raises retinal detachment risk, so new flashes and "
                        "floaters need prompt review",
                        "Flashes and floaters are always harmless",
                        "Myopes never get retinal problems",
                        "It only matters if both eyes are affected",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Short-sighted (myopic) eyes have a higher risk of "
                                   "retinal detachment, so new flashes and floaters "
                                   "should be reviewed promptly.",
                    "reasoning_eligible": True,
                },
            ],
            "medium": [
                {
                    "stem": "Why is it important to ask about anticoagulants before a "
                            "procedure?",
                    "options": [
                        "They increase bleeding risk during the procedure or after "
                        "trauma",
                        "They make the pupil dilate",
                        "They improve healing",
                        "They change the refractive error",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Anticoagulants raise the risk of bleeding during "
                                   "procedures and after injury, so they must be known "
                                   "in advance.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Severe eye pain with nausea and vomiting noted in the "
                            "history should make you suspect what?",
                    "options": ["Acute angle-closure glaucoma",
                                "Simple conjunctivitis",
                                "Presbyopia",
                                "Dry eye"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Severe pain with nausea and vomiting is a classic "
                                   "history for acute angle-closure glaucoma.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A contact-lens wearer has a red eye. Select ALL history "
                            "points that raise infection risk.",
                    "options": [
                        "Wearing daily lenses for 2-3 days without removal (overwear)",
                        "Using an incorrect lens-care solution",
                        "Wearing prescription sunglasses",
                        "Reading in good light",
                    ],
                    "correct": [0, 1],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Lens overwear and incorrect lens-care solution both "
                                   "raise the risk of infection. Sunglasses and good "
                                   "reading light do not.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why ask about steroid use in an eye history?",
                    "options": [
                        "Long-term steroids can raise eye pressure and cause cataract",
                        "Steroids improve night vision",
                        "Steroids change eye colour",
                        "Steroids are irrelevant to the eye",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Steroids (drops, tablets or inhalers) can raise "
                                   "intraocular pressure and contribute to cataract, so "
                                   "their use is important to record.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why does asking 'sudden or gradual?' help in a vision "
                            "complaint?",
                    "options": [
                        "Sudden loss is more likely to be an emergency than gradual "
                        "loss",
                        "Gradual loss is always an emergency",
                        "The timing has no clinical meaning",
                        "It decides the eye drop dose",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Sudden vision loss (e.g. vascular occlusion, "
                                   "detachment) is more likely to be urgent; gradual "
                                   "loss (e.g. cataract) is usually less acute.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "A patient mentions a previous acute angle-closure attack. "
                            "Why is this history important before dilation?",
                    "options": [
                        "Dilating drops could trigger another angle-closure attack",
                        "It means the patient must always be dilated",
                        "It only matters for colour vision testing",
                        "It has no bearing on dilation",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A history of angle-closure is a caution against "
                                   "routine dilation, which could precipitate another "
                                   "attack — check with the nurse/doctor first.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why ask about anti-malarial medication in an eye history?",
                    "options": [
                        "Long-term use can affect the retina and needs monitoring",
                        "It changes the patient's refraction",
                        "It is asked only for travel records",
                        "It has no effect on the eye",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Some anti-malarials (e.g. hydroxychloroquine) can "
                                   "affect the retina with long-term use, so patients "
                                   "on them are monitored.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Which family-history conditions are most worth recording?",
                    "options": [
                        "Glaucoma, cataract and retinal detachment",
                        "Conjunctivitis and styes",
                        "Short-sightedness alone",
                        "Eye colour and lash length",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Glaucoma, cataract, retinal detachment (and "
                                   "dystrophies/squint) can be inherited, so they are "
                                   "the key family-history items.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why record current systemic medications even if the "
                            "patient came only for a routine eye check?",
                    "options": [
                        "Some drugs affect the eyes or interact with eye treatment",
                        "It is required for insurance only",
                        "Medications never affect the eyes",
                        "Only eye drops are relevant",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Systemic drugs can affect the eyes (e.g. steroids, "
                                   "anti-malarials) or interact with planned eye "
                                   "treatment, so a full medication list is recorded.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A patient reports vision 'like a curtain coming down' in "
                            "one eye. What history detail is most relevant?",
                    "options": [
                        "Whether they are short-sighted or have had retinal problems",
                        "Their favourite colour",
                        "Whether they prefer reading or TV",
                        "How many pillows they use",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A 'curtain' over the vision suggests retinal "
                                   "detachment; myopia and previous retinal problems "
                                   "raise that risk, so they are the key history "
                                   "points.",
                    "reasoning_eligible": True,
                },
            ],
            "hard": [
                {
                    "stem": "A 60-year-old diabetic on warfarin reports gradual vision "
                            "blurring. Which TWO history facts most change your level "
                            "of concern, and why?",
                    "options": [
                        "Diabetes (retinopathy risk) and warfarin (bleeding risk)",
                        "Their height and weight",
                        "Their favourite hobby",
                        "The colour of their glasses frames",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Diabetes raises the risk of retinopathy/macular "
                                   "oedema, and warfarin raises bleeding risk — both "
                                   "shape how the case is assessed and escalated.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL history features that should raise your "
                            "suspicion of a sight-threatening problem.",
                    "options": [
                        "Sudden loss of vision",
                        "New flashes and floaters in a myope",
                        "Severe pain with nausea",
                        "Mild eye strain after long reading",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Sudden vision loss, new flashes/floaters in a "
                                   "myope, and severe pain with nausea are red flags. "
                                   "Mild eye strain after reading is usually benign.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why is a thorough drug history (including herbal "
                            "supplements) sometimes more revealing than the patient's "
                            "stated complaint?",
                    "options": [
                        "Drugs and supplements can cause or worsen eye problems the "
                        "patient hasn't linked to them",
                        "Patients always know exactly what is wrong",
                        "Supplements are never relevant",
                        "It saves time to skip the complaint",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Medications and supplements can cause ocular "
                                   "effects the patient hasn't connected to their "
                                   "symptoms, so a careful drug history can uncover the "
                                   "real cause.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "A contact-lens wearer with a painful red eye admits to "
                            "swimming in lenses and topping up old solution. Why is "
                            "this history alarming?",
                    "options": [
                        "These habits strongly raise the risk of microbial keratitis",
                        "Swimming improves lens hygiene",
                        "Topping up solution sterilises the lens",
                        "These habits are completely safe",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Swimming in lenses and reusing/topping up solution "
                                   "are classic risk factors for serious microbial "
                                   "keratitis — this history demands prompt escalation.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why should you ask BOTH 'one eye or both?' AND 'partial "
                            "or total?' for a vision complaint?",
                    "options": [
                        "Together they help localise the problem and gauge severity",
                        "They are the same question asked twice",
                        "Only one of them ever matters",
                        "They are asked only for the record, not for clinical use",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Laterality (one vs both eyes) and extent (partial "
                                   "vs total) together narrow down where the problem is "
                                   "and how serious it is.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "An elderly patient is vague about their medications. What "
                            "is the safest practical approach?",
                    "options": [
                        "Ask them to bring their medication list/packets and confirm "
                        "with records",
                        "Guess based on their age",
                        "Skip the drug history to save time",
                        "Record 'nil medications' by default",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "When a patient is unsure, the safest approach is to "
                                   "verify — ask for their medication list or packets "
                                   "and check the records rather than guessing.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Which statement about taking an eye history is correct?",
                    "options": [
                        "Systemic disease, medications, family history and the "
                        "symptom timeline all matter",
                        "Only the presenting eye symptom matters",
                        "Family history is never relevant",
                        "Medications are irrelevant unless they are eye drops",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "A good eye history covers systemic disease, all "
                                   "medications, family history and the timeline of "
                                   "symptoms — not just the eye complaint.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A patient reports painless, sudden, total loss of vision "
                            "in one eye an hour ago. Why does the history alone justify "
                            "urgent escalation?",
                    "options": [
                        "Sudden painless monocular loss can be a vascular emergency "
                        "(e.g. CRAO) where time is critical",
                        "Painless problems are never urgent",
                        "One-hour-old symptoms are too late to matter",
                        "It is only urgent if the patient has pain",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Sudden, painless, total loss of vision in one eye "
                                   "suggests a vascular emergency such as CRAO — the "
                                   "history alone warrants urgent escalation.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL reasons to specifically ask a woman of "
                            "child-bearing age about pregnancy before eye treatment.",
                    "options": [
                        "Some eye drops and medications are unsafe in pregnancy",
                        "Dilating/other drugs may need to be avoided or changed",
                        "It changes her eye colour",
                        "It determines which eye is tested first",
                    ],
                    "correct": [0, 1],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "Pregnancy can affect which drops and medications "
                                   "are safe to use, so it is asked before treatment. "
                                   "It has nothing to do with eye colour or test order.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why is the symptom TIMELINE (onset, duration, progression) "
                            "central to an eye history?",
                    "options": [
                        "It distinguishes acute emergencies from chronic, stable "
                        "problems",
                        "It is only used for appointment scheduling",
                        "It replaces the need for examination",
                        "It has no diagnostic value",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "How and when symptoms started and changed helps "
                                   "separate urgent acute problems from slow chronic "
                                   "ones, guiding the level of response.",
                    "reasoning_eligible": True,
                },
            ],
        },
        "distance_va": {
            "easy": [
                {
                    "stem": "What is normal distance visual acuity on the Snellen scale?",
                    "options": ["6/6", "6/60", "6/12", "3/6"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "6/6 is normal distance vision on the Snellen scale.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "By convention, which eye is tested first?",
                    "options": ["The right eye", "The left eye",
                                "Whichever is worse", "Both together"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "By convention the right eye is tested first, then "
                                   "the left.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "At what visual acuity should you apply the pinhole?",
                    "options": ["When VA is 6/12 or worse",
                                "Only when VA is 6/6",
                                "Never during a VA test",
                                "Only for near vision"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "The pinhole is used when distance VA is reduced "
                                   "(6/12 or worse) to check for a refractive cause.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "In the fraction 6/18, what does the top number (6) mean?",
                    "options": ["The testing distance in metres",
                                "The number of letters read",
                                "The patient's age",
                                "The line number on the chart"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "The top number is the testing distance (6 metres); "
                                   "the bottom number is the distance at which a normal "
                                   "eye reads that line.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Which chart is used for patients who cannot read letters?",
                    "options": ["The tumbling E chart",
                                "The Ishihara chart",
                                "The Amsler grid",
                                "The Goldmann chart"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "The tumbling E chart lets patients who cannot read "
                                   "letters indicate the direction the E points.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What does 'CF' mean in a visual acuity record?",
                    "options": ["Count Fingers", "Clear Focus",
                                "Central Field", "Colour Found"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "CF means Count Fingers — used when the patient "
                                   "cannot read the lowest chart line.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL of these that are low-vision acuity levels "
                            "below chart letters.",
                    "options": ["Count Fingers (CF)", "Hand Movement (HM)",
                                "Perception of Light (PL)", "6/6"],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "CF, HM and PL are the low-vision levels used when "
                                   "the patient cannot read chart letters. 6/6 is "
                                   "normal vision.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What does 'NPL' stand for in a VA record?",
                    "options": ["No Perception of Light",
                                "Near Print Level",
                                "Normal Pupil Light",
                                "New Patient Letter"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "NPL means No Perception of Light — the lowest "
                                   "possible acuity, indicating the eye cannot detect "
                                   "any light.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Vision improves with the pinhole. What does this suggest?",
                    "options": ["A refractive cause (likely correctable with glasses)",
                                "A retinal detachment",
                                "Optic nerve disease",
                                "A dense cataract"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "If the pinhole improves vision, the cause is likely "
                                   "refractive — correctable with glasses.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Vision does NOT improve with the pinhole. What does this "
                            "suggest?",
                    "options": [
                        "A non-refractive cause such as media opacity or "
                        "retinal/optic nerve disease",
                        "Simple uncorrected long-sightedness",
                        "The patient needs reading glasses",
                        "Nothing — the test failed",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "No improvement with the pinhole points to a "
                                   "non-refractive cause — media opacity (e.g. "
                                   "cataract), retinal or optic nerve disease.",
                    "reasoning_eligible": False,
                },
            ],
            "medium": [
                {
                    "stem": "A patient cannot read any of the 6/60 line. What is the "
                            "next step?",
                    "options": [
                        "Move to 6/120; if still unable, test CF, then HM, PL, NPL",
                        "Record the vision as 6/6",
                        "Stop the test and reschedule",
                        "Switch straight to the near chart",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "If 6/60 cannot be read, try 6/120, then step down "
                                   "the low-vision scale: Count Fingers → Hand Movement "
                                   "→ Perception of Light → No Perception of Light.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Put the low-vision steps in the correct order (most to "
                            "least vision) after 6/120 cannot be read.",
                    "options": [
                        "Count Fingers → Hand Movement → Perception of Light → No "
                        "Perception of Light",
                        "No Perception of Light → Perception of Light → Hand Movement "
                        "→ Count Fingers",
                        "Hand Movement → Count Fingers → No Perception of Light → "
                        "Perception of Light",
                        "Perception of Light → Count Fingers → Hand Movement → No "
                        "Perception of Light",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "The descending order is CF → HM → PL → NPL, from "
                                   "most to least remaining vision.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A cataract patient's VA does not improve with the pinhole. "
                            "Why?",
                    "options": [
                        "The reduced vision is from media opacity (cloudy lens), not "
                        "refractive error",
                        "The pinhole was the wrong size",
                        "The patient simply needs stronger glasses",
                        "Cataracts always improve with a pinhole",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A cataract is a media opacity — the pinhole cannot "
                                   "overcome it, so vision does not improve.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "A patient's VA has dropped from 6/12 to 6/120 since the "
                            "last visit. What should you do?",
                    "options": [
                        "Highlight the significant drop to the doctor",
                        "Record it and book a routine review in a year",
                        "Repeat only if the patient complains",
                        "Ignore it — VA always fluctuates",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A large drop in VA between visits is significant "
                                   "and should be highlighted to the doctor.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why is the pinhole test useful when VA is reduced?",
                    "options": [
                        "It screens whether the cause is refractive or not",
                        "It gives the exact spectacle prescription",
                        "It measures the eye pressure",
                        "It replaces a full eye examination",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "The pinhole quickly screens whether reduced vision "
                                   "is from refractive error (improves) or another "
                                   "cause (no improvement). It is not a prescription.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A patient reads down to 6/9 but no further. How is this "
                            "recorded?",
                    "options": ["As 6/9 (the smallest line read)",
                                "As 6/6",
                                "As 6/60",
                                "As CF"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "VA is recorded as the smallest line the patient can "
                                   "read — here 6/9.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Which sequence correctly orders these from BEST to WORST "
                            "vision?",
                    "options": [
                        "6/6 → 6/12 → 6/60 → Count Fingers",
                        "Count Fingers → 6/60 → 6/12 → 6/6",
                        "6/60 → 6/6 → 6/12 → Count Fingers",
                        "6/12 → 6/6 → Count Fingers → 6/60",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "From best to worst: 6/6 (normal) → 6/12 → 6/60 → "
                                   "Count Fingers.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A myope forgot their glasses and reads 6/36, improving to "
                            "6/9 with the pinhole. What does this indicate?",
                    "options": [
                        "Uncorrected refractive error — glasses are likely to help",
                        "A cataract",
                        "Optic nerve disease",
                        "A retinal detachment",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Marked improvement with the pinhole indicates "
                                   "uncorrected refractive error; the patient's own "
                                   "glasses should restore the vision.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why should the room and chart lighting be standardised for "
                            "a VA test?",
                    "options": [
                        "Poor or uneven lighting can falsely change the recorded "
                        "acuity",
                        "Lighting has no effect on VA",
                        "Bright light always improves VA",
                        "It only matters for colour vision",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Inconsistent lighting can make the recorded VA "
                                   "unreliable, so chart illumination is standardised.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL correct statements about the Snellen fraction "
                            "6/18.",
                    "options": [
                        "The 6 is the testing distance in metres",
                        "It represents reduced vision (worse than 6/6)",
                        "A normal eye reads this line at 18 metres",
                        "It means the patient read 18 letters",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "In 6/18, 6 m is the testing distance, a normal eye "
                                   "reads that line at 18 m, and it is worse than 6/6. "
                                   "The numbers are not a letter count.",
                    "reasoning_eligible": False,
                },
            ],
            "hard": [
                {
                    "stem": "A patient reads 6/36, improving only to 6/24 with the "
                            "pinhole, and has a dense cataract. How do you interpret "
                            "this?",
                    "options": [
                        "Mainly a non-refractive (media) cause, perhaps with a small "
                        "refractive component",
                        "Purely refractive error",
                        "Normal vision",
                        "A failed test that must be repeated",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Only slight pinhole improvement with a dense "
                                   "cataract suggests the reduced vision is mainly from "
                                   "media opacity, with maybe a small refractive part.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why does the pinhole sharpen vision in uncorrected "
                            "refractive error?",
                    "options": [
                        "It blocks blurred peripheral rays so only central, focused "
                        "rays reach the retina",
                        "It magnifies the chart letters",
                        "It increases the light entering the eye",
                        "It corrects the retina directly",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "The pinhole admits only central light rays, "
                                   "removing the blur from out-of-focus peripheral "
                                   "rays — this sharpens the retinal image in "
                                   "refractive error.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Two patients both read 6/60. One improves to 6/9 with the "
                            "pinhole; the other shows no change. What does this tell "
                            "you?",
                    "options": [
                        "The first likely has a refractive cause; the second likely "
                        "has a media/retinal/nerve cause",
                        "Both have the same cause",
                        "Both need urgent surgery",
                        "Neither result is meaningful",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Pinhole improvement points to refractive error; no "
                                   "improvement points to a non-refractive cause "
                                   "(media opacity, retina or optic nerve).",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "A patient cannot see the chart at all. How do you test and "
                            "record their vision correctly?",
                    "options": [
                        "Test Count Fingers, then Hand Movement, then Perception of "
                        "Light, and record the best level achieved",
                        "Record NPL immediately without further testing",
                        "Record 6/60 as a default",
                        "Skip the eye and test the other one only",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Step through CF → HM → PL → NPL and record the best "
                                   "level the patient can manage — don't jump straight "
                                   "to NPL.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why must a significant unexplained VA drop be flagged even "
                            "if the pinhole improves it somewhat?",
                    "options": [
                        "Partial improvement doesn't exclude serious disease behind a "
                        "new refractive change",
                        "Any pinhole improvement always means it is harmless",
                        "VA drops never need flagging",
                        "Only total loss of vision matters",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "A new, large VA drop can still hide serious disease "
                                   "even if a pinhole helps a little, so it is flagged "
                                   "for the doctor rather than assumed to be glasses.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL situations where you would apply the pinhole.",
                    "options": [
                        "VA of 6/12",
                        "VA of 6/60",
                        "VA of Count Fingers due to suspected refractive error",
                        "VA of 6/6",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Apply the pinhole when VA is reduced (6/12 or "
                                   "worse), including very low vision if a refractive "
                                   "cause is suspected. A normal 6/6 needs no pinhole.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A patient's VA is 6/6 in each eye separately but they "
                            "complain of poor vision. What is a sensible next "
                            "consideration?",
                    "options": [
                        "Check near vision and ask about symptoms not captured by "
                        "distance VA",
                        "Record the complaint as invalid",
                        "Repeat distance VA ten times",
                        "Tell them their eyes are perfect and discharge",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Normal distance VA doesn't capture everything — "
                                   "near vision, field, or intermittent symptoms may "
                                   "explain the complaint and deserve attention.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why is the pinhole NOT a substitute for a formal "
                            "refraction?",
                    "options": [
                        "It only screens for a refractive cause; it does not give the "
                        "actual prescription",
                        "It gives a more accurate prescription than refraction",
                        "It measures eye pressure instead",
                        "It is only for children",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "The pinhole only indicates whether a refractive "
                                   "cause is present; the exact lens powers still need "
                                   "a formal refraction.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Which statement about recording VA is correct?",
                    "options": [
                        "Record the smallest line read, the eye, and whether "
                        "correction/pinhole was used",
                        "Record only the largest line the patient can see",
                        "Record vision for both eyes together only",
                        "Recording the eye tested is unnecessary",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Good documentation notes the smallest line read, "
                                   "which eye, and whether glasses or a pinhole were "
                                   "used — so results are comparable over time.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A diabetic reads 6/9 today but read 6/6 three months ago, "
                            "with no pinhole improvement. Why does this combination "
                            "concern you?",
                    "options": [
                        "A drop that the pinhole can't fix may reflect retinal change "
                        "(e.g. macular oedema) — flag it",
                        "It is a normal day-to-day variation, ignore it",
                        "It means the patient needs new glasses only",
                        "Diabetics never have VA changes",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A new VA drop not corrected by the pinhole in a "
                                   "diabetic raises concern for retinal involvement "
                                   "(e.g. macular oedema) and should be flagged.",
                    "reasoning_eligible": True,
                },
            ],
        },
        "near_vision": {
            "easy": [
                {
                    "stem": "At what distance is the near vision (N) chart usually held?",
                    "options": ["35 cm", "6 metres", "1 metre", "10 cm"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "The near vision chart is held at about 35 cm — a "
                                   "normal reading distance.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What is normal near vision?",
                    "options": ["N5 (the finest print)", "N48", "6/6", "N18"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "N5 is the finest near print and represents normal "
                                   "near vision.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "How is each eye tested for near vision?",
                    "options": ["Separately, with the other eye occluded",
                                "Both eyes together only",
                                "With both eyes closed",
                                "Only the dominant eye is tested"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Near vision is tested one eye at a time, with the "
                                   "other eye occluded.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Should reading correction be worn for the near VA test?",
                    "options": ["Yes — record near VA with correction in place",
                                "No — always test unaided",
                                "Only for children",
                                "Only if the patient asks"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Near VA is recorded with the patient's reading "
                                   "correction in place (and noted as such).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "How is a near vision result documented?",
                    "options": ["As the smallest line read, e.g. N5, N6, N8, N10",
                                "As a Snellen fraction like 6/6",
                                "As a percentage",
                                "As pass or fail only"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Near vision is recorded as the smallest print read "
                                   "comfortably (N5, N6, N8, N10, etc.).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "When is near vision typically tested?",
                    "options": ["On the first visit and when ordered",
                                "Only in an emergency",
                                "Never for adults",
                                "Only after surgery"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Near vision is checked on the first visit and "
                                   "whenever specifically ordered.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A patient holds reading material further away to focus. "
                            "What does this suggest?",
                    "options": ["Presbyopia", "Myopia",
                                "Glaucoma", "Colour blindness"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Holding text further away to focus is a classic "
                                   "sign of presbyopia (age-related loss of near "
                                   "focus).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why is adequate lighting important for the near vision "
                            "test?",
                    "options": ["Poor lighting falsely reduces the recorded near "
                                "acuity",
                                "Lighting has no effect on near vision",
                                "Bright light blurs near print",
                                "It only matters for distance vision"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Inadequate lighting can make near acuity look worse "
                                   "than it is, so good lighting is needed for a valid "
                                   "result.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What does presbyopia affect?",
                    "options": ["The ability to focus on near objects",
                                "Distance vision only",
                                "Colour perception",
                                "The visual field"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Presbyopia is the age-related loss of the eye's "
                                   "ability to focus up close.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL correct statements about testing near vision.",
                    "options": [
                        "It is held at about 35 cm",
                        "Each eye is tested separately",
                        "Reading correction is worn and noted",
                        "It is recorded as a Snellen 6/x fraction",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "Near vision is held at ~35 cm, tested one eye at a "
                                   "time, with correction worn and noted. It is "
                                   "recorded as N-notation (N5, N6…), not a 6/x "
                                   "fraction.",
                    "reasoning_eligible": False,
                },
            ],
            "medium": [
                {
                    "stem": "A 50-year-old reads N10 unaided but N5 with a reading add. "
                            "What is the diagnosis?",
                    "options": ["Presbyopia", "Myopia",
                                "Cataract", "Macular degeneration"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Improving from N10 to N5 with a reading add at age "
                                   "50 is classic presbyopia.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Distance VA is 6/6 but near VA is reduced. What pattern "
                            "does this suggest?",
                    "options": ["Presbyopia (age-related loss of near focus)",
                                "Cataract",
                                "Glaucoma",
                                "Retinal detachment"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Good distance vision with poor near vision is the "
                                   "typical pattern of presbyopia.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why must reading correction be worn (and noted) for the "
                            "near test?",
                    "options": [
                        "Near vision is meaningful at the patient's working "
                        "correction, and it must be comparable later",
                        "Glasses always make near vision worse",
                        "It is only for cosmetic reasons",
                        "Correction is irrelevant to near vision",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Recording near VA with the usual reading correction "
                                   "(and noting it) makes the result clinically "
                                   "meaningful and comparable at later visits.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A young patient with good distance vision struggles to "
                            "read N5 and gets headaches when reading. What might this "
                            "suggest?",
                    "options": [
                        "Uncorrected hyperopia or a near/focusing problem worth "
                        "review",
                        "Definite presbyopia (they are too young)",
                        "A retinal detachment",
                        "Normal vision — no action needed",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A young person is too young for presbyopia; near "
                                   "difficulty with headaches may reflect uncorrected "
                                   "long-sightedness or a focusing problem worth "
                                   "review.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "How is a near vision result of 'smallest comfortable line "
                            "N8' recorded?",
                    "options": ["As N8", "As 6/8", "As 80%", "As N5"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Near vision is recorded in N-notation as the "
                                   "smallest line read comfortably — here N8.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why test near vision separately from distance vision?",
                    "options": [
                        "Near and distance focus can be affected independently",
                        "They always give the same result",
                        "Near vision replaces the distance test",
                        "It is only done to fill in the form",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Distance and near focusing can be affected "
                                   "independently (e.g. presbyopia spares distance), so "
                                   "both are tested.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A patient's near vision is worse in dim restaurant "
                            "lighting than in clinic. What is the likely explanation?",
                    "options": [
                        "Reduced lighting lowers near acuity, especially with early "
                        "lens changes",
                        "Their eyes are healthier in dim light",
                        "Near vision is unaffected by light",
                        "They are imagining the difference",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Near acuity falls in poor light, and early lens "
                                   "changes make this worse — a common real-world "
                                   "complaint.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL findings consistent with simple presbyopia.",
                    "options": [
                        "Reduced near vision that improves with a reading add",
                        "Normal distance vision",
                        "Onset around the 40s-50s",
                        "Sudden painful loss of vision",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Presbyopia gives reduced near vision corrected by a "
                                   "reading add, normal distance vision, and onset in "
                                   "the 40s-50s. Sudden painful vision loss is NOT "
                                   "presbyopia.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Near vision is reduced AND does not improve with a reading "
                            "add in an older patient. What does this suggest?",
                    "options": [
                        "Something beyond presbyopia (e.g. macular problem) — worth "
                        "review",
                        "Definitely just presbyopia",
                        "A refractive error in the distance only",
                        "Normal ageing, no action",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "If a reading add doesn't help, the cause may be "
                                   "beyond presbyopia (e.g. a macular problem) and "
                                   "should be reviewed.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why record the near working distance if it differs from "
                            "35 cm?",
                    "options": [
                        "Some patients (e.g. musicians) need vision at a specific "
                        "distance, which affects the add",
                        "The distance never matters",
                        "It changes the eye being tested",
                        "Only 35 cm is ever acceptable",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Some patients need clear vision at a particular "
                                   "working distance, so noting it helps the doctor "
                                   "choose the right reading add.",
                    "reasoning_eligible": False,
                },
            ],
            "hard": [
                {
                    "stem": "A 48-year-old reports recent reading difficulty. Distance "
                            "VA is 6/6, near improves from N10 to N5 with a +1.50 add. "
                            "What is the diagnosis and the reasoning?",
                    "options": [
                        "Presbyopia — age-appropriate loss of near focus corrected by "
                        "a reading add",
                        "Cataract — the lens is opaque",
                        "Macular degeneration — central vision is destroyed",
                        "Glaucoma — peripheral field is lost",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Age 48, normal distance vision, and near vision "
                                   "corrected by a plus add is textbook presbyopia.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why does presbyopia spare distance vision while reducing "
                            "near vision?",
                    "options": [
                        "The ageing lens loses flexibility needed to focus up close, "
                        "but distance focus is unaffected",
                        "It damages the retina centrally",
                        "It clouds the lens like a cataract",
                        "It raises the eye pressure",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "With age the lens stiffens and can no longer change "
                                   "shape to focus near objects; distance focus needs "
                                   "no such change, so it is preserved.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "An elderly patient has reduced near vision that a reading "
                            "add does NOT improve, plus distortion of straight lines. "
                            "What should you do?",
                    "options": [
                        "Suspect a macular problem and flag for review (it's not "
                        "simple presbyopia)",
                        "Prescribe a stronger reading add and discharge",
                        "Reassure that it is normal ageing",
                        "Repeat only the distance VA",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Near vision unhelped by an add, with distortion, "
                                   "suggests a macular problem (e.g. AMD) rather than "
                                   "presbyopia — flag for review.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL factors that could make a near vision result "
                            "unreliable.",
                    "options": [
                        "Poor lighting",
                        "Holding the chart at the wrong distance",
                        "Not wearing the usual reading correction",
                        "Testing each eye separately",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Poor light, wrong test distance, and missing "
                                   "reading correction all make near VA unreliable. "
                                   "Testing each eye separately is correct technique, "
                                   "not a source of error.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why can a patient have 6/6 distance vision yet be unable to "
                            "read a menu comfortably?",
                    "options": [
                        "Distance and near focus are separate; near focus can fail "
                        "(presbyopia) while distance is normal",
                        "6/6 vision is impossible with reading trouble",
                        "The menu print is always too small to read",
                        "They must be exaggerating",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Distance acuity (6/6) says nothing about near "
                                   "focusing; presbyopia commonly leaves distance "
                                   "perfect while near reading suffers.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "A patient claims their 'old glasses stopped working' for "
                            "reading after a few years. What is the most likely "
                            "explanation?",
                    "options": [
                        "Presbyopia has progressed, so a stronger reading add is "
                        "needed",
                        "The glasses physically wore out",
                        "Their distance vision has failed",
                        "They have developed colour blindness",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Presbyopia increases with age, so an add that "
                                   "worked a few years ago may now be too weak — a "
                                   "stronger reading add is usually needed.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Which statement best contrasts presbyopia with myopia?",
                    "options": [
                        "Presbyopia reduces NEAR vision with age; myopia blurs "
                        "DISTANCE vision",
                        "Both blur only near vision",
                        "Presbyopia blurs distance; myopia blurs near",
                        "They are the same condition",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Presbyopia is an age-related NEAR problem; myopia "
                                   "(short sight) blurs DISTANCE vision. They are "
                                   "different.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "How would you document a near test where the patient reads "
                            "N6 right eye and N8 left eye, both with reading glasses?",
                    "options": [
                        "RE N6, LE N8, with reading correction",
                        "Near vision 6/6 both eyes",
                        "N6 both eyes together",
                        "Pass, with no detail",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Record each eye's smallest line and that reading "
                                   "correction was worn: RE N6, LE N8 (with correction).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why is it useful to compare near vision between visits, "
                            "not just within one visit?",
                    "options": [
                        "A genuine decline over time can signal disease, separate "
                        "from a fixed presbyopic level",
                        "Near vision never changes once measured",
                        "Comparison is only needed for distance vision",
                        "It is done only for paperwork",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Tracking near vision over visits can reveal a real "
                                   "decline (e.g. macular change) as opposed to a "
                                   "stable presbyopic baseline.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "A diabetic's near vision fluctuates day to day. What is a "
                            "plausible explanation worth noting?",
                    "options": [
                        "Blood sugar swings can temporarily shift the eye's focus",
                        "Diabetes never affects vision",
                        "Near charts are simply unreliable",
                        "The patient needs new frames",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Fluctuating blood glucose can cause temporary "
                                   "refractive shifts and variable vision — worth "
                                   "noting in a diabetic before changing glasses.",
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

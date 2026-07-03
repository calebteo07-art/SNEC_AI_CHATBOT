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

import random

from tools.flashcards.flashcard_sets import (
    DIFFICULTIES,
    pool_for_role,
    pools_for,
    topics_for,
    make_set_key,
)

# FLASHCARDS[pool][topic_key][difficulty] = list of MCQ card dicts
FLASHCARDS: dict[str, dict[str, dict[str, list[dict]]]] = {
    "FOUNDATIONS": {
        "pharmacology": {
            "easy": [
                {'stem': "On an eye-drop prescription, what does 'OD' mean?", 'options': ['The right eye', 'The left eye', 'Both eyes', 'Once at bedtime'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'OD = oculus dexter = the right eye (OS = left, OU = both eyes).', 'reasoning_eligible': False},
                {'stem': "What does the prescription abbreviation 'gtt' stand for?", 'options': ['Drops', 'Grams', 'Every hour', 'Half'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': "'gtt/gtt.' (guttae) means drop(s).", 'reasoning_eligible': False},
                {'stem': "A drop prescribed 'TID' is given how often?", 'options': ['Three times a day', 'Twice a day', 'Four times a day', 'Only at bedtime'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'TID (ter in die) = three times a day; BID = twice, QID = four times.', 'reasoning_eligible': False},
                {'stem': 'What is the main action of a mydriatic drop on the iris?', 'options': ['It dilates the pupil', 'It constricts the pupil', 'It numbs the cornea', 'It stains the tear film'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Mydriatics act on the iris musculature to dilate the pupil.', 'reasoning_eligible': False},
                {'stem': 'Tropicamide (Mydriacyl) is used mainly to:', 'options': ['Dilate the pupil for fundus examination', 'Lower intraocular pressure', 'Anaesthetise the cornea', 'Treat bacterial conjunctivitis'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Tropicamide is a short-acting agent used chiefly to dilate the pupil for ophthalmoscopy.', 'reasoning_eligible': False},
                {'stem': 'When instilling an eye drop, the bottle tip should be:', 'options': ['Held clear of the lashes and the globe', 'Rested gently on the cornea', 'Touched to the lashes to steady it', 'Wiped along the lid margin first'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'The tip is held free of the globe and lashes to avoid contaminating the bottle.', 'reasoning_eligible': False},
                {'stem': 'Timolol lowers intraocular pressure by:', 'options': ['Reducing aqueous humour production', 'Increasing uveoscleral outflow', 'Constricting the pupil', 'Dilating the ciliary body'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Timolol is a beta-blocker that reduces aqueous production at the ciliary epithelium.', 'reasoning_eligible': False},
                {'stem': 'Latanoprost, a prostaglandin analogue, lowers IOP mainly by:', 'options': ['Increasing uveoscleral outflow', 'Reducing aqueous production', 'Paralysing the ciliary muscle', 'Constricting conjunctival vessels'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Prostaglandin analogues such as latanoprost increase uveoscleral outflow of aqueous.', 'reasoning_eligible': False},
                {'stem': 'How is latanoprost usually dosed?', 'options': ['Once daily', 'Every hour', 'Four times a day', 'Only when the eye is red'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Prostaglandin analogues are effective in a single daily dose, which aids adherence.', 'reasoning_eligible': False},
                {'stem': 'A corneal abrasion stained with fluorescein is best seen under:', 'options': ['Cobalt blue light', 'Bright white light', 'Red-free (green) light', 'Infrared light'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Fluorescein pooling in an epithelial defect fluoresces under cobalt blue (or UV) light.', 'reasoning_eligible': False},
                {'stem': 'Acetazolamide (Diamox) tablets lower IOP by:', 'options': ['Blocking carbonic anhydrase to reduce aqueous formation', 'Dilating the pupil', 'Increasing tear production', 'Constricting the ciliary body'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Acetazolamide is a carbonic anhydrase inhibitor that reduces aqueous humour formation.', 'reasoning_eligible': False},
                {'stem': 'After atropine is instilled in an adult eye, cycloplegia can persist for about:', 'options': ['10 to 14 days', '10 to 14 minutes', '1 to 2 hours', '4 to 6 hours'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Atropine is very long-acting; accommodation and pupil size can take 10-14 days to recover.', 'reasoning_eligible': False},
                {'stem': 'Pilocarpine is a miotic, so on the pupil it causes:', 'options': ['Constriction', 'Dilation', 'No change', 'Permanent paralysis'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Miotics stimulate the iris sphincter, constricting the pupil.', 'reasoning_eligible': False},
                {'stem': 'Why are eye ointments often prescribed for bedtime use?', 'options': ['Long contact time, and the blurring matters less at night', 'They never blur vision', 'They work only in darkness', 'They cannot be used during the day'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Ointments have prolonged contact time but blur vision, so bedtime dosing is convenient.', 'reasoning_eligible': False},
                {'stem': 'A glaucoma patient on timolol reports new wheeze and breathlessness. The concern is that timolol may:', 'options': ['Cause systemic beta-blockade worsening asthma/COPD', 'Be a normal harmless effect', 'Have raised the eye pressure', 'Have dilated the pupil'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Topical beta-blockers are absorbed systemically and can provoke bronchospasm and bradycardia.', 'reasoning_eligible': True},
                {'stem': 'Which is a common preservative in multi-dose eye drops?', 'options': ['Benzalkonium chloride', 'Sodium fluorescein', 'Normal saline', 'Rose bengal'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'About 95% of ophthalmic products use preservatives such as benzalkonium chloride.', 'reasoning_eligible': False},
                {'stem': 'Once an eye-drop bottle has been opened, it should be regarded as:', 'options': ['No longer sterile', 'Sterile indefinitely', 'Safe to share between patients', 'Stronger in effect'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'An opened bottle is no longer sterile; organisms (notably Pseudomonas) can enter it.', 'reasoning_eligible': False},
            ],
            "medium": [
                {'stem': 'Which strength of phenylephrine is preferred in older adults and infants?', 'options': ['2.5%', '10%', 'Either is equally safe', 'Neither should be used'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Only 2.5% phenylephrine should be used in older adults and infants; 10% carries cardiovascular risk.', 'reasoning_eligible': False},
                {'stem': 'Why is 10% phenylephrine avoided in a patient with hypertension or heart disease?', 'options': ['Systemic sympathomimetic effects can raise BP and heart rate', 'It lowers BP dangerously', 'It has no systemic absorption', 'It only affects the retina'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': '10% phenylephrine can cause marked BP rise, tachycardia and rare cardiac events.', 'reasoning_eligible': True},
                {'stem': 'Applying gentle pressure over the lacrimal sac (punctal occlusion) after instilling a drop:', 'options': ['Reduces systemic absorption of the drug', 'Speeds up pupil dilation', 'Sterilises the bottle tip', "Increases the drop's stinging"], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Punctal occlusion reduces drainage into the nose and therefore systemic absorption.', 'reasoning_eligible': True},
                {'stem': 'Cyclopentolate is favoured for office cycloplegic refraction because it has:', 'options': ['Rapid onset (~30 min) and a duration of hours', 'A permanent effect', 'No effect on accommodation', 'A 10-14 day duration like atropine'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Cyclopentolate acts in about 30 minutes and wears off within 6-24 hours, ideal for clinic use.', 'reasoning_eligible': False},
                {'stem': 'Heavily pigmented (dark) irides tend to:', 'options': ['Dilate more slowly and may need stronger or repeated drops', 'Dilate faster than light irides', 'Not dilate at all', 'Require miotics to dilate'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Darkly pigmented eyes dilate with difficulty and may need higher concentration or repeat instillation.', 'reasoning_eligible': False},
                {'stem': 'Why are cycloplegics used in the treatment of anterior uveitis (iritis)?', 'options': ['To relieve ciliary spasm and prevent the iris sticking to the lens (posterior synechiae)', 'To lower the intraocular pressure', 'To constrict the pupil', 'To numb the cornea'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Cycloplegics relieve painful ciliary spasm and keep the pupil moving to prevent posterior synechiae.', 'reasoning_eligible': True},
                {'stem': 'A recognised long-term side effect of latanoprost is:', 'options': ['Darkening of the iris colour', 'Permanent pupil dilation', 'Corneal ulceration', 'Loss of eyelashes'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Prostaglandin analogues can increase iris pigmentation (and eyelash growth).', 'reasoning_eligible': False},
                {'stem': 'Which are recognised ocular complications of prolonged topical steroid use? (Select all that apply.)', 'options': ['Raised intraocular pressure (glaucoma)', 'Cataract formation', 'Permanent miosis', 'Darkening of the iris'], 'correct': [0, 1], 'qtype': 'multi', 'kind': 'theory', 'explanation': 'Chronic topical steroids can raise IOP (steroid glaucoma) and cause posterior subcapsular cataract.', 'reasoning_eligible': False},
                {'stem': 'A patient on oral acetazolamide reports tingling of the fingers, toes and tongue. This is:', 'options': ['A known side effect (paraesthesia), not an emergency', 'An allergic reaction needing adrenaline', 'A sign the drug is not working', 'Unrelated to the medication'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Paraesthesia of the extremities is a common, expected side effect of carbonic anhydrase inhibitors.', 'reasoning_eligible': True},
                {'stem': 'Which antibiotic class is now commonly first-line topical therapy for many bacterial corneal ulcers?', 'options': ['Fluoroquinolones', 'Antifungals', 'Antivirals', 'Mast cell stabilisers'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Frequent topical fluoroquinolones are effective and have largely replaced fortified antibiotics for many ulcers.', 'reasoning_eligible': False},
                {'stem': 'Sterile dry fluorescein strips are preferred over fluorescein solution because solution:', 'options': ['Can harbour Pseudomonas aeruginosa', 'Dilates the pupil', 'Stings less', 'Stains the lens permanently'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Pseudomonas flourishes in fluorescein solution; dry strips avoid this contamination risk.', 'reasoning_eligible': False},
                {'stem': 'IV mannitol lowers intraocular pressure by:', 'options': ['Osmotically drawing fluid out of the eye', 'Blocking aqueous production', 'Constricting the pupil', 'Increasing tear film osmolarity only'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Mannitol is a hyperosmotic agent that draws fluid from the eye into the vascular compartment.', 'reasoning_eligible': False},
                {'stem': 'Two different eye drops are prescribed for the same eye at the same time. You should:', 'options': ['Wait about 5 minutes between the two drops', 'Instil both together immediately', 'Mix them in the cap first', 'Give only one and skip the other'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Spacing drops (~5 min) prevents the second washing out the first and reduces overflow.', 'reasoning_eligible': True},
                {'stem': "Why caution with over-the-counter 'redness-relief' vasoconstrictor drops in a patient with narrow angles?", 'options': ['They can precipitate acute angle-closure glaucoma', 'They permanently whiten the sclera', 'They lower blood pressure', 'They cure the underlying allergy'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Decongestant vasoconstrictors dilate the pupil slightly and may trigger angle closure in narrow angles.', 'reasoning_eligible': True},
                {'stem': 'Acyclovir is classified as an:', 'options': ['Antiviral agent (herpes)', 'Antibiotic', 'Antifungal', 'Antihistamine'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Acyclovir is an antiviral used for herpes simplex and herpes zoster infections.', 'reasoning_eligible': False},
                {'stem': "Before instilling a steroid 'acetate suspension' eye drop, you should:", 'options': ['Shake the bottle to resuspend the drug', 'Warm it in hot water', 'Dilute it with saline', "Discard the first week's doses"], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Suspensions settle; shaking ensures an even, correctly dosed drop.', 'reasoning_eligible': False},
                {'stem': 'A patient with a red, painful eye and a dendritic ulcer is best NOT given topical steroids alone because steroids:', 'options': ['Promote proliferation of herpes simplex virus', 'Cure the virus too quickly', 'Lower the eye pressure too far', 'Stain the cornea'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Steroids encourage viral (herpes simplex) proliferation and can worsen dendritic keratitis.', 'reasoning_eligible': True},
            ],
            "hard": [
                {'stem': 'Compared with timolol, betaxolol (a selective beta-1 blocker) generally has:', 'options': ['Fewer pulmonary effects but a smaller IOP-lowering effect', 'Greater IOP lowering and more asthma risk', 'No systemic absorption at all', 'A once-weekly dosing schedule'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': "Betaxolol's beta-1 selectivity spares the lungs somewhat but lowers IOP less than non-selective timolol.", 'reasoning_eligible': True},
                {'stem': 'Apraclonidine 1% is used specifically for:', 'options': ['Post-laser intraocular pressure spikes', 'Long-term first-line glaucoma therapy', 'Dilating the pupil', 'Treating fungal keratitis'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Apraclonidine 1% is used for post-laser IOP spikes; 0.5% is used for shorter-term adjunct therapy.', 'reasoning_eligible': False},
                {'stem': 'The combination product Cosopt pairs timolol with which agent?', 'options': ['Dorzolamide (a carbonic anhydrase inhibitor)', 'Latanoprost', 'Pilocarpine', 'Atropine'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Cosopt combines timolol maleate with dorzolamide, a topical carbonic anhydrase inhibitor.', 'reasoning_eligible': False},
                {'stem': 'Dipivefrin can cause cystoid macular oedema, a risk seen particularly in which patients?', 'options': ['Aphakic patients', 'Young children', 'Contact lens wearers', 'Diabetics only'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Dipivefrin-related cystoid macular oedema is reported mainly in aphakic eyes and reverses on stopping.', 'reasoning_eligible': True},
                {'stem': 'Rose bengal stain has a particular affinity for:', 'options': ['Devitalised/dead epithelial cells (useful in dry eye)', 'Only fresh corneal abrasions', 'Healthy corneal endothelium', 'The crystalline lens'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Rose bengal stains dead/degenerating and unprotected cells, aiding diagnosis of keratoconjunctivitis sicca.', 'reasoning_eligible': False},
                {'stem': 'Lissamine green is often preferred over rose bengal because it:', 'options': ['Stains devitalised cells similarly but is less irritating', 'Stains nothing at all', 'Only works under UV light', 'Is an antibiotic as well'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Lissamine green acts like rose bengal on dead/degenerate cells but causes less irritation.', 'reasoning_eligible': False},
                {'stem': 'A contact-lens wearer has severe keratitis unresponsive to antibiotics. A parasite to consider is:', 'options': ['Acanthamoeba (treated with PHMB; steroids contraindicated)', 'Candida only', 'Herpes simplex', 'Staphylococcus aureus'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Acanthamoeba keratitis complicates contact-lens wear; agents include PHMB/chlorhexidine and steroids are contraindicated.', 'reasoning_eligible': True},
                {'stem': 'Long-term hydroxychloroquine (or chloroquine) is associated with which retinal toxicity?', 'options': ["Bull's-eye maculopathy", 'Vortex keratopathy', 'Retinal detachment', 'Optic neuritis'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': "Chloroquine/hydroxychloroquine can cause a bull's-eye maculopathy, so retinal screening is advised.", 'reasoning_eligible': False},
                {'stem': 'Amiodarone characteristically causes which corneal change?', 'options': ['A vortex (whorl) keratopathy', 'A dense cataract', 'Corneal perforation', 'Permanent mydriasis'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Amiodarone deposits produce cornea verticillata (vortex keratopathy), usually visually insignificant.', 'reasoning_eligible': False},
                {'stem': 'Phenylephrine and epinephrine are packaged in dark or opaque bottles because they:', 'options': ['Oxidise in the presence of air and bright light', 'Freeze at room temperature', 'Are radioactive', 'Evaporate instantly'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'These drugs oxidise on exposure to air and light, so opaque packaging preserves potency.', 'reasoning_eligible': False},
                {'stem': 'A patient develops generalised itching, rash, breathing difficulty and a weak rapid pulse shortly after a drug. The immediate treatment is:', 'options': ['Subcutaneous/IM epinephrine (adrenaline) plus oxygen', 'A further dose of the same drug', 'Topical antibiotic', 'Reassurance only'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'These are features of an acute allergic/anaphylactic reaction; adrenaline and oxygen are first-line.', 'reasoning_eligible': True},
                {'stem': 'Why are preservative-free preparations used for intraocular surgery?', 'options': ['Preservatives are toxic to open ocular tissues', 'They are cheaper to manufacture', 'They dilate the pupil', 'They last longer once opened'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'For surgery the preservatives are removed because they irritate/damage exposed intraocular tissues.', 'reasoning_eligible': False},
                {'stem': 'Solutions closest to the tonicity of tears (about 0.9% sodium chloride) are:', 'options': ['Best tolerated with least irritation', 'The most irritating', 'Unusable in the eye', 'Only for contact lenses'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Isotonic solutions near 0.9% NaCl match tears and cause least irritation; hyper- or hypotonic drops sting.', 'reasoning_eligible': False},
                {'stem': 'After photorefractive/refractive surgery, topical ketorolac (an NSAID) is used mainly to:', 'options': ['Relieve ocular pain and reduce the need for oral analgesics', 'Dilate the pupil', 'Sterilise the ocular surface', 'Permanently lower IOP'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Topical NSAIDs such as ketorolac give substantial post-refractive-surgery pain relief with fewer steroid risks.', 'reasoning_eligible': True},
                {'stem': 'Natamycin, a topical antifungal, is limited to surface (topical) use because it:', 'options': ['Penetrates ocular tissues very poorly', 'Is far too potent for the eye', 'Stains the cornea black', 'Raises the IOP severely'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Natamycin penetrates tissue poorly, so it is useful only for surface (topical) fungal infection.', 'reasoning_eligible': False},
                {'stem': 'Mast cell stabilisers (e.g., cromolyn) for allergic eye disease are most effective when:', 'options': ['Started prophylactically before mast-cell degranulation', 'Given only after severe symptoms peak', 'Combined with a topical steroid every time', 'Used as a single one-off dose'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Mast cell stabilisers work best as prophylaxis, preventing degranulation before allergen exposure.', 'reasoning_eligible': True},
            ],
        },
    },
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
        "pinhole": {
            "easy": [
                {
                    "stem": "What does a pinhole occluder physically do to the light "
                            "entering the eye?",
                    "options": [
                        "It blocks peripheral rays so only central rays enter",
                        "It magnifies the chart letters",
                        "It increases the brightness of the chart",
                        "It changes the colour of the image",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "The pinhole blocks blurred peripheral light rays so "
                                   "that only central, well-focused rays reach the "
                                   "retina.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "When, during a vision check, is the pinhole occluder used?",
                    "options": ["When the visual acuity is reduced (6/12 or worse)",
                                "Only when vision is a perfect 6/6",
                                "Before measuring any vision at all",
                                "Only for colour vision testing"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "The pinhole is applied once VA is found to be "
                                   "reduced (6/12 or worse) to screen for a refractive "
                                   "cause.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Through the pinhole a patient sees noticeably better. Is "
                            "the cause more likely refractive or non-refractive?",
                    "options": ["Refractive (likely helped by glasses)",
                                "Non-refractive (retinal disease)",
                                "Non-refractive (optic nerve disease)",
                                "It cannot be interpreted"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Improvement through the pinhole points to a "
                                   "refractive cause that glasses are likely to correct.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Can the pinhole replace a full (formal) refraction?",
                    "options": ["No — it only screens for a refractive cause",
                                "Yes — it gives the exact prescription",
                                "Yes — it replaces the eye examination",
                                "Only in children"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "The pinhole only indicates whether a refractive "
                                   "cause is present; the precise lens powers still need "
                                   "a formal refraction.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Does the pinhole magnify what the patient is looking at?",
                    "options": ["No — it sharpens by limiting the light rays, it does "
                                "not magnify",
                                "Yes — it works like a magnifier",
                                "Yes — it doubles the letter size",
                                "Only at near"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "The pinhole sharpens the image by admitting only "
                                   "central rays; it does not magnify.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL causes of reduced vision that will NOT improve "
                            "with a pinhole.",
                    "options": ["A dense cataract (media opacity)",
                                "Retinal disease",
                                "Optic nerve disease",
                                "Uncorrected short-sightedness"],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "Media opacity, retinal disease and optic nerve "
                                   "disease are non-refractive, so the pinhole doesn't "
                                   "help. Uncorrected short-sightedness IS refractive "
                                   "and does improve.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What is the pinhole mainly used to screen for?",
                    "options": ["Whether reduced vision has a refractive cause",
                                "The eye pressure",
                                "Colour vision",
                                "The visual field"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "The pinhole is a quick screen for whether reduced "
                                   "vision is refractive (correctable) or not.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A patient with uncorrected astigmatism looks through the "
                            "pinhole. What is the expected result?",
                    "options": ["Vision improves (it is a refractive error)",
                                "Vision stays exactly the same",
                                "Vision gets worse",
                                "The pupil dilates"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Astigmatism is a refractive error, so vision "
                                   "typically improves through the pinhole.",
                    "reasoning_eligible": False,
                },
            ],
            "medium": [
                {
                    "stem": "A patient with a cloudy lens sees no better through the "
                            "pinhole. What does this indicate?",
                    "options": [
                        "The reduced vision is from media opacity, not refractive "
                        "error",
                        "The patient simply needs glasses",
                        "The pinhole was used incorrectly",
                        "The vision is actually normal",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A cloudy lens (cataract) is a media opacity; the "
                                   "pinhole can't overcome it, so vision doesn't "
                                   "improve.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why does the pinhole sharpen vision when refractive error "
                            "is uncorrected?",
                    "options": [
                        "It removes the blur from out-of-focus peripheral rays",
                        "It brightens the retina",
                        "It relaxes the focusing muscle",
                        "It enlarges the retinal image",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "By blocking peripheral rays, the pinhole removes "
                                   "their blur and leaves a sharper central image — "
                                   "improving vision in refractive error.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "A dense cataract gives only slight improvement with the "
                            "pinhole. How do you interpret this?",
                    "options": [
                        "Mainly a non-refractive (media) cause, perhaps with a small "
                        "refractive component",
                        "Purely refractive error",
                        "The retina is definitely diseased",
                        "Normal vision",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Slight improvement suggests the reduced vision is "
                                   "mostly from media opacity, with maybe a small "
                                   "refractive part.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "What is the correct sequence when distance VA comes back "
                            "reduced?",
                    "options": [
                        "Record the unaided VA, then re-test through the pinhole",
                        "Apply the pinhole before measuring any VA",
                        "Skip the pinhole and refer everyone",
                        "Only use the pinhole if the patient asks",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "First record the (unaided or corrected) VA, then "
                                   "re-test with the pinhole to screen for a refractive "
                                   "cause.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why might the pinhole give limited improvement in a "
                            "patient with a very small pupil already?",
                    "options": [
                        "A small pupil already limits peripheral rays, so the pinhole "
                        "adds less benefit",
                        "Small pupils make the pinhole magnify",
                        "The pinhole only works in the dark",
                        "Pupil size has no effect on the pinhole",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "A naturally small pupil already restricts "
                                   "peripheral rays, so the extra effect of a pinhole "
                                   "may be smaller.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A patient improves from 6/24 to 6/6 with the pinhole. What "
                            "is the practical conclusion?",
                    "options": [
                        "Their reduced vision is refractive — refraction/glasses "
                        "should help",
                        "They have a retinal detachment",
                        "They have optic nerve disease",
                        "The result is invalid",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Full improvement to 6/6 with the pinhole strongly "
                                   "indicates a correctable refractive error.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL true statements about pinhole testing.",
                    "options": [
                        "It screens for a refractive cause of reduced vision",
                        "Improvement suggests glasses may help",
                        "No improvement suggests a media, retinal or nerve cause",
                        "It provides the final spectacle prescription",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "The pinhole screens for refractive causes; "
                                   "improvement implies glasses may help and no "
                                   "improvement implies a non-refractive cause. It does "
                                   "NOT give the final prescription.",
                    "reasoning_eligible": False,
                },
            ],
            "hard": [
                {
                    "stem": "Two patients read 6/36. One improves to 6/6 with the "
                            "pinhole; the other does not change at all. What does each "
                            "result imply for next steps?",
                    "options": [
                        "First: likely refractive — arrange refraction; second: likely "
                        "media/retina/nerve — needs further assessment",
                        "Both simply need glasses",
                        "Both need urgent surgery",
                        "Neither result means anything",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Pinhole improvement points toward refraction; no "
                                   "change points toward a non-refractive cause needing "
                                   "further work-up.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why can the pinhole give a falsely poor result if the "
                            "patient struggles to line it up with their visual axis?",
                    "options": [
                        "If they don't look through the hole, peripheral blur (or no "
                        "image) is seen, underestimating the true potential",
                        "The pinhole always overestimates vision",
                        "Misalignment magnifies the letters",
                        "Alignment makes no difference",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "If the patient doesn't look straight through the "
                                   "aperture, they see edge blur or nothing, so the "
                                   "pinhole VA can read worse than the eye's true "
                                   "potential — coach them to align it.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "A cataract patient improves only from 6/60 to 6/36 with "
                            "the pinhole. The doctor still expects good vision after "
                            "surgery. Why is that not a contradiction?",
                    "options": [
                        "The pinhole reflects current media opacity, not the retina's "
                        "potential once the lens is removed",
                        "The pinhole already measured the post-surgery vision",
                        "Cataracts never affect the pinhole",
                        "The doctor must be mistaken",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A limited pinhole result is dominated by the "
                                   "cataract; it doesn't reveal the retina's potential "
                                   "once the cloudy lens is removed (that is what a PAM "
                                   "estimates).",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Which combination would you expect in PURE uncorrected "
                            "myopia with healthy eyes otherwise?",
                    "options": [
                        "Reduced unaided distance VA that improves markedly with the "
                        "pinhole",
                        "Reduced VA that does not change with the pinhole",
                        "Normal unaided VA that worsens with the pinhole",
                        "No measurable vision at all",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Uncorrected myopia blurs distance vision but the "
                                   "eye is otherwise healthy, so the pinhole produces a "
                                   "marked improvement.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL situations where a pinhole result must be "
                            "interpreted with caution.",
                    "options": [
                        "Dense media opacity limiting the image",
                        "A patient who cannot align the aperture",
                        "Mixed refractive plus media causes",
                        "A cooperative patient with simple myopia",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Dense opacity, poor alignment, and mixed causes all "
                                   "make pinhole interpretation tricky. A cooperative "
                                   "myope is the straightforward case.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why is the pinhole especially useful in a busy clinic "
                            "before deciding who needs a full refraction?",
                    "options": [
                        "It quickly flags whether glasses are likely to restore "
                        "vision, prioritising further tests",
                        "It replaces the doctor's assessment entirely",
                        "It measures eye pressure at the same time",
                        "It cures the refractive error",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "As a fast screen, the pinhole helps sort patients "
                                   "whose vision is simply uncorrected from those "
                                   "needing deeper assessment.",
                    "reasoning_eligible": False,
                },
            ],
        },
        "iop_nct": {
            "easy": [
                {
                    "stem": "What is the normal range for intraocular pressure (IOP)?",
                    "options": ["10-21 mmHg", "0-5 mmHg",
                                "30-40 mmHg", "50-60 mmHg"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Normal IOP is 10-21 mmHg.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What does a non-contact tonometer use to measure the eye "
                            "pressure?",
                    "options": ["A puff of air", "A probe touching the cornea",
                                "An ultrasound gel", "A bright light"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "The non-contact tonometer (NCT) uses a puff of air "
                                   "to measure IOP without touching the eye.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "For which patients and visits is IOP measured?",
                    "options": ["All patients, all visits",
                                "Only glaucoma patients",
                                "Only on the first visit",
                                "Only patients over 60"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "IOP is measured for all patients at all visits, as "
                                   "raised pressure is often symptomless.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "When measuring IOP, which eye is done first by convention?",
                    "options": ["The right eye", "The left eye",
                                "Whichever has higher pressure", "Both together"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "By convention the right eye is measured first.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What must you do to the machine parts that come near the "
                            "patient before and after NCT?",
                    "options": ["Wipe them with alcohol wipes and perform hand hygiene",
                                "Leave them as they are",
                                "Rinse them with tap water only",
                                "Replace them after every patient"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Wipe the contact parts with alcohol wipes and do "
                                   "hand hygiene before and after, for infection "
                                   "control.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why are glasses or contact lenses removed before NCT?",
                    "options": ["They interfere with the air-puff measurement",
                                "They improve the reading",
                                "They protect the cornea",
                                "It is only for comfort"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Glasses and contact lenses interfere with the "
                                   "air-puff measurement, so they are removed first.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Is the air-puff tonometer a contact or non-contact device?",
                    "options": ["Non-contact", "Contact",
                                "Semi-contact with gel", "It uses a probe"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "The air-puff tonometer is non-contact — nothing "
                                   "touches the eye.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL factors that can make an NCT reading unreliable.",
                    "options": ["Blinking or poor cooperation",
                                "Poor positioning or alignment",
                                "Wearing glasses during the test",
                                "Sitting still and looking straight ahead"],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Blinking/poor cooperation, poor positioning, and "
                                   "leaving glasses on all reduce reliability. Sitting "
                                   "still and fixating is correct technique.",
                    "reasoning_eligible": False,
                },
            ],
            "medium": [
                {
                    "stem": "NCT readings remain unreliable despite re-testing. What is "
                            "the appropriate next step?",
                    "options": ["Refer for Goldmann applanation tonometry",
                                "Record the unreliable value and move on",
                                "Double the reading",
                                "Skip IOP for this visit"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "If NCT stays unreliable, refer for Goldmann "
                                   "applanation tonometry, the more accurate contact "
                                   "method.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "An asymptomatic patient has IOP 26/24 mmHg. What should "
                            "you do?",
                    "options": [
                        "Confirm on repeat and flag for assessment — it is above "
                        "normal",
                        "Ignore it because the patient feels fine",
                        "Tell the patient they have glaucoma",
                        "Re-test only if symptoms appear",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "26/24 mmHg is above the normal 10-21 range. "
                                   "Glaucoma is often symptomless, so confirm on repeat "
                                   "and flag for assessment.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why might the air-puff tonometer overestimate at higher "
                            "pressures?",
                    "options": [
                        "NCT tends to read higher than true IOP at high pressures",
                        "It always reads lower than true IOP",
                        "It cannot measure above 21 mmHg",
                        "Air puffs lower the pressure as they measure",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "The air-puff method tends to overestimate at higher "
                                   "IOP values, so high NCT readings are often "
                                   "confirmed by applanation.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Name two common causes of an unreliable NCT reading.",
                    "options": [
                        "Blinking/poor cooperation and poor positioning/alignment",
                        "Good fixation and correct alignment",
                        "Removing glasses and sitting still",
                        "A calm patient and a clean machine",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Blinking or poor cooperation and poor "
                                   "positioning/alignment are the common causes of "
                                   "unreliable NCT readings.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why is raised IOP important to detect even when the "
                            "patient has no symptoms?",
                    "options": [
                        "Glaucoma can silently damage the optic nerve before symptoms "
                        "appear",
                        "Raised IOP always causes obvious pain",
                        "It has no effect unless symptomatic",
                        "Symptomless pressure is never harmful",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Chronic glaucoma is usually painless and can damage "
                                   "vision before the patient notices — which is why "
                                   "IOP is checked routinely.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why is alcohol-wiping the contact parts before AND after "
                            "each patient important?",
                    "options": [
                        "To prevent cross-infection between patients",
                        "To improve the air-puff strength",
                        "To calibrate the machine",
                        "It is optional and only cosmetic",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Cleaning the parts that approach the eye prevents "
                                   "cross-infection between patients — basic infection "
                                   "control.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A single NCT reading is borderline high. What is good "
                            "practice before flagging it?",
                    "options": [
                        "Repeat to confirm, ensuring good cooperation and alignment",
                        "Report it as definite glaucoma",
                        "Discard it without repeating",
                        "Average it with the other eye",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Confirm a borderline reading by repeating it with "
                                   "good technique before flagging — single readings "
                                   "can be falsely high.",
                    "reasoning_eligible": False,
                },
            ],
            "hard": [
                {
                    "stem": "A patient's NCT reads 32 mmHg but they blink hard on every "
                            "puff and won't hold still. How do you proceed?",
                    "options": [
                        "Re-attempt with coaching/alignment; if still unreliable, "
                        "refer for Goldmann applanation",
                        "Record 32 mmHg as the definitive pressure",
                        "Assume the eye is normal and move on",
                        "Tell the patient they need surgery",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Blinking and poor fixation make the reading "
                                   "unreliable. Re-attempt with coaching; if it stays "
                                   "unreliable, refer for Goldmann applanation rather "
                                   "than trusting the figure.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why is a high NCT reading usually confirmed by Goldmann "
                            "applanation before acting on it?",
                    "options": [
                        "Air-puff tends to overestimate at high IOP, so applanation "
                        "gives a more accurate value",
                        "Goldmann always reads higher than NCT",
                        "NCT cannot detect high pressure at all",
                        "Applanation is faster than NCT",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Because the air-puff can overestimate at high "
                                   "pressures, a high NCT is confirmed with the more "
                                   "accurate Goldmann applanation before decisions are "
                                   "made.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL steps that improve the reliability of an NCT "
                            "measurement.",
                    "options": [
                        "Remove glasses/contact lenses first",
                        "Align and position the patient correctly",
                        "Encourage the patient to keep the eye open and fixate",
                        "Take the reading while the patient is mid-blink",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Removing lenses, correct alignment, and steady "
                                   "fixation all improve reliability. Measuring "
                                   "mid-blink does the opposite.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "An asymptomatic 55-year-old has IOP 27 mmHg confirmed on "
                            "repeat, with a family history of glaucoma. Why is this "
                            "important?",
                    "options": [
                        "Raised IOP plus family history raises glaucoma risk — flag "
                        "for assessment though the patient feels well",
                        "It is harmless because there are no symptoms",
                        "Family history is irrelevant to IOP",
                        "27 mmHg is within the normal range",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Confirmed raised IOP with a family history "
                                   "increases glaucoma risk. Because early glaucoma is "
                                   "symptomless, it must be flagged for assessment.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why does measuring IOP at every visit matter for a patient "
                            "already on glaucoma drops?",
                    "options": [
                        "It checks that treatment is keeping the pressure controlled "
                        "over time",
                        "It is only needed once at diagnosis",
                        "Drops make IOP irrelevant",
                        "It is done purely for records",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Serial IOP measurements show whether the treatment "
                                   "is controlling the pressure and guide any "
                                   "adjustments.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Which statement about NCT versus Goldmann applanation is "
                            "correct?",
                    "options": [
                        "NCT is a quick non-contact screen; Goldmann applanation is "
                        "the more accurate contact reference",
                        "Goldmann is non-contact and less accurate",
                        "They are identical methods",
                        "NCT requires anaesthetic drops; Goldmann does not",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "NCT is a fast, non-contact screen; Goldmann "
                                   "applanation (a contact method) is the more accurate "
                                   "reference used to confirm.",
                    "reasoning_eligible": False,
                },
            ],
        },
        "eye_drops": {
            "easy": [
                {
                    "stem": "Before instilling an eye drop, what must you confirm about "
                            "the eye?",
                    "options": ["The correct eye (right, left, or both)",
                                "The colour of the iris",
                                "The patient's distance vision",
                                "Whether the patient wears glasses"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Always confirm the correct eye (right, left or "
                                   "both) before instilling a drop.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What must you check about the patient before instilling a "
                            "drop?",
                    "options": ["That they are not allergic to it",
                                "Their favourite colour",
                                "Their height",
                                "Whether they had breakfast"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Check the patient is not allergic to the drug "
                                   "before instilling it.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Where is an eye drop instilled?",
                    "options": ["Into the lower fornix (pull the lower lid down)",
                                "Directly onto the cornea (the clear centre)",
                                "Onto the upper lid",
                                "Into the corner near the nose only"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Gently pull the lower lid down and instil the drop "
                                   "into the lower fornix.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "After instilling a drop, what should the patient do?",
                    "options": [
                        "Close the eye gently and apply light pressure over the "
                        "nasolacrimal area",
                        "Blink rapidly for a minute",
                        "Rub the eye firmly",
                        "Tilt the head forward and open the eye wide",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Ask the patient to close the eye gently and press "
                                   "lightly over the nasolacrimal area (inner corner).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL details you should document for eye drop "
                            "instillation.",
                    "options": ["The diagnosis or purpose",
                                "The drop name and strength",
                                "The eye(s) treated",
                                "The patient's shoe size"],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "Document the purpose, the drug name and strength, "
                                   "and the eye(s) treated. Shoe size is irrelevant.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why pull the lower lid down and tilt the head back when "
                            "instilling a drop?",
                    "options": ["To expose the lower fornix so the drop lands correctly",
                                "To dilate the pupil",
                                "To reduce the eye pressure",
                                "To test the visual field"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Tilting back and pulling the lower lid down exposes "
                                   "the lower fornix so the drop lands where it should.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A patient says a previous drop made the eye itchy and "
                            "swollen. What should you do?",
                    "options": [
                        "Treat it as a drug allergy — do not use that drop and flag it "
                        "clearly",
                        "Use it anyway in a smaller dose",
                        "Use it in the other eye instead",
                        "Ignore it as a coincidence",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Itching and swelling after a drop suggests an "
                                   "allergy — avoid that drop and flag it clearly in "
                                   "the record.",
                    "reasoning_eligible": True,
                },
            ],
            "medium": [
                {
                    "stem": "Why apply light pressure over the nasolacrimal area after "
                            "instillation?",
                    "options": [
                        "To reduce systemic absorption and keep the drop in the eye",
                        "To raise the eye pressure",
                        "To speed up tear production",
                        "To dilate the pupil",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Pressing over the inner corner (punctal occlusion) "
                                   "slows drainage into the nose, reducing systemic "
                                   "absorption and keeping the drug on the eye.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why confirm the correct eye AND the correct drug before "
                            "instilling?",
                    "options": [
                        "To avoid wrong-eye or wrong-drug errors — a patient-safety "
                        "step",
                        "Because it speeds up the clinic",
                        "It is only needed for new patients",
                        "To decide the triage category",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Confirming the right eye and right drug prevents "
                                   "wrong-eye/wrong-drug errors — a core patient-safety "
                                   "check.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Two different drops are ordered for the same eye. What is "
                            "good practice?",
                    "options": [
                        "Wait a short interval between them so the first is not washed "
                        "out",
                        "Instil both at exactly the same moment",
                        "Mix them together first",
                        "Give only one and skip the other",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Leave a short gap between drops so the second does "
                                   "not wash out the first before it is absorbed.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why should the dropper tip not touch the eye or lashes?",
                    "options": [
                        "To keep the bottle sterile and avoid contaminating it",
                        "To make the drop bigger",
                        "To avoid magnifying the drug",
                        "It does not matter if it touches",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Touching the eye or lashes can contaminate the "
                                   "bottle, so the tip is kept clear of them.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A patient on multiple eye drops asks why the order and "
                            "timing matter. What is the best explanation?",
                    "options": [
                        "Spacing prevents one drop washing out another, so each works "
                        "properly",
                        "The order changes the colour of the drops",
                        "Timing only matters for tablets",
                        "It makes no real difference",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Spacing drops a few minutes apart stops the second "
                                   "from flushing out the first, so each is properly "
                                   "absorbed.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A frail patient cannot instil their own drops at home. "
                            "What is a helpful action?",
                    "options": [
                        "Teach a caregiver the technique and document the plan",
                        "Tell them to manage somehow",
                        "Double the dose to compensate",
                        "Stop the drops to avoid the problem",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Teaching a caregiver the correct technique (and "
                                   "documenting it) helps ensure the drops are actually "
                                   "given safely.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL correct steps in safe eye-drop instillation.",
                    "options": [
                        "Confirm the correct eye and drug",
                        "Check for allergy to the drug",
                        "Instil into the lower fornix without touching the eye",
                        "Have the patient rub the eye hard afterwards",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Confirm eye/drug, check allergy, and instil into "
                                   "the lower fornix without touching the eye. Rubbing "
                                   "hard afterwards is wrong — close gently instead.",
                    "reasoning_eligible": False,
                },
            ],
            "hard": [
                {
                    "stem": "A patient is prescribed a glaucoma drop with known "
                            "systemic side effects (e.g. a beta-blocker). Why does "
                            "punctal occlusion especially matter here?",
                    "options": [
                        "It reduces drainage into the bloodstream, lowering systemic "
                        "side effects",
                        "It makes the drop work only on the lashes",
                        "It increases the systemic dose deliberately",
                        "It has no effect on absorption",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Pressing the inner corner limits the drug draining "
                                   "into the nose and bloodstream, reducing systemic "
                                   "effects of drugs like beta-blocker drops.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "A patient reports their previous clinic gave a drop that "
                            "caused lip swelling and breathing difficulty. What is the "
                            "priority before any drop today?",
                    "options": [
                        "Verify and clearly flag the allergy; never use that agent and "
                        "alert the team",
                        "Give a small test amount of the same drop",
                        "Use it in the unaffected eye only",
                        "Proceed — it was probably unrelated",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Lip swelling and breathing difficulty suggest a "
                                   "serious allergic reaction. Verify, flag prominently, "
                                   "avoid the agent entirely and alert the team.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL measures that improve how much of an eye drop "
                            "actually reaches and stays on the eye.",
                    "options": [
                        "Instilling into the lower fornix, not onto the cornea",
                        "Closing the eye gently afterwards",
                        "Applying light pressure over the inner corner",
                        "Blinking hard and rubbing the eye",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Using the lower fornix, gentle closure and punctal "
                                   "occlusion all keep more drug on the eye. Blinking "
                                   "hard and rubbing wash it away.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why is instilling onto the lower fornix preferred over "
                            "dropping directly onto the cornea?",
                    "options": [
                        "It is more comfortable, less likely to make the patient "
                        "blink the drop out, and reaches the eye well",
                        "The cornea cannot absorb any drug",
                        "It magnifies the drug effect",
                        "It is required only for children",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "The cornea is very sensitive; a drop onto the lower "
                                   "fornix is more comfortable and less likely to be "
                                   "blinked straight out, while still reaching the eye.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A patient needs both a drop and an ointment in the same "
                            "eye. What is the correct order and why?",
                    "options": [
                        "Drop first, then ointment — the ointment would otherwise "
                        "block the drop from being absorbed",
                        "Ointment first, then drop, to seal it in",
                        "Either order, it makes no difference",
                        "Mix them on the lid first",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Give the drop first and the ointment last; "
                                   "ointment forms a barrier that would stop a "
                                   "subsequent drop being absorbed.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Which statement about safe eye-drop practice is correct?",
                    "options": [
                        "Confirm eye and drug, check allergies, avoid touching the "
                        "eye, and document what was given",
                        "Any drop can go in any eye if the patient agrees",
                        "Allergy checks are unnecessary for eye drops",
                        "Documentation is optional for routine drops",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Safe practice means confirming eye and drug, "
                                   "checking allergies, keeping the tip clean, and "
                                   "documenting the drug, strength and eye treated.",
                    "reasoning_eligible": False,
                },
            ],
        },
        "pupil_dilation": {
            "easy": [
                {
                    "stem": "Name a common dilating (mydriatic) drop.",
                    "options": ["Tropicamide 1%", "Chloramphenicol",
                                "Artificial tears", "Fluorescein"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Tropicamide 1% (or phenylephrine 2.5%) is a common "
                                   "dilating drop.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "How long do the effects of dilation usually last?",
                    "options": ["About 4-6 hours", "About 10 minutes",
                                "About 24 hours", "About a week"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Dilation effects typically last about 4-6 hours.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL effects you should warn the patient about after "
                            "dilation.",
                    "options": ["Blurred near vision", "Light sensitivity "
                                "(photophobia)", "Glare", "Permanent vision loss"],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Warn about blurred near vision, light sensitivity "
                                   "and glare for a few hours. Dilation does not cause "
                                   "permanent vision loss.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What is a contraindication to routine pupil dilation?",
                    "options": ["Narrow (drainage) angles",
                                "Short-sightedness",
                                "Wearing glasses",
                                "A history of dry eye"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Narrow drainage angles are a caution against "
                                   "routine dilation, which could trigger angle-closure.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL details you should document for a dilation.",
                    "options": ["The eye(s) dilated", "The pre-dilation pupil size",
                                "The drug, dose and time", "The patient's blood group"],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "Document the eye(s), the pre-dilation pupil size, "
                                   "and the drug/dose/time. Blood group is irrelevant.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why warn a patient who drove to the clinic about dilation?",
                    "options": ["Blurred vision and glare make driving unsafe for "
                                "several hours",
                                "Dilation improves their driving",
                                "It changes their eye colour",
                                "It has no effect on driving"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Dilation blurs near vision and causes glare, making "
                                   "driving unsafe for several hours — warn the patient.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What comfort measure can you offer after dilation?",
                    "options": ["Sunglasses / UV protectors for light sensitivity",
                                "An eye patch for a week",
                                "Reading without glasses",
                                "Bright lighting to help focus"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Offer sunglasses or UV protectors to ease the "
                                   "photosensitivity after dilation.",
                    "reasoning_eligible": False,
                },
            ],
            "medium": [
                {
                    "stem": "A patient mentions a previous acute angle-closure attack. "
                            "What should you do before dilating?",
                    "options": [
                        "Do not dilate routinely — check with the nurse/doctor first",
                        "Dilate as normal",
                        "Use a double dose to be sure",
                        "Dilate only the other eye",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A history of angle-closure is a contraindication to "
                                   "routine dilation — check with the nurse/doctor "
                                   "before proceeding.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why is the pre-dilation pupil size recorded?",
                    "options": [
                        "To document the baseline and monitor the dilation response",
                        "To calculate the IOL power",
                        "To set the air-puff strength",
                        "It is not actually needed",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Recording the starting pupil size gives a baseline "
                                   "and lets you judge how well the eye dilates.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why does dilation raise the fall risk in an elderly "
                            "patient?",
                    "options": [
                        "It blurs vision and adds light sensitivity on top of existing "
                        "risks",
                        "It makes the legs weak",
                        "It causes dizziness directly",
                        "It does not affect fall risk",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Blurred vision and photosensitivity from dilation "
                                   "add to an elderly patient's existing fall risk.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why must the correct eye(s) and drug be confirmed before "
                            "instilling a dilating drop?",
                    "options": [
                        "To avoid wrong-eye/wrong-drug errors and respect any "
                        "contraindication",
                        "Because dilating drops are harmless either way",
                        "Only to complete the paperwork",
                        "It is not necessary for dilating drops",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "As with any drop, confirm eye and drug — and check "
                                   "there is no contraindication such as narrow angles "
                                   "— before dilating.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "A patient asks why everything looks blurry up close after "
                            "their dilation. What is the best explanation?",
                    "options": [
                        "The dilating drop temporarily relaxes near focusing, so near "
                        "vision blurs for a few hours",
                        "The drop has damaged their reading vision",
                        "They need new reading glasses now",
                        "It means the dilation failed",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Dilating drops temporarily relax the eye's near "
                                   "focusing, blurring near vision for a few hours — it "
                                   "wears off.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "An unaccompanied elderly patient is about to be dilated for "
                            "a fundus check. What is a sensible safety step?",
                    "options": [
                        "Plan for safe escort/seating and warn about glare before they "
                        "leave",
                        "Tell them to drive home immediately",
                        "Dilate both eyes and discharge at once",
                        "Skip the safety advice to save time",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Because dilation increases fall and glare risk, "
                                   "plan safe seating/escort and give clear advice "
                                   "before the patient leaves.",
                    "reasoning_eligible": True,
                },
            ],
            "hard": [
                {
                    "stem": "A glaucoma-suspect patient with very shallow anterior "
                            "chambers is sent for dilation. Why should you pause and "
                            "check first?",
                    "options": [
                        "Dilating a narrow-angle eye risks triggering an "
                        "angle-closure attack",
                        "Dilation is always completely safe",
                        "Shallow chambers make dilation more effective",
                        "Narrow angles only matter for cataract surgery",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "In a narrow-angle eye, dilation can precipitate "
                                   "acute angle-closure glaucoma — verify with the "
                                   "nurse/doctor before instilling.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL appropriate actions when dilating an elderly "
                            "patient who came alone.",
                    "options": [
                        "Record pre-dilation pupil size and the drug/time",
                        "Warn about blurred near vision and glare",
                        "Offer sunglasses and ensure safe seating",
                        "Reassure them it is safe to drive straight after",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Document, warn about blur/glare, and ensure safety "
                                   "(sunglasses, seating). Do NOT reassure them to drive "
                                   "immediately — dilation makes driving unsafe.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why is a careful history essential before routine "
                            "dilation, even in a busy clinic?",
                    "options": [
                        "It uncovers contraindications (narrow angles, prior "
                        "angle-closure) that change whether to dilate",
                        "It is only for billing",
                        "Dilation never has contraindications",
                        "History has no bearing on dilation",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "A quick history can reveal narrow angles or a prior "
                                   "attack — contraindications that must be checked "
                                   "before dilating.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "After dilation a patient develops a painful red eye with "
                            "haloes and a hazy cornea. What has likely happened and "
                            "what do you do?",
                    "options": [
                        "Possible acute angle-closure triggered by dilation — escalate "
                        "urgently",
                        "Normal dilation effect — reassure and discharge",
                        "A drug allergy — give antihistamine and wait",
                        "Simple dry eye — give lubricants",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Pain, haloes and a hazy cornea after dilation "
                                   "suggest an acute angle-closure attack — a "
                                   "sight-threatening emergency to escalate at once.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Which statement about pupil dilation is correct?",
                    "options": [
                        "It aids fundus/retinal examination but needs a check for "
                        "narrow angles and clear after-care advice",
                        "It permanently enlarges the pupil",
                        "It is safe in every patient without checking",
                        "It improves the patient's reading vision",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Dilation helps examine the retina but requires "
                                   "screening for narrow angles and after-care advice "
                                   "about blur, glare and safety.",
                    "reasoning_eligible": False,
                },
            ],
        },
        "colour_vision": {
            "easy": [
                {
                    "stem": "What does the Ishihara chart test for?",
                    "options": ["Colour vision deficiency (commonly red-green)",
                                "Visual field loss",
                                "Eye pressure",
                                "Near vision"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "The Ishihara chart tests for colour vision "
                                   "deficiency, most often red-green.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "How does the patient respond to an Ishihara plate?",
                    "options": ["By identifying the number formed within the coloured "
                                "dots",
                                "By pressing a buzzer when they see light",
                                "By reading letters on a chart",
                                "By following a moving target"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "The patient names the number hidden within the "
                                   "coloured dots of each plate.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "How is an Ishihara result documented?",
                    "options": ["As the number of plates read correctly",
                                "As a Snellen fraction",
                                "As mmHg",
                                "As N5"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "The result is recorded as the number of plates read "
                                   "correctly (e.g. 13/17).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "How is each eye tested with the Ishihara chart?",
                    "options": ["Separately (one eye at a time)",
                                "Both eyes together only",
                                "With both eyes closed",
                                "Only the better eye"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Each eye is tested separately so a one-sided defect "
                                   "is not missed.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Which plate version helps a patient who cannot read "
                            "numbers?",
                    "options": ["The winding-line (tracing) plates",
                                "The tumbling E chart",
                                "The Amsler grid",
                                "The Goldmann chart"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Winding-line (tracing) plates let the patient trace "
                                   "a path instead of reading a number.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why ensure good lighting and no tinted lenses during the "
                            "Ishihara test?",
                    "options": ["To keep the test valid and avoid false results",
                                "To make the colours brighter than real life",
                                "To speed up the test",
                                "It does not matter"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Tinted lenses or poor lighting can change how "
                                   "colours appear, giving false results — so they are "
                                   "avoided.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A reduced number of plates read correctly suggests what?",
                    "options": ["A colour vision deficiency",
                                "Perfect colour vision",
                                "A cataract",
                                "Raised eye pressure"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Reading fewer plates correctly than expected "
                                   "suggests a colour vision deficiency.",
                    "reasoning_eligible": False,
                },
            ],
            "medium": [
                {
                    "stem": "Is congenital colour deficiency usually symmetrical or "
                            "asymmetrical?",
                    "options": ["Symmetrical (both eyes) and lifelong",
                                "Asymmetrical and recent",
                                "Present in one eye only",
                                "It comes and goes"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Congenital colour deficiency is usually symmetrical "
                                   "(both eyes equally) and lifelong.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "A recent colour change that is worse in one eye suggests "
                            "congenital or acquired deficiency?",
                    "options": ["Acquired — it needs doctor review",
                                "Congenital — no action needed",
                                "Normal ageing — reassure",
                                "A testing error only"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A recent, one-eye-worse change points to an "
                                   "acquired cause (e.g. optic nerve disease) and needs "
                                   "doctor review.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "How do you adapt the Ishihara test for a patient who "
                            "cannot read numbers (e.g. a young child or non-reader)?",
                    "options": ["Use the winding-line (tracing) plates",
                                "Skip the test entirely",
                                "Read the numbers out for them",
                                "Use the Snellen chart instead"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Winding-line plates let non-readers trace the path, "
                                   "so the test still works.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why is each eye tested separately for colour vision?",
                    "options": [
                        "A one-sided (acquired) defect would be missed if both eyes "
                        "were tested together",
                        "It is faster than testing together",
                        "The plates only work for one eye",
                        "It has no real reason",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Testing eyes separately catches a one-sided "
                                   "(acquired) defect that binocular testing could "
                                   "mask.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why might colour vision testing be required for certain "
                            "occupations?",
                    "options": [
                        "Some jobs (e.g. pilots, electricians) depend on accurate "
                        "colour discrimination for safety",
                        "It predicts the patient's eye pressure",
                        "It replaces a vision test",
                        "It is only for cosmetic interest",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Colour discrimination matters for safety-critical "
                                   "jobs, so colour vision is screened for some "
                                   "occupations.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL conditions for a valid Ishihara test.",
                    "options": ["Good, natural-style lighting",
                                "No tinted lenses worn",
                                "Each eye tested separately",
                                "The patient guessing quickly under time pressure"],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Good lighting, no tinted lenses and separate eye "
                                   "testing keep the test valid. Rushing/guessing does "
                                   "not.",
                    "reasoning_eligible": False,
                },
            ],
            "hard": [
                {
                    "stem": "A 30-year-old reports their colour vision suddenly seems "
                            "'washed out' in the LEFT eye over two weeks, with some eye "
                            "ache on movement. Why is this concerning?",
                    "options": [
                        "A recent, one-sided acquired colour defect can signal optic "
                        "nerve disease (e.g. optic neuritis) — refer",
                        "It is simple congenital colour blindness",
                        "Colour vision cannot change in adults",
                        "It is a normal finding, reassure",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A recent unilateral acquired colour defect, "
                                   "especially with pain on eye movement, suggests "
                                   "optic nerve disease such as optic neuritis and "
                                   "needs prompt review.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "How does the pattern of a defect help distinguish "
                            "congenital from acquired colour deficiency?",
                    "options": [
                        "Congenital is symmetrical, stable and lifelong; acquired is "
                        "often one-sided, recent or changing",
                        "They are impossible to tell apart",
                        "Congenital is always one-sided",
                        "Acquired is always symmetrical and lifelong",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Congenital deficiency is symmetrical and stable; "
                                   "acquired deficiency tends to be asymmetrical, recent "
                                   "or progressive — a key clue to refer.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL findings that should prompt referral after a "
                            "colour vision test.",
                    "options": [
                        "A new, one-eye-worse colour defect",
                        "A colour change that is getting worse over weeks",
                        "Associated reduced vision or eye-movement pain",
                        "A lifelong, symmetrical red-green deficiency with no change",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "New, asymmetrical, progressive defects or those "
                                   "with other symptoms warrant referral. A stable "
                                   "lifelong symmetrical deficiency usually does not.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why should a tinted contact lens or coloured glasses be "
                            "removed before Ishihara testing?",
                    "options": [
                        "They alter the colours the patient perceives and invalidate "
                        "the result",
                        "They make the test faster",
                        "They improve the patient's true colour vision",
                        "They have no effect on the plates",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Tinted lenses change the perceived colours, so they "
                                   "must be removed for a valid Ishihara result.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A patient reads most plates but misses several specific "
                            "red-green plates equally in both eyes, and says it has "
                            "always been so. What is the most likely interpretation?",
                    "options": [
                        "A congenital red-green deficiency (symmetrical, lifelong)",
                        "An acquired optic nerve problem",
                        "A cataract in one eye",
                        "A testing artefact only",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Symmetrical, lifelong red-green errors are typical "
                                   "of a congenital deficiency rather than an acquired "
                                   "disease.",
                    "reasoning_eligible": False,
                },
            ],
        },
        "amsler_macula": {
            "easy": [
                {
                    "stem": "What does the Amsler grid detect?",
                    "options": ["Central field defects and distortion "
                                "(metamorphopsia)",
                                "Eye pressure",
                                "Colour vision",
                                "Peripheral field loss only"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "The Amsler grid detects central field defects and "
                                   "metamorphopsia (distortion of straight lines).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What does the patient fixate on during the Amsler test?",
                    "options": ["The central dot",
                                "The top-left corner",
                                "A moving target",
                                "The examiner's finger"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "The patient stares at the central dot and reports "
                                   "any distortion or missing areas around it.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "How is each eye tested with the Amsler grid?",
                    "options": ["One eye at a time (cover the other)",
                                "Both eyes together",
                                "With both eyes shut",
                                "Only the worse eye"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Each eye is tested separately, covering the other, "
                                   "so a one-sided change is not missed.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Which condition is commonly monitored with the Amsler "
                            "grid?",
                    "options": ["Macular disease such as age-related macular "
                                "degeneration (AMD)",
                                "Glaucoma",
                                "Cataract",
                                "Conjunctivitis"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "The Amsler grid is used to monitor macular disease, "
                                   "especially AMD.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What does 'metamorphopsia' mean?",
                    "options": ["Straight lines appear wavy or distorted",
                                "Loss of all vision",
                                "Seeing double",
                                "Sensitivity to light"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Metamorphopsia means distortion — straight lines "
                                   "look wavy or bent.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Should reading correction be worn for the Amsler test?",
                    "options": ["Yes, at the usual near distance",
                                "No, always test unaided",
                                "Only distance glasses",
                                "Only sunglasses"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "The grid is viewed at the usual near distance with "
                                   "reading correction, since it tests central near "
                                   "vision.",
                    "reasoning_eligible": False,
                },
            ],
            "medium": [
                {
                    "stem": "A patient reports wavy lines on the Amsler grid. What does "
                            "this suggest?",
                    "options": ["Metamorphopsia — possible macular disease; flag for "
                                "review",
                                "Normal vision",
                                "Glaucoma",
                                "A refractive error only"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Wavy lines (metamorphopsia) suggest a macular "
                                   "problem and should be flagged for review.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "A new missing patch (scotoma) appears on the grid. What do "
                            "you do?",
                    "options": ["Treat it as abnormal and escalate to the doctor "
                                "promptly",
                                "Ignore it as normal",
                                "Repeat in a year",
                                "Reassure and discharge"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A new scotoma is abnormal and should be escalated "
                                   "promptly — it may signal active macular disease.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why should AMD patients monitor with an Amsler grid at "
                            "home?",
                    "options": [
                        "To detect new distortion early, which can signal treatable "
                        "progression",
                        "To measure their own eye pressure",
                        "To replace clinic visits entirely",
                        "It has no real benefit",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Home Amsler monitoring helps AMD patients catch new "
                                   "distortion early, when treatment may still help.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "New distortion plus reduced vision in a known AMD patient — "
                            "how urgent is this?",
                    "options": ["Prompt doctor review (possible wet AMD)",
                                "Routine review within a year",
                                "No review needed",
                                "Only if both eyes are affected"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "New distortion with reduced vision in AMD may mean "
                                   "conversion to wet AMD — it needs prompt doctor "
                                   "review.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why must the patient keep fixating on the central dot "
                            "throughout the Amsler test?",
                    "options": [
                        "So defects are mapped relative to the centre of vision (the "
                        "macula)",
                        "To keep the eye from drying out",
                        "To dilate the pupil",
                        "It is not actually necessary",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Steady central fixation lets distortions or "
                                   "scotomas be located relative to the centre of "
                                   "vision, where the macula projects.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL findings on the Amsler grid that should be "
                            "flagged.",
                    "options": ["Wavy or bent lines",
                                "A new blurred or missing patch",
                                "Lines that look faded or distorted",
                                "A perfectly square, even grid"],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Wavy lines, missing patches and distortion are all "
                                   "abnormal and should be flagged. A perfectly even "
                                   "grid is normal.",
                    "reasoning_eligible": False,
                },
            ],
            "hard": [
                {
                    "stem": "An AMD patient on treatment notices, on home Amsler "
                            "testing, that a previously straight line is now wavy and "
                            "there is a new grey patch. What should they be advised?",
                    "options": [
                        "Contact the clinic promptly — it may indicate disease "
                        "activity needing review",
                        "Wait for the next routine yearly appointment",
                        "Stop all treatment immediately",
                        "Ignore it — distortion is expected",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "New distortion and a fresh scotoma can signal "
                                   "active (wet) AMD; the patient should contact the "
                                   "clinic promptly rather than wait.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why is the Amsler grid a useful complement to a macular "
                            "OCT rather than a replacement?",
                    "options": [
                        "Amsler is a quick subjective check of central distortion; OCT "
                        "objectively images the retinal structure",
                        "Amsler measures retinal thickness precisely",
                        "OCT cannot detect macular disease",
                        "They test completely unrelated things",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "The Amsler grid is a fast subjective screen for "
                                   "distortion that the patient can do at home; OCT "
                                   "gives the objective structural detail in clinic. "
                                   "They complement each other.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL points of good Amsler technique.",
                    "options": [
                        "Wear reading correction at the usual near distance",
                        "Test one eye at a time, covering the other",
                        "Keep fixation on the central dot",
                        "Scan the eyes around the grid looking for defects",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Use reading correction, test each eye separately, "
                                   "and hold central fixation. Letting the eye wander "
                                   "around the grid defeats the test.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why does the Amsler grid mainly reveal CENTRAL problems "
                            "rather than peripheral ones?",
                    "options": [
                        "It maps the small central area of vision served by the "
                        "macula",
                        "It is too large to test the centre",
                        "It only tests the peripheral retina",
                        "It measures the optic nerve, not the retina",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Held at near with central fixation, the grid maps "
                                   "the central visual field served by the macula, so "
                                   "it picks up central distortion and scotomas.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A patient's Amsler shows distortion only when you remind "
                            "them to keep their reading glasses on. What does this "
                            "highlight about technique?",
                    "options": [
                        "Using the correct near correction is essential or the result "
                        "can be misleading",
                        "Reading glasses cause false distortion",
                        "The grid should be done without any correction",
                        "Technique does not affect the result",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "The grid must be viewed clearly at the proper near "
                                   "distance with correction; otherwise blur can mimic "
                                   "or hide true macular distortion.",
                    "reasoning_eligible": True,
                },
            ],
        },
        "fall_risk": {
            "easy": [
                {
                    "stem": "How often are patients assessed for fall risk?",
                    "options": ["Every visit (all patients)",
                                "Only after a fall",
                                "Only on the first visit",
                                "Only patients over 80"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Fall risk is assessed at every visit for all "
                                   "patients.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL groups that are at high risk of falls.",
                    "options": ["The elderly", "The visually impaired",
                                "Post-dilation patients", "Healthy young patients"],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "The elderly, the visually impaired and "
                                   "post-dilation patients are high-risk for falls.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "If a patient is high fall risk, what must you document?",
                    "options": ["The action taken (e.g. accompany, wheelchair)",
                                "Only the risk score",
                                "Nothing — documentation is optional",
                                "Their distance vision only"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Document the action taken (e.g. accompany the "
                                   "patient, provide a wheelchair), not just the risk.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why does dilation increase fall risk?",
                    "options": ["It blurs vision and causes light sensitivity",
                                "It weakens the legs",
                                "It lowers blood pressure",
                                "It does not affect falls"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Dilation blurs vision and causes light sensitivity, "
                                   "making the patient less steady.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Is documenting the fall risk enough on its own?",
                    "options": ["No — you must also take active measures",
                                "Yes — documenting is sufficient",
                                "Only if the patient is elderly",
                                "Only if a fall has already happened"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Documenting is not enough — you must take active "
                                   "measures to keep the patient safe.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Who should you inform about a high-fall-risk patient?",
                    "options": ["The nurse-in-charge / relevant staff",
                                "No one",
                                "Only the patient",
                                "The receptionist only"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Inform the nurse-in-charge or relevant staff so the "
                                   "team can keep the patient safe.",
                    "reasoning_eligible": False,
                },
            ],
            "medium": [
                {
                    "stem": "An elderly, post-dilation patient is unaccompanied with no "
                            "walking aid. What is the risk level and response?",
                    "options": ["High fall risk — take active measures",
                                "Low risk — no action needed",
                                "Risk only if they complain",
                                "Routine — just document"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Elderly + post-dilation + unaccompanied + no aid = "
                                   "high fall risk; take active measures, don't just "
                                   "note it.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL appropriate active measures for a high-fall-risk "
                            "patient.",
                    "options": ["Accompany and seat them safely",
                                "Alert the nurse-in-charge",
                                "Offer a wheelchair",
                                "Leave them to walk out alone quickly"],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Accompany/seat safely, alert the nurse, and offer a "
                                   "wheelchair. Leaving them to walk out alone is the "
                                   "opposite of safe.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A patient looks well but admits a recent near-fall and a "
                            "new sedative. How do you classify them?",
                    "options": [
                        "At risk — screening uncovers hidden risk, so act on it",
                        "Low risk — they look fine",
                        "No risk — sedatives don't matter",
                        "Risk only if they fall in clinic",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A near-fall and a new sedative are hidden risks "
                                   "that screening reveals — treat the patient as at "
                                   "risk despite looking well.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why does severe visual field loss raise fall risk even "
                            "with good central vision?",
                    "options": [
                        "Loss of side vision makes navigating obstacles hazardous",
                        "Central vision is all that matters for walking",
                        "Field loss improves balance",
                        "It has no effect on falls",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Side (peripheral) vision warns of obstacles; losing "
                                   "it makes moving around hazardous even when central "
                                   "vision is sharp.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why is fall risk screened for EVERY patient rather than "
                            "only obvious cases?",
                    "options": [
                        "Some at-risk patients look well, so routine screening catches "
                        "hidden risk",
                        "It is a billing requirement only",
                        "Only elderly patients ever fall",
                        "It replaces the eye examination",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Routine screening catches at-risk patients who look "
                                   "well (e.g. on new sedatives, recent near-fall) and "
                                   "would otherwise be missed.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A patient becomes unsteady after dilation in a brightly "
                            "lit waiting area. What is the best immediate action?",
                    "options": [
                        "Seat them safely, offer shade/sunglasses, and alert staff",
                        "Tell them to hurry to the exit",
                        "Turn up the lights further",
                        "Ignore it — dilation always feels like that",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Seat them safely, reduce glare (shade/sunglasses), "
                                   "and alert staff — practical measures to prevent a "
                                   "fall.",
                    "reasoning_eligible": False,
                },
            ],
            "hard": [
                {
                    "stem": "An 82-year-old with glaucoma field loss, on a new sleeping "
                            "tablet, attends alone and will be dilated. Why is this a "
                            "high-risk combination, and what do you do?",
                    "options": [
                        "Multiple risks stack (age, field loss, sedative, dilation, "
                        "alone) — arrange escort/wheelchair and alert the nurse",
                        "Each factor is minor, so no action is needed",
                        "Only the dilation matters; ignore the rest",
                        "Tell them to drive home carefully",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Age, field loss, a sedative, dilation and being "
                                   "alone all add up to high risk. Arrange an "
                                   "escort/wheelchair and alert the nurse-in-charge.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL factors that should raise your fall-risk "
                            "concern, even individually.",
                    "options": [
                        "Recent dilation",
                        "Severe visual field loss",
                        "A new sedative medication",
                        "Arriving with a steady, accompanying relative",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Dilation, field loss and new sedatives each raise "
                                   "fall risk. Arriving with a steady companion lowers "
                                   "it.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why is 'the patient looked fine so I just noted low risk' "
                            "an unsafe approach?",
                    "options": [
                        "Appearance can hide real risk (sedatives, field loss, "
                        "near-falls); screening and action are needed",
                        "Looking fine always proves low risk",
                        "Documentation alone keeps patients safe",
                        "Fall risk is not the clinic's concern",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "A well-looking patient can still be high-risk; you "
                                   "must screen properly and take action, not judge by "
                                   "appearance alone.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "After a high-risk patient is identified, what completes "
                            "the safe response?",
                    "options": [
                        "Take an active measure AND document it AND inform the "
                        "relevant staff",
                        "Document the score and nothing more",
                        "Tell the patient to be careful",
                        "Wait to see if they fall",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Safe practice combines an active measure "
                                   "(escort/wheelchair/seating), documentation, and "
                                   "informing staff — all three.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Which statement about fall-risk management is correct?",
                    "options": [
                        "Screen everyone, act on risk, and communicate it — not just "
                        "record a number",
                        "Only assess patients who have already fallen",
                        "Documentation by itself prevents falls",
                        "Dilation and field loss are unrelated to falls",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Good fall-risk management means universal "
                                   "screening, active measures, and communication — "
                                   "documentation alone is not enough.",
                    "reasoning_eligible": False,
                },
            ],
        },
        "perioperative": {
            "easy": [
                {
                    "stem": "Select ALL results typically recorded in a pre-operative "
                            "assessment.",
                    "options": ["ECG", "Blood pressure",
                                "Blood sugar", "Favourite food"],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "A pre-op assessment records results such as ECG, "
                                   "blood pressure and blood/urine sugar.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What is covered in pre-operative counselling?",
                    "options": [
                        "Date of surgery, current medications and fasting requirement",
                        "The patient's hobbies",
                        "Only the surgery fee",
                        "The colour of the theatre gown",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Pre-op counselling covers the surgery date, current "
                                   "medications and the fasting requirement.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "For cataract surgery, what vision is recorded at the "
                            "post-op dressing?",
                    "options": ["Vision pre-surgery and post-surgery",
                                "Only the pre-surgery vision",
                                "Only colour vision",
                                "No vision is recorded"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "At the post-op dressing, both the pre-surgery and "
                                   "post-surgery vision are recorded.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL structures observed during a post-op dressing.",
                    "options": ["The lids", "The conjunctiva",
                                "The wound section", "The patient's ears"],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "The lids, conjunctiva and wound section are "
                                   "inspected at the post-op dressing.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Abnormal post-op findings should be reported to whom?",
                    "options": ["The nurse-in-charge", "No one",
                                "The receptionist", "Another patient"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Report any abnormal post-op finding to the "
                                   "nurse-in-charge.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why is fasting status documented before surgery?",
                    "options": [
                        "To ensure the patient is safely prepared for "
                        "anaesthesia/surgery",
                        "To decide the lunch order",
                        "It is not actually needed",
                        "To calculate the IOL power",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Fasting status is documented to ensure the patient "
                                   "is safe for anaesthesia and surgery.",
                    "reasoning_eligible": False,
                },
            ],
            "medium": [
                {
                    "stem": "Select ALL abnormal lid/conjunctiva findings to watch for "
                            "after surgery.",
                    "options": ["Lid oedema or redness", "Discharge",
                                "Conjunctival redness or chemosis",
                                "A calm, white, comfortable eye"],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Lid oedema/redness, discharge and conjunctival "
                                   "redness/chemosis are abnormal. A calm white eye is "
                                   "the normal, reassuring finding.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL wound-section problems to look for after "
                            "surgery.",
                    "options": ["Haematoma", "Loose sutures",
                                "Signs of infection", "A clean, intact wound"],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Watch for haematoma, loose sutures and signs of "
                                   "infection at the wound. A clean intact wound is "
                                   "normal.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why is an anticoagulant important in pre-op planning?",
                    "options": [
                        "It increases bleeding risk and may affect the surgical plan",
                        "It improves wound healing",
                        "It changes the IOL power",
                        "It has no surgical relevance",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Anticoagulants raise bleeding risk and may change "
                                   "how or when surgery is done, so they must be known "
                                   "beforehand.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "A patient has increasing pain, redness and worsening "
                            "vision a few days after surgery. What is the concern?",
                    "options": [
                        "A serious complication such as endophthalmitis — escalate "
                        "urgently",
                        "Normal healing — reassure and discharge",
                        "A refractive change — order glasses",
                        "Dry eye — give lubricants",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Increasing pain, redness and falling vision after "
                                   "surgery suggest endophthalmitis (infection inside "
                                   "the eye) — a sight-threatening emergency to "
                                   "escalate urgently.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why confirm current medications during pre-op counselling?",
                    "options": [
                        "Some drugs (e.g. anticoagulants) affect surgical safety and "
                        "planning",
                        "Only to fill the form",
                        "Medications never matter for eye surgery",
                        "To decide the appointment time",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Knowing current medications (especially blood "
                                   "thinners) is essential for surgical safety and "
                                   "planning.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A diabetic patient's blood sugar is very high on the "
                            "morning of surgery. What is the appropriate step?",
                    "options": ["Flag it to the nurse/doctor before the patient "
                                "proceeds",
                                "Proceed regardless",
                                "Send the patient home without telling anyone",
                                "Give them sugar to balance it"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Abnormal pre-op results (like very high blood "
                                   "sugar) should be flagged to the nurse/doctor before "
                                   "surgery proceeds.",
                    "reasoning_eligible": True,
                },
            ],
            "hard": [
                {
                    "stem": "A patient returns 3 days after cataract surgery with "
                            "increasing pain, a red eye, a hypopyon and dropping "
                            "vision. What is the likely diagnosis and action?",
                    "options": [
                        "Endophthalmitis — escalate as a sight-threatening emergency",
                        "Normal post-op inflammation — reassure",
                        "A stye — warm compresses",
                        "Allergic reaction — antihistamine",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Worsening pain, redness, a hypopyon and falling "
                                   "vision after surgery are classic for "
                                   "endophthalmitis — escalate immediately.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL post-op findings that warrant urgent "
                            "escalation rather than routine reassurance.",
                    "options": [
                        "Increasing pain with worsening vision",
                        "A hypopyon (pus in the anterior chamber)",
                        "Marked, increasing redness and discharge",
                        "A comfortable white eye with stable vision",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Worsening pain/vision, a hypopyon, and "
                                   "increasing redness/discharge are red flags. A "
                                   "comfortable white eye with stable vision is "
                                   "reassuring.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why does a thorough pre-op assessment (vitals, sugars, "
                            "medications, fasting) matter beyond the eye itself?",
                    "options": [
                        "Systemic factors affect anaesthetic and surgical safety, not "
                        "just the eye",
                        "Only the eye matters in eye surgery",
                        "It is purely administrative",
                        "It replaces the surgeon's assessment",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Blood pressure, sugars, medications and fasting all "
                                   "affect how safely the patient tolerates anaesthesia "
                                   "and surgery — the whole patient matters.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why must the correct eye be confirmed (and marked) before "
                            "eye surgery?",
                    "options": [
                        "To prevent wrong-eye surgery — a critical safety step",
                        "To decide which eye is dilated",
                        "For billing purposes only",
                        "It is not really necessary",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Confirming and marking the correct eye prevents "
                                   "wrong-eye surgery, a never-event the whole team "
                                   "guards against.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A post-op patient is comfortable with a white eye but "
                            "their vision is the same as before surgery. What is the "
                            "appropriate interpretation?",
                    "options": [
                        "Recovery can take time; record findings and follow the normal "
                        "review plan, escalating only if red flags appear",
                        "This always means the surgery failed",
                        "Escalate as an emergency immediately",
                        "Tell the patient nothing will improve",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A quiet, comfortable eye without red flags is "
                                   "reassuring; vision often improves over the early "
                                   "recovery period. Record and follow the review plan, "
                                   "escalating only if warning signs appear.",
                    "reasoning_eligible": True,
                },
            ],
        },
        "abbreviations": {
            "easy": [
                {
                    "stem": "What does 'VA' stand for?",
                    "options": ["Visual acuity", "Vascular access",
                                "Visual angle", "Vitreous attachment"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "VA stands for visual acuity.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What does 'IOP' stand for?",
                    "options": ["Intraocular pressure", "Inner orbital plate",
                                "Inferior oblique palsy", "Intermittent optic pain"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "IOP stands for intraocular pressure.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What do 'RE' and 'LE' mean?",
                    "options": ["Right eye and left eye",
                                "Retinal exam and lens exam",
                                "Refractive error and lens error",
                                "Red eye and lazy eye"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "RE = right eye, LE = left eye.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What does 'NCT' stand for?",
                    "options": ["Non-contact tonometry", "Near corrected test",
                                "New colour test", "Nasal canal tube"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "NCT stands for non-contact tonometry (the air-puff "
                                   "pressure test).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What does 'TCU' mean in clinic notes?",
                    "options": ["To come (back) — the next follow-up appointment",
                                "Total corneal ulcer",
                                "Tonometry clinic unit",
                                "Treatment ceased urgently"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "TCU means 'to come (back)' — i.e. the next "
                                   "follow-up appointment.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What does 'IOL' stand for?",
                    "options": ["Intraocular lens", "Inferior orbital line",
                                "Internal ocular lesion", "Iris occlusion level"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "IOL stands for intraocular lens — the implant used "
                                   "in cataract surgery.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What does 'AMD' stand for?",
                    "options": ["Age-related macular degeneration",
                                "Acute macular detachment",
                                "Anterior media disease",
                                "Astigmatic media defect"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "AMD stands for age-related macular degeneration.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What does 'AACG' stand for?",
                    "options": ["Acute angle-closure glaucoma",
                                "Anterior angle chamber gap",
                                "Average annual cataract grade",
                                "Acute aqueous canal growth"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "AACG stands for acute angle-closure glaucoma.",
                    "reasoning_eligible": False,
                },
            ],
            "medium": [
                {
                    "stem": "In a VA record, what do 'HM', 'PL' and 'NPL' stand for?",
                    "options": [
                        "Hand Movement, Perception of Light, No Perception of Light",
                        "High Myopia, Partial Loss, Near Plano Lens",
                        "Hyperopia Mild, Pressure Low, Normal Pupil Light",
                        "Hand Magnifier, Pinhole Lens, Near Print Level",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "HM = Hand Movement, PL = Perception of Light, "
                                   "NPL = No Perception of Light — low-vision levels "
                                   "below chart letters.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A note reads 'RE VA 6/9, LE VA 6/12'. What does this mean?",
                    "options": [
                        "Right eye sees 6/9, left eye sees 6/12",
                        "Both eyes see 6/9 and 6/12 together",
                        "The patient has refractive errors of 9 and 12",
                        "Right and left eye pressures are 9 and 12",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "RE VA 6/9 = right eye acuity 6/9; LE VA 6/12 = left "
                                   "eye acuity 6/12.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A note says 'IOP 18/19, TCU 4/12'. What is being recorded?",
                    "options": [
                        "Eye pressures of 18 and 19 mmHg, with follow-up in 4 months",
                        "Vision of 18/19 with a 4/12 prescription",
                        "18 drops a day for 12 weeks",
                        "An IOL of 18 and a 12 mm wound",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "IOP 18/19 = right/left eye pressures; TCU 4/12 = to "
                                   "come back in 4 months (4/12 = 4 of 12 months).",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why are standard abbreviations used in clinic notes?",
                    "options": [
                        "They record information quickly and are understood across the "
                        "team",
                        "They hide information from other staff",
                        "They are required for billing only",
                        "They make notes longer",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Standard abbreviations let staff record and read "
                                   "clinical information quickly and consistently.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Which expansion is correct?",
                    "options": [
                        "CF = Count Fingers; NPL = No Perception of Light",
                        "CF = Clear Focus; NPL = Near Plano Lens",
                        "CF = Central Field; NPL = Normal Pupil Light",
                        "CF = Corneal Flap; NPL = New Patient List",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "CF = Count Fingers and NPL = No Perception of Light "
                                   "— both are low-vision acuity descriptions.",
                    "reasoning_eligible": False,
                },
            ],
            "hard": [
                {
                    "stem": "A note reads: 'RE VA CF, LE VA 6/9, IOP 30/18, hx AACG'. "
                            "What is the most clinically important message?",
                    "options": [
                        "The right eye sees only Count Fingers with a high pressure "
                        "(30) and a history of acute angle-closure — needs attention",
                        "Both eyes are completely normal",
                        "The patient needs only new reading glasses",
                        "Nothing in the note is significant",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "RE VA CF (very poor right vision), IOP 30 in that "
                                   "eye (well above normal) and a history of AACG "
                                   "together flag a serious right-eye problem to "
                                   "highlight.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "A handover says the patient is 'for IOL, hx on "
                            "anticoagulant, TCU 1/52 post-op'. Decode this.",
                    "options": [
                        "For an intraocular lens (cataract) op; on a blood thinner; "
                        "follow-up 1 week after surgery",
                        "For an inferior orbital line; high cholesterol; review in 52 "
                        "weeks",
                        "Intraocular lesion; no medications; seen 1 of 52 patients",
                        "Iris occlusion; on antibiotics; total cure in 1 week",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "IOL = intraocular lens surgery; hx on anticoagulant "
                                   "= history of being on a blood thinner (bleeding "
                                   "risk); TCU 1/52 = to come back in 1 week (1 of 52 "
                                   "weeks).",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL abbreviations that describe a LEVEL of vision.",
                    "options": ["CF (Count Fingers)", "HM (Hand Movement)",
                                "PL (Perception of Light)", "IOP (Intraocular "
                                "Pressure)"],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "CF, HM and PL are low-vision acuity levels. IOP is "
                                   "an eye-pressure measure, not a vision level.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why is it risky to invent or use non-standard "
                            "abbreviations in a patient's notes?",
                    "options": [
                        "Other staff may misread them, causing errors in care",
                        "It makes the notes look more professional",
                        "Standard abbreviations are optional anyway",
                        "It speeds up care safely",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Non-standard abbreviations can be misread by "
                                   "colleagues, leading to mistakes — stick to agreed, "
                                   "standard ones.",
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
        "oct_rnfl": {
            "easy": [
                {
                    "stem": "What does an RNFL OCT measure?",
                    "options": [
                        "The retinal nerve fibre layer thickness around the optic disc",
                        "The thickness of the cornea",
                        "The axial length of the eye",
                        "The anterior chamber angle",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "RNFL OCT measures the retinal nerve fibre layer "
                                   "thickness around the optic disc.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "RNFL OCT is mainly used to monitor which disease?",
                    "options": ["Glaucoma", "Cataract",
                                "Conjunctivitis", "Keratoconus"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "RNFL OCT is used mainly to detect and monitor "
                                   "glaucoma.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Where must an RNFL scan be centred?",
                    "options": ["On the optic disc (peripapillary)",
                                "On the fovea",
                                "On the cornea",
                                "On the pupil margin"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "The RNFL scan is centred on the optic disc "
                                   "(peripapillary region) to measure the nerve fibre "
                                   "layer correctly.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Is RNFL OCT a contact or non-contact test?",
                    "options": ["Non-contact", "Contact",
                                "Semi-contact with gel", "It uses an ultrasound probe"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "RNFL OCT is a non-contact, light-based scan.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why is an RNFL scan saved?",
                    "options": ["For serial comparison to track glaucoma progression",
                                "To calculate the IOL power",
                                "To measure the eye pressure",
                                "To replace the visual field test"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "RNFL scans are saved so they can be compared over "
                                   "time to track glaucoma progression.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What RNFL finding is typical of glaucoma?",
                    "options": ["RNFL thinning (often inferior or superior)",
                                "RNFL thickening",
                                "A normal, even RNFL",
                                "Corneal thinning"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Glaucoma typically causes RNFL thinning, often in "
                                   "the inferior or superior sectors.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL quality checks before saving an RNFL scan.",
                    "options": ["Adequate signal strength",
                                "Correct centration on the optic disc",
                                "Stable fixation (minimal motion artefact)",
                                "Normal blood pressure"],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Check signal strength, disc centration and stable "
                                   "fixation. Blood pressure is a systemic measure, not "
                                   "an OCT quality check.",
                    "reasoning_eligible": False,
                },
            ],
            "medium": [
                {
                    "stem": "Why is correct disc centration important for RNFL OCT?",
                    "options": [
                        "An off-centre measurement ring gives inaccurate, "
                        "non-comparable thickness values",
                        "It changes the patient's eye pressure",
                        "It only affects the image colour",
                        "Centration does not matter",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "If the measurement ring is off-centre, the RNFL "
                                   "thickness values are inaccurate and can't be "
                                   "reliably compared over time.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "How is RNFL OCT used alongside the visual field?",
                    "options": [
                        "Structural RNFL change is correlated with functional field "
                        "loss to monitor glaucoma",
                        "It replaces the visual field entirely",
                        "They measure unrelated things",
                        "The field test calibrates the OCT",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "RNFL OCT (structure) and the visual field "
                                   "(function) are compared together — structural "
                                   "thinning often precedes or matches field loss in "
                                   "glaucoma.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "A decentred RNFL scan shows asymmetric thinning. What "
                            "should the OT do?",
                    "options": ["Re-acquire a properly centred scan before it is used",
                                "Report the thinning as glaucoma",
                                "Save it anyway",
                                "Switch to A-scan biometry"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Decentration can create false asymmetry — "
                                   "re-acquire a properly centred scan before the "
                                   "result is interpreted.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "What is the key difference between RNFL OCT and macular "
                            "OCT?",
                    "options": [
                        "RNFL OCT scans the optic disc for glaucoma; macular OCT scans "
                        "the central retina for conditions like DME and AMD",
                        "There is no difference",
                        "RNFL OCT uses ultrasound",
                        "Macular OCT measures the cornea",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "RNFL OCT images around the optic disc for glaucoma; "
                                   "macular OCT images the central retina for diabetic "
                                   "macular oedema and AMD.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why might motion artefact during an RNFL scan be a "
                            "problem?",
                    "options": [
                        "It can distort the thickness measurement and reduce "
                        "reliability",
                        "It improves the image detail",
                        "It only changes the colour scale",
                        "It has no effect on the result",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Movement during the scan distorts the measurement, "
                                   "so stable fixation is needed for a reliable RNFL "
                                   "value.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why is serial RNFL comparison more useful than a single "
                            "scan in glaucoma?",
                    "options": [
                        "It reveals whether the nerve fibre layer is thinning over "
                        "time (progression)",
                        "A single scan already shows the future",
                        "Comparison calibrates the machine",
                        "Single scans are always unreliable",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Comparing RNFL scans over time shows progressive "
                                   "thinning, which a single scan cannot — key to "
                                   "monitoring glaucoma.",
                    "reasoning_eligible": True,
                },
            ],
            "hard": [
                {
                    "stem": "A glaucoma patient's RNFL shows new inferior thinning "
                            "compared with last year, matching a new superior field "
                            "defect. What does this combination indicate?",
                    "options": [
                        "Structure-function agreement suggesting glaucoma progression "
                        "— flag for review",
                        "A machine error, ignore it",
                        "Improvement in the glaucoma",
                        "A purely refractive change",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Inferior RNFL thinning corresponds to a superior "
                                   "field defect; structure and function agreeing "
                                   "strongly suggests true progression — flag it.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why must scan quality (signal, centration, fixation) be "
                            "confirmed before attributing RNFL thinning to glaucoma?",
                    "options": [
                        "Poor-quality scans can mimic thinning, leading to a false "
                        "impression of progression",
                        "Quality never affects the numbers",
                        "Glaucoma is diagnosed on a single scan regardless",
                        "Quality only matters for macular OCT",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Artefacts and poor centration can falsely lower "
                                   "RNFL values, so quality must be verified before "
                                   "concluding there is real thinning.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL reasons RNFL OCT and the visual field are used "
                            "TOGETHER in glaucoma.",
                    "options": [
                        "OCT gives objective structural data",
                        "The field gives functional (vision) data",
                        "Agreement between them increases confidence in progression",
                        "Either one alone is always sufficient",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "OCT (structure) and the field (function) complement "
                                   "each other; agreement strengthens confidence. "
                                   "Relying on just one is weaker.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "A high myope has a thin RNFL but no field loss and stable "
                            "scans over years. Why is caution needed before calling "
                            "this glaucoma?",
                    "options": [
                        "High myopia can give a thin RNFL baseline without "
                        "progression — stability matters more than one low value",
                        "Myopes cannot have a thin RNFL",
                        "A single low value always means glaucoma",
                        "Field tests are unnecessary in myopes",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Myopic eyes can have a thinner baseline RNFL; "
                                   "without progression or field loss, a single low "
                                   "value doesn't confirm glaucoma — the doctor "
                                   "interprets the trend.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Which statement about RNFL OCT technique is correct?",
                    "options": [
                        "Centre on the disc, ensure good signal and fixation, and "
                        "compare to prior scans",
                        "Centre on the fovea and read it in isolation",
                        "Any centration is fine if the signal is strong",
                        "It measures eye pressure as well",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Good RNFL practice: disc-centred, strong signal and "
                                   "fixation, and serial comparison — not foveal "
                                   "centration or single-scan reading.",
                    "reasoning_eligible": False,
                },
            ],
        },
        "hvf": {
            "easy": [
                {
                    "stem": "What does the Humphrey Visual Field (HVF) test measure?",
                    "options": [
                        "Central and peripheral visual field sensitivity (automated "
                        "static perimetry)",
                        "The eye pressure",
                        "The corneal curvature",
                        "The axial length",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "HVF measures visual field sensitivity using "
                                   "automated static perimetry.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Which HVF programme is most common for glaucoma?",
                    "options": ["The 24-2 programme", "The 10-1 programme",
                                "The 60-4 programme", "The colour programme"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "The 24-2 programme is the most common for glaucoma "
                                   "(30-2 is also used).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL HVF reliability indices.",
                    "options": ["Fixation losses", "False positives",
                                "False negatives", "Axial length"],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "Fixation losses, false positives and false "
                                   "negatives are the reliability indices. Axial length "
                                   "is unrelated to the field test.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What does a high number of false positives mean?",
                    "options": ["The test is unreliable",
                                "The patient has perfect vision",
                                "The glaucoma is cured",
                                "The machine needs no attention"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "A high false-positive rate (the patient responds "
                                   "when there is no stimulus) makes the field result "
                                   "unreliable.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Name one condition monitored with HVF.",
                    "options": ["Glaucoma", "Cataract",
                                "Dry eye", "Subconjunctival haemorrhage"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Glaucoma is the main condition monitored with HVF "
                                   "(neurological and retinal disease too).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why must the correct near trial lens be used during HVF?",
                    "options": [
                        "To correct near focus so the central field points are tested "
                        "accurately",
                        "To dilate the pupil",
                        "To measure the eye pressure",
                        "It is optional",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "The near trial lens keeps the test target in focus "
                                   "so central points are measured accurately.",
                    "reasoning_eligible": False,
                },
            ],
            "medium": [
                {
                    "stem": "An HVF shows high fixation losses and false positives. What "
                            "should you do?",
                    "options": [
                        "Re-instruct the patient and repeat — the result is unreliable",
                        "Report it as severe glaucoma",
                        "Accept it as final",
                        "Switch to measuring IOP instead",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Poor reliability indices mean the field is "
                                   "unreliable — re-instruct and repeat rather than "
                                   "interpreting it.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "What visual field pattern suggests glaucoma?",
                    "options": ["An arcuate (Bjerrum) scotoma",
                                "A central island only",
                                "A bitemporal hemianopia",
                                "A full, normal field"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "An arcuate (Bjerrum) scotoma is a classic "
                                   "glaucomatous field defect.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What field pattern suggests a lesion at the optic chiasm "
                            "or tract?",
                    "options": ["A hemianopia (a neurological pattern)",
                                "An arcuate scotoma",
                                "A central scotoma only",
                                "A normal field"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "A hemianopia (loss of half the field in both eyes) "
                                   "points to a neurological lesion at the chiasm or "
                                   "tract.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "What must be acceptable before an HVF is interpreted?",
                    "options": [
                        "The reliability indices (fixation losses, false positives and "
                        "negatives)",
                        "The patient's blood pressure",
                        "The room temperature",
                        "The IOL power",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Reliability indices must be acceptable first — an "
                                   "unreliable field can't be meaningfully interpreted.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why can a first-ever HVF show a 'learning effect' that "
                            "improves on repeat?",
                    "options": [
                        "Patients unfamiliar with the test often perform better once "
                        "they understand it",
                        "The disease improves between tests",
                        "The machine recalibrates itself",
                        "Repeat tests are always worse",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "A first field can underperform due to "
                                   "unfamiliarity; results often improve once the "
                                   "patient learns the task (the learning effect).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why is patient instruction and comfort so important for a "
                            "reliable HVF?",
                    "options": [
                        "A tired or confused patient produces unreliable indices and "
                        "false defects",
                        "It only affects how long the test takes",
                        "Instruction changes the eye pressure",
                        "Comfort has no effect on the result",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Good instruction and comfort keep the patient "
                                   "engaged and fixating, which is essential for "
                                   "reliable field results.",
                    "reasoning_eligible": True,
                },
            ],
            "hard": [
                {
                    "stem": "A glaucoma patient's HVF shows a new arcuate scotoma but "
                            "also 35% fixation losses and many false positives. How "
                            "should this be handled?",
                    "options": [
                        "Treat the result as unreliable; re-instruct and repeat before "
                        "concluding there is progression",
                        "Report definite progression immediately",
                        "Ignore the reliability indices",
                        "Switch the patient to a different disease pathway",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Poor reliability indices undermine the apparent new "
                                   "defect; repeat with better instruction before "
                                   "concluding the glaucoma has progressed.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why does a bitemporal hemianopia point AWAY from glaucoma "
                            "and toward a neurological cause?",
                    "options": [
                        "It reflects damage at the optic chiasm, not the "
                        "glaucoma-typical nerve fibre pattern",
                        "Glaucoma always causes hemianopia",
                        "Hemianopia is a normal variant",
                        "It indicates a refractive error",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "A bitemporal hemianopia localises to the optic "
                                   "chiasm (e.g. a pituitary lesion), which is a "
                                   "neurological pattern, not the arcuate pattern of "
                                   "glaucoma.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL steps that improve HVF reliability.",
                    "options": [
                        "Clear instruction and a comfortable, well-positioned patient",
                        "The correct near trial lens in place",
                        "Encouraging steady central fixation",
                        "Rushing the patient to finish quickly",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Instruction, the right trial lens and steady "
                                   "fixation all improve reliability. Rushing harms it.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why is a single abnormal HVF usually confirmed with a "
                            "repeat before changing glaucoma management?",
                    "options": [
                        "Field results vary, and a learning effect or poor reliability "
                        "can mimic a defect — confirmation avoids over-reaction",
                        "One field always proves progression",
                        "Repeats are only for research",
                        "The first field is always wrong",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Because fields fluctuate and can be affected by "
                                   "learning or reliability, an apparent change is "
                                   "usually confirmed on repeat before management is "
                                   "altered.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Which statement best contrasts HVF defect patterns?",
                    "options": [
                        "Glaucoma → arcuate/nasal step; chiasmal lesion → bitemporal "
                        "hemianopia",
                        "Glaucoma → hemianopia; chiasmal lesion → arcuate scotoma",
                        "Both always give a central scotoma",
                        "Neither produces any recognisable pattern",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Glaucoma classically gives arcuate defects/nasal "
                                   "steps; a chiasmal lesion gives a bitemporal "
                                   "hemianopia — different patterns point to different "
                                   "causes.",
                    "reasoning_eligible": False,
                },
            ],
        },
        "gvf": {
            "easy": [
                {
                    "stem": "What does the Goldmann visual field (GVF) use?",
                    "options": ["Manual kinetic perimetry that maps isopters",
                                "Automated static perimetry",
                                "An air puff",
                                "Ultrasound"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "GVF uses manual kinetic perimetry, mapping isopters "
                                   "with a moving target.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Is GVF static or kinetic perimetry?",
                    "options": ["Kinetic (a moving target)",
                                "Static (a stationary target)",
                                "Neither — it measures pressure",
                                "Both at once"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "GVF is kinetic perimetry — a target is moved until "
                                   "the patient sees it.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What does an isopter represent?",
                    "options": ["A line joining points of equal retinal sensitivity",
                                "The optic disc outline",
                                "The corneal curvature",
                                "The pupil margin"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "An isopter is a contour line joining points of "
                                   "equal retinal sensitivity on the field map.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Name one advantage of GVF over automated fields.",
                    "options": [
                        "It can test very large fields and suits patients who cannot "
                        "do automated testing",
                        "It is fully automatic and needs no operator",
                        "It measures eye pressure too",
                        "It is faster for every patient",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "GVF can map large/peripheral fields and is suitable "
                                   "for patients who can't manage automated testing.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL recognised indications for GVF.",
                    "options": ["Advanced glaucoma",
                                "Neurological conditions",
                                "Low vision or disability certification",
                                "Routine cataract follow-up"],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "GVF is used in advanced glaucoma, neurological "
                                   "conditions, and low-vision/disability "
                                   "certification. Routine cataract follow-up is not a "
                                   "typical indication.",
                    "reasoning_eligible": False,
                },
            ],
            "medium": [
                {
                    "stem": "A patient cannot cooperate with the automated HVF. What "
                            "alternative field test can be offered?",
                    "options": ["Goldmann visual field (GVF)",
                                "Another HVF immediately",
                                "An OCT instead",
                                "No field test is possible"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "GVF (manual kinetic) can be performed by an "
                                   "operator and suits patients who cannot do the "
                                   "automated HVF.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why is GVF useful in advanced glaucoma?",
                    "options": [
                        "It maps the remaining field, including large/peripheral areas "
                        "automated tests handle poorly",
                        "It cures the glaucoma",
                        "It measures the optic nerve directly",
                        "It is the only test that shows IOP",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "In advanced glaucoma, GVF maps the remaining "
                                   "(often peripheral) field that automated static "
                                   "tests struggle with.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "GVF versus HVF — which is automated static perimetry?",
                    "options": ["HVF is automated static; GVF is manual kinetic",
                                "GVF is automated static; HVF is manual kinetic",
                                "Both are automated static",
                                "Both are manual kinetic"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "HVF is automated static perimetry; GVF is manual "
                                   "kinetic perimetry.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What is documented for a GVF?",
                    "options": [
                        "Diagnosis, indication, and interpretation of the isopter "
                        "results",
                        "Only the patient's name",
                        "The eye pressure",
                        "The IOL power",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Record the diagnosis, indication and an "
                                   "interpretation of the isopter map for a GVF.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why does GVF rely heavily on operator skill compared with "
                            "automated fields?",
                    "options": [
                        "The operator manually moves the target and plots responses, "
                        "so technique affects the result",
                        "The machine does everything automatically",
                        "Operator skill is irrelevant to GVF",
                        "It only needs the patient, no operator",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Because the operator moves the stimulus and plots "
                                   "the isopters by hand, GVF results depend on a "
                                   "skilled, consistent technique.",
                    "reasoning_eligible": True,
                },
            ],
            "hard": [
                {
                    "stem": "An elderly patient with very advanced glaucoma and poor "
                            "concentration needs field testing. Why might GVF be "
                            "preferred over repeating the HVF?",
                    "options": [
                        "An operator can guide GVF and map the small remaining field, "
                        "which the automated HVF handles poorly",
                        "GVF is fully automated and needs no cooperation",
                        "HVF cannot test glaucoma at all",
                        "GVF measures the eye pressure as well",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "GVF lets a skilled operator guide a "
                                   "poorly-concentrating patient and map the small "
                                   "remaining field of advanced glaucoma better than "
                                   "the automated HVF.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL situations where GVF is a sensible choice over "
                            "automated static perimetry.",
                    "options": [
                        "A patient who cannot cooperate with automated testing",
                        "Mapping a large/peripheral field in advanced disease",
                        "Disability or low-vision certification",
                        "A young, reliable patient with early glaucoma",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "GVF suits poor cooperators, large-field mapping and "
                                   "certification. A young reliable patient with early "
                                   "disease is well served by automated HVF.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why is consistent operator technique essential when "
                            "comparing a patient's GVF over several visits?",
                    "options": [
                        "Variation in how the target is moved/plotted can mimic real "
                        "change, confounding progression assessment",
                        "Technique never affects kinetic perimetry",
                        "Only the machine settings matter",
                        "GVF results cannot be compared at all",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Because GVF is operator-dependent, inconsistent "
                                   "technique can create apparent changes — consistency "
                                   "is needed to judge true progression.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Which statement best distinguishes GVF from HVF in "
                            "practice?",
                    "options": [
                        "GVF = manual, kinetic, operator-driven, large fields; HVF = "
                        "automated, static, standardised, central fields",
                        "They are identical methods with different names",
                        "GVF is automated and HVF is manual",
                        "Both only test the central 10 degrees",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "GVF is manual kinetic perimetry (operator-driven, "
                                   "good for large fields); HVF is automated static "
                                   "perimetry (standardised, central field). They suit "
                                   "different patients.",
                    "reasoning_eligible": False,
                },
            ],
        },
        "ascan_biometry": {
            "easy": [
                {
                    "stem": "What does A-scan biometry measure?",
                    "options": ["The axial length of the eye",
                                "The corneal endothelial count",
                                "The visual field",
                                "The eye pressure"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "A-scan biometry measures the axial length of the "
                                   "eye.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What is the main indication for A-scan biometry?",
                    "options": ["Pre-cataract surgery IOL power calculation",
                                "Glaucoma field monitoring",
                                "Colour vision testing",
                                "Dry eye assessment"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "A-scan biometry is mainly done before cataract "
                                   "surgery to help calculate the IOL power.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What kind of energy does A-scan biometry use?",
                    "options": ["Ultrasound", "Near-infrared light",
                                "X-rays", "An air puff"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "A-scan biometry uses ultrasound to measure the "
                                   "axial length.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "For the contact A-scan method, what is instilled first?",
                    "options": ["A topical anaesthetic",
                                "A dilating drop",
                                "A lubricant only",
                                "Nothing is needed"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "The contact (applanation) method touches the "
                                   "cornea, so a topical anaesthetic is instilled "
                                   "first.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL recognised A-scan techniques.",
                    "options": ["Contact (applanation)", "Immersion",
                                "Air-puff", "Kinetic"],
                    "correct": [0, 1],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "The two A-scan techniques are contact (applanation) "
                                   "and immersion. Air-puff and kinetic refer to other "
                                   "tests.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A-scan gives axial length — what else is needed to "
                            "calculate IOL power?",
                    "options": ["Keratometry (corneal curvature)",
                                "The visual field",
                                "The colour vision result",
                                "The eye pressure"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "IOL power needs both the axial length and the "
                                   "keratometry (corneal curvature).",
                    "reasoning_eligible": False,
                },
            ],
            "medium": [
                {
                    "stem": "When is A-scan preferred over optical biometry?",
                    "options": [
                        "When a dense cataract blocks the optical (light) signal",
                        "When the patient is young",
                        "When the cornea is perfectly clear",
                        "Optical biometry is never preferred",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A dense cataract can block the light used by "
                                   "optical biometry, so ultrasound A-scan is used "
                                   "instead.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "What error does corneal indentation cause in contact "
                            "A-scan?",
                    "options": ["It falsely shortens the axial length",
                                "It falsely lengthens the axial length",
                                "It changes the corneal curvature reading",
                                "It has no effect"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Pressing on (indenting) the cornea compresses the "
                                   "eye slightly, falsely shortening the measured axial "
                                   "length.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "How does the immersion technique avoid the corneal "
                            "indentation error?",
                    "options": ["It avoids pressing on (indenting) the cornea",
                                "It uses light instead of ultrasound",
                                "It measures the cornea instead",
                                "It does not avoid the error"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Immersion couples the probe through fluid without "
                                   "pressing on the cornea, avoiding the false "
                                   "shortening.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why take multiple A-scan readings?",
                    "options": ["To confirm consistency before accepting the axial "
                                "length",
                                "To use up the gel",
                                "To tire the patient",
                                "Single readings are always perfect"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Several readings are taken and checked for "
                                   "consistency before the axial length is accepted.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why is an accurate axial length so important before "
                            "cataract surgery?",
                    "options": [
                        "A small axial-length error leads to a wrong IOL power and a "
                        "poor refractive result",
                        "It determines the eye pressure",
                        "It only matters for glaucoma",
                        "Axial length is not used in surgery",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "IOL power is very sensitive to axial length; a "
                                   "small error can leave the patient significantly "
                                   "under- or over-corrected after surgery.",
                    "reasoning_eligible": True,
                },
            ],
            "hard": [
                {
                    "stem": "A contact A-scan gives an axial length 0.3 mm shorter than "
                            "a prior immersion reading on the same eye. What is the "
                            "most likely explanation?",
                    "options": [
                        "Corneal indentation during the contact scan falsely shortened "
                        "it",
                        "The eye genuinely shrank",
                        "The immersion scan must be wrong",
                        "Axial length naturally varies that much",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Contact applanation can indent the cornea and "
                                   "falsely shorten the axial length — a known reason "
                                   "immersion or optical methods are often preferred.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL good-practice steps for reliable A-scan "
                            "biometry.",
                    "options": [
                        "Instil anaesthetic before the contact method",
                        "Avoid pressing on the cornea (or use immersion)",
                        "Take and compare multiple readings",
                        "Accept the first reading without checking",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Anaesthetise for contact, avoid corneal "
                                   "indentation, and confirm with multiple readings. "
                                   "Accepting one unchecked reading is poor practice.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why might a patient with a very dense cataract be measured "
                            "with A-scan ultrasound rather than optical biometry?",
                    "options": [
                        "Ultrasound penetrates the opacity that blocks the optical "
                        "light signal",
                        "Ultrasound is always more accurate",
                        "Optical biometry damages cataracts",
                        "A-scan measures the cataract density",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "When a dense cataract blocks the optical signal, "
                                   "ultrasound A-scan can still measure the axial "
                                   "length through the opacity.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why is consistency between several biometry readings (and "
                            "between eyes) checked before surgery?",
                    "options": [
                        "Inconsistent or asymmetric values may signal a measurement "
                        "error that would give the wrong IOL power",
                        "It is only a formality",
                        "Eyes are always identical, so any difference is fine",
                        "Consistency has no clinical value",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Large inconsistencies or unexpected asymmetry "
                                   "suggest a measurement error; catching it prevents a "
                                   "wrong IOL power and a poor outcome.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Which statement about A-scan biometry is correct?",
                    "options": [
                        "It measures axial length by ultrasound; immersion avoids "
                        "corneal indentation; keratometry is also needed for IOL power",
                        "It measures corneal curvature by light",
                        "Contact and immersion give identical results in every case",
                        "Axial length alone fully determines IOL power",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "A-scan uses ultrasound for axial length; immersion "
                                   "avoids indentation error; and keratometry is also "
                                   "required for the IOL calculation.",
                    "reasoning_eligible": False,
                },
            ],
        },
        "optical_biometry": {
            "easy": [
                {
                    "stem": "Is optical biometry a contact or non-contact test?",
                    "options": ["Non-contact", "Contact (applanation)",
                                "Contact with gel", "It uses an ultrasound probe"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Optical biometry is non-contact — it uses light, "
                                   "nothing touches the eye.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL measurements optical biometry can provide.",
                    "options": ["Axial length",
                                "Corneal curvature (keratometry)",
                                "Anterior chamber depth",
                                "Intraocular pressure"],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "Optical biometry provides axial length, keratometry "
                                   "and anterior chamber depth. It does not measure "
                                   "eye pressure.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What is the main indication for optical biometry?",
                    "options": ["Pre-cataract surgery IOL power calculation",
                                "Glaucoma field testing",
                                "Colour vision screening",
                                "Dry eye assessment"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Optical biometry is mainly used to calculate the "
                                   "IOL power before cataract surgery.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Optical biometry versus A-scan — which is more accurate in "
                            "most eyes?",
                    "options": ["Optical biometry", "A-scan ultrasound",
                                "They are identical", "Neither is accurate"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Optical biometry is more accurate than ultrasound "
                                   "A-scan for IOL calculation in most eyes.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What does the optical biometry measurement feed into?",
                    "options": ["The IOL power calculation",
                                "The visual field analysis",
                                "The colour vision score",
                                "The eye pressure record"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "The measurements feed the IOL power calculation for "
                                   "cataract surgery.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Who selects the final IOL power from the biometry?",
                    "options": ["The doctor — the OT measures and documents",
                                "The OT decides the IOL power",
                                "The patient chooses",
                                "The machine implants it automatically"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "The OT measures and documents; the doctor selects "
                                   "the IOL power.",
                    "reasoning_eligible": False,
                },
            ],
            "medium": [
                {
                    "stem": "Why is optical biometry preferred over A-scan when "
                            "possible?",
                    "options": [
                        "It is non-contact and more accurate for IOL calculation in "
                        "most eyes",
                        "It is the only test that works through a dense cataract",
                        "It measures the eye pressure too",
                        "It is cheaper to run",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Being non-contact (more comfortable, no indentation "
                                   "error) and more accurate makes optical biometry the "
                                   "first choice when the media are clear enough.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "When does optical biometry fail, needing A-scan instead?",
                    "options": ["With a dense cataract that blocks the light signal",
                                "When the patient is elderly",
                                "When the cornea is clear",
                                "It never fails"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A dense cataract can block the optical light "
                                   "signal, so ultrasound A-scan is used instead.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why take multiple optical biometry readings?",
                    "options": ["To confirm consistency before the values are used",
                                "To dilate the pupil",
                                "To tire the patient",
                                "Single readings are always perfect"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Repeated readings are checked for consistency "
                                   "before being accepted for the IOL calculation.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Besides cataract surgery, name one other use of optical "
                            "biometry data.",
                    "options": ["Contact lens fitting",
                                "Measuring eye pressure",
                                "Colour vision testing",
                                "Visual field mapping"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Corneal curvature data can also help with contact "
                                   "lens fitting.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why does being non-contact make optical biometry more "
                            "comfortable AND potentially more accurate than contact "
                            "A-scan?",
                    "options": [
                        "Nothing touches or indents the cornea, avoiding both "
                        "discomfort and the false-shortening error",
                        "It uses a stronger anaesthetic",
                        "It presses more firmly for a better reading",
                        "It has no effect on accuracy",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Without touching the cornea there is no discomfort "
                                   "and no indentation error, which both improves "
                                   "comfort and avoids falsely shortening the axial "
                                   "length.",
                    "reasoning_eligible": True,
                },
            ],
            "hard": [
                {
                    "stem": "A patient's optical biometry cannot get a reliable axial "
                            "length because of a very dense cataract. What is the "
                            "correct next step?",
                    "options": [
                        "Use ultrasound A-scan (e.g. immersion) to obtain the axial "
                        "length",
                        "Guess the axial length from the other eye",
                        "Proceed with no axial length",
                        "Cancel the cataract surgery",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "When optical biometry fails on a dense cataract, "
                                   "ultrasound A-scan (which penetrates the opacity) is "
                                   "used to get the axial length.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL reasons optical biometry is usually the "
                            "first-choice method for IOL calculation.",
                    "options": [
                        "It is non-contact and comfortable",
                        "It avoids the corneal-indentation error of contact A-scan",
                        "It is more accurate in most clear-media eyes",
                        "It works even through a dense cataract",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "Optical biometry is non-contact, avoids indentation "
                                   "error and is more accurate in clear-media eyes. It "
                                   "does NOT work well through a dense cataract — that "
                                   "is when A-scan is needed.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why is consistency between biometry readings and between "
                            "the two eyes checked before accepting the values?",
                    "options": [
                        "Unexpected differences may indicate a measurement error that "
                        "would give the wrong IOL power",
                        "Eyes must always be identical",
                        "It is only a formality",
                        "Differences never matter",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Inconsistent or markedly asymmetric values flag a "
                                   "possible error; catching it avoids a wrong IOL "
                                   "power and a poor refractive result.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Which statement about optical versus ultrasound biometry "
                            "is correct?",
                    "options": [
                        "Optical is non-contact and more accurate in clear media; "
                        "A-scan is the fallback when a dense cataract blocks light",
                        "A-scan is non-contact and always more accurate",
                        "Optical biometry uses ultrasound",
                        "They cannot measure axial length",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Optical biometry (light, non-contact) is preferred "
                                   "in clear media; ultrasound A-scan is the fallback "
                                   "when dense opacity blocks the optical signal.",
                    "reasoning_eligible": False,
                },
            ],
        },
        "endothelial": {
            "easy": [
                {
                    "stem": "What does an endothelial cell count measure?",
                    "options": ["Corneal endothelial cell density (cells/mm2)",
                                "The axial length",
                                "The visual field",
                                "The eye pressure"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "It measures the density of cells in the corneal "
                                   "endothelium (cells per mm2).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What is a normal corneal endothelial cell density?",
                    "options": ["Above 2000 cells/mm2", "Below 500 cells/mm2",
                                "About 100 cells/mm2", "Exactly 1000 cells/mm2"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "A normal endothelial cell density is above 2000 "
                                   "cells/mm2.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Below roughly what count is concern raised?",
                    "options": ["Below 1500 cells/mm2", "Below 2500 cells/mm2",
                                "Below 3000 cells/mm2", "There is no threshold"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "A count below about 1500 cells/mm2 is a concern, "
                                   "especially before surgery.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Is the endothelial cell count a contact or non-contact "
                            "test?",
                    "options": ["Non-contact (specular microscopy)",
                                "Contact with anaesthetic",
                                "Contact with a probe",
                                "It uses ultrasound"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "It is usually a non-contact test using specular "
                                   "microscopy.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL recognised indications for an endothelial cell "
                            "count.",
                    "options": ["Pre-cataract surgery",
                                "Fuchs dystrophy",
                                "Long-term contact lens wear / post-corneal transplant",
                                "Routine colour vision screening"],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "Indications include pre-cataract surgery, Fuchs "
                                   "dystrophy, contact lens wearers and post-transplant "
                                   "eyes. Colour vision screening is unrelated.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A count of 1300 cells/mm2 is normal or concerning?",
                    "options": ["Concerning — below the ~1500 threshold",
                                "Normal — well above threshold",
                                "Normal — exactly average",
                                "Impossible to interpret"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "1300 cells/mm2 is below the ~1500 threshold, so it "
                                   "is a concern.",
                    "reasoning_eligible": False,
                },
            ],
            "medium": [
                {
                    "stem": "Why does a low endothelial count matter before cataract "
                            "surgery?",
                    "options": [
                        "It raises the risk of corneal decompensation (oedema) after "
                        "surgery",
                        "It changes the IOL power",
                        "It improves healing",
                        "It has no surgical relevance",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Endothelial cells keep the cornea clear by pumping "
                                   "out fluid. A low count risks corneal swelling "
                                   "(decompensation) after surgical stress.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Vision is worse in the morning and improves later in the "
                            "day. Which corneal condition does this suggest?",
                    "options": ["Endothelial dysfunction such as Fuchs dystrophy",
                                "Simple presbyopia",
                                "Glaucoma",
                                "Allergic conjunctivitis"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Morning blur that clears later is typical of "
                                   "endothelial dysfunction (e.g. Fuchs) — fluid builds "
                                   "up overnight and evaporates when the eyes open.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Besides cell density, what else is recorded in an "
                            "endothelial assessment?",
                    "options": ["Cell morphology (e.g. irregular cell shapes)",
                                "The visual field",
                                "The axial length",
                                "The colour vision"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Cell morphology — size and shape variation — is "
                                   "recorded alongside the density.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why might a long-term contact lens wearer need this test?",
                    "options": ["Long-term lens wear can reduce endothelial cell "
                                "density",
                                "Lenses increase the cell count",
                                "It measures the lens fit",
                                "Lens wearers never need it"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Years of contact lens wear can lower endothelial "
                                   "cell density, so it may be checked.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why are endothelial cells especially important given they "
                            "do not regenerate well?",
                    "options": [
                        "Lost cells are not replaced, so a falling count is "
                        "cumulative and matters long-term",
                        "They regrow quickly, so the count is irrelevant",
                        "They only matter in children",
                        "They have no role in corneal clarity",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Corneal endothelial cells have very limited "
                                   "regeneration, so losses accumulate over a lifetime "
                                   "— making the count clinically important.",
                    "reasoning_eligible": True,
                },
            ],
            "hard": [
                {
                    "stem": "A cataract patient has an endothelial count of 900 "
                            "cells/mm2 with irregular cell shapes. Why is this "
                            "flagged before surgery?",
                    "options": [
                        "A very low, abnormal count raises the risk of corneal "
                        "decompensation after surgery — the surgeon must know",
                        "It is a normal count, no action needed",
                        "It changes the colour vision result",
                        "It means surgery is impossible",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A count of 900 with abnormal morphology is well "
                                   "below safe levels; it raises the risk of "
                                   "post-operative corneal swelling, so the surgeon is "
                                   "informed for planning.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL findings that would concern you on an "
                            "endothelial assessment.",
                    "options": [
                        "A density below ~1500 cells/mm2",
                        "Marked variation in cell size/shape (poor morphology)",
                        "A history of Fuchs dystrophy or prior transplant",
                        "A density above 2500 with uniform cells",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Low density, poor morphology and relevant history "
                                   "all raise concern. A high density with uniform "
                                   "cells is reassuring.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why does the cornea swell (decompensate) when endothelial "
                            "function is poor?",
                    "options": [
                        "The endothelium pumps fluid out of the cornea; if it fails, "
                        "fluid accumulates and the cornea clouds",
                        "The endothelium adds fluid to keep the cornea clear",
                        "Swelling is unrelated to the endothelium",
                        "The cornea thins rather than swells",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Endothelial cells actively pump fluid out to keep "
                                   "the cornea clear; when too few function, fluid "
                                   "builds up and the cornea becomes oedematous and "
                                   "hazy.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "A patient with Fuchs dystrophy reports gradually worsening "
                            "morning blur over months. How does the endothelial count "
                            "help the clinical picture?",
                    "options": [
                        "A declining count supports progressive endothelial failure, "
                        "guiding monitoring and surgical planning",
                        "It proves the patient needs glasses",
                        "It measures the cataract directly",
                        "It is irrelevant to Fuchs dystrophy",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A falling endothelial count in Fuchs correlates "
                                   "with worsening function and symptoms, helping the "
                                   "team monitor and plan any surgery.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Which statement about the endothelial cell count is "
                            "correct?",
                    "options": [
                        "Normal is >2000/mm2, concern <1500/mm2; it predicts corneal "
                        "decompensation risk, especially before surgery",
                        "Normal is <500/mm2",
                        "It measures the eye pressure",
                        "Endothelial cells regenerate fully, so the count is "
                        "irrelevant",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Normal endothelial density is >2000/mm2 and "
                                   "concern arises below ~1500/mm2; a low count flags "
                                   "the risk of corneal decompensation, important "
                                   "before surgery.",
                    "reasoning_eligible": False,
                },
            ],
        },
        "asoct": {
            "easy": [
                {
                    "stem": "What does ASOCT (anterior segment OCT) image?",
                    "options": [
                        "The anterior segment — cornea, anterior chamber, angle, iris "
                        "and lens",
                        "The macula and retina",
                        "The optic nerve head",
                        "The visual field",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "ASOCT images the front of the eye — cornea, "
                                   "anterior chamber, angle, iris and lens.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Is ASOCT a contact or non-contact test?",
                    "options": ["Non-contact", "Contact with a lens on the eye",
                                "Contact with gel", "It uses ultrasound"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "ASOCT is a non-contact, light-based imaging test.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Which angle does ASOCT help assess?",
                    "options": ["The anterior chamber (drainage) angle",
                                "The angle of squint",
                                "The optic disc angle",
                                "The angle kappa only"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "ASOCT images the anterior chamber drainage angle, "
                                   "useful in glaucoma assessment.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What kind of image does ASOCT produce?",
                    "options": ["A high-resolution cross-sectional image",
                                "A colour photograph only",
                                "A pressure reading",
                                "A field map"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "ASOCT produces a high-resolution cross-sectional "
                                   "image of the anterior segment.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL recognised uses of ASOCT.",
                    "options": ["Anterior chamber angle assessment in glaucoma",
                                "Corneal disease/thickness assessment",
                                "Post-surgery / refractive planning",
                                "Measuring the eye pressure"],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "ASOCT is used for the angle, corneal assessment and "
                                   "surgical/refractive planning. It does not measure "
                                   "eye pressure.",
                    "reasoning_eligible": False,
                },
            ],
            "medium": [
                {
                    "stem": "Why is ASOCT useful in a narrow-angle glaucoma suspect?",
                    "options": [
                        "It images the anterior chamber angle to assess how narrow or "
                        "open it is",
                        "It measures the retinal thickness",
                        "It lowers the eye pressure",
                        "It tests the visual field",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "ASOCT shows the angle's configuration, helping "
                                   "judge whether it is narrow or open in a "
                                   "glaucoma suspect.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "ASOCT versus macular OCT — what is the difference in "
                            "target?",
                    "options": [
                        "ASOCT images the anterior segment; macular OCT images the "
                        "retina/macula",
                        "They image the same structures",
                        "ASOCT images the retina; macular OCT the cornea",
                        "Both image the optic nerve",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "ASOCT targets the front of the eye; macular OCT "
                                   "targets the central retina.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why is ASOCT preferred over a contact method for assessing "
                            "the angle?",
                    "options": [
                        "It is non-contact, comfortable and high-resolution",
                        "It is the only test that touches the eye",
                        "It measures the cornea's colour",
                        "It is always cheaper",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Being non-contact and high-resolution makes ASOCT a "
                                   "comfortable way to image the angle without touching "
                                   "the eye.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Name a corneal use of ASOCT.",
                    "options": [
                        "Assessing corneal thickness, disease, or "
                        "post-surgical/refractive planning",
                        "Measuring the visual field",
                        "Counting endothelial cells",
                        "Testing colour vision",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "ASOCT can assess corneal thickness and disease and "
                                   "support refractive/surgical planning.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What does the OT document for an ASOCT?",
                    "options": ["Diagnosis, indication, eye(s) and findings",
                                "Only the patient's name",
                                "The IOL power",
                                "Nothing is documented"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Document the diagnosis, indication, eye(s) tested "
                                   "and the findings.",
                    "reasoning_eligible": False,
                },
            ],
            "hard": [
                {
                    "stem": "A glaucoma suspect has very shallow chambers. How does "
                            "ASOCT support safe management compared with relying on "
                            "examination alone?",
                    "options": [
                        "It objectively images and documents the angle, helping decide "
                        "whether dilation/treatment is safe",
                        "It treats the narrow angle directly",
                        "It replaces the doctor's decision",
                        "It measures the eye pressure instead",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "ASOCT gives an objective, documented image of the "
                                   "angle configuration, informing decisions about "
                                   "dilation risk and management.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL clinical questions ASOCT can help answer.",
                    "options": [
                        "Is the anterior chamber angle narrow or open?",
                        "How thick is the cornea in cross-section?",
                        "What is the anterior segment anatomy after surgery?",
                        "What is the retinal nerve fibre layer thickness?",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "ASOCT addresses angle width, corneal thickness and "
                                   "post-surgical anterior anatomy. The RNFL is a "
                                   "posterior structure assessed by RNFL OCT, not "
                                   "ASOCT.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why might ASOCT and gonioscopy be considered complementary "
                            "for angle assessment?",
                    "options": [
                        "ASOCT gives an objective non-contact cross-section; "
                        "gonioscopy gives a direct dynamic view — together they "
                        "characterise the angle",
                        "They measure entirely unrelated things",
                        "ASOCT replaces all other angle assessment",
                        "Gonioscopy images the retina",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "ASOCT provides an objective cross-sectional image "
                                   "while gonioscopy gives a direct dynamic view; "
                                   "together they build a fuller picture of the angle.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Which statement about ASOCT is correct?",
                    "options": [
                        "It is a non-contact, high-resolution cross-section of the "
                        "anterior segment, useful for the angle and cornea",
                        "It is a contact test that images the retina",
                        "It measures intraocular pressure",
                        "It is only used for colour vision",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "ASOCT is a non-contact, high-resolution "
                                   "cross-sectional scan of the anterior segment, used "
                                   "for angle and corneal assessment.",
                    "reasoning_eligible": False,
                },
            ],
        },
        "flare": {
            "easy": [
                {
                    "stem": "What does the flare test measure?",
                    "options": [
                        "Aqueous flare — protein concentration in the anterior chamber",
                        "The axial length",
                        "The visual field",
                        "The corneal curvature",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "The flare test measures aqueous flare — the protein "
                                   "concentration in the anterior chamber.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Aqueous flare is an indicator of what?",
                    "options": ["Intraocular inflammation",
                                "High eye pressure",
                                "A refractive error",
                                "Corneal thickness"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Flare reflects protein leakage from inflamed "
                                   "vessels — an indicator of intraocular inflammation.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Is the flare test contact or non-contact?",
                    "options": ["Non-contact (laser flare photometry)",
                                "Contact with anaesthetic",
                                "Contact with a probe",
                                "It uses ultrasound"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "It is a non-contact test using laser flare "
                                   "photometry.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What does a higher flare value mean?",
                    "options": ["More intraocular inflammation",
                                "Less inflammation",
                                "Lower eye pressure",
                                "Better vision"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "A higher flare value indicates more intraocular "
                                   "inflammation.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL recognised indications for the flare test.",
                    "options": ["Uveitis monitoring",
                                "Post-surgical inflammation assessment",
                                "Tracking inflammation over time",
                                "IOL power calculation"],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "Flare is used to monitor uveitis, assess "
                                   "post-surgical inflammation and track it over time. "
                                   "It is not used for IOL calculation.",
                    "reasoning_eligible": False,
                },
            ],
            "medium": [
                {
                    "stem": "Why use the flare test in uveitis?",
                    "options": [
                        "To objectively measure and monitor anterior chamber "
                        "inflammation over time",
                        "To measure the eye pressure",
                        "To calculate the IOL power",
                        "To test colour vision",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Flare photometry gives an objective number for "
                                   "anterior chamber inflammation, useful for "
                                   "monitoring uveitis and its response to treatment.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "How does the flare test help after surgery?",
                    "options": [
                        "It quantifies post-operative inflammation to guide treatment "
                        "such as steroid tapering",
                        "It measures the wound strength",
                        "It checks the IOL position",
                        "It has no post-op use",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Measuring post-op flare quantifies inflammation, "
                                   "helping the doctor guide steroid treatment and "
                                   "tapering.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "A mildly raised flare a week after cataract surgery — how "
                            "is this interpreted?",
                    "options": [
                        "Expected early post-operative inflammation (lower than acute "
                        "uveitis)",
                        "A definite serious infection",
                        "A machine error",
                        "Completely normal — flare is never raised post-op",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Some flare is expected early after surgery; mildly "
                                   "raised values a week post-op usually reflect normal "
                                   "healing rather than acute uveitis.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why also measure the fellow (other) eye in a flare "
                            "assessment?",
                    "options": ["As a baseline for comparison",
                                "To dilate it",
                                "To measure its pressure",
                                "There is no reason to"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "The fellow eye provides a baseline flare value to "
                                   "compare against the affected eye.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Who decides on treatment based on the flare value?",
                    "options": ["The doctor — the OT measures and documents",
                                "The OT prescribes the steroids",
                                "The patient decides",
                                "The machine decides automatically"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "The OT measures and documents the flare; the doctor "
                                   "decides on treatment.",
                    "reasoning_eligible": False,
                },
            ],
            "hard": [
                {
                    "stem": "A uveitis patient's flare value has risen markedly since "
                            "the last visit despite treatment. What does this suggest "
                            "and what is the OT's role?",
                    "options": [
                        "Worsening inflammation — document and flag the trend for the "
                        "doctor to review treatment",
                        "The uveitis is cured — stop monitoring",
                        "A machine fault — ignore it",
                        "The OT should increase the steroid dose",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A rising flare suggests worsening inflammation. The "
                                   "OT documents and flags the trend; the doctor adjusts "
                                   "treatment.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why is an objective flare value more useful than a "
                            "subjective impression of inflammation for monitoring?",
                    "options": [
                        "A number can be compared reliably over visits, reducing "
                        "observer variability",
                        "Subjective impressions are always more accurate",
                        "Flare numbers cannot be compared",
                        "Objective values change randomly",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "An objective, repeatable number lets the team track "
                                   "inflammation across visits without the variability "
                                   "of subjective grading.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL situations where serial flare measurement is "
                            "valuable.",
                    "options": [
                        "Monitoring response of uveitis to treatment",
                        "Tracking post-operative inflammation as it settles",
                        "Comparing the affected eye with a fellow-eye baseline",
                        "Calculating the IOL power for cataract surgery",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Serial flare is valuable for uveitis monitoring, "
                                   "post-op inflammation and fellow-eye comparison. It "
                                   "has nothing to do with IOL calculation.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Which statement about the flare test is correct?",
                    "options": [
                        "It non-invasively measures anterior chamber protein "
                        "(inflammation); higher = more inflammation; the doctor acts on "
                        "it",
                        "It measures eye pressure by air puff",
                        "A higher value means less inflammation",
                        "It requires touching the eye with a probe",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Laser flare photometry non-invasively measures "
                                   "anterior chamber protein; a higher value means more "
                                   "inflammation, and the doctor decides on treatment.",
                    "reasoning_eligible": False,
                },
            ],
        },
        "corneal_topography": {
            "easy": [
                {
                    "stem": "What does corneal topography map?",
                    "options": [
                        "Corneal curvature and elevation across the whole corneal "
                        "surface",
                        "The retinal thickness",
                        "The axial length",
                        "The eye pressure",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Corneal topography maps the curvature and elevation "
                                   "of the entire corneal surface.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Name one indication for corneal topography.",
                    "options": ["Keratoconus screening",
                                "Glaucoma field testing",
                                "Cataract density grading",
                                "Colour vision testing"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Topography is used for keratoconus screening (also "
                                   "pre-LASIK and contact lens fitting).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What corneal pattern suggests keratoconus?",
                    "options": [
                        "Inferior steepening / asymmetric bow-tie / irregular "
                        "astigmatism",
                        "A perfectly symmetrical, smooth surface",
                        "Uniform central flattening",
                        "No measurable pattern",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Inferior steepening, an asymmetric bow-tie and "
                                   "irregular astigmatism are classic topographic signs "
                                   "of keratoconus.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL details corneal topography documents.",
                    "options": ["K readings", "The pattern of curvature",
                                "Any irregularity", "The visual field indices"],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "Topography documents the K readings, the curvature "
                                   "pattern and any irregularity. Visual field indices "
                                   "come from perimetry, not topography.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Is corneal topography used before refractive surgery?",
                    "options": ["Yes — for pre-LASIK assessment",
                                "No — it is never used for surgery",
                                "Only after surgery",
                                "Only for glaucoma"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Topography is part of pre-LASIK assessment to "
                                   "screen for unsuitable corneas.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "How does topography help contact lens fitting?",
                    "options": ["It maps the corneal shape to select a well-fitting "
                                "lens",
                                "It measures the eye pressure",
                                "It counts endothelial cells",
                                "It tests the visual field"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "By mapping the corneal shape, topography guides "
                                   "selection of a lens that fits well.",
                    "reasoning_eligible": False,
                },
            ],
            "medium": [
                {
                    "stem": "A young patient has inferior steepening and irregular "
                            "astigmatism on topography. What do you suspect?",
                    "options": ["Keratoconus", "Cataract",
                                "Glaucoma", "Macular degeneration"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Inferior steepening with irregular astigmatism in a "
                                   "young patient suggests keratoconus.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why is topography done before LASIK?",
                    "options": [
                        "To screen for keratoconus and irregular corneas that "
                        "contraindicate surgery",
                        "To measure the IOL power",
                        "To test colour vision",
                        "To check the eye pressure",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Topography screens for keratoconus/irregular "
                                   "corneas, which are contraindications to LASIK.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Topography versus keratometry — what is topography's "
                            "advantage?",
                    "options": [
                        "It maps the entire corneal surface, not just the central "
                        "curvature",
                        "It is faster but less detailed",
                        "It measures the retina too",
                        "There is no advantage",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Keratometry samples only the central curvature; "
                                   "topography maps the whole surface, revealing "
                                   "irregularity a few central points would miss.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "What does an asymmetric bow-tie pattern suggest?",
                    "options": ["Irregular astigmatism, possibly early keratoconus",
                                "A perfectly normal cornea",
                                "Glaucoma",
                                "A cataract"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "An asymmetric bow-tie indicates irregular "
                                   "astigmatism, which can be an early sign of "
                                   "keratoconus.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why is detecting keratoconus before LASIK so important?",
                    "options": [
                        "Operating on a keratoconic cornea can worsen it and harm "
                        "vision (ectasia)",
                        "Keratoconus makes LASIK more effective",
                        "It only affects the cosmetic result",
                        "It has no impact on surgery",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "LASIK on a weak/keratoconic cornea risks "
                                   "progressive ectasia and vision loss, so screening "
                                   "it out is critical.",
                    "reasoning_eligible": True,
                },
            ],
            "hard": [
                {
                    "stem": "A 22-year-old wants LASIK. Topography shows inferior "
                            "steepening and an asymmetric bow-tie; vision fluctuates and "
                            "they rub their eyes often. Why is this concerning?",
                    "options": [
                        "The pattern and history suggest keratoconus — LASIK would be "
                        "contraindicated; flag for the doctor",
                        "It is a normal young cornea — proceed with LASIK",
                        "Eye rubbing protects the cornea",
                        "Topography is irrelevant to LASIK planning",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Inferior steepening, asymmetric bow-tie, "
                                   "fluctuating vision and eye-rubbing point to "
                                   "keratoconus — a contraindication to LASIK that must "
                                   "be flagged.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL situations where corneal topography is "
                            "clinically valuable.",
                    "options": [
                        "Screening for keratoconus",
                        "Pre-LASIK suitability assessment",
                        "Fitting a contact lens to an irregular cornea",
                        "Calculating the visual field indices",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Topography helps keratoconus screening, LASIK "
                                   "assessment and irregular-cornea lens fitting. It "
                                   "does not produce visual field indices.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why can topography detect early keratoconus that simple "
                            "keratometry might miss?",
                    "options": [
                        "It maps the whole surface, revealing localised inferior "
                        "steepening outside the central zone",
                        "It measures the retina as well",
                        "Keratometry maps more of the cornea than topography",
                        "Early keratoconus only affects the centre",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Early keratoconus often steepens inferiorly, "
                                   "outside the few central points keratometry samples; "
                                   "whole-surface topography catches it.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Which statement about corneal topography is correct?",
                    "options": [
                        "It maps whole-surface curvature/elevation, screens "
                        "keratoconus, and supports LASIK and lens-fitting decisions",
                        "It measures the eye pressure",
                        "It only samples the central cornea",
                        "It images the retina",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Topography maps the full corneal surface, screens "
                                   "for keratoconus, and informs LASIK suitability and "
                                   "contact lens fitting.",
                    "reasoning_eligible": False,
                },
            ],
        },
        "pam": {
            "easy": [
                {
                    "stem": "What does the PAM (Potential Acuity Meter) predict?",
                    "options": ["The potential visual acuity after cataract surgery",
                                "The eye pressure",
                                "The corneal curvature",
                                "The visual field"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "PAM predicts the potential visual acuity once a "
                                   "cataract is removed.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "How does PAM work?",
                    "options": [
                        "It projects a Snellen chart onto the retina, bypassing the "
                        "cataract",
                        "It measures the lens thickness",
                        "It uses ultrasound on the eye",
                        "It counts endothelial cells",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "PAM projects a Snellen chart through a clear part "
                                   "of the lens onto the retina, bypassing the "
                                   "cataract.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What preparation does PAM need?",
                    "options": ["Pupil dilation", "Topical anaesthetic",
                                "A fasting patient", "Ultrasound gel"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "PAM requires pupil dilation to project the chart "
                                   "through the clearest part of the lens.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What is the main indication for PAM?",
                    "options": [
                        "A dense cataract — to assess retinal function before surgery",
                        "Glaucoma field monitoring",
                        "Dry eye assessment",
                        "Colour vision screening",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "PAM is used with a dense cataract to estimate how "
                                   "well the retina is likely to see after surgery.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What does a good PAM result suggest?",
                    "options": ["Good potential vision after the cataract is removed",
                                "The cataract is mild",
                                "The eye pressure is normal",
                                "Surgery is unnecessary"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A good PAM result suggests the retina can see well, "
                                   "so vision is likely to improve after cataract "
                                   "removal.",
                    "reasoning_eligible": False,
                },
            ],
            "medium": [
                {
                    "stem": "Why use PAM in a dense cataract?",
                    "options": [
                        "To estimate how much vision is limited by the lens versus the "
                        "retina",
                        "To measure the cataract's hardness",
                        "To calculate the IOL power",
                        "To check the eye pressure",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "PAM helps separate vision loss due to the cataract "
                                   "(removable) from loss due to the retina "
                                   "(not removable by cataract surgery).",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "A dense cataract with a good PAM result — how is this "
                            "interpreted?",
                    "options": [
                        "The retina likely functions well; surgery may improve vision",
                        "The retina is damaged; surgery is pointless",
                        "The cataract is not actually dense",
                        "The patient has glaucoma",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A good PAM despite a dense cataract suggests the "
                                   "retina works well, so removing the cataract is "
                                   "likely to improve vision.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why is dilation needed for PAM?",
                    "options": [
                        "To project the chart through the clearest part of the lens "
                        "onto the retina",
                        "To relax the patient",
                        "To lower the eye pressure",
                        "To numb the cornea",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A dilated pupil lets the chart be projected through "
                                   "a clearer area of the lens, around the densest "
                                   "cataract, onto the retina.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Does PAM measure lens or retinal function?",
                    "options": [
                        "Retinal (and visual pathway) function, bypassing the lens",
                        "Only the lens density",
                        "The corneal curvature",
                        "The eye pressure",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "By bypassing the cataract, PAM tests the retina and "
                                   "visual pathway rather than the lens itself.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What does the OT document for a PAM?",
                    "options": [
                        "Diagnosis, indication, preparation and the predicted post-op "
                        "VA",
                        "Only the patient's name",
                        "The IOL power",
                        "Nothing is recorded",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Document the diagnosis, indication, preparation "
                                   "(dilation) and the predicted post-operative visual "
                                   "acuity.",
                    "reasoning_eligible": False,
                },
            ],
            "hard": [
                {
                    "stem": "A patient with a dense cataract AND suspected macular "
                            "disease has a poor PAM result. How might this influence "
                            "expectations?",
                    "options": [
                        "It tempers expectations — poor retinal potential means "
                        "cataract surgery alone may not restore good vision",
                        "It guarantees perfect vision after surgery",
                        "It means the cataract is mild",
                        "PAM results are irrelevant to outcomes",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A poor PAM suggests limited retinal potential; "
                                   "surgery may remove the cataract but vision could "
                                   "stay limited by the macular disease — useful for "
                                   "counselling expectations.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why can PAM be more informative than visual acuity alone "
                            "in a dense-cataract patient?",
                    "options": [
                        "Standard VA is dragged down by the cataract; PAM peeks past "
                        "it to gauge the retina's potential",
                        "PAM measures the cataract density precisely",
                        "VA already shows the post-op result",
                        "PAM measures the eye pressure",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Ordinary VA reflects the cataract's blur; PAM "
                                   "projects past the opacity to estimate what the "
                                   "retina could achieve once it is removed.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL true statements about PAM.",
                    "options": [
                        "It needs dilation",
                        "It estimates potential post-cataract vision",
                        "It assesses retinal/visual-pathway function past the lens",
                        "It determines the IOL power",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "PAM needs dilation, estimates potential post-op "
                                   "vision and tests function past the lens. It does "
                                   "not calculate IOL power (that is biometry).",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Which statement best captures the role of PAM before "
                            "cataract surgery?",
                    "options": [
                        "It helps predict whether removing the cataract will improve "
                        "vision, informing surgical decisions and counselling",
                        "It replaces biometry for IOL selection",
                        "It treats the cataract",
                        "It measures the visual field",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "PAM predicts the likely visual benefit of cataract "
                                   "removal, supporting the decision to operate and "
                                   "patient counselling.",
                    "reasoning_eligible": False,
                },
            ],
        },
        "hrt": {
            "easy": [
                {
                    "stem": "What does HRT (Heidelberg Retinal Tomography) scan?",
                    "options": ["The optic nerve head (a 3D laser scan)",
                                "The cornea",
                                "The anterior chamber angle",
                                "The lens"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "HRT is a 3D laser scan of the optic nerve head.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What does HRT measure?",
                    "options": [
                        "The retinal nerve fibre layer (RNFL) and optic disc "
                        "parameters",
                        "The axial length",
                        "The corneal curvature",
                        "The eye pressure",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "HRT measures RNFL and optic disc parameters.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What is the main indication for HRT?",
                    "options": ["Glaucoma diagnosis and monitoring",
                                "Cataract grading",
                                "Dry eye assessment",
                                "Colour vision testing"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "HRT is used for glaucoma diagnosis and monitoring.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What technology does HRT use?",
                    "options": ["3D laser scanning", "Ultrasound",
                                "An air puff", "X-rays"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "HRT uses 3D laser scanning of the optic nerve head.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Is HRT structural or functional testing?",
                    "options": ["Structural (the visual field is the functional test)",
                                "Functional",
                                "Both equally",
                                "Neither"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "HRT is a structural test of the optic nerve head; "
                                   "the visual field is the matching functional test.",
                    "reasoning_eligible": False,
                },
            ],
            "medium": [
                {
                    "stem": "How does HRT help in glaucoma?",
                    "options": [
                        "It quantifies the optic disc and RNFL to detect and monitor "
                        "glaucomatous change",
                        "It lowers the eye pressure",
                        "It measures the visual field",
                        "It calculates the IOL power",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "HRT gives objective optic disc/RNFL measurements to "
                                   "detect and track glaucomatous structural change.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "HRT and RNFL OCT both assess which structure?",
                    "options": ["The optic nerve head / RNFL (structural glaucoma "
                                "assessment)",
                                "The macula",
                                "The cornea",
                                "The anterior chamber"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Both HRT and RNFL OCT assess the optic nerve "
                                   "head/RNFL structurally for glaucoma.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why repeat HRT over time?",
                    "options": ["To monitor progression of optic disc/RNFL change",
                                "To recalibrate the laser",
                                "To measure the cataract",
                                "There is no reason to repeat it"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Serial HRT scans track progressive optic disc/RNFL "
                                   "change, which is central to glaucoma monitoring.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "What does the OT document for an HRT?",
                    "options": [
                        "Diagnosis, indication, eye(s), and the disc/RNFL findings",
                        "Only the patient's name",
                        "The IOL power",
                        "Nothing is documented",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Record the diagnosis, indication, eye(s) and the "
                                   "optic disc/RNFL findings.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why are structural tests like HRT used alongside the "
                            "visual field in glaucoma?",
                    "options": [
                        "Structure (HRT) and function (field) together give a fuller, "
                        "more reliable picture",
                        "The field test is unnecessary if HRT is done",
                        "They measure unrelated diseases",
                        "HRT replaces the need for any other test",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Combining structural HRT data with the functional "
                                   "visual field gives a more complete and reliable "
                                   "assessment of glaucoma.",
                    "reasoning_eligible": True,
                },
            ],
            "hard": [
                {
                    "stem": "A glaucoma patient's serial HRT shows progressive optic "
                            "disc cupping that matches worsening visual fields. What "
                            "does this combination indicate?",
                    "options": [
                        "Structure-function agreement supporting glaucoma progression "
                        "— flag for review",
                        "A machine artefact to ignore",
                        "Improvement in the glaucoma",
                        "A purely refractive change",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Progressive cupping on HRT matching field "
                                   "worsening is concordant structure-function "
                                   "evidence of glaucoma progression — flag it.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why is HRT described as complementary to, not a "
                            "replacement for, the visual field?",
                    "options": [
                        "HRT measures structure objectively; the field measures the "
                        "patient's actual vision — both are needed",
                        "HRT already measures vision directly",
                        "The field test measures structure",
                        "They test completely different diseases",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "HRT objectively images the optic nerve structure, "
                                   "but only the visual field shows how the patient "
                                   "actually sees — the two complement each other.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL true statements about HRT.",
                    "options": [
                        "It is a 3D laser scan of the optic nerve head",
                        "It is a structural test for glaucoma",
                        "Serial scans track disc/RNFL progression",
                        "It measures the patient's visual field directly",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "HRT is a 3D laser structural scan of the optic "
                                   "nerve head, tracked over time for glaucoma. It does "
                                   "NOT measure the visual field (that is perimetry).",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Which statement best summarises HRT's role?",
                    "options": [
                        "An objective, repeatable structural assessment of the optic "
                        "nerve head/RNFL for glaucoma, used with the visual field",
                        "A functional test that replaces perimetry",
                        "A contact ultrasound of the retina",
                        "A test of corneal curvature",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "HRT provides objective, repeatable structural data "
                                   "on the optic nerve head/RNFL for glaucoma, used "
                                   "alongside the functional visual field.",
                    "reasoning_eligible": False,
                },
            ],
        },
        "orthoptics": {
            "easy": [
                {
                    "stem": "What do cover/uncover tests detect?",
                    "options": [
                        "Manifest (tropia) or latent (phoria) strabismus",
                        "The eye pressure",
                        "The corneal curvature",
                        "Colour vision",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Cover/uncover tests detect eye misalignment — "
                                   "manifest (tropia) or latent (phoria).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What does the Hirschberg test use to estimate eye "
                            "alignment?",
                    "options": ["The corneal light reflex",
                                "An air puff",
                                "A moving target",
                                "Ultrasound"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "The Hirschberg test uses the position of the "
                                   "corneal light reflex to estimate alignment.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What is the normal near point of convergence (NPC)?",
                    "options": ["Less than 10 cm", "About 35 cm",
                                "About 1 metre", "6 metres"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "A normal near point of convergence is less than "
                                   "about 10 cm.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What do versions and ductions assess?",
                    "options": ["Eye movements in the directions of gaze",
                                "The eye pressure",
                                "The visual field",
                                "Colour vision"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Versions (both eyes) and ductions (one eye) assess "
                                   "eye movements in the different directions of gaze.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What does the Krimsky test estimate?",
                    "options": [
                        "The angle of deviation, using prisms over the light reflex",
                        "The corneal thickness",
                        "The retinal sensitivity",
                        "The axial length",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "The Krimsky test uses prisms over the corneal light "
                                   "reflex to estimate the angle of deviation.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What does a 'tropia' mean?",
                    "options": ["A manifest (constant) eye deviation",
                                "A latent deviation seen only on cover testing",
                                "Normal alignment",
                                "A type of cataract"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "A tropia is a manifest deviation — present with "
                                   "both eyes open — unlike a latent phoria.",
                    "reasoning_eligible": False,
                },
            ],
            "medium": [
                {
                    "stem": "A child's corneal light reflex is displaced temporally in "
                            "one eye. What does this suggest?",
                    "options": ["Esotropia (an inward turn)",
                                "Exotropia (an outward turn)",
                                "Normal alignment",
                                "A cataract"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A temporally displaced light reflex indicates the "
                                   "eye is turned inward — esotropia.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why assess a child's squint early?",
                    "options": ["Childhood squint can cause amblyopia (lazy eye)",
                                "Squints always resolve by adulthood",
                                "It is only a cosmetic concern",
                                "Early squint cannot be treated"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "An untreated childhood squint can lead to amblyopia "
                                   "(lazy eye), so early assessment matters.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "A patient cannot do automated fields. Which gross field "
                            "test can you perform?",
                    "options": ["The confrontation visual field test",
                                "Another automated HVF",
                                "An OCT",
                                "No field test is possible"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Confrontation field testing is a simple, "
                                   "equipment-free way to grossly check the visual "
                                   "field.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What does a remote (reduced) near point of convergence "
                            "indicate?",
                    "options": ["Convergence insufficiency",
                                "Normal convergence",
                                "Esotropia",
                                "A cataract"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A near point of convergence further than normal "
                                   "(receded) indicates convergence insufficiency.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Cover/uncover reveals a deviation only when an eye is "
                            "uncovered. Which type is this?",
                    "options": [
                        "A latent deviation (phoria)",
                        "A manifest deviation (tropia)",
                        "Normal alignment",
                        "Convergence excess",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "A deviation that appears only when the eye is "
                                   "uncovered (and is otherwise controlled) is a latent "
                                   "phoria; a tropia is present with both eyes open.",
                    "reasoning_eligible": True,
                },
            ],
            "hard": [
                {
                    "stem": "A 3-year-old has a constant inward turn of one eye and a "
                            "temporally displaced light reflex. Why is prompt referral "
                            "important?",
                    "options": [
                        "A constant childhood esotropia risks amblyopia; early "
                        "treatment protects vision",
                        "Squints in children never need treatment",
                        "It is purely cosmetic",
                        "It will worsen if treated",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A constant esotropia in a young child risks "
                                   "amblyopia; prompt referral allows treatment during "
                                   "the period vision is still developing.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "How do you distinguish a phoria from a tropia on cover "
                            "testing?",
                    "options": [
                        "A tropia is present with both eyes open; a phoria appears "
                        "only when binocular fusion is broken by covering an eye",
                        "A phoria is always present; a tropia only when covered",
                        "They cannot be distinguished",
                        "Both are only seen with both eyes open",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "A tropia (manifest) shows with both eyes open; a "
                                   "phoria (latent) only appears when covering an eye "
                                   "breaks fusion.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL orthoptic tools that assess eye alignment or "
                            "movement.",
                    "options": [
                        "Cover/uncover test",
                        "Hirschberg (corneal light reflex)",
                        "Versions and ductions",
                        "Ishihara plates",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "Cover/uncover, Hirschberg and versions/ductions all "
                                   "assess alignment or movement. Ishihara plates test "
                                   "colour vision, not alignment.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "A young adult reports eye strain and double vision when "
                            "reading, with a receded near point of convergence. What "
                            "does this picture suggest?",
                    "options": [
                        "Convergence insufficiency — the eyes struggle to converge for "
                        "near work",
                        "A constant esotropia",
                        "A dense cataract",
                        "Normal near vision",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Near eye strain and diplopia with a receded NPC "
                                   "are typical of convergence insufficiency.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Which statement about basic orthoptic assessment is "
                            "correct?",
                    "options": [
                        "Cover tests reveal tropia/phoria, Hirschberg/Krimsky estimate "
                        "the angle, and the NPC checks convergence",
                        "All orthoptic tests measure the eye pressure",
                        "The Krimsky test maps the visual field",
                        "Convergence is assessed by the air-puff tonometer",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Cover tests classify deviations, Hirschberg/Krimsky "
                                   "estimate the angle, and the near point of "
                                   "convergence checks convergence — the core orthoptic "
                                   "tools.",
                    "reasoning_eligible": False,
                },
            ],
        },
        "dayward_theatre": {
            "easy": [
                {
                    "stem": "What does the DISM mnemonic stand for?",
                    "options": [
                        "Diagnosis, Indication, Surgery planned, Medical conditions",
                        "Dose, Injection, Suture, Medication",
                        "Distance, IOP, Sugar, Medication",
                        "Diagnosis, IOL, Sutures, Monitoring",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "DISM = Diagnosis, Indication, Surgery planned, "
                                   "Medical conditions — a pre-op framework.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL anaesthesia types recorded pre-operatively.",
                    "options": ["GA (general)", "LA (local)",
                                "Topical", "Spinal block of the eye"],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "Eye surgery anaesthesia is recorded as GA "
                                   "(general), LA (local) or topical.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Select ALL vital signs monitored in post-op care.",
                    "options": ["Blood pressure (BP)", "Respiratory rate (RR)",
                                "Pulse rate (PR)", "Colour vision"],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "theory",
                    "explanation": "Post-op monitoring includes BP, RR and PR. Colour "
                                   "vision is not a vital sign.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What does 'TCU' document post-op?",
                    "options": ["The time and date of the next follow-up appointment",
                                "The total corneal ulcer size",
                                "The surgical fee",
                                "The IOL power"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "TCU ('to come back') records the next follow-up "
                                   "appointment.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What must be confirmed about the eye before theatre?",
                    "options": [
                        "The correct eye to be operated (and that it is marked)",
                        "The colour of the iris",
                        "The patient's near vision",
                        "The room temperature",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Confirm (and mark) the correct eye before theatre "
                                   "to prevent wrong-eye surgery.",
                    "reasoning_eligible": False,
                },
            ],
            "medium": [
                {
                    "stem": "Why use the DISM framework pre-operatively?",
                    "options": [
                        "To capture key surgical details (diagnosis, indication, "
                        "surgery, medical conditions) for safety",
                        "To decide the theatre lighting",
                        "To calculate the IOL power",
                        "It is only for billing",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "DISM ensures the key surgical details are captured "
                                   "consistently, supporting safe surgery.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "When is a patient ready for discharge after day surgery?",
                    "options": ["When vital signs are stable and the patient is "
                                "comfortable",
                                "Immediately after the operation regardless",
                                "Only after an overnight stay",
                                "When the next patient arrives"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Discharge follows stable vital signs and patient "
                                   "comfort after day surgery.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Why confirm and mark the correct eye?",
                    "options": ["To prevent wrong-eye surgery — a critical safety step",
                                "To decide which eye is dilated",
                                "For billing only",
                                "It is optional"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Marking the correct eye is a critical safety step "
                                   "that prevents wrong-eye surgery.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Abnormal pre-op vital signs are found. What do you do?",
                    "options": [
                        "Escalate to the nurse/doctor before the patient proceeds",
                        "Proceed to theatre regardless",
                        "Send the patient home without telling anyone",
                        "Re-check only after surgery",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Abnormal pre-op vitals must be escalated to the "
                                   "nurse/doctor before surgery proceeds.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL items recorded for post-op discharge.",
                    "options": ["The TCU (next follow-up)",
                                "The post-op medications prescribed",
                                "Discharge advice/observations",
                                "The patient's favourite meal"],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Record the TCU, the post-op medications and "
                                   "discharge advice/observations. The favourite meal "
                                   "is irrelevant.",
                    "reasoning_eligible": False,
                },
            ],
            "hard": [
                {
                    "stem": "On the WHO-style pre-theatre check, the consent says left "
                            "eye but the mark is on the right. What must happen?",
                    "options": [
                        "Stop and resolve the discrepancy before any surgery proceeds",
                        "Proceed with the marked eye",
                        "Proceed with the consented eye",
                        "Let the surgeon decide in theatre without checking",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Any mismatch between consent and the site mark must "
                                   "be stopped and resolved before surgery — this "
                                   "prevents a wrong-eye never-event.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why are pre-op checks (DISM, correct-eye marking, vitals) "
                            "treated as non-negotiable safety steps?",
                    "options": [
                        "They prevent serious, avoidable errors such as wrong-eye "
                        "surgery or operating on an unfit patient",
                        "They are only paperwork formalities",
                        "They slow the list down for no benefit",
                        "They replace the surgeon's judgement",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "These checks catch avoidable, high-harm errors "
                                   "(wrong eye, unfit patient), which is why they are "
                                   "mandatory regardless of time pressure.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL findings that should delay a patient proceeding "
                            "to theatre until reviewed.",
                    "options": [
                        "Markedly abnormal pre-op vital signs",
                        "A mismatch between consent and the marked eye",
                        "Uncertainty about fasting or key medications",
                        "A calm patient with stable, normal vitals",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Abnormal vitals, a consent/mark mismatch and "
                                   "fasting/medication uncertainty all warrant review "
                                   "first. Stable normal vitals do not.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "After day surgery a patient is drowsy with a falling blood "
                            "pressure. What is the appropriate response?",
                    "options": [
                        "Escalate to the nurse/doctor promptly — do not discharge "
                        "until stable",
                        "Discharge them quickly to free the bed",
                        "Record it and ignore it",
                        "Give them the next patient's slot",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Drowsiness with a falling BP is not a safe "
                                   "discharge state — escalate and keep the patient "
                                   "until stable.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Which statement about day-ward and theatre care is "
                            "correct?",
                    "options": [
                        "DISM captures surgical details, the correct eye is confirmed "
                        "and marked, and discharge follows stable vitals and comfort",
                        "The correct eye is confirmed only after surgery",
                        "Vitals are not monitored post-op",
                        "TCU records the IOL power",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Safe day-surgery care uses DISM, confirms/marks the "
                                   "correct eye beforehand, monitors vitals, and "
                                   "discharges only when the patient is stable and "
                                   "comfortable.",
                    "reasoning_eligible": False,
                },
            ],
        },
        "auto_refraction": {
            "easy": [
                {
                    "stem": "What does auto-refraction (AR) measure?",
                    "options": [
                        "Refractive error objectively (myopia, hyperopia, astigmatism)",
                        "The eye pressure",
                        "The visual field",
                        "The endothelial cell count",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Auto-refraction objectively estimates the "
                                   "refractive error (myopia, hyperopia, astigmatism).",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "What does auto-keratometry (AK) measure?",
                    "options": ["Corneal curvature and corneal astigmatism",
                                "The retinal thickness",
                                "The axial length",
                                "The eye pressure"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Auto-keratometry measures the corneal curvature and "
                                   "corneal astigmatism.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "When is AR/AK typically done?",
                    "options": ["For new patients and pre-operative assessment",
                                "Only in an emergency",
                                "Only after surgery",
                                "Never for adults"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "AR/AK is typically performed for new patients and "
                                   "as part of pre-operative assessment.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Should glasses/contact lenses be removed for AR/AK?",
                    "options": ["Yes", "No", "Only glasses", "Only contact lenses"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Glasses and contact lenses are removed so they do "
                                   "not affect the AR/AK measurement.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "AK is especially important for which calculation?",
                    "options": ["IOL power calculation in cataract surgery",
                                "The visual field index",
                                "The endothelial count",
                                "The triage category"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Corneal curvature (keratometry) is needed for the "
                                   "IOL power calculation in cataract surgery.",
                    "reasoning_eligible": False,
                },
            ],
            "medium": [
                {
                    "stem": "Why might AR/AK readings be inconsistent?",
                    "options": ["An unstable tear film (dry eye) or poor fixation",
                                "The patient is too tall",
                                "The room is too warm",
                                "AR/AK is never inconsistent"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "An unstable tear film (dry eye) or poor fixation "
                                   "commonly cause inconsistent AR/AK readings.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "How do you improve unreliable AR/AK caused by dry eye?",
                    "options": [
                        "Ask the patient to blink or instil a lubricant, then "
                        "re-acquire",
                        "Increase the scan speed",
                        "Dilate the pupil",
                        "Switch to ultrasound",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "A blink or a lubricant drop refreshes the tear "
                                   "film, improving the reading — then re-acquire.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Is the AR result a final spectacle prescription?",
                    "options": [
                        "No — it is an objective starting point; subjective refraction "
                        "confirms it",
                        "Yes — it is the final prescription",
                        "Only for children",
                        "Only for cataract patients",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "AR gives an objective starting point; the final "
                                   "prescription is set by subjective refraction.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why is AK used before cataract surgery?",
                    "options": [
                        "Corneal curvature is needed for the IOL power calculation",
                        "It measures the cataract density",
                        "It checks the visual field",
                        "It lowers the eye pressure",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "The corneal curvature from AK feeds into the IOL "
                                   "power calculation for cataract surgery.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Who sets the final spectacle prescription?",
                    "options": [
                        "The doctor/optometrist via subjective refraction",
                        "The auto-refractor decides it",
                        "The patient chooses it",
                        "The OT prescribes it",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "The final prescription is determined by the "
                                   "doctor/optometrist through subjective refraction, "
                                   "starting from the AR.",
                    "reasoning_eligible": False,
                },
            ],
            "hard": [
                {
                    "stem": "A patient with dry eye has scattered, inconsistent AR/AK "
                            "values. Why must this be corrected before the data is "
                            "used for IOL calculation?",
                    "options": [
                        "Unstable keratometry feeds a wrong IOL power, risking a poor "
                        "refractive outcome",
                        "Inconsistent AR/AK improves the IOL result",
                        "AR/AK is irrelevant to IOL power",
                        "Dry eye cannot affect the cornea",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "practical",
                    "explanation": "Tear-film instability scatters the keratometry; "
                                   "using it would give a wrong IOL power and a poor "
                                   "outcome — refresh the tear film and re-measure "
                                   "first.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Why is the auto-refraction treated as a starting point "
                            "rather than the final prescription?",
                    "options": [
                        "It is an objective estimate; subjective refraction refines it "
                        "to what the patient actually sees best with",
                        "It is always exactly right",
                        "It measures the retina, not refraction",
                        "Subjective refraction is less accurate",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "AR objectively estimates the error, but the patient "
                                   "must confirm the best subjective result — so it is "
                                   "a starting point, then refined.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "Select ALL steps that improve AR/AK reliability.",
                    "options": [
                        "Remove glasses and contact lenses first",
                        "Refresh the tear film (blink/lubricant) if it is unstable",
                        "Ensure good, steady fixation",
                        "Leave a contact lens in to keep the eye moist",
                    ],
                    "correct": [0, 1, 2],
                    "qtype": "multi",
                    "kind": "practical",
                    "explanation": "Remove lenses, refresh a poor tear film, and ensure "
                                   "steady fixation. Leaving a contact lens in would "
                                   "corrupt the measurement.",
                    "reasoning_eligible": True,
                },
                {
                    "stem": "How do AR and AK each contribute differently to "
                            "pre-cataract assessment?",
                    "options": [
                        "AR estimates the patient's refractive error; AK provides "
                        "corneal curvature for the IOL calculation",
                        "Both measure only the refractive error",
                        "AK measures refraction; AR measures the cornea",
                        "Neither is used before cataract surgery",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "AR gives the refractive starting point; AK gives "
                                   "corneal curvature for the IOL power calculation — "
                                   "complementary pre-cataract data.",
                    "reasoning_eligible": False,
                },
                {
                    "stem": "Which statement about AR/AK is correct?",
                    "options": [
                        "Remove lenses, ensure a stable tear film and fixation; AR is "
                        "an objective starting point and AK feeds the IOL calculation",
                        "AR is the final prescription and needs no confirmation",
                        "Glasses should be left on during AR/AK",
                        "AK measures the eye pressure",
                    ],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Good AR/AK practice removes lenses, ensures a stable "
                                   "tear film and fixation; AR is an objective starting "
                                   "point and AK supplies corneal curvature for the IOL "
                                   "calculation.",
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


def _by_diff(role: str, topic_key: str) -> dict[str, list[dict]]:
    """The {difficulty: [cards]} map for a topic, searching every pool the role
    studies (FOUNDATIONS first, then its procedural pool). A topic lives in
    exactly one pool, so the first match wins."""
    for pool_name in pools_for(role):
        by_diff = FLASHCARDS.get(pool_name, {}).get(topic_key)
        if by_diff:
            return by_diff
    return {}


def get_set_cards(role: str, topic_key: str, difficulty: str) -> list[dict]:
    """Cards for one (topic, difficulty) set, tagged for serving."""
    cards = _by_diff(role, topic_key).get(difficulty, [])
    return [_tag(topic_key, difficulty, c) for c in cards]


def get_all_cards(role: str) -> list[dict]:
    """Every authored card a role studies (Foundations + procedures)."""
    out: list[dict] = []
    for topic_key, _ in topics_for(role):
        by_diff = _by_diff(role, topic_key)
        for difficulty in DIFFICULTIES:
            for c in by_diff.get(difficulty, []):
                out.append(_tag(topic_key, difficulty, c))
    return out


def set_card_counts(role: str) -> dict[str, int]:
    """{set_key: number of authored cards} for every set a role studies."""
    counts: dict[str, int] = {}
    for topic_key, _ in topics_for(role):
        by_diff = _by_diff(role, topic_key)
        for difficulty in DIFFICULTIES:
            counts[make_set_key(topic_key, difficulty)] = len(by_diff.get(difficulty, []))
    return counts


def get_topic_cards(role: str, topic_key: str) -> list[dict]:
    """Every authored card for ONE topic across all difficulties, tagged for
    serving. Backs the no-difficulty selection model: a topic is one mixed deck."""
    by_diff = _by_diff(role, topic_key)
    out: list[dict] = []
    for difficulty in DIFFICULTIES:
        for c in by_diff.get(difficulty, []):
            out.append(_tag(topic_key, difficulty, c))
    return out


def topic_card_counts(role: str) -> dict[str, int]:
    """{topic_key: total authored cards across all difficulties} a role studies."""
    counts: dict[str, int] = {}
    for topic_key, _ in topics_for(role):
        by_diff = _by_diff(role, topic_key)
        counts[topic_key] = sum(len(by_diff.get(d, [])) for d in DIFFICULTIES)
    return counts


def card_by_stem(role: str) -> dict[str, dict]:
    """{stem: tagged card} index for the role pool — used to rehydrate MCQ fields
    onto SM-2 due cards (which the DB stores only as front/back)."""
    return {c["stem"]: c for c in get_all_cards(role)}


def shuffle_card_options(card: dict, rng: random.Random) -> dict:
    """Return a copy of `card` with its MCQ options randomly permuted and the
    `correct` indices remapped to the new positions.

    The bank authors the correct answer(s) first, so served unshuffled every
    answer reads as "option A". This randomises the slot at serve time — the
    fix lives in one tested transform, so any future card is shuffled too.

    Builds fresh lists (never mutates the source bank, whose `options`/`correct`
    lists are shared across requests). No-op for cards with <2 options
    (free-text / empty)."""
    opts = card.get("options") or []
    if len(opts) < 2:
        return card
    order = list(range(len(opts)))          # new position i -> old index order[i]
    rng.shuffle(order)
    old_to_new = {old: new for new, old in enumerate(order)}
    return {
        **card,
        "options": [opts[i] for i in order],
        "correct": sorted(old_to_new[c] for c in card.get("correct", [])),
    }


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

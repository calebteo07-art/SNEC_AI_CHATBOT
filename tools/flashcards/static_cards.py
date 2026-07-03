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
        "systemic_disease": {
            "easy": [
                {'stem': 'Diabetes mellitus is a chronic illness characterised by:', 'options': ['Abnormally high blood glucose levels', 'Low eye pressure', 'A cloudy lens', 'High tear production'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Diabetes is high blood glucose caused by insufficient insulin (or the body failing to use insulin).', 'reasoning_eligible': False},
                {'stem': 'In Type 1 diabetes mellitus, the underlying problem is that the body:', 'options': ['Does not produce enough insulin', 'Produces too much insulin', 'Makes too many tears', 'Has high eye pressure'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Type 1 is insulin deficiency - the pancreas does not produce enough insulin.', 'reasoning_eligible': False},
                {'stem': 'In Type 2 diabetes mellitus, the body:', 'options': ['Produces insulin but cannot use it well (insulin resistance)', 'Produces no insulin at all ever', 'Has no pancreas', 'Cannot make tears'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Type 2 is insulin resistance - insulin is produced but the body cannot use it effectively.', 'reasoning_eligible': False},
                {'stem': "The classic '3 Ps' of diabetes symptoms are polyphagia, polydipsia and:", 'options': ['Polyuria (passing more urine)', 'Photophobia', 'Presbyopia', 'Ptosis'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': "The three P's are polyphagia (hunger), polydipsia (thirst) and polyuria (excess urine).", 'reasoning_eligible': False},
                {'stem': 'The blood test that reflects average blood sugar over the past 3 months is:', 'options': ['HbA1c (glycosylated haemoglobin)', 'Full blood count', 'Cholesterol', 'Eye pressure'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'HbA1c reflects average glucose over about 3 months; below 7% is optimal for most non-pregnant adults.', 'reasoning_eligible': False},
                {'stem': 'The eye complication of diabetes that can lead to blindness is:', 'options': ['Diabetic retinopathy', 'A stye', 'Allergic conjunctivitis', 'Presbyopia'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Chronically high glucose damages retinal blood vessels, causing diabetic retinopathy and potential vision loss.', 'reasoning_eligible': False},
                {'stem': 'Hypertension means:', 'options': ['High blood pressure', 'High eye pressure', 'High blood sugar', 'High cholesterol'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Hypertension is persistently raised blood pressure, forcing the heart to pump harder through narrowed vessels.', 'reasoning_eligible': False},
                {'stem': 'A blood pressure of 130/80 means the systolic pressure is:', 'options': ['130 mmHg', '80 mmHg', '210 mmHg', '50 mmHg'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'The first (top) number is the systolic pressure (heart contracting); the second is diastolic (heart relaxing).', 'reasoning_eligible': False},
                {'stem': 'Thyroid eye disease is also known as:', 'options': ["Graves' ophthalmopathy / thyroid-associated orbitopathy", 'Glaucoma', 'Cataract', 'Diabetic retinopathy'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': "Thyroid eye disease (Graves' ophthalmopathy / thyroid-associated orbitopathy) is the commonest cause of proptosis in adults.", 'reasoning_eligible': False},
                {'stem': 'The bulging forward of the eyes seen in thyroid eye disease is called:', 'options': ['Proptosis', 'Ptosis', 'Miosis', 'Entropion'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Proptosis (exophthalmos) is forward protrusion of the globe, a hallmark of thyroid eye disease.', 'reasoning_eligible': False},
                {'stem': 'Asthma is a chronic condition affecting the:', 'options': ['Airways (inflammation and narrowing)', 'Retina', 'Lens', 'Optic nerve'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Asthma is chronic inflammation and narrowing of the airways, causing wheeze, cough, chest tightness and breathlessness.', 'reasoning_eligible': False},
                {'stem': "In asthma management, a 'reliever' inhaler is used to:", 'options': ['Give quick, short-term relief during an acute attack', 'Prevent symptoms long-term', 'Lower blood sugar', 'Lower blood pressure'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Relievers relax the airway muscles for quick short relief in an attack; preventers are for daily long-term control.', 'reasoning_eligible': False},
                {'stem': "An asthma 'preventer' (controller) inhaler is used to:", 'options': ['Prevent symptoms long-term by reducing airway swelling and mucus', 'Give instant relief only', 'Raise blood pressure', 'Treat a cataract'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Preventers are taken daily to keep the airways open by reducing swelling and mucus, preventing attacks.', 'reasoning_eligible': False},
                {'stem': 'Gestational diabetes is diabetes that occurs:', 'options': ['During pregnancy in women without previous diabetes', 'Only in men', 'Only in children', 'Only after age 80'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Gestational diabetes appears in pregnancy; mother and child are at higher risk of Type 2 diabetes later.', 'reasoning_eligible': False},
                {'stem': 'The eye condition caused by long-standing high blood pressure is:', 'options': ['Hypertensive retinopathy', 'Cataract', 'A chalazion', 'Blepharitis'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Sustained hypertension damages retinal vessels, producing hypertensive retinopathy.', 'reasoning_eligible': False},
                {'stem': 'A patient in the eye clinic waiting area suddenly becomes breathless and wheezy. Your FIRST practical step is to:', 'options': ['Check whether they have their own quick-relief (reliever) inhaler and alert the nurse', 'Dilate their pupils', 'Measure their eye pressure', 'Send them home'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': "For an asthma attack: check for the patient's reliever, alert the staff nurse, get a wheelchair and monitor vitals.", 'reasoning_eligible': True},
                {'stem': "The 'FAST' acronym is used to recognise the signs of a:", 'options': ['Stroke', 'Cataract', 'Squint', 'Stye'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'FAST (Face, Arms, Speech, Time) helps quickly recognise stroke - a hypertension-related emergency.', 'reasoning_eligible': True},
            ],
            "medium": [
                {'stem': 'Diabetes can damage both small and large vessels. Diabetic retinopathy is an example of a:', 'options': ['Microvascular complication', 'Macrovascular complication', 'Refractive error', 'Muscle disorder'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Retinopathy affects the small retinal vessels - a microvascular complication (macrovascular = heart attack, stroke).', 'reasoning_eligible': True},
                {'stem': 'Which retinal finding indicates PROLIFERATIVE (rather than non-proliferative) diabetic retinopathy?', 'options': ['New blood vessels (neovascularisation)', 'A few blot haemorrhages only', 'A single small exudate', 'Normal vessels'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Neovascularisation (new vessels at the disc or elsewhere) defines proliferative diabetic retinopathy.', 'reasoning_eligible': True},
                {'stem': 'Cotton wool spots on the retina represent:', 'options': ['Areas of nerve-fibre-layer ischaemia (poor oxygen supply)', 'Deposits of cholesterol in the lens', 'Normal retinal pigment', 'Scar tissue from surgery'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Cotton wool spots are fluffy white patches from ischaemia of the retinal nerve fibre layer.', 'reasoning_eligible': False},
                {'stem': 'The laser treatment used to treat proliferative diabetic retinopathy is:', 'options': ['Panretinal photocoagulation (PRP)', 'LASIK', 'Cataract phacoemulsification', 'YAG capsulotomy'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'PRP applies laser burns to the peripheral retina to regress new vessels in proliferative diabetic retinopathy.', 'reasoning_eligible': False},
                {'stem': 'Besides laser and surgery, diabetic macular oedema is commonly treated with:', 'options': ['Intravitreal anti-VEGF injections', 'Oral antibiotics', 'Reading glasses', 'Artificial tears'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Anti-VEGF injections reduce leakage and new-vessel growth, a mainstay for diabetic macular oedema.', 'reasoning_eligible': False},
                {'stem': 'The single most important way to prevent progression of diabetic retinopathy is:', 'options': ['Good control of the blood glucose (and regular eye follow-up)', 'Wearing sunglasses', 'Taking more vitamins', 'Using thicker glasses'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Good glycaemic control (diet, lifestyle, medication compliance) plus regular screening best preserves vision.', 'reasoning_eligible': True},
                {'stem': "'Essential' (primary) hypertension is the type in which:", 'options': ['No specific underlying cause is identified', 'There is always a kidney tumour', 'It only happens in the clinic', 'It is caused by medication'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'In essential/primary hypertension (the most common type) the cause is unknown; secondary has an identifiable cause.', 'reasoning_eligible': False},
                {'stem': "'White-coat hypertension' describes blood pressure that is:", 'options': ['Higher in the clinic than in other settings', 'Always dangerously low', 'Caused by kidney disease', 'Only present at night'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'White-coat hypertension is when clinic readings are raised but home/other readings are normal.', 'reasoning_eligible': True},
                {'stem': 'Flame-shaped haemorrhages, cotton wool spots and a swollen optic disc on fundus examination suggest:', 'options': ['Hypertensive retinopathy', 'A normal healthy retina', 'A cataract', 'Dry eye'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'These are classic features of hypertensive retinopathy from damaged retinal vessels.', 'reasoning_eligible': True},
                {'stem': "A 'cherry-red spot' with a pale, oedematous retina is the hallmark of a:", 'options': ['Central retinal artery occlusion (CRAO)', 'Central retinal vein occlusion', 'Cataract', 'Vitreous floater'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'In CRAO the ischaemic retina turns pale while the thin foveal region shows the underlying choroid as a cherry-red spot.', 'reasoning_eligible': True},
                {'stem': 'In thyroid eye disease, the inability to fully close the eyelids is called:', 'options': ['Lagophthalmos', 'Ptosis', 'Miosis', 'Entropion'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Lagophthalmos (incomplete lid closure) results from proptosis and lid retraction, risking corneal exposure.', 'reasoning_eligible': True},
                {'stem': 'Which sign of thyroid eye disease is a SIGHT-THREATENING emergency requiring urgent referral?', 'options': ['Compressive optic neuropathy (pressure on the optic nerve from enlarged muscles)', 'Mild lid swelling alone', 'A small amount of tearing', 'Slightly red eyes'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Enlarged extraocular muscles can compress the optic nerve at the orbital apex, threatening vision - an emergency.', 'reasoning_eligible': True},
                {'stem': 'Mild, inactive thyroid eye disease is usually managed by:', 'options': ['Observation (and lubrication), with steroids/surgery reserved for active or severe disease', 'Immediate orbital surgery for everyone', 'Laser to the retina', 'Panretinal photocoagulation'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Mild inactive disease is observed; active/moderate-severe disease may need systemic steroids, immunomodulation, radiotherapy or surgery.', 'reasoning_eligible': False},
                {'stem': 'Common risk factors for asthma include family history, allergies, obesity, smoking and:', 'options': ['Air pollution and occupational hazards', 'Wearing glasses', 'Drinking water', 'Reading in dim light'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Asthma risk factors include family history, other allergies, obesity, occupational hazards, air pollution, smoking and respiratory infections.', 'reasoning_eligible': False},
                {'stem': 'During an asthma attack in the clinic, which vital signs should be monitored?', 'options': ['Heart rate, respiratory rate, oxygen saturation and blood pressure', 'Only eye pressure', 'Only colour vision', 'Only near acuity'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Monitor HR, RR, SpO2 and BP while the patient uses their reliever and help is summoned.', 'reasoning_eligible': True},
                {'stem': 'Research in Asians has linked higher intraocular pressure with all of the following EXCEPT:', 'options': ['Lower body-mass index and lower blood pressure', 'Higher body-mass index', 'Diabetes', 'Higher systemic blood pressure'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Studies relate HIGHER BMI, diabetes and higher systemic blood pressure to higher IOP - not lower values.', 'reasoning_eligible': True},
                {'stem': 'A hypoglycaemic (low blood sugar) reaction is a possible side effect of:', 'options': ['Anti-diabetic medications (and insulin)', 'Artificial tears', 'Reading glasses', 'Sunglasses'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Anti-diabetic drugs and insulin can lower glucose too far, causing hypoglycaemia - an important clinic concern.', 'reasoning_eligible': False},
            ],
            "hard": [
                {'stem': 'A diabetic patient in the clinic becomes shaky, sweaty and confused. A finger-prick shows glucose 3.2 mmol/L. Following the 15-15 rule you should first give:', 'options': ['15 g of fast-acting carbohydrate, then recheck glucose after 15 minutes', 'A long slow-release meal only and wait an hour', 'Nothing until a doctor arrives', 'Insulin immediately'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'For glucose <4.0 mmol/L give 15 g fast carbohydrate (juice, sugar, glucose tablets), wait 15 minutes and recheck; repeat if still low.', 'reasoning_eligible': True},
                {'stem': 'After a hypoglycaemic episode is corrected with fast carbohydrate, the next step to prevent recurrence is to:', 'options': ['Follow with a longer-acting carbohydrate or a meal/snack', 'Give insulin', 'Stop all food for the day', 'Give another 3 fast-acting sugars every minute'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Once glucose is above 4.0 mmol/L, a longer-acting carbohydrate or meal prevents the sugar dropping again.', 'reasoning_eligible': True},
                {'stem': 'Which glucose threshold defines hypoglycaemia in the clinic protocol taught to SNEC staff?', 'options': ['Blood glucose below 4.0 mmol/L', 'Blood glucose below 10 mmol/L', 'Blood glucose above 7 mmol/L', 'Any glucose reading at all'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The 15-15 rule is triggered at glucose <4.0 mmol/L (or symptoms of hypoglycaemia when unable to test).', 'reasoning_eligible': False},
                {'stem': "A patient describes sudden, painless, complete loss of vision in one eye that fully recovered within a few minutes. In an older patient this 'amaurosis fugax' should prompt urgent concern for:", 'options': ['A vascular cause (e.g. carotid disease or giant cell arteritis) needing prompt work-up', 'A simple need for new glasses', 'Dry eye', 'Allergic conjunctivitis'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Transient monocular visual loss can herald stroke or GCA; it warrants urgent assessment, not reassurance.', 'reasoning_eligible': True},
                {'stem': 'Ordering the severity of diabetic retinopathy from earliest to most severe:', 'options': ['Mild NPDR -> moderate NPDR -> severe NPDR -> proliferative DR', 'Proliferative DR -> severe NPDR -> mild NPDR', 'Mild NPDR -> proliferative DR -> moderate NPDR', 'They are all the same severity'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Non-proliferative disease (mild -> moderate -> severe) precedes proliferative DR, which adds new-vessel growth.', 'reasoning_eligible': True},
                {'stem': 'A proliferative diabetic retinopathy patient reports a sudden shower of floaters and dark vision. The most likely cause is:', 'options': ['A vitreous haemorrhage from fragile new vessels', 'A new refractive error', 'A stye', 'Simple dry eye'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Fragile new vessels in proliferative DR bleed easily; a vitreous haemorrhage causes sudden floaters and vision loss.', 'reasoning_eligible': True},
                {'stem': 'Why does uncontrolled diabetes cause polyuria (excess urination)?', 'options': ["Glucose exceeds the kidney's threshold and spills into urine, dragging water out by osmotic diuresis", 'The kidneys stop working entirely', 'The bladder shrinks', 'Insulin directly fills the bladder'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'When blood glucose exceeds the renal threshold it spills into the urine; the osmotic load pulls water with it, causing polyuria (then thirst/polydipsia).', 'reasoning_eligible': True},
                {'stem': 'A patient with thyroid eye disease shows one eye unable to look up and the other unable to look down, with double vision. This is due to:', 'options': ['Restrictive myopathy (enlarged, tethered extraocular muscles)', 'A cataract', 'Optic neuritis', 'Simple refractive error'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Inflamed, enlarged extraocular muscles become fibrotic and restrictive, limiting movement and causing diplopia.', 'reasoning_eligible': True},
                {'stem': 'The greatest immediate corneal risk in a patient with marked proptosis and lagophthalmos from thyroid eye disease is:', 'options': ['Exposure keratopathy from the cornea not being fully covered by the lids', 'Cataract', 'Glaucoma', 'A blocked tear duct'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'If the lids cannot close over the protruding globe, the cornea dries and can ulcerate (exposure keratopathy); lubrication is essential.', 'reasoning_eligible': True},
                {'stem': 'A central retinal VEIN occlusion classically appears on fundoscopy as:', 'options': ["Widespread flame haemorrhages in all quadrants ('blood and thunder') with a swollen disc", 'A pale retina with a cherry-red spot', 'A completely normal fundus', 'A cloudy lens only'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': "CRVO gives diffuse haemorrhages in all four quadrants ('blood-and-thunder' fundus), dilated veins, cotton wool spots and disc swelling.", 'reasoning_eligible': True},
                {'stem': 'Hypertension can reduce blood flow to the optic nerve head. The resulting condition is:', 'options': ['Ischaemic optic neuropathy', 'Cataract', 'Blepharitis', 'A pterygium'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Insufficient oxygen supply to the optic nerve (e.g. in hypertension) causes ischaemic optic neuropathy.', 'reasoning_eligible': False},
                {'stem': 'Why should an eye clinic be especially alert to a diabetic patient who has fasted for a procedure but still took their usual diabetic medication?', 'options': ['They are at higher risk of a hypoglycaemic reaction while waiting', 'They will get high eye pressure', 'They cannot be dilated', 'Their vision cannot be tested'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Taking glucose-lowering drugs without eating (fasting) can drop blood sugar dangerously low - staff should watch for hypoglycaemia.', 'reasoning_eligible': True},
                {'stem': 'In the population aged 60-69 in Singapore, the approximate prevalence of hypertension is:', 'options': ['More than 1 in 2 people', 'Fewer than 1 in 100 people', 'Nobody', 'Exactly everyone'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'About a quarter of residents aged 30-69 have hypertension, rising to more than half of those aged 60-69.', 'reasoning_eligible': False},
                {'stem': 'A well-controlled HbA1c target for most non-pregnant adults with diabetes is:', 'options': ['Below 7%', 'Above 15%', 'Exactly 25%', 'Below 1%'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'An HbA1c under 7% without significant hypoglycaemia is considered optimal for most non-pregnant adults.', 'reasoning_eligible': False},
                {'stem': 'A patient with newly-diagnosed thyroid eye disease and rapidly worsening colour vision and dimming in one eye needs:', 'options': ['Urgent referral - this may be compressive optic neuropathy', 'Reassurance and a review in a year', 'Only artificial tears', 'New reading glasses'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Worsening colour vision and dimming suggest optic-nerve compression; urgent treatment (steroids/decompression) can save sight.', 'reasoning_eligible': True},
                {'stem': 'Which combination of systemic diseases are the leading modifiable causes of sight-threatening retinal complications covered in this topic?', 'options': ['Diabetes and hypertension', 'Presbyopia and astigmatism', 'Dry eye and blepharitis', 'Colour blindness and squint'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Diabetes and hypertension are major systemic diseases whose good control prevents sight-threatening retinopathy and vascular occlusions.', 'reasoning_eligible': True},
            ],
        },
        "neuro_strabismus": {
            "easy": [
                {'stem': 'Diplopia is the medical term for:', 'options': ['Double vision (seeing one object as two)', 'Blindness', 'Blurred near vision', 'Colour blindness'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Diplopia means double vision - one object is perceived as two.', 'reasoning_eligible': False},
                {'stem': 'Strabismus (squint) is a condition where:', 'options': ['The two eyes are not aligned in the same direction', 'The lens goes cloudy', 'The eye pressure is high', 'The retina detaches'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'In strabismus one eye looks straight while the other turns in, out, up or down.', 'reasoning_eligible': False},
                {'stem': 'An inward-turning (convergent) squint is called:', 'options': ['Esotropia', 'Exotropia', 'Hypertropia', 'Hypotropia'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Eso = inward. Esotropia is a convergent (inward) manifest deviation.', 'reasoning_eligible': False},
                {'stem': 'An outward-turning (divergent) squint is called:', 'options': ['Exotropia', 'Esotropia', 'Hypertropia', 'Orthotropia'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Exo = outward. Exotropia is a divergent (outward) manifest deviation.', 'reasoning_eligible': False},
                {'stem': 'Amblyopia is commonly known as:', 'options': ['Lazy eye', 'Pink eye', 'Dry eye', 'Red eye'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': "Amblyopia ('lazy eye') is reduced vision in an eye that did not develop normally, with no structural cause fully explaining it.", 'reasoning_eligible': False},
                {'stem': 'Amblyopia is most responsive to treatment when started:', 'options': ['Before about 7 years of age', 'After 40 years of age', 'Only in the elderly', 'It never responds'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The visual system is most plastic in early childhood; amblyopia is usually more treatable before age seven.', 'reasoning_eligible': False},
                {'stem': 'The simplest way to tell monocular from binocular diplopia is to:', 'options': ['Cover one eye and see if the doubling disappears', 'Measure the eye pressure', 'Dilate the pupil', 'Check colour vision'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Cover one eye: binocular diplopia disappears, monocular diplopia (ghosting) persists.', 'reasoning_eligible': False},
                {'stem': 'The 3rd cranial nerve that can be affected in neuro-ophthalmology is the:', 'options': ['Oculomotor nerve', 'Optic nerve', 'Facial nerve', 'Trigeminal nerve'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The 3rd cranial nerve is the oculomotor nerve, controlling most eye movements, the lid and the pupil.', 'reasoning_eligible': False},
                {'stem': 'The 6th cranial nerve (abducens) controls which action?', 'options': ['Turning the eye outward (abduction)', 'Closing the eyelid', 'Constricting the pupil', 'Producing tears'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The abducens nerve supplies the lateral rectus, which abducts (turns out) the eye.', 'reasoning_eligible': False},
                {'stem': 'A 6th nerve palsy typically causes the affected eye to:', 'options': ['Turn inward and fail to move fully outward', 'Turn outward and up', 'Have a large pupil', 'Have a drooping lid'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'With the lateral rectus weak, the eye rests turned in (esotropia) and cannot fully abduct.', 'reasoning_eligible': False},
                {'stem': 'Optic neuritis is inflammation of the:', 'options': ['Optic nerve', 'Cornea', 'Eyelid margin', 'Lacrimal sac'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Optic neuritis is inflammation of the optic nerve, often causing painful unilateral vision loss.', 'reasoning_eligible': False},
                {'stem': 'A classic symptom that suggests optic neuritis rather than a simple refractive problem is:', 'options': ['Eye pain that is worse on eye movement', 'Itchy eyelids', 'A stye', 'Watery eye in the wind'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Pain worsened by eye movement, with vision loss and colour desaturation, is characteristic of optic neuritis.', 'reasoning_eligible': True},
                {'stem': 'Giant cell (temporal) arteritis mainly affects which age group?', 'options': ['Older adults, typically over 70', 'Newborn babies', 'Teenagers', 'Young children'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'GCA affects adults only, with signs and symptoms typically developing between about 70 and 80 years.', 'reasoning_eligible': False},
                {'stem': 'The eye-drop cover test is used mainly to:', 'options': ['Detect and characterise a squint (strabismus)', 'Measure eye pressure', 'Grade a cataract', 'Check the tear film'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'The cover test detects a squint, its direction, and whether it is constant (manifest) or latent.', 'reasoning_eligible': False},
                {'stem': 'A compensatory abnormal head posture in a child (head tilt, chin up/down, or face turn) may be a sign of:', 'options': ['An underlying squint or eye-movement problem', 'Good binocular vision', 'A healthy visual system', 'Perfect eye alignment'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Children adopt an abnormal head posture to compensate for misalignment or a palsy and regain single vision.', 'reasoning_eligible': True},
                {'stem': 'Many Asian children appear to have an in-turned eye but are actually straight. This is called a:', 'options': ['Pseudo-squint (from a flat nasal bridge and epicanthic fold)', 'True esotropia', 'Exotropia', '6th nerve palsy'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'A prominent epicanthic fold and flat nose bridge make the eyes look crossed; the eyes are truly straight and no treatment is needed.', 'reasoning_eligible': False},
                {'stem': 'The main aim of adult strabismus (squint) treatment is to:', 'options': ['Eliminate double vision (and improve alignment)', 'Raise the eye pressure', 'Cure a cataract', 'Whiten the sclera'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'In adults the priority is to eliminate diplopia; options include eye exercises, prisms and surgery.', 'reasoning_eligible': False},
            ],
            "medium": [
                {'stem': 'In monocular diplopia, covering the unaffected eye:', 'options': ['Does NOT remove the doubling in the affected eye', 'Always removes the doubling', 'Causes total blindness', 'Fixes the squint'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Monocular diplopia arises within one eye (e.g. cataract, high astigmatism), so it persists when the other eye is covered.', 'reasoning_eligible': True},
                {'stem': 'Binocular diplopia disappears when either eye is covered because it is caused by:', 'options': ['Misalignment of the two eyes', 'A cataract in one eye', 'Corneal scarring', 'Dry eye'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': "Binocular diplopia results from the eyes not being aligned; removing one eye's image eliminates the second image.", 'reasoning_eligible': True},
                {'stem': 'A concomitant strabismus is one in which:', 'options': ['The angle of deviation is the same in all directions of gaze (full movements)', 'Eye movements are limited in one direction', 'There is always a nerve palsy', 'The pupil is fixed and dilated'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'In concomitant squint the eye movements are full and the deviation is constant across gaze positions.', 'reasoning_eligible': False},
                {'stem': 'An incomitant strabismus (e.g. a nerve palsy) is characterised by:', 'options': ['Limited eye movement, so the deviation varies with gaze direction', 'Full movements in every direction', 'No deviation at all', 'Equal deviation in all gaze positions'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Incomitant squints (paralytic or restrictive) have restricted movement, so the deviation changes with gaze.', 'reasoning_eligible': False},
                {'stem': 'Which cover test is used to detect a LATENT squint (heterophoria)?', 'options': ['The alternate cover test (dissociative)', 'The cover/uncover test (non-dissociative)', 'Tonometry', 'The swinging-flashlight test'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'The alternate (dissociative) cover test breaks fusion and reveals a latent deviation (phoria).', 'reasoning_eligible': True},
                {'stem': 'Which cover test is used mainly to detect a MANIFEST squint (heterotropia)?', 'options': ['The cover/uncover test (non-dissociative)', 'The alternate cover test', 'The Amsler grid', 'Applanation tonometry'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'The cover/uncover test keeps some fusion and detects a manifest deviation (tropia) that is already present.', 'reasoning_eligible': True},
                {'stem': "Worth's 4-dot test, Titmus, Lang and Frisby are all tests of:", 'options': ['Binocular function / stereoacuity', 'Intraocular pressure', 'Corneal thickness', 'Tear production'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'These are tests of binocular single vision and stereopsis, often done at 40 cm.', 'reasoning_eligible': False},
                {'stem': 'The classic triad of a complete 3rd (oculomotor) nerve palsy is:', 'options': ["Ptosis, a 'down-and-out' eye, and (if pupil-involving) a dilated pupil", 'A small pupil, red eye and watering', 'Bilateral cataract', 'Painless gradual field loss'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The unopposed lateral rectus and superior oblique leave the eye down-and-out, with ptosis and possible pupil dilation.', 'reasoning_eligible': True},
                {'stem': "In a 3rd nerve palsy, a fixed, dilated, poorly reactive pupil ('pupil-involving') is worrying because it suggests:", 'options': ['A compressive cause such as a posterior communicating artery aneurysm', 'Simple ischaemia from diabetes', 'Normal ageing', 'A refractive error'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Pupil-involving 3rd nerve palsy raises concern for compression (aneurysm, herniation) - a neurosurgical emergency.', 'reasoning_eligible': True},
                {'stem': "A 'pupil-sparing' 3rd nerve palsy (normal pupil) most commonly results from:", 'options': ['Ischaemia of the nerve, usually from diabetes or hypertension', 'An aneurysm pressing on the nerve', 'A cataract', 'Dry eye'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Microvascular ischaemia (diabetes/hypertension) typically spares the peripheral pupil fibres, giving a pupil-sparing palsy.', 'reasoning_eligible': True},
                {'stem': 'A 6th nerve palsy typically causes diplopia that is:', 'options': ['Horizontal and worse at distance / on looking to the affected side', 'Vertical and worse on reading', 'Only in the dark', 'Torsional and painless at rest'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Weak abduction gives horizontal binocular diplopia, worst at distance and when gazing toward the palsied side.', 'reasoning_eligible': True},
                {'stem': "In Singapore, an important 'dangerous' cause of a 6th nerve palsy to exclude is:", 'options': ['Nasopharyngeal carcinoma', 'Simple long-sightedness', 'A stye', 'Allergic conjunctivitis'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Nasopharyngeal carcinoma is relatively common locally and can invade the skull base, producing cranial nerve palsies.', 'reasoning_eligible': True},
                {'stem': 'In Singapore, the commonest cause of optic neuritis is:', 'options': ["Demyelination (destruction of the optic nerve's myelin sheath)", 'A cataract', 'Refractive error', 'Blocked tear duct'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The commonest local cause is demyelinating optic neuritis; it can be the first sign of multiple sclerosis.', 'reasoning_eligible': False},
                {'stem': 'Which visual symptom, in addition to vision loss, is characteristic of optic neuritis?', 'options': ["Reduced colour vision (colours look 'washed out')", 'Sudden flashing at night only', 'Painless floaters', 'A yellow lid lump'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Optic neuritis often reduces colour perception (especially red desaturation) along with the vision loss.', 'reasoning_eligible': False},
                {'stem': 'Amblyopia can be classified by cause. The main types include refractive, strabismic and:', 'options': ['Deprivation (stimulus obscured, e.g. congenital cataract or ptosis)', 'Glaucomatous', 'Diabetic', 'Age-related'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Deprivation amblyopia arises when the visual axis is obscured early (cataract, dense ptosis), blocking normal development.', 'reasoning_eligible': False},
                {'stem': 'The mainstay of amblyopia treatment (after correcting any refractive error with glasses) is:', 'options': ['Occlusion (patching) or penalisation of the better-seeing eye', 'Patching the amblyopic eye', 'Surgery on the retina', 'Antibiotic drops'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The stronger eye is patched or penalised (e.g. atropine) to force use of the amblyopic eye and improve its vision.', 'reasoning_eligible': True},
                {'stem': 'Refraction in young children with suspected amblyopia is usually done as a CYCLOPLEGIC refraction because:', 'options': ['Cyclopentolate relaxes accommodation, revealing the true (often hyperopic) error', 'It measures eye pressure', 'It stains the cornea', 'It dilates for a retinal photo only'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Children accommodate strongly; cycloplegia (e.g. cyclopentolate) paralyses accommodation so the full refractive error is measured.', 'reasoning_eligible': True},
            ],
            "hard": [
                {'stem': "A 62-year-old diabetic wakes with painful double vision. The right lid droops, the eye is 'down and out', but the pupil is normal-sized and reactive. The most likely mechanism is:", 'options': ['Microvascular (ischaemic) pupil-sparing 3rd nerve palsy', 'Aneurysmal compression of the 3rd nerve', 'Acute angle-closure glaucoma', 'Central retinal artery occlusion'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'A pupil-sparing 3rd nerve palsy in a diabetic is typically ischaemic; pain can occur but the spared pupil points away from compression.', 'reasoning_eligible': True},
                {'stem': 'A patient has a 3rd nerve palsy with a fixed dilated pupil and severe headache. The correct action is to:', 'options': ['Treat as urgent - arrange immediate neuroimaging to exclude an aneurysm/herniation', 'Reassure and review in 6 months', 'Prescribe reading glasses', 'Simply patch the eye and discharge'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Pupil-involving 3rd nerve palsy with headache suggests a compressive lesion; urgent CT/MRI is required as it can be life-threatening.', 'reasoning_eligible': True},
                {'stem': 'You are told to distinguish paralytic from restrictive incomitant strabismus. The feature MOST suggestive of a RESTRICTIVE cause is:', 'options': ['Mechanical limitation of movement (e.g. tethered muscle after trauma or thyroid eye disease)', 'A weak nerve supply with normal muscle', 'A dilated pupil', 'Loss of colour vision'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Restrictive strabismus is due to mechanical tethering (e.g. blow-out fracture, thyroid myopathy) rather than a nerve/muscle weakness.', 'reasoning_eligible': True},
                {'stem': "A 56-year-old presents with progressive left ptosis, left facial numbness for 2 years and horizontal diplopia, and is found to have multiple cranial nerve palsies (3rd, 4th, 6th) on one side. This pattern of 'dangerous diplopia' most suggests:", 'options': ['A cavernous sinus lesion (e.g. tumour such as a schwannoma or nasopharyngeal spread)', 'Simple presbyopia', 'A viral conjunctivitis', 'Dry eye syndrome'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Multiple ipsilateral cranial nerve palsies with V1-V3 sensory loss localise to the cavernous sinus, where several nerves run together.', 'reasoning_eligible': True},
                {'stem': 'A 75-year-old woman reports a new severe temporal headache, scalp tenderness when combing hair, jaw pain on chewing, and brief loss of vision in one eye. The MOST urgent diagnosis to exclude is:', 'options': ['Giant cell (temporal) arteritis', 'Presbyopia', 'Blepharitis', 'A chalazion'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'This is classic GCA; untreated it can cause sudden permanent blindness, so urgent steroids and work-up (ESR/CRP, biopsy) are needed.', 'reasoning_eligible': True},
                {'stem': 'Which set of investigations best supports a diagnosis of giant cell arteritis?', 'options': ['Raised ESR and C-reactive protein, confirmed by temporal artery biopsy', 'Low eye pressure and a clear cornea', 'A normal ESR with a red eye', 'Colour vision only'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'GCA typically shows a very high ESR and CRP (inflammation); temporal artery biopsy confirms the diagnosis.', 'reasoning_eligible': True},
                {'stem': 'For acute demyelinating optic neuritis, the evidence-based treatment to speed visual recovery is:', 'options': ['IV methylprednisolone (followed by oral steroids), NOT oral prednisone alone', 'Oral prednisone alone', 'Antibiotic drops', 'No treatment is ever helpful'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'IV methylprednisolone speeds recovery; oral prednisone alone does not improve the outcome and may increase recurrence.', 'reasoning_eligible': True},
                {'stem': 'A cover test shows: on covering the right eye, the LEFT eye moves out to take up fixation. This indicates the left eye was:', 'options': ['Esotropic (turned in), moving out to fixate', 'Exotropic (turned out)', 'Perfectly aligned', 'Blind'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'An inward-deviating (esotropic) eye must move outward to pick up fixation when the fixing eye is covered.', 'reasoning_eligible': True},
                {'stem': 'During a cover test, an outward recovery movement of the uncovered eye when the other eye is covered indicates a/an:', 'options': ['Esodeviation (the eye was turned in)', 'Exodeviation', 'Hyperdeviation', 'Normal result'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Direction of the refixation movement reveals the deviation: an eye turned in must move out (temporally) to fixate.', 'reasoning_eligible': True},
                {'stem': 'In the Handa/Chia (KKH, Singapore) study, poor responders to amblyopia treatment were MORE likely to have all of the following EXCEPT:', 'options': ['Excellent baseline vision better than 6/9', 'Initial VA worse than 6/15', 'Combined glasses-and-patching treatment', 'Poor compliance'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Poor responders had worse initial VA (worse than 6/15), needed combined treatment, and had poor compliance; good baseline vision predicts a better outcome.', 'reasoning_eligible': True},
                {'stem': "A parent worries their child's amblyopia patching is causing mood changes and schoolwork problems. Evidence from the local study suggests the best response is to:", 'options': ['Reinforce that most children respond well but poor compliance worsens outcome, and offer support strategies', 'Stop all treatment permanently', 'Ignore the concerns', 'Switch immediately to surgery'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Compliance strongly predicts success; parental education, rewards and support strategies improve adherence and outcome.', 'reasoning_eligible': True},
                {'stem': 'A child has a constant right esotropia and is at risk of amblyopia. The reason strabismic amblyopia develops is:', 'options': ["The brain suppresses the image from the deviating eye to avoid diplopia, so that eye's vision fails to develop", 'The deviating eye goes physically blind', 'The retina detaches', 'The cornea scars'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'To avoid confusion/diplopia the brain suppresses the squinting eye; chronic suppression in childhood leads to amblyopia.', 'reasoning_eligible': True},
                {'stem': 'Which stereotest, using polarised or vectographic images at 40 cm, quantifies stereoacuity in seconds of arc?', 'options': ['Titmus (Wirt) stereotest', 'Ishihara plates', 'Amsler grid', 'Snellen chart'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'The Titmus test uses polarised images to grade stereoacuity in seconds of arc; Ishihara/Amsler/Snellen test other functions.', 'reasoning_eligible': False},
                {'stem': 'Strabismus surgery to realign the eyes is performed on the:', 'options': ['Extraocular muscles (accessed under the conjunctiva)', 'Retina', 'Lens', 'Optic nerve'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The eye muscles are located under the conjunctiva and are recessed or resected to realign the eyes; absorbable sutures are usually used.', 'reasoning_eligible': False},
                {'stem': 'An adult after strabismus surgery reports double vision in the first weeks and asks if it is a failure. The correct counselling is:', 'options': ['Transient diplopia is common early and usually improves; follow-up will monitor alignment', 'It always means the surgery failed and must be redone today', 'It signals infection needing antibiotics only', 'It means the retina detached'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Early post-op diplopia and redness are expected and usually settle; alignment is reviewed at follow-up, with further surgery only if needed.', 'reasoning_eligible': True},
                {'stem': "A 30-year-old woman has sudden unilateral vision loss, pain on eye movement and red desaturation, with a normal-looking fundus. This 'the patient sees nothing and the doctor sees nothing' picture best fits:", 'options': ['Retrobulbar optic neuritis', 'Acute angle-closure glaucoma', 'A large chalazion', 'Vitreous floaters'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'In retrobulbar optic neuritis the inflammation is behind the globe, so the disc looks normal despite marked vision and colour loss.', 'reasoning_eligible': True},
            ],
        },
        "glaucoma": {
            "easy": [
                {'stem': 'Glaucoma is a group of diseases characterised by damage to the:', 'options': ['Optic nerve (causing irreversible vision loss)', 'Eyelid', 'Tear duct', 'Cornea only'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Glaucoma damages the optic nerve, producing irreversible loss of vision if untreated.', 'reasoning_eligible': False},
                {'stem': "Glaucoma is nicknamed the 'silent thief of sight' because early vision loss is:", 'options': ['Peripheral and often unnoticed until late', 'Sudden and painful', 'Only central', 'Always obvious at once'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Peripheral vision is lost first; central/reading vision is spared until late, so it often goes unnoticed.', 'reasoning_eligible': False},
                {'stem': 'The most common type of glaucoma, which is usually asymptomatic and progresses slowly, is:', 'options': ['Open-angle glaucoma', 'Acute angle-closure glaucoma', 'Congenital glaucoma', 'Traumatic glaucoma'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Open-angle glaucoma accounts for most cases; the IOP rise is slow, painless and symptomless.', 'reasoning_eligible': False},
                {'stem': 'Acute angle-closure glaucoma is characterised by:', 'options': ['A sudden painful red eye with haloes, blurred vision, nausea/vomiting', 'No symptoms at all', 'A painless yellow lid lump', 'Gradual painless central loss over years'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Acute angle closure causes a sudden dramatic IOP rise with severe pain, redness, haloes and nausea - an emergency.', 'reasoning_eligible': True},
                {'stem': 'Glaucoma most commonly results from an imbalance between the production and ___ of aqueous humour.', 'options': ['Drainage', 'Colour', 'Temperature', 'Refraction'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'When aqueous production exceeds drainage, IOP rises above what the optic nerve can tolerate.', 'reasoning_eligible': False},
                {'stem': 'The test that measures intraocular pressure is:', 'options': ['Tonometry', 'Colour vision testing', 'Lensometry', 'Otoscopy'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Tonometry (e.g. non-contact or Goldmann) measures the intraocular pressure.', 'reasoning_eligible': False},
                {'stem': 'The normal range of intraocular pressure is approximately:', 'options': ['10-21 mmHg', '30-40 mmHg', '0-5 mmHg', '50-60 mmHg'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': "Normal IOP is about 10-21 mmHg, though damage can occur at 'normal' pressures in some eyes.", 'reasoning_eligible': False},
                {'stem': "Which test maps a patient's peripheral field to detect glaucomatous loss?", 'options': ['Visual field testing (e.g. Humphrey perimetry)', 'Colour vision test', 'Tear break-up time', 'Biometry'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Automated perimetry (visual fields) detects and monitors the characteristic field loss of glaucoma.', 'reasoning_eligible': False},
                {'stem': 'Because early glaucoma has no symptoms, the most important way to detect it is:', 'options': ['Regular eye screening/examination', 'Waiting for pain', 'Waiting for blindness', 'Changing glasses'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'As open-angle glaucoma is symptomless early, screening (IOP, disc, fields) is key to timely detection.', 'reasoning_eligible': True},
                {'stem': 'Is the vision already lost to glaucoma recoverable?', 'options': ['No - the loss is irreversible, so treatment aims to prevent further loss', 'Yes - it fully returns with drops', 'Yes - surgery restores it', 'Yes - it returns on its own'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Glaucomatous vision loss is permanent; treatment lowers IOP to protect the remaining vision.', 'reasoning_eligible': False},
                {'stem': 'The main aim of glaucoma treatment is to:', 'options': ['Lower the intraocular pressure to protect the optic nerve', 'Whiten the eye', 'Cure the cataract', 'Restore lost peripheral vision'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Lowering IOP (drops, laser or surgery) slows or halts optic-nerve damage and vision loss.', 'reasoning_eligible': False},
                {'stem': 'Congenital glaucoma in an infant may show:', 'options': ['Enlarged eyes, corneal haze, tearing and light sensitivity', 'A drooping lid only', 'No signs ever', 'A yellow lid lump'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Congenital glaucoma causes enlarged (buphthalmic) eyes, corneal haze, watering and photophobia - refer promptly.', 'reasoning_eligible': True},
                {'stem': 'After cataract in Asia, glaucoma is the:', 'options': ['Second major cause of blindness', 'Least important eye disease', 'Only cause of blindness', 'A cause of a red eye only'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Glaucoma is the second leading cause of blindness in Asia after cataract, and its blindness is preventable.', 'reasoning_eligible': False},
                {'stem': 'A patient with acute angle-closure glaucoma (severe pain, haloes, vomiting) should be:', 'options': ['Treated as an emergency needing prompt IOP-lowering', 'Sent to a routine clinic in weeks', 'Given allergy drops', 'Reassured and discharged'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Acute angle closure is an emergency; prompt treatment is needed to save the eye from rapid damage.', 'reasoning_eligible': True},
                {'stem': 'Assessing the optic disc for a large or increasing cup-to-disc ratio helps detect:', 'options': ['Glaucomatous optic-nerve damage', 'A cataract', 'A stye', 'Dry eye'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'An enlarged/asymmetric optic cup is a hallmark of glaucomatous nerve damage.', 'reasoning_eligible': False},
                {'stem': 'Long-term use of which eye medication can cause a secondary glaucoma?', 'options': ['Steroid (corticosteroid) drops', 'Artificial tears', 'Antibiotic tablets', 'Antihistamine drops'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Chronic steroid use can raise IOP (steroid-induced/secondary glaucoma), so IOP is monitored.', 'reasoning_eligible': False},
                {'stem': "Which structure's blockage/dysfunction raises IOP in glaucoma?", 'options': ['The trabecular meshwork/drainage angle', 'The eyelid', 'The lacrimal gland', 'The macula'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Impaired outflow through the trabecular meshwork/angle raises IOP in most glaucomas.', 'reasoning_eligible': False},
            ],
            "medium": [
                {'stem': 'Some patients have optic-nerve damage typical of glaucoma despite an IOP in the normal range. This is:', 'options': ['Normal-tension glaucoma', 'Ocular hypertension', 'Acute angle closure', 'A cataract'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': "The damaging pressure varies between individuals; normal-tension glaucoma damages the nerve at 'normal' IOP.", 'reasoning_eligible': False},
                {'stem': 'Short-sightedness (myopia) is a recognised risk factor for which glaucoma?', 'options': ['Open-angle glaucoma', 'Acute angle-closure glaucoma', 'Congenital glaucoma', 'None'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Myopia is a risk factor for open-angle glaucoma; hyperopia is a risk factor for angle-closure.', 'reasoning_eligible': False},
                {'stem': 'Long-sightedness (hyperopia) predisposes to which type of glaucoma because of a shallower anterior chamber?', 'options': ['Angle-closure glaucoma', 'Open-angle glaucoma', 'Congenital glaucoma', 'Traumatic glaucoma'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Hyperopic eyes tend to have shallower chambers/narrower angles, predisposing to angle-closure.', 'reasoning_eligible': False},
                {'stem': 'Which population is noted to be more susceptible to angle-closure glaucoma?', 'options': ['Asians', 'Only Caucasians', 'Only children', 'No group in particular'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Asians are more susceptible to angle-closure glaucoma than Caucasians (an important consideration in Singapore).', 'reasoning_eligible': False},
                {'stem': "A patient with well-controlled glaucoma says he stopped his drops because 'my eye feels fine.' The key counselling point is:", 'options': ['Glaucoma is usually symptomless; drops must continue to protect vision', 'He is right to stop', 'He can halve the dose', 'Symptoms would warn him in time'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Because glaucoma is silent, adherence must continue even without symptoms to prevent irreversible loss.', 'reasoning_eligible': True},
                {'stem': 'Gonioscopy is performed in glaucoma to:', 'options': ['Examine the drainage angle (open vs closed)', 'Measure the tear film', 'Grade the cataract', 'Test colour vision'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Gonioscopy visualises the anterior-chamber angle to classify glaucoma as open- or closed-angle.', 'reasoning_eligible': False},
                {'stem': 'OCT of the retinal nerve fibre layer (RNFL) is used in glaucoma to:', 'options': ['Detect and monitor thinning of the nerve fibre layer', 'Measure blood pressure', 'Grade a cataract', 'Assess the tear duct'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'OCT quantifies RNFL thickness, detecting structural glaucomatous damage and tracking progression.', 'reasoning_eligible': False},
                {'stem': 'First-line topical treatment for many open-angle glaucoma patients is:', 'options': ['A prostaglandin analogue (e.g. latanoprost) once daily', 'An antibiotic drop', 'A steroid drop', 'An antihistamine drop'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Prostaglandin analogues, given once daily, are common first-line IOP-lowering agents.', 'reasoning_eligible': False},
                {'stem': 'Before dilating a patient with a very shallow anterior chamber/narrow angles, you should be cautious because dilation could:', 'options': ['Precipitate acute angle-closure glaucoma', 'Cure their glaucoma', 'Lower the pressure to zero', 'Improve their reading vision'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Mydriatics can trigger angle closure in narrow angles, so the angle status is considered first.', 'reasoning_eligible': True},
                {'stem': 'Secondary glaucoma can be caused by all of the following EXCEPT:', 'options': ['Wearing spectacles', 'Eye inflammation (uveitis)', 'Advanced cataract', 'Eye injury'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Secondary glaucoma follows uveitis, trauma, advanced cataract, tumours, surgery, diabetes or steroids - not wearing glasses.', 'reasoning_eligible': False},
                {'stem': 'A laser peripheral iridotomy is used in angle-closure glaucoma to:', 'options': ['Create a drainage channel and relieve/prevent pupil block', 'Remove a cataract', 'Whiten the eye', 'Correct short-sightedness'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'A laser iridotomy makes a hole in the iris to bypass pupil block and open the drainage angle.', 'reasoning_eligible': False},
                {'stem': 'Consistent, correct eye-drop technique matters in glaucoma because poor adherence/technique leads to:', 'options': ['Uncontrolled IOP and progressive irreversible vision loss', 'A cured eye', 'Better vision immediately', 'A red eye only'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'If drops are missed or wasted, IOP stays high and the optic nerve continues to be damaged.', 'reasoning_eligible': True},
                {'stem': 'A relative of a glaucoma patient asks about their own risk. You advise that a risk factor is:', 'options': ['A family history of glaucoma', 'Eating carrots', 'Reading in good light', 'Wearing sunglasses'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Family history raises glaucoma risk, so relatives are encouraged to have regular eye screening.', 'reasoning_eligible': False},
                {'stem': 'In glaucoma monitoring, comparing structure and function means combining:', 'options': ['Optic-nerve/OCT findings with visual-field results', 'Blood pressure with weight', 'Colour vision with hearing', 'Tear film with refraction'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Glaucoma care correlates structural (disc/OCT/RNFL) with functional (visual field) data over time.', 'reasoning_eligible': False},
                {'stem': 'Which systemic conditions increase glaucoma risk?', 'options': ['Diabetes and high blood pressure', 'The common cold', 'Short-term allergy', 'A single headache'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Chronic diseases such as diabetes and hypertension increase the risk of glaucoma.', 'reasoning_eligible': False},
                {'stem': "A patient's IOP reading is very high with a rock-hard, painful red eye and a mid-dilated pupil. You should:", 'options': ['Escalate immediately as a probable acute angle-closure emergency', 'Book a routine review', 'Give antibiotic ointment', 'Reassure and discharge'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'A hard, painful eye with high IOP and a mid-dilated pupil is acute angle closure requiring urgent treatment.', 'reasoning_eligible': True},
                {'stem': 'When measuring IOP by non-contact tonometry, taking several readings is done to:', 'options': ['Obtain a reliable average and spot inconsistent readings', 'Waste time', 'Dilate the pupil', 'Treat the glaucoma'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Multiple NCT readings are averaged and checked for consistency; a very high or erratic value is rechecked/flagged.', 'reasoning_eligible': False},
            ],
            "hard": [
                {'stem': 'Why does raised IOP damage vision in glaucoma?', 'options': ['It exceeds what the optic nerve can tolerate, killing nerve fibres', 'It clouds the lens', 'It dries the cornea', 'It blocks the tear duct'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': "Pressure above the nerve's tolerance progressively destroys retinal ganglion-cell axons at the disc.", 'reasoning_eligible': False},
                {'stem': 'A patient has normal IOP but progressive field loss and disc changes. This illustrates that:', 'options': ['The damaging pressure level varies between individuals (normal-tension glaucoma)', 'Glaucoma is impossible at normal IOP', 'The tests are always wrong', 'IOP is irrelevant'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': "Individual optic-nerve susceptibility varies, so glaucoma can progress at statistically 'normal' pressures.", 'reasoning_eligible': True},
                {'stem': 'Why is central acuity (e.g. 6/6) an unreliable way to rule out significant glaucoma?', 'options': ['Glaucoma damages peripheral vision first, sparing central vision until late', 'Acuity always drops early', 'Central vision is never affected', 'Acuity measures the tear film'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'A patient can have advanced peripheral loss yet retain 6/6 central acuity, so fields/disc must be assessed.', 'reasoning_eligible': True},
                {'stem': 'A patient on long-term topical steroids for another eye condition should have which parameter monitored?', 'options': ['Intraocular pressure (steroid-response glaucoma risk)', 'Colour vision only', 'Tear break-up time only', 'Shoe size'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Steroid responders can develop raised IOP, so IOP is checked during prolonged steroid therapy.', 'reasoning_eligible': True},
                {'stem': 'In acute angle-closure glaucoma, the pupil is classically:', 'options': ['Mid-dilated and poorly reactive, with a hazy cornea', 'Pinpoint and brisk', 'Normal and reactive', 'Constricted and small'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Acute angle closure shows a hazy cornea and a fixed, mid-dilated pupil with very high IOP.', 'reasoning_eligible': False},
                {'stem': 'When trabeculectomy (surgical drainage) is performed, the aim is to:', 'options': ['Create a new outflow pathway to lower IOP', 'Remove the cataract', 'Reattach the retina', 'Correct astigmatism'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Trabeculectomy fashions a guarded channel for aqueous to drain, lowering IOP when drops/laser are insufficient.', 'reasoning_eligible': False},
                {'stem': 'A reliable visual-field test in glaucoma depends partly on the technician:', 'options': ['Coaching the patient and ensuring good fixation and reliability indices', 'Rushing the test', 'Doing it in bright sunlight', 'Skipping instructions'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Good instruction, fixation monitoring and attention to reliability indices produce a valid, interpretable field.', 'reasoning_eligible': True},
                {'stem': 'Why must an acute angle-closure attack be treated within hours?', 'options': ['The very high IOP rapidly and permanently damages the optic nerve/eye', 'It resolves on its own quickly', 'It is only cosmetic', 'It improves vision if left'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Sustained very high IOP causes rapid, irreversible optic-nerve (and sometimes retinal) damage - hence urgency.', 'reasoning_eligible': True},
                {'stem': 'Accurate IOP measurement can be affected by corneal thickness because:', 'options': ['Thin corneas can under-read and thick corneas over-read the true IOP', 'The cornea has no effect', 'Only pupil size matters', 'IOP is unrelated to the cornea'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Central corneal thickness biases applanation IOP, so pachymetry helps interpret readings (thin under-reads).', 'reasoning_eligible': True},
                {'stem': 'The role of the OA/OT/PSA in glaucoma care is best summarised as:', 'options': ['Accurate testing (IOP, fields, imaging), supporting adherence, and escalating red flags', 'Prescribing the drops', 'Performing the surgery', 'Diagnosing the type of glaucoma alone'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Allied-health staff perform accurate tests, reinforce adherence and escalate; clinicians diagnose and prescribe.', 'reasoning_eligible': False},
                {'stem': 'Why are relatives of glaucoma patients specifically advised to be screened?', 'options': ['Family history raises risk and early detection prevents irreversible loss', 'It is a legal requirement', 'Glaucoma is contagious', 'Screening cures the relative'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'A positive family history increases risk; screening finds asymptomatic disease early enough to treat.', 'reasoning_eligible': True},
                {'stem': 'Selective laser trabeculoplasty (SLT) lowers IOP in open-angle glaucoma by:', 'options': ['Improving aqueous outflow through the trabecular meshwork', 'Removing the lens', 'Reattaching the retina', 'Blocking tear drainage'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'SLT treats the trabecular meshwork to enhance aqueous outflow and reduce IOP.', 'reasoning_eligible': False},
                {'stem': 'A pigment- or exfoliation-related (secondary open-angle) glaucoma arises when:', 'options': ['Deposited material clogs the trabecular meshwork, reducing outflow', 'The lens clouds', 'The retina detaches', 'The tear film breaks up'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Pigment or pseudoexfoliative material can obstruct the meshwork, raising IOP (secondary open-angle glaucoma).', 'reasoning_eligible': False},
                {'stem': 'The single most important message to give newly diagnosed glaucoma patients is that:', 'options': ['Treatment protects remaining vision but lost vision cannot be recovered, so adherence is vital', 'It will get better without drops', 'Vision will fully return', 'There is nothing to be done'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Understanding that damage is irreversible but preventable motivates lifelong adherence and monitoring.', 'reasoning_eligible': True},
                {'stem': 'Gonioscopy showing a closed/occludable angle in an asymptomatic patient may lead to:', 'options': ['Prophylactic laser iridotomy to prevent an acute attack', 'No action ever', 'Immediate cataract surgery only', 'New glasses only'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'An occludable angle risks acute closure; prophylactic laser iridotomy can prevent a future attack.', 'reasoning_eligible': True},
                {'stem': 'Pachymetry (measuring central corneal thickness) is included in a glaucoma work-up to:', 'options': ['Help interpret the IOP reading correctly', 'Grade a cataract', 'Test colour vision', 'Assess the tear duct'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Central corneal thickness biases applanation IOP, so pachymetry helps interpret whether a reading is falsely high/low.', 'reasoning_eligible': False},
            ],
        },
        "disorders_uvea_retina": {
            "easy": [
                {'stem': 'Uveitis is inflammation of the:', 'options': ['Uvea (iris, ciliary body and choroid)', 'Eyelid margin', 'Tear sac', 'Cornea only'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Uveitis is inflammation of the uveal tract - the iris, ciliary body and choroid.', 'reasoning_eligible': False},
                {'stem': 'Retinal detachment is best described as:', 'options': ['The retina pulling away from its normal position at the back of the eye', 'A cloudy lens', 'A blocked tear duct', 'A red conjunctiva'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'In retinal detachment the retina separates from the underlying blood supply (RPE/choroid) - an emergency.', 'reasoning_eligible': False},
                {'stem': 'Classic warning symptoms of retinal detachment include:', 'options': ['Flashes, a shower of floaters and a curtain-like shadow', 'A gritty dry eye only', 'A yellow lid lump', 'Sneezing'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Flashes, sudden floaters, blurred/peripheral vision loss and a curtain shadow warn of retinal detachment.', 'reasoning_eligible': False},
                {'stem': 'Is retinal detachment usually painful?', 'options': ['No - it is typically painless', 'Yes - severe boring pain', 'Yes - with discharge', 'Yes - with itching'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Retinal detachment is usually painless; the warning signs are visual (flashes/floaters/curtain).', 'reasoning_eligible': False},
                {'stem': 'The two broad forms of age-related macular degeneration (AMD) are:', 'options': ['Dry and wet', 'Anterior and posterior', 'Acute and chronic only', 'Open and closed'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'AMD is classified as dry (atrophic) and wet (neovascular) types.', 'reasoning_eligible': False},
                {'stem': 'A patient reporting a sudden shower of new floaters and flashing lights should be:', 'options': ['Assessed promptly (possible retinal tear/detachment)', 'Reassured and never reviewed', 'Given new glasses only', 'Told it is a stye'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'New flashes/floaters can herald a retinal tear or detachment and warrant prompt retinal assessment.', 'reasoning_eligible': True},
                {'stem': 'The instrument used to examine the retina for tears/detachment is the:', 'options': ['(Indirect) ophthalmoscope', 'Otoscope', 'Lensmeter', 'Stethoscope'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'The indirect ophthalmoscope gives a wide, detailed view of the retina to detect holes/tears/detachment.', 'reasoning_eligible': False},
                {'stem': 'Anterior uveitis (iritis) typically causes:', 'options': ['A painful, red, photophobic eye with blurred vision', 'A painless white eye', 'A yellow lid lump', 'A watery eye with no other symptoms'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Anterior uveitis presents with pain, redness, photophobia, lacrimation and blurred vision.', 'reasoning_eligible': False},
                {'stem': 'The Amsler grid is a simple tool patients use at home to monitor their:', 'options': ['Central (macular) vision for distortion', 'Peripheral field', 'Eye pressure', 'Colour vision only'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'The Amsler grid detects central distortion/scotoma, useful for monitoring macular disease such as AMD.', 'reasoning_eligible': False},
                {'stem': 'Extreme short-sightedness (high myopia) is a risk factor for:', 'options': ['Retinal detachment', 'A stye', 'A blocked tear duct', 'Conjunctivitis'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'High myopia stretches and thins the retina, raising the risk of retinal tears/detachment.', 'reasoning_eligible': False},
                {'stem': 'Wet AMD often presents with:', 'options': ['Sudden distortion of straight lines (metamorphopsia) and central blur', 'A painful red eye', 'A drooping lid', 'A watery eye only'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Wet (neovascular) AMD can cause rapid central distortion and blurring from leaking new vessels.', 'reasoning_eligible': True},
                {'stem': 'The choroid, part of the uvea, mainly provides the retina with:', 'options': ['Blood supply (oxygen and nutrition)', 'Tears', 'Muscle power', 'Focusing power'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The choroid is the vascular layer supplying the outer retina with oxygen and nutrients.', 'reasoning_eligible': False},
                {'stem': 'Uveitis most commonly affects people in which age group?', 'options': ['About 20 to 50 years (but can affect children)', 'Only newborns', 'Only over-90s', 'Only teenagers'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Uveitis primarily affects people aged 20-50, though children can also be affected.', 'reasoning_eligible': False},
                {'stem': "A patient over 50 with sudden painless loss of side vision and a 'curtain' coming across should be:", 'options': ['Referred urgently (possible retinal detachment)', 'Given eye drops for allergy', 'Told to rest and review in months', 'Reassured it is normal ageing'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'A painless progressing curtain with peripheral loss suggests retinal detachment needing urgent referral.', 'reasoning_eligible': True},
                {'stem': 'When bleeding in the eye (vitreous haemorrhage) blocks the view of the retina, which test helps assess it?', 'options': ['B-scan ultrasound', 'Colour vision test', 'Amsler grid', 'Tear break-up time'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Ultrasound images the retina when media opacity/haemorrhage prevents a direct view.', 'reasoning_eligible': False},
                {'stem': 'Dry AMD is characterised by yellowish deposits under the retina called:', 'options': ['Drusen', 'Hypopyon', 'Pterygium', 'Floaters'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Drusen are extracellular deposits seen in dry AMD; their increase can precede progression.', 'reasoning_eligible': False},
                {'stem': 'Posterior vitreous detachment (PVD) typically causes:', 'options': ['Flashes and floaters (often benign but needs a retinal check)', 'A painful red eye', 'A drooping lid', 'Sudden total blindness always'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'PVD causes flashes/floaters; it is usually benign but can create a retinal tear, so the retina is examined.', 'reasoning_eligible': True},
            ],
            "medium": [
                {'stem': 'Anatomically, uveitis is classified as anterior, intermediate, posterior or:', 'options': ['Pan-uveitis (involving all parts)', 'Corneal uveitis', 'Scleral uveitis', 'Lens uveitis'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The anatomical classes are anterior, intermediate, posterior and pan-uveitis.', 'reasoning_eligible': False},
                {'stem': 'Anterior uveitis (iritis) is treated with topical steroids AND a cycloplegic mainly to:', 'options': ['Reduce inflammation and prevent the iris sticking to the lens (posterior synechiae)', 'Lower blood pressure', 'Dilate for imaging only', 'Numb the cornea'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Steroids control inflammation; the cycloplegic eases ciliary spasm and prevents posterior synechiae.', 'reasoning_eligible': True},
                {'stem': "Intermediate uveitis characteristically shows vitreous 'snowballs' and 'snowbanking', and can reduce vision via:", 'options': ['Cystoid macular oedema', 'A cataract overnight', 'A blocked tear duct', 'A stye'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Intermediate uveitis features vitreous cells/snowballs and often reduces vision through cystoid macular oedema.', 'reasoning_eligible': False},
                {'stem': 'A retinal tear can progress to detachment because fluid from the vitreous:', 'options': ['Passes through the tear and collects under the retina, peeling it off', 'Cures the retina', 'Thickens the cornea', 'Drains through the tear duct'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Liquid vitreous tracks through a tear beneath the retina, separating it from the choroid and detaching it.', 'reasoning_eligible': False},
                {'stem': 'Why is time critical in retinal detachment?', 'options': ['The detached retina loses its blood supply and stops working, risking permanent vision loss', 'It is very painful', 'It spreads to the other eye instantly', 'It cures itself in a day'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Detached retina is deprived of choroidal blood supply; the longer untreated, the greater the permanent loss.', 'reasoning_eligible': True},
                {'stem': 'Which of these is a recognised risk factor for retinal detachment?', 'options': ['Previous cataract surgery', 'Wearing sunglasses', 'Reading in good light', 'Drinking water'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Risk factors include age >50, high myopia, prior detachment/family history, prior cataract surgery and eye injury.', 'reasoning_eligible': False},
                {'stem': 'Wet (neovascular) AMD is driven by abnormal new blood vessels; the main treatment is:', 'options': ['Intravitreal anti-VEGF injections', 'Antibiotic tablets', 'Reading glasses', 'Warm compresses'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Anti-VEGF injections suppress the leaky choroidal neovascular vessels that damage the macula in wet AMD.', 'reasoning_eligible': False},
                {'stem': 'A patient using an Amsler grid notices the lines have become wavy in the centre. This should prompt:', 'options': ['Prompt review for possible wet AMD/macular problem', 'Ignoring it', 'New reading glasses only', 'Antibiotic drops'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'New central distortion on the Amsler grid suggests active macular disease (e.g. wet AMD) needing review.', 'reasoning_eligible': True},
                {'stem': 'Fundus fluorescein angiography (FFA) is used in retinal/uveal disease to:', 'options': ['Show retinal/choroidal vessel leakage and perfusion', 'Measure eye pressure', 'Test colour vision', 'Assess the tear film'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'FFA highlights vascular leakage, blockage and new vessels; ICG images the choroidal circulation.', 'reasoning_eligible': False},
                {'stem': 'Before FFA, it is important to ask the patient about:', 'options': ['Allergies (including to the dye) and kidney/relevant medical history', 'Their favourite colour', 'Their shoe size', 'Their reading speed'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'FFA uses an injected dye; allergy and relevant medical history are checked before the test.', 'reasoning_eligible': True},
                {'stem': 'Advanced diabetes can cause retinal detachment through:', 'options': ['Tractional pull of fibrous tissue on the retina', 'Drying of the cornea', 'A blocked tear duct', 'A drooping lid'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'In advanced diabetic retinopathy, fibrovascular tissue contracts and pulls the retina off (tractional detachment).', 'reasoning_eligible': False},
                {'stem': 'A young adult with a unilateral painful red eye, marked photophobia and blurred vision, but sticky discharge absent, may have:', 'options': ['Anterior uveitis (iritis)', 'Bacterial conjunctivitis', 'A stye', 'Dry eye'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Pain, photophobia and blur without purulent discharge in a young adult suggests anterior uveitis, not conjunctivitis.', 'reasoning_eligible': True},
                {'stem': 'Dry AMD generally causes:', 'options': ['Gradual central visual decline', 'Sudden painful red eye', 'A watery eye only', 'A drooping lid'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Dry AMD progresses slowly with gradual central vision loss; wet AMD tends to cause sudden distortion.', 'reasoning_eligible': False},
                {'stem': 'Recurrent or bilateral uveitis should prompt consideration of:', 'options': ['An underlying systemic/immune condition (referral for work-up)', 'Simple dry eye', 'A refractive error', 'A blocked tear duct'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Recurrent/bilateral uveitis can be linked to systemic autoimmune/infective disease, warranting investigation.', 'reasoning_eligible': True},
                {'stem': 'Dilating the pupil before a fundus/retinal examination is done to:', 'options': ['Give a wide, clear view of the peripheral retina', 'Lower the eye pressure', 'Treat the uveitis', 'Reduce tear production'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Mydriasis is needed to examine the peripheral retina thoroughly for tears/detachment.', 'reasoning_eligible': False},
                {'stem': 'Retinitis pigmentosa classically presents first with:', 'options': ['Night blindness and progressive peripheral (tunnel) vision loss', 'Sudden central blur', 'A painful red eye', 'A watery eye'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Retinitis pigmentosa causes early night blindness and constricting peripheral fields (tunnel vision).', 'reasoning_eligible': False},
                {'stem': 'Long-standing, stable floaters with no flashes and no curtain-shadow are usually:', 'options': ['Benign - but any sudden change should be reported', 'Always an emergency', 'A sign of cataract', 'Caused by a stye'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Chronic stable floaters are typically benign; it is a sudden increase or new flashes/curtain that needs urgent review.', 'reasoning_eligible': True},
            ],
            "hard": [
                {'stem': 'A complication of chronic anterior uveitis where the inflamed iris adheres to the lens is called:', 'options': ['Posterior synechiae', 'A pterygium', 'A hordeolum', 'A pinguecula'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Posterior synechiae are adhesions between iris and lens from uveitis; they can distort the pupil and raise IOP.', 'reasoning_eligible': False},
                {'stem': 'Uveitis can raise intraocular pressure and cause secondary glaucoma when:', 'options': ['Inflammatory cells/synechiae block aqueous outflow', 'The eye produces extra tears', 'The cornea thickens', 'The lid droops'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Inflammatory debris and synechiae impair aqueous drainage, producing uveitic (secondary) glaucoma.', 'reasoning_eligible': True},
                {'stem': 'Why must retinal-detachment warning signs (flashes/floaters/curtain) be escalated quickly even by an allied-health professional?', 'options': ['Early treatment of a tear/detachment can save sight; delay risks permanent loss', 'They are always harmless', 'The patient just needs glasses', 'It is only a cosmetic issue'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Prompt recognition and referral allow timely treatment before the macula detaches, preserving vision.', 'reasoning_eligible': True},
                {'stem': 'A macula-ON (still attached) retinal detachment is more urgent than macula-OFF because:', 'options': ['Treating before the macula detaches gives a far better visual outcome', 'It is less serious', 'The macula does not matter', 'It never progresses'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'If the macula is still attached, urgent surgery can preserve central vision; once off, prognosis worsens.', 'reasoning_eligible': True},
                {'stem': 'A patient having regular intravitreal anti-VEGF injections for wet AMD should be counselled to report:', 'options': ['Increasing pain, redness or vision loss after an injection (possible infection)', 'Mild expected soreness that settles', 'Feeling well', 'A small subconjunctival red patch that fades'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Post-injection endophthalmitis is rare but serious; worsening pain/redness/vision must be reported urgently.', 'reasoning_eligible': True},
                {'stem': "The 'red reflex' being dull or absent in a patient with sudden visual loss and floaters may indicate:", 'options': ['Vitreous haemorrhage obscuring the fundus', 'A perfectly healthy eye', 'A stye', 'A blocked tear duct'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Blood in the vitreous blocks the red reflex and the fundus view; ultrasound is then used to assess the retina.', 'reasoning_eligible': True},
                {'stem': 'OCT (optical coherence tomography) is especially valuable in macular disease because it:', 'options': ['Shows cross-sectional retinal layers and detects fluid/oedema', 'Measures the tear duct', 'Grades cataract', 'Tests colour vision'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'OCT provides a cross-section of the retina, revealing macular fluid/oedema in AMD, uveitis and diabetic disease.', 'reasoning_eligible': False},
                {'stem': "Granulomatous anterior uveitis (with large 'mutton-fat' keratic precipitates) is more likely to be associated with:", 'options': ['A specific systemic/infective cause requiring work-up', 'Simple allergy', 'A refractive error', 'Normal ageing'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Granulomatous uveitis suggests particular systemic/infective aetiologies (e.g. sarcoid, TB) and prompts investigation.', 'reasoning_eligible': False},
                {'stem': 'A high myope who has had cataract surgery reports new flashes and floaters. Your action is to:', 'options': ['Arrange prompt dilated retinal assessment (higher detachment risk)', 'Reassure and discharge', 'Give allergy drops', 'Book routine review in a year'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'High myopia plus prior cataract surgery both raise detachment risk; new symptoms need prompt retinal review.', 'reasoning_eligible': True},
                {'stem': 'The role of the OA/OT/PSA in a suspected retinal detachment is to:', 'options': ['Recognise the warning signs, document vision, and escalate urgently', 'Perform retinal surgery', 'Prescribe treatment', 'Reassure and discharge'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': "Allied-health staff recognise and escalate promptly; surgical management is the ophthalmologist's role.", 'reasoning_eligible': False},
                {'stem': 'Cystoid macular oedema (a common cause of reduced vision in uveitis) is fluid accumulation in the:', 'options': ['Macula (central retina)', 'Cornea', 'Anterior chamber', 'Eyelid'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Cystoid macular oedema is fluid in the macula that blurs central vision; OCT shows the cystic spaces.', 'reasoning_eligible': False},
                {'stem': 'Why is the peripheral retina specifically examined (with scleral indentation) after a PVD?', 'options': ['To find a small peripheral tear that could lead to detachment', 'To measure the cornea', 'To grade the cataract', 'To check the tear duct'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'A PVD can cause a peripheral retinal tear; careful peripheral examination detects treatable tears early.', 'reasoning_eligible': True},
                {'stem': "Sudden painless loss of vision with a pale retina and a 'cherry-red spot' at the macula suggests:", 'options': ['Central retinal artery occlusion (an emergency)', 'Dry AMD', 'A stye', 'Conjunctivitis'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'A pale retina with a cherry-red spot indicates central retinal artery occlusion - a time-critical emergency.', 'reasoning_eligible': True},
                {'stem': 'A branch/central retinal VEIN occlusion typically presents as:', 'options': ['Sudden painless blurring with retinal haemorrhages on examination', 'A painful red eye with discharge', 'A gritty dry eye', 'A drooping lid'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Retinal vein occlusion causes sudden painless visual reduction with scattered retinal haemorrhages.', 'reasoning_eligible': False},
                {'stem': 'The key general counselling point for AMD patients is to:', 'options': ['Monitor with an Amsler grid and report new/worsening distortion promptly', 'Stop all follow-up', 'Rub the eyes to clear vision', 'Avoid all bright light forever'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Home Amsler monitoring plus prompt reporting of new distortion enables early treatment of converting/active wet AMD.', 'reasoning_eligible': True},
                {'stem': 'The ciliary body (part of the uvea inflamed in anterior uveitis) also has the job of:', 'options': ['Producing aqueous humour and enabling accommodation', 'Draining tears', 'Forming the vitreous', 'Focusing light onto the macula'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The ciliary body produces aqueous humour and contains the ciliary muscle for accommodation.', 'reasoning_eligible': False},
            ],
        },
        "disorders_lens_cataract": {
            "easy": [
                {'stem': 'A cataract is:', 'options': ['A clouding of the normally clear lens of the eye', 'A blocked tear duct', 'Bleeding in the eye', 'A drooping eyelid'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'A cataract is progressive clouding (opacification) of the crystalline lens.', 'reasoning_eligible': False},
                {'stem': 'The most common cause of cataract is:', 'options': ['Ageing', 'A viral infection', 'An allergy', 'Wearing glasses'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Age-related change is by far the commonest cause of cataract.', 'reasoning_eligible': False},
                {'stem': 'A classic symptom of cataract is:', 'options': ['Gradual cloudy/blurry vision, often with glare and haloes', 'Sudden painful red eye', 'A watery eye only', 'Flashing lights and floaters'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Cataract causes gradual blur, poor night vision, faded colours, glare and haloes.', 'reasoning_eligible': False},
                {'stem': 'Which are TWO preventable risk factors for cataract?', 'options': ['Smoking and UV (sunlight) exposure', 'Reading and blinking', 'Wearing a hat and drinking water', 'Sleeping and walking'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Smoking and UV exposure are modifiable risk factors; ageing is the main non-modifiable cause.', 'reasoning_eligible': False},
                {'stem': 'The definitive treatment for a visually significant cataract is:', 'options': ['Cataract surgery (remove the lens and implant an IOL)', 'Antibiotic drops', 'Eye exercises', 'Laser to the retina'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Cataract surgery removes the cloudy lens and implants an intraocular lens (IOL).', 'reasoning_eligible': False},
                {'stem': 'In the early stages of cataract, vision can often be helped by:', 'options': ['Brighter lighting and updated spectacles', 'Immediate surgery always', 'Antibiotic tablets', 'An eye patch'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Early cataract is managed with brighter light and updated glasses until surgery is warranted.', 'reasoning_eligible': False},
                {'stem': 'The artificial lens implanted during cataract surgery is called an:', 'options': ['Intraocular lens (IOL)', 'Contact lens', 'Intraocular pressure', 'Optic disc'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'An intraocular lens (IOL) replaces the removed cloudy natural lens.', 'reasoning_eligible': False},
                {'stem': 'An elderly patient reports slowly worsening blur and difficulty driving at night from glare. The likely cause is:', 'options': ['Cataract', 'A stye', 'Allergic conjunctivitis', 'A subconjunctival haemorrhage'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Gradual painless blur with night-time glare in an older adult is typical of cataract.', 'reasoning_eligible': True},
                {'stem': 'Which lifestyle advice helps reduce cataract risk?', 'options': ['Stop smoking and protect eyes from UV/sunlight', 'Read less', 'Avoid all light', 'Rub the eyes daily'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Smoking cessation and UV protection are the main modifiable measures against cataract.', 'reasoning_eligible': False},
                {'stem': 'Modern cataract surgery removes the cloudy lens using a technique called:', 'options': ['Phacoemulsification', 'Trabeculectomy', 'Vitrectomy', 'Keratoplasty'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Phacoemulsification uses ultrasound to break up and aspirate the lens before implanting an IOL.', 'reasoning_eligible': False},
                {'stem': "A patient whose spectacle prescription keeps changing ('power keeps changing') may be developing:", 'options': ['Cataract', 'A stye', 'A blocked tear duct', 'Dry eye'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Frequent refractive changes (often a myopic shift) can be an early sign of cataract.', 'reasoning_eligible': False},
                {'stem': 'Cataract surgery is usually performed as:', 'options': ['A day-surgery procedure (often under local anaesthesia)', 'A week-long inpatient stay', 'Emergency surgery within minutes', 'A procedure needing general anaesthesia in all cases'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Cataract surgery is typically quick day surgery under local (topical) anaesthesia.', 'reasoning_eligible': False},
                {'stem': 'Poor control of which systemic condition can cause cataract at a younger age?', 'options': ['Diabetes', 'Short-sightedness', 'Hay fever', 'Colour blindness'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Poorly controlled diabetes (and steroid use) can accelerate cataract in younger patients.', 'reasoning_eligible': False},
                {'stem': 'After cataract surgery, patients are usually prescribed which drops?', 'options': ['Antibiotic and anti-inflammatory (steroid) drops', 'Dilating drops for life', 'No drops at all', 'Only artificial tears forever'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Post-op antibiotic and steroid drops prevent infection and control inflammation while healing.', 'reasoning_eligible': False},
                {'stem': 'The lens is normally kept transparent; a cataract makes vision like:', 'options': ['Looking through a frosty or fogged-up window', 'Looking through clear glass', 'Seeing flashing lights', 'Seeing a curtain fall'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The doc likens cataract vision to looking through a frosty/fogged window.', 'reasoning_eligible': False},
                {'stem': 'Prolonged use of which class of medication is a recognised cataract risk factor?', 'options': ['Corticosteroids', 'Artificial tears', 'Antihistamine tablets', 'Multivitamins'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Long-term corticosteroid use is a well-recognised risk factor for cataract (posterior subcapsular type).', 'reasoning_eligible': False},
                {'stem': 'Colours appearing faded or yellowed and poor night vision in an older adult suggest:', 'options': ['Cataract', 'A corneal abrasion', 'A stye', 'Acute glaucoma'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Faded colours and poor night vision are typical cataract symptoms.', 'reasoning_eligible': False},
            ],
            "medium": [
                {'stem': 'A nuclear (nuclear sclerotic) cataract often produces a shift in refraction towards:', 'options': ["Myopia (a 'second sight' where near vision briefly improves)", 'Hyperopia only', 'Perfect vision', 'Total blindness overnight'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': "Nuclear cataract increases lens power, causing a myopic shift ('second sight') before vision worsens.", 'reasoning_eligible': False},
                {'stem': 'A posterior subcapsular cataract (PSC) is particularly associated with steroids/diabetes and causes:', 'options': ['Marked glare and difficulty reading/in bright light', 'No symptoms ever', 'Sudden painful red eye', 'A drooping lid'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'PSC sits behind the lens near the visual axis, causing disproportionate glare and near-vision difficulty.', 'reasoning_eligible': True},
                {'stem': 'Before cataract surgery, biometry is performed to:', 'options': ['Calculate the power of the intraocular lens to implant', 'Measure blood pressure', 'Test colour vision', 'Check the tear duct'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Biometry measures the eye (axial length, corneal power) to select the correct IOL power.', 'reasoning_eligible': True},
                {'stem': 'A child noted to have a white pupil (leukocoria) requires:', 'options': ['Urgent referral (possible congenital cataract or retinoblastoma)', 'Reassurance only', 'New glasses', 'Antibiotic drops'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Leukocoria can indicate congenital cataract or a serious cause such as retinoblastoma - refer urgently.', 'reasoning_eligible': True},
                {'stem': 'Why must congenital or early childhood cataract be treated promptly?', 'options': ['To prevent deprivation amblyopia (irreversible lazy eye)', 'Because it is painful', 'To lower eye pressure', 'It never needs treatment'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'A cataract blocking the visual axis in a young child causes deprivation amblyopia if not treated early.', 'reasoning_eligible': True},
                {'stem': 'Months or years after cataract surgery, gradual blurring can be due to posterior capsule opacification (PCO), treated by:', 'options': ['YAG laser capsulotomy', 'Repeat major surgery', 'Antibiotic tablets', 'New spectacles alone'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': "PCO ('after-cataract') is a clouding of the retained capsule, cleared quickly with a YAG laser capsulotomy.", 'reasoning_eligible': False},
                {'stem': 'The decision to proceed with cataract surgery is generally based on:', 'options': ["How much the cataract interferes with the patient's daily activities/vision", 'The colour of the iris', "The patient's height", 'The time of year'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Surgery is indicated when the cataract impairs vision enough to affect daily life, not by a fixed rule.', 'reasoning_eligible': False},
                {'stem': 'Which patient advice reduces post-cataract-surgery complications in the first weeks?', 'options': ['Avoid rubbing the eye and heavy lifting; use the prescribed drops', 'Swim daily', 'Rub the eye to relieve itch', 'Stop all drops immediately'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Avoiding eye rubbing/straining and adhering to drops protects the healing eye early after surgery.', 'reasoning_eligible': True},
                {'stem': 'Cortical cataract classically produces which symptom pattern?', 'options': ['Glare and scatter, especially in bright light/oncoming headlights', 'Sudden total blindness', 'A painful red eye', 'A bulging eye'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Cortical (spoke-like) opacities scatter light, causing glare and haloes, particularly in bright conditions.', 'reasoning_eligible': False},
                {'stem': 'Eye protection with a shield at night in the early post-cataract-surgery period is advised to:', 'options': ['Prevent accidental rubbing/pressure on the healing eye', 'Improve night vision', 'Treat infection', 'Lower the eye pressure'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'A protective shield at night stops the patient inadvertently rubbing or pressing the operated eye while asleep.', 'reasoning_eligible': False},
                {'stem': 'A traumatic cataract should be suspected when a patient develops lens clouding after:', 'options': ['A significant blunt or penetrating eye injury', 'Reading a book', 'A common cold', 'Wearing sunglasses'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Eye trauma can damage the lens and cause a cataract, sometimes months to years later.', 'reasoning_eligible': False},
                {'stem': 'Which examination is used to detect and grade a cataract?', 'options': ['A slit-lamp examination by the ophthalmologist', 'A hearing test', 'A blood test only', 'A urine test'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Cataract is detected and graded on slit-lamp examination during a comprehensive eye assessment.', 'reasoning_eligible': False},
                {'stem': 'Additional risk factors for cataract listed in the SNEC material include all EXCEPT:', 'options': ['Reading in good light', 'Obesity', 'High blood pressure', 'Excessive alcohol intake'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Listed risks include diabetes, sunlight, smoking, obesity, hypertension, injury, steroids and excess alcohol - not normal reading.', 'reasoning_eligible': False},
                {'stem': 'A patient anxious that cataract surgery is dangerous can be reassured that it is:', 'options': ['Generally a safe and effective procedure', 'Almost always unsuccessful', 'Never done nowadays', 'Only for young people'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Cataract surgery is one of the safest, most effective operations, though realistic counselling of risks is still given.', 'reasoning_eligible': False},
                {'stem': 'The natural lens is nourished by the surrounding aqueous humour because the lens is:', 'options': ['Avascular (has no blood supply)', 'Full of blood vessels', 'Made of muscle', 'Part of the retina'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The avascular lens depends on the aqueous humour for nutrition; metabolic disturbance can cloud it.', 'reasoning_eligible': False},
                {'stem': 'After uncomplicated cataract surgery, the expected visual outcome is usually:', 'options': ['Clearer vision once healing is complete', 'Permanent blindness', 'No change at all', 'Immediate perfect 6/6 within an hour in everyone'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': "Most patients gain clearer vision after healing, though the exact result depends on the rest of the eye's health.", 'reasoning_eligible': False},
                {'stem': 'The commonest age-related cataract, involving progressive hardening and yellowing of the lens core, is the:', 'options': ['Nuclear sclerotic cataract', 'Congenital cataract', 'Traumatic cataract', 'Radiation cataract'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Nuclear sclerotic cataract, from age-related hardening/yellowing of the lens nucleus, is the commonest type.', 'reasoning_eligible': False},
            ],
            "hard": [
                {'stem': 'A patient develops a painful red eye with rapidly falling vision a few days after cataract surgery. This must be treated as:', 'options': ['Possible endophthalmitis - an emergency needing urgent referral', 'Normal healing', 'A simple allergy', 'Dry eye'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Post-op pain, redness and dropping vision suggest endophthalmitis, a sight-threatening emergency.', 'reasoning_eligible': True},
                {'stem': 'Why is accurate biometry so important before cataract surgery?', 'options': ["An incorrect IOL power leaves the patient with a large refractive error ('surprise')", 'It lowers eye pressure', 'It prevents infection', 'It dilates the pupil'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': "Biometry errors cause a 'refractive surprise'; precise measurement selects the IOL for the target refraction.", 'reasoning_eligible': True},
                {'stem': 'A diabetic patient having cataract surgery needs the retina assessed because:', 'options': ['Coexisting diabetic retinopathy/maculopathy can limit the visual outcome', 'Diabetes prevents surgery', 'The cataract will not be removed', 'Diabetes cures cataract'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Visual gain after cataract surgery depends on retinal health; diabetic retinopathy/maculopathy must be assessed.', 'reasoning_eligible': True},
                {'stem': "A very advanced ('mature'/hypermature) cataract is significant because it can:", 'options': ['Cause secondary glaucoma or make surgery more difficult', 'Improve vision', 'Never need treatment', 'Cure diabetes'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'An intumescent/hypermature lens can raise IOP (phacomorphic/phacolytic glaucoma) and complicate surgery.', 'reasoning_eligible': True},
                {'stem': 'Posterior capsule opacification (PCO) after cataract surgery is caused by:', 'options': ['Residual lens epithelial cells clouding the retained capsule', 'A new infection', 'A detached retina', 'Regrowth of the whole natural lens'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Remaining lens epithelial cells proliferate on the capsule, causing PCO, cleared by YAG laser.', 'reasoning_eligible': False},
                {'stem': 'A key counselling point for a patient after YAG laser capsulotomy is to watch for:', 'options': ['New floaters or flashing lights (small retinal-detachment risk)', 'Improved colour vision', 'A little expected grittiness', 'Feeling completely well'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'YAG capsulotomy slightly raises retinal-detachment risk, so new floaters/flashes should be reported.', 'reasoning_eligible': True},
                {'stem': 'The role of the OA/OT/PSA when a cataract is identified is to:', 'options': ['Document findings and vision, support the patient, and refer to the ophthalmologist', 'Prescribe the operation', 'Perform the surgery', 'Choose the IOL power alone'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': "Allied-health staff assess/document and refer; surgical decisions and IOL selection are the surgeon's role.", 'reasoning_eligible': False},
                {'stem': 'A monofocal IOL implanted for distance means the patient will usually still need:', 'options': ['Reading glasses for near tasks', 'No glasses ever for anything', 'A second cataract operation', 'Daily antibiotic drops for life'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'A standard monofocal IOL corrects one distance; most patients need reading glasses for near vision.', 'reasoning_eligible': False},
                {'stem': "Why does the SNEC material list smoking and UV exposure separately as 'preventable' causes?", 'options': ['They are modifiable, so patient education can reduce cataract risk', 'They are the only causes', 'They cannot be changed', 'They cure cataract'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Highlighting modifiable factors lets health workers counsel patients on reducing their cataract risk.', 'reasoning_eligible': False},
                {'stem': 'Sudden, painless loss of vision after previously stable cataract should prompt you to consider:', 'options': ['A separate posterior-segment problem (e.g. retinal or vascular event) - not just the cataract', 'Only faster cataract growth', 'Nothing, it is expected', 'A new pair of glasses'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Cataract causes gradual loss; sudden painless loss suggests another cause and needs urgent assessment.', 'reasoning_eligible': True},
                {'stem': 'Before cataract surgery, checking the pupil dilates well is important because:', 'options': ['Poor dilation makes surgery technically harder and higher-risk', 'It cures the cataract', 'It measures blood pressure', 'It is only cosmetic'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Good pupil dilation gives surgical access; a poorly dilating pupil raises intraoperative complication risk.', 'reasoning_eligible': True},
                {'stem': 'Steroid-induced cataract is typically of which type?', 'options': ['Posterior subcapsular', 'Only nuclear', 'Never occurs', 'Cortical only'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Chronic steroid exposure characteristically causes posterior subcapsular cataract.', 'reasoning_eligible': False},
                {'stem': 'A patient with dense cataract preventing a view of the retina may need which test to assess the back of the eye?', 'options': ['B-scan ultrasound', 'Colour vision test', 'Tear break-up time', 'Lensometry'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'When the cataract blocks the view, B-scan ultrasound assesses the posterior segment before surgery.', 'reasoning_eligible': False},
                {'stem': 'Realistic pre-operative counselling for cataract surgery should include that:', 'options': ['It is generally safe/effective but carries small risks (e.g. infection), and outcome depends on the whole eye', 'It is completely risk-free', 'It always restores perfect vision', 'It is never worthwhile'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Balanced counselling notes high success with small real risks and outcome dependence on retinal/optic-nerve health.', 'reasoning_eligible': True},
                {'stem': "The natural lens's job that an IOL takes over after cataract surgery is to:", 'options': ['Help focus light onto the retina', 'Produce tears', 'Drain aqueous humour', 'Move the eye'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The lens (and its IOL replacement) focuses light onto the retina.', 'reasoning_eligible': False},
                {'stem': "When the eye needing cataract surgery is the patient's ONLY seeing eye, the approach requires:", 'options': ['Especially careful risk-benefit counselling and informed consent', 'No consent, as it is routine', 'Automatic refusal of surgery', 'Emergency same-hour surgery'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': "Surgery on a patient's only functional eye carries higher stakes, so consent and counselling are especially thorough.", 'reasoning_eligible': True},
            ],
        },
        "disorders_cornea_conjunctiva": {
            "easy": [
                {'stem': 'A corneal ulcer is best described as:', 'options': ['An open sore (epithelial defect with underlying inflammation) on the cornea', 'A harmless freckle', 'A blocked tear duct', 'A drooping eyelid'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'A corneal ulcer is an epithelial defect with stromal inflammation/necrosis, usually from infection.', 'reasoning_eligible': False},
                {'stem': 'Symptoms that suggest CORNEAL involvement (rather than simple conjunctivitis) include:', 'options': ['Pain, photophobia and reduced vision', 'Only mild itch', 'No symptoms at all', 'A watery eye alone'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Corneal problems typically cause pain (foreign-body ache), photophobia and decreased acuity.', 'reasoning_eligible': False},
                {'stem': 'Which group is at much higher risk of corneal ulcers?', 'options': ['Contact lens wearers (especially overnight wear)', 'People who never touch their eyes', 'People who wear sunglasses', 'Non-lens wearers only'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Contact lens wear, especially extended/overnight wear, greatly raises corneal ulcer risk.', 'reasoning_eligible': False},
                {'stem': 'A layer of pus settling at the bottom of the anterior chamber in a severe corneal infection is called a:', 'options': ['Hypopyon', 'Hyphaema', 'Pterygium', 'Pinguecula'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'A hypopyon is a white layer of pus in the anterior chamber, a sign of severe intraocular inflammation.', 'reasoning_eligible': False},
                {'stem': 'A pterygium is a:', 'options': ['Wing-shaped fibrovascular growth of conjunctiva onto the cornea', 'A drooping eyelid', 'Blood in the anterior chamber', 'An infection of the tear sac'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'A pterygium is a triangular conjunctival growth extending onto the cornea, linked to UV/sun exposure.', 'reasoning_eligible': False},
                {'stem': 'To make a corneal ulcer or abrasion clearly visible, the clinician applies:', 'options': ['Fluorescein dye viewed under blue light', 'Atropine', 'Timolol', 'Rose water'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Fluorescein stains the epithelial defect, which fluoresces under cobalt-blue light at the slit lamp.', 'reasoning_eligible': False},
                {'stem': 'The mainstay of examining corneal and conjunctival disorders is the:', 'options': ['Slit-lamp biomicroscope', 'Otoscope', 'Stethoscope', 'Blood-pressure cuff'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'The slit lamp gives a magnified, illuminated view of the ocular surface for these disorders.', 'reasoning_eligible': False},
                {'stem': 'A patient with a painful, very red eye, marked light sensitivity and blurred vision should be:', 'options': ['Escalated for urgent assessment (possible corneal ulcer)', 'Sent home with no review', 'Told it is definitely harmless', 'Given new glasses'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Pain, photophobia and reduced vision suggest a sight-threatening corneal problem needing urgent review.', 'reasoning_eligible': True},
                {'stem': 'Dry eye disease (keratoconjunctivitis sicca) typically causes:', 'options': ['A gritty, burning sensation with fluctuating vision', 'Sudden painless blindness', 'A bulging eye', 'A drooping lid'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Dry eye causes grittiness, burning and variable blur from an unstable tear film.', 'reasoning_eligible': False},
                {'stem': 'A painless, flat, bright-red patch on the white of the eye with normal vision is usually a:', 'options': ['Subconjunctival haemorrhage (benign, self-resolving)', 'Corneal ulcer', 'Scleritis', 'Acute glaucoma'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'A subconjunctival haemorrhage is a benign bleed under the conjunctiva that clears over 2-3 weeks.', 'reasoning_eligible': False},
                {'stem': 'First-line treatment for mild-to-moderate dry eye is:', 'options': ['Artificial tear (lubricant) drops', 'Strong steroids for life', 'Immediate surgery', 'Antibiotic tablets'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Lubricant/artificial-tear drops are the mainstay of mild-to-moderate dry-eye management.', 'reasoning_eligible': False},
                {'stem': 'Advising sunglasses/UV protection is particularly relevant for preventing progression of a:', 'options': ['Pterygium', 'Cataract in a child', 'Retinal detachment', 'Stye'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Pterygia are associated with UV/sun and dust exposure, so eye protection is advised.', 'reasoning_eligible': False},
                {'stem': 'A corneal ulcer often appears at the slit lamp as a:', 'options': ['White or grey spot with an overlying epithelial defect', 'Yellow lump on the lid', 'Black pupil', 'Clear normal cornea'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Infective ulcers appear as a whitish/grey corneal infiltrate with a stained epithelial defect.', 'reasoning_eligible': False},
                {'stem': 'A contact-lens wearer with a red, painful eye should be advised to:', 'options': ['Stop lens wear immediately and seek assessment', 'Keep wearing lenses', 'Rinse lenses in tap water and reinsert', 'Wait a month'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'A red painful eye in a lens wearer may be microbial keratitis; stop lenses and seek urgent review.', 'reasoning_eligible': True},
                {'stem': 'The cornea is highly sensitive to touch because it is richly supplied with:', 'options': ['Sensory nerve endings', 'Blood vessels', 'Muscle fibres', 'Oil glands'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The cornea is densely innervated (trigeminal), making it exquisitely sensitive, though it is avascular.', 'reasoning_eligible': False},
                {'stem': 'A pinguecula differs from a pterygium in that a pinguecula:', 'options': ['Is a yellowish conjunctival deposit that does NOT grow onto the cornea', 'Always covers the pupil', 'Is blood in the eye', 'Is a drooping lid'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'A pinguecula is a yellowish conjunctival lesion that stays on the conjunctiva; a pterygium crosses onto the cornea.', 'reasoning_eligible': False},
                {'stem': 'Corneal ulcers are important because on healing they may:', 'options': ['Leave a scar that reduces vision', 'Improve vision permanently', 'Have no consequences ever', 'Turn the eye blue'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Ulcers heal with scar tissue that opacifies the cornea and can permanently reduce acuity.', 'reasoning_eligible': False},
            ],
            "medium": [
                {'stem': 'Corneal ulcers can be caused by which range of organisms?', 'options': ['Bacteria, fungi, viruses and protozoa (e.g. Acanthamoeba)', 'Only bacteria', 'Only allergies', 'Nothing infectious'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Microbial keratitis/ulcers may be bacterial, fungal, viral (herpes) or protozoal (Acanthamoeba).', 'reasoning_eligible': False},
                {'stem': 'Why is a corneal scrape/culture taken before or when starting treatment of a significant ulcer?', 'options': ['To identify the organism and its drug sensitivity', 'To lower the eye pressure', 'To dilate the pupil', 'To measure refraction'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Culture identifies the causative organism and guides targeted antimicrobial therapy.', 'reasoning_eligible': True},
                {'stem': 'Intensive treatment of a bacterial corneal ulcer typically involves antibiotic drops given:', 'options': ['Very frequently (e.g. hourly) initially', 'Once a week', 'Only at night', 'Just once'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Bacterial ulcers need intensive, often hourly, topical antibiotics initially to control infection.', 'reasoning_eligible': False},
                {'stem': 'Why can using steroid eye drops be dangerous in an undiagnosed corneal ulcer?', 'options': ['They can worsen infection (especially herpes/fungal) and delay healing', 'They cure all ulcers instantly', 'They lower the pressure too far', 'They dilate the pupil'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Steroids suppress the immune response and can worsen infective (e.g. herpetic/fungal) keratitis.', 'reasoning_eligible': True},
                {'stem': 'Keratoconus is a condition in which the cornea:', 'options': ['Progressively thins and bulges into a cone shape', 'Turns completely opaque overnight', 'Grows extra blood vessels only', 'Becomes a cataract'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Keratoconus is progressive corneal thinning and conical protrusion, causing irregular astigmatism.', 'reasoning_eligible': False},
                {'stem': 'A young myopic patient whose spectacle astigmatism keeps worsening and who rubs their eyes may have:', 'options': ['Keratoconus (worth corneal topography)', 'A stye', 'A blocked tear duct', 'Simple presbyopia'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Rapidly changing irregular astigmatism in a young eye-rubber suggests keratoconus; topography helps confirm.', 'reasoning_eligible': True},
                {'stem': 'Episcleritis is typically:', 'options': ['Mild, sectoral redness with little pain, often self-limiting', 'Severe, boring pain that wakes the patient', 'Always sight-threatening', 'Blood in the anterior chamber'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Episcleritis is a benign, often self-limiting inflammation with mild discomfort and localized redness.', 'reasoning_eligible': False},
                {'stem': 'Scleritis, in contrast to episcleritis, is characterised by:', 'options': ['Severe deep boring pain and is often linked to systemic disease', 'No pain at all', 'A painless red patch', 'Always resolving without treatment'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Scleritis causes severe, deep, boring pain, may threaten the eye and is often associated with autoimmune disease.', 'reasoning_eligible': True},
                {'stem': 'Corneal (stromal/epithelial) oedema most often results from dysfunction of the corneal:', 'options': ['Endothelium (its pump keeps the cornea clear)', 'Eyelashes', 'Tear duct', 'Retina'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The endothelial pump keeps the cornea dehydrated/clear; endothelial failure causes corneal oedema and haze.', 'reasoning_eligible': False},
                {'stem': 'A patient with corneal endothelial oedema classically reports vision that is:', 'options': ['Worse on waking and improves through the day', 'Perfect at all times', 'Only affected at night', 'Never blurred'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Oedema is worst overnight (lids closed, less evaporation), so vision is blurriest on waking.', 'reasoning_eligible': False},
                {'stem': 'Definitive treatment of severe corneal scarring or endothelial failure may involve:', 'options': ['Corneal transplantation (graft)', 'New spectacles only', 'Antibiotic tablets', 'Eye exercises'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Corneal transplantation replaces scarred or decompensated cornea to restore clarity.', 'reasoning_eligible': False},
                {'stem': 'Overnight (extended) wear of soft contact lenses raises corneal ulcer risk partly because it:', 'options': ['Reduces oxygen to the cornea and traps organisms under the lens', 'Improves tear flow', 'Sterilises the eye', 'Strengthens the cornea'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Overnight wear lowers corneal oxygen and traps bacteria/solution debris, markedly raising infection risk.', 'reasoning_eligible': False},
                {'stem': 'Lid problems such as entropion, trichiasis and blepharitis can lead to corneal ulcers because they:', 'options': ['Cause chronic surface irritation/injury that becomes infected', 'Lower the eye pressure', 'Improve tear quality', 'Protect the cornea'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Mechanical lash rubbing and lid-margin disease damage the epithelium, opening the door to infection.', 'reasoning_eligible': True},
                {'stem': 'A recurrent, painful red eye with a branching (dendritic) corneal ulcer suggests:', 'options': ['Herpes simplex keratitis', 'Simple allergy', 'A pterygium', 'Dry eye alone'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'A dendritic ulcer that recurs is classic for herpes simplex keratitis; steroids alone are harmful.', 'reasoning_eligible': True},
                {'stem': 'For dry eye, staining with lissamine green or rose bengal is used to:', 'options': ['Highlight devitalised/damaged surface cells', 'Measure eye pressure', 'Dilate the pupil', 'Numb the cornea'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Lissamine green/rose bengal stain dead and unprotected epithelial cells, revealing dry-eye surface damage.', 'reasoning_eligible': False},
                {'stem': 'A pterygium growing across the visual axis is significant because it can:', 'options': ['Distort the cornea (astigmatism) and reduce vision', 'Improve focus', 'Lower eye pressure', 'Cure dry eye'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'A pterygium encroaching on the cornea induces astigmatism and, over the pupil, obscures vision - a reason to refer.', 'reasoning_eligible': True},
                {'stem': 'A neglected, deep corneal ulcer can progress to which sight-threatening complication?', 'options': ['Corneal perforation', 'A stye', 'Presbyopia', 'A pinguecula'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'An untreated ulcer can melt through the stroma and perforate the cornea - an ocular emergency.', 'reasoning_eligible': False},
            ],
            "hard": [
                {'stem': 'Severe keratitis in a contact-lens wearer who used tap water or swam in lenses should raise suspicion of:', 'options': ['Acanthamoeba keratitis', 'Simple allergic conjunctivitis', 'A pinguecula', 'Dry eye alone'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Acanthamoeba lives in water/soil and causes severe, painful contact-lens-related keratitis.', 'reasoning_eligible': True},
                {'stem': 'Fungal corneal ulcers should be particularly considered after:', 'options': ['Trauma with vegetable/organic matter', 'Reading in low light', 'Watching TV', 'Instilling lubricants'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Filamentous fungi (Fusarium, Aspergillus) cause keratitis, classically after organic/plant trauma.', 'reasoning_eligible': False},
                {'stem': 'Why is scleritis (unlike episcleritis) important to investigate systemically?', 'options': ['It is frequently associated with autoimmune/connective-tissue disease', 'It only affects the eyelashes', 'It is always caused by allergy', 'It never needs treatment'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Scleritis often accompanies systemic autoimmune disease (e.g. rheumatoid arthritis, vasculitis), needing work-up.', 'reasoning_eligible': True},
                {'stem': 'A hypopyon in the setting of a corneal ulcer indicates:', 'options': ['Severe intraocular inflammation needing urgent, aggressive treatment', 'A mild, ignorable finding', 'Improvement of the ulcer', 'A refractive error'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'A hypopyon signals severe anterior-chamber inflammation; the ulcer is sight-threatening and treated aggressively.', 'reasoning_eligible': True},
                {'stem': 'Corneal transplantation (keratoplasty) may fail if the graft is rejected. An early warning symptom to counsel patients about is:', 'options': ['New redness, pain, photophobia or a drop in vision', 'Feeling completely well', 'Mild expected itch that settles', 'A little tearing on day one'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Graft rejection presents with redness, pain, photophobia and reduced vision - report promptly for treatment.', 'reasoning_eligible': True},
                {'stem': 'Keratoconus with mild-to-moderate irregular astigmatism is often optically managed with:', 'options': ['Rigid gas-permeable (hard) contact lenses', 'Reading glasses only', 'An eye patch', 'Antibiotic drops'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Rigid contact lenses mask the irregular corneal surface; progression may be halted with collagen cross-linking.', 'reasoning_eligible': False},
                {'stem': 'Corneal collagen cross-linking is used in keratoconus mainly to:', 'options': ['Stiffen the cornea and halt progression', 'Restore lost vision instantly', 'Remove a pterygium', 'Cure dry eye'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Cross-linking strengthens corneal collagen to slow or stop keratoconus progression (it does not reverse it).', 'reasoning_eligible': False},
                {'stem': 'A patient with facial-nerve palsy and poor blink is at risk of a corneal ulcer because:', 'options': ['Exposure and drying damage the epithelium, allowing infection', 'The eye pressure rises', 'The lens clouds', 'The retina detaches'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Incomplete closure causes exposure keratopathy; the dried, damaged surface can ulcerate and become infected.', 'reasoning_eligible': True},
                {'stem': 'Why must you distinguish a corneal problem from simple conjunctivitis at triage?', 'options': ['Corneal involvement (pain, photophobia, reduced vision) is potentially sight-threatening and urgent', 'They are treated identically', 'Conjunctivitis is always worse', 'Neither matters'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Missing keratitis is dangerous; corneal red flags (pain, photophobia, reduced vision) demand urgent escalation.', 'reasoning_eligible': True},
                {'stem': 'Before any procedure that touches the cornea (e.g. removing a foreign body), the surface is prepared with:', 'options': ['A topical anaesthetic drop', 'A dilating drop only', 'A steroid', 'A miotic'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Topical anaesthetic allows the patient to tolerate corneal manipulation comfortably and safely.', 'reasoning_eligible': False},
                {'stem': 'A patient with severe dry eye and existing corneal disorder using glaucoma drops with preservatives may develop:', 'options': ['Worsened ocular-surface toxicity/irritation', 'Improved tear film', 'Higher acuity', 'A cataract'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Preservatives (e.g. benzalkonium) worsen an already compromised ocular surface; preservative-free options are considered.', 'reasoning_eligible': True},
                {'stem': 'The corneal stroma is significant in ulcers because it:', 'options': ['Is the thick layer that scars, opacifying the cornea after deep ulcers', 'Produces tears', 'Drains aqueous humour', 'Focuses light onto the macula'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Deep ulcers involving the stroma heal with scar, permanently reducing corneal clarity and vision.', 'reasoning_eligible': False},
                {'stem': 'Dilating (cycloplegic) drops are sometimes prescribed in a painful corneal ulcer to:', 'options': ['Relieve painful ciliary spasm and prevent synechiae', 'Cure the infection', 'Lower the blood pressure', 'Improve the refraction'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Cycloplegics ease the reflex ciliary spasm that accompanies keratitis and reduce inflammatory adhesions.', 'reasoning_eligible': False},
                {'stem': 'The safest advice for a contact-lens wearer to reduce microbial keratitis risk is to:', 'options': ['Avoid overnight wear, never use tap water, and clean/replace lenses/cases properly', 'Wear lenses while swimming', 'Top up old solution', 'Sleep in monthly lenses'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'No overnight wear, no water contact, and proper cleaning/replacement substantially cut keratitis risk.', 'reasoning_eligible': False},
                {'stem': 'The general role of the OA/OT/PSA who finds a suspected corneal ulcer is to:', 'options': ['Recognise the red flags, avoid steroids, and escalate urgently to the ophthalmologist', 'Prescribe steroids', 'Perform a corneal graft', 'Reassure and discharge'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Allied-health staff recognise and escalate; they do not diagnose/prescribe, and must avoid empirical steroids.', 'reasoning_eligible': True},
                {'stem': 'A key counselling point for a patient prescribed hourly antibiotic drops for a corneal ulcer is:', 'options': ['Adherence to the frequent dosing is essential to control the infection', 'The drops can be skipped if busy', 'Once a day is enough', 'Stop as soon as it feels better'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Intensive ulcers require strict adherence to very frequent dosing; poor adherence risks progression/perforation.', 'reasoning_eligible': True},
            ],
        },
        "disorders_eyelid_lacrimal_orbit": {
            "easy": [
                {'stem': 'A chalazion is caused by:', 'options': ['A blocked meibomian (oil) gland', 'An infected eyelash root at the lid edge', 'A scratched cornea', 'A blocked tear duct'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'A chalazion is a swelling from a blocked meibomian gland duct, usually painless, set back from the lid margin.', 'reasoning_eligible': False},
                {'stem': 'Compared with a chalazion, a stye (external hordeolum) is typically:', 'options': ['Painful and at the eyelid edge (infected lash root)', 'Painless and deep in the lid', 'On the cornea', 'Inside the orbit'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'A stye is a painful infection of a lash root at the lid margin; a chalazion is a painless deeper lump.', 'reasoning_eligible': False},
                {'stem': 'Ectropion is defined as the eyelid turning:', 'options': ['Outward (inner surface exposed)', 'Inward against the eye', 'Upward permanently', 'Into the orbit'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Ectropion is out-turning of the lid (usually lower), exposing the inner surface and causing watering.', 'reasoning_eligible': False},
                {'stem': 'Entropion is defined as the eyelid turning:', 'options': ['Inward, so lashes rub the eye surface', 'Outward away from the eye', 'Completely shut', 'Yellow in colour'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'In entropion the lid margin rolls inward and the lashes rub the cornea/conjunctiva, causing irritation.', 'reasoning_eligible': False},
                {'stem': 'Ptosis is the medical term for:', 'options': ['Drooping of the upper eyelid', 'Bulging of the eye', 'A blocked tear duct', 'A red eye'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Ptosis is drooping of the upper eyelid, which can obstruct the upper visual field.', 'reasoning_eligible': False},
                {'stem': 'Trichiasis refers to:', 'options': ['Misdirected eyelashes rubbing the eye', 'An out-turned lower lid', 'A drooping upper lid', 'A bulging eye'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Trichiasis is inward-/mis-directed lashes touching the ocular surface, causing irritation and abrasion risk.', 'reasoning_eligible': False},
                {'stem': 'A first-line, simple home treatment you can advise for a stye or an early chalazion is:', 'options': ['Warm compresses to the lid', 'Rubbing it hard', 'Squeezing it to pop it', 'Applying ice for an hour'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Warm compresses help unblock the gland/drain the lesion; patients should not squeeze it.', 'reasoning_eligible': False},
                {'stem': 'A patient with ectropion typically complains of:', 'options': ['A constantly watery, irritated eye', 'Sudden painless vision loss', 'Flashing lights', 'A bulging eye'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'The out-turned lid cannot spread tears, so the eye waters and becomes irritated with a sore cheek from wiping.', 'reasoning_eligible': False},
                {'stem': 'A blocked nasolacrimal (tear) drainage duct classically causes:', 'options': ['A watery eye (epiphora)', 'A dry, gritty eye only', 'Sudden blindness', 'A bulging eye'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'If tears cannot drain to the nose, they overflow, producing epiphora (a watery eye).', 'reasoning_eligible': False},
                {'stem': 'Proptosis (exophthalmos) means the eye is:', 'options': ['Bulging/pushed forward', 'Sunken back', 'Turned inward', 'Completely closed'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Proptosis is forward bulging of the globe, often from orbital disease such as thyroid eye disease.', 'reasoning_eligible': False},
                {'stem': 'For a patient with ectropion, gentle cleaning of the overflowing tears is advised mainly to:', 'options': ['Prevent excoriation (soreness) of the cheek skin', 'Speed up vision recovery', 'Lower the eye pressure', 'Cure the ectropion'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Constant wiping of tears irritates the cheek skin; gentle, careful cleaning reduces excoriation.', 'reasoning_eligible': False},
                {'stem': 'The two main functions of the eyelids are to protect the eye and to:', 'options': ['Spread the tear film over the surface with each blink', 'Focus light onto the retina', 'Produce aqueous humour', 'Change eye colour'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Blinking spreads tears to keep the cornea moist, and the lids shield the eye from foreign bodies.', 'reasoning_eligible': False},
                {'stem': 'A patient should be advised NOT to squeeze a stye because it can:', 'options': ['Spread the infection', 'Cure it faster', 'Improve vision', 'Lower eye pressure'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Squeezing can spread the infection; warm compresses and hygiene are advised instead.', 'reasoning_eligible': True},
                {'stem': 'A drooping upper eyelid that blocks the upper field of vision is:', 'options': ['Ptosis', 'Ectropion', 'Proptosis', 'A stye'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Ptosis (upper-lid droop) can obstruct the superior visual field.', 'reasoning_eligible': False},
                {'stem': 'Lubricating drops/ointment are commonly advised in ectropion mainly to:', 'options': ['Protect the exposed eye surface from drying', 'Lower eye pressure', 'Dilate the pupil', 'Numb the cornea'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'The exposed cornea in ectropion can dry out, so lubricants protect the surface until definitive treatment.', 'reasoning_eligible': False},
                {'stem': 'Dacryocystitis is an infection of the:', 'options': ['Lacrimal (tear) sac', 'Cornea', 'Retina', 'Optic nerve'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Dacryocystitis is infection of the lacrimal sac, causing a painful swelling near the inner corner of the eye.', 'reasoning_eligible': False},
                {'stem': 'A patient reports a painless lump set back in the eyelid that has been present for weeks. This is most likely a:', 'options': ['Chalazion', 'Stye', 'Corneal abrasion', 'Retinal detachment'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'A persistent, painless lid lump away from the margin is typically a chalazion (blocked meibomian gland).', 'reasoning_eligible': False},
            ],
            "medium": [
                {'stem': 'Senile ectropion (the commonest type) is due to:', 'options': ['Age-related relaxation of the orbicularis muscle', 'A seventh-nerve palsy', 'Scarring of the lid', 'Congenital infection'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Involutional/senile ectropion results from age-related laxity of the orbicularis and lid tissues.', 'reasoning_eligible': False},
                {'stem': 'Paralytic ectropion is associated with a palsy of which cranial nerve?', 'options': ['The seventh (facial) nerve', 'The second (optic) nerve', 'The fourth (trochlear) nerve', 'The eighth nerve'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Facial (CN VII) palsy weakens the orbicularis, producing paralytic ectropion and poor lid closure.', 'reasoning_eligible': False},
                {'stem': 'The main danger of long-standing entropion or trichiasis is:', 'options': ['Corneal abrasion/ulceration from constant lash rubbing', 'Sudden glaucoma', 'A cataract forming overnight', 'Retinal detachment'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Persistent lash contact abrades the cornea and can lead to ulceration and scarring.', 'reasoning_eligible': True},
                {'stem': 'A patient with facial-nerve palsy cannot fully close one eye. The key ocular risk is:', 'options': ['Exposure keratopathy (drying/ulceration of the cornea)', 'Sudden cataract', 'Raised eye pressure', 'Colour blindness'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Incomplete closure exposes the cornea; lubrication and lid care prevent exposure keratopathy.', 'reasoning_eligible': True},
                {'stem': 'A sudden ptosis accompanied by double vision and a severe headache should be treated as:', 'options': ['A red flag needing urgent referral', 'A minor cosmetic issue', 'Normal ageing', 'An allergy'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Sudden ptosis with diplopia/headache may signal a third-nerve palsy or serious cause and needs urgent assessment.', 'reasoning_eligible': True},
                {'stem': 'Aponeurotic (the most common acquired) ptosis is due to:', 'options': ['Age-related stretching/dehiscence of the levator muscle', 'A brain tumour in all cases', 'A blocked tear duct', 'A corneal ulcer'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Aponeurotic ptosis results from stretching or disinsertion of the levator aponeurosis with ageing.', 'reasoning_eligible': False},
                {'stem': 'A ptosis that worsens through the day and improves with rest, with variable double vision, may suggest:', 'options': ['Myasthenia gravis', 'A simple stye', 'Allergic conjunctivitis', 'Dry eye'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Fatigable, variable ptosis and diplopia are classic for myasthenia gravis and warrant referral.', 'reasoning_eligible': True},
                {'stem': 'Thyroid eye disease (Graves orbitopathy) is the most common cause in adults of:', 'options': ['Proptosis (bulging eyes), often with lid retraction', 'A painless lid lump', 'A blocked tear duct', 'A stye'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Thyroid eye disease is the leading cause of adult proptosis, frequently with lid retraction and stare.', 'reasoning_eligible': False},
                {'stem': 'A child with a red, swollen, painful eyelid, fever, a bulging eye and painful restricted eye movements has, until proven otherwise:', 'options': ['Orbital cellulitis - a sight- and life-threatening emergency', 'A simple stye', 'Allergic conjunctivitis', 'Dry eye'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Proptosis with painful, restricted movement and fever suggests orbital cellulitis needing urgent treatment.', 'reasoning_eligible': True},
                {'stem': 'As a temporary measure for ectropion, taping the eyelid is advised:', 'options': ['Partially by day and more fully at night', 'Only during meals', 'Permanently for years', 'Never'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Taping can hold the lid in position temporarily - partial during the day, fully at night - pending surgery.', 'reasoning_eligible': False},
                {'stem': 'A patient with dacryocystitis presents with a tender swelling and redness at the:', 'options': ['Inner corner (medial canthus) of the eye', 'Outer eyebrow', 'Centre of the cornea', 'Back of the head'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Infection of the lacrimal sac causes a painful, red swelling at the medial canthus, often with epiphora.', 'reasoning_eligible': False},
                {'stem': 'The definitive treatment for significant ectropion or entropion is usually:', 'options': ['Surgery to correct the lid position', 'Antibiotic tablets alone', 'Glasses', 'Eye exercises'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Lid-repositioning surgery is the definitive treatment; lubricants/taping are temporising measures.', 'reasoning_eligible': False},
                {'stem': 'Which finding in an ectropion patient means the cornea may be at risk and warrants prompt ophthalmology review?', 'options': ['Increasing redness, light sensitivity and decreasing vision', 'Mild occasional watering only', 'A slightly sagging lid with comfortable eye', 'No symptoms at all'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Redness, photophobia and dropping vision suggest corneal exposure/ulceration needing urgent review.', 'reasoning_eligible': True},
                {'stem': 'Cicatricial ectropion or entropion is caused by:', 'options': ['Scarring of the lid/conjunctiva pulling the lid', 'Age-related muscle laxity only', 'A blocked oil gland', 'High blood sugar'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Cicatricial lid malposition results from scarring (after trauma, burns or chronic disease) distorting the lid.', 'reasoning_eligible': False},
                {'stem': 'A chalazion may become secondarily infected, most commonly by:', 'options': ['Staphylococci', 'A virus', 'A fungus', 'A parasite'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'A blocked meibomian gland (chalazion) can become secondarily infected, commonly with staphylococci.', 'reasoning_eligible': False},
                {'stem': 'Advising a ptosis patient who tilts the head back to see is appropriate because the head posture:', 'options': ['Compensates for the drooping lid to clear the visual axis', 'Cures the ptosis', 'Lowers the eye pressure', 'Prevents infection'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'A chin-up head posture lets the patient see under the drooping lid; it is a compensatory sign of significant ptosis.', 'reasoning_eligible': False},
                {'stem': 'A practical regimen to advise for warm compresses to a chalazion is:', 'options': ['A few minutes, several times a day, with gentle lid massage', 'Once a week for one minute', 'Eight hours continuously overnight', 'Ice packs only, never heat'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Warm compresses for a few minutes several times daily, with gentle massage, help the blocked meibomian gland drain.', 'reasoning_eligible': False},
            ],
            "hard": [
                {'stem': 'A patient develops a painful third-nerve (CN III) palsy with ptosis and a dilated pupil. This combination is concerning for:', 'options': ['A compressive lesion (e.g. aneurysm) - an urgent referral', 'Simple dry eye', 'A harmless stye', 'Allergic conjunctivitis'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'A painful pupil-involving CN III palsy may indicate a compressive aneurysm and needs urgent neuro-imaging.', 'reasoning_eligible': True},
                {'stem': 'Why does poor eyelid closure (e.g. in ectropion or facial palsy) threaten the cornea?', 'options': ['The cornea is left exposed and dries out, risking ulceration', 'It raises the eye pressure', 'It causes a cataract', 'It detaches the retina'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Without proper closure the cornea is not kept moist and is exposed, leading to exposure keratopathy/ulcer.', 'reasoning_eligible': True},
                {'stem': 'Orbital (post-septal) cellulitis is distinguished from simpler preseptal cellulitis by the presence of:', 'options': ['Proptosis, painful restricted eye movements and reduced vision', 'Only mild lid redness', 'A watery eye alone', 'Itchy eyelids'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Orbital involvement adds proptosis, painful/limited eye movements and possible visual loss - a true emergency.', 'reasoning_eligible': True},
                {'stem': 'Orbital cellulitis most commonly spreads to the orbit from the:', 'options': ['Adjacent (ethmoid) sinuses', 'Retina', 'Lens', 'Optic nerve'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Infection often spreads from the ethmoid sinuses through the thin medial orbital wall into the orbit.', 'reasoning_eligible': False},
                {'stem': "An orbital 'blowout' fracture of the floor after blunt trauma may cause:", 'options': ['Double vision on looking up and numbness of the cheek', 'Sudden painless blindness only', 'A red painful eye with discharge', 'A drooping upper lid alone'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Floor fractures can trap the inferior rectus (diplopia on upgaze) and injure the infraorbital nerve (cheek numbness).', 'reasoning_eligible': True},
                {'stem': 'In thyroid eye disease, sight-threatening compressive optic neuropathy is suggested by:', 'options': ['Dropping vision or colour vision with a very tight/proptotic orbit', 'Mild lid retraction only', 'A comfortable white eye', 'Occasional watering'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Reduced acuity/colour vision with congested orbit signals optic-nerve compression needing urgent management.', 'reasoning_eligible': True},
                {'stem': 'The key nursing/counselling point for a facial-palsy patient with incomplete lid closure at night is to:', 'options': ['Lubricate generously and tape/pad the eye closed at night to protect the cornea', 'Leave the eye open and dry', 'Apply ice all night', 'Rub the eye to keep it moist'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Overnight the corneal exposure risk is highest; lubrication plus taping/padding protects the surface.', 'reasoning_eligible': True},
                {'stem': 'A stye and a chalazion are best distinguished clinically because a stye is:', 'options': ['Painful and at the lid margin, while a chalazion is painless and deeper', 'Deeper and painless', 'On the cornea', 'Inside the orbit'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'A stye is a painful marginal infection; a chalazion is a painless deeper lipogranuloma set back from the margin.', 'reasoning_eligible': False},
                {'stem': 'A persistent, firm, recurrent chalazion in an older adult that does not respond to treatment should prompt:', 'options': ['Consideration of referral to exclude an eyelid tumour (e.g. sebaceous carcinoma)', 'Ignoring it indefinitely', 'Only stronger warm compresses', 'A change of spectacles'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'A recurrent, atypical or non-resolving lid lesion can mimic a chalazion but be a tumour, so referral/biopsy is considered.', 'reasoning_eligible': True},
                {'stem': 'The lacrimal drainage pathway carries tears from the puncta to the:', 'options': ['Nose (via the nasolacrimal duct)', 'Brain', 'Ear', 'Sinus above the eyebrow only'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Tears drain through the puncta, canaliculi, lacrimal sac and nasolacrimal duct into the nose.', 'reasoning_eligible': False},
                {'stem': 'Acute dacryocystitis with a tense, red, painful medial-canthal swelling is managed initially with:', 'options': ['Systemic antibiotics and referral (definitive surgery/DCR later)', 'Vigorous massage until it bursts', 'Ignoring it', 'Only lubricating drops'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Acute lacrimal-sac infection needs antibiotics and referral; definitive drainage surgery (DCR) is done later.', 'reasoning_eligible': True},
                {'stem': 'Why is generous lubrication a mainstay of care for many lid malpositions (ectropion, lagophthalmos)?', 'options': ['It substitutes for the failed tear-spreading/protective function of the lids', 'It corrects the lid position', 'It lowers the eye pressure', 'It treats the infection'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'When the lids cannot spread or retain tears, lubricants keep the exposed surface moist until definitive repair.', 'reasoning_eligible': False},
                {'stem': 'A patient after ptosis or lid surgery should be counselled to watch for and report:', 'options': ['Increasing pain, bleeding, or the eye not closing/worsening vision', 'Mild bruising that settles', 'Feeling generally well', 'A small amount of expected swelling'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Red-flag post-op signs (severe pain, bleeding, poor closure, dropping vision) warrant prompt review.', 'reasoning_eligible': True},
                {'stem': 'Congenital ptosis is important to detect early in a child because a lid covering the pupil can cause:', 'options': ['Amblyopia (lazy eye) from visual deprivation', 'Immediate cataract', 'Glaucoma overnight', 'A squint that never matters'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'If the lid blocks the visual axis in a young child, deprivation amblyopia can develop, so timely referral matters.', 'reasoning_eligible': True},
                {'stem': 'The general role of the OA/OT/PSA when they identify a lid or orbital abnormality is to:', 'options': ['Document findings, give supportive care and escalate to the ophthalmologist', 'Diagnose and prescribe treatment', 'Perform the surgery', 'Reassure and never refer'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Allied-health staff recognise, document and support, then escalate diagnosis/treatment to the clinician.', 'reasoning_eligible': False},
                {'stem': 'Warm compresses help a chalazion or meibomian-gland blockage by:', 'options': ['Softening the oily secretion so the gland can drain', 'Killing the virus', 'Lowering the eye pressure', 'Numbing the cornea'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Heat softens inspissated meibomian oil, encouraging the blocked gland to drain.', 'reasoning_eligible': False},
            ],
        },
        "professional_ethics": {
            "easy": [
                {'stem': 'Which of these is one of the four basic principles of medical ethics?', 'options': ['Autonomy', 'Profitability', 'Speed', 'Popularity'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The four principles are autonomy, beneficence, non-maleficence and justice.', 'reasoning_eligible': False},
                {'stem': "'Autonomy' in medical ethics means the patient has:", 'options': ['The freedom to make their own informed health decisions', 'No say in their care', "To always follow the doctor's wishes", 'To pay before any treatment'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': "Autonomy is the patient's freedom of thought, intention and action in decisions about their care.", 'reasoning_eligible': False},
                {'stem': "The principle of 'non-maleficence' is best summarised as:", 'options': ['Above all, do no harm', 'Always do what is cheapest', 'Treat everyone identically', 'Never tell the patient anything'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Non-maleficence is the duty to avoid causing harm to the patient.', 'reasoning_eligible': False},
                {'stem': "'Beneficence' means the practitioner should:", 'options': ['Act in the best interest of the patient', 'Act in their own interest', 'Avoid all patients', 'Do the minimum required'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': "Beneficence is the obligation to act for the patient's benefit (doing good).", 'reasoning_eligible': False},
                {'stem': "'Justice' in healthcare ethics refers to:", 'options': ['Fair and equal distribution of care/resources', 'Punishing rule-breakers', 'Choosing favourites', 'Charging more for the elderly'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Justice concerns fairness and equity in how care and scarce resources are distributed.', 'reasoning_eligible': False},
                {'stem': 'Before a procedure, checking the patient understands the risks, benefits and alternatives is part of obtaining:', 'options': ['Informed consent', 'A refund', 'A discount', 'A referral letter'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Informed consent requires the patient to understand the risks, benefits and likelihood of success.', 'reasoning_eligible': False},
                {'stem': 'A patient asks you to explain their diagnosis and treatment plan in detail. As an allied-health professional you should:', 'options': ['Refer clinical explanation/decisions to the responsible clinician', 'Guess a diagnosis', 'Prescribe medication yourself', 'Refuse to speak to them'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Allied-health staff do not diagnose or prescribe; clinical decisions and explanations are escalated to the clinician.', 'reasoning_eligible': True},
                {'stem': 'A friend asks you about a celebrity who was seen in your clinic. You should:', 'options': ['Not disclose any patient information (maintain confidentiality)', 'Share a few harmless details', 'Confirm only the diagnosis', 'Show them the records'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Patient confidentiality is protected; disclosing any identifiable information is a breach.', 'reasoning_eligible': True},
                {'stem': 'Before starting any test, you must correctly identify the patient using:', 'options': ['At least two identifiers (e.g. name and NRIC/date of birth)', 'Their seat number', 'Their clothing colour', 'Your memory alone'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Two patient identifiers (such as name and NRIC/DOB) prevent wrong-patient errors.', 'reasoning_eligible': False},
                {'stem': 'Good professional etiquette when meeting a patient includes:', 'options': ['Introducing yourself and your role and greeting them respectfully', 'Ignoring them until they speak', 'Using nicknames', 'Discussing them loudly in the corridor'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Introducing yourself and your role and a respectful greeting build trust and professionalism.', 'reasoning_eligible': False},
                {'stem': 'A medical social worker (MSW) primarily helps patients with:', 'options': ['Financial, social and psychosocial support and community resources', 'Performing eye surgery', 'Prescribing glasses', 'Reading OCT scans'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'MSWs support patients with financial assistance, counselling and links to community resources.', 'reasoning_eligible': False},
                {'stem': 'You must log off or lock the clinical computer when you step away because:', 'options': ['It protects confidential patient data', 'It saves electricity only', 'It is faster to restart', 'The screen looks tidier'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Locking/logging off prevents unauthorised access to confidential electronic records.', 'reasoning_eligible': False},
                {'stem': 'Sharing your clinical-system login password with a colleague is:', 'options': ['Not allowed - accounts are personal and auditable', 'Fine if they are busy', 'Encouraged to save time', 'Required by policy'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Login credentials are personal; sharing them breaches data-security policy and accountability.', 'reasoning_eligible': False},
                {'stem': 'Active listening during a patient interview involves:', 'options': ['Giving full attention, showing empathy and checking understanding', 'Interrupting frequently', 'Looking at your phone', 'Finishing their sentences for them'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Active listening (attention, empathy, clarifying) improves communication and patient trust.', 'reasoning_eligible': False},
                {'stem': 'A patient who does not speak English well needs to consent to a test. The best approach is to:', 'options': ['Arrange a qualified interpreter', 'Use hand gestures and hope they understand', 'Ask a stranger in the waiting room to translate', 'Skip the explanation'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'A trained interpreter ensures genuine understanding for valid consent, especially for anything invasive.', 'reasoning_eligible': True},
                {'stem': 'Being punctual and reliable for your clinic duties is part of:', 'options': ['Professional conduct and respect for patients and colleagues', 'Personal preference only', 'An optional courtesy', 'Something only managers need'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Punctuality and reliability are core to professional conduct and safe, respectful care.', 'reasoning_eligible': False},
                {'stem': 'If you make an error while performing a test on a patient, you should:', 'options': ['Report it honestly through the incident-reporting process', 'Hide it to avoid trouble', 'Blame the patient', 'Delete the record'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Honest incident reporting supports patient safety and learning; concealment is unethical and unsafe.', 'reasoning_eligible': True},
            ],
            "medium": [
                {'stem': 'A competent adult patient refuses a recommended test after understanding the consequences. You should:', 'options': ['Respect their autonomous decision and document it', 'Perform it anyway', 'Trick them into agreeing', 'Discharge them angrily'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Respect for autonomy means a competent, informed patient may refuse; this is respected and documented.', 'reasoning_eligible': True},
                {'stem': "For valid consent, the patient's agreement must be:", 'options': ['Informed, voluntary and given by someone with capacity', 'Signed quickly without reading', 'Given by any relative', 'Assumed if they attend'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Valid consent is informed, voluntary and given by a person with the capacity to decide.', 'reasoning_eligible': False},
                {'stem': 'Medical negligence (malpractice) is defined as an act or omission that:', 'options': ['Deviates from accepted standards of practice and causes patient injury', 'Simply upsets a patient', 'Takes longer than expected', 'Costs more than budgeted'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Negligence is a deviation from the accepted standard of care that results in harm to the patient.', 'reasoning_eligible': False},
                {'stem': 'For a young child needing a sight-saving treatment, decision-making authority usually rests with:', 'options': ["The parents/guardians as surrogate decision-makers, in the child's best interest", 'The child alone', 'The receptionist', 'Whoever is nearest'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': "Parents act as surrogates in the child's best interest; avoiding serious harm can take precedence.", 'reasoning_eligible': True},
                {'stem': "The 'double effect' principle describes a situation where an intervention:", 'options': ['Produces a good outcome but also a potential harm (e.g. morphine easing pain but suppressing breathing)', 'Has no effect at all', 'Always cures the patient', 'Only helps the practitioner'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Double effect: an act intended to do good may carry a foreseen harmful side effect.', 'reasoning_eligible': False},
                {'stem': "You overhear two colleagues discussing a named patient's case loudly in a public lift. The professional response is to:", 'options': ['Remind them to keep patient information confidential and private', 'Join the conversation', 'Record it', 'Ignore it entirely'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Patient information must not be discussed where it can be overheard; confidentiality applies everywhere.', 'reasoning_eligible': True},
                {'stem': 'A patient becomes distressed and tearful during history-taking. The most appropriate response is to:', 'options': ['Show empathy, allow time and offer support (e.g. MSW referral if needed)', 'Continue as if nothing happened', 'Tell them to stop crying', 'End the appointment immediately'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Empathic communication and appropriate support (including MSW referral) are part of patient-centred care.', 'reasoning_eligible': True},
                {'stem': 'When performing an intimate or close-contact examination, offering a chaperone is:', 'options': ['Good practice that protects both patient and staff', 'Never necessary', 'Only for VIP patients', 'A waste of time'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': "A chaperone safeguards the patient's dignity and protects staff during close examinations.", 'reasoning_eligible': False},
                {'stem': "A patient's religious beliefs lead them to decline a particular treatment. The ethical stance is to:", 'options': ['Respect their informed choice while ensuring they understand the consequences', 'Override their beliefs', 'Refuse to treat them at all', 'Report them'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Autonomy includes freely chosen religious beliefs; respect the informed decision after clear counselling.', 'reasoning_eligible': True},
                {'stem': 'Under data-protection principles, patient information should be:', 'options': ['Collected and used only for legitimate care purposes and kept secure', 'Shared freely with anyone', 'Posted on social media', 'Left open on screen'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Personal data is handled only for proper purposes, accessed on a need-to-know basis and kept secure.', 'reasoning_eligible': False},
                {'stem': 'You are asked to perform a test that is outside your trained scope of practice. You should:', 'options': ['Decline and escalate to an appropriately trained/authorised person', 'Attempt it anyway', 'Ask the patient to guide you', 'Pretend you did it'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Working within your competence and scope, and escalating when beyond it, protects patients (non-maleficence).', 'reasoning_eligible': True},
                {'stem': 'Beneficence obliges healthcare providers to maintain competence by:', 'options': ['Continually updating their training, skills and knowledge', 'Never changing how they work', 'Avoiding new techniques', 'Relying only on old habits'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': "Acting in patients' best interest requires keeping skills and knowledge current.", 'reasoning_eligible': False},
                {'stem': "A relative demands to see a competent adult patient's results without the patient's permission. You should:", 'options': ['Decline unless the patient has consented to the disclosure', 'Show them immediately', 'Read the results aloud', 'Email them a copy'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': "Disclosure of a competent adult's information requires that patient's consent.", 'reasoning_eligible': True},
                {'stem': 'Documenting your findings accurately and legibly is important because the record:', 'options': ['Supports safe care, communication and is a legal document', 'Is only for billing', 'Can be filled in later from memory', 'Does not matter if brief'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Accurate, contemporaneous records support continuity of care and are legally important.', 'reasoning_eligible': False},
                {'stem': 'Professional dress code and identification (name badge) in the clinic mainly serve to:', 'options': ['Present a professional image and let patients identify staff', 'Impress managers only', 'Follow fashion', 'Hide your identity'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Appropriate attire and visible ID convey professionalism and help patients know who is caring for them.', 'reasoning_eligible': False},
                {'stem': 'When explaining a test to a patient, you should:', 'options': ['Use clear, plain language and check they understand', 'Use only technical jargon', 'Speak as fast as possible', 'Assume they already know'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Plain-language explanation with comprehension checks supports informed, patient-centred communication.', 'reasoning_eligible': False},
                {'stem': 'A distressed patient with financial difficulty affording treatment could be appropriately referred to:', 'options': ['A medical social worker (MSW)', 'The pharmacy only', 'The optometrist', 'No one'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'MSWs assess financial/social needs and connect patients with assistance and community resources.', 'reasoning_eligible': False},
            ],
            "hard": [
                {'stem': "A conflict can arise between respecting patient autonomy and the practitioner's wish to 'benefit' the patient. Ethically, greater priority is generally given to:", 'options': ["Respecting the informed patient's autonomous choice", "The practitioner's paternalistic preference", 'Whatever is cheapest', "The relatives' wishes"], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': "The informed, competent patient's autonomous choice is normally given priority over paternalism.", 'reasoning_eligible': True},
                {'stem': 'Violation of non-maleficence causing patient harm is the usual subject of:', 'options': ['Medical malpractice litigation', 'A pay rise', 'Marketing', 'A thank-you letter'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Harm from failing to avoid injury (non-maleficence) underlies medical malpractice claims.', 'reasoning_eligible': False},
                {'stem': "'Fair distribution of scarce healthcare resources among all groups' is an expression of which principle?", 'options': ['Justice', 'Autonomy', 'Beneficence', 'Confidentiality'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Justice concerns equitable allocation of limited resources and treatments across society.', 'reasoning_eligible': False},
                {'stem': "A colleague asks you to 'just sign' that a checklist step was done when it was not. You should:", 'options': ['Refuse - falsifying records is dishonest and unsafe', 'Sign to be helpful', 'Sign but tell no one', 'Sign and blame them later'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Records must be truthful; falsification is a serious professional and legal breach that endangers patients.', 'reasoning_eligible': True},
                {'stem': 'An elderly patient with possible impaired capacity needs a decision made. The proper approach is to:', 'options': ['Assess capacity and involve the appropriate surrogate/best-interest process', 'Let them decide alone regardless', 'Ask the cleaner to decide', 'Proceed without any consent'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Where capacity is in doubt, it is formally assessed and decisions follow the correct best-interest/surrogate process.', 'reasoning_eligible': True},
                {'stem': 'Consent obtained by withholding key risks from the patient is:', 'options': ['Not valid (informed consent requires disclosure of material risks)', 'Perfectly valid', 'Valid if the form is signed', 'Valid if the doctor is senior'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Consent is only informed if material risks and consequences are disclosed and understood.', 'reasoning_eligible': True},
                {'stem': 'Accessing the electronic record of a patient who is NOT under your care, out of curiosity, is:', 'options': ['A breach of confidentiality/data policy (access must be need-to-know)', 'Allowed for staff', 'Fine if you tell no one', 'Encouraged for learning'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Record access is strictly need-to-know; curiosity browsing is an auditable confidentiality breach.', 'reasoning_eligible': True},
                {'stem': "The 'double effect' of giving morphine to a dying patient illustrates that an act can:", 'options': ['Be ethically acceptable when the intent is to relieve suffering despite a foreseen harm', 'Never be justified', 'Always be avoided', 'Only be done for profit'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Relief of suffering (good intent) may be acceptable even with a foreseen harmful side effect, under double effect.', 'reasoning_eligible': False},
                {'stem': "A patient's data protection is strengthened when staff practise:", 'options': ['Need-to-know access, secure passwords, and locking screens', 'Sharing logins for convenience', 'Leaving notes open on desks', 'Discussing cases on social media'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Minimising access, protecting credentials and securing screens/records safeguards confidential data.', 'reasoning_eligible': False},
                {'stem': 'You witness a colleague behaving in a way that risks patient safety. The professional duty is to:', 'options': ['Raise the concern through the appropriate channels', 'Say nothing to avoid conflict', 'Gossip about it', 'Cover for them'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'There is a professional duty of candour to raise safety concerns through proper channels.', 'reasoning_eligible': True},
                {'stem': 'When breaking or supporting delivery of difficult news, good practice is to:', 'options': ['Ensure privacy, use clear compassionate language and allow questions', 'Do it in a busy corridor', 'Rush through it', 'Avoid eye contact and leave quickly'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'A private setting, compassionate clear communication and space for questions are core to supporting patients.', 'reasoning_eligible': False},
                {'stem': "An allied-health professional's role at the end of a station is best described as providing a:", 'options': ['Findings/impression and recommendation (escalation) - not a diagnosis or prescription', 'Definitive diagnosis and treatment', 'Surgical plan', 'Prescription for drops'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': "OA/OT/PSA hand over findings and recommend escalation; diagnosing and prescribing are the clinician's role.", 'reasoning_eligible': True},
                {'stem': 'A gift or payment offered by a patient to receive faster/preferential treatment should be:', 'options': ['Politely declined to avoid a conflict of interest / unfairness (justice)', 'Accepted quietly', 'Expected as normal', 'Demanded in future'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Accepting inducements undermines fairness (justice) and professional integrity; such offers are declined per policy.', 'reasoning_eligible': True},
                {'stem': 'Maintaining professional boundaries with patients means you:', 'options': ['Keep the relationship therapeutic and avoid inappropriate personal involvement', 'Add every patient on social media', 'Share your home address', 'Meet them socially for treatment'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Professional boundaries protect the therapeutic relationship and both parties from harm.', 'reasoning_eligible': False},
                {'stem': 'Cultural sensitivity in the eye clinic means you:', 'options': ["Respect patients' beliefs, language and customs while delivering safe care", 'Treat all patients identically ignoring their needs', 'Impose your own beliefs', 'Refuse unfamiliar customs'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Culturally sensitive, individualised care respects beliefs and customs while keeping care safe and equitable.', 'reasoning_eligible': False},
                {'stem': 'The over-arching purpose of professional ethics and conduct in the eye clinic is to:', 'options': ["Protect patients' safety, dignity and rights and maintain trust", 'Increase clinic revenue', 'Reduce staff workload', 'Impress inspectors only'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': "Ethical practice safeguards patients' safety, dignity and rights and sustains public trust in the profession.", 'reasoning_eligible': False},
            ],
        },
        "ocular_emergencies": {
            "easy": [
                {'stem': 'The first action for a chemical eye burn is to:', 'options': ['Start copious irrigation immediately', 'Measure visual acuity first', 'Instil antibiotic ointment', 'Pad the eye and wait'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Immediate copious irrigation limits ongoing damage and is started even before vision testing.', 'reasoning_eligible': True},
                {'stem': 'A chemical eye injury is triaged as which urgency category?', 'options': ['Category 1 (most urgent)', 'Category 4 (routine)', 'Not urgent', 'Category 3'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Chemical burns are sight-threatening emergencies (Category 1), seen within about 10 minutes.', 'reasoning_eligible': False},
                {'stem': 'Which type of chemical burn tends to be MORE serious?', 'options': ['Alkali', 'Acid', 'They are identical', 'Neither is serious'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Alkalis saponify cell-membrane fats and penetrate deeper, so alkali burns are usually worse than acid burns.', 'reasoning_eligible': False},
                {'stem': 'During chemical-burn irrigation, you continue until the ocular surface pH is about:', 'options': ['7.0 (neutral)', '4.0', '10.0', 'Any value once 1 minute has passed'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Irrigation continues (often 20+ minutes) until the pH returns to neutral (~7.0).', 'reasoning_eligible': False},
                {'stem': 'A corneal abrasion classically shows what on fluorescein staining?', 'options': ['A stained epithelial defect (often with sharp borders)', 'No staining at all', 'Diffuse whole-eye staining', 'Staining only of the lens'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'An abrasion is a superficial epithelial loss that pools fluorescein, typically with sharp borders.', 'reasoning_eligible': False},
                {'stem': 'A patient with a suspected penetrating (open globe) injury should have the eye:', 'options': ['Protected with a rigid shield and referred urgently', 'Firmly padded with pressure', 'Irrigated forcefully', 'Massaged gently'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'An open globe is shielded (not pressed) and referred urgently; pressure can extrude ocular contents.', 'reasoning_eligible': True},
                {'stem': 'Sudden, painless loss of vision in one eye is:', 'options': ['An emergency needing urgent referral', 'A routine problem', 'Always just tiredness', 'Never serious'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Sudden painless monocular vision loss (e.g. CRAO) is a time-critical emergency.', 'reasoning_eligible': True},
                {'stem': 'A hyphaema is the presence of ___ in the anterior chamber.', 'options': ['Blood', 'Pus', 'Air', 'Aqueous only'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'A hyphaema is blood (from the iris/ciliary body) in the anterior chamber, usually after blunt trauma.', 'reasoning_eligible': False},
                {'stem': 'Superficial ocular foreign bodies are especially common in workers who are:', 'options': ['Grinding, welding, drilling or hammering', 'Sitting at a desk', 'Reading books', 'Cooking rice'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'High-speed metal work (grinding/welding/drilling) commonly produces corneal/conjunctival foreign bodies.', 'reasoning_eligible': False},
                {'stem': 'To find a foreign body hidden under the upper lid, you should:', 'options': ['Evert (flip) the upper eyelid', 'Press hard on the globe', 'Irrigate with acid', 'Pad both eyes'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Everting the upper lid reveals subtarsal foreign bodies, which cause vertical linear corneal scratches.', 'reasoning_eligible': False},
                {'stem': 'A painless, flat red patch of blood on the white of the eye that the patient just noticed is most likely a:', 'options': ['Subconjunctival haemorrhage', 'Chemical burn', 'Acute glaucoma attack', 'Retinal detachment'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'A spontaneous subconjunctival haemorrhage is usually benign and resolves in 2-3 weeks with reassurance.', 'reasoning_eligible': False},
                {'stem': 'Before you irrigate a chemical burn, an anaesthetic drop (e.g. proparacaine) is useful mainly to:', 'options': ['Relieve pain and allow thorough irrigation', 'Neutralise the chemical', 'Dilate the pupil', 'Stop the bleeding'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Topical anaesthetic eases pain and blepharospasm so irrigation can be done thoroughly.', 'reasoning_eligible': False},
                {'stem': 'Which is a suitable bland irrigating fluid for a chemical eye burn?', 'options': ["Normal saline (or Ringer's lactate)", 'Concentrated bleach', 'Undiluted acid', 'Alcohol'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': "Copious bland fluid such as normal saline or Ringer's lactate is used; never neutralise with another chemical.", 'reasoning_eligible': False},
                {'stem': "Flashes of light, a shower of new floaters, and a 'curtain' over the vision suggest:", 'options': ['Retinal detachment', 'Allergic conjunctivitis', 'A stye', 'Dry eye'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Flashes, floaters and a progressing shadow/curtain are classic warning signs of retinal detachment.', 'reasoning_eligible': True},
                {'stem': 'A welder who worked without eye protection develops severe eye pain and light sensitivity several hours later. This is typically:', 'options': ["Ultraviolet ('arc eye') photokeratitis", 'Acute glaucoma', 'A cataract', 'A retinal tear'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'UV exposure from welding causes a painful photokeratitis some hours later; it usually heals with supportive care.', 'reasoning_eligible': False},
                {'stem': 'Pressure padding of a simple corneal abrasion:', 'options': ['Does not speed healing (used only for comfort, if at all)', 'Doubles the healing speed', 'Is essential to heal', 'Cures infection'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Padding gives some comfort but has no proven effect on abrasion healing.', 'reasoning_eligible': False},
                {'stem': 'The very first priority when a patient arrives with an acid splash in the eye is to:', 'options': ['Irrigate now, before completing registration or vision testing', 'Complete all paperwork first', 'Send them to the waiting room', 'Book a routine appointment'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Time is sight; irrigation begins immediately, ahead of administrative or assessment steps.', 'reasoning_eligible': True},
            ],
            "medium": [
                {'stem': 'Why do alkali burns penetrate more deeply than acid burns?', 'options': ['Alkalis saponify (dissolve) cell-membrane fats', 'Alkalis coagulate proteins forming a barrier', 'Acids have no effect', 'Alkalis evaporate instantly'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Alkalis saponify membrane lipids and drive deeper, while acids coagulate proteins that limit penetration.', 'reasoning_eligible': False},
                {'stem': 'During chemical-burn irrigation you ask the patient to look up, down and side to side in order to:', 'options': ['Irrigate the conjunctival fornices thoroughly', 'Test the eye movements', 'Distract them', 'Check for squint'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Moving the eye exposes the fornices so trapped chemical and debris are washed out.', 'reasoning_eligible': True},
                {'stem': 'Marked conjunctival blanching (limbal ischaemia) after a chemical burn indicates:', 'options': ['A severe burn needing immediate referral', 'A trivial injury', 'Good prognosis, discharge home', 'Simple allergy'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Limbal ischaemia (blanching) signals a severe burn with poorer prognosis and warrants urgent referral.', 'reasoning_eligible': True},
                {'stem': 'A patient reports a painful red eye with haloes around lights, nausea and blurred vision. The concerning emergency is:', 'options': ['Acute angle-closure glaucoma', 'Simple dry eye', 'Allergic conjunctivitis', 'A subconjunctival haemorrhage'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Pain, haloes, nausea and a hazy cornea with a fixed mid-dilated pupil suggest acute angle-closure glaucoma.', 'reasoning_eligible': True},
                {'stem': 'In acute angle-closure glaucoma the pupil is typically:', 'options': ['Mid-dilated and poorly reactive', 'Pinpoint and brisk', 'Perfectly normal', 'Constricted and reactive'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'AACG classically shows a hazy cornea and a fixed, mid-dilated, poorly-reactive pupil with very high IOP.', 'reasoning_eligible': False},
                {'stem': 'A high-velocity metal fragment (e.g. from hammering steel) demands you specifically exclude:', 'options': ['A penetrating/intraocular foreign body', 'Simple dry eye', 'Presbyopia', 'A refractive error'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'High-velocity fragments can penetrate the globe, so an intraocular foreign body must be excluded before removal attempts.', 'reasoning_eligible': True},
                {'stem': 'Which finding after blunt trauma should raise suspicion of a ruptured (open) globe?', 'options': ['A very soft eye with a peaked/teardrop pupil', 'A mildly watery eye', 'Normal vision and white eye', 'Itchy eyelids'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Low IOP with a peaked pupil (and possibly uveal prolapse) suggests globe rupture - shield and refer, do not manipulate.', 'reasoning_eligible': True},
                {'stem': 'For a hyphaema, initial management commonly includes:', 'options': ['Rest with head elevation and monitoring for a rise in IOP', 'Vigorous exercise', 'Firm eye massage', 'Immediate swimming'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Hyphaema is managed with rest/head elevation and watching for raised IOP and rebleeding.', 'reasoning_eligible': False},
                {'stem': 'A subconjunctival haemorrhage after trauma that is very swollen (bullous) and bloody should prompt you to:', 'options': ['Exclude an underlying scleral rupture', 'Simply reassure and discharge with no thought', 'Give allergy drops', 'Pad tightly'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'A dramatic, boggy traumatic subconjunctival haemorrhage can hide a scleral rupture, which must be excluded.', 'reasoning_eligible': True},
                {'stem': 'When removing a superficial corneal foreign body, you first instil:', 'options': ['A topical anaesthetic', 'A dilating drop', 'A steroid', 'A miotic'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Topical anaesthetic allows comfortable, safe removal with a moistened cotton bud or fine needle tip.', 'reasoning_eligible': False},
                {'stem': "A 'rust ring' left after removing a metallic corneal foreign body:", 'options': ['May be left for a day or two then re-scraped if needed', 'Must never be touched again', 'Means the eye is beyond saving', 'Requires immediate enucleation'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'A residual rust ring can be left briefly and re-scraped later as it softens; topical antibiotics are given.', 'reasoning_eligible': False},
                {'stem': 'Central retinal artery occlusion (CRAO) presents as:', 'options': ['Sudden, painless, severe loss of vision in one eye', 'Gradual painless blurring over years', 'A painful red eye with discharge', 'Itchy watery eyes'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'CRAO causes sudden painless monocular visual loss and is a time-critical emergency.', 'reasoning_eligible': True},
                {'stem': 'After a chemical burn is irrigated, ongoing treatment typically includes:', 'options': ['Copious preservative-free lubricants and topical antibiotics', 'Nothing further', 'Immediate contact lens wear', 'Swimming to rinse the eye'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'After irrigation, preservative-free lubricants, antibiotics and analgesia support surface healing; no swimming/lenses.', 'reasoning_eligible': False},
                {'stem': 'You should sweep the conjunctival fornices with a moistened cotton bud during chemical-burn care to:', 'options': ['Remove trapped particulate chemical debris', 'Test corneal sensation', 'Dilate the pupil', 'Measure the IOP'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Particulate matter lodged in the fornices continues to burn and must be physically removed.', 'reasoning_eligible': True},
                {'stem': 'Why is a rigid eye shield (not a soft pad) used for a suspected open-globe injury?', 'options': ['It protects the eye without putting pressure on the globe', 'It heals the wound', 'It magnifies vision', 'It irrigates the eye'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'A shield rests on the bony rim and avoids pressure that could extrude intraocular contents.', 'reasoning_eligible': True},
                {'stem': 'For a contact-lens-related corneal abrasion, antibiotic cover should specifically include activity against:', 'options': ['Gram-negative organisms (e.g. Pseudomonas)', 'Only Gram-positive skin flora', 'Fungi only', 'No cover is needed'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Contact-lens-associated defects risk Pseudomonas, so Gram-negative cover (e.g. a fluoroquinolone) is used.', 'reasoning_eligible': False},
                {'stem': 'A construction worker felt something hit his eye while hammering, now has mild ache and watering. The safest approach is to:', 'options': ['Assess carefully and exclude a penetrating/intraocular foreign body before removing anything', 'Rub it out quickly', 'Send him home with no assessment', 'Pad tightly and discharge'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'A high-velocity fragment may have penetrated the eye; exclude an intraocular FB before any removal attempt.', 'reasoning_eligible': True},
            ],
            "hard": [
                {'stem': 'Acids tend to cause more superficial damage than alkalis because acids:', 'options': ['Coagulate surface proteins that form a barrier to deeper penetration', 'Dissolve fats and penetrate deeply', 'Have no chemical effect', 'Only affect the eyelids'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Acid-induced protein coagulation creates a barrier limiting depth; alkalis lack this and penetrate further.', 'reasoning_eligible': False},
                {'stem': 'The Roper-Hall / Dua systems are used to:', 'options': ['Grade the severity of a chemical eye injury', 'Measure refraction', 'Classify cataracts', 'Score dry eye'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'These staging systems grade chemical-burn severity (including limbal ischaemia), guiding prognosis and management.', 'reasoning_eligible': False},
                {'stem': 'Why is hyphaema followed closely for a secondary rise in intraocular pressure?', 'options': ['Raised IOP can cause corneal blood staining and optic-nerve damage', 'It makes the eye itch', 'It changes eye colour', 'It always resolves without any risk'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Blood can obstruct outflow; the resulting IOP spike risks corneal staining and optic-nerve injury.', 'reasoning_eligible': True},
                {'stem': 'In a suspected open-globe injury, which is CONTRAINDICATED before specialist review?', 'options': ['Applying pressure or instilling ointment into the eye', 'Placing a protective shield', 'Keeping the patient calm and nil by mouth', 'Arranging urgent referral'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Pressure, drops/ointment and manipulation risk extruding contents or introducing infection; shield and refer instead.', 'reasoning_eligible': True},
                {'stem': 'Commotio retinae, vitreous haemorrhage and retinal tears are examples of ___ injuries after blunt trauma.', 'options': ['Posterior segment', 'Eyelid', 'Lacrimal', 'Refractive'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Blunt (closed) contusion can damage the posterior segment: commotio retinae, vitreous haemorrhage, retinal tears/detachment.', 'reasoning_eligible': False},
                {'stem': 'The Birmingham Eye Trauma Terminology classifies mechanical globe injuries by:', 'options': ['Open vs closed and blunt vs sharp', 'Colour of the iris', 'Patient age only', 'Spectacle power'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'BETT standardises terms: open vs closed globe, and blunt vs sharp mechanism.', 'reasoning_eligible': False},
                {'stem': 'A patient with sudden painless visual loss and a suspected CRAO needs:', 'options': ['Immediate (time-critical) referral, as retinal survival is measured in minutes-hours', 'A routine clinic booking next month', 'Reassurance and discharge', 'Allergy drops'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': "CRAO is an ocular 'stroke'; the retina tolerates ischaemia only briefly, so referral is immediate.", 'reasoning_eligible': True},
                {'stem': 'Why must you NOT try to neutralise an alkali burn with an acid (or vice versa)?', 'options': ['The reaction generates heat and worsens the injury; use copious bland fluid instead', 'It cures the burn instantly', 'It is the fastest treatment', 'It restores the pH permanently'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Neutralising chemicals releases heat and causes further damage; irrigation uses bland fluid (saline/water).', 'reasoning_eligible': True},
                {'stem': 'Retrobulbar haemorrhage after trauma is dangerous because rising orbital pressure can:', 'options': ['Compress the optic nerve/its blood supply and threaten sight', 'Only cause a black eye', 'Improve vision', 'Cause harmless bruising alone'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'A tense orbital haematoma (orbital compartment syndrome) can compromise the optic nerve and needs urgent decompression.', 'reasoning_eligible': True},
                {'stem': 'When irrigating, a wire lid speculum is used to:', 'options': ['Hold the lids open so fluid reaches the whole surface and fornices', 'Measure eye pressure', 'Remove the lens', 'Test colour vision'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'A speculum keeps the (often spasming) lids open for thorough irrigation of the ocular surface and fornices.', 'reasoning_eligible': False},
                {'stem': 'A patient on warfarin has a large, dramatic subconjunctival haemorrhage but normal vision and no trauma. The usual course is:', 'options': ['Reassurance; it resolves spontaneously over 2-3 weeks (review anticoagulation as advised)', 'Emergency surgery', 'Enucleation', 'Immediate laser'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Spontaneous subconjunctival haemorrhage is benign and self-resolving; underlying anticoagulation/BP may be reviewed.', 'reasoning_eligible': True},
                {'stem': 'Distinguishing a true corneal abrasion from a possible penetrating injury matters because:', 'options': ['A penetrating injury needs the eye shielded and urgent referral, not routine abrasion care', 'They are treated identically', 'Neither needs any care', 'Abrasions are more dangerous'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Missing an open globe is sight-threatening; suspected penetration is shielded and referred, not managed as a simple abrasion.', 'reasoning_eligible': True},
                {'stem': 'Cycloplegic drops are used in hyphaema and severe anterior-segment trauma partly to:', 'options': ['Relieve painful ciliary spasm and rest the eye', 'Lower the blood pressure', 'Dilate for imaging only', 'Numb the cornea'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Cycloplegics ease ciliary spasm (comfort) and reduce iris/ciliary movement while the eye recovers.', 'reasoning_eligible': False},
                {'stem': 'Thermal ocular injuries from explosions or molten metal are managed with awareness that:', 'options': ['They often accompany burns elsewhere and need multidisciplinary (e.g. plastics/ENT) care', 'They never involve other areas', 'They are always trivial', 'They need no referral'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Severe thermal injuries usually coexist with facial/body burns and are co-managed with other specialties.', 'reasoning_eligible': False},
                {'stem': 'For a superficial conjunctival foreign body, a small buried subconjunctival fragment that is inert may:', 'options': ['Sometimes be left alone with topical antibiotic cover', 'Always require major surgery', 'Be ignored without any treatment', 'Be pushed deeper deliberately'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Small, deep, inert subconjunctival foreign bodies may be left, with topical antibiotics, if removal risks more harm.', 'reasoning_eligible': False},
                {'stem': 'The single most important reason to begin chemical-burn irrigation before formal assessment is that:', 'options': ['Ongoing chemical contact causes continuing, preventable tissue destruction', 'It looks efficient', 'It saves paperwork', 'Vision testing is impossible'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Every minute of chemical contact adds damage, so dilution/removal by irrigation takes priority over all else.', 'reasoning_eligible': True},
            ],
        },
        "microbiology_infection": {
            "easy": [
                {'stem': 'Which of these is the smallest infectious agent, unable to reproduce without a host cell?', 'options': ['A virus', 'A bacterium', 'A fungus', 'A protozoan'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Viruses (about 20-300 nm) cannot reproduce by themselves and must infect a host cell.', 'reasoning_eligible': False},
                {'stem': 'Bacteria arranged in grape-like clusters are called:', 'options': ['Staphylococci', 'Streptococci', 'Bacilli', 'Spirochetes'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': "'Staphylo-' means cluster; staphylococci are cocci in clusters (streptococci are in chains).", 'reasoning_eligible': False},
                {'stem': 'A rod-shaped bacterium is described as a:', 'options': ['Bacillus', 'Coccus', 'Spirochete', 'Diplococcus'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Bacillus = rod; coccus = sphere; spirochete = helical spiral.', 'reasoning_eligible': False},
                {'stem': 'The single most important routine action for preventing spread of infection in the clinic is:', 'options': ['Hand hygiene', 'Wearing a hat', 'Dimming the lights', 'Talking quietly'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Hand hygiene (washing or alcohol rub) is the cornerstone of infection prevention.', 'reasoning_eligible': False},
                {'stem': 'Sterilisation is defined as the:', 'options': ['Complete destruction of all microbial life, including spores', 'Removal of visible dirt only', 'Killing of vegetative bacteria but not spores', 'Drying of an instrument'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Sterilisation destroys all microbial life including spores; disinfection does not kill all spores.', 'reasoning_eligible': False},
                {'stem': 'Disinfection differs from sterilisation because disinfection:', 'options': ['Destroys vegetative bacteria but not necessarily spores', 'Destroys absolutely everything including spores', 'Only applies to skin', 'Requires an autoclave'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Disinfection kills vegetative organisms but may not eliminate bacterial spores.', 'reasoning_eligible': False},
                {'stem': 'Viral conjunctivitis (e.g. adenovirus) is important in a busy clinic mainly because it is:', 'options': ['Highly contagious', 'Completely harmless and non-spreading', 'Only seen in newborns', 'Caused by a fungus'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Adenoviral conjunctivitis spreads readily by contact, so strict hygiene and surface cleaning are vital.', 'reasoning_eligible': True},
                {'stem': 'A patient has a red eye with thick purulent (pus-like) discharge. This pattern most suggests:', 'options': ['Bacterial conjunctivitis', 'Allergic conjunctivitis', 'A normal eye', 'Dry eye'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Purulent discharge points to bacterial conjunctivitis; viral is watery and allergic is itchy/watery.', 'reasoning_eligible': False},
                {'stem': 'When instilling a drop, you must avoid touching the dropper tip to the eye or lashes because it:', 'options': ['Contaminates the bottle', 'Improves the drug', 'Speeds absorption', 'Is more comfortable'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Contact contaminates the bottle tip and can transfer organisms between the eye and the bottle.', 'reasoning_eligible': False},
                {'stem': 'Infectious keratitis is an infection of the:', 'options': ['Cornea', 'Eyelid margin', 'Tear sac', 'Retina'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Keratitis is inflammation/infection of the cornea; it can threaten sight.', 'reasoning_eligible': False},
                {'stem': 'A major risk factor for infectious (microbial) keratitis is:', 'options': ['Contact lens wear', 'Wearing sunglasses', 'Reading in good light', 'Blinking normally'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Contact lens wear, trauma and exposure to contaminated water/soil are key keratitis risk factors.', 'reasoning_eligible': False},
                {'stem': 'Which organism, notorious in the eye, can rapidly destroy a cornea and contaminate eye drops?', 'options': ['Pseudomonas aeruginosa', 'Lactobacillus', "Baker's yeast", 'A harmless skin commensal'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Pseudomonas aeruginosa is aggressive; it has caused sight-threatening outbreaks via contaminated drops.', 'reasoning_eligible': False},
                {'stem': 'Trachoma, a leading infectious cause of blindness, is caused by:', 'options': ['Chlamydia trachomatis', 'Adenovirus', 'Candida albicans', 'Staphylococcus epidermidis'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Trachoma is caused by Chlamydia trachomatis, spread by fomites such as shared towels.', 'reasoning_eligible': False},
                {'stem': 'You should perform hand hygiene:', 'options': ['Before and after every patient contact', 'Only at the end of the day', 'Only if hands look dirty', 'Only after lunch'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Hands are decontaminated before and after each patient contact to prevent cross-transmission.', 'reasoning_eligible': False},
                {'stem': "Single-use (unit-dose) eye drop 'minims' are preferred in some settings because they:", 'options': ['Avoid cross-contamination between patients', 'Are cheaper per drop', 'Contain stronger drug', 'Never expire'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Single-use minims are discarded after one patient, removing the multi-dose cross-contamination risk.', 'reasoning_eligible': False},
                {'stem': 'The tonometer prism/tip that touches the cornea must be:', 'options': ['Disinfected (or single-use) between patients', 'Only wiped with a dry tissue', 'Never cleaned', 'Rinsed in tap water only'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Corneal-contact tips are disinfected or single-use to prevent transmitting infection between patients.', 'reasoning_eligible': True},
                {'stem': 'Allergic conjunctivitis is typically:', 'options': ['Bilateral and itchy with watery/ropy discharge', 'Unilateral with thick pus', 'Caused by Chlamydia', 'Cured with antibiotics'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Allergic conjunctivitis is usually bilateral, itchy, with watery or ropy discharge, treated with antihistamines.', 'reasoning_eligible': False},
            ],
            "medium": [
                {'stem': 'The Gram stain separates bacteria into two broad groups based on their:', 'options': ['Cell wall structure (Gram-positive vs Gram-negative)', 'Size only', 'Colour when alive', 'Ability to move'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Gram staining distinguishes thick-walled Gram-positive from Gram-negative organisms, guiding therapy.', 'reasoning_eligible': False},
                {'stem': 'Which is a Gram-negative organism commonly implicated in contact-lens-related keratitis?', 'options': ['Pseudomonas aeruginosa', 'Staphylococcus aureus', 'Streptococcus pneumoniae', 'Staphylococcus epidermidis'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Pseudomonas aeruginosa is a Gram-negative organism strongly linked to contact-lens keratitis.', 'reasoning_eligible': False},
                {'stem': 'A contact-lens wearer presents with a painful red eye and a corneal infiltrate. The safest advice is to:', 'options': ['Stop lens wear and refer urgently for assessment', 'Keep wearing the lenses', 'Rinse the lens in tap water and reinsert', 'Reassure and review in a month'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'A painful red eye with infiltrate in a lens wearer may be microbial keratitis needing urgent review; lenses must stop.', 'reasoning_eligible': True},
                {'stem': 'Two of your patients in a row have adenoviral conjunctivitis. The key infection-control step is to:', 'options': ['Decontaminate hands and clean all contact surfaces/equipment between patients', 'Do nothing extra', 'Turn up the air-conditioning', 'Give everyone antibiotics'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Adenovirus survives on surfaces; hand hygiene plus cleaning shared equipment/surfaces limits spread.', 'reasoning_eligible': True},
                {'stem': 'Fungal keratitis is more likely after:', 'options': ['Trauma from vegetable/organic matter', 'Reading in dim light', 'Watching television', 'Instilling artificial tears'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Filamentous fungi such as Fusarium and Aspergillus cause keratitis, often after organic/vegetative trauma.', 'reasoning_eligible': False},
                {'stem': 'Severe keratitis in a contact-lens wearer who rinses lenses in tap water should raise suspicion of:', 'options': ['Acanthamoeba (a water-borne protozoan)', 'Simple allergy', 'Dry eye only', 'A refractive error'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Acanthamoeba is found in water/soil and causes severe contact-lens-associated keratitis.', 'reasoning_eligible': True},
                {'stem': 'Endophthalmitis is:', 'options': ['Infection involving the interior (inside) of the eye', 'Inflammation of the eyelid margin', 'A blocked tear duct', 'A stye'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Endophthalmitis is a serious infection of the internal ocular tissues, often after surgery/injury.', 'reasoning_eligible': False},
                {'stem': 'A multi-dose eye-drop bottle is found with a cracked, contaminated tip. You should:', 'options': ['Discard it and use a fresh bottle', 'Top it up with saline', 'Keep using it carefully', 'Only use it on one eye'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'A compromised or contaminated bottle must be discarded; contaminated drops can seed sight-threatening infection.', 'reasoning_eligible': True},
                {'stem': 'Standard precautions mean you treat:', 'options': ["Every patient's blood/body fluids as potentially infectious", 'Only known-positive patients as infectious', 'Nobody as infectious', 'Only children as infectious'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Standard precautions apply to all patients, since infection status is often unknown.', 'reasoning_eligible': False},
                {'stem': 'Alcohol-based hand rub is appropriate when hands are:', 'options': ['Visibly clean (not soiled)', 'Visibly soiled with discharge', 'Covered in blood', 'Wet with pus'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Alcohol rub is for visibly clean hands; visibly soiled hands must be washed with soap and water.', 'reasoning_eligible': True},
                {'stem': 'Gloves are worn when there is a risk of contact with:', 'options': ['Blood, body fluids or infected discharge', "A patient's spectacles", 'The waiting-room chairs', 'Clean paperwork'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Gloves protect against exposure to blood/body fluids/discharge and are changed between patients.', 'reasoning_eligible': False},
                {'stem': 'Wearing gloves for a task replaces the need for hand hygiene:', 'options': ['No - hands are still decontaminated before and after gloving', 'Yes - gloves are enough', 'Only if the gloves are new', 'Only on Fridays'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Gloves are not a substitute for hand hygiene; hands are cleaned before donning and after removing gloves.', 'reasoning_eligible': True},
                {'stem': 'Trachoma is spread mainly by:', 'options': ['Fomites such as shared towels and linens, and direct contact', 'Mosquito bites', 'Contaminated needles only', 'Airborne spread over long distances'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Chlamydia trachomatis spreads via fomites (towels, bedding, clothing) and direct contact.', 'reasoning_eligible': False},
                {'stem': 'Bacterial conjunctivitis in adults is commonly caused by which of these?', 'options': ['Staphylococcus aureus and Streptococcus pneumoniae', 'Adenovirus', 'Chlamydia trachomatis only', 'Candida albicans'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Common bacterial conjunctivitis pathogens include S. aureus, S. pneumoniae and H. influenzae.', 'reasoning_eligible': False},
                {'stem': 'After examining a patient with obvious infective discharge, before the next patient you should:', 'options': ['Perform hand hygiene and clean any equipment that touched the patient', 'Move straight to the next patient', 'Only wash hands at lunchtime', 'Reuse the same tissue'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Hand hygiene plus cleaning shared equipment prevents carrying organisms to the next patient.', 'reasoning_eligible': False},
                {'stem': 'Advice to a contact-lens wearer to reduce infection risk includes:', 'options': ['Do not share lenses/cases and clean and disinfect them properly', 'Rinse lenses in tap water', 'Sleep in daily-wear lenses', 'Top up old solution instead of replacing it'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Not sharing lenses/accessories and proper cleaning/disinfection reduce keratitis risk.', 'reasoning_eligible': False},
                {'stem': "Viruses are described as 'obligate intracellular' agents because they:", 'options': ['Can only multiply inside a living host cell', 'Live freely in soil', 'Make their own energy', 'Are a type of fungus'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Viruses lack their own machinery to reproduce and must hijack a host cell.', 'reasoning_eligible': False},
            ],
            "hard": [
                {'stem': 'A spiral (helical) bacterium is classified as a:', 'options': ['Spirochete', 'Coccus', 'Bacillus', 'Diplococcus'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Spirochetes are long, loosely coiled helical bacteria.', 'reasoning_eligible': False},
                {'stem': 'The bacterial structure primarily responsible for protecting the cell against osmotic pressure and giving it shape is the:', 'options': ['Cell wall', 'Flagellum', 'Capsule (slime layer)', 'Spike'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': "The cell wall resists osmotic pressure and determines the bacterium's rigidity and shape.", 'reasoning_eligible': False},
                {'stem': 'Bacteriophages are viruses that specifically infect:', 'options': ['Bacteria', 'Human corneal cells', 'Fungi', 'Red blood cells'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Bacteriophages target bacteria only, not animal cells.', 'reasoning_eligible': False},
                {'stem': 'An outbreak of drug-resistant Pseudomonas eye infections was traced to contaminated artificial tears. The key lesson for practice is that:', 'options': ["Even 'simple' ocular products can transmit dangerous infection if contaminated", 'Artificial tears are always unsafe', 'Pseudomonas is harmless', 'Only surgery spreads infection'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Contaminated eye products can cause severe, even sight-losing, resistant infections - handling and storage matter.', 'reasoning_eligible': True},
                {'stem': 'Why can antimicrobial resistance make an ocular infection like Pseudomonas keratitis particularly dangerous?', 'options': ['Standard antibiotics may fail, allowing rapid corneal damage', 'It makes the infection painless', 'It cures the eye faster', 'It only affects the eyelid'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Resistant strains may not respond to usual antibiotics, so aggressive organisms can destroy the cornea quickly.', 'reasoning_eligible': True},
                {'stem': 'The main purpose of the Gram stain in a keratitis work-up is to:', 'options': ['Give an early clue to the class of organism to guide initial therapy', 'Cure the infection', 'Measure the intraocular pressure', 'Replace culture entirely'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Gram staining rapidly suggests Gram-positive vs Gram-negative organisms, guiding empirical treatment before culture results.', 'reasoning_eligible': True},
                {'stem': 'Fusarium and Aspergillus are examples of organisms causing which type of keratitis?', 'options': ['Fungal keratitis', 'Viral keratitis', 'Chlamydial conjunctivitis', 'Allergic keratitis'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Fusarium and Aspergillus are filamentous fungi that cause fungal keratitis.', 'reasoning_eligible': False},
                {'stem': 'Herpes simplex keratitis is caused by a:', 'options': ['Virus', 'Gram-positive coccus', 'Fungus', 'Protozoan'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Herpes simplex virus causes a viral keratitis, classically producing a dendritic corneal ulcer.', 'reasoning_eligible': False},
                {'stem': 'A colleague sustains a needle-stick injury while handling a sharp. The immediate first action is to:', 'options': ['Encourage bleeding, wash the wound, and report/seek occupational-health advice', 'Ignore it if small', 'Suck the wound', 'Apply the same needle again'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Sharps injuries are washed and reported promptly for risk assessment and post-exposure management.', 'reasoning_eligible': True},
                {'stem': 'Reusable instruments that penetrate or contact sterile tissue require:', 'options': ['Sterilisation (e.g. autoclaving), not just wiping', 'A quick rinse in water', 'Only alcohol wipe on the handle', 'No processing between uses'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Instruments contacting sterile tissue must be sterilised (spores destroyed), typically by autoclave.', 'reasoning_eligible': True},
                {'stem': 'Why are eye preparations used during intraocular surgery preservative-free and sterile?', 'options': ['Open intraocular tissues are vulnerable to infection and to preservative toxicity', 'To reduce cost', 'To dilate the pupil', 'Because preservatives improve them'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Intraocular tissues are exposed, so preparations must be sterile and free of toxic preservatives.', 'reasoning_eligible': True},
                {'stem': 'The clinical value of distinguishing viral, bacterial and allergic conjunctivitis is that it:', 'options': ['Guides correct management and infection-control measures', 'Changes the eye colour', 'Is only academic with no practical use', 'Determines the spectacle prescription'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Different causes need different treatment (antibiotic, symptomatic, antihistamine) and contagion precautions.', 'reasoning_eligible': True},
                {'stem': 'Which practice best limits equipment-borne transmission at the slit lamp between patients?', 'options': ['Wiping the chin-rest and forehead-rest and performing hand hygiene', 'Only adjusting the height', 'Turning the light off', 'Cleaning it once a week'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Patient-contact surfaces (chin/forehead rests) are wiped between patients alongside hand hygiene.', 'reasoning_eligible': False},
                {'stem': 'Normal skin and conjunctival commensal organisms (e.g. Staphylococcus epidermidis) are relevant because they can:', 'options': ['Become opportunistic pathogens if introduced into the eye (e.g. during surgery)', 'Never cause any disease', 'Only live in soil', 'Improve vision'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Commensals like S. epidermidis are usually harmless but can cause infection (e.g. endophthalmitis) if introduced internally.', 'reasoning_eligible': False},
                {'stem': 'Waste sharps (needles, blades) should be disposed of:', 'options': ['Immediately into a puncture-proof sharps bin at the point of use', 'In the normal paper bin', 'By recapping and pocketing them', 'In the general clinical waste bag'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Sharps go straight into a designated puncture-resistant container to prevent injury and infection.', 'reasoning_eligible': False},
                {'stem': 'The overall aim of infection-control practice in the eye clinic is to:', 'options': ['Break the chain of transmission and protect patients and staff', 'Speed up the appointment only', 'Reduce paperwork', 'Improve the room decor'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Infection control interrupts transmission between patients, equipment and staff, keeping everyone safe.', 'reasoning_eligible': False},
            ],
        },
        "anatomy_physiology": {
            "easy": [
                {'stem': 'The outer protective coat of the eyeball is made up of the sclera, cornea and:', 'options': ['Conjunctiva', 'Retina', 'Choroid', 'Iris'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The outer coat = sclera + cornea, with the conjunctiva as its mucous-membrane covering.', 'reasoning_eligible': False},
                {'stem': "The cornea forms which part of the eye's outer coat?", 'options': ['The transparent anterior one-sixth', 'The opaque posterior five-sixths', 'The middle vascular layer', 'The inner receptor layer'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The cornea is the clear anterior 1/6; the sclera is the opaque posterior 5/6.', 'reasoning_eligible': False},
                {'stem': 'The white, opaque posterior five-sixths of the outer coat is the:', 'options': ['Sclera', 'Cornea', 'Choroid', 'Conjunctiva'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The sclera is the tough white fibrous coat that maintains the shape of the eye.', 'reasoning_eligible': False},
                {'stem': 'A distinctive feature of the healthy cornea is that it is:', 'options': ['Avascular (has no blood vessels)', 'Richly supplied with blood vessels', 'Pigmented brown', 'Filled with vitreous gel'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The cornea is avascular and transparent, allowing light to pass and refract.', 'reasoning_eligible': False},
                {'stem': 'The uvea (middle vascular layer) consists of the iris, ciliary body and:', 'options': ['Choroid', 'Retina', 'Sclera', 'Lens'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The uvea = iris + ciliary body + choroid; it nourishes the eye.', 'reasoning_eligible': False},
                {'stem': 'Cones in the retina are chiefly responsible for:', 'options': ['Sharp and colour vision', 'Vision in dim light', 'Producing aqueous humour', 'Draining tears'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Cones give sharp, detailed and colour vision; rods handle dim-light vision.', 'reasoning_eligible': False},
                {'stem': 'A patient reports poor vision in dim light. Which retinal photoreceptors are chiefly involved?', 'options': ['Rods', 'Cones', 'Ganglion cells only', 'Retinal pigment epithelium'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Rods mediate vision in low/dim light, so night-vision difficulty points to rod function.', 'reasoning_eligible': True},
                {'stem': 'The point of sharpest vision, made up only of cones, is the:', 'options': ['Fovea', 'Optic disc', 'Ora serrata', 'Limbus'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The fovea, at the centre of the macula, contains only cones and gives the sharpest vision.', 'reasoning_eligible': False},
                {'stem': "A patient's natural 'blind spot' in the visual field corresponds to the:", 'options': ['Optic disc (no photoreceptors)', 'Fovea', 'Ciliary body', 'Trabecular meshwork'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'The optic disc has no photoreceptors, producing the physiological blind spot.', 'reasoning_eligible': False},
                {'stem': 'The crystalline lens is a transparent biconvex structure located:', 'options': ['Immediately behind the iris', 'In front of the cornea', 'Within the vitreous cavity floor', 'Inside the optic nerve'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The lens sits just behind the iris, suspended from the ciliary body by zonules.', 'reasoning_eligible': False},
                {'stem': 'Loss of transparency (clouding) of the lens is called:', 'options': ['Cataract', 'Glaucoma', 'Pterygium', 'Uveitis'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'A cataract is an opacification of the lens through which light can no longer pass clearly.', 'reasoning_eligible': False},
                {'stem': 'Aqueous humour is produced by the:', 'options': ['Ciliary body (ciliary processes)', 'Lacrimal gland', 'Retina', 'Cornea'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The ciliary processes of the ciliary body secrete aqueous humour.', 'reasoning_eligible': False},
                {'stem': 'Which cranial nerve carries vision from the eye to the brain?', 'options': ['Cranial nerve II (optic)', 'Cranial nerve III (oculomotor)', 'Cranial nerve V (trigeminal)', 'Cranial nerve VII (facial)'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The optic nerve (CN II) transmits visual signals from the retina to the brain.', 'reasoning_eligible': False},
                {'stem': "Testing a patient's eye movements assesses the action of how many extraocular muscles per eye?", 'options': ['Six (four rectus, two oblique)', 'Four', 'Two', 'Eight'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Each eye is moved by six extraocular muscles: four recti and two obliques.', 'reasoning_eligible': False},
                {'stem': 'When assessing the optic disc, the normal cup-to-disc ratio is about:', 'options': ['0.3 or less', '0.9 or more', 'Exactly 1.0', 'Always 0.5'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'A normal cup-to-disc ratio is 0.3 or less; larger ratios may suggest glaucomatous change.', 'reasoning_eligible': False},
                {'stem': 'The vitreous body filling the posterior segment is a gel that is about:', 'options': ['99% water', 'Mostly fat', 'Pure collagen', 'Half blood'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The vitreous is ~99% water with collagen and hyaluronic acid; it supports the globe.', 'reasoning_eligible': False},
                {'stem': 'The outermost layer of the tear film that slows evaporation is the:', 'options': ['Lipid layer', 'Aqueous layer', 'Mucin layer', 'Epithelial layer'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'The outer lipid layer stabilises the tear film and reduces evaporation of the aqueous layer.', 'reasoning_eligible': False},
            ],
            "medium": [
                {'stem': "The colour of a person's iris is determined mainly by its:", 'options': ['Melanin pigment content', 'Blood supply', 'Water content', 'Nerve supply'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Iris colour depends on the amount of melanin pigment.', 'reasoning_eligible': False},
                {'stem': 'Contraction and relaxation of the ciliary muscle changes the lens shape to allow:', 'options': ['Accommodation (focusing near and far)', 'Pupil constriction', 'Tear drainage', 'Aqueous drainage'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The ciliary muscle alters lens curvature for accommodation.', 'reasoning_eligible': False},
                {'stem': 'Aqueous humour drains out of the eye mainly through the trabecular meshwork into the:', 'options': ['Canal of Schlemm', 'Vitreous cavity', 'Lacrimal sac', 'Optic nerve'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': "Aqueous passes through the trabecular meshwork into Schlemm's canal and back to the venous system.", 'reasoning_eligible': False},
                {'stem': 'If the trabecular meshwork/angle drainage becomes obstructed, what tends to happen?', 'options': ['Intraocular pressure rises', 'Intraocular pressure falls', 'The cornea thickens', 'The pupil constricts'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Blocked outflow raises intraocular pressure, a mechanism underlying glaucoma.', 'reasoning_eligible': True},
                {'stem': 'Which is the innermost (deepest) layer of the cornea?', 'options': ['Endothelium', 'Epithelium', "Bowman's layer", 'Stroma'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': "From front to back: epithelium, Bowman's, stroma, Descemet's, endothelium (innermost).", 'reasoning_eligible': False},
                {'stem': "The transparent 'window' you assess first at the slit lamp, which provides most of the eye's focusing power, is the:", 'options': ['Cornea', 'Lens', 'Vitreous', 'Retina'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': "Most of the eye's refractive power comes from the cornea, examined first on the slit lamp.", 'reasoning_eligible': False},
                {'stem': 'A patient cannot turn the right eye outward (abduction). Which nerve/muscle is implicated?', 'options': ['CN VI (abducens) / lateral rectus', 'CN IV (trochlear) / superior oblique', 'CN II (optic) / retina', 'CN VII (facial) / orbicularis'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'The abducens nerve (CN VI) drives the lateral rectus, which abducts the eye.', 'reasoning_eligible': True},
                {'stem': 'A patient has a drooping lid and a dilated pupil. Damage to CN III (oculomotor) fits because it controls:', 'options': ['Eyelid elevation and pupil constriction', 'Only tear production', 'Only the lateral rectus', 'Corneal sensation'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'CN III raises the lid, moves the eye and mediates pupil constriction, so palsy causes ptosis and a dilated pupil.', 'reasoning_eligible': True},
                {'stem': 'The conjunctival section that covers the front surface of the eyeball is the:', 'options': ['Bulbar conjunctiva', 'Palpebral conjunctiva', 'Fornix', 'Tarsal plate'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Bulbar conjunctiva coats the globe; palpebral lines the lids; the fornix is the junction.', 'reasoning_eligible': False},
                {'stem': 'The anterior chamber lies between the cornea and the iris and is filled with:', 'options': ['Aqueous humour', 'Vitreous humour', 'Tears', 'Blood'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The anterior chamber (about 2-3 mm deep centrally) contains aqueous humour.', 'reasoning_eligible': False},
                {'stem': 'During disc assessment a cup-to-disc ratio well above 0.3 should be:', 'options': ['Noted and flagged as a possible glaucomatous change', 'Ignored as always normal', 'Treated immediately with drops by the technician', 'Recorded as a cataract'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'A larger-than-normal cup-to-disc ratio should be documented and flagged for review.', 'reasoning_eligible': True},
                {'stem': "A patient with retinal disease loses the retina's core function, which is to convert focused light into:", 'options': ['Nerve (electrical) impulses', 'Aqueous humour', 'Tears', 'Vitreous gel'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'The retina converts light into nerve impulses sent via the optic nerve to the brain.', 'reasoning_eligible': False},
                {'stem': 'The fovea is located at the centre of the:', 'options': ['Macula', 'Optic disc', 'Ciliary body', 'Cornea'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The fovea is the central depression of the macula, the area of sharpest vision.', 'reasoning_eligible': False},
                {'stem': 'Fluid accumulating between the neurosensory retina and the retinal pigment epithelium causes:', 'options': ['Retinal detachment', 'A cataract', 'A pterygium', 'Corneal oedema'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Separation of the neurosensory retina from the RPE by fluid is a retinal detachment.', 'reasoning_eligible': True},
                {'stem': 'Basal tears are produced constantly and contain lysozyme, which:', 'options': ['Protects against bacterial infection', 'Dilates the pupil', 'Lowers eye pressure', 'Colours the iris'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Lysozyme in basal (lubricating) tears has antibacterial action.', 'reasoning_eligible': False},
                {'stem': 'A patient has epiphora (tears overflowing onto the cheek). The drainage route that may be blocked carries tears from the eye to the:', 'options': ['Nose (via the nasolacrimal duct)', 'Brain', 'Middle ear', 'Salivary gland'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'The nasolacrimal drainage system channels tears from the eye into the nasal cavity; blockage causes epiphora.', 'reasoning_eligible': True},
                {'stem': "A patient's eye waters heavily immediately after dust blows into it. These are:", 'options': ['Reflexive tears (response to an irritant)', 'Basal tears', 'Psychic tears', 'Aqueous humour'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Reflex tears are produced in response to acute irritants such as dust.', 'reasoning_eligible': False},
            ],
            "hard": [
                {'stem': 'Sinus infection can spread into the orbit most easily through which paper-thin orbital wall?', 'options': ['The ethmoid bone (medial wall)', 'The frontal bone (roof)', 'The zygomatic bone (lateral wall)', 'The maxilla (floor)'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'The ethmoid forms the paper-thin medial wall; sinus infection can erode through it to cause orbital cellulitis.', 'reasoning_eligible': True},
                {'stem': 'How many bones form the bony orbit?', 'options': ['Seven', 'Four', 'Two', 'Ten'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Seven bones form the orbit: frontal, sphenoid, zygomatic, maxillary, palatine, ethmoid, lacrimal.', 'reasoning_eligible': False},
                {'stem': 'The floor of the orbit is formed mainly by the:', 'options': ['Maxillary bone', 'Frontal bone', 'Ethmoid bone', 'Sphenoid bone'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The maxilla forms most of the orbital floor; the frontal bone forms the roof.', 'reasoning_eligible': False},
                {'stem': 'The trochlear nerve (CN IV) innervates which extraocular muscle?', 'options': ['Superior oblique', 'Lateral rectus', 'Medial rectus', 'Inferior rectus'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'CN IV supplies the superior oblique, which turns the eye down and laterally.', 'reasoning_eligible': False},
                {'stem': 'Corneal sensation, which triggers the protective blink reflex, is carried by which cranial nerve?', 'options': ['The trigeminal nerve (CN V)', 'The optic nerve (CN II)', 'The abducens nerve (CN VI)', 'The facial nerve (CN VII)'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'CN V (trigeminal) carries touch/pain sensation from the face and cornea.', 'reasoning_eligible': False},
                {'stem': 'Aqueous flows from the ciliary body into the posterior chamber, then through the pupil into the:', 'options': ['Anterior chamber', 'Vitreous cavity', 'Lacrimal sac', 'Optic canal'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Aqueous passes posterior chamber to pupil to anterior chamber, then drains at the angle.', 'reasoning_eligible': False},
                {'stem': 'The lens is suspended from the ciliary body by the:', 'options': ['Ciliary zonules (suspensory ligaments)', 'Optic nerve fibres', 'Trabecular meshwork', 'Rectus muscles'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The zonules (suspensory ligaments) connect the lens to the ciliary body.', 'reasoning_eligible': False},
                {'stem': 'Being avascular, the crystalline lens receives its nutrition from the:', 'options': ['Aqueous humour', 'Retinal artery', 'Vitreous blood vessels', 'Tear film'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The avascular lens is nourished by the surrounding aqueous humour.', 'reasoning_eligible': False},
                {'stem': "Why does a cataract reduce a patient's vision?", 'options': ['The opacified lens no longer lets light pass clearly to the retina', 'It detaches the retina', 'It blocks tear drainage', 'It paralyses the eye muscles'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'A cataract makes the lens opaque, so light cannot reach the retina clearly and vision blurs.', 'reasoning_eligible': True},
                {'stem': 'The posterior chamber lies behind the iris and in front of the:', 'options': ['Lens and its zonules', 'Cornea', 'Optic disc', 'Sclera'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The posterior chamber is the narrow space behind the iris and in front of the lens/zonules.', 'reasoning_eligible': False},
                {'stem': 'Which three cranial nerves are responsible for eye movements?', 'options': ['III, IV and VI', 'II, V and VII', 'I, II and III', 'V, VII and VIII'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Oculomotor (III), trochlear (IV) and abducens (VI) move the eye.', 'reasoning_eligible': False},
                {'stem': 'The optic nerve leaves the orbit to enter the cranium through the:', 'options': ['Optic canal', 'Nasolacrimal duct', 'Inferior orbital fissure', 'Foramen magnum'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The optic nerve passes through the optic canal into the cranium.', 'reasoning_eligible': False},
                {'stem': "Damage to the fovea/macula would most affect which part of a patient's vision?", 'options': ['Central, detailed (reading) vision', 'Peripheral vision only', 'Colour perception only in the dark', 'Eye movement'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'The fovea/macula serves central, detailed vision, so damage impairs reading and fine tasks.', 'reasoning_eligible': True},
                {'stem': 'Which muscle closes the eyelids during blinking?', 'options': ['Orbicularis oculi', 'Levator palpebrae superioris', 'Superior rectus', 'Ciliary muscle'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'The circular orbicularis oculi closes the lids; the levator opens the upper lid.', 'reasoning_eligible': False},
                {'stem': 'Parallel light rays from a distant object form what kind of image on the retina?', 'options': ['A sharp, inverted image', 'An upright, magnified image', 'A blurred upright image', 'No image at all'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Light through the cornea, aqueous, lens and vitreous forms a sharp inverted image on the retina.', 'reasoning_eligible': False},
                {'stem': 'The firm structural support that gives the eyelid its shape is provided by the:', 'options': ['Tarsal plate', 'Orbicularis muscle', 'Conjunctiva', 'Cornea'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': "The tarsal plate provides the eyelid's structural framework.", 'reasoning_eligible': False},
            ],
        },
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
                {'stem': 'Within how long must a Triage Category 1 case be seen?', 'options': ['Within 10 minutes', 'Within 30 minutes', 'Within 60 minutes', 'Within 2 hours'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Category 1 is the most urgent — it must be seen within 10 minutes (e.g. chemical burn, CRAO).', 'reasoning_eligible': False},
                {'stem': 'Within how long must a Triage Category 2 case be seen?', 'options': ['Within 10 minutes', 'Within 30 minutes', 'Within 60 minutes', 'Within 2 hours'], 'correct': [1], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Category 2 cases must be seen within 30 minutes.', 'reasoning_eligible': False},
                {'stem': 'Within how long must a Triage Category 3 case be seen?', 'options': ['Within 10 minutes', 'Within 30 minutes', 'Within 60 minutes', 'Within 2 hours'], 'correct': [2], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Category 3 cases must be seen within 60 minutes.', 'reasoning_eligible': False},
                {'stem': 'Within how long must a Triage Category 4 case be seen?', 'options': ['Within 10 minutes', 'Within 30 minutes', 'Within 60 minutes', 'Within 2 hours'], 'correct': [3], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Category 4 covers minor or chronic conditions and must be seen within 2 hours.', 'reasoning_eligible': False},
                {'stem': 'Which triage category does conjunctivitis fall under?', 'options': ['Category 1', 'Category 2', 'Category 3', 'Category 4'], 'correct': [3], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Conjunctivitis is a minor/chronic condition — Category 4 (within 2 hours).', 'reasoning_eligible': False},
                {'stem': 'What is the first action for a chemical eye burn?', 'options': ['Check visual acuity', 'Start irrigation immediately', 'Instil anaesthetic drops', 'Measure IOP'], 'correct': [1], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Chemical burns are Category 1 — start irrigation immediately to wash out the chemical and limit ongoing damage.', 'reasoning_eligible': True},
                {'stem': 'How many triage categories are there in the SNEC system?', 'options': ['2', '3', '4', '5'], 'correct': [2], 'qtype': 'single', 'kind': 'theory', 'explanation': 'There are 4 triage categories: Category 1 (within 10 min), Category 2 (within 30 min), Category 3 (within 60 min), and Category 4 (within 2 hours).', 'reasoning_eligible': False},
                {'stem': 'A stable chronic glaucoma review is which triage category?', 'options': ['Category 1', 'Category 2', 'Category 3', 'Category 4'], 'correct': [3], 'qtype': 'single', 'kind': 'practical', 'explanation': 'A stable chronic glaucoma review is routine — Category 4 (within 2 hours).', 'reasoning_eligible': False},
                {'stem': 'Which triage category requires the patient to be seen most urgently?', 'options': ['Category 4', 'Category 3', 'Category 2', 'Category 1'], 'correct': [3], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Category 1 is the most urgent — the patient must be seen within 10 minutes.', 'reasoning_eligible': False},
                {'stem': "A welder's flash burn is which triage category?", 'options': ['Category 1', 'Category 2', 'Category 3', 'Category 4'], 'correct': [2], 'qtype': 'single', 'kind': 'practical', 'explanation': "A welder's flash burn (painful red eye / photokeratitis) is Category 3 (within 60 minutes).", 'reasoning_eligible': True},
                {'stem': 'A total hyphaema is which triage category?', 'options': ['Category 1', 'Category 2', 'Category 3', 'Category 4'], 'correct': [1], 'qtype': 'single', 'kind': 'practical', 'explanation': 'A total hyphaema (blood filling the anterior chamber) is Category 2 (within 30 minutes).', 'reasoning_eligible': False},
                {'stem': 'Central retinal artery occlusion (CRAO) with VA <6/60 is which triage category?', 'options': ['Category 1', 'Category 2', 'Category 3', 'Category 4'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'CRAO with VA <6/60 is a sight-threatening emergency — Category 1 (within 10 minutes).', 'reasoning_eligible': True},
                {'stem': 'A construction worker walks in saying a drop of drain-cleaner (alkali) splashed into his eye 3 minutes ago. Before anything else you should:', 'options': ['Start copious irrigation immediately - even before checking vision', 'Sit him down to wait his turn', 'Take his full history first', 'Send him for a fundus photo'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Chemical injury (especially alkali) demands immediate copious irrigation before vision testing - it is Category 1.', 'reasoning_eligible': True},
                {'stem': 'A patient telephones saying they just splashed bleach in their eye at home. The best triage advice is to:', 'options': ['Start rinsing the eye with clean water at home NOW and come in immediately', 'Wait and see if it settles by tomorrow', 'Apply antibiotic ointment and rest', 'Book a routine appointment next week'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Immediate irrigation at the scene limits damage; a chemical burn is a time-critical Category 1 emergency.', 'reasoning_eligible': True},
                {'stem': 'A patient arrives with a metal object embedded and protruding from the eye after a workshop accident. At triage you should:', 'options': ['Shield the eye (no pad, no pressure), do not remove the object, and escalate urgently', 'Pull the object out gently', 'Pad the eye firmly', 'Instil anaesthetic drops and send home'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'A protruding foreign body signals an open globe: never remove it, avoid pressure, apply a shield and refer immediately.', 'reasoning_eligible': True},
                {'stem': 'A patient reports a painless red patch on the white of one eye after coughing, with normal vision and no pain. This is most likely:', 'options': ['A subconjunctival haemorrhage - reassure, low urgency', 'A chemical burn needing irrigation', 'Acute glaucoma', 'An open globe injury'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'A spontaneous subconjunctival haemorrhage with normal vision and no pain resolves in 2-3 weeks; it is a low-urgency, reassurance case.', 'reasoning_eligible': True},
                {'stem': "The 'golden rule' of managing ocular trauma at triage is to treat:", 'options': ['Life-threatening injuries first, then sight-threatening injuries', 'The most painful eye first', 'Whoever arrived first', 'The youngest patient first'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Life comes before sight: address life-threatening injuries first, then sight-threatening ones, then the rest.', 'reasoning_eligible': False},
            ],
            "medium": [
                {'stem': 'Which triage category is a chemical burn, and what is the first action?', 'options': ['Category 1 — start irrigation immediately', 'Category 2 — check visual acuity first', 'Category 3 — instil anaesthetic then irrigate', 'Category 1 — measure IOP first'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Chemical burns are Category 1 (within 10 minutes). The first action is immediate irrigation to wash out the chemical and limit damage.', 'reasoning_eligible': True},
                {'stem': 'A patient with previous retinal history reports a sudden increase in floaters. Which triage category?', 'options': ['Category 1', 'Category 2', 'Category 3', 'Category 4'], 'correct': [2], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Suspect retinal detachment — Category 3 (within 60 minutes).', 'reasoning_eligible': True},
                {'stem': 'Which of the following conditions is Triage Category 1?', 'options': ['Conjunctivitis', 'Stable glaucoma review', 'Chemical eye burn', "Welder's flash burn"], 'correct': [2], 'qtype': 'single', 'kind': 'theory', 'explanation': "Chemical eye burn is Category 1 (within 10 minutes). Conjunctivitis and stable glaucoma are Category 4; a welder's flash burn is Category 3.", 'reasoning_eligible': False},
                {'stem': 'A patient presents with sudden painless loss of vision in one eye. What is the appropriate triage action?', 'options': ['Category 4 — schedule routine review', 'Category 1 — escalate immediately', 'Category 3 — see within 60 minutes', 'Category 2 — see within 30 minutes'], 'correct': [1], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Sudden painless loss of vision (e.g. CRAO, vitreous haemorrhage) is a sight-threatening emergency — Category 1, escalate immediately.', 'reasoning_eligible': True},
                {'stem': 'Why must a chemical eye injury be irrigated before checking visual acuity?', 'options': ['Because irrigation improves visual acuity', 'To wash out the chemical and limit ongoing damage', 'Because VA cannot be measured with an injured eye', 'To reduce intraocular pressure first'], 'correct': [1], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Chemical burns cause ongoing tissue damage every second — irrigation must begin immediately to wash out the chemical. VA can wait.', 'reasoning_eligible': True},
                {'stem': 'Which of the following are Triage Category 2 conditions?', 'options': ['Total hyphaema', 'Chemical burn', 'Conjunctivitis', 'Stable chronic glaucoma review'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Total hyphaema is Category 2 (within 30 minutes). Chemical burn is Category 1; conjunctivitis and stable glaucoma are Category 4.', 'reasoning_eligible': False},
                {'stem': 'A patient with acute angle-closure glaucoma presents with severe eye pain, nausea, and a hazy cornea. Which triage category?', 'options': ['Category 4', 'Category 3', 'Category 2', 'Category 1'], 'correct': [3], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Acute angle-closure glaucoma is a sight-threatening emergency — Category 1 (within 10 minutes).', 'reasoning_eligible': False},
                {'stem': 'A painful red eye with no discharge or visual loss is likely which triage category?', 'options': ['Category 1', 'Category 2', 'Category 3', 'Category 4'], 'correct': [2], 'qtype': 'single', 'kind': 'practical', 'explanation': 'A painful red eye without vision-threatening features (e.g. flash burn, mild keratitis) is typically Category 3 (within 60 minutes).', 'reasoning_eligible': False},
                {'stem': 'What distinguishes Category 1 from Category 2 in terms of clinical urgency?', 'options': ['Category 1 is seen within 10 minutes; Category 2 within 30 minutes', 'Category 1 needs a doctor; Category 2 does not', 'Category 1 requires surgery; Category 2 does not', 'There is no difference'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Category 1 must be seen within 10 minutes (sight/life-threatening); Category 2 within 30 minutes (urgent but not immediately sight-threatening).', 'reasoning_eligible': False},
                {'stem': 'Select ALL conditions that are Triage Category 3 (seen within 60 minutes).', 'options': ['Sudden increase in floaters with retinal history', "Welder's flash burn", 'Chemical eye burn', 'Total hyphaema'], 'correct': [0, 1], 'qtype': 'multi', 'kind': 'practical', 'explanation': "Sudden floaters (suspect retinal detachment) and welder's flash burn are both Category 3 (within 60 minutes). Chemical burn is Category 1; total hyphaema is Category 2.", 'reasoning_eligible': True},
                {'stem': 'A patient on anticoagulants has a partial hyphaema after blunt trauma. What is the primary triage concern?', 'options': ['The hyphaema may worsen due to bleeding risk', 'Anticoagulants prevent healing', 'The patient should stop the anticoagulant immediately', 'No special concern — treat as Category 4'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Anticoagulants increase bleeding risk, so the hyphaema may enlarge. Escalate urgently (do NOT stop anticoagulants without medical instruction).', 'reasoning_eligible': False},
                {'stem': 'In triage, what is the purpose of assigning a category?', 'options': ['To prioritise patients by clinical urgency', 'To decide which doctor sees the patient', 'To determine the treatment plan', 'To calculate the consultation fee'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Triage categories prioritise patients so the most urgent cases are seen first.', 'reasoning_eligible': False},
                {'stem': 'A cataract-surgery patient from 3 days ago returns with a sudden painful red eye and dropping vision. The triage priority is:', 'options': ['Treat as a Category 1 emergency - possible endophthalmitis', 'Routine post-op review', 'Reassure and rebook next month', 'Give lubricants and discharge'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Pain, redness and falling vision after intraocular surgery suggest endophthalmitis - a blinding emergency needing same-hour attention.', 'reasoning_eligible': True},
                {'stem': 'A contact-lens wearer has a painful red eye with a white spot on the cornea and worsening vision. The correct triage is:', 'options': ['Urgent - possible microbial keratitis, must be seen quickly', 'Routine, likely simple dry eye', 'Reassure, review in a month', 'No action needed'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'A corneal infiltrate/ulcer in a lens wearer is sight-threatening microbial keratitis and needs prompt review and cultures.', 'reasoning_eligible': True},
                {'stem': 'Why is an ALKALI burn generally triaged as more dangerous than an ACID burn of similar volume?', 'options': ['Alkalis saponify cell-membrane fats and penetrate deeper, while acids coagulate proteins forming a barrier', 'Acids are always painless', 'Alkalis never reach the cornea', 'Acids penetrate deeper than alkalis'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Alkalis dissolve membrane lipids and penetrate deeply; acids coagulate surface proteins that limit penetration - so alkali burns are usually worse.', 'reasoning_eligible': True},
                {'stem': 'A patient after blunt trauma has severe pain, proptosis, a very tense eye and a relative afferent pupillary defect. The triage concern is:', 'options': ['Retrobulbar haemorrhage - a sight-threatening emergency needing immediate action', 'A simple bruise, review next week', 'Allergic conjunctivitis', 'Presbyopia'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Proptosis, a tense orbit, pain and RAPD after trauma indicate retrobulbar haemorrhage, which may need urgent lateral canthotomy/cantholysis.', 'reasoning_eligible': True},
                {'stem': 'When continuing irrigation of a chemical eye burn, you should keep flushing until:', 'options': ['The tear-film pH returns to neutral (around 7.0)', 'Exactly 2 minutes have passed', 'The patient stops blinking', 'The eye looks white'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Irrigate copiously (at least 20 minutes), sweeping the fornices, and continue until the pH normalises to about 7.0.', 'reasoning_eligible': True},
            ],
            "hard": [
                {'stem': 'Select ALL conditions that are Triage Category 1 (seen within 10 minutes).', 'options': ['Chemical eye burn', 'Central retinal artery occlusion (CRAO)', 'Conjunctivitis', 'Stable chronic glaucoma review'], 'correct': [0, 1], 'qtype': 'multi', 'kind': 'practical', 'explanation': 'Chemical burns and CRAO are sight-threatening emergencies needing treatment within minutes. Conjunctivitis and a stable glaucoma review are routine (Category 4).', 'reasoning_eligible': True},
                {'stem': 'A patient presents with sudden painless vision loss, VA <6/60, and a cherry-red spot on fundoscopy. What is the most likely diagnosis and triage category?', 'options': ['CRAO — Category 1', 'Retinal detachment — Category 3', 'Vitreous haemorrhage — Category 2', 'Optic neuritis — Category 3'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'A cherry-red spot with sudden painless vision loss and VA <6/60 is classic for CRAO — Category 1 (within 10 minutes).', 'reasoning_eligible': True},
                {'stem': 'A patient splashed an unknown chemical in both eyes 5 minutes ago. As the first responder, what do you do?', 'options': ['Start bilateral irrigation immediately', 'Identify the chemical before irrigating', 'Check visual acuity to assess severity', 'Instil anaesthetic drops and wait for the doctor'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Chemical burns are Category 1. Irrigate immediately — do not delay to identify the chemical or check VA. Every second counts.', 'reasoning_eligible': True},
                {'stem': 'Why is acute angle-closure glaucoma classified as Category 1 rather than Category 2?', 'options': ['It can cause irreversible vision loss within minutes if untreated', 'It is always bilateral', 'It only occurs in elderly patients', 'It requires surgery within 30 minutes'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Acute angle-closure glaucoma causes rapid, irreversible optic nerve damage from high IOP. It must be seen within 10 minutes (Category 1).', 'reasoning_eligible': True},
                {'stem': 'Rank the following from most urgent to least urgent triage category.', 'options': ['Chemical burn > Total hyphaema > Flash burn > Conjunctivitis', 'Total hyphaema > Chemical burn > Flash burn > Conjunctivitis', 'Flash burn > Chemical burn > Conjunctivitis > Total hyphaema', 'Conjunctivitis > Flash burn > Total hyphaema > Chemical burn'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Chemical burn = Cat 1 (10 min) > Total hyphaema = Cat 2 (30 min) > Flash burn = Cat 3 (60 min) > Conjunctivitis = Cat 4 (2 hr).', 'reasoning_eligible': False},
                {'stem': 'A myopic patient with a history of retinal tears reports a sudden shower of floaters and a curtain across their vision. What triage category and why?', 'options': ['Category 3 — suspect retinal detachment', 'Category 4 — floaters are benign', 'Category 1 — immediate surgery needed', 'Category 2 — moderate urgency'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'A curtain plus shower of floaters in a myope with retinal history strongly suggests retinal detachment — Category 3 (within 60 minutes).', 'reasoning_eligible': False},
                {'stem': 'Two patients arrive simultaneously: one with conjunctivitis and one with a chemical burn. Who is seen first and why?', 'options': ['Chemical burn — Category 1 is more urgent than Category 4', 'Conjunctivitis — it arrived first', 'Both at the same time', 'Chemical burn — but only after checking VA on both'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Chemical burn is Category 1 (within 10 minutes); conjunctivitis is Category 4 (within 2 hours). The chemical burn patient is seen first.', 'reasoning_eligible': False},
                {'stem': 'Select ALL features that would make you assign Category 1 to a red eye.', 'options': ['Severe pain with nausea, vomiting, and a fixed mid-dilated pupil', 'Chemical exposure requiring irrigation', 'Mild itchiness with watery discharge', 'Marked discharge with no pain'], 'correct': [0, 1], 'qtype': 'multi', 'kind': 'practical', 'explanation': 'Acute angle-closure glaucoma (severe pain, nausea, fixed dilated pupil) and chemical exposure are both Category 1. Mild itchiness and painless discharge are lower categories.', 'reasoning_eligible': True},
                {'stem': 'A patient presents after blunt trauma with blood filling the entire anterior chamber. What is the condition and its triage category?', 'options': ['Total hyphaema — Category 2', 'Hypopyon — Category 1', 'Subconjunctival haemorrhage — Category 4', 'Vitreous haemorrhage — Category 3'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Blood in the anterior chamber = hyphaema. A total hyphaema is Category 2 (within 30 minutes).', 'reasoning_eligible': False},
                {'stem': 'Which statement about triage categories is correct?', 'options': ['Category 1 and 2 both require the patient to be seen within 30 minutes', 'Category 3 is for minor or chronic conditions', 'Category 4 patients must be seen within 2 hours', "Categories are assigned based on the patient's age"], 'correct': [2], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Category 4 = within 2 hours (minor/chronic). Category 1 = within 10 min (not 30). Category 3 = within 60 min (not minor). Categories are based on clinical urgency, not age.', 'reasoning_eligible': False},
                {'stem': 'Why is it important not to delay irrigation for a chemical burn even if the patient is in severe pain?', 'options': ['The chemical causes ongoing tissue damage every second — irrigation must not be delayed', 'Pain will resolve once irrigation starts', 'The chemical neutralises itself after 10 minutes', 'Irrigation is only effective within the first minute'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Chemical burns cause progressive tissue destruction. Immediate irrigation limits damage regardless of pain level.', 'reasoning_eligible': False},
                {'stem': 'A patient with uveitis (iritis) presents with photophobia, a small pupil, and moderate pain. What triage category?', 'options': ['Category 1', 'Category 2', 'Category 3', 'Category 4'], 'correct': [1], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Uveitis is an ocular emergency. With moderate pain and photophobia, it is Category 2 (within 30 minutes) unless vision is severely threatened, which would escalate to Category 1.', 'reasoning_eligible': False},
                {'stem': 'Three patients arrive together: (A) a routine cataract review, (B) an alkali splash 2 minutes ago, (C) a stye. Correct order of attention is:', 'options': ['B first (irrigate the chemical burn), then A and C by routine order', 'A first because booked', 'C first because painful', 'Whoever complains loudest'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'The chemical burn is a Category 1, time-critical emergency; it is irrigated immediately, ahead of routine and minor cases.', 'reasoning_eligible': True},
                {'stem': 'A patient after a fall has diplopia on looking up, a numb cheek, and the eye appears sunken. This picture suggests:', 'options': ['An orbital (blow-out) floor fracture with possible muscle entrapment - needs urgent assessment', 'Simple conjunctivitis', 'A refractive error', 'Presbyopia'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Diplopia in up-gaze, infraorbital numbness and enophthalmos indicate an orbital floor fracture; entrapment requires prompt referral.', 'reasoning_eligible': True},
                {'stem': 'When you suspect an open-globe (penetrating) injury, which set of triage actions is correct?', 'options': ['No drops/ointment, no pressure, apply a rigid shield, keep patient nil-by-mouth and escalate', 'Pad firmly and give ointment', 'Remove any foreign body and irrigate hard', 'Reassure and book a routine slot'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'For a suspected ruptured globe: avoid pressure and drops, shield (not pad) the eye, keep NBM in case of surgery, and refer immediately.', 'reasoning_eligible': True},
                {'stem': 'Which combination of examination signs most strongly indicates a ruptured (open) globe rather than a simple contusion?', 'options': ['A peaked pupil, prolapsing uveal tissue, shallow anterior chamber and lost red reflex', 'A round reactive pupil and clear cornea', 'Mild lid bruising alone', 'A subconjunctival haemorrhage that is resolving'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'A peaked pupil, uveal prolapse, shallow AC and loss of the red reflex point to globe rupture - shield and refer, do not manipulate.', 'reasoning_eligible': True},
            ],
        },
        "ocular_emergencies": {
            "easy": [
                {'stem': 'What is a hyphaema?', 'options': ['Blood in the anterior chamber', 'Pus in the anterior chamber', 'Blood in the vitreous cavity', 'Fluid under the retina'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'A hyphaema is blood in the anterior chamber — the front part of the eye, between the cornea and iris.', 'reasoning_eligible': False},
                {'stem': 'What is a hypopyon?', 'options': ['Pus in the anterior chamber', 'Blood in the anterior chamber', 'A clear fluid level in the eye', 'Swelling of the eyelid'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'A hypopyon is pus in the anterior chamber — a sign of infection or severe inflammation.', 'reasoning_eligible': False},
                {'stem': 'What is the classic pupil sign in acute angle-closure glaucoma?', 'options': ['A fixed, mid-dilated, oval pupil', 'A small, constricted pupil', 'An irregular, peaked pupil', 'A normal, reactive pupil'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Acute angle-closure glaucoma classically shows a fixed, mid-dilated (large, oval) pupil.', 'reasoning_eligible': False},
                {'stem': 'Is acute glaucoma considered an ocular emergency?', 'options': ['Yes — it can cause rapid, permanent vision loss', 'No — it is a routine chronic condition', 'Only if both eyes are affected', 'Only in patients over 70'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Acute glaucoma is one of the recognised ocular emergencies — high pressure can damage the optic nerve within hours.', 'reasoning_eligible': False},
                {'stem': 'Which finding in the anterior chamber points to infection?', 'options': ['Hypopyon (pus)', 'Hyphaema (blood)', 'A deep, quiet chamber', 'A clear cornea'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'A hypopyon (pus in the anterior chamber) signals infection or severe inflammation.', 'reasoning_eligible': False},
                {'stem': "A chemical is splashed into a patient's eye. What is the single most important first action?", 'options': ['Start irrigation immediately', 'Measure the intraocular pressure', 'Check the visual acuity first', 'Identify the exact chemical'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Irrigate immediately to wash out the chemical and limit ongoing tissue damage — everything else waits.', 'reasoning_eligible': True},
                {'stem': 'A welder has painful, red, watering eyes a few hours after work. What is the likely cause?', 'options': ['Flash burn (photokeratitis) from UV exposure', 'Acute angle-closure glaucoma', 'Bacterial conjunctivitis', 'A hyphaema'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'UV exposure from welding causes a flash burn (photokeratitis); the pain is typically delayed by a few hours.', 'reasoning_eligible': False},
                {'stem': 'Which of these is NOT one of the recognised ocular emergencies?', 'options': ['Presbyopia', 'Chemical injury', 'Acute glaucoma', 'Painless sudden loss of vision'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Presbyopia is a normal age-related loss of near focus, not an emergency. Chemical injury, acute glaucoma and sudden painless vision loss are all ocular emergencies.', 'reasoning_eligible': False},
                {'stem': "What does 'photophobia' mean?", 'options': ['Sensitivity to light', 'Fear of the dark', 'Loss of colour vision', 'Double vision'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Photophobia means sensitivity to (discomfort in) light — common in uveitis and corneal problems.', 'reasoning_eligible': False},
                {'stem': 'Severe eye pain with headache, nausea and vomiting should make you suspect which emergency?', 'options': ['Acute angle-closure glaucoma', 'Conjunctivitis', 'Presbyopia', 'A subconjunctival haemorrhage'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Severe pain with headache, nausea and vomiting is the classic picture of acute angle-closure glaucoma.', 'reasoning_eligible': False},
                {'stem': 'How does the pupil typically appear in uveitis (iritis)?', 'options': ['Small or normal in size', 'Large, oval and fixed', 'Irregular and white', 'Always perfectly round and dilated'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'In uveitis the pupil is usually small or normal — unlike acute glaucoma, where it is large, oval and fixed.', 'reasoning_eligible': False},
                {'stem': 'A patient reports sudden, painless, total loss of vision in one eye that came on within seconds. This should be treated as:', 'options': ['A time-critical emergency (e.g. central retinal artery occlusion)', 'A routine refraction', 'A minor dry-eye problem', 'A cosmetic concern'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Sudden painless monocular vision loss (CRAO/retinal detachment/vascular event) is an emergency needing immediate escalation.', 'reasoning_eligible': True},
                {'stem': "A grinder operator feels something 'scratching' under his upper lid with tearing and foreign-body sensation. The key examination step is to:", 'options': ['Evert the upper lid to look for a sub-tarsal foreign body', 'Send him home with lubricants', 'Dilate the pupil first', 'Measure near acuity only'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Vertical linear corneal scratches suggest a foreign body under the upper lid; everting the lid is essential to find and remove it.', 'reasoning_eligible': True},
                {'stem': 'A corneal abrasion is best demonstrated on the cornea using:', 'options': ['Fluorescein staining under blue light', 'A colour vision chart', 'An Amsler grid', 'A pinhole'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': "Fluorescein pools in the epithelial defect and glows green under cobalt-blue light, showing the abrasion's sharp borders.", 'reasoning_eligible': False},
                {'stem': 'Alkali chemical burns (e.g. bleach, cement) are considered more dangerous than acid burns because they:', 'options': ['Penetrate deeper into the eye', 'Are always painless', 'Only affect the eyelids', 'Cannot damage the cornea'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Alkalis saponify membrane fats and penetrate deeply, whereas acids coagulate surface proteins that limit penetration.', 'reasoning_eligible': False},
                {'stem': 'A patient arrives after a squash ball struck the eye, now with blood layering in the front of the eye. This is a:', 'options': ['Hyphaema', 'Hypopyon', 'Subconjunctival haemorrhage', 'Chalazion'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Blood in the anterior chamber after blunt trauma is a hyphaema; it needs rest and IOP monitoring to prevent complications.', 'reasoning_eligible': True},
                {'stem': 'When an open (penetrating) globe injury is suspected, you should NOT:', 'options': ['Apply pressure, drops or ointment, or remove a protruding object', 'Apply a protective shield', 'Keep the patient calm', 'Escalate urgently'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'With a suspected ruptured globe, avoid pressure, drops and removing any object; shield the eye and refer immediately.', 'reasoning_eligible': True},
            ],
            "medium": [
                {'stem': 'Why must a chemical eye injury be irrigated before checking the visual acuity?', 'options': ['The chemical keeps damaging tissue every second — irrigation cannot wait', 'Irrigation improves the visual acuity reading', 'Visual acuity cannot be measured in an injured eye', 'Irrigation lowers the eye pressure first'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'A chemical burn causes ongoing tissue damage every second. Immediate irrigation washes it out and limits the damage; visual acuity can wait.', 'reasoning_eligible': True},
                {'stem': 'How does the pupil help separate acute glaucoma from uveitis?', 'options': ['Acute glaucoma: large, oval, fixed; uveitis: small or normal', 'Acute glaucoma: small; uveitis: large and fixed', 'Both have a large, fixed pupil', 'The pupil is normal in both'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Acute angle-closure glaucoma gives a large, oval, fixed pupil; uveitis gives a small or normal pupil. The pupil is a key distinguishing sign.', 'reasoning_eligible': True},
                {'stem': 'Select ALL features that point to acute angle-closure glaucoma rather than a simple red eye.', 'options': ['Severe pain with nausea and vomiting', 'Haloes around lights and a hazy cornea', 'A fixed, mid-dilated pupil', 'Mild itch with watery discharge'], 'correct': [0, 1, 2], 'qtype': 'multi', 'kind': 'practical', 'explanation': 'Nausea/vomiting, haloes with a hazy cornea, and a fixed mid-dilated pupil all point to acute angle-closure glaucoma. Mild itch with watery discharge suggests simple conjunctivitis.', 'reasoning_eligible': True},
                {'stem': "Why is the pain from a welder's flash burn usually delayed by several hours?", 'options': ['The UV damage to the corneal surface takes time to become symptomatic', 'Welders always wear protection during work', 'The eye numbs itself during exposure', 'Flash burns do not actually cause pain'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'UV exposure damages the corneal surface (photokeratitis), but the painful symptoms characteristically appear a few hours later.', 'reasoning_eligible': False},
                {'stem': 'A patient on warfarin develops a hyphaema after blunt trauma. What is the main added concern?', 'options': ['The anticoagulant raises the risk of further bleeding', 'The anticoagulant prevents the eye from healing', 'Warfarin makes the pupil dilate', 'There is no added concern'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Anticoagulants increase the risk of re-bleeding, so a traumatic hyphaema may worsen. Escalate; never stop the anticoagulant without medical instruction.', 'reasoning_eligible': False},
                {'stem': 'A hypopyon in a contact-lens wearer with a painful red eye most suggests what?', 'options': ['A serious corneal infection (microbial keratitis)', 'Simple allergic conjunctivitis', 'Presbyopia', 'A normal finding in lens wearers'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Pus in the anterior chamber (hypopyon) with a painful red eye in a lens wearer raises concern for sight-threatening microbial keratitis — escalate.', 'reasoning_eligible': True},
                {'stem': 'Sudden painless loss of vision in one eye — is this an emergency?', 'options': ['Yes — it is one of the recognised ocular emergencies', 'No — painless problems are never urgent', 'Only if the patient also has pain', 'Only if vision returns on its own'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Painless sudden loss of vision (e.g. CRAO, vitreous haemorrhage) is a recognised ocular emergency and must be escalated quickly.', 'reasoning_eligible': False},
                {'stem': 'Which red-flag combination most strongly suggests acute angle-closure glaucoma in a red, painful eye?', 'options': ['Hazy cornea, haloes, and a fixed mid-dilated pupil', 'Watery discharge with a normal pupil', 'Itchy lids with crusting', 'Gritty feeling that clears on blinking'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'A hazy cornea, haloes around lights and a fixed mid-dilated pupil together strongly suggest acute angle-closure glaucoma.', 'reasoning_eligible': False},
                {'stem': 'Why is a painful third-nerve (CN III) palsy treated as an emergency?', 'options': ['It may signal a compressive lesion such as an aneurysm', 'It always means the patient has glaucoma', 'It is only a cosmetic concern', 'It resolves within minutes on its own'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'A painful CN III palsy can be caused by a compressive lesion (e.g. an aneurysm), so it needs urgent assessment.', 'reasoning_eligible': True},
                {'stem': 'Select ALL of the following that are recognised ocular emergencies.', 'options': ['Chemical injury', 'Acute glaucoma', 'Uveitis', 'Presbyopia'], 'correct': [0, 1, 2], 'qtype': 'multi', 'kind': 'theory', 'explanation': 'Chemical injury, acute glaucoma and uveitis are all ocular emergencies. Presbyopia is a normal age-related change, not an emergency.', 'reasoning_eligible': False},
                {'stem': 'A patient reports severe pain, blurred vision and seeing haloes around lights this evening. What should you do?', 'options': ['Treat as a possible acute glaucoma and escalate urgently', 'Reassure and book a routine appointment', 'Give reading glasses', 'Advise warm compresses and discharge home'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Severe pain, blurred vision and haloes suggest acute angle-closure glaucoma — a sight-threatening emergency that must be escalated urgently.', 'reasoning_eligible': False},
                {'stem': 'A patient 4 days after cataract surgery returns with increasing pain, redness, a hypopyon and worsening vision. The priority is:', 'options': ['Immediate escalation for suspected endophthalmitis', 'A routine post-op check next week', 'Reassurance and lubricants', 'New spectacles'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Pain, hypopyon and dropping vision after intraocular surgery signal endophthalmitis - a blinding emergency needing urgent treatment.', 'reasoning_eligible': True},
                {'stem': 'A patient after a fist injury has severe orbital pain, a bulging eye, and a relative afferent pupillary defect. The emergency to recognise is:', 'options': ['Retrobulbar haemorrhage (may need urgent canthotomy/cantholysis)', 'Simple conjunctivitis', 'Allergic eye disease', 'Presbyopia'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Proptosis, pain and RAPD after trauma suggest orbital compartment syndrome from retrobulbar haemorrhage - a sight-threatening emergency.', 'reasoning_eligible': True},
                {'stem': 'Why is decreased colour vision and a relative afferent pupillary defect after head/orbital trauma concerning?', 'options': ['They suggest traumatic optic neuropathy (optic-nerve damage)', 'They confirm a simple bruise', 'They mean the patient needs reading glasses', 'They are always normal after trauma'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Reduced acuity, dyschromatopsia and an RAPD indicate optic-nerve dysfunction (traumatic optic neuropathy), which needs urgent assessment.', 'reasoning_eligible': True},
                {'stem': 'A contact-lens wearer has a painful red eye with a white corneal infiltrate and a small hypopyon. The most likely emergency is:', 'options': ['Microbial (bacterial) keratitis', 'Simple dry eye', 'Presbyopia', 'A stye'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'A corneal ulcer with hypopyon in a lens wearer is microbial keratitis - sight-threatening, requiring urgent review and corneal scrape.', 'reasoning_eligible': True},
                {'stem': 'The correct sequence when a chemical is splashed in the eye is:', 'options': ['Instil topical anaesthetic if needed, then irrigate copiously and sweep the fornices before formal assessment', 'Take a full history, then irrigate an hour later', 'Pad the eye and book a routine slot', 'Check visual acuity fully before any irrigation'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Irrigation is immediate and copious (anaesthetic aids cooperation); assessment and pH checks follow - never delay flushing.', 'reasoning_eligible': True},
                {'stem': "A myopic patient reports new flashes, a shower of floaters and a 'curtain' descending over the vision. This suggests:", 'options': ['Retinal detachment - needs urgent referral', 'Simple eye strain', 'A blocked tear duct', 'Normal ageing needing no action'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': "Flashes, floaters and a progressing field defect ('curtain') are classic retinal detachment symptoms and warrant prompt referral.", 'reasoning_eligible': True},
            ],
            "hard": [
                {'stem': 'A patient presents with a severely painful red eye, nausea, a hazy cornea and a fixed mid-dilated pupil. What is the most likely diagnosis and why is it urgent?', 'options': ['Acute angle-closure glaucoma — high pressure can damage the optic nerve within hours', 'Bacterial conjunctivitis — it spreads to others', 'Presbyopia — it worsens with age', 'Subconjunctival haemorrhage — it looks dramatic'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Severe pain, nausea, a hazy cornea and a fixed mid-dilated pupil are classic for acute angle-closure glaucoma. The very high pressure can cause irreversible optic nerve damage within hours.', 'reasoning_eligible': True},
                {'stem': 'Two patients arrive together: one with a chemical splash 3 minutes ago, one with a hypopyon and a 2-day painful red eye. Who is managed first and why?', 'options': ['The chemical splash — irrigation is time-critical and cannot be delayed', 'The hypopyon — pus is always more serious', 'Whoever registered first', 'Both can wait for the next routine slot'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'A fresh chemical injury needs immediate irrigation (every second counts), so it is managed first. The hypopyon is serious and must also be escalated, but irrigation of the chemical burn cannot be delayed.', 'reasoning_eligible': True},
                {'stem': 'Select ALL signs that distinguish acute angle-closure glaucoma from anterior uveitis.', 'options': ['A large, oval, fixed pupil (vs small in uveitis)', 'Nausea and vomiting with severe pain', 'Haloes around lights with a hazy cornea', 'Marked discharge with normal vision'], 'correct': [0, 1, 2], 'qtype': 'multi', 'kind': 'practical', 'explanation': 'A large fixed pupil, systemic nausea/vomiting, and haloes with a hazy cornea point to acute glaucoma. Uveitis gives a small pupil. Marked discharge with normal vision suggests conjunctivitis, not either.', 'reasoning_eligible': True},
                {'stem': 'Why should you NOT delay irrigating a chemical burn even to instil anaesthetic or check vision?', 'options': ['The chemical causes progressive tissue destruction every second of contact', 'Anaesthetic neutralises the chemical', 'Vision testing is impossible in a red eye', 'Irrigation only works in the first 60 seconds'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Chemicals keep destroying tissue for as long as they remain in contact, so irrigation must start immediately — before anaesthetic or vision checks.', 'reasoning_eligible': True},
                {'stem': 'Rank these from most to least immediately sight-threatening.', 'options': ['Chemical burn > acute angle-closure glaucoma > flash burn > viral conjunctivitis', 'Viral conjunctivitis > flash burn > chemical burn > acute glaucoma', 'Flash burn > chemical burn > conjunctivitis > acute glaucoma', 'Acute glaucoma > conjunctivitis > chemical burn > flash burn'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'A chemical burn and acute angle-closure glaucoma are the most immediately sight-threatening; a flash burn is painful but self-limiting; viral conjunctivitis is minor.', 'reasoning_eligible': False},
                {'stem': 'A trauma patient has blood filling the whole anterior chamber. Name the sign and the main risk if missed.', 'options': ['Total hyphaema — re-bleeding and a pressure rise can threaten vision', 'Hypopyon — it will clear on its own', 'Subconjunctival haemorrhage — purely cosmetic', 'Cataract — it needs routine surgery'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Blood filling the anterior chamber is a total hyphaema. The main risks are re-bleeding and a rise in intraocular pressure, both of which can threaten vision — escalate.', 'reasoning_eligible': False},
                {'stem': 'A patient with a painful red eye, photophobia and a small pupil has no discharge. What is the most likely diagnosis?', 'options': ['Anterior uveitis (iritis)', 'Bacterial conjunctivitis', 'Acute angle-closure glaucoma', 'Dry eye'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Pain, photophobia and a small pupil with little or no discharge are typical of anterior uveitis (iritis).', 'reasoning_eligible': False},
                {'stem': 'Select ALL situations that warrant immediate escalation as an ocular emergency.', 'options': ['A fresh chemical splash to the eye', 'Sudden painless loss of vision', 'Severe pain with a fixed mid-dilated pupil', 'A mild gritty sensation that clears on blinking'], 'correct': [0, 1, 2], 'qtype': 'multi', 'kind': 'practical', 'explanation': 'A chemical splash, sudden painless vision loss, and severe pain with a fixed dilated pupil are all emergencies. A transient gritty feeling that clears is not.', 'reasoning_eligible': True},
                {'stem': 'Why can acute angle-closure glaucoma cause vomiting?', 'options': ['The sudden, very high eye pressure triggers a strong vagal/autonomic response', 'The eye drops used always cause nausea', 'Vomiting lowers the eye pressure deliberately', 'It is unrelated — vomiting is coincidental'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The abrupt, very high intraocular pressure in acute angle-closure glaucoma triggers an autonomic response that can cause nausea and vomiting — which can be mistaken for a stomach upset.', 'reasoning_eligible': True},
                {'stem': "A patient has a painful CN III palsy with a drooping lid and a dilated pupil. Why is the dilated ('blown') pupil especially concerning?", 'options': ['Pupil involvement raises suspicion of a compressive aneurysm', 'It proves the cause is simply old age', 'A dilated pupil means the problem is minor', 'It indicates the patient needs reading glasses'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': "In a third-nerve palsy, pupil involvement (a 'blown' pupil) raises concern for a compressive cause such as an aneurysm — a neurosurgical emergency.", 'reasoning_eligible': True},
                {'stem': 'Which statement about anterior-chamber signs is correct?', 'options': ['Hyphaema is blood and hypopyon is pus; both warrant escalation', 'Hyphaema is pus and hypopyon is blood', 'Both are normal findings after dilation', 'Only hyphaema needs review; hypopyon can be ignored'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Hyphaema = blood in the anterior chamber; hypopyon = pus. Both are abnormal and should be flagged for the doctor.', 'reasoning_eligible': False},
                {'stem': 'A welder presents 6 hours after work with intense bilateral pain, tearing and photophobia; corneas show diffuse punctate fluorescein staining. The diagnosis and reason for the delay are:', 'options': ['Ultraviolet (arc-eye) photokeratitis - symptoms are delayed as the damaged epithelium sloughs hours later', 'Acute glaucoma - pain is always immediate', 'Cataract - it never causes pain', 'A foreign body only - staining is never diffuse'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'UV exposure causes a superficial keratitis whose pain peaks hours later as epithelial cells die and slough - hence the classic delayed presentation.', 'reasoning_eligible': True},
                {'stem': 'A patient after a car crash has a peaked (teardrop) pupil, a shallow anterior chamber and dark tissue at the wound. Correct management is to:', 'options': ['Shield the eye, give nothing by mouth, avoid all pressure/drops, and refer for surgery', 'Irrigate vigorously and pad tightly', 'Remove the dark tissue and instil ointment', 'Reassure and discharge with lubricants'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'A peaked pupil with uveal prolapse indicates an open globe; shield (not pad), keep NBM for theatre, and avoid pressure or manipulation.', 'reasoning_eligible': True},
                {'stem': 'Ranking these by immediacy of sight-threat, which is MOST time-critical (minutes matter)?', 'options': ['Central retinal artery occlusion / chemical alkali burn', 'A slowly progressing cataract', 'A resolving subconjunctival haemorrhage', 'A chalazion'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'CRAO and alkali burns cause damage within minutes, so they are the most time-critical; cataract and chalazion are non-urgent.', 'reasoning_eligible': True},
                {'stem': 'After blunt trauma a patient has diplopia looking up, a numb lower eyelid/cheek and restricted up-gaze. Which is the key advice while awaiting review?', 'options': ['Avoid nose-blowing (risk of orbital emphysema) - likely orbital floor fracture with entrapment', 'Blow the nose to clear pressure', 'Rub the eye to relieve diplopia', 'Apply firm pressure over the orbit'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Blow-out fractures connect the orbit to the sinus; nose-blowing can force air into the orbit, so it must be avoided pending assessment.', 'reasoning_eligible': True},
                {'stem': 'Which single feature best separates a minor corneal ABRASION from a sight-threatening corneal ULCER (microbial keratitis)?', 'options': ['A white stromal infiltrate/opacity (with possible hypopyon) indicates infection, not a simple abrasion', 'The presence of any pain', 'Watering of the eye', 'Mild conjunctival redness'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'An abrasion is a clean epithelial defect; a white infiltrate/opacity (± hypopyon) signals infective keratitis and needs urgent treatment.', 'reasoning_eligible': True},
            ],
        },
        "red_eye": {
            "easy": [
                {'stem': 'In conjunctivitis, what is the discharge typically like?', 'options': ['Marked discharge', 'No discharge at all', 'Bloody discharge', 'Only at night'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Conjunctivitis typically produces marked discharge (watery, mucoid or purulent depending on the cause).', 'reasoning_eligible': False},
                {'stem': 'Does conjunctivitis usually reduce visual acuity?', 'options': ['No — vision is usually normal', 'Yes — vision drops markedly', 'Vision is always lost completely', 'Only colour vision is affected'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'In conjunctivitis visual acuity is usually normal. A red eye with reduced vision suggests something more serious.', 'reasoning_eligible': False},
                {'stem': 'What is the pupil like in acute (angle-closure) glaucoma?', 'options': ['Large, oval and fixed', 'Small and reactive', 'Pinpoint', 'Normal and round'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Acute glaucoma gives a large, oval, fixed pupil — a key warning sign in a painful red eye.', 'reasoning_eligible': False},
                {'stem': 'Which red-eye condition has marked photophobia but little or no discharge?', 'options': ['Iritis (anterior uveitis)', 'Bacterial conjunctivitis', 'Allergic conjunctivitis', 'Subconjunctival haemorrhage'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Iritis (anterior uveitis) causes marked photophobia with little or no discharge.', 'reasoning_eligible': False},
                {'stem': 'Select ALL red-eye conditions that typically cause the most severe pain.', 'options': ['Acute (angle-closure) glaucoma', 'Keratitis', 'Simple conjunctivitis', 'Subconjunctival haemorrhage'], 'correct': [0, 1], 'qtype': 'multi', 'kind': 'theory', 'explanation': 'Acute glaucoma and keratitis cause the most severe pain. Conjunctivitis is uncomfortable but not severely painful, and a subconjunctival haemorrhage is usually painless.', 'reasoning_eligible': False},
                {'stem': 'What is the pupil like in iritis (anterior uveitis)?', 'options': ['Small (or normal)', 'Large, oval and fixed', 'White and irregular', 'Always widely dilated'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': "Iritis usually gives a small (or normal) pupil — the opposite of acute glaucoma's large fixed pupil.", 'reasoning_eligible': False},
                {'stem': 'Keratitis or a corneal abrasion typically causes what pattern of pain and discharge?', 'options': ['Marked pain with little or no discharge', 'No pain with heavy discharge', 'No pain and no discharge', 'Mild pain with bloody discharge'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Keratitis and corneal abrasions cause marked pain with little or no discharge; vision varies with the site of the lesion.', 'reasoning_eligible': False},
                {'stem': 'A painless red eye with marked discharge and normal vision is most likely what?', 'options': ['Conjunctivitis', 'Acute glaucoma', 'Iritis', 'Keratitis'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Marked discharge with no pain and normal vision is the classic picture of conjunctivitis.', 'reasoning_eligible': False},
                {'stem': 'Iritis is another name for which condition?', 'options': ['Anterior uveitis', 'Conjunctivitis', 'Glaucoma', 'Cataract'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Iritis is inflammation of the iris — a form of anterior uveitis.', 'reasoning_eligible': False},
                {'stem': 'Which red-eye condition is sight-threatening and needs urgent care?', 'options': ['Acute (angle-closure) glaucoma', 'Allergic conjunctivitis', 'Subconjunctival haemorrhage', 'Mild dry eye'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Acute angle-closure glaucoma is sight-threatening and must be treated urgently; the others are far less serious.', 'reasoning_eligible': False},
                {'stem': 'A red eye with normal vision, no pain and a bright red patch of blood on the white of the eye suggests what?', 'options': ['Subconjunctival haemorrhage', 'Acute glaucoma', 'Keratitis', 'Iritis'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'A painless, flat, bright-red patch with normal vision is a subconjunctival haemorrhage — alarming to look at but usually harmless.', 'reasoning_eligible': False},
                {'stem': 'A patient has red, gritty eyes with watery, clear-but-sticky discharge and follicles under the lids, following a cold. This is most likely:', 'options': ['Viral conjunctivitis', 'Acute angle-closure glaucoma', 'Anterior uveitis', 'A corneal ulcer'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Viral conjunctivitis gives watery/sticky discharge, follicles and often a preceding cold; vision and comfort are largely preserved.', 'reasoning_eligible': True},
                {'stem': 'A red eye with thick, yellow, mucopurulent discharge that glues the lashes in the morning most suggests:', 'options': ['Bacterial conjunctivitis', 'Acute glaucoma', 'Scleritis', 'Subconjunctival haemorrhage'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Mucopurulent (yellow, sticky) discharge with papillae points to bacterial conjunctivitis rather than the watery discharge of viral disease.', 'reasoning_eligible': True},
                {'stem': 'Itchy, watery, bilateral red eyes in a patient who also has a runny nose in the pollen season suggest:', 'options': ['Allergic conjunctivitis', 'A corneal foreign body', 'Acute glaucoma', 'Endophthalmitis'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Itch is the hallmark of allergy; bilateral watery red eyes with other allergic features indicate allergic conjunctivitis.', 'reasoning_eligible': True},
                {'stem': 'Viral conjunctivitis is important in an eye clinic mainly because it is:', 'options': ['Very contagious - good hand hygiene prevents spread', 'Always sight-threatening', 'A cause of high eye pressure', 'Only seen in newborns'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Viral conjunctivitis spreads easily via unwashed hands and shared equipment, so hygiene and disinfection are key in the clinic.', 'reasoning_eligible': False},
                {'stem': 'Episcleritis typically presents with:', 'options': ['Mild eye redness and mild discomfort, with good vision', 'Severe boring pain and reduced vision', 'A fixed dilated pupil', 'Copious purulent discharge'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Episcleritis is a mild, often self-limiting inflammation causing localised redness and mild discomfort without vision loss.', 'reasoning_eligible': False},
                {'stem': 'A key piece of advice to give a patient sent home with presumed viral conjunctivitis is to:', 'options': ['Return if pain or blurred vision worsens', 'Stop washing their hands', 'Share towels with family to build immunity', 'Ignore any change in vision'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Simple conjunctivitis should not badly hurt or blur vision; worsening pain or blur is a red flag to return for review.', 'reasoning_eligible': True},
            ],
            "medium": [
                {'stem': 'Marked discharge, no pain, no photophobia, normal vision and a normal pupil. What is the diagnosis?', 'options': ['Conjunctivitis', 'Iritis', 'Acute glaucoma', 'Keratitis'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Marked discharge with no pain, normal vision and a normal pupil is conjunctivitis.', 'reasoning_eligible': False},
                {'stem': 'Marked pain, photophobia, reduced vision and a small pupil. What is the diagnosis?', 'options': ['Iritis (anterior uveitis)', 'Conjunctivitis', 'Subconjunctival haemorrhage', 'Dry eye'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Pain, photophobia, reduced vision and a small pupil point to iritis (anterior uveitis).', 'reasoning_eligible': False},
                {'stem': 'Severe pain, reduced vision and a large, fixed, oval pupil. What is the diagnosis?', 'options': ['Acute (angle-closure) glaucoma', 'Conjunctivitis', 'Iritis', 'Allergic eye disease'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Severe pain, reduced vision and a large, fixed, oval pupil are classic for acute angle-closure glaucoma.', 'reasoning_eligible': True},
                {'stem': 'How does the pupil separate iritis from acute glaucoma?', 'options': ['Iritis: small/normal pupil; acute glaucoma: large, oval, fixed pupil', 'Both give a large fixed pupil', 'Iritis: large pupil; acute glaucoma: small pupil', 'The pupil is normal in both'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'The pupil is the key sign: small or normal in iritis, but large, oval and fixed in acute angle-closure glaucoma.', 'reasoning_eligible': True},
                {'stem': 'Why is reduced visual acuity an important red flag in a red eye?', 'options': ['It suggests corneal or intraocular involvement, not simple conjunctivitis', 'It always means the patient needs new glasses', 'It is normal in all red eyes', 'It rules out anything serious'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Conjunctivitis leaves vision normal. Reduced vision in a red eye points to the cornea or inside of the eye (keratitis, iritis, glaucoma) and needs review.', 'reasoning_eligible': True},
                {'stem': 'A contact-lens wearer has a painful red eye with reduced vision. What must you suspect?', 'options': ['Microbial (infective) keratitis', 'Simple allergy', 'Presbyopia', 'A normal lens-wear sensation'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'A painful red eye with reduced vision in a lens wearer must be treated as possible microbial keratitis — a sight-threatening infection.', 'reasoning_eligible': True},
                {'stem': 'Select ALL red-eye features that should prompt urgent escalation rather than routine care.', 'options': ['Reduced visual acuity', 'Severe pain with nausea', 'A fixed, mid-dilated pupil', 'Mild itch with watery discharge'], 'correct': [0, 1, 2], 'qtype': 'multi', 'kind': 'practical', 'explanation': 'Reduced vision, severe pain with nausea, and a fixed dilated pupil are red flags. Mild itch with watery discharge suggests benign conjunctivitis.', 'reasoning_eligible': True},
                {'stem': 'Which red-eye condition is usually the LEAST urgent?', 'options': ['Conjunctivitis', 'Acute glaucoma', 'Keratitis with reduced vision', 'Iritis'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Simple conjunctivitis (normal vision, no severe pain) is the least urgent; the others can threaten sight.', 'reasoning_eligible': False},
                {'stem': 'Itchy, watery, bilateral red eyes in someone with hay fever most suggest what?', 'options': ['Allergic conjunctivitis', 'Acute glaucoma', 'Keratitis', 'Iritis'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Itch, watering and both eyes affected in an atopic patient point to allergic conjunctivitis.', 'reasoning_eligible': False},
                {'stem': 'Why does a hazy cornea in a red eye raise concern?', 'options': ['It suggests corneal oedema from high pressure or significant disease', 'It is a normal finding in conjunctivitis', 'It proves the cause is allergy', 'It means the eye is simply dry'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'A hazy (cloudy) cornea suggests corneal oedema, often from raised pressure (acute glaucoma) or serious corneal disease — not simple conjunctivitis.', 'reasoning_eligible': False},
                {'stem': "A red eye with marked pain and a branching ('dendritic') corneal pattern on staining suggests what?", 'options': ['Herpes simplex keratitis', 'Allergic conjunctivitis', 'Subconjunctival haemorrhage', 'Presbyopia'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'A painful red eye with a branching (dendritic) corneal ulcer on fluorescein staining is typical of herpes simplex keratitis — flag for the doctor.', 'reasoning_eligible': False},
                {'stem': 'How can you help distinguish scleritis from episcleritis at the slit lamp / on examination?', 'options': ['Scleritis is deeply painful with tenderness on palpation and often systemic disease; episcleritis is mild', 'Episcleritis is always more painful', 'Scleritis never affects vision', 'They are indistinguishable'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Scleritis causes severe boring pain, globe tenderness and links to systemic disease; episcleritis is mild and non-tender.', 'reasoning_eligible': True},
                {'stem': 'A newborn baby develops a red eye with copious purulent discharge in the first days of life. This should be treated as:', 'options': ['Ophthalmia neonatorum - urgent, as it can threaten sight', 'A trivial blocked tear duct only', 'Normal newborn watering', 'A cosmetic issue'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Neonatal conjunctivitis (e.g. gonococcal/chlamydial) can rapidly damage the cornea and needs urgent assessment and treatment.', 'reasoning_eligible': True},
                {'stem': 'Why should staff disinfect the slit lamp and wash hands between red-eye patients?', 'options': ['Viral conjunctivitis can be spread by unwashed hands and inadequately cleaned equipment', "It improves the lamp's optics", "It lowers the patient's eye pressure", 'It is only for cosmetic reasons'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Adenoviral conjunctivitis is highly contagious; clinic outbreaks are prevented by hand hygiene and equipment disinfection.', 'reasoning_eligible': True},
                {'stem': "A patient's red eye clears the superficial redness after a drop of phenylephrine. This response suggests:", 'options': ['Episcleritis (superficial vessels blanch) rather than scleritis', 'Acute glaucoma', 'A corneal ulcer', 'Endophthalmitis'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Phenylephrine blanches superficial episcleral vessels; the deeper vessels of true scleritis do not blanch, aiding the distinction.', 'reasoning_eligible': True},
                {'stem': "Which red-eye 'red flags' should always prompt escalation rather than reassurance?", 'options': ['Reduced vision, significant pain, photophobia, a hazy cornea or an abnormal pupil', 'Mild itch alone', 'A small painless red patch with normal vision', 'Slightly watery eyes in the wind'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Vision loss, pain, photophobia, corneal haze and pupil abnormality distinguish sight-threatening causes from benign conjunctivitis.', 'reasoning_eligible': True},
                {'stem': 'A patient with rheumatoid arthritis presents with a very painful, deep-red, tender eye and disturbed sleep from the pain. You should suspect:', 'options': ['Scleritis (associated with systemic autoimmune disease)', 'Simple allergic conjunctivitis', 'Dry eye', 'A subconjunctival haemorrhage'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Severe boring pain with tenderness in a patient with autoimmune disease strongly suggests scleritis, which needs prompt specialist care.', 'reasoning_eligible': True},
            ],
            "hard": [
                {'stem': 'A patient has a painful red eye, severe headache, nausea, a hazy cornea and a fixed mid-dilated pupil. What is the diagnosis and the priority action?', 'options': ['Acute angle-closure glaucoma — escalate immediately', 'Conjunctivitis — give antibiotic drops', 'Dry eye — advise lubricants', 'Allergy — give antihistamine'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'This cluster is classic for acute angle-closure glaucoma, a sight-threatening emergency that must be escalated immediately.', 'reasoning_eligible': True},
                {'stem': 'Match the pupil to the diagnosis: which option is correct?', 'options': ['Small pupil → iritis; large fixed pupil → acute glaucoma; normal pupil → conjunctivitis', 'Large pupil → iritis; small pupil → acute glaucoma', 'All three give a fixed dilated pupil', 'Pupil size is unrelated to the diagnosis'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Iritis → small pupil; acute angle-closure glaucoma → large, fixed pupil; conjunctivitis → normal pupil. The pupil is a powerful triage clue.', 'reasoning_eligible': True},
                {'stem': 'Select ALL features that argue AGAINST simple conjunctivitis in a red eye.', 'options': ['Reduced visual acuity', 'Marked photophobia', 'Severe pain', 'Watery discharge with normal vision'], 'correct': [0, 1, 2], 'qtype': 'multi', 'kind': 'practical', 'explanation': 'Reduced vision, marked photophobia and severe pain all point away from conjunctivitis toward keratitis, iritis or glaucoma. Watery discharge with normal vision fits conjunctivitis.', 'reasoning_eligible': True},
                {'stem': "Why must a painful red eye with reduced vision in a contact-lens wearer never be dismissed as 'just irritation'?", 'options': ['It may be microbial keratitis, which can scar the cornea and destroy vision quickly', 'Lens wearers never get infections', 'Irritation always reduces vision harmlessly', 'It is only a cosmetic issue'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Contact-lens wearers are at high risk of microbial keratitis, which can rapidly scar the cornea and cause permanent vision loss — it must be escalated.', 'reasoning_eligible': True},
                {'stem': 'Rank these red eyes from most to least urgent.', 'options': ['Acute glaucoma > microbial keratitis > iritis > conjunctivitis', 'Conjunctivitis > iritis > keratitis > acute glaucoma', 'Iritis > conjunctivitis > acute glaucoma > keratitis', 'Subconjunctival haemorrhage > acute glaucoma > keratitis > iritis'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Acute glaucoma and microbial keratitis are the most sight-threatening, then iritis; simple conjunctivitis is the least urgent.', 'reasoning_eligible': False},
                {'stem': "A patient says one red eye is painful with watering but denies discharge, and bright light hurts the SAME eye even when shone in the other eye. What does this 'consensual photophobia' suggest?", 'options': ['Iritis (anterior uveitis)', 'Allergic conjunctivitis', 'Subconjunctival haemorrhage', 'Dry eye'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Pain in the affected eye when light is shone in the OTHER eye (consensual photophobia) is a classic sign of iritis.', 'reasoning_eligible': True},
                {'stem': 'Which combination best fits keratitis rather than iritis?', 'options': ['Marked pain with a corneal lesion that stains, vision varies with lesion site', 'Painless eye with marked discharge', 'Large fixed pupil with nausea', 'Bilateral itch with watering'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Keratitis features marked pain with a stainable corneal lesion, and vision that varies with the lesion site. Iritis is defined more by photophobia and a small pupil without a corneal ulcer.', 'reasoning_eligible': False},
                {'stem': 'Select ALL of the following that are typically PAINLESS red eyes.', 'options': ['Subconjunctival haemorrhage', 'Simple (viral) conjunctivitis', 'Acute angle-closure glaucoma', 'Microbial keratitis'], 'correct': [0, 1], 'qtype': 'multi', 'kind': 'theory', 'explanation': 'Subconjunctival haemorrhage and viral conjunctivitis are usually painless (at most gritty). Acute glaucoma and keratitis are markedly painful.', 'reasoning_eligible': False},
                {'stem': "Why is it unsafe to give steroid drops to a red, painful eye without a doctor's assessment?", 'options': ['If the cause is herpes simplex keratitis, steroids can make it dramatically worse', 'Steroids always cure red eyes instantly', 'Steroids have no effect on the eye', 'Steroids only help allergic eyes and nothing else'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': "Steroids can worsen an undiagnosed herpes simplex keratitis and raise eye pressure. A red painful eye needs a doctor's assessment before steroids.", 'reasoning_eligible': True},
                {'stem': 'An elderly patient on warfarin has a large, painless, bright-red patch on the white of the eye with normal vision. What is the most appropriate response?', 'options': ['Reassure — likely a subconjunctival haemorrhage; check BP and note the anticoagulant', 'Treat as acute glaucoma and escalate immediately', 'Start antibiotic drops urgently', 'Patch the eye and send home with no follow-up'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'A painless bright-red patch with normal vision is a subconjunctival haemorrhage — usually benign. In an anticoagulated patient it is worth checking blood pressure and noting the medication.', 'reasoning_eligible': False},
                {'stem': 'Which single feature most reliably separates a sight-threatening red eye from a benign one?', 'options': ['Whether visual acuity is reduced', 'Whether the eye waters', 'Whether the redness is bright or dull', 'Whether the patient is male or female'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Reduced visual acuity is the single most useful red flag — benign red eyes (conjunctivitis, subconjunctival haemorrhage) keep normal vision.', 'reasoning_eligible': True},
                {'stem': 'At the registration desk, four red-eye patients wait. Which should be fast-tracked as potentially sight-threatening?', 'options': ['The one with pain, reduced vision and photophobia', 'The one with itchy watery eyes and hay fever', 'The one with a painless bright-red patch and normal vision', 'The one with mild morning stickiness and normal vision'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Pain + reduced vision + photophobia flags a serious cause (uveitis, keratitis, glaucoma); the others are typically benign.', 'reasoning_eligible': True},
                {'stem': 'A patient presents with a hyperacute red eye with profuse, rapidly-returning purulent discharge. Why is this urgent?', 'options': ['Hyperacute (e.g. gonococcal) conjunctivitis can perforate the cornea within days', 'It never affects the cornea', 'It is only a cosmetic problem', 'It always resolves without any treatment'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Gonococcal conjunctivitis produces copious purulent discharge and can rapidly invade and perforate the cornea, so it needs urgent treatment.', 'reasoning_eligible': True},
                {'stem': 'Why must you NOT hand out topical steroid drops for a painful red eye before a doctor examines it?', 'options': ['Steroids can dramatically worsen a herpetic dendritic ulcer and raise IOP', 'Steroids always cure conjunctivitis instantly', 'Steroids lower blood pressure dangerously', 'Steroids have no effect on the eye'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'If the cause is herpes simplex keratitis, steroids allow the virus to spread and can perforate the cornea; they also raise IOP.', 'reasoning_eligible': True},
                {'stem': "A patient reports pain in the RIGHT red eye whenever light is shone into the LEFT eye ('consensual photophobia'). This points to:", 'options': ['Anterior uveitis/iritis in the right eye', 'Simple bacterial conjunctivitis', 'A subconjunctival haemorrhage', 'Allergic conjunctivitis'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Consensual photophobia (pain in the affected eye when the other eye is stimulated) is characteristic of iritis due to ciliary spasm.', 'reasoning_eligible': True},
                {'stem': 'Which examination feature most reliably separates a benign red eye from a sight-threatening one?', 'options': ['Whether visual acuity is reduced', 'Whether the eye is watery', 'Whether the redness is bright or dull', 'Whether both eyes are involved'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Reduced visual acuity is the single most important red flag; benign causes (conjunctivitis, subconjunctival haemorrhage) spare vision.', 'reasoning_eligible': True},
            ],
        },
        "history_taking": {
            "easy": [
                {'stem': 'Which systemic condition is especially important to ask about in an eye history?', 'options': ['Diabetes', 'Presbyopia', 'Colour blindness', 'A common cold'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Diabetes (like hypertension) is a vascular disease that affects the eyes, so it is a key part of the history.', 'reasoning_eligible': False},
                {'stem': 'Which medication group must you specifically ask about because it raises bleeding risk?', 'options': ['Anticoagulants', 'Lubricant eye drops', 'Vitamin C', 'Paracetamol'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Anticoagulants (blood thinners) increase bleeding risk during procedures or after trauma, so they must be asked about.', 'reasoning_eligible': False},
                {'stem': 'For a visual complaint, which question is most important to ask?', 'options': ['Was the change sudden or gradual?', 'What colour are your eyes?', 'Do you wear sunglasses?', 'How tall are you?'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Whether vision changed suddenly or gradually is a key question — sudden change is more likely to be urgent.', 'reasoning_eligible': False},
                {'stem': "What scale is used to assess a patient's pain?", 'options': ['A 0-10 pain scale', 'The Snellen chart', 'The Ishihara chart', 'The 6/6 scale'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Pain is assessed on a 0-10 scale, where 0 is no pain and 10 is the worst imaginable.', 'reasoning_eligible': False},
                {'stem': 'Which condition is worth asking about in the FAMILY ocular history?', 'options': ['Glaucoma', 'Conjunctivitis', 'A stye', 'A black eye'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Glaucoma (and cataract, retinal detachment, squint) can run in families, so family history matters.', 'reasoning_eligible': False},
                {'stem': 'Why ask whether a visual change is in one eye or both?', 'options': ['It helps localise the cause and judge urgency', 'It decides which eye is tested first', 'It changes the consultation fee', 'It is not actually important'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Whether one or both eyes are affected (and whether the loss is partial or total) helps localise the problem and judge how urgent it is.', 'reasoning_eligible': False},
                {'stem': 'Select ALL medication groups you should specifically ask about in an eye history.', 'options': ['Anticoagulants', 'Steroids', 'Herbal supplements and vitamins', 'Toothpaste'], 'correct': [0, 1, 2], 'qtype': 'multi', 'kind': 'theory', 'explanation': 'Anticoagulants, steroids, and herbal supplements/vitamins (and anti-malarials) all matter in an eye history. Toothpaste does not.', 'reasoning_eligible': False},
                {'stem': 'Which TWO vascular systemic diseases most commonly affect the eyes?', 'options': ['Diabetes and hypertension', 'Asthma and eczema', 'Gout and reflux', 'Migraine and sinusitis'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': "Diabetes and hypertension are the key vascular diseases that damage the eye's blood vessels.", 'reasoning_eligible': False},
                {'stem': 'Why ask about recent overseas travel when a patient has purulent (pus-like) discharge?', 'options': ['It may point to an acquired infection or poor hygiene', 'Travel improves eye health', 'It decides the triage category automatically', 'It is asked only for billing'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Recent travel with purulent discharge may indicate an acquired infection or exposure to poor hygiene conditions.', 'reasoning_eligible': False},
                {'stem': 'A myopic patient reports new flashes and floaters. Why does this matter?', 'options': ['Myopia raises retinal detachment risk, so new flashes and floaters need prompt review', 'Flashes and floaters are always harmless', 'Myopes never get retinal problems', 'It only matters if both eyes are affected'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Short-sighted (myopic) eyes have a higher risk of retinal detachment, so new flashes and floaters should be reviewed promptly.', 'reasoning_eligible': True},
                {'stem': 'Before starting to take a history, you must confirm you have the correct patient by checking:', 'options': ['At least 2 identifiers (e.g. name AND identification number/date of birth) against the record', "Only the patient's first name", 'Only the room number', 'Nothing - just start asking questions'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Patient safety requires positive ID with at least two identifiers (name plus NRIC/DOB/address) matched to the medical record.', 'reasoning_eligible': False},
                {'stem': 'At the start of the interview, the correct first step is to:', 'options': ["Introduce yourself by full name and use the patient's name", 'Immediately ask about medications', 'Start writing notes silently', 'Dilate the pupils'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': "Opening the interview by introducing yourself and using the patient's name builds rapport and orients the patient.", 'reasoning_eligible': False},
                {'stem': 'When a patient begins describing their problem, the best practice is to:', 'options': ['Listen attentively to the opening statement without interrupting', 'Interrupt to speed things up', 'Finish their sentences for them', 'Ignore them and read the notes'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Active listening without interruption lets patients tell their story and often reveals the key complaint.', 'reasoning_eligible': True},
                {'stem': "An 'open-ended' question is preferred early in history taking because it:", 'options': ['Invites the patient to describe symptoms in their own words', 'Can only be answered yes or no', 'Leads the patient to a particular answer', 'Ends the conversation quickly'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': "Open questions (e.g. 'Tell me about your eye') gather richer information than closed yes/no questions.", 'reasoning_eligible': True},
                {'stem': 'After touching a patient during history taking, you should:', 'options': ['Perform hand hygiene (hand wash / sanitise)', 'Do nothing', 'Only wash hands at the end of the day', 'Reuse the same gloves for everyone'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Hand hygiene after patient contact is a basic infection-control step, especially important with red/contagious eyes.', 'reasoning_eligible': False},
                {'stem': 'At the end of history taking, the information should be:', 'options': ["Documented in the patient's medical record with date and time", 'Kept only in your memory', 'Told to the next patient', 'Written on a scrap of paper and discarded'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Accurate, timed documentation in the record ensures continuity of care and a medico-legal account.', 'reasoning_eligible': False},
                {'stem': "'Giving false reassurance' (e.g. 'I'm sure it's nothing') is considered:", 'options': ['A barrier to effective communication', 'The best way to calm every patient', 'A required part of every history', 'A way to speed up documentation'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'False reassurance is a communication barrier - it can dismiss real concerns and erode trust; be honest and escalate appropriately.', 'reasoning_eligible': True},
            ],
            "medium": [
                {'stem': 'Why is it important to ask about anticoagulants before a procedure?', 'options': ['They increase bleeding risk during the procedure or after trauma', 'They make the pupil dilate', 'They improve healing', 'They change the refractive error'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Anticoagulants raise the risk of bleeding during procedures and after injury, so they must be known in advance.', 'reasoning_eligible': True},
                {'stem': 'Severe eye pain with nausea and vomiting noted in the history should make you suspect what?', 'options': ['Acute angle-closure glaucoma', 'Simple conjunctivitis', 'Presbyopia', 'Dry eye'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Severe pain with nausea and vomiting is a classic history for acute angle-closure glaucoma.', 'reasoning_eligible': False},
                {'stem': 'A contact-lens wearer has a red eye. Select ALL history points that raise infection risk.', 'options': ['Wearing daily lenses for 2-3 days without removal (overwear)', 'Using an incorrect lens-care solution', 'Wearing prescription sunglasses', 'Reading in good light'], 'correct': [0, 1], 'qtype': 'multi', 'kind': 'practical', 'explanation': 'Lens overwear and incorrect lens-care solution both raise the risk of infection. Sunglasses and good reading light do not.', 'reasoning_eligible': True},
                {'stem': 'Why ask about steroid use in an eye history?', 'options': ['Long-term steroids can raise eye pressure and cause cataract', 'Steroids improve night vision', 'Steroids change eye colour', 'Steroids are irrelevant to the eye'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Steroids (drops, tablets or inhalers) can raise intraocular pressure and contribute to cataract, so their use is important to record.', 'reasoning_eligible': True},
                {'stem': "Why does asking 'sudden or gradual?' help in a vision complaint?", 'options': ['Sudden loss is more likely to be an emergency than gradual loss', 'Gradual loss is always an emergency', 'The timing has no clinical meaning', 'It decides the eye drop dose'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Sudden vision loss (e.g. vascular occlusion, detachment) is more likely to be urgent; gradual loss (e.g. cataract) is usually less acute.', 'reasoning_eligible': True},
                {'stem': 'A patient mentions a previous acute angle-closure attack. Why is this history important before dilation?', 'options': ['Dilating drops could trigger another angle-closure attack', 'It means the patient must always be dilated', 'It only matters for colour vision testing', 'It has no bearing on dilation'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'A history of angle-closure is a caution against routine dilation, which could precipitate another attack — check with the nurse/doctor first.', 'reasoning_eligible': True},
                {'stem': 'Why ask about anti-malarial medication in an eye history?', 'options': ['Long-term use can affect the retina and needs monitoring', "It changes the patient's refraction", 'It is asked only for travel records', 'It has no effect on the eye'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Some anti-malarials (e.g. hydroxychloroquine) can affect the retina with long-term use, so patients on them are monitored.', 'reasoning_eligible': False},
                {'stem': 'Which family-history conditions are most worth recording?', 'options': ['Glaucoma, cataract and retinal detachment', 'Conjunctivitis and styes', 'Short-sightedness alone', 'Eye colour and lash length'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Glaucoma, cataract, retinal detachment (and dystrophies/squint) can be inherited, so they are the key family-history items.', 'reasoning_eligible': False},
                {'stem': 'Why record current systemic medications even if the patient came only for a routine eye check?', 'options': ['Some drugs affect the eyes or interact with eye treatment', 'It is required for insurance only', 'Medications never affect the eyes', 'Only eye drops are relevant'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Systemic drugs can affect the eyes (e.g. steroids, anti-malarials) or interact with planned eye treatment, so a full medication list is recorded.', 'reasoning_eligible': False},
                {'stem': "A patient reports vision 'like a curtain coming down' in one eye. What history detail is most relevant?", 'options': ['Whether they are short-sighted or have had retinal problems', 'Their favourite colour', 'Whether they prefer reading or TV', 'How many pillows they use'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': "A 'curtain' over the vision suggests retinal detachment; myopia and previous retinal problems raise that risk, so they are the key history points.", 'reasoning_eligible': True},
                {'stem': 'A patient speaks little English and looks anxious during history taking. The best approach is to:', 'options': ['Arrange an interpreter / use available language support and non-verbal reassurance', 'Speak louder in English', 'Skip the history entirely', 'Ask another patient to translate confidential details'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Language barriers are overcome with proper interpretation and supportive non-verbal cues, not by raising your voice or breaching confidentiality.', 'reasoning_eligible': True},
                {'stem': 'For a red-eye complaint, which cluster of symptom questions is most relevant to ask?', 'options': ['Onset (sudden/gradual), pain, itch, light sensitivity, discharge and any vision change', 'Favourite colour and hobbies', 'Only their home address', 'Only their occupation'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Characterising onset, pain, itch, photophobia, discharge and vision change helps separate benign from serious red eyes.', 'reasoning_eligible': True},
                {'stem': 'A distressed patient becomes tearful while describing sudden vision loss. A therapeutic response is to:', 'options': ['Use empathy and allow a pause (therapeutic silence) before continuing', 'Tell them to stop crying', 'Change the subject abruptly', 'Offer your personal opinion on their marriage'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Empathy and allowing silence let the patient regain composure and feel heard, improving the therapeutic relationship.', 'reasoning_eligible': True},
                {'stem': 'Why should non-verbal communication (body language, eye contact) be consistent with your words?', 'options': ['Mixed messages confuse and reduce trust; consistency reassures the patient', 'It is not important at all', 'Patients never notice body language', 'Only the words matter in health care'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Non-verbal cues carry much of a message; when they contradict speech, patients sense insincerity and trust falls.', 'reasoning_eligible': True},
                {'stem': "'Summarising' back to the patient near the end of the history is useful because it:", 'options': ['Confirms you understood correctly and lets the patient add or correct details', 'Wastes time', 'Replaces documentation', 'Is only for teaching'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Paraphrasing/summarising checks accuracy and shows the patient they were heard, catching any missed or wrong details.', 'reasoning_eligible': True},
                {'stem': "Repeatedly asking 'Why?' (e.g. 'Why didn't you come sooner?') during a history is discouraged because it:", 'options': ['Can sound accusatory and make the patient defensive', 'Is the most efficient question', 'Always yields the best answers', 'Is required by the checklist'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': "'Why' questions can feel like blame; softer phrasing ('What led you to come today?') keeps the patient at ease.", 'reasoning_eligible': True},
                {'stem': "The 'orientation phase' of the patient interview mainly involves:", 'options': ['Establishing rapport, defining roles, and collecting initial information', 'Saying goodbye', 'Performing surgery', 'Discharging the patient'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'In the orientation phase you build rapport, clarify roles, gather information and set goals before the working phase.', 'reasoning_eligible': False},
            ],
            "hard": [
                {'stem': 'A 60-year-old diabetic on warfarin reports gradual vision blurring. Which TWO history facts most change your level of concern, and why?', 'options': ['Diabetes (retinopathy risk) and warfarin (bleeding risk)', 'Their height and weight', 'Their favourite hobby', 'The colour of their glasses frames'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Diabetes raises the risk of retinopathy/macular oedema, and warfarin raises bleeding risk — both shape how the case is assessed and escalated.', 'reasoning_eligible': True},
                {'stem': 'Select ALL history features that should raise your suspicion of a sight-threatening problem.', 'options': ['Sudden loss of vision', 'New flashes and floaters in a myope', 'Severe pain with nausea', 'Mild eye strain after long reading'], 'correct': [0, 1, 2], 'qtype': 'multi', 'kind': 'practical', 'explanation': 'Sudden vision loss, new flashes/floaters in a myope, and severe pain with nausea are red flags. Mild eye strain after reading is usually benign.', 'reasoning_eligible': True},
                {'stem': "Why is a thorough drug history (including herbal supplements) sometimes more revealing than the patient's stated complaint?", 'options': ["Drugs and supplements can cause or worsen eye problems the patient hasn't linked to them", 'Patients always know exactly what is wrong', 'Supplements are never relevant', 'It saves time to skip the complaint'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': "Medications and supplements can cause ocular effects the patient hasn't connected to their symptoms, so a careful drug history can uncover the real cause.", 'reasoning_eligible': True},
                {'stem': 'A contact-lens wearer with a painful red eye admits to swimming in lenses and topping up old solution. Why is this history alarming?', 'options': ['These habits strongly raise the risk of microbial keratitis', 'Swimming improves lens hygiene', 'Topping up solution sterilises the lens', 'These habits are completely safe'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Swimming in lenses and reusing/topping up solution are classic risk factors for serious microbial keratitis — this history demands prompt escalation.', 'reasoning_eligible': True},
                {'stem': "Why should you ask BOTH 'one eye or both?' AND 'partial or total?' for a vision complaint?", 'options': ['Together they help localise the problem and gauge severity', 'They are the same question asked twice', 'Only one of them ever matters', 'They are asked only for the record, not for clinical use'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Laterality (one vs both eyes) and extent (partial vs total) together narrow down where the problem is and how serious it is.', 'reasoning_eligible': True},
                {'stem': 'An elderly patient is vague about their medications. What is the safest practical approach?', 'options': ['Ask them to bring their medication list/packets and confirm with records', 'Guess based on their age', 'Skip the drug history to save time', "Record 'nil medications' by default"], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'When a patient is unsure, the safest approach is to verify — ask for their medication list or packets and check the records rather than guessing.', 'reasoning_eligible': False},
                {'stem': 'Which statement about taking an eye history is correct?', 'options': ['Systemic disease, medications, family history and the symptom timeline all matter', 'Only the presenting eye symptom matters', 'Family history is never relevant', 'Medications are irrelevant unless they are eye drops'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'A good eye history covers systemic disease, all medications, family history and the timeline of symptoms — not just the eye complaint.', 'reasoning_eligible': False},
                {'stem': 'A patient reports painless, sudden, total loss of vision in one eye an hour ago. Why does the history alone justify urgent escalation?', 'options': ['Sudden painless monocular loss can be a vascular emergency (e.g. CRAO) where time is critical', 'Painless problems are never urgent', 'One-hour-old symptoms are too late to matter', 'It is only urgent if the patient has pain'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Sudden, painless, total loss of vision in one eye suggests a vascular emergency such as CRAO — the history alone warrants urgent escalation.', 'reasoning_eligible': True},
                {'stem': 'Select ALL reasons to specifically ask a woman of child-bearing age about pregnancy before eye treatment.', 'options': ['Some eye drops and medications are unsafe in pregnancy', 'Dilating/other drugs may need to be avoided or changed', 'It changes her eye colour', 'It determines which eye is tested first'], 'correct': [0, 1], 'qtype': 'multi', 'kind': 'theory', 'explanation': 'Pregnancy can affect which drops and medications are safe to use, so it is asked before treatment. It has nothing to do with eye colour or test order.', 'reasoning_eligible': False},
                {'stem': 'Why is the symptom TIMELINE (onset, duration, progression) central to an eye history?', 'options': ['It distinguishes acute emergencies from chronic, stable problems', 'It is only used for appointment scheduling', 'It replaces the need for examination', 'It has no diagnostic value'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'How and when symptoms started and changed helps separate urgent acute problems from slow chronic ones, guiding the level of response.', 'reasoning_eligible': True},
                {'stem': 'You realise the notes in front of you belong to a different patient with a similar name. The safest action is to:', 'options': ['Stop, re-verify identity with two identifiers, and retrieve the correct record before proceeding', 'Carry on since the names are close', 'Guess which record is right', "Ask the patient to use the other person's record"], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Similar-name mix-ups are a classic error; always re-confirm two identifiers and use the correct record before any care.', 'reasoning_eligible': True},
                {'stem': "A patient discloses something 'in confidence' and asks you not to write it down. The correct approach is to:", 'options': ['Explain that relevant clinical information must be documented for safe care, while respecting privacy', 'Agree never to record anything', 'Tell other patients about it', 'Post it where colleagues can gossip'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Clinically relevant information belongs in the record for continuity and safety; confidentiality is maintained within the care team, not by omission.', 'reasoning_eligible': True},
                {'stem': "Why is it dangerous to accept a patient's vague 'I take some heart pills' without clarifying?", 'options': ['Anticoagulants/antiplatelets and other drugs change bleeding and procedure risk, so the exact drugs matter', 'Medications never matter in eye care', 'It saves time to move on', "The patient's word is always specific enough"], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': "'Heart pills' may include warfarin/aspirin/clopidogrel; the specific drug materially changes bleeding risk before injections or surgery.", 'reasoning_eligible': True},
                {'stem': 'A patient with dementia is a poor historian and attends alone. The best practical approach is to:', 'options': ['Gather what you can, corroborate with the record/family/carer where possible, and document the limitation', 'Accept every uncertain answer as fact', 'Skip the history', 'Guess the missing details'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'With an unreliable historian, use collateral sources (records, carers) and clearly document the uncertainty for safe care.', 'reasoning_eligible': True},
                {'stem': 'Why must a woman of child-bearing age be asked about possible pregnancy before certain eye treatments/imaging?', 'options': ['Some drugs and investigations can harm a fetus, so pregnancy status changes management', 'It is only for statistics', 'Pregnancy never affects eye care', 'It is an optional courtesy question'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Certain medications (and some imaging/dyes) are contraindicated in pregnancy, so this history directly affects safe treatment choices.', 'reasoning_eligible': True},
                {'stem': 'Which statement about structuring an eye history is CORRECT?', 'options': ['Cover presenting complaint, past ocular history, past medical history, drugs/allergies and family history systematically', 'Only the presenting complaint ever matters', 'Family history is never relevant', 'Medications should not be recorded for routine visits'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'A complete history systematically covers the complaint, POH, PMH, drug/allergy and family history - each can change management.', 'reasoning_eligible': True},
            ],
        },
        "distance_va": {
            "easy": [
                {'stem': 'What is normal distance visual acuity on the Snellen scale?', 'options': ['6/6', '6/60', '6/12', '3/6'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': '6/6 is normal distance vision on the Snellen scale.', 'reasoning_eligible': False},
                {'stem': 'By convention, which eye is tested first?', 'options': ['The right eye', 'The left eye', 'Whichever is worse', 'Both together'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'By convention the right eye is tested first, then the left.', 'reasoning_eligible': False},
                {'stem': 'At what visual acuity should you apply the pinhole?', 'options': ['When VA is 6/12 or worse', 'Only when VA is 6/6', 'Never during a VA test', 'Only for near vision'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'The pinhole is used when distance VA is reduced (6/12 or worse) to check for a refractive cause.', 'reasoning_eligible': False},
                {'stem': 'In the fraction 6/18, what does the top number (6) mean?', 'options': ['The testing distance in metres', 'The number of letters read', "The patient's age", 'The line number on the chart'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The top number is the testing distance (6 metres); the bottom number is the distance at which a normal eye reads that line.', 'reasoning_eligible': False},
                {'stem': 'Which chart is used for patients who cannot read letters?', 'options': ['The tumbling E chart', 'The Ishihara chart', 'The Amsler grid', 'The Goldmann chart'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'The tumbling E chart lets patients who cannot read letters indicate the direction the E points.', 'reasoning_eligible': False},
                {'stem': "What does 'CF' mean in a visual acuity record?", 'options': ['Count Fingers', 'Clear Focus', 'Central Field', 'Colour Found'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'CF means Count Fingers — used when the patient cannot read the lowest chart line.', 'reasoning_eligible': False},
                {'stem': 'Select ALL of these that are low-vision acuity levels below chart letters.', 'options': ['Count Fingers (CF)', 'Hand Movement (HM)', 'Perception of Light (PL)', '6/6'], 'correct': [0, 1, 2], 'qtype': 'multi', 'kind': 'theory', 'explanation': 'CF, HM and PL are the low-vision levels used when the patient cannot read chart letters. 6/6 is normal vision.', 'reasoning_eligible': False},
                {'stem': "What does 'NPL' stand for in a VA record?", 'options': ['No Perception of Light', 'Near Print Level', 'Normal Pupil Light', 'New Patient Letter'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'NPL means No Perception of Light — the lowest possible acuity, indicating the eye cannot detect any light.', 'reasoning_eligible': False},
                {'stem': 'Vision improves with the pinhole. What does this suggest?', 'options': ['A refractive cause (likely correctable with glasses)', 'A retinal detachment', 'Optic nerve disease', 'A dense cataract'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'If the pinhole improves vision, the cause is likely refractive — correctable with glasses.', 'reasoning_eligible': False},
                {'stem': 'Vision does NOT improve with the pinhole. What does this suggest?', 'options': ['A non-refractive cause such as media opacity or retinal/optic nerve disease', 'Simple uncorrected long-sightedness', 'The patient needs reading glasses', 'Nothing — the test failed'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'No improvement with the pinhole points to a non-refractive cause — media opacity (e.g. cataract), retinal or optic nerve disease.', 'reasoning_eligible': False},
                {'stem': "What does 'LogMAR' stand for?", 'options': ['Logarithm of the Minimum Angle of Resolution', 'Long-range Magnified Acuity Reading', 'Lens-Optimised Global Macular Acuity Ratio', 'Low-Gain Manual Acuity Record'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'LogMAR = Logarithm of the Minimum Angle of Resolution, the basis of the modern acuity chart used at SNEC.', 'reasoning_eligible': False},
                {'stem': 'On the LogMAR scale, 6/6 vision corresponds to a LogMAR value of:', 'options': ['0.00', '1.00', '6.00', '0.60'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': '6/6 (normal) equals LogMAR 0.00; higher LogMAR numbers mean worse vision.', 'reasoning_eligible': False},
                {'stem': 'Before testing distance vision, you should first:', 'options': ["Check the doctor's order in the medical record/EMR", 'Occlude both eyes', 'Dilate the pupil', 'Start at the smallest line'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': "The checklist begins with confirming the doctor's order for the VA test before preparing the patient.", 'reasoning_eligible': False},
                {'stem': 'If a patient normally wears glasses, distance VA should be tested:', 'options': ['With their corrective glasses/contact lenses on', 'Only without any correction', "With someone else's glasses", 'Through a dilated pupil only'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': "Record the patient's functional acuity by testing with their own glasses/contact lenses if worn.", 'reasoning_eligible': True},
                {'stem': 'By convention, when measuring distance VA you occlude the left eye and test the:', 'options': ['Right eye first', 'Left eye first', 'Both eyes together first', 'Worse eye first'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'The right eye is tested first by convention, occluding the left with the appropriate occluder.', 'reasoning_eligible': False},
                {'stem': "'CF', 'HM', 'PL' and 'NPL' in a VA record refer, in order, to:", 'options': ['Count fingers, hand movements, perception of light, no perception of light', 'Central fixation, high myopia, poor light, near point loss', 'Corneal focus, hyperopia, pinhole, no pinhole', 'Contrast field, halo, photophobia, night'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Below chart letters, vision is graded as CF (count fingers), HM (hand movements), PL (perception of light) and NPL (none).', 'reasoning_eligible': False},
                {'stem': 'The correct patient must be identified before the test using:', 'options': ['At least 2 identifiers (name plus ID number/DOB/address)', 'The chair they sat in', 'Only their appearance', 'The order they arrived'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Two identifiers matched to the record prevent testing (and documenting on) the wrong patient.', 'reasoning_eligible': False},
            ],
            "medium": [
                {'stem': 'A patient cannot read any of the 6/60 line. What is the next step?', 'options': ['Move to 6/120; if still unable, test CF, then HM, PL, NPL', 'Record the vision as 6/6', 'Stop the test and reschedule', 'Switch straight to the near chart'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'If 6/60 cannot be read, try 6/120, then step down the low-vision scale: Count Fingers → Hand Movement → Perception of Light → No Perception of Light.', 'reasoning_eligible': True},
                {'stem': 'Put the low-vision steps in the correct order (most to least vision) after 6/120 cannot be read.', 'options': ['Count Fingers → Hand Movement → Perception of Light → No Perception of Light', 'No Perception of Light → Perception of Light → Hand Movement → Count Fingers', 'Hand Movement → Count Fingers → No Perception of Light → Perception of Light', 'Perception of Light → Count Fingers → Hand Movement → No Perception of Light'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The descending order is CF → HM → PL → NPL, from most to least remaining vision.', 'reasoning_eligible': False},
                {'stem': "A cataract patient's VA does not improve with the pinhole. Why?", 'options': ['The reduced vision is from media opacity (cloudy lens), not refractive error', 'The pinhole was the wrong size', 'The patient simply needs stronger glasses', 'Cataracts always improve with a pinhole'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'A cataract is a media opacity — the pinhole cannot overcome it, so vision does not improve.', 'reasoning_eligible': True},
                {'stem': "A patient's VA has dropped from 6/12 to 6/120 since the last visit. What should you do?", 'options': ['Highlight the significant drop to the doctor', 'Record it and book a routine review in a year', 'Repeat only if the patient complains', 'Ignore it — VA always fluctuates'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'A large drop in VA between visits is significant and should be highlighted to the doctor.', 'reasoning_eligible': True},
                {'stem': 'Why is the pinhole test useful when VA is reduced?', 'options': ['It screens whether the cause is refractive or not', 'It gives the exact spectacle prescription', 'It measures the eye pressure', 'It replaces a full eye examination'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The pinhole quickly screens whether reduced vision is from refractive error (improves) or another cause (no improvement). It is not a prescription.', 'reasoning_eligible': False},
                {'stem': 'A patient reads down to 6/9 but no further. How is this recorded?', 'options': ['As 6/9 (the smallest line read)', 'As 6/6', 'As 6/60', 'As CF'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'VA is recorded as the smallest line the patient can read — here 6/9.', 'reasoning_eligible': False},
                {'stem': 'Which sequence correctly orders these from BEST to WORST vision?', 'options': ['6/6 → 6/12 → 6/60 → Count Fingers', 'Count Fingers → 6/60 → 6/12 → 6/6', '6/60 → 6/6 → 6/12 → Count Fingers', '6/12 → 6/6 → Count Fingers → 6/60'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'From best to worst: 6/6 (normal) → 6/12 → 6/60 → Count Fingers.', 'reasoning_eligible': False},
                {'stem': 'A myope forgot their glasses and reads 6/36, improving to 6/9 with the pinhole. What does this indicate?', 'options': ['Uncorrected refractive error — glasses are likely to help', 'A cataract', 'Optic nerve disease', 'A retinal detachment'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': "Marked improvement with the pinhole indicates uncorrected refractive error; the patient's own glasses should restore the vision.", 'reasoning_eligible': True},
                {'stem': 'Why should the room and chart lighting be standardised for a VA test?', 'options': ['Poor or uneven lighting can falsely change the recorded acuity', 'Lighting has no effect on VA', 'Bright light always improves VA', 'It only matters for colour vision'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Inconsistent lighting can make the recorded VA unreliable, so chart illumination is standardised.', 'reasoning_eligible': False},
                {'stem': 'Select ALL correct statements about the Snellen fraction 6/18.', 'options': ['The 6 is the testing distance in metres', 'It represents reduced vision (worse than 6/6)', 'A normal eye reads this line at 18 metres', 'It means the patient read 18 letters'], 'correct': [0, 1, 2], 'qtype': 'multi', 'kind': 'theory', 'explanation': 'In 6/18, 6 m is the testing distance, a normal eye reads that line at 18 m, and it is worse than 6/6. The numbers are not a letter count.', 'reasoning_eligible': False},
                {'stem': 'A patient has an infected (red, discharging) eye. Which occluder should you use?', 'options': ['The occluder marked with an orange sticker (for infected cases)', 'The general shared occluder', 'No occluder at all', "The patient's own tissue"], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'SNEC uses a dedicated orange-sticker occluder for infected eyes to prevent cross-infection of other patients.', 'reasoning_eligible': True},
                {'stem': 'Between patients (and before starting), the occluder should be:', 'options': ['Wiped with an alcohol wipe', 'Rinsed in tap water only', 'Left as is', 'Wiped with a dry cloth once a week'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Disinfecting the occluder with alcohol between uses is a key infection-control step, especially with red-eye patients.', 'reasoning_eligible': True},
                {'stem': 'On the LogMAR line-by-line test, the patient must read how many letters correctly before moving to the next line?', 'options': ['All 5 letters on the current line', 'Just 1 letter', 'Any 2 letters', '3 of 5 letters'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'The patient reads all 5 letters of a line correctly before progressing to the next smaller line.', 'reasoning_eligible': False},
                {'stem': 'A patient reads the whole 6/19 line but only 2 of 5 letters on the next line. How is this best recorded?', 'options': ['The last fully-read line (6/19), noting the extra letters read on the next line', 'As 6/6 because they tried', 'As NPL', 'As count fingers'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Record the smallest line read in full (with LogMAR value); partial letters on the next line may be annotated (e.g. 6/19 +2).', 'reasoning_eligible': True},
                {'stem': "Why does SNEC record VA in BOTH Snellen and LogMAR (e.g. '6/19 (0.5)')?", 'options': ['Snellen is familiar while LogMAR allows precise, statistically-valid tracking of change', 'It is just tradition with no benefit', 'LogMAR is only for children', 'Snellen is more accurate for research'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': "Dual recording keeps the familiar Snellen fraction while LogMAR's equal steps allow accurate monitoring and averaging.", 'reasoning_eligible': True},
                {'stem': "The LogMAR M&S Smart system is 'calibrated according to room length'. Why does this matter?", 'options': ['The letter sizes must match the testing distance to give a correct acuity', 'It changes the colours shown', 'It sets the room temperature', 'It has no effect on the reading'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Acuity depends on the angle subtended, so the display must be calibrated to the actual test distance to read correctly.', 'reasoning_eligible': True},
                {'stem': 'A patient becomes confused and starts guessing letters loudly. The best practice is to:', 'options': ['Encourage them to read only what they can clearly see, without guessing whole lines', 'Accept every guess as correct', 'End the test and record NPL', 'Move them closer until they pass'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Reliable acuity needs genuine reading, not guessing; gently coach the patient to report only letters they can actually see.', 'reasoning_eligible': True},
            ],
            "hard": [
                {'stem': 'A patient reads 6/36, improving only to 6/24 with the pinhole, and has a dense cataract. How do you interpret this?', 'options': ['Mainly a non-refractive (media) cause, perhaps with a small refractive component', 'Purely refractive error', 'Normal vision', 'A failed test that must be repeated'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Only slight pinhole improvement with a dense cataract suggests the reduced vision is mainly from media opacity, with maybe a small refractive part.', 'reasoning_eligible': True},
                {'stem': 'Why does the pinhole sharpen vision in uncorrected refractive error?', 'options': ['It blocks blurred peripheral rays so only central, focused rays reach the retina', 'It magnifies the chart letters', 'It increases the light entering the eye', 'It corrects the retina directly'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The pinhole admits only central light rays, removing the blur from out-of-focus peripheral rays — this sharpens the retinal image in refractive error.', 'reasoning_eligible': True},
                {'stem': 'Two patients both read 6/60. One improves to 6/9 with the pinhole; the other shows no change. What does this tell you?', 'options': ['The first likely has a refractive cause; the second likely has a media/retinal/nerve cause', 'Both have the same cause', 'Both need urgent surgery', 'Neither result is meaningful'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Pinhole improvement points to refractive error; no improvement points to a non-refractive cause (media opacity, retina or optic nerve).', 'reasoning_eligible': True},
                {'stem': 'A patient cannot see the chart at all. How do you test and record their vision correctly?', 'options': ['Test Count Fingers, then Hand Movement, then Perception of Light, and record the best level achieved', 'Record NPL immediately without further testing', 'Record 6/60 as a default', 'Skip the eye and test the other one only'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': "Step through CF → HM → PL → NPL and record the best level the patient can manage — don't jump straight to NPL.", 'reasoning_eligible': True},
                {'stem': 'Why must a significant unexplained VA drop be flagged even if the pinhole improves it somewhat?', 'options': ["Partial improvement doesn't exclude serious disease behind a new refractive change", 'Any pinhole improvement always means it is harmless', 'VA drops never need flagging', 'Only total loss of vision matters'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'A new, large VA drop can still hide serious disease even if a pinhole helps a little, so it is flagged for the doctor rather than assumed to be glasses.', 'reasoning_eligible': True},
                {'stem': 'Select ALL situations where you would apply the pinhole.', 'options': ['VA of 6/12', 'VA of 6/60', 'VA of Count Fingers due to suspected refractive error', 'VA of 6/6'], 'correct': [0, 1, 2], 'qtype': 'multi', 'kind': 'practical', 'explanation': 'Apply the pinhole when VA is reduced (6/12 or worse), including very low vision if a refractive cause is suspected. A normal 6/6 needs no pinhole.', 'reasoning_eligible': False},
                {'stem': "A patient's VA is 6/6 in each eye separately but they complain of poor vision. What is a sensible next consideration?", 'options': ['Check near vision and ask about symptoms not captured by distance VA', 'Record the complaint as invalid', 'Repeat distance VA ten times', 'Tell them their eyes are perfect and discharge'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': "Normal distance VA doesn't capture everything — near vision, field, or intermittent symptoms may explain the complaint and deserve attention.", 'reasoning_eligible': True},
                {'stem': 'Why is the pinhole NOT a substitute for a formal refraction?', 'options': ['It only screens for a refractive cause; it does not give the actual prescription', 'It gives a more accurate prescription than refraction', 'It measures eye pressure instead', 'It is only for children'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The pinhole only indicates whether a refractive cause is present; the exact lens powers still need a formal refraction.', 'reasoning_eligible': False},
                {'stem': 'Which statement about recording VA is correct?', 'options': ['Record the smallest line read, the eye, and whether correction/pinhole was used', 'Record only the largest line the patient can see', 'Record vision for both eyes together only', 'Recording the eye tested is unnecessary'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Good documentation notes the smallest line read, which eye, and whether glasses or a pinhole were used — so results are comparable over time.', 'reasoning_eligible': False},
                {'stem': 'A diabetic reads 6/9 today but read 6/6 three months ago, with no pinhole improvement. Why does this combination concern you?', 'options': ["A drop that the pinhole can't fix may reflect retinal change (e.g. macular oedema) — flag it", 'It is a normal day-to-day variation, ignore it', 'It means the patient needs new glasses only', 'Diabetics never have VA changes'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'A new VA drop not corrected by the pinhole in a diabetic raises concern for retinal involvement (e.g. macular oedema) and should be flagged.', 'reasoning_eligible': True},
                {'stem': 'Each full line on a LogMAR chart changes the score by 0.1 LogMAR. A patient improves from 0.6 to 0.3 LogMAR. How many lines did they gain?', 'options': ['3 lines', '1 line', '6 lines', 'No change'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': '0.6 - 0.3 = 0.3 LogMAR; at 0.1 per line that is a 3-line improvement, a clinically meaningful change.', 'reasoning_eligible': True},
                {'stem': 'You are testing an infected eye with the orange-sticker occluder. After finishing, the next essential step before the next patient is to:', 'options': ['Disinfect the equipment/occluder and perform hand hygiene', 'Reuse it immediately without cleaning', 'Store it with the clean occluders', 'Wipe it only if it looks dirty'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'After an infected case, disinfect the occluder/equipment and clean your hands to prevent transmission to the next patient.', 'reasoning_eligible': True},
                {'stem': 'A patient cannot read even the largest LogMAR line at 6m. What is the correct progression to grade vision?', 'options': ['Move to count fingers, then hand movements, then perception of light, then NPL', 'Immediately record NPL', 'Record 6/60 anyway', 'Skip straight to perception of light'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Below chart letters, step down through CF -> HM -> PL -> NPL, recording the best level the patient can achieve.', 'reasoning_eligible': True},
                {'stem': "A patient's right-eye VA is 6/9 with glasses but they insist their vision is 'terrible'. A sensible next step, given normal acuity, is to:", 'options': ['Consider factors acuity misses (fields, contrast, glare, near vision) and flag for the clinician', 'Tell them their vision is perfect and dismiss the concern', 'Repeat the same line ten times', 'Record NPL'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Good letter acuity does not exclude field loss, poor contrast or glare; document the discrepancy and let the clinician investigate.', 'reasoning_eligible': True},
                {'stem': 'Why must you check the patient is reading with the SAME correction and distance at each visit when trending VA?', 'options': ['Otherwise a change in glasses/distance, not the disease, could explain any difference', 'It does not matter how VA is measured', 'Only the room temperature matters', 'VA never changes between visits'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Consistent conditions (same correction, distance, chart) are essential so that a true VA change reflects the eye, not the method.', 'reasoning_eligible': True},
                {'stem': 'Which statement about LogMAR versus Snellen scoring is CORRECT?', 'options': ['On LogMAR a LOWER number is better vision, and its equal steps allow letter-by-letter scoring', 'On LogMAR a higher number is better vision', 'Snellen allows more precise averaging than LogMAR', 'LogMAR cannot be converted to Snellen'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'LogMAR decreases as vision improves (0.0 = 6/6) and its uniform 0.1 steps allow precise, per-letter scoring unlike Snellen.', 'reasoning_eligible': True},
            ],
        },
        "near_vision": {
            "easy": [
                {'stem': 'At what distance is the near vision (N) chart usually held?', 'options': ['35 cm', '6 metres', '1 metre', '10 cm'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'The near vision chart is held at about 35 cm — a normal reading distance.', 'reasoning_eligible': False},
                {'stem': 'What is normal near vision?', 'options': ['N5 (the finest print)', 'N48', '6/6', 'N18'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'N5 is the finest near print and represents normal near vision.', 'reasoning_eligible': False},
                {'stem': 'How is each eye tested for near vision?', 'options': ['Separately, with the other eye occluded', 'Both eyes together only', 'With both eyes closed', 'Only the dominant eye is tested'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Near vision is tested one eye at a time, with the other eye occluded.', 'reasoning_eligible': False},
                {'stem': 'Should reading correction be worn for the near VA test?', 'options': ['Yes — record near VA with correction in place', 'No — always test unaided', 'Only for children', 'Only if the patient asks'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': "Near VA is recorded with the patient's reading correction in place (and noted as such).", 'reasoning_eligible': False},
                {'stem': 'How is a near vision result documented?', 'options': ['As the smallest line read, e.g. N5, N6, N8, N10', 'As a Snellen fraction like 6/6', 'As a percentage', 'As pass or fail only'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Near vision is recorded as the smallest print read comfortably (N5, N6, N8, N10, etc.).', 'reasoning_eligible': False},
                {'stem': 'When is near vision typically tested?', 'options': ['On the first visit and when ordered', 'Only in an emergency', 'Never for adults', 'Only after surgery'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Near vision is checked on the first visit and whenever specifically ordered.', 'reasoning_eligible': False},
                {'stem': 'A patient holds reading material further away to focus. What does this suggest?', 'options': ['Presbyopia', 'Myopia', 'Glaucoma', 'Colour blindness'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Holding text further away to focus is a classic sign of presbyopia (age-related loss of near focus).', 'reasoning_eligible': False},
                {'stem': 'Why is adequate lighting important for the near vision test?', 'options': ['Poor lighting falsely reduces the recorded near acuity', 'Lighting has no effect on near vision', 'Bright light blurs near print', 'It only matters for distance vision'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Inadequate lighting can make near acuity look worse than it is, so good lighting is needed for a valid result.', 'reasoning_eligible': False},
                {'stem': 'What does presbyopia affect?', 'options': ['The ability to focus on near objects', 'Distance vision only', 'Colour perception', 'The visual field'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': "Presbyopia is the age-related loss of the eye's ability to focus up close.", 'reasoning_eligible': False},
                {'stem': 'Select ALL correct statements about testing near vision.', 'options': ['It is held at about 35 cm', 'Each eye is tested separately', 'Reading correction is worn and noted', 'It is recorded as a Snellen 6/x fraction'], 'correct': [0, 1, 2], 'qtype': 'multi', 'kind': 'theory', 'explanation': 'Near vision is held at ~35 cm, tested one eye at a time, with correction worn and noted. It is recorded as N-notation (N5, N6…), not a 6/x fraction.', 'reasoning_eligible': False},
                {'stem': 'The SNEC near-vision procedure specifies holding the reading card at approximately:', 'options': ['40 cm from the patient', '6 metres', '10 cm', '2 metres'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Near vision is tested at about 40 cm, a typical comfortable reading distance.', 'reasoning_eligible': False},
                {'stem': 'For a literate adult, which reading material is used for near vision testing at SNEC?', 'options': ['The Moorfields Reading Book (letter/number type)', 'The Snellen distance chart at 6 m', 'An Amsler grid', 'An Ishihara book'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Literate adults/children use reading books such as Moorfields, Curpax or Maclure reading type.', 'reasoning_eligible': False},
                {'stem': "A near-vision reading of 'N5' or 'J2' should be documented together with:", 'options': ['Whether it was with or without glasses', "The patient's phone number", 'The room number only', 'Nothing else is needed'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': "Record e.g. 'N5 with glasses' - the correction used matters for interpreting the result.", 'reasoning_eligible': False},
                {'stem': 'As with distance testing, near vision is tested one eye at a time, starting with the:', 'options': ['Right eye (occluding the left)', 'Left eye', 'Both eyes together', 'Worse eye'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'By convention the right eye is tested first with the left occluded, then the left eye.', 'reasoning_eligible': False},
                {'stem': 'Good lighting is required for near-vision testing because:', 'options': ['Poor light artificially worsens the reading result', "It changes the eye's refraction", "It is only for the tester's comfort", 'It has no effect on reading'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Adequate, standardised lighting ensures the recorded near acuity reflects the eye, not dim conditions.', 'reasoning_eligible': True},
                {'stem': 'The occluder used for near testing should be wiped with alcohol:', 'options': ['Before AND after the procedure', 'Never', 'Only once a month', 'Only if visibly dirty'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Disinfecting the occluder before and after each patient is a standard infection-control step.', 'reasoning_eligible': False},
                {'stem': 'A patient who cannot read letters (illiterate) can still have near vision tested using:', 'options': ["A matching card with reduced Snellen or Kay's near cards", 'Only the letter reading book', 'No test is possible', 'The distance chart at 6 m'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': "For non-readers, a matching card (reduced Snellen or Kay's pictures) lets them match symbols instead of naming letters.", 'reasoning_eligible': True},
            ],
            "medium": [
                {'stem': 'A 50-year-old reads N10 unaided but N5 with a reading add. What is the diagnosis?', 'options': ['Presbyopia', 'Myopia', 'Cataract', 'Macular degeneration'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Improving from N10 to N5 with a reading add at age 50 is classic presbyopia.', 'reasoning_eligible': True},
                {'stem': 'Distance VA is 6/6 but near VA is reduced. What pattern does this suggest?', 'options': ['Presbyopia (age-related loss of near focus)', 'Cataract', 'Glaucoma', 'Retinal detachment'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Good distance vision with poor near vision is the typical pattern of presbyopia.', 'reasoning_eligible': True},
                {'stem': 'Why must reading correction be worn (and noted) for the near test?', 'options': ["Near vision is meaningful at the patient's working correction, and it must be comparable later", 'Glasses always make near vision worse', 'It is only for cosmetic reasons', 'Correction is irrelevant to near vision'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Recording near VA with the usual reading correction (and noting it) makes the result clinically meaningful and comparable at later visits.', 'reasoning_eligible': False},
                {'stem': 'A young patient with good distance vision struggles to read N5 and gets headaches when reading. What might this suggest?', 'options': ['Uncorrected hyperopia or a near/focusing problem worth review', 'Definite presbyopia (they are too young)', 'A retinal detachment', 'Normal vision — no action needed'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'A young person is too young for presbyopia; near difficulty with headaches may reflect uncorrected long-sightedness or a focusing problem worth review.', 'reasoning_eligible': True},
                {'stem': "How is a near vision result of 'smallest comfortable line N8' recorded?", 'options': ['As N8', 'As 6/8', 'As 80%', 'As N5'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Near vision is recorded in N-notation as the smallest line read comfortably — here N8.', 'reasoning_eligible': False},
                {'stem': 'Why test near vision separately from distance vision?', 'options': ['Near and distance focus can be affected independently', 'They always give the same result', 'Near vision replaces the distance test', 'It is only done to fill in the form'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Distance and near focusing can be affected independently (e.g. presbyopia spares distance), so both are tested.', 'reasoning_eligible': False},
                {'stem': "A patient's near vision is worse in dim restaurant lighting than in clinic. What is the likely explanation?", 'options': ['Reduced lighting lowers near acuity, especially with early lens changes', 'Their eyes are healthier in dim light', 'Near vision is unaffected by light', 'They are imagining the difference'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Near acuity falls in poor light, and early lens changes make this worse — a common real-world complaint.', 'reasoning_eligible': True},
                {'stem': 'Select ALL findings consistent with simple presbyopia.', 'options': ['Reduced near vision that improves with a reading add', 'Normal distance vision', 'Onset around the 40s-50s', 'Sudden painful loss of vision'], 'correct': [0, 1, 2], 'qtype': 'multi', 'kind': 'practical', 'explanation': 'Presbyopia gives reduced near vision corrected by a reading add, normal distance vision, and onset in the 40s-50s. Sudden painful vision loss is NOT presbyopia.', 'reasoning_eligible': False},
                {'stem': 'Near vision is reduced AND does not improve with a reading add in an older patient. What does this suggest?', 'options': ['Something beyond presbyopia (e.g. macular problem) — worth review', 'Definitely just presbyopia', 'A refractive error in the distance only', 'Normal ageing, no action'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': "If a reading add doesn't help, the cause may be beyond presbyopia (e.g. a macular problem) and should be reviewed.", 'reasoning_eligible': True},
                {'stem': 'Why record the near working distance if it differs from 35 cm?', 'options': ['Some patients (e.g. musicians) need vision at a specific distance, which affects the add', 'The distance never matters', 'It changes the eye being tested', 'Only 35 cm is ever acceptable'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Some patients need clear vision at a particular working distance, so noting it helps the doctor choose the right reading add.', 'reasoning_eligible': False},
                {'stem': 'A young child who cannot name letters needs near vision assessed. The best tool is:', 'options': ["Kay's screening near card with a matching card", 'The adult Moorfields letter book only', 'The Ishihara plates', 'No test until they can read'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': "Kay's pictures with a matching card allow pre-literate children to point/match, giving a usable near acuity.", 'reasoning_eligible': True},
                {'stem': 'A presbyopic clerk complains of blur only for fine print at work. Which detail is most useful to record?', 'options': ['The near acuity with their reading correction and the working distance used', 'Their distance acuity only', 'Their favourite font', 'The colour of the print'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Documenting near acuity with correction and the actual working distance guides the reading-add prescription.', 'reasoning_eligible': True},
                {'stem': "'N' notation (e.g. N5, N8) and 'J' notation (e.g. J2) both describe:", 'options': ['Near-vision print sizes on reading charts', 'Distance acuity', 'Intraocular pressure', 'Colour vision'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'N (point size) and J (Jaeger) are two scales for near reading print sizes; both are recorded for near VA.', 'reasoning_eligible': False},
                {'stem': 'A patient forgot their reading glasses. The correct action for the near test is to:', 'options': ['Test and clearly document that it was done WITHOUT reading correction', 'Cancel the test', 'Lend them any random glasses', 'Record it as N5 anyway'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': "You can still test unaided, but must document 'without glasses' so the result is interpreted correctly.", 'reasoning_eligible': True},
                {'stem': "Why does the near-vision procedure begin (like other tests) with checking the doctor's order and two patient identifiers?", 'options': ['To ensure the right test is done on the right patient and recorded correctly', 'It is optional paperwork', 'It improves the lighting', 'It calibrates the reading book'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Confirming the order and identity prevents wrong-test/wrong-patient errors and mis-filed results.', 'reasoning_eligible': True},
                {'stem': 'A patient reads N8 at 40 cm but says they read fine at home. What is a sensible note to add?', 'options': ['Their habitual working distance may differ from 40 cm - record the distance used', 'That they are exaggerating', 'Nothing - ignore the discrepancy', 'Record N5 to match their claim'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Reading comfort depends on the working distance; noting the distance used explains apparent discrepancies.', 'reasoning_eligible': True},
                {'stem': 'Why is near vision recorded as a baseline observation at many visits?', 'options': ['To monitor change in near visual function over time', 'To fill the record with numbers', 'Because distance vision cannot be trusted', 'It replaces the eye examination'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Serial near-vision readings act as a baseline to detect change and monitor conditions affecting reading.', 'reasoning_eligible': False},
            ],
            "hard": [
                {'stem': 'A 48-year-old reports recent reading difficulty. Distance VA is 6/6, near improves from N10 to N5 with a +1.50 add. What is the diagnosis and the reasoning?', 'options': ['Presbyopia — age-appropriate loss of near focus corrected by a reading add', 'Cataract — the lens is opaque', 'Macular degeneration — central vision is destroyed', 'Glaucoma — peripheral field is lost'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Age 48, normal distance vision, and near vision corrected by a plus add is textbook presbyopia.', 'reasoning_eligible': True},
                {'stem': 'Why does presbyopia spare distance vision while reducing near vision?', 'options': ['The ageing lens loses flexibility needed to focus up close, but distance focus is unaffected', 'It damages the retina centrally', 'It clouds the lens like a cataract', 'It raises the eye pressure'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'With age the lens stiffens and can no longer change shape to focus near objects; distance focus needs no such change, so it is preserved.', 'reasoning_eligible': True},
                {'stem': 'An elderly patient has reduced near vision that a reading add does NOT improve, plus distortion of straight lines. What should you do?', 'options': ["Suspect a macular problem and flag for review (it's not simple presbyopia)", 'Prescribe a stronger reading add and discharge', 'Reassure that it is normal ageing', 'Repeat only the distance VA'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Near vision unhelped by an add, with distortion, suggests a macular problem (e.g. AMD) rather than presbyopia — flag for review.', 'reasoning_eligible': True},
                {'stem': 'Select ALL factors that could make a near vision result unreliable.', 'options': ['Poor lighting', 'Holding the chart at the wrong distance', 'Not wearing the usual reading correction', 'Testing each eye separately'], 'correct': [0, 1, 2], 'qtype': 'multi', 'kind': 'practical', 'explanation': 'Poor light, wrong test distance, and missing reading correction all make near VA unreliable. Testing each eye separately is correct technique, not a source of error.', 'reasoning_eligible': False},
                {'stem': 'Why can a patient have 6/6 distance vision yet be unable to read a menu comfortably?', 'options': ['Distance and near focus are separate; near focus can fail (presbyopia) while distance is normal', '6/6 vision is impossible with reading trouble', 'The menu print is always too small to read', 'They must be exaggerating'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Distance acuity (6/6) says nothing about near focusing; presbyopia commonly leaves distance perfect while near reading suffers.', 'reasoning_eligible': True},
                {'stem': "A patient claims their 'old glasses stopped working' for reading after a few years. What is the most likely explanation?", 'options': ['Presbyopia has progressed, so a stronger reading add is needed', 'The glasses physically wore out', 'Their distance vision has failed', 'They have developed colour blindness'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Presbyopia increases with age, so an add that worked a few years ago may now be too weak — a stronger reading add is usually needed.', 'reasoning_eligible': True},
                {'stem': 'Which statement best contrasts presbyopia with myopia?', 'options': ['Presbyopia reduces NEAR vision with age; myopia blurs DISTANCE vision', 'Both blur only near vision', 'Presbyopia blurs distance; myopia blurs near', 'They are the same condition'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Presbyopia is an age-related NEAR problem; myopia (short sight) blurs DISTANCE vision. They are different.', 'reasoning_eligible': False},
                {'stem': 'How would you document a near test where the patient reads N6 right eye and N8 left eye, both with reading glasses?', 'options': ['RE N6, LE N8, with reading correction', 'Near vision 6/6 both eyes', 'N6 both eyes together', 'Pass, with no detail'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': "Record each eye's smallest line and that reading correction was worn: RE N6, LE N8 (with correction).", 'reasoning_eligible': False},
                {'stem': 'Why is it useful to compare near vision between visits, not just within one visit?', 'options': ['A genuine decline over time can signal disease, separate from a fixed presbyopic level', 'Near vision never changes once measured', 'Comparison is only needed for distance vision', 'It is done only for paperwork'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': 'Tracking near vision over visits can reveal a real decline (e.g. macular change) as opposed to a stable presbyopic baseline.', 'reasoning_eligible': True},
                {'stem': "A diabetic's near vision fluctuates day to day. What is a plausible explanation worth noting?", 'options': ["Blood sugar swings can temporarily shift the eye's focus", 'Diabetes never affects vision', 'Near charts are simply unreliable', 'The patient needs new frames'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': 'Fluctuating blood glucose can cause temporary refractive shifts and variable vision — worth noting in a diabetic before changing glasses.', 'reasoning_eligible': True},
                {'stem': 'An elderly patient reads only N18 even WITH their reading glasses and reports central distortion. The most appropriate response is to:', 'options': ['Document the poor aided near vision and distortion and flag for clinician review (possible macular disease)', 'Reassure that it is just old glasses', 'Give a stronger reading add and discharge', 'Ignore the distortion'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Near vision that a reading add cannot correct, with distortion, suggests macular pathology and needs clinician assessment (e.g. Amsler/OCT).', 'reasoning_eligible': True},
                {'stem': 'A patient with an infected right eye needs near vision tested. Best practice is to:', 'options': ['Use disinfected/appropriate equipment, test carefully and clean/hand-hygiene afterwards to avoid cross-infection', 'Skip infection control to save time', 'Use the same unwiped occluder for the next patient', 'Refuse to test the patient'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'As with distance testing, infected eyes require strict cleaning of equipment and hand hygiene to prevent spread.', 'reasoning_eligible': True},
                {'stem': "A 45-year-old with 6/6 distance vision now needs to hold text at arm's length and reads only N12 unaided, improving to N5 with a +1.00 add. This pattern indicates:", 'options': ['Early presbyopia - reduced accommodation corrected by a reading add', 'Cataract', 'Retinal detachment', 'Optic neuritis'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': 'Age-related loss of accommodation (presbyopia) spares distance vision and is corrected by a plus reading add - the classic mid-40s picture.', 'reasoning_eligible': True},
                {'stem': 'How should you record a near test where the right eye reads N6 and the left reads N8, both with reading glasses?', 'options': ["N6 (right) and N8 (left), both 'with glasses', at the tested distance", "Just 'N6 both eyes'", 'Only the better eye', 'As a single averaged value'], 'correct': [0], 'qtype': 'single', 'kind': 'practical', 'explanation': "Record each eye separately with the correction used (and distance if non-standard), e.g. 'RE N6 c gls, LE N8 c gls'.", 'reasoning_eligible': True},
                {'stem': 'A diabetic reports their near vision is sharp some days and blurred others. A plausible explanation worth noting is:', 'options': ['Fluctuating blood glucose transiently shifts the lens refraction', 'The reading book is faulty', 'They are imagining it', 'Near vision never fluctuates'], 'correct': [0], 'qtype': 'single', 'kind': 'situational', 'explanation': "Swings in blood glucose change the lens's hydration and power, causing day-to-day refractive (and reading) fluctuation - worth documenting.", 'reasoning_eligible': True},
                {'stem': 'Which statement about near-vision testing is CORRECT?', 'options': ['It is done at ~40 cm, one eye at a time, with any reading correction worn and clearly documented', 'It is done at 6 m without correction', 'Both eyes are always tested together only', 'The correction used never needs recording'], 'correct': [0], 'qtype': 'single', 'kind': 'theory', 'explanation': "Near VA is tested monocularly at ~40 cm, with the patient's reading correction, and the result recorded with/without glasses.", 'reasoning_eligible': True},
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

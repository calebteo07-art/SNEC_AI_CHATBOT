from tools.video.timeline import SCENES, total_duration

def test_seven_scenes_unique_ids():
    ids = [s.id for s in SCENES]
    assert len(SCENES) == 7
    assert len(set(ids)) == 7

def test_total_duration_fast_paced_window():
    assert 40.0 <= total_duration() <= 90.0

def test_every_scene_has_required_fields():
    for s in SCENES:
        assert s.caption and s.source and s.duration > 0
        assert s.source in {"broll", "live", "stills", "brand"}

def test_feature_beats_in_requested_order():
    # Virtual Patients -> AI Tutor -> Flashcards (per user direction)
    feature_labels = [s.label for s in SCENES if s.label]
    assert feature_labels[:3] == ["Virtual Patients", "AI Tutor", "Flashcards"]

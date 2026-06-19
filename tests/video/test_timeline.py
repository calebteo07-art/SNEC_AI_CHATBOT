from tools.video.timeline import SCENES, total_duration

def test_eight_scenes_in_order():
    assert [s.id for s in SCENES] == ["01","02","03","04","05","06","07","08"]

def test_total_duration_within_window():
    assert 60.0 <= total_duration() <= 90.0

def test_every_scene_has_required_fields():
    for s in SCENES:
        assert s.caption and s.source and s.duration > 0
        assert s.source in {"broll","live","stills","brand"}

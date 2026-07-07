from tools.brand.logo_poses import BG_KEY, POSES, Pose, prompt


def test_registry_is_exactly_the_three_paid_poses():
    assert set(POSES) == {"wave", "cheer", "groove"}
    assert "rest" not in POSES  # rest = reused iris.png, never generated
    for pid, pose in POSES.items():
        assert isinstance(pose, Pose)
        assert pose.id == pid
        assert pose.pose_line


def test_prompt_carries_anchor_pose_and_guards():
    p = prompt(POSES["wave"])
    assert "same one-eyed EyeBot mascot" in p       # identity anchor
    assert POSES["wave"].pose_line in p              # the pose line
    assert BG_KEY in p                               # keyable background
    low = p.lower()
    assert "no text" in low and "no watermark" in low

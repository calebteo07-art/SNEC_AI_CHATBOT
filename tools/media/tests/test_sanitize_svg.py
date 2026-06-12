"""Injection fixtures for the fail-closed SVG sanitizer."""
import pytest

from tools.media.sanitize_svg import SvgRejected, sanitize_svg

CLEAN = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <radialGradient id="g"><stop offset="0" stop-color="#3C90FF"/><stop offset="1" stop-color="#AD72FF" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="50" cy="50" r="40" fill="url(#g)" opacity="0.8"/>
  <path d="M10 50 Q 50 10 90 50" stroke="#00BDD2" stroke-width="2" fill="none"/>
</svg>"""


def test_clean_passes():
    assert sanitize_svg(CLEAN) == CLEAN


@pytest.mark.parametrize(
    "payload",
    [
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><circle r="5" onload="alert(1)"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body xmlns="http://www.w3.org/1999/xhtml">x</body></foreignObject></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><circle r="5"/></a></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="https://evil/x.svg#a"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><circle r="5" fill="url(https://evil/f.svg#g)"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><circle r="5" style="background:url(javascript:alert(1))"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:text/html,<script>alert(1)</script>"/></svg>',
        '<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>',
        "plain text, not svg",
    ],
)
def test_hostile_rejected(payload):
    with pytest.raises(SvgRejected):
        sanitize_svg(payload)


def test_local_href_allowed():
    doc = '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="lg"><stop offset="0" stop-color="#FFCF03"/></linearGradient></defs><rect width="10" height="10" fill="url(#lg)"/></svg>'
    assert sanitize_svg(doc) == doc

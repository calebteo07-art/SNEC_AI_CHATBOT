import pytest
from unittest.mock import MagicMock, patch


def test_ensure_sheet_creates_if_missing():
    mock_spreadsheet = MagicMock()
    mock_spreadsheet.worksheet.side_effect = Exception("WorksheetNotFound")
    mock_spreadsheet.add_worksheet.return_value = MagicMock()

    from tools.profile.bootstrap_sheets import ensure_sheet
    with patch("tools.profile.bootstrap_sheets._get_spreadsheet", return_value=mock_spreadsheet):
        ensure_sheet("test_sheet", ["col_a", "col_b"])

    mock_spreadsheet.add_worksheet.assert_called_once()


def test_ensure_sheet_skips_if_exists():
    mock_ws = MagicMock()
    mock_spreadsheet = MagicMock()
    mock_spreadsheet.worksheet.return_value = mock_ws

    from tools.profile.bootstrap_sheets import ensure_sheet
    with patch("tools.profile.bootstrap_sheets._get_spreadsheet", return_value=mock_spreadsheet):
        ensure_sheet("test_sheet", ["col_a", "col_b"])

    mock_spreadsheet.add_worksheet.assert_not_called()

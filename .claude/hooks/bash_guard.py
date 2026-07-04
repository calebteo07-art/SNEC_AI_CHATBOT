"""PreToolUse guard: block PowerShell cmdlets sent to the Bash tool.

Why: 32 sessions in the June-2026 audit hit exit-127 ("command not found")
because PS cmdlets (Start-Process, Start-Sleep, Get-ChildItem...) were run in
Git Bash. Bash never parses PS syntax; the fix is always "use the PowerShell
tool or the POSIX equivalent". This hook fails fast with that message.

Contract: reads the hook JSON on stdin; exit 0 = allow, exit 2 = block
(stderr is shown to the model). Anything unexpected -> allow (fail open:
a broken guard must never brick the Bash tool).
"""
import json
import re
import sys

CMDLETS = (
    "Start-Process|Start-Sleep|Start-Job|Stop-Process|Get-ChildItem|Get-Content|"
    "Get-Item|Get-Process|Get-Command|Get-Date|Get-Job|Get-FileHash|Select-Object|"
    "Select-String|Sort-Object|Format-Table|Format-List|Where-Object|ForEach-Object|"
    "Invoke-WebRequest|Invoke-RestMethod|Invoke-Item|Out-Null|Out-File|Out-String|"
    "Test-Path|Copy-Item|Move-Item|Remove-Item|New-Item|Measure-Object|Tee-Object|"
    "Set-Location|Set-Content|Add-Content|Write-Host|Write-Output|Receive-Job|"
    "ConvertTo-Json|ConvertFrom-Json|Compare-Object|Expand-Archive|Compress-Archive"
)
# Command position only (start of command / after ; | & && || $( ` or newline)
# so strings like grep "Set-Cookie" never false-positive.
CMDLET_RE = re.compile(r"(?:^|[;&|]\s*|\$\(\s*|`\s*|\n\s*)(" + CMDLETS + r")\b")
# Legit escape hatch: explicitly shelling out to PowerShell from Bash.
PS_INVOKE_RE = re.compile(r"\b(?:powershell|pwsh)(?:\.exe)?\b", re.I)


def main() -> int:
    try:
        payload = json.load(sys.stdin)
        if payload.get("tool_name") != "Bash":
            return 0
        command = payload.get("tool_input", {}).get("command", "") or ""
    except Exception:
        return 0  # fail open

    if PS_INVOKE_RE.search(command):
        return 0

    match = CMDLET_RE.search(command)
    if match:
        sys.stderr.write(
            f"BLOCKED: PowerShell cmdlet '{match.group(1)}' in the Bash tool -> "
            "exit-127 'command not found'. Use the PowerShell tool for cmdlets, "
            "or the POSIX equivalent in Bash (ls, cp, rm, sleep, curl, ps).\n"
        )
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())

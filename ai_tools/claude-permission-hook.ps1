#!/usr/bin/env pwsh
# Claude Permission Hook - Uses Claude itself to evaluate command safety and reasonableness

# Read JSON input from stdin
$inputJson = [Console]::In.ReadToEnd()
$hookInput = $inputJson | ConvertFrom-Json

# Extract relevant information
$toolName = $hookInput.tool_name
$toolInput = $hookInput.tool_input
$command = $toolInput.command
$cwd = $hookInput.cwd
$transcriptPath = $hookInput.transcript_path

# Function to get recent conversation context
function Get-ConversationContext {
    param($transcriptPath, $maxLines = 10)

    if (-not (Test-Path $transcriptPath)) {
        return "No conversation history available."
    }

    try {
        # Read last N lines from the transcript
        $lines = Get-Content $transcriptPath -Tail $maxLines

        # Parse JSONL and extract relevant messages
        $context = @()
        foreach ($line in $lines) {
            if ($line.Trim()) {
                try {
                    $entry = $line | ConvertFrom-Json
                    if ($entry.type -eq "text") {
                        $context += $entry.text
                    }
                } catch {
                    # Skip malformed lines
                }
            }
        }

        return ($context -join "`n`n")
    } catch {
        return "Could not read conversation history."
    }
}

# Get conversation context
$conversationContext = Get-ConversationContext -transcriptPath $transcriptPath

# Create prompt for Claude to evaluate the command
$prompt = @"
You are evaluating whether a command should be auto-approved for execution. Analyze both REASONABLENESS and SAFETY.

CURRENT WORKING DIRECTORY: $cwd
TOOL: $toolName

COMMAND TO EVALUATE:
$command

RECENT CONVERSATION CONTEXT:
$conversationContext

EVALUATION CRITERIA:

1. REASONABLENESS: Does this command make sense given the recent conversation context?
   - Is it related to what's being discussed?
   - Does it align with the user's apparent intent?

2. SAFETY: Is this command safe to run?
   - Won't delete critical system files (e.g., rm -rf /windows, rm -rf c:\windows)
   - Won't modify critical system directories
   - Won't run dangerous operations without proper safeguards
   - Won't cause unintended widespread changes

RESPOND WITH EXACTLY ONE OF:
APPROVE - If the command is both reasonable and safe
DENY: [brief reason] - If the command should not be auto-approved

Be concise. Only deny if there's a real concern about safety or if the command is completely unrelated to the conversation.
"@

# Call Claude in prompt mode to evaluate
try {
    $evaluation = $prompt | claude -p 2>&1

    if ($LASTEXITCODE -ne 0) {
        # Claude failed, default to denying for safety
        $response = @{
            hookSpecificOutput = @{
                hookEventName = "PermissionRequest"
                decision = @{
                    behavior = "deny"
                    message = "Hook error: Could not evaluate command with Claude"
                    interrupt = $false
                }
            }
        }
        $response | ConvertTo-Json -Depth 10 -Compress
        exit 0
    }

    # Check if Claude approved
    if ($evaluation -match '^\s*APPROVE\s*$') {
        # Approve the command
        $response = @{
            hookSpecificOutput = @{
                hookEventName = "PermissionRequest"
                decision = @{
                    behavior = "allow"
                }
            }
        }
    } else {
        # Extract denial reason if present
        $denyReason = "Command evaluation did not pass safety/reasonableness check"
        if ($evaluation -match 'DENY:\s*(.+)') {
            $denyReason = $matches[1].Trim()
        }

        # Deny the command
        $response = @{
            hookSpecificOutput = @{
                hookEventName = "PermissionRequest"
                decision = @{
                    behavior = "deny"
                    message = "Auto-evaluation: $denyReason"
                    interrupt = $false
                }
            }
        }
    }

    # Output the decision
    $response | ConvertTo-Json -Depth 10 -Compress
    exit 0

} catch {
    # Error occurred, deny for safety
    Write-Error "Hook error: $_"
    exit 2
}

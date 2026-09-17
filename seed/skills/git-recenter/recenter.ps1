#Requires -Version 7
# recenter.ps1 — deterministic core for the git-recenter skill.
# Every command prints a single JSON object to stdout. Exit 0 = success, 1 = error JSON.
# This script NEVER pushes and never commits on the default branch.
[CmdletBinding()]
param(
    [Parameter(Mandatory, Position = 0)]
    [ValidateSet('status', 'table', 'checkpoint', 'switch', 'cleanup')]
    [string]$Command,
    [string]$Branch,
    [switch]$Create,
    [switch]$Park,
    [string]$Label = 'parked files',
    [string[]]$Carry = @(),
    [string[]]$Branches = @(),
    # The default branch. Pass the repo's configured value (skills/sdd.config.json repo.defaultBranch)
    # when one exists; when omitted the script detects it (origin/HEAD, then local main/master/trunk).
    [string]$DefaultBranch = ''
)

$ErrorActionPreference = 'Continue'
$script:CheckpointPrefix = 'wip(recenter): checkpoint'

# pwsh -File passes "a,b" as one string — normalize list params either way.
$Carry = @($Carry | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$Branches = @($Branches | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })

function Out-Result([System.Collections.IDictionary]$Data) {
    $Data | ConvertTo-Json -Depth 8
    exit 0
}

function Out-Fail([string]$Code, [string]$Message, [hashtable]$Extra = @{}) {
    $o = [ordered]@{ error = $Code; message = $Message }
    foreach ($k in $Extra.Keys) { $o[$k] = $Extra[$k] }
    $o | ConvertTo-Json -Depth 8
    exit 1
}

# Named Invoke-Git (not Git): a function named Git would shadow git.exe and recurse.
function Invoke-Git([string[]]$GitArgs) {
    $out = & git @GitArgs 2>&1
    [pscustomobject]@{
        Ok   = ($LASTEXITCODE -eq 0)
        Code = $LASTEXITCODE
        Out  = (@($out) | ForEach-Object { "$_" }) -join "`n"
    }
}

function Get-DefaultBranch {
    if ($DefaultBranch) {
        if ((Invoke-Git @('show-ref', '--verify', '--quiet', "refs/heads/$DefaultBranch")).Ok) { return $DefaultBranch }
        Out-Fail 'NO_DEFAULT_BRANCH' "Configured default branch '$DefaultBranch' does not exist locally."
    }
    $r = Invoke-Git @('symbolic-ref', '--short', 'refs/remotes/origin/HEAD')
    if ($r.Ok) { return ($r.Out.Trim() -replace '^origin/', '') }
    foreach ($cand in 'main', 'master', 'trunk') {
        if ((Invoke-Git @('show-ref', '--verify', '--quiet', "refs/heads/$cand")).Ok) { return $cand }
    }
    Out-Fail 'NO_DEFAULT_BRANCH' 'Cannot determine default branch: no origin/HEAD and no local main/master/trunk.'
}

function Get-CurrentBranch {
    $r = Invoke-Git @('rev-parse', '--abbrev-ref', 'HEAD')
    if (-not $r.Ok) { Out-Fail 'NOT_A_REPO' $r.Out }
    $r.Out.Trim()
}

function Get-DirtyFiles {
    $r = Invoke-Git @('status', '--porcelain')
    if (-not $r.Ok) { Out-Fail 'GIT_STATUS_FAILED' $r.Out }
    $files = [System.Collections.Generic.List[object]]::new()
    foreach ($line in ($r.Out -split "`n")) {
        if (-not $line.Trim()) { continue }
        $status = $line.Substring(0, 2).Trim()
        $path = $line.Substring(3)
        if ($path -match ' -> ') { $path = ($path -split ' -> ')[-1] }
        $files.Add([ordered]@{ status = $status; path = $path.Trim('"') })
    }
    $files
}

function Get-RecenterStashes {
    $r = Invoke-Git @('stash', 'list', '--format=%gd|%s')
    $stashes = [System.Collections.Generic.List[object]]::new()
    if (-not $r.Ok -or -not $r.Out.Trim()) { return @() }
    foreach ($line in ($r.Out -split "`n")) {
        if (-not $line.Trim()) { continue }
        $ref, $subject = $line -split '\|', 2
        if ($subject -notmatch 'recenter') { continue }
        $filesR = Invoke-Git @('stash', 'show', '-u', '--name-only', $ref)
        if (-not $filesR.Ok) { $filesR = Invoke-Git @('stash', 'show', '--name-only', $ref) }
        $files = @(if ($filesR.Ok) { $filesR.Out -split "`n" | Where-Object { $_.Trim() } })
        $msg = if ($subject -match '(recenter.*)$') { $Matches[1] } else { $subject.Trim() }
        $stashes.Add([ordered]@{ ref = $ref.Trim(); message = $msg; files = $files })
    }
    $stashes
}

function Test-CheckpointTip {
    $r = Invoke-Git @('log', '-1', '--format=%s')
    $r.Ok -and $r.Out.Trim().StartsWith($script:CheckpointPrefix)
}

switch ($Command) {

    'status' {
        $default = Get-DefaultBranch
        $current = Get-CurrentBranch
        Out-Result ([ordered]@{
            branch          = $current
            defaultBranch   = $default
            onDefault       = ($current -eq $default)
            dirty           = @(Get-DirtyFiles)
            checkpointOnTip = (Test-CheckpointTip)
            stashes         = @(Get-RecenterStashes)
        })
    }

    'checkpoint' {
        $default = Get-DefaultBranch
        $current = Get-CurrentBranch
        if ($current -eq $default) {
            Out-Fail 'REFUSED_ON_DEFAULT' "Refusing to checkpoint-commit on '$default'. Clean it up first (commit to a branch, stash, or discard), then re-run."
        }
        $dirty = @(Get-DirtyFiles)
        if ($dirty.Count -eq 0) {
            Out-Result ([ordered]@{ committed = $false; reason = 'working tree clean'; carried = @($Carry) })
        }
        $add = Invoke-Git @('add', '-A')
        if (-not $add.Ok) { Out-Fail 'ADD_FAILED' $add.Out }
        foreach ($c in $Carry) {
            $rs = Invoke-Git @('reset', '-q', '--', $c)
            if (-not $rs.Ok) { Out-Fail 'CARRY_UNSTAGE_FAILED' "Could not unstage carry file '$c': $($rs.Out)" }
        }
        $stagedCheck = Invoke-Git @('diff', '--cached', '--quiet')
        if ($stagedCheck.Ok) {
            Out-Result ([ordered]@{ committed = $false; reason = 'nothing to commit outside the carry set'; carried = @($Carry) })
        }
        $msg = "$($script:CheckpointPrefix) $((Get-Date).ToUniversalTime().ToString('yyyy-MM-dd HH:mm'))Z"
        $commit = Invoke-Git @('commit', '-m', $msg)
        if (-not $commit.Ok) { Out-Fail 'COMMIT_FAILED' $commit.Out }
        $sha = (Invoke-Git @('rev-parse', '--short', 'HEAD')).Out.Trim()
        Out-Result ([ordered]@{ committed = $true; sha = $sha; message = $msg; branch = $current; carried = @($Carry) })
    }

    'switch' {
        if (-not $Branch) { Out-Fail 'BAD_ARGS' 'switch requires -Branch <name>.' }
        $default = Get-DefaultBranch
        $result = [ordered]@{ from = (Get-CurrentBranch); branch = $Branch }

        if ($Park) {
            $dirty = @(Get-DirtyFiles)
            if ($dirty.Count -gt 0) {
                $msg = "recenter: $Label ($(Get-Date -Format 'yyyy-MM-dd'))"
                $s = Invoke-Git @('stash', 'push', '-u', '-m', $msg)
                if (-not $s.Ok) { Out-Fail 'STASH_FAILED' $s.Out }
                $result.parked = [ordered]@{ message = $msg; files = @($dirty | ForEach-Object { $_.path }) }
            }
        }

        if ($Create) {
            $sw = Invoke-Git @('switch', '-c', $Branch)
            if (-not $sw.Ok) { Out-Fail 'CREATE_FAILED' $sw.Out }
            $result.created = $true
        }
        elseif ($Branch -ne (Get-CurrentBranch)) {
            $sw = Invoke-Git @('switch', $Branch)
            if (-not $sw.Ok) {
                # Stash-bridge: carry dirty files across a refused switch.
                $bridge = Invoke-Git @('stash', 'push', '-u', '-m', 'recenter-bridge (temporary)')
                if (-not $bridge.Ok) { Out-Fail 'SWITCH_FAILED' "$($sw.Out)`n$($bridge.Out)" }
                $sw2 = Invoke-Git @('switch', $Branch)
                if (-not $sw2.Ok) {
                    Invoke-Git @('stash', 'pop') | Out-Null
                    Out-Fail 'SWITCH_FAILED' $sw2.Out
                }
                $pop = Invoke-Git @('stash', 'pop')
                if (-not $pop.Ok) {
                    Out-Fail 'POP_CONFLICT' "Carried files conflict with '$Branch'. The pop left conflict markers in the working tree; the original carried files are safe in the top stash entry ('recenter-bridge (temporary)'). Resolve the conflicts, then 'git stash drop' — or 'git checkout --merge' the files from the stash." @{ branch = $Branch; stashKept = $true }
                }
                $result.bridge = 'stash-bridged'
            }
        }

        if ($Branch -eq $default) {
            $fetch = Invoke-Git @('fetch', '--quiet', 'origin')
            if ($fetch.Ok -and (Invoke-Git @('show-ref', '--verify', '--quiet', "refs/remotes/origin/$default")).Ok) {
                $behind = [int](Invoke-Git @('rev-list', '--count', "HEAD..origin/$default")).Out.Trim()
                $localOnly = [int](Invoke-Git @('rev-list', '--count', "origin/$default..HEAD")).Out.Trim()
                if ($localOnly -gt 0) {
                    $result.fastForward = "skipped: $default has $localOnly local-only commit(s) (diverged) — not touching it"
                }
                elseif ($behind -gt 0) {
                    $ff = Invoke-Git @('merge', '--ff-only', "origin/$default")
                    $result.fastForward = if ($ff.Ok) { "advanced $behind commit(s) to origin/$default" } else { "failed: $($ff.Out)" }
                }
                else { $result.fastForward = 'already up to date' }
            }
            else { $result.fastForward = 'skipped: fetch failed or no origin (offline?)' }
        }

        # Auto-uncommit a recenter checkpoint on arrival (never on the default branch).
        if ($Branch -ne $default -and -not $Create -and (Test-CheckpointTip)) {
            $subj = (Invoke-Git @('log', '-1', '--format=%s')).Out.Trim()
            $rs = Invoke-Git @('reset', '--soft', 'HEAD~1')
            if ($rs.Ok) { $result.uncommittedCheckpoint = $subj }
        }

        $result.dirty = @(Get-DirtyFiles)
        $result.stashes = @(Get-RecenterStashes)
        Out-Result $result
    }

    'table' {
        $default = Get-DefaultBranch
        $current = Get-CurrentBranch
        $upstream = if ((Invoke-Git @('show-ref', '--verify', '--quiet', "refs/remotes/origin/$default")).Ok) { "origin/$default" } else { $default }

        $prs = $null
        $ghOk = $false
        try {
            $ghRaw = & gh pr list --state all --limit 100 --json number,state,headRefName,title 2>$null
            if ($LASTEXITCODE -eq 0 -and $ghRaw) { $prs = @("$ghRaw" | ConvertFrom-Json); $ghOk = $true }
        } catch { }

        $rows = [System.Collections.Generic.List[object]]::new()
        $refs = Invoke-Git @('for-each-ref', 'refs/heads', '--format=%(refname:short)|%(committerdate:short)')
        foreach ($line in ($refs.Out -split "`n")) {
            if (-not $line.Trim()) { continue }
            $name, $date = $line -split '\|', 2
            if ($name -eq $default) { continue }
            $ahead = [int](Invoke-Git @('rev-list', '--count', "$upstream..$name")).Out.Trim()
            $subjects = @((Invoke-Git @('log', '--format=%s', '-n', '5', "$upstream..$name")).Out -split "`n" | Where-Object { $_.Trim() })
            $pr = $null
            if ($ghOk) {
                $match = $prs | Where-Object { $_.headRefName -eq $name } | Select-Object -First 1
                if ($match) { $pr = [ordered]@{ number = $match.number; state = $match.state; title = $match.title } }
            }
            $rows.Add([ordered]@{
                branch     = $name
                current    = ($name -eq $current)
                lastCommit = $date.Trim()
                aheadOfMain = $ahead
                pr         = $pr
                merged     = ($null -ne $pr -and $pr.state -eq 'MERGED')
                uniqueSubjects = $subjects
            })
        }
        Out-Result ([ordered]@{
            defaultBranch = $default
            upstream      = $upstream
            ghAvailable   = $ghOk
            branches      = @($rows)
            stashes       = @(Get-RecenterStashes)
        })
    }

    'cleanup' {
        if ($Branches.Count -eq 0) { Out-Fail 'BAD_ARGS' 'cleanup requires -Branches <name,name,...>.' }
        $default = Get-DefaultBranch
        $current = Get-CurrentBranch
        $deleted = [System.Collections.Generic.List[string]]::new()
        $failed = [System.Collections.Generic.List[object]]::new()
        foreach ($b in $Branches) {
            if ($b -eq $default -or $b -eq $current) {
                $failed.Add([ordered]@{ branch = $b; reason = 'refused: default or current branch' })
                continue
            }
            $d = Invoke-Git @('branch', '-D', $b)
            if ($d.Ok) { $deleted.Add($b) } else { $failed.Add([ordered]@{ branch = $b; reason = $d.Out }) }
        }
        Out-Result ([ordered]@{ deleted = @($deleted); failed = @($failed) })
    }
}

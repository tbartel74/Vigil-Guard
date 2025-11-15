# tmux Status Bar for Claude Code Agent Visibility

**Status:** ✅ Implemented (Optional Feature)  
**Version:** 1.0.0  
**Last Updated:** 2025-11-12

## Overview

The tmux status bar integration provides **real-time visibility** of Vigil Guard agent activity directly in your terminal's top bar, eliminating the need to check logs or run status commands.

## Features

- 🔄 **Real-time updates** (1-second intervals)
- 🎯 **Workflow progress tracking** (shows step X/Y)
- 🤖 **Active agent display** (which agent is currently running)
- ⏱️  **Live status indicators** (idle, running, active)
- 🎨 **Color-coded output** (uses tmux color scheme)
- 🛡️  **Graceful fallback** (runs normal Claude Code if tmux not available)

## Status Bar Examples

### Idle State
```
┌────────────────────────────────────────────────────────────────────┐
│ 🤖 Vigil Guard Agents │                        🤖 12 agents │ idle │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Claude Code interface...                                         │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Single Agent Running
```
┌────────────────────────────────────────────────────────────────────┐
│ 🤖 Vigil Guard Agents │               🔄 test-automation │ running │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Claude Code interface...                                         │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Active Workflow
```
┌────────────────────────────────────────────────────────────────────┐
│ 🤖 Vigil Guard Agents │    🎯 PATTERN_ADDITION (2/4) │ 2 active   │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Claude Code interface...                                         │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Multiple Agents Active
```
┌────────────────────────────────────────────────────────────────────┐
│ 🤖 Vigil Guard Agents │         🔄 test-automation (+2) │ active  │
├────────────────────────────────────────────────────────────────────┘
│                                                                    │
│  Claude Code interface...                                         │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

## Installation

### 1. Prerequisites

**macOS:**
```bash
brew install tmux
```

**Ubuntu/Debian:**
```bash
sudo apt-get install tmux
```

**Arch Linux:**
```bash
sudo pacman -S tmux
```

**Minimum tmux version:** 2.0+

### 2. Verify Scripts Exist

Check that wrapper scripts are present and executable:

```bash
ls -la scripts/claude-code-wrapper.sh scripts/tmux-agent-status.sh
```

**Expected output:**
```
-rwxr-xr-x  1 user  staff  3498 Nov 12 19:08 scripts/claude-code-wrapper.sh
-rwxr-xr-x  1 user  staff  4050 Nov 12 19:08 scripts/tmux-agent-status.sh
```

If not executable:
```bash
chmod +x scripts/claude-code-wrapper.sh scripts/tmux-agent-status.sh
```

### 3. Add Alias (Optional but Recommended)

Add to `~/.zshrc` or `~/.bashrc`:

```bash
# Vigil Guard - Claude Code with tmux status bar
alias vg-claude='~/Documents/Projects/Vigil-Guard/scripts/claude-code-wrapper.sh'
```

**Replace path** with your actual Vigil Guard project location.

Reload shell:
```bash
source ~/.zshrc  # or source ~/.bashrc
```

## Usage

### Option 1: Using Alias (Recommended)

```bash
cd /path/to/Vigil-Guard
vg-claude
```

### Option 2: Direct Script Execution

```bash
cd /path/to/Vigil-Guard
./scripts/claude-code-wrapper.sh
```

### Option 3: Normal Claude Code (Without tmux)

```bash
claude-code  # Falls back to normal if tmux not available
```

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ claude-code-wrapper.sh                                          │
│   1. Checks if tmux is installed                               │
│   2. Creates named tmux session (vigil-claude-PID)             │
│   3. Configures status bar (top position, 1s updates)          │
│   4. Runs Claude Code inside session                           │
│   5. Attaches to session (user sees Claude Code + status bar)  │
└─────────────────────────────────────────────────────────────────┘
                                 ↓
┌─────────────────────────────────────────────────────────────────┐
│ tmux (session running)                                          │
│   • Status bar updates every 1 second                           │
│   • Calls: tmux-agent-status.sh                                │
└─────────────────────────────────────────────────────────────────┘
                                 ↓
┌─────────────────────────────────────────────────────────────────┐
│ tmux-agent-status.sh                                            │
│   1. Reads .claude-code/ui-state.json                          │
│   2. Parses JSON (Python3 or jq)                               │
│   3. Formats output for status bar                             │
│   4. Returns formatted string to tmux                          │
└─────────────────────────────────────────────────────────────────┘
                                 ↓
┌─────────────────────────────────────────────────────────────────┐
│ .claude-code/ui-state.json                                      │
│   • Updated by BaseAgent.updateUIState()                       │
│   • Updated by ProgressReporter.updateUIState()                │
│   • Contains: agents{}, active_workflow, workflow_details{}    │
└─────────────────────────────────────────────────────────────────┘
```

### Status Bar Update Logic

**Python3 parser** (preferred, more reliable):
```python
# 1. Read ui-state.json
state = json.load(open('.claude-code/ui-state.json'))

# 2. Count active agents
active_count = sum(1 for agent in state['agents'].values() if agent['status'] == 'active')

# 3. Format output
if state['active_workflow']:
    # Show: 🎯 WORKFLOW_NAME (step/total) │ N active
elif active_count > 0:
    # Show: 🔄 agent-name │ running
else:
    # Show: 🤖 12 agents │ idle
```

**jq parser** (fallback):
```bash
ACTIVE_COUNT=$(jq '[.agents[] | select(.status == "active")] | length' ui-state.json)
ACTIVE_WORKFLOW=$(jq -r '.active_workflow' ui-state.json)
```

## Troubleshooting

### Status Bar Not Showing

**Symptom:** tmux session starts but status bar is blank or missing

**Solutions:**
1. Check tmux version:
   ```bash
   tmux -V  # Should be 2.0 or higher
   ```

2. Manually test status script:
   ```bash
   bash scripts/tmux-agent-status.sh
   # Should output: "🤖 12 agents │ idle" or similar
   ```

3. Verify `.claude-code/ui-state.json` exists:
   ```bash
   ls -la .claude-code/ui-state.json
   ```

4. Check tmux configuration:
   ```bash
   tmux show-options -g status
   tmux show-options -g status-interval
   ```

### Status Shows "error" or "not initialized"

**Symptom:** Status bar shows: `🤖 12 agents │ error: ...` or `not initialized`

**Solutions:**
1. Create `.claude-code/` directory:
   ```bash
   mkdir -p .claude-code/state
   cp .claude-code/ui-state.json.example .claude-code/ui-state.json  # if exists
   ```

2. Check JSON syntax:
   ```bash
   python3 -m json.tool .claude-code/ui-state.json > /dev/null
   # Should show no errors
   ```

3. Run wrapper with debug:
   ```bash
   DEBUG=1 ./scripts/claude-code-wrapper.sh
   ```

### Status Not Updating (Stuck on "idle")

**Symptom:** Status bar never changes from idle, even when agents are running

**Possible causes:**
1. **Agents not updating ui-state.json**
   - Check if file is being written:
     ```bash
     watch -n 1 'stat -f "%Sm" .claude-code/ui-state.json'
     # Should show timestamps updating
     ```

2. **File permissions**
   ```bash
   chmod 644 .claude-code/ui-state.json
   ```

3. **Agent not using `updateUIState()`**
   - Check agent implementation in `.claude/agents/vg-*/agent.js`
   - Ensure `BaseAgent.updateUIState()` is called

### tmux Session Won't Close

**Symptom:** After exiting Claude Code, session remains

**Solution:**
```bash
# List all vigil-claude sessions
tmux list-sessions | grep vigil-claude

# Kill specific session
tmux kill-session -t vigil-claude-12345

# Kill all vigil-claude sessions
tmux list-sessions | grep vigil-claude | awk '{print $1}' | sed 's/://' | xargs -I {} tmux kill-session -t {}
```

### "command not found: claude-code"

**Symptom:** Script fails with `claude-code: command not found`

**Solutions:**
1. Install Claude Code CLI:
   ```bash
   # See: https://docs.claude.com/claude-code/installation
   ```

2. Use full path in wrapper script (edit `claude-code-wrapper.sh`):
   ```bash
   exec /usr/local/bin/claude-code "$@"  # or wherever it's installed
   ```

## Configuration

### Custom Status Bar Position

Edit `scripts/claude-code-wrapper.sh`:

```bash
# Change status bar to bottom:
tmux set-option -t "$SESSION_NAME" status-position bottom

# Change update interval (default: 1 second):
tmux set-option -t "$SESSION_NAME" status-interval 2  # 2 seconds
```

### Custom Colors

Edit `scripts/claude-code-wrapper.sh`:

```bash
# Status bar background and foreground:
tmux set-option -t "$SESSION_NAME" status-style "bg=colour235,fg=colour136"

# Available colors: colour0-colour255
# See: https://man7.org/linux/man-pages/man1/tmux.1.html#STYLES
```

### Custom Status Format

Edit `scripts/tmux-agent-status.sh`:

```python
# Change output format in Python parser:
print(f"🎯 {workflow_name} ({step}/{total_steps}) │ {active_count} active")
# To:
print(f"Workflow: {workflow_name} | Step {step}/{total_steps}")
```

## Performance

- **CPU usage:** <0.1% (tmux + Python parser)
- **Memory:** <5 MB additional
- **Latency:** 1-second refresh rate (configurable)
- **Disk I/O:** ~1 KB/s (reading ui-state.json)

## Limitations

- ❌ **Does NOT work in Claude Code desktop app** (tmux is terminal-only)
- ❌ **Does NOT work in VS Code integrated terminal** (tmux requires full terminal)
- ✅ **Works in:** iTerm2, Terminal.app, Alacritty, Kitty, Warp, Hyper
- ⚠️  **Requires tmux 2.0+** (check with `tmux -V`)

## Alternatives

If tmux is not suitable:

1. **Use `/status-agents` command**
   - Manual but works everywhere
   - Shows detailed agent status

2. **Watch ui-state.json directly**
   ```bash
   watch -n 1 'cat .claude-code/ui-state.json | jq .active_workflow'
   ```

3. **Future: Claude Code UI integration**
   - Native status bar (requires Anthropic support)
   - See: `.claude/README.md` section "Future Enhancements"

## FAQ

**Q: Can I use this on Windows?**  
A: No, tmux is Unix-only. Use WSL (Windows Subsystem for Linux) or alternative methods above.

**Q: Does this slow down Claude Code?**  
A: No, status updates run in background with negligible overhead (<0.1% CPU).

**Q: Can I customize the emoji icons?**  
A: Yes, edit `scripts/tmux-agent-status.sh` and change emoji in output strings.

**Q: Will this work with tmux 1.x?**  
A: Some features may not work. Upgrade to tmux 2.0+ recommended.

**Q: Can I run multiple Claude Code instances?**  
A: Yes, each gets unique session name: `vigil-claude-PID`

## See Also

- [.claude/README.md](./.claude/README.md) - Agent system documentation
- [CLAUDE.md](./CLAUDE.md) - Project instructions (Visibility Protocol section)
- [/status-agents command](./.claude/commands/status-agents.md) - Alternative status check

## Support

**Issues:** Create issue at [Vigil Guard GitHub](https://github.com/your-org/vigil-guard/issues)

**Questions:** Use `/agent-help` command or read `.claude/README.md`

---

**Last Updated:** 2025-11-12  
**Version:** 1.0.0  
**Status:** ✅ Production Ready (Optional Feature)

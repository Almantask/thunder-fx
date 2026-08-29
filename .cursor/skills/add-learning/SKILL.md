---
name: add-learning
description: Append a dated journal entry of insights, discoveries, prompt engineering tricks, or audio generation findings to learnings.md. Use when the user asks to add a learning, record an insight, log a discovery, or invokes /add-learning.
---

# Add Learning

Record discoveries, audio generation notes, prompt experiments, model behaviors, or project insights into the `learnings.md` journal.

## Workflow

1. **Format the Date**:
   Use today's date in `YYYY-MM-DD` format (or the date specified by the user).

2. **Check `learnings.md`**:
   View `learnings.md` in the repository root.

3. **Append Entry**:
   - If the date section `## YYYY-MM-DD` already exists, append the new bullet point under that section.
   - If the date section does not exist yet, add `## YYYY-MM-DD` followed by the new bullet point(s).

4. **Verify Format**:
   Ensure markdown syntax is clean, with code formatting (backticks) for prompts, parameter values, and exact settings where appropriate.

## Deterministic Script Execution (Optional)

You can also run the bundled Python helper to append an entry deterministically:

```powershell
python .agent/skills/add-learning/scripts/add_learning.py "For water dripping from a cave - what worked was specifying the intensity exactly and keeping it simple: `water dripping from a cave, 1 time in 10s`"
```

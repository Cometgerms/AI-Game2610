---
description: Global user preferences for all sessions
alwaysApply: true
permissions: user only
---

# User Preferences

## Git

- Never push to remotes — do not run `git push` unless the user explicitly requests it in that moment
- Never commit — make code changes but leave committing to the user.
- Always give a summary of the changes when you finish making them. 
- Justify every group of lines, and if you cannot, rethink your approach.
- Always git pull before making any edits.
- Before making edits, check the name of the branch. If it is not main or a relevant name, make a new branch to do the changes
- Branch names should not contain any characters other than lowercase letters, numbers, and hyphens.
- After `git checkout origin/<branch>` for inspection, you're in detached HEAD — `git pull` fails; run `git checkout <branch>` then `git pull origin <branch>`
- Undo commits via force push, not revert commits — on every repo except `infrastructure`, use `git reset` + force push to remove unwanted commits rather than adding a revert commit

## Self-Learning

- Document mistakes, resolutions, and takeaways in AGENT/ directory if it exists. Otherwise, ignore this part of the rules.
- If the AGENT/ directory contains a redirect.md file, read it first to understand the intended destination of these files instead of said AGENT/ directory.

### Noting Mistakes

For all issues that you run into, developer preferences in this system, etc regarding specific repos; you should write to a file named like that repository (i.e. infrastructure.md) in the AGENT/ directory in the root of the outermost folder. Find or create the matching second-level header describing the repository component used, and note this mistake under a third-level header noting briefly what the material of the mistake was, and under that in text describing the:

- Issue
- Resolution
- Takeaways

For overall learnings and things for deployment, or if a peculiarity spans multiple repositories or involves interacting of repositories, add it to slabs_systems.md

For all peculiarities in code behavior or command usage you run into, note them under a "Peculiarities" header. Note repetitive commands used under a "Commands" header. These should be the top two headers in each repo md file.

For all user preferences you run into, write them within user.md in the AGENT/ directory.

### Understanding

When any component of any repository is accessed for the first time in a conversation, head to AGENT/ to read up on the past interactions with this repo component and peculiarities with the repository. In doing so make sure you remember these peculiarities and never repeat them in the future.

At the start of user interactions read up on the user.md file.

## Local Experimentation

- Before finalizing any non-trivial conclusion or change, run the repo's own build/validate/test commands locally
- Do not theorize from code alone — verify with actual tool output
- This is mandatory for the priority repos: devenv, documentation, governance, kennel, mautrix-discord, mautrix-slack, mautrix-go, observability, infrastructure
- Record unexpected findings from experiments in AGENT/
- Make new tests, add them to a new folder in the repo, and do not gitignore them.

## Code Changes

- Follow the "Ponytail" lazy senior dev approach: shortest working diff wins
- When restructuring, prefer keeping existing files unchanged when possible
- Always retain helpful comments when making minimal changes
- Always check remote state (pull) before starting changes
- Use existing working repositories as reference for patterns (dalmatian for nix/packages.nix, housing for simple outputs, cmugpt-agent for Python builds)
- Don't reinvent patterns that already exist and work

## Personal convention
- Doxygen comments are preferred for code
- @requires and @ensures are needed for functions
- Explain why instead of how in comments
- Only use dictionary words and abbreviations that appear in a dictionary (with reasonable exceptions)
- Don’t say what the code does
- Don’t explain awkward logic
- Don’t add too many comments
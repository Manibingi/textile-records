---
name: ship-feature
description: Run the full Textile Records delivery pipeline end to end — plan (feature-planner) → build (feature-developer) → raise PR, review and merge (pr-reviewer-merger), looping on requested changes. Use when the user says /ship-feature, "build the next feature", "ship F-00X", or asks to implement a roadmap item without manual steps.
argument-hint: "[F-XXX | \"idea in plain words\" | plan-only]"
---

# Ship a feature end to end

You (the main session) orchestrate. Subagents can't call each other, so you invoke each one in turn with the Agent tool and pass along what the previous one reported. Don't do their work yourself.

Argument: `$ARGUMENTS`

## 0. Pre-flight

- Run `git status`. If the tree is dirty with changes that are not from this pipeline, stop and tell the user. Never discard them.
- Run `git fetch origin`, and make sure you are on `main` (or can switch to it cleanly) and it is up to date with `origin/main`.
- Remember: a merge to `main` deploys to the live site (https://textile-records.onrender.com). The reviewer gates it. Never skip the reviewer.

## 1. Plan: `feature-planner`

- **No argument:** ask it to refresh the roadmap if no item is `specced`, and to return the ID of the highest-priority `specced` item (spec it if needed).
- **`F-XXX`:** if `docs/features/F-XXX-*.md` exists with status `specced` or `in-progress`, skip planning. Otherwise ask the planner to spec it.
- **A plain-words idea:** ask the planner to add it to the roadmap and spec it, then use the returned ID.
- **`plan-only`:** run the planner in roadmap-refresh mode, report, and stop.

If the planner reports an open question that genuinely needs the owner, such as a business decision with money or legal impact, stop and ask the user. Otherwise continue.

## 2. Build: `feature-developer`

Prompt: "Implement F-XXX per docs/features/F-XXX-*.md on branch feature/F-XXX-slug. Follow CLAUDE.md and the skills. Report branch, commits and test results." Include the commit attribution trailer from your own instructions if one applies.

If it reports failing tests it couldn't fix, or a missing spec, go back to step 1 once with the problem. If it fails again, stop and report.

## 3. Review and merge: `pr-reviewer-merger`

Prompt: "Review and ship F-XXX (branch feature/F-XXX-slug). Raise the PR if GitHub is available, verify, write the review, and merge if approved." Include the PR and commit attribution lines from your own instructions if they apply.

- **APPROVED and merged:** go to step 4.
- **CHANGES REQUESTED:** send the developer the review file path and the numbered fix list ("Address every item in docs/reviews/F-XXX-review-n.md on the same branch"), then run the reviewer again. Allow at most 3 rounds, then stop with status `blocked`.
- If a finding says the **spec** is wrong, run the planner in revise mode before the developer.

## 4. Report to the user

Tell them in plain words:

- What was built, with the feature ID and title
- Whether it was merged, and the PR URL or merge commit
- Test results
- How to see it (restart the app; which screen)
- What the roadmap suggests next

Keep it short; the details are in `docs/features/` and `docs/reviews/`.

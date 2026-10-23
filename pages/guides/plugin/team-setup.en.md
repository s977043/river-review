# Prepare for team use

`/river-review:setup-team` prepares River Review team rules in the adopting project. This page is based on the steps in `commands/setup-team.md`.

## Run it

```text
/river-review:setup-team
```

## What the command does

1. **Check the current state**: whether `.river/rules.md` and `.river-review.json` / `.river-review.yaml` exist, and whether `package.json` `scripts` has an entry such as `review`.
2. **Create `.river/rules.md`**: if the file is missing, it is created from the bundled template `.river/rules.template.md`. If the template cannot be read, the command stops and reports instead of guessing the file.
3. **Present integration modes**: it shows which of the three in the table below fits.
4. It runs an **install check** and a **smoke check**, then prints a summary.

| Mode              | Use                             | Config file          |
| ----------------- | ------------------------------- | -------------------- |
| Plugin            | Agent-driven interactive review | `.river/rules.md`    |
| GitHub Actions    | Automatic PR review             | `.river-review.json` |
| CLI (`river run`) | Local or any CI                 | `.river-review.json` |

## What to write in `.river/rules.md`

After creation, fill in project-specific rules. The command asks for architecture policy, forbidden patterns, and security requirements. Committing the file gives every team member's review the same premises.

Plugin mode does not need `.river-review.json`. When you also use GitHub Actions or the CLI, see the [Adopter Playbook](/guides/adopter-playbook.en) and the [GitHub Actions guide](/guides/github-actions.en).

## Related pages

- [Install the plugin](/guides/plugin/install.en)
- [Commands, agents, and skills](/guides/plugin/commands-and-skills.en)

# Orbit agent guidelines

This file is the single source of truth for every coding agent working in this repository. Agent-specific instruction files must point here and must not duplicate these rules. If this file moves or an agent-specific file is added, removed, or changed, update every pointer in the same change so all agents continue to receive the same guidance.

## Documentation

- Document every major application change in the same change set as the implementation. A major change includes user-visible behavior, workflows, configuration, architecture, packaging, updating, installation, or release behavior.
- Update the most relevant existing documentation, such as `README.md`, code comments, or a focused document under `docs/`. Create a focused document when the existing documentation is not an appropriate home.
- Before finishing, verify that the implementation and documentation agree and that every agent-specific instruction file still points to this canonical file.

## Local verification before push or release

- Before any push, ask the user to test the completed change locally. Provide the exact commands and user-visible scenarios needed to verify the implementation.
- Do not push until the user explicitly confirms that the local test passed and authorizes the push. If testing exposes a problem, fix it, provide updated test steps, and wait for confirmation again.
- Never create or push a release tag, publish a release, or trigger the release workflow unless the exact implementation being released has passed this user-confirmed local test.
- Confirmation that local testing passed authorizes only the subsequent push. It does not authorize a release; release approval remains a separate requirement.

## Releases require user approval

- These release requirements apply to changes that affect the app's behavior or distributed product. Documentation-only, agent-guidance, test-only, and developer-workflow changes may be merged without proposing a release unless the user asks for one.
- Never release an app change automatically. A release requires the user's explicit approval after they have reviewed the proposed release tag and changelog.
- Before requesting approval, recommend a SemVer tag based on the impact of the changes and draft the complete changelog/release notes for that tag.
- Ask the user to approve both the recommended tag and the proposed changelog. Revise either when requested and obtain explicit approval of the final versions.
- Until approval is given, do not perform release actions. This includes creating or pushing a release tag, creating a GitHub release, publishing artifacts or packages, or triggering the tag-based release workflow.
- Approval to implement, commit, or push code is not release approval. Release approval must be explicit and specific to the proposed tag and changelog.
- After approval, use the approved tag and changelog exactly. If either must change, stop and request approval again.

## Change handoff

For every completed app change, report the documentation that was updated. If the change affects the app's behavior or distributed product, recommend the next release tag, present a proposed changelog, and explicitly ask whether the user approves releasing that exact tag with that changelog. Do not interpret silence as approval.

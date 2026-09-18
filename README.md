# Zion no-code workspace

This project is set up to build and change [Zion](https://functorz.com) apps from Cursor. It vendors the official [`zion-nocode` plugin](https://github.com/functorz-tech/zion-nocode-plugin) (v2.7.7) so Cloud Agents and local Cursor both get the `zion-platform` skill and the `zion` MCP server.

You design the data model, UI, action flows, permissions, and bindings on Zion’s hosted backend. This repo holds the plugin, not the app runtime.

## What is included

| Path | Purpose |
| --- | --- |
| `.cursor/skills/zion-platform` | Guided skill: detect the project’s type system, then route to the right capability |
| `.cursor/mcp.json` | Project MCP server: `npx -y zion-mcp@2.7.7 mcp` |
| `.cursor/plugins/zion-nocode` | Full plugin copy (skills + Cursor manifest) |
| `.cursor/rules/zion-platform.mdc` | Always-on reminder to load the skill for Zion work |

## Prerequisites

- Node.js 18+
- A [Zion](https://functorz.com) account and at least one project
- Browser login for the CLI (OAuth token is stored in `~/.zion-mcp`, not in this repo)

## Authenticate

Run this once on the machine that will call Zion:

```bash
npx -y zion-mcp@2.7.7 login
npx -y zion-mcp@2.7.7 --no-daemon whoami
```

`login` opens a browser and writes credentials under `~/.zion-mcp`. A workspace-local `.zion-mcp/credentials.json` overrides the home directory if you need to isolate accounts. Both paths are gitignored.

## Local Cursor

1. Open this repo in Cursor 2.5+.
2. Cursor picks up `.cursor/mcp.json` automatically. Enable the **zion** MCP server in **Customize** if it is off.
3. Optional: install the plugin as a local Cursor plugin:

```bash
mkdir -p ~/.cursor/plugins/local
ln -s "$PWD/.cursor/plugins/zion-nocode" ~/.cursor/plugins/local/zion-nocode
```

Then reload the window and enable **zion-nocode** in plugin settings.

You can also add the GitHub marketplace (`functorz-tech/zion-nocode-plugin`) from **Customize → Plugins** instead of the symlink.

## Cloud Agents

Cloud Agents load the skill from `.cursor/skills/`. They call Zion through the CLI:

```bash
npx -y zion-mcp@2.7.7 projects search --projectName "My App"
npx -y zion-mcp@2.7.7 project set-current --projectExId <exId>
npx -y zion-mcp@2.7.7 schema load
```

Stdio MCP from `.cursor/mcp.json` is for the desktop app. To expose Zion as MCP tools on Cloud Agents, add the same server in [cursor.com/agents](https://cursor.com/agents) (MCP dropdown) or under **Dashboard → Plugins & MCPs**.

The Cloud Agent VM still needs a Zion login (`~/.zion-mcp`). After you authenticate locally, either paste a follow-up that includes the project name, or copy credentials into the agent environment as a secret if you want unattended runs.

## First Zion task

Ask Cursor to work on a named Zion app. The agent should:

1. Read `.cursor/skills/zion-platform/SKILL.md`
2. Search for the project and pin it
3. Load the schema and follow `pre/` or `post/` from the returned `typeSystem`
4. Change data first, then UI and action flows
5. Sync the backend before verifying against the live runtime

Example:

> Use the Zion plugin on my project “Inventory”. Add a Products table with name, sku, and quantity, then a list page bound to it.

## Refresh the plugin

```bash
git clone --depth 1 https://github.com/functorz-tech/zion-nocode-plugin.git /tmp/zion-nocode-plugin
rm -rf .cursor/plugins/zion-nocode
cp -a /tmp/zion-nocode-plugin/plugin .cursor/plugins/zion-nocode
git -C /tmp/zion-nocode-plugin rev-parse HEAD > .cursor/plugins/zion-nocode.revision
```

Keep the `zion-mcp@…` version in `.cursor/mcp.json` and in the skill’s CLI recipes in sync with `plugin/.cursor-plugin/plugin.json`.

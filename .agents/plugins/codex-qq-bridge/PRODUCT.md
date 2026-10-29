# Codex QQ Bridge
<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
Existing preview uses Node.js ES modules without runtime packages. Continue with Node22+, native HTML/CSS/JavaScript and a Windows PowerShell launcher; no framework or build step needed.

## Users
Chinese-speaking Windows Codex users installing their own QQ bot. The maintainer currently operates a private bot and wants the empty public preview completed into a distributable Codex plugin.

## Product Purpose
One-click launcher with an integrated control center. First use automatically enters guided setup; daily use opens live status and monitoring. QQ login, Codex login/diagnosis, owner/group binding, persona editing and feature switches all belong in the same interface.

## Operating Context
Windows desktop, local browser/app window, Codex CLI using its existing account authentication, NapCat and official QQ client. Terminal monitoring must be embedded in the launcher. This is now Codex-only; DSH and general Agent adapters are out of scope by the user's newest instruction.

## Capabilities and Constraints
Retain group context, five-minute followups, optional unsolicited replies, memory, image input/generation, poke/complaint, moderation/file commands, Bilibili voice music and sticker collection. Publish generic defaults, no developer QQ IDs, persona relations, login/cache/history. Bundle an unchanged official NapCat archive with complete source/license notice. Current private deployment must stay untouched.

## Product Principles
Show actual receipts and current health. Start safe with empty bindings. Keep setup and monitoring in one place. Persist user data outside the plugin so upgrades preserve it. Avoid external messages during tests.

## Brand Commitments
User chose Chinese desktop-tool style, status and real-time monitoring first. Other decorative decisions are delegated implementation choices, not confirmed brand commitments.

## Evidence on Hand
Existing independent feature modules and fake-IO tests; official NapCat4.18.41 archive and SHA256. No clean-machine or public QQ end-to-end result exists yet; do not fabricate it.

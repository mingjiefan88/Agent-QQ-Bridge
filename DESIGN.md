---
name: Codex QQ Bridge
description: Chinese desktop control center with contextual settings and an embedded live terminal.
colors:
  action: "#285bd4"
  action-hover: "#1d47ac"
  focus: "#487ce8"
  application-ground: "#f3f5f7"
  surface: "#ffffff"
  sidebar: "#eaf0f5"
  ink: "#202b35"
  muted: "#5c6875"
  separator: "#dce2e8"
  selected-navigation: "#d6e3fc"
  terminal-ground: "#14202b"
  terminal-ink: "#dce6ef"
  terminal-time: "#8ea4b8"
  terminal-source: "#9cbeed"
  terminal-error: "#ffb6b5"
typography:
  headline:
    fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "26px"
    fontWeight: 650
    lineHeight: "normal"
    letterSpacing: "-0.02em"
  title:
    fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "18px"
    fontWeight: 650
    lineHeight: "normal"
  body:
    fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "normal"
  explanation:
    fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "12px"
    fontWeight: 600
    lineHeight: "normal"
  metadata:
    fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "11px"
    fontWeight: 400
    lineHeight: "normal"
  terminal:
    fontFamily: 'Consolas, "Cascadia Mono", "Microsoft YaHei", monospace'
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.9
rounded:
  control: "7px"
  navigation: "8px"
  panel: "12px"
spacing:
  control-inline: "13px"
  control-block: "8px"
  field-inline: "11px"
  field-block: "10px"
  panel: "24px"
  workspace-gap: "23px"
  application-inline: "30px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "8px 13px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
    textColor: "{colors.surface}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 13px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 11px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "24px"
  navigation-selected:
    backgroundColor: "{colors.selected-navigation}"
    textColor: "#174ba8"
    rounded: "{rounded.navigation}"
    padding: "12px 13px"
  terminal:
    backgroundColor: "{colors.terminal-ground}"
    textColor: "{colors.terminal-ink}"
    typography: "{typography.terminal}"
    padding: "18px 21px"
---

# Design System: Codex QQ Bridge

## Overview

**Creative North Star: "本地运行台"**

The existing visual world is a conventional Chinese Windows operation interface. Its restrained shell makes configuration and current execution legible without adding an expressive marketing identity. The user selected contextual settings beside a large, persistent terminal, with NapCat's native interface as a functional reference.

The terminal is literal working content: real events, public progress, replies and receipts. White surfaces and a muted sidebar organize controls; one action blue identifies primary actions and selection. This record merges the existing decisions with the implemented CSS rather than changing their direction.

**Key Characteristics:**
- Contextual settings beside a persistent terminal.
- Quiet surfaces with one action accent.
- Explicit operating states instead of decorative activity.
- Native desktop typography for controls, monospace for log data.

## Colors

The palette combines cool application surfaces with a navy terminal and a restrained action blue.

### Primary
- **Action Blue** identifies primary buttons and selected controls; its deeper hover is an actionable state.
- **Focus Blue** is a visible keyboard outline, distinct from the filled action treatment.

### Neutral
- **Application Ground** and **Sidebar Mist** separate the shell from white content surfaces.
- **Ink**, **Muted Ink** and **Separator** carry content, supporting labels and structural boundaries.
- **Terminal Navy** and **Terminal Ink** distinguish monitoring content. Time and source labels have separate quiet tones; failed events use a readable warm error tone.

**The State Before Decoration Rule.** Use the existing action and status treatments to communicate actual state; do not substitute invented activity for an empty or offline condition.

## Typography

**UI Font:** Segoe UI with Microsoft YaHei and sans-serif fallbacks. This is the native desktop control face, not a decorative display voice.

**Log Font:** Consolas with Cascadia Mono, Microsoft YaHei and monospace fallbacks. Tabular figures make timestamps easier to scan.

### Hierarchy
- **Headline** is the current page title; it reduces to 23px at compact breakpoints.
- **Title** is used for section headings and the monitor heading.
- **Body** is the root control and field text; supporting explanations use their separate role.
- **Label / Metadata** covers form labels and operational support text. The final rendered metadata floor is 11px.
- **Terminal** uses generous line height; compact viewports reduce the log role to 11px.

**The Data Face Rule.** Keep monospace in logs and measurements; ordinary instructions and controls retain the UI face.

## Layout

The wide layout uses a 202px sticky navigation rail, a flexible main region, a four-column status strip and a contextual settings pane. Main inline padding is 30px, pane separation is 23px and the standard settings width is 380px. At 1650px and above, main padding grows to 42px and settings width to 430px.

At 1180px and below, the rail and settings become denser. At 900px and below, settings stack above the monitor and status becomes two columns. At 600px and below, navigation becomes a horizontal scrolling row and the page uses natural vertical scrolling. Settings lose their internal height cap in the stacked layout. The desktop monitor fits available viewport height and scrolls its log body internally.

## Elevation & Depth

Ordinary surfaces are flat, separated by a fine border and tonal contrast. The exceptional native NapCat dialog uses a neutral downward shadow (`0 20px 80px #00000040`) and a dimmed backdrop for a nested management surface. Keyboard focus is an outline (`3px solid var(--focus)`) with a 3px offset, not an elevation effect.

**The Flat Work Surface Rule.** Preserve tonal and border separation for daily controls; reserve elevation for the nested native interface.

## Shapes

Panels use softly curved corners, controls a tighter curve, and selected navigation the intermediate curve recorded in the frontmatter. Borders are fine and consistent. Status badges are compact rounded rectangles; pills are not the general container shape. Icons are authored outline SVGs with a consistent stroke family.

## Components

### Buttons
Primary buttons use Action Blue with white text; secondary buttons use a white fill and fine neutral border. Both use the control corner and padding tokens. Hover changes fill, disabled actions reduce opacity and use the waiting cursor, and the shared focus outline remains visible. Color transitions last 140ms.

### Inputs / Fields
Fields use a white surface, fine border and control corner. Labels sit above controls and explanations remain a separate role. Textareas resize vertically, with a taller persona editor. Caret and selection colors are themed from the action family.

### Navigation
The sidebar list uses outline icons, a tonal hover, and pale-blue active selection with deeper-blue text. Mobile preserves the same destinations in a horizontal scrolling row.

### Status Badges and Notices
Paused and running badges have separate muted and positive treatments. Notices use a fine contextual border and lightly tinted surface; failures use a distinct error treatment. Text labels convey state alongside color.

### Panels
Settings and monitoring share the surface, panel corner and separator vocabulary. Settings scroll internally only on wide layouts. Ordinary configuration stays in-page; the native NapCat interface is the exceptional focused dialog.

### Embedded Terminal
Source tabs, error filtering, scroll pause, clear view and diagnostic copy belong to its chrome. The data area has time, source and message columns, wrapping within the message column. Time and source are quieter than message content. New lines settle brightness over 180ms; reduced-motion preferences disable animation and transitions. Internal scrollbars use terminal-family colors.

## Do's and Don'ts

### Do:
- **Do** preserve contextual settings beside the large monitor on wide screens, and stack them without horizontal page overflow on narrow screens.
- **Do** use explicit text for waiting, offline, paused, success and failure states.
- **Do** keep focus, caret, selection and terminal scrollbars consistent with the shipped palette.
- **Do** retain native UI typography for controls and monospace for actual log data.

### Don't:
- **Don't** add a decorative label above the page heading; the redundant eyebrow was removed in the final correction.
- **Don't** put ordinary configuration into modal dialogs; the native nested management interface is the documented exception.
- **Don't** add ambient panel shadows or glowing accents to flat application surfaces.
- **Don't** present placeholder counts, fake online states or simulated activity as live operating evidence.

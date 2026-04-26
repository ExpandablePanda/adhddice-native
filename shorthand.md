# ADHDice Shorthand & Terminology Guide

This document tracks the established names for specific UI patterns, mechanics, and branding within the ADHDice native app.

## UI Patterns

### **Icon Set Status Menu**
- **Description**: The full-screen or modal-based status picker that features high-fidelity chips with icons and bold typography.
- **Origin**: `OneStepAtATimeView.js`
- **Used In**: `OneStepAtATimeView.js`, `EisenhowerMatrixView.js`

### **Set Status Drop**
- **Description**: The quick-action mechanic on individual task rows. When the status circle is tapped, it displays a simplified set of chips without icons for fast updates.
- **Used In**: Main Tasks Screen (`TaskRow.js`)

## Branding & Mechanics

### **Banked Rolls**
- **Description**: Formally "Efficiency Rolls." Rewards earned from completing tasks that are stored in a "bank" to be claimed later.
- **Flow**: Sequence of task dice -> Automatic D6 Multiplier -> Auto-claim.

### **Penalty Mitigation**
- **Description**: The D6 roll mechanic used during the "Unproductive" / Distraction flow to reduce the total point deduction.

### **OSAAT (One Step At A Time)**
- **Description**: The focus-mode flow that breaks down tasks into granular steps and sub-steps with a recursive checklist.

### **FYD (Focus Your Day)**
- **Description**: The "Refocus" flow that guides the user through prioritizing their day.

# Comrade Product

## Target Users

### Alex the Developer
Already uses AI tools, can set up agents and workflows, and shares them with the team. Needs an easy way to share configurations through "workspaces".

### Jamie in Operations
Doesn't use AI tools directly. Wants something that just works. Comrade should provide a good introduction to capabilities and eventually guide them to:
- Creating custom skills
- Adding integrations
- Installing skills from a registry
- Creating custom commands

### User Categories

1. **Knowledge Worker**: "Do this for me" workflows with guardrails.
2. **Mobile-first User**: Start/monitor tasks from phone.
3. **Power User**: Wants UI parity + speed + inspection.
4. **Admin/Host**: Manages shared resources and profiles.

## Success Metrics

- < 5 minutes to first successful task on fresh install.
- > 80% task success without terminal fallback.
- Permission prompts understood/accepted (low confusion + low deny-by-accident).
- UI performance: 60fps; <100ms interaction latency; no jank.

## Product Primitives

### 1) Tasks
- A Task = a user-described outcome.
- A Run = a session + event stream.

### 2) Plans / Todo Lists
Comrade provides a first-class plan UI:
- Plan is generated before execution (editable).
- Plan is updated during execution (step status + timestamps).
- Plan is stored as a structured artifact.

### 3) Steps
Each tool call becomes a step row with:
- Tool name
- Arguments summary
- Permission state
- Start/end time
- Output preview

### 4) Artifacts
User-visible outputs:
- Files created/modified
- Generated documents
- Exported logs and summaries

### 5) Audit Log
Every run provides an exportable audit log:
- Prompts
- Plan
- Tool calls
- Permission decisions
- Outputs

## UI/UX Requirements

### Design Targets
- Premium, calm, high-contrast
- Subtle motion, smooth transitions
- Zero "developer vibes" in default mode

### Performance Targets
- 60fps animations
- <100ms input-to-feedback
- No blocking spinners (always show progress state)

### Mobile-first Interaction
- Bottom navigation
- Swipe gestures (dismiss, approve, cancel)
- Haptics for major events
- Adaptive layouts (phone/tablet)

### Accessibility
- WCAG 2.1 AA compliance
- Reduced motion mode
- Screen-reader labels

## User Flow Map

### 0. Install & Launch
1. User installs Comrade.
2. App launches.
3. App shows "Choose mode: Host / Client".
4. Host: Start local engine.
5. Client: Connect flow to an existing host.

### 1. First-Run Onboarding (Host)
1. Welcome + safety overview.
2. Workspace folder selection.
3. Allowed folders selection.
4. Provider/model configuration.
5. Health check.
6. Run a test session.
7. Success + sample commands.

### 2. Quick Task Flow
1. User types goal.
2. Comrade generates plan.
3. User approves.
4. Create session.
5. Subscribe to events.
6. Render streaming output + steps.
7. Show artifacts.

### 3. Permissions Flow
1. Event indicates permission request.
2. UI modal shows request.
3. User chooses allow/deny.
4. UI calls permission API.
5. Run continues or fails gracefully.

### 4. Cancel / Abort
1. User clicks "Stop".
2. UI calls abort API.
3. UI marks run stopped.

### 5. Run History
1. UI lists sessions.
2. Tap a session to load messages.
3. UI reconstructs plan and steps.

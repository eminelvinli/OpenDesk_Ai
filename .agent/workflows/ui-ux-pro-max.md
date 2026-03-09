---
description: Plan and implement UI for the OpenDesk AI Web Dashboard.
---

# /ui-ux-pro-max - Dashboard UI Design (OpenDesk AI)

$ARGUMENTS

---

## Purpose

Design and implement UI for the OpenDesk AI Web Dashboard (`/frontend`).

---

## Usage

```
/ui-ux-pro-max [page or component description]
```

## Examples

```
/ui-ux-pro-max Design the main dashboard with live-view
/ui-ux-pro-max Create the device management page
/ui-ux-pro-max Design the task input and scheduling interface
```

---

## Flow

1. **Activate** `frontend-specialist` agent
2. **Analyze** requirements and user context
3. **Design** → Declare design commitment before coding
4. **Implement** → Build with Next.js App Router + Tailwind CSS
5. **Test** → Component tests + visual check

## Dashboard Pages

| Page | Purpose |
|---|---|
| Login/Register | User authentication |
| Dashboard | Live-view of AI operating desktop + active task status |
| Devices | List paired devices with online/offline status |
| Tasks | Create, schedule, and manage tasks |
| Task History | Step-by-step playback of AI actions with screenshots |
| Settings | User preferences, API keys, persona rules for RAG |

## Design Considerations

- **Real-time**: Live-view streaming is the hero feature
- **Dark mode**: Support both light and dark themes
- **Responsive**: Desktop-first, tablet-friendly
- **Professional**: This is an enterprise tool, not a marketing site
- **Accessible**: Semantic HTML, ARIA, keyboard navigation

> 🔴 **The frontend ONLY communicates via the backend API. NEVER directly to Gateway or Client.**
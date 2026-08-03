# Miracle FC League - MVP Design Export

This document contains the visual structure and design mapping for the Miracle FC League web platform, ready for implementation.

## Project Metadata
- **Product Name:** Miracle FC League
- **Design System:** Kinetic League System (Light Mode, Plus Jakarta Sans, Blue Primary)
- **Primary Device:** Desktop (Responsive ready)

## Screen Inventory

### 1. Home Page
- **Placeholder:** {{DATA:SCREEN:SCREEN_8}}
- **Key Sections:**
    - Hero: "Elevate Your Game. Master the Court." with call-to-action buttons.
    - Active Events: Grid view of current tournaments for Kuroko 3v3 and Flashpeak 5v5.
    - Leaderboard Preview: Top 3 ranking teams with wins and points.
    - Community Call: Discord server invite and active player counter.

### 2. Events Discovery
- **Placeholder:** {{DATA:SCREEN:SCREEN_7}}
- **Key Sections:**
    - Filter Bar: Tabs for "All Games", "Kuroko no Basket", and "Flashpeak".
    - Event Cards: Displays start dates, team size (1v1, 2v2, 5v5), prize pools, and status (Live, Registration Open, Finished).
    - Navigation: Clear "Join Tournament" and "View Standings" actions.

### 3. Event Detail (Overview)
- **Placeholder:** {{DATA:SCREEN:SCREEN_5}}
- **Key Sections:**
    - Tournament Header: Dynamic live banner with "Watch Stream" and "Share" options.
    - Info Grid: Quick details (Date, Location, Total Teams).
    - Prize Pool: Tiered reward display for 1st, 2nd, and 3rd place.
    - Schedule: Timeline of matches from Quarter Finals to Grand Finale.

### 4. Event Detail (Bracket View)
- **Placeholder:** {{DATA:SCREEN:SCREEN_4}}
- **Key Sections:**
    - Visual Bracket: Single-elimination tree structure.
    - Match Nodes: Interactive cards showing team performance, scores, and verified results.
    - Progression: Automatic pathing from Quarter-Finals to the Grand Finale Champion.

### 5. Pro Circuit Leaderboards
- **Placeholder:** {{DATA:SCREEN:SCREEN_6}}
- **Key Sections:**
    - Podium View: Top 3 teams (Gold, Silver, Bronze) with avatar circles and key stats (PTS/WR%).
    - Detailed Rankings: Sortable table including Rank, Team Name, Played, Wins/Losses, Score Diff, and total Points.
    - Filters: Toggle between Team Rankings and Player Statistics.

### 6. Captain Registration
- **Placeholder:** {{DATA:SCREEN:SCREEN_2}}
- **Key Sections:**
    - Stepper Navigation: 3-step process (Team Info -> Game Type -> Roster).
    - Team Form: Inputs for Team Name, Logo upload (drag-and-drop), and Bio.
    - Validation: Registration rules sidebar to guide users on eligibility.
    - Actions: Draft saving and progression to the next setup phase.

## Technical Notes
- **Component Consistency:** All screens utilize shared `TopNavBar` and `Footer` components.
- **Color Palette:** Primary Blue (#0066FF) used for interactive elements and highlights.
- **Accessibility:** High contrast text and clear iconography for multi-generational usability.

# Together Tracker — Google Accounts & Private Sharing

This version replaces the previous user-code/password entry flow with Google sign-in, invite-based groups, friends, and explicit sharing. A friend can only inspect consistency, weekly tasks, or files after the owner enables that individual sharing category; private tracker state is never sent to friends.

## First-time setup

1. Create a Supabase project and enable the **Google** provider under Authentication.
2. In Google Cloud, register the Supabase Auth callback URL shown by the Google provider screen. Add your production URL (and local URL) to Supabase Authentication → URL Configuration redirect allow list.
3. Run [`supabase/google-social-schema.sql`](supabase/google-social-schema.sql) in the Supabase SQL Editor.
4. In Vercel, add `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` environment variables. Do not use the service-role key in the browser.
5. Deploy to Vercel. Set the production URL as Supabase's Site URL.

Existing legacy `/api` endpoints are retained for reference but are no longer used by the Google-account social layer. New browser calls are protected by Supabase Auth and Row Level Security.

## Privacy model

- Personal tracker state: owner only.
- Groups: invite code required; member list is visible only to group members.
- Friends: request + acceptance required.
- Consistency, weekly tasks, and files: separate opt-in settings, all off by default.
- Files: stored in a private `shared-files` bucket; downloads use 60-second signed URLs.

## Features

A private daily planner with an optional live room board for friends.

Track goals, monthly tasks, a 5 AM-to-5 AM timeline, consistency, and lifetime focus hours. Create a room to compare 28-day consistency grids with friends; only room members can see the shared board.

## Features

- Personal daily timeline and completed-session focus tracking
- Lifetime focus-hours total
- Automatic daily rollover at 5:00 AM
- Personal tracker sync across devices after signing in
- Room codes for creating or joining a friend group
- Shared 28-day consistency board with task hover details
- Room owner can remove members or delete the room
- Private file library for opening personal HTML files inside the tracker

## Privacy

Your private tracker data is stored per account and is **not** displayed to friends. The shared room board only sends consistency intensity plus the completed/pending task names for that day.

Private files stay in the browser that uploaded them. They are not uploaded to Supabase and do not sync to another device.

## Tech stack

- Plain HTML, CSS, and JavaScript frontend
- Vercel serverless API routes
- Supabase Postgres database
- User-code and password based session login

## How to use rooms

1. Click **GO LIVE**.
2. Choose **Create room** to become its admin, or **Join room** to enter a friend’s code.
3. New users choose a display name, user code, and password.
4. Existing users use the same user code and password on every device.
5. The owner can remove a member or delete the whole room from the room board.

## Data behavior

- A tracker day runs from **5:00 AM to 5:00 AM**.
- Finished timeline sessions contribute to lifetime focus hours.
- At the rollover, the day is archived to the consistency grid and the timeline is cleared.
- Personal data is synced when the signed-in account changes tracker data.
- If the same account edits two devices at the exact same time, the latest saved version wins.

## Project layout

```text
api/                         Vercel serverless routes
  account.js                 account registration, login, session lookup
  auth-room.js               create/join rooms
  auth-room-board.js         fetch room board data
  auth-snapshot.js           sync shared consistency data
  personal-state.js          sync private tracker data
public/
  index.html                 the tracker interface
supabase/
  schema.sql                 original room schema
  add-personal-tracker-state.sql
```

## Security notes

- Passwords are stored as salted hashes, not plain text.
- Session cookies are `HttpOnly`, `Secure`, and expire after 30 days.
- Database tables use Row Level Security with no public policies; server routes access them using Vercel environment variables.
- This is a small private app, not a complete production identity system. Add password reset, email verification, rate limiting, and audit logs before using it at large scale.

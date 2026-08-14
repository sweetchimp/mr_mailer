import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/landing.tsx"),
  route("login", "routes/login.tsx"),
  route("auth/google/login", "routes/auth.google.login.tsx"),
  route("auth/google/callback", "routes/auth.google.callback.tsx"),
  route("auth/microsoft/login", "routes/auth.microsoft.login.tsx"),
  route("auth/microsoft/callback", "routes/auth.microsoft.callback.tsx"),
  route("auth/logout", "routes/auth.logout.tsx"),
  route("dashboard", "routes/dashboard.tsx", [
    index("routes/dashboard._index.tsx"),
    route("needs-reply", "routes/dashboard.needs-reply.tsx"),
    route("worth-a-glance", "routes/dashboard.worth-a-glance.tsx"),
    route("fyi", "routes/dashboard.fyi.tsx"),
    route("replied", "routes/dashboard.replied.tsx"),
    route("snoozed", "routes/dashboard.snoozed.tsx"),
    route("history", "routes/dashboard.history.tsx"),
  ]),
  route("admin/job-failures", "routes/admin.job-failures.tsx"),
  route("schedule", "routes/schedule.tsx"),
  route("minutes", "routes/minutes._index.tsx"),
  route("minutes/new", "routes/minutes.new.tsx"),
  route("minutes/:id", "routes/minutes.$id.tsx"),
  route("api/emails/:id/send", "routes/api.emails.$id.send.tsx"),
  route("api/emails/:id/dismiss", "routes/api.emails.$id.dismiss.tsx"),
  route("api/emails/:id/snooze", "routes/api.emails.$id.snooze.tsx"),
] satisfies RouteConfig;

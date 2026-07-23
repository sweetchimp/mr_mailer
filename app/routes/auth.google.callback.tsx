import { redirect } from "react-router";
import {
  authenticator,
  getSession,
  commitSession,
} from "../lib/auth.server";
import type { Route } from "./+types/auth.google.callback";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await authenticator.authenticate("google", request);

  const session = await getSession(request.headers.get("Cookie"));
  session.set("userId", user.id);
  session.set("lastActivity", Date.now());

  return redirect("/dashboard", {
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
}

export default function AuthGoogleCallback() {
  return <div>Completing sign in...</div>;
}

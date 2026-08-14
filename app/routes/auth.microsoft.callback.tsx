import { redirect } from "react-router";
import {
  authenticator,
  getSession,
  commitSession,
} from "../lib/auth.server";
import { runPostLogin } from "../lib/auth-callback.server";
import type { Route } from "./+types/auth.microsoft.callback";

export async function loader({ request }: Route.LoaderArgs) {
  if (!process.env.MICROSOFT_CLIENT_ID) {
    throw new Response("Microsoft sign-in is not configured.", { status: 404 });
  }
  const user = await authenticator.authenticate("microsoft", request);

  const session = await getSession(request.headers.get("Cookie"));
  session.set("userId", user.id);
  session.set("lastActivity", Date.now());

  runPostLogin(user);

  return redirect("/dashboard", {
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
}

export default function AuthMicrosoftCallback() {
  return <div>Completing sign in...</div>;
}

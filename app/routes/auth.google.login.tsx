import { Form } from "react-router";
import { authenticator } from "../lib/auth.server";
import type { Route } from "./+types/auth.google.login";

export async function action({ request }: Route.ActionArgs) {
  return authenticator.authenticate("google", request);
}

export async function loader({ request }: Route.LoaderArgs) {
  return authenticator.authenticate("google", request);
}

export default function AuthGoogleLogin() {
  return (
    <Form method="post">
      <button type="submit">Sign in with Google</button>
    </Form>
  );
}

import { Form } from "react-router";
import { authenticator } from "../lib/auth.server";
import type { Route } from "./+types/auth.microsoft.login";

function assertConfigured() {
  if (!process.env.MICROSOFT_CLIENT_ID) {
    throw new Response("Microsoft sign-in is not configured.", { status: 404 });
  }
}

export async function action({ request }: Route.ActionArgs) {
  assertConfigured();
  return authenticator.authenticate("microsoft", request);
}

export async function loader({ request }: Route.LoaderArgs) {
  assertConfigured();
  return authenticator.authenticate("microsoft", request);
}

export default function AuthMicrosoftLogin() {
  return (
    <Form method="post">
      <button type="submit" className="btn btn-primary px-5 py-2.5 text-sm">
        Sign in with Microsoft
      </button>
    </Form>
  );
}

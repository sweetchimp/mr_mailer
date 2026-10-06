/**
 * Labelled emails for the categorization eval.
 *
 * Plain data with no imports beyond the `Priority` type, so the eval script and
 * anyone reading the expectations can both reach it cheaply.
 *
 * Deliberately disjoint from the nine examples inside SYSTEM_PROMPT: no case
 * below shares a sender or a subject with one of those. Reusing an example as a
 * test case would only measure recall of a string the model has already been
 * shown. What *is* reused is the rule shape — a fake-urgent promotion and a
 * security alert both appear in the prompt and here, but from different senders
 * with different subjects, so passing them means the model generalised rather
 * than memorised.
 */

import type { Priority } from "@prisma/client";

export interface EvalCase {
  /** Stable id, used in the report so a case can be talked about by name. */
  id: string;
  subject: string;
  sender: string;
  body: string;
  expected: Priority;
  /**
   * Why this label. Printed by `--explain`, and the thing to read first when
   * deciding whether a failure is the prompt's fault or the label's.
   */
  rationale: string;
  /**
   * True when the email is not genuinely urgent work correspondence. Any such
   * case landing in HIGH is reported first and on its own, because that
   * direction of error puts a promotion on the dashboard under "Needs a reply"
   * — the failure a user notices and distrusts fastest.
   */
  nonUrgent?: true;
}

export const EVAL_CASES: EvalCase[] = [
  // ── HIGH ────────────────────────────────────────────────────────────────
  {
    id: "high-manager-leave",
    subject: "Priya's leave request — need your approval by 5pm today",
    sender: "Dana Whitfield <dana.whitfield@northwind.example>",
    body: "Priya has asked for two days off next week. I need sign-off before I can book the cover. Could you approve or decline by end of day today?",
    expected: "HIGH",
    rationale: "A manager asking for approval, with an explicit deadline today.",
  },
  {
    id: "high-oncall-incident",
    subject: "Incident: checkout API returning 503 in eu-west-1",
    sender: "On-call Incident Bot <oncall@northwind.example>",
    body: "Since 09:15 the checkout API has been returning 503 for 34% of requests in eu-west-1. Paging the payments on-call. Need someone to confirm we can fail over to us-east.",
    expected: "HIGH",
    rationale:
      "A genuine incident escalation from on-call, naming a live outage and asking for a decision.",
  },
  {
    id: "high-vendor-contract",
    subject: "Contract redlines from Halbrook Legal — signature needed today",
    sender: "Renata Osei <renata.osei@halbrooklegal.example>",
    body: "We have reviewed the MSA and our client's counsel needs the countersigned copy before the close today. Two clauses are still open from yesterday's call.",
    expected: "HIGH",
    rationale:
      "An external organisation blocked on a decision with a deadline today.",
  },
{
    id: "high-colleague-direct-question",
    subject: "Quick one — what was the agreed Q3 launch date?",
    sender: "Marcus Webb <marcus.webb@northwind.example>",
    body: "I'm updating the deck and I can't find the thread where we settled the Q3 launch date. Can you confirm whether it was the 14th or the 21st?",
    expected: "HIGH",
    rationale:
      "A direct question from a colleague, addressed to the recipient, that cannot be answered without them. The rule makes a direct question HIGH 'with no deadline' — the absence of a date is explicitly not a reason to lower it, and the ask is the question itself.",
  },
  {
    id: "high-cfo-budget",
    subject: "Approval needed: $18,500 overage from the data migration",
    sender: "Aisha Rahman <aisha.rahman@northwind.example>",
    body: "The migration ran over on compute. Finance has approved the spend but I need your sign-off before I raise the PO. Can you approve today?",
    expected: "HIGH",
    rationale: "A senior person asking for a decision, with today's deadline.",
  },
  {
    id: "high-client-blocking",
    subject: "URGENT: can't ship without the revised schema",
    sender: "Tom Delaney <tom.delaney@brightline.example>",
    body: "Our integration tests are red against the current schema. We're blocked on the revised field names. Can your team send them before our standup this afternoon?",
    expected: "HIGH",
    rationale:
      "A client blocked on a deliverable, asking for something today. Real work relationship, so the urgency is genuine.",
  },

  // ── MEDIUM ──────────────────────────────────────────────────────────────
  {
    id: "high-lookalike-no-ask",
    subject: "URGENT: action required on your account",
    sender: "No-reply@notifications.example-bank.example",
    body: "We detected activity on your account. Please sign in and verify your details at your earliest convenience.",
    expected: "MEDIUM",
    rationale:
      "The trap case. Genuine account-security alert, so not FYI, but it asks for nothing with a deadline — MEDIUM under the tiebreaker. Notably NOT HIGH despite both words 'URGENT' and 'action required'.",
    nonUrgent: true,
  },
  {
    id: "medium-colleague-urgent-no-ask",
    subject: "URGENT: heads up about the deploy window",
    sender: "Marcus Webb <marcus.webb@northwind.example>",
    body: "Flagging in case you didn't see it — infra is moving the deploy window to 02:00 tonight instead of the usual slot. No action needed from you.",
    expected: "MEDIUM",
    rationale:
      "Urgent word in the subject, real work relationship, but it states no deadline and asks for nothing, and explicitly says no action needed. MEDIUM, not HIGH.",
    nonUrgent: true,
  },
  {
    id: "medium-recruiter-outreach",
    subject: "Your background caught my eye — Staff Engineer role",
    sender: "Lena Fischer <lena.fischer@hireloop.example>",
    body: "I'm a recruiter at a Series B fintech and came across your profile. We're hiring a Staff Engineer to lead the platform team. Would you be open to a 20-minute chat next week?",
    expected: "MEDIUM",
    rationale:
      "Job opportunity and recruiter message. Explicitly MEDIUM under the definition, and not workplace-related, which the old prompt left with nowhere to go.",
    nonUrgent: true,
  },
  {
    id: "medium-application-update",
    subject: "Your application: Senior Engineer at Corvus — under review",
    sender: "Corvus Talent <talent@corvus.example>",
    body: "Good news — your application for Senior Engineer moved to the hiring manager review stage. No action needed. We'd expect to be in touch within two weeks.",
    expected: "MEDIUM",
    rationale:
      "An application-status update. Automated, but the user may genuinely want to read it.",
    nonUrgent: true,
  },
  {
    id: "medium-subscription-renewal",
    subject: "Your Figma Professional plan renews on 12 March",
    sender: "Figma Billing <billing@figma.example>",
    body: "Your Professional plan renews automatically on 12 March at $12.00/month. Manage or cancel any time before then.",
    expected: "MEDIUM",
    rationale: "Subscription renewal — MEDIUM by definition.",
    nonUrgent: true,
  },
  {
    id: "medium-plan-change",
    subject: "We're moving your team to the Business plan effective 1 April",
    sender: "Figma Billing <billing@figma.example>",
    body: "Your team has outgrown Professional, so we're moving you to Business from 1 April at $18/seat/month. Your new limits take effect immediately.",
    expected: "MEDIUM",
    rationale: "Plan change, a billing matter worth reading but needing no reply.",
    nonUrgent: true,
  },
  {
    id: "medium-client-invoice",
    subject: "Invoice INV-2291 for the March retainer",
    sender: "Billing <billing@brightline.example>",
    body: "Attached is invoice INV-2291 for the March retainer, $3,200, due on 30 March. Payment terms are net 30 as per the MSA. Let me know if anything looks wrong.",
    expected: "MEDIUM",
    rationale:
      "A client invoice. Billing and money, so worth reading; it has a due date but no action is asked for today.",
    nonUrgent: true,
  },
  {
    id: "medium-security-new-signin",
    subject: "New sign-in to your Northwind account from a new device",
    sender: "Northwind Security <no-reply@accounts.northwind.example>",
    body: "A new sign-in was detected from Chrome on Windows, Frankfurt, at 14:22. If this was you, no action is needed. If not, secure your account.",
    expected: "MEDIUM",
    rationale:
      "The exception you specified: a genuine account-security alert belongs in Worth a glance, not FYI, despite being fully automated.",
    nonUrgent: true,
  },
  {
    id: "medium-password-reset",
    subject: "Your password reset code is 481029",
    sender: "Northwind Accounts <no-reply@accounts.northwind.example>",
    body: "Someone requested a password reset for your account. Your code is 481029 and it expires in 10 minutes. If this wasn't you, no reset has been made.",
    expected: "MEDIUM",
    rationale:
      "Password reset. Automated and security-related, so MEDIUM rather than FYI. Ten-minute expiry is a reset-token lifetime, not a deadline on the user.",
    nonUrgent: true,
  },
  {
    id: "medium-personal-friend",
    subject: "are you around this weekend?",
    sender: "Sam <sam.okonkwo@gmail.example>",
    body: "no rush on this — if you're free saturday we could get coffee, otherwise completely fine either way. let me know what your week looks like",
    expected: "MEDIUM",
    rationale:
      "Personal correspondence from a real person. MEDIUM by default, and there is deliberately no rule promoting it to HIGH.",
    nonUrgent: true,
  },

  // ── LOW ─────────────────────────────────────────────────────────────────
  {
    id: "low-fake-urgent-promo",
    subject: "🚨 URGENT: your cart expires in 2 hours!",
    sender: "FlashDeals <deals@flashdeals-retail.example>",
    body: "URGENT: items in your cart are reserved for 2 more hours! ACT NOW before they're gone. Free shipping on everything today only. Shop now at flashdeals-retail.example",
    expected: "LOW",
    rationale:
      "Promotional urgency: 'URGENT', 'ACT NOW', an expiry countdown, and no person asking for anything. The single most important case in the set.",
    nonUrgent: true,
  },
  {
    id: "low-last-chance-promo",
    subject: "LAST CHANCE: 48 hours only on clearance stock",
    sender: "Northline Outfitters <mail@northline-outfitters.example>",
    body: "Final call — clearance stock is down to the last few sizes. 48 hours only, then it's gone. 30% off everything in store.",
    expected: "LOW",
    rationale: "Another urgency-abusing promotion, different wording, same answer.",
    nonUrgent: true,
  },
  {
    id: "low-newsletter",
    subject: "The Monday Edit: 12 stories worth your time",
    sender: "The Monday Edit <digest@mondayedit.example>",
    body: "Issue #418. This week: the case against the autonomous taxi, three brutalist buildings, and why everyone is wrong about remote work. Plus: our reader survey.",
    expected: "LOW",
    rationale: "A newsletter.",
    nonUrgent: true,
  },
  {
    id: "low-receipt",
    subject: "Your receipt from Cafe Nord — $18.40",
    sender: "Cafe Nord <receipts@cafenord.example>",
    body: "Thanks for visiting. 1x Filter coffee $4.20, 1x Cardamom bun $5.80, subtotal $10.00, tax $1.60, tip $6.80. Total $18.40 paid by card ending 4417.",
    expected: "LOW",
    rationale:
      "A receipt needing no action. Falls through every MEDIUM criterion, including 'needs no action' being stated by the definition itself.",
    nonUrgent: true,
  },
  {
    id: "low-social-notification",
    subject: "Priya Nair liked your comment and 3 others followed you",
    sender: "LinkedIn <notifications-noreply@linkedin.example>",
    body: "Your comment on 'Scaling Postgres read replicas' got 12 likes. Three new people followed you this week. See who they are and grow your network.",
    expected: "LOW",
    rationale: "A social media notification.",
    nonUrgent: true,
  },
  {
    id: "low-ci-build-passed",
    subject: "Build #4821 passed on main",
    sender: "GitHub <notifications@github.example>",
    body: "Build #4821 succeeded on main in 3m 12s. 214 tests passed, 0 failed. Deployed to staging automatically.",
    expected: "LOW",
    rationale:
      "An automated alert. Not account-security, so LOW, even though it is about production software.",
    nonUrgent: true,
  },
  {
    id: "low-unsubscribe-confirmation",
    subject: "You have been unsubscribed",
    sender: "Weekly Deals <unsubscribe@weeklydeals.example>",
    body: "You have been unsubscribed from Weekly Deals. You will receive no further messages from this sender. This is not a confirmation you need to act on.",
    expected: "LOW",
    rationale:
      "An automated confirmation needing no action — the cleanest LOW there is.",
    nonUrgent: true,
  },
  {
    id: "low-social-share",
    subject: "Priya Nair shared an article with you",
    sender: "LinkedIn <notifications-noreply@linkedin.example>",
    body: "Priya Nair, a connection you follow, shared 'The Postgres lock queue, explained'. 12 of your connections have also read it this week.",
    expected: "LOW",
    rationale:
      "An automated social share notification — the same LOW as a like or follow, one step further from anything a person sent you.",
    nonUrgent: true,
  },
  {
    id: "medium-invoice-courtesy-copy",
    subject: "A new invoice is available for your records",
    sender: "Acme Cloud <billing@acmecloud.example>",
    body: "Your monthly invoice for February is now available in the billing portal. You are receiving this as a courtesy copy because auto-pay is enabled. No payment is due.",
    expected: "MEDIUM",
    rationale:
      "FLAGGED, AND RELABELLED BY ME — flagging rather than bending the prompt. I first labelled this LOW on the reasoning that auto-pay and no due date make it a confirmation. That was my own distinction, not the user's: the rule states invoices are MEDIUM without exception, and 'confirmation' in LOW means a receipt for something already paid. The label now follows the stated rule. Worth the user's eye, because if they intend settled invoices to be FYI, this case and the LOW definition both need changing.",
    nonUrgent: true,
  },
];

/** Cases whose expected bucket is not HIGH, used for the leak report. */
export const NON_URGENT_CASES = EVAL_CASES.filter((c) => c.nonUrgent);
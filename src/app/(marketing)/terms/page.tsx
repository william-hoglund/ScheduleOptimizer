import type { Metadata } from "next";
import Link from "next/link";

import { CalloutNote, H2, Li, LegalLayout, P, Strong, Ul } from "@/components/marketing/legal-doc";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of Study Planner.",
};

const SECTIONS = [
  ["acceptance", "1. Acceptance of these terms"],
  ["the-service", "2. The service"],
  ["eligibility", "3. Eligibility"],
  ["accounts", "4. Your account"],
  ["acceptable-use", "5. Acceptable use"],
  ["your-content", "6. Your content, and what we do with it"],
  ["ai-disclaimer", "7. AI-generated content — please read this one"],
  ["study-groups", "8. Study groups"],
  ["third-party", "9. Third-party services"],
  ["availability", "10. Availability and changes to the service"],
  ["ip", "11. Our intellectual property"],
  ["termination", "12. Termination"],
  ["disclaimer", "13. Disclaimer of warranties"],
  ["liability", "14. Limitation of liability"],
  ["law", "15. Governing law"],
  ["changes", "16. Changes to these terms"],
  ["contact", "17. Contact"],
] as const;

export default function TermsOfServicePage() {
  return (
    <LegalLayout
      title="Terms of Service"
      lastUpdated="September 28, 2026"
      intro={
        <>
          <p>
            These terms govern your use of Study Planner. They’re written to describe what the
            product actually does, not as generic boilerplate — read §7 in particular, since it
            covers something specific to how this product uses AI.
          </p>
          <nav aria-label="Sections" className="mt-6 text-sm">
            <ul className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              {SECTIONS.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`} className="hover:text-foreground underline underline-offset-2">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </>
      }
    >
      <CalloutNote>
        <Strong>Before this goes live:</Strong> this document is a thorough draft grounded in
        the actual codebase, not a certified legal document. Fill in the bracketed placeholders
        (legal entity, jurisdiction, contact) and have it reviewed by someone qualified to
        advise on your specific situation before you rely on it with real users.
      </CalloutNote>

      <H2 id="acceptance">1. Acceptance of these terms</H2>
      <P>
        By creating an account or using Study Planner, you agree to these Terms of Service and
        to our{" "}
        <Link href="/privacy" className="hover:text-foreground underline underline-offset-2">
          Privacy Policy
        </Link>
        . If you don’t agree, don’t use the service.
      </P>

      <H2 id="the-service">2. The service</H2>
      <P>
        Study Planner is a study-planning tool. It combines your courses, deadlines, and fixed
        commitments into a schedule using a deterministic planning engine, and offers optional
        AI-assisted features: explaining a generated plan, breaking a task into subtasks,
        answering planning questions, and reading an uploaded course document to propose
        structured assessments and dates. It also offers optional study groups for
        accountability with people you invite.
      </P>
      <P>
        The service is currently offered free of charge, while in active development. Features,
        and this pricing, may change — see §10.
      </P>

      <H2 id="eligibility">3. Eligibility</H2>
      <P>
        You must be at least 16 years old, or the digital-consent age in your country if lower,
        to create an account. By registering, you confirm you meet this requirement.
      </P>

      <H2 id="accounts">4. Your account</H2>
      <Ul>
        <Li>You’re responsible for keeping your password confidential and for all activity under your account.</Li>
        <Li>Tell us right away if you suspect unauthorized access to your account.</Li>
        <Li>You’re responsible for the accuracy of the information you add (your courses, deadlines, and any documents you upload).</Li>
      </Ul>

      <H2 id="acceptable-use">5. Acceptable use</H2>
      <P>You agree not to:</P>
      <Ul>
        <Li>Use the service for anything unlawful, or to violate anyone else’s rights.</Li>
        <Li>Upload content you don’t have the right to upload, or that contains another person’s personal data without their consent.</Li>
        <Li>Attempt to bypass, probe, or disrupt the service’s security or infrastructure.</Li>
        <Li>Use the AI advisor to attempt to extract system prompts, jailbreak safety guardrails, or use it for anything outside study planning — the advisor is scoped to this product’s purpose and will decline off-topic requests.</Li>
        <Li>Use study groups to harass, shame, or pressure another member. The feature is built around collective goals and plan adherence specifically to avoid this; using it otherwise is against these terms.</Li>
        <Li>Scrape, resell, or use the service to build a competing product.</Li>
      </Ul>
      <P>We may suspend or terminate accounts that violate this section — see §12.</P>

      <H2 id="your-content">6. Your content, and what we do with it</H2>
      <P>
        You own the content you add: your courses, tasks, notes, and any documents you upload.
        You grant us a limited license to store, process, and display that content solely to
        provide the service to you (e.g. to generate your plan, or to extract structured data
        from a document you uploaded). We don’t use your content for any other purpose, and we
        don’t claim ownership of it.
      </P>
      <P>
        Deleting a piece of content, or your account, removes it from our systems — see the
        Privacy Policy §7 for specifics.
      </P>

      <H2 id="ai-disclaimer">7. AI-generated content — please read this one</H2>
      <P>
        Some of what this product shows you is generated or extracted by an AI model, not
        written or verified by a person. This includes plan explanations, task breakdowns, the
        advisor’s replies, and — importantly — <Strong>assessments, deadlines, weights, and
        requirements extracted from an uploaded course document.</Strong>
      </P>
      <Ul>
        <Li>
          <Strong>AI extraction can be wrong.</Strong> A date, weight, or requirement pulled
          from your syllabus is our best automated reading of it, not a guarantee. The product
          shows a confidence level and a link back to the source page specifically so you can
          check it — use that. Never treat an AI-extracted deadline as authoritative over your
          actual course materials or your instructor’s own communications.
        </Li>
        <Li>
          <Strong>You are responsible for verifying anything that affects your academic
          outcomes.</Strong> This product is a planning aid. It is not a substitute for reading
          your syllabus, checking your university’s official system, or asking your instructor.
        </Li>
        <Li>
          Nothing extracted or suggested by AI is saved to your account until you review and
          confirm it — see the Privacy Policy §4 for how that review step works.
        </Li>
      </Ul>

      <H2 id="study-groups">8. Study groups</H2>
      <P>
        If you join or create a study group, other members can see what you’ve chosen to share
        (adherence percentage, and optionally hours or courses, depending on the sharing level
        you pick) — never your grades, since this product doesn’t ask for them as an outcome.
        You can pause your membership or leave at any time.
      </P>

      <H2 id="third-party">9. Third-party services</H2>
      <P>
        Connecting Google Calendar is optional and governed by Google’s own terms in addition to
        ours. AI features are powered by a third-party AI provider (see Privacy Policy §5); their
        availability and behaviour can change outside our control.
      </P>

      <H2 id="availability">10. Availability and changes to the service</H2>
      <P>
        The service is provided on an &ldquo;as available&rdquo; basis, currently free of charge
        and under active development. We may add, change, or remove features, and — should we
        ever introduce paid plans — we’ll give you reasonable notice before anything you’re
        currently using starts requiring payment.
      </P>

      <H2 id="ip">11. Our intellectual property</H2>
      <P>
        The Study Planner name, branding, and the software itself (excluding your own content)
        are our property or licensed to us. These terms don’t grant you any right to use them
        outside of using the service as intended.
      </P>

      <H2 id="termination">12. Termination</H2>
      <P>
        You can delete your account at any time from Settings → Privacy — this takes effect
        immediately and cannot be undone. We may suspend or terminate accounts that violate §5,
        with notice where reasonably possible.
      </P>

      <H2 id="disclaimer">13. Disclaimer of warranties</H2>
      <P>
        The service is provided &ldquo;as is&rdquo;, without warranties of any kind, express or
        implied, including — to the extent permitted by law — fitness for a particular purpose
        or non-infringement. We don’t guarantee the service will be uninterrupted, error-free,
        or that a generated plan or AI output will be accurate or complete (see §7).
      </P>

      <H2 id="liability">14. Limitation of liability</H2>
      <P>
        To the extent permitted by law, we are not liable for indirect, incidental, or
        consequential damages arising from your use of the service — including, specifically,
        academic consequences of relying on an AI-extracted date or requirement without
        verifying it against your official course materials, as this section and §7 both ask
        you to do. Nothing in these terms excludes liability that cannot lawfully be excluded,
        such as liability for fraud or, where applicable, gross negligence.
      </P>

      <H2 id="law">15. Governing law</H2>
      <P>
        These terms are governed by the laws of <Strong>[your jurisdiction, e.g. Sweden]</Strong>,
        without regard to conflict-of-law principles. If you’re a consumer resident in the
        EU/EEA or UK, mandatory consumer-protection provisions of your own country’s law may
        also apply and are not overridden by this section.
      </P>

      <H2 id="changes">16. Changes to these terms</H2>
      <P>
        We may update these terms as the product changes. We’ll update the date at the top of
        this page, and for material changes, tell you directly before they take effect.
        Continuing to use the service after a change takes effect means you accept the updated
        terms.
      </P>

      <H2 id="contact">17. Contact</H2>
      <P>
        Questions about these terms? Contact us at <Strong>[contact email]</Strong>.
      </P>
    </LegalLayout>
  );
}

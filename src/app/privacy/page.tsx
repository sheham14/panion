import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

/*
 * Keep this page true to the product. Every feature, processor or data flow
 * that changes is checked against it in the same piece of work (CLAUDE.md
 * rule 15), and the date below moves with it.
 */

function H2({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[15px] font-semibold text-[#111] dark:text-[#e0e0e0] mt-8 mb-2">
      {children}
    </h2>
  );
}

function List({ children }: { children: ReactNode }) {
  return (
    <ul className="text-[14px] text-[#555] dark:text-[#aaa] leading-relaxed list-disc pl-5 space-y-1.5">
      {children}
    </ul>
  );
}

function P({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-[14px] text-[#555] dark:text-[#aaa] leading-relaxed ${className}`}>
      {children}
    </p>
  );
}

function Term({ children }: { children: ReactNode }) {
  return <span className="font-medium text-[#333] dark:text-[#ccc]">{children}</span>;
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#00b89e]">
      {children}
    </a>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-[#0f1416]">
      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Back */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[13px] text-[#888] mb-8"
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
          Back
        </Link>

        {/* Header */}
        <div className="mb-8">
          <p className="text-[13px] font-medium text-[#00E5C3] mb-1">Panion</p>
          <h1 className="text-[26px] font-semibold text-[#111] dark:text-[#e0e0e0] mb-1">
            Privacy Policy
          </h1>
          <p className="text-[13px] text-[#aaa]">Last updated: October 11, 2026</p>
        </div>

        <H2>Who we are</H2>
        <P>
          Panion is a grocery price intelligence app operated by Sheham Mohammed.
          We help users in St. John&apos;s, Newfoundland find the best grocery prices
          at local stores. You can reach us at{" "}
          <a
            href="mailto:privacy@panion.dev"
            className="text-[#00b89e] underline underline-offset-2"
          >
            privacy@panion.dev
          </a>{" "}
          for any privacy-related questions.
        </P>

        <H2>What we collect</H2>
        <List>
          <li>
            <Term>Account information:</Term> your name and email address, from
            Google Sign-In or the email address you use for a sign-in link
          </li>
          <li>
            <Term>Preferences:</Term> dietary restrictions, allergies, preferred
            stores, notification settings
          </li>
          <li>Grocery lists, pantry items and recipes you create or import</li>
          <li>Products you watch, and price reports you submit</li>
          <li>
            Clove conversations, including your messages and the responses
            generated
          </li>
          <li>
            <Term>Usage data:</Term> which features you use and when, to improve
            the app and enforce fair-use limits
          </li>
          <li>
            <Term>Push notifications:</Term> if you turn them on, the
            subscription your browser gives us so we can deliver them
          </li>
          <li>
            <Term>Technical data:</Term> your IP address, kept briefly to apply
            rate limits; and, when something breaks, an error report with your
            browser, device type and the page you were on
          </li>
          <li>
            <Term>Guest mode:</Term> a random identifier in a cookie, so the
            free Clove allowance can be counted. Nothing you do as a guest is
            saved to an account.
          </li>
        </List>

        <H2>What we don&apos;t collect</H2>
        <List>
          <li>Your precise location</li>
          <li>Payment details</li>
          <li>
            Any data from third-party apps or services beyond what you provide
            directly
          </li>
        </List>

        <H2>How we use your data</H2>
        <List>
          <li>
            To provide the app&apos;s core features: price comparisons, grocery
            lists, pantry tracking, recipes
          </li>
          <li>
            To personalise Clove responses with your pantry, preferred stores,
            dietary restrictions, and budget
          </li>
          <li>
            To organise your data with AI: sorting pantry items into categories,
            matching recipe ingredients to products, and reading recipes you
            import. You can change any category or match it makes.
          </li>
          <li>To send price drop alerts for products you watch (if enabled)</li>
          <li>To keep the service working: preventing abuse and fixing errors</li>
        </List>

        <H2>Third parties we share data with</H2>
        <P className="mb-2">
          Only what each service needs to do its job, and only to run Panion:
        </P>
        <List>
          <li>
            <Term>AI model provider (currently Anthropic):</Term> your Clove
            messages, with the pantry and preferences Clove uses; the text of
            recipes you import or save; and the names of your pantry items, to
            suggest a category.{" "}
            <Ext href="https://www.anthropic.com/privacy">anthropic.com/privacy</Ext>
          </li>
          <li>
            <Term>Vercel:</Term> our hosting provider, through which all
            requests pass. We also use Vercel Web Analytics, which counts page
            views without cookies and without identifying you.{" "}
            <Ext href="https://vercel.com/legal/privacy-policy">
              vercel.com/legal/privacy-policy
            </Ext>
          </li>
          <li>
            <Term>Neon:</Term> our database host, where your account data is
            stored.{" "}
            <Ext href="https://neon.com/privacy-policy">neon.com/privacy-policy</Ext>
          </li>
          <li>
            <Term>Sentry:</Term> receives error reports when something breaks,
            with technical details as described above. We strip personal data
            we can identify before sending.{" "}
            <Ext href="https://sentry.io/privacy/">sentry.io/privacy</Ext>
          </li>
          <li>
            <Term>SendGrid (Twilio):</Term> sends sign-in link emails to the
            address you enter.{" "}
            <Ext href="https://www.twilio.com/en-us/legal/privacy">
              twilio.com/legal/privacy
            </Ext>
          </li>
          <li>
            <Term>Google:</Term> authentication via Google Sign-In.{" "}
            <Ext href="https://policies.google.com/privacy">
              policies.google.com/privacy
            </Ext>
          </li>
          <li>
            <Term>Your browser&apos;s push service</Term> (for example Google or
            Apple) delivers push notifications, if you turn them on.
          </li>
        </List>
        <P className="mt-3">
          We do not sell your data. We do not share your data with advertisers.
        </P>

        <H2>How long we keep your data</H2>
        <List>
          <li>Active account data is kept for as long as your account exists</li>
          <li>
            If you request deletion, your account is anonymised within 30 days
          </li>
          <li>Clove conversations are kept until you delete them</li>
          <li>Price reports are kept to improve data accuracy</li>
          <li>
            Rate-limit records containing your IP address expire after a day
            and are deleted soon after
          </li>
          <li>Error reports are kept by Sentry for a limited period</li>
        </List>

        <H2>Your rights under PIPEDA</H2>
        <P className="mb-2">As a Canadian user you have the right to:</P>
        <List>
          <li>
            Access the data we hold about you. Use the <Term>Export my data</Term>{" "}
            option in Profile Settings
          </li>
          <li>Correct inaccurate data, updated directly in Profile Settings</li>
          <li>
            Request deletion of your account and data. Use{" "}
            <Term>Delete account</Term> in Profile Settings
          </li>
          <li>Withdraw consent at any time by deleting your account</li>
        </List>

        <H2>Cookies and local storage</H2>
        <P>
          We use a session cookie to keep you signed in, and two short-lived
          cookies (24 hours) for guest mode. Your browser also stores a few
          conveniences on your device only, such as recent searches and the
          last list you opened. We do not use tracking or advertising cookies,
          and our analytics use no cookies at all.
        </P>

        <H2>Changes to this policy</H2>
        <P>
          We update this policy as the app evolves. Significant changes will be
          communicated via email. The date at the top of this page always
          reflects the latest version.
        </P>

        <H2>Contact</H2>
        <a href="mailto:privacy@panion.dev" className="text-[14px] text-[#00b89e]">
          privacy@panion.dev
        </a>
      </div>
    </div>
  );
}

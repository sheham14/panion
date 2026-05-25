import BackButton from "./back-button";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-[#0f1416]">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <BackButton />

        {/* Header */}
        <div className="mb-8">
          <p className="text-[13px] font-medium text-[#00E5C3] mb-1">Panion</p>
          <h1 className="text-[26px] font-semibold text-[#111] dark:text-[#e0e0e0] mb-1">
            Terms of Service
          </h1>
          <p className="text-[13px] text-[#aaa]">Last updated: May 2026</p>
        </div>

        {/* Acceptance */}
        <h2 className="text-[15px] font-semibold text-[#111] dark:text-[#e0e0e0] mt-8 mb-2">
          Acceptance of Terms
        </h2>
        <p className="text-[14px] text-[#555] dark:text-[#aaa] leading-relaxed">
          By using Panion, you agree to these terms. If you don&apos;t agree,
          please don&apos;t use the app. We may update these terms as the app
          evolves. We will notify you of material changes by email or in-app
          notice before they take effect. Continued use after the effective date
          of any update means you accept the updated terms.
        </p>

        {/* What Panion Does */}
        <h2 className="text-[15px] font-semibold text-[#111] dark:text-[#e0e0e0] mt-8 mb-2">
          What Panion Does
        </h2>
        <p className="text-[14px] text-[#555] dark:text-[#aaa] leading-relaxed">
          Panion is a grocery price intelligence app serving St. John&apos;s,
          Newfoundland. We help you compare prices across local stores, manage
          grocery lists, track your pantry, and get recipe suggestions through
          our AI assistant Clove. Price data is sourced from publicly available
          information and user reports, and may not always reflect current
          in-store prices — always verify at the shelf.
        </p>

        {/* Your Account */}
        <h2 className="text-[15px] font-semibold text-[#111] dark:text-[#e0e0e0] mt-8 mb-2">
          Your Account
        </h2>
        <p className="text-[14px] text-[#555] dark:text-[#aaa] leading-relaxed">
          You sign in via Google OAuth. You are responsible for keeping your
          account secure. You must be 13 or older to use Panion. We reserve the
          right to suspend accounts that abuse the service.
        </p>

        {/* Acceptable Use */}
        <h2 className="text-[15px] font-semibold text-[#111] dark:text-[#e0e0e0] mt-8 mb-2">
          Acceptable Use
        </h2>
        <p className="text-[14px] text-[#555] dark:text-[#aaa] leading-relaxed mb-2">
          You agree not to:
        </p>
        <ul className="text-[14px] text-[#555] dark:text-[#aaa] leading-relaxed list-disc pl-5 space-y-1.5">
          <li>Use Panion for any unlawful purpose</li>
          <li>
            Attempt to reverse engineer, scrape, or abuse the API
          </li>
          <li>Submit false price reports intentionally</li>
          <li>Attempt to bypass rate limits or authentication</li>
          <li>Use automated tools to interact with the service</li>
        </ul>

        {/* Price Reports */}
        <h2 className="text-[15px] font-semibold text-[#111] dark:text-[#e0e0e0] mt-8 mb-2">
          Price Reports
        </h2>
        <p className="text-[14px] text-[#555] dark:text-[#aaa] leading-relaxed">
          When you submit a price report, you confirm the information is
          accurate to the best of your knowledge. By submitting price reports or
          creating recipes, you grant Panion a non-exclusive, royalty-free
          licence to use that content to provide and improve the service. We use
          reports to improve price data accuracy. Intentionally false reports
          may result in account suspension.
        </p>

        {/* Clove */}
        <h2 className="text-[15px] font-semibold text-[#111] dark:text-[#e0e0e0] mt-8 mb-2">
          AI Assistant — Clove
        </h2>
        <p className="text-[14px] text-[#555] dark:text-[#aaa] leading-relaxed">
          Clove is powered by Anthropic&apos;s Claude API. Clove&apos;s
          responses are AI-generated and may contain errors — always use your
          own judgment, especially regarding dietary information, allergens, and
          nutritional content. Clove is not a substitute for professional
          dietary or medical advice. We are not liable for decisions made based
          on Clove&apos;s suggestions.
        </p>

        {/* Intellectual Property */}
        <h2 className="text-[15px] font-semibold text-[#111] dark:text-[#e0e0e0] mt-8 mb-2">
          Intellectual Property
        </h2>
        <p className="text-[14px] text-[#555] dark:text-[#aaa] leading-relaxed">
          Panion and its original content are owned by Sheham Mohammed. Recipe
          content you create belongs to you. System recipes provided by Panion
          are for personal use only.
        </p>

        {/* Privacy */}
        <h2 className="text-[15px] font-semibold text-[#111] dark:text-[#e0e0e0] mt-8 mb-2">
          Privacy
        </h2>
        <p className="text-[14px] text-[#555] dark:text-[#aaa] leading-relaxed">
          Your use of Panion is also governed by our{" "}
          <a href="/privacy" className="text-[#00b89e] underline underline-offset-2">
            Privacy Policy
          </a>
          , which describes how we collect, use, and protect your personal
          information.
        </p>

        {/* Disclaimers */}
        <h2 className="text-[15px] font-semibold text-[#111] dark:text-[#e0e0e0] mt-8 mb-2">
          Disclaimers
        </h2>
        <p className="text-[14px] text-[#555] dark:text-[#aaa] leading-relaxed">
          Panion is provided as-is. We make no guarantees about price accuracy,
          product availability, or uninterrupted service. We are not affiliated
          with any of the stores listed in the app.
        </p>

        {/* Limitation of Liability */}
        <h2 className="text-[15px] font-semibold text-[#111] dark:text-[#e0e0e0] mt-8 mb-2">
          Limitation of Liability
        </h2>
        <p className="text-[14px] text-[#555] dark:text-[#aaa] leading-relaxed">
          To the fullest extent permitted by law, Panion and its operator are
          not liable for any indirect, incidental, or consequential damages
          arising from your use of the app.
        </p>

        {/* Governing Law */}
        <h2 className="text-[15px] font-semibold text-[#111] dark:text-[#e0e0e0] mt-8 mb-2">
          Governing Law
        </h2>
        <p className="text-[14px] text-[#555] dark:text-[#aaa] leading-relaxed">
          These terms are governed by the laws of the Province of Newfoundland
          and Labrador and the federal laws of Canada applicable therein.
        </p>

        {/* Contact */}
        <h2 className="text-[15px] font-semibold text-[#111] dark:text-[#e0e0e0] mt-8 mb-2">
          Contact
        </h2>
        <p className="text-[14px] text-[#555] dark:text-[#aaa] leading-relaxed mb-1">
          For questions about these terms:
        </p>
        <a
          href="mailto:privacy@panion.dev"
          className="text-[14px] text-[#00b89e]"
        >
          privacy@panion.dev
        </a>
      </div>
    </div>
  );
}
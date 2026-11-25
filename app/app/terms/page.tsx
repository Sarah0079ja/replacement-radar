import type { Metadata } from "next";
import { LegalCallout, LegalList, LegalPage, LegalSection } from "../legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service | ResponseHVAC",
  description: "Terms governing use of ResponseHVAC.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="These Terms govern access to and use of ResponseHVAC, a service operated by Rynith, Inc., a Delaware corporation."
    >
      <LegalSection title="1. Acceptance of Terms">
        <p>By accessing or using ResponseHVAC, you agree to these Terms. If you use ResponseHVAC for a company or other organization, you represent that you have authority to bind that organization to these Terms.</p>
      </LegalSection>

      <LegalSection title="2. Business Service and Eligibility">
        <p>ResponseHVAC is intended primarily for legitimate business use by HVAC contractors and related authorized business users. You must be legally capable of entering a binding agreement to use the service.</p>
      </LegalSection>

      <LegalSection title="3. Accounts">
        <p>You are responsible for providing accurate account information, safeguarding your credentials, and activity occurring through your account. Notify us promptly at <a href="mailto:support@responsehvac.com">support@responsehvac.com</a> if you suspect unauthorized access. We may suspend an account reasonably believed to be compromised or abused.</p>
      </LegalSection>

      <LegalSection title="4. Service Description">
        <p>ResponseHVAC provides property-opportunity information and prioritization tools intended to assist HVAC contractors with prospecting. The service may use public records, permit records, property information, third-party or otherwise available datasets, and derived signals or inferences.</p>
        <p>ResponseHVAC is a decision-support and prospecting tool. It does not replace independent verification, professional judgment, legal advice, or compliance obligations.</p>
      </LegalSection>

      <LegalSection title="5. Critical Data Disclaimer">
        <LegalCallout><strong>ResponseHVAC does not guarantee</strong> that a property requires HVAC replacement, that an HVAC system is a particular age, that a permit establishes the currently installed HVAC system, that property information is complete or current, that a homeowner will purchase services, or that contacting an opportunity will result in a lead, appointment, sale, or revenue.</LegalCallout>
        <p>Records and signals may be incomplete, inaccurate, delayed, outdated, inconsistent, or unavailable. You must independently verify information when appropriate before relying on it or taking action.</p>
      </LegalSection>

      <LegalSection title="6. Inferences">
        <p>Some information presented by ResponseHVAC represents an inference rather than a verified fact. An inference is not a representation or warranty about the condition of a property or homeowner.</p>
      </LegalSection>

      <LegalSection title="7. Non-Exclusive Opportunities">
        <p>ResponseHVAC opportunities are <strong>not exclusive</strong>. The same property or opportunity may be independently identified by another company, available from public sources, or provided to more than one ResponseHVAC customer where applicable. ResponseHVAC does not promise exclusive leads.</p>
      </LegalSection>

      <LegalSection title="8. Customer Responsibility for Outreach">
        <p>You are solely responsible for deciding whether and how to contact a property owner or any other person. You must comply with all laws and rules that apply to your outreach, including as applicable:</p>
        <LegalList>
          <li>telemarketing, telephone-call, and Do Not Call requirements;</li>
          <li>text or SMS messaging, automated dialing, and prerecorded or artificial-voice requirements;</li>
          <li>email marketing and direct-mail requirements;</li>
          <li>solicitation, advertising, privacy, and consumer-protection laws; and</li>
          <li>state and local contractor-solicitation rules.</li>
        </LegalList>
        <p>ResponseHVAC does not provide legal authorization to contact any person. A property&apos;s appearance in ResponseHVAC does not mean that its homeowner consented to calls, texts, emails, direct mail, or other marketing communications. You are responsible for obtaining consent required by law and maintaining your own suppression and Do-Not-Call compliance.</p>
      </LegalSection>

      <LegalSection title="9. Prohibited High-Risk Uses">
        <p>You may not use ResponseHVAC property information to determine or materially assist decisions about a person&apos;s eligibility for credit, lending, insurance, employment, housing or tenancy, education, government benefits, healthcare, or other legally protected eligibility decisions.</p>
        <p>ResponseHVAC is not intended to be a consumer reporting agency or consumer report service under the Fair Credit Reporting Act. You may not use ResponseHVAC as a substitute for legally required consumer reports, background checks, or eligibility procedures.</p>
      </LegalSection>

      <LegalSection title="10. Subscription and Trial">
        <p>ResponseHVAC currently offers one subscription plan at <strong>$99 USD per month</strong> with a <strong>5-day free trial</strong>. A payment method is required when starting the trial. By starting a trial, you authorize recurring charges after the trial unless you cancel before it converts to paid service. Subscriptions renew monthly, taxes may apply, and you must maintain a valid payment method.</p>
        <p>We may change pricing prospectively with appropriate notice where required.</p>
      </LegalSection>

      <LegalSection title="11. Cancellation">
        <p>You may cancel through available account or billing functionality. Cancellation stops future renewal according to the applicable billing period or trial terms. During a free trial, you must cancel before the trial converts to paid service to avoid the first subscription charge.</p>
      </LegalSection>

      <LegalSection title="12. Refunds">
        <p>Except where required by law or expressly agreed by ResponseHVAC, fees already charged are non-refundable.</p>
      </LegalSection>

      <LegalSection title="13. Acceptable Use">
        <p>You may not use ResponseHVAC to:</p>
        <LegalList>
          <li>violate law, commit fraud, harass others, or conduct deceptive marketing;</li>
          <li>obtain unauthorized access, conduct security attacks, distribute malware, or interfere with service operation;</li>
          <li>make excessive automated requests, scrape the service, or harvest ResponseHVAC customer information;</li>
          <li>bypass technical restrictions or access controls; or</li>
          <li>misuse property information or use the service for an unlawful purpose.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="14. Proprietary System and Reverse Engineering">
        <p>You may not attempt to discover, extract, reconstruct, reverse engineer, or systematically reproduce ResponseHVAC&apos;s ranking logic, scoring logic, weights, formulas, thresholds, transformations, filtering logic, recurrence logic, proprietary dataset combinations, source-selection methodology, internal models, or protected system architecture.</p>
        <p>You may not systematically scrape or reproduce the ResponseHVAC opportunity database. Rynith, Inc. does not claim ownership of underlying public records merely because they appear in the service. Rynith, Inc. claims rights in the ResponseHVAC software, compilation, organization, presentation, proprietary processing, derived systems, and other protectable intellectual property.</p>
      </LegalSection>

      <LegalSection title="15. Intellectual Property">
        <p>Rynith, Inc. owns or licenses ResponseHVAC&apos;s software, branding, interface, design, proprietary data organization, documentation, processing methods, and other protectable materials. While you are subscribed and comply with these Terms, we grant you a limited, revocable, non-exclusive, non-transferable right to use the service for your internal business purposes.</p>
      </LegalSection>

      <LegalSection title="16. Customer Data">
        <p>You retain rights in information you submit to ResponseHVAC. You grant Rynith, Inc. the permissions reasonably necessary to host, process, secure, and use that information to provide and improve the service. You are responsible for having the rights and permissions needed to submit that information.</p>
      </LegalSection>

      <LegalSection title="17. Third-Party Services">
        <p>ResponseHVAC may rely on third-party infrastructure and services. Rynith, Inc. is not responsible for third-party services outside its reasonable control, subject to obligations that cannot legally be disclaimed.</p>
      </LegalSection>

      <LegalSection title="18. Service Changes and Availability">
        <p>We may improve, modify, add, remove, suspend, or discontinue features. We do not guarantee uninterrupted or error-free availability and may perform maintenance or experience operational interruptions.</p>
      </LegalSection>

      <LegalSection title="19. Suspension and Termination">
        <p>Rynith, Inc. may suspend or terminate access for violation of these Terms, nonpayment, fraud, abuse, security risk, legal requirements, or material risk to ResponseHVAC or others. Where reasonable, we will provide notice and an opportunity to address the issue.</p>
      </LegalSection>

      <LegalSection title="20. Disclaimer of Warranties">
        <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, RESPONSEHVAC IS PROVIDED “AS IS” AND “AS AVAILABLE.” RYNITH, INC. DISCLAIMS IMPLIED WARRANTIES TO THE EXTENT LEGALLY PERMITTED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.</p>
        <p>WE DO NOT WARRANT THE ACCURACY, COMPLETENESS, CURRENTNESS, OR RESULTS OF THE SERVICE, OR GUARANTEE SALES, REVENUE, LEAD CONVERSION, PROPERTY CONDITION, OR HVAC REPLACEMENT NEED. WE DO NOT DISCLAIM WARRANTIES OR RIGHTS THAT CANNOT LEGALLY BE EXCLUDED.</p>
      </LegalSection>

      <LegalSection title="21. Limitation of Liability">
        <p>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, RYNITH, INC. AND ITS RELEVANT PERSONNEL WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, LOST REVENUE, LOST BUSINESS OPPORTUNITIES, OR LOSS OF DATA, ARISING OUT OF OR RELATED TO THE SERVICE OR THESE TERMS.</p>
        <p>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, RYNITH, INC.&apos;S AGGREGATE LIABILITY FOR ALL CLAIMS ARISING OUT OF OR RELATED TO THE SERVICE OR THESE TERMS WILL NOT EXCEED THE GREATER OF (A) AMOUNTS PAID OR PAYABLE BY THE CUSTOMER TO RESPONSEHVAC DURING THE 12 MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO THE CLAIM, OR (B) $100.</p>
        <p>These limitations do not apply where prohibited by applicable law.</p>
      </LegalSection>

      <LegalSection title="22. Indemnification">
        <p>To the extent permitted by law, business customers agree to defend and indemnify Rynith, Inc. and its officers, directors, employees, and agents from third-party claims, losses, liabilities, and reasonable expenses arising from the customer&apos;s unlawful outreach; violation of telemarketing, SMS, email, or solicitation laws; misuse of ResponseHVAC data; violation of these Terms; infringement or violation of third-party rights; or other unlawful conduct by the customer.</p>
      </LegalSection>

      <LegalSection title="23. Governing Law and Venue">
        <p>These Terms are governed by the laws of the State of Delaware, without regard to conflict-of-law principles, subject to mandatory applicable laws that cannot be waived by contract. For disputes properly brought in court, the parties consent to courts located in Delaware, subject to applicable jurisdictional requirements.</p>
      </LegalSection>

      <LegalSection title="24. Changes to These Terms">
        <p>We may update these Terms prospectively. We will use reasonable means to provide notice of material changes where required. Continued use of ResponseHVAC after an updated effective date constitutes acceptance of the updated Terms where legally permissible.</p>
      </LegalSection>

      <LegalSection title="25. General Terms">
        <p>These Terms and incorporated policies form the entire agreement regarding the service, subject to any separate written agreement. If a provision is unenforceable, it will be modified or severed to the minimum extent necessary without affecting the rest. A waiver must be in writing and does not waive a later breach. You may not assign these Terms without our consent; we may assign them in connection with a corporate transaction or operation of the service. Neither party is responsible for delay caused by events beyond reasonable control. Headings are for convenience and do not control interpretation.</p>
      </LegalSection>

      <LegalSection title="26. Contact">
        <p><strong>Rynith, Inc.</strong><br />ResponseHVAC<br /><a href="mailto:support@responsehvac.com">support@responsehvac.com</a></p>
      </LegalSection>
    </LegalPage>
  );
}

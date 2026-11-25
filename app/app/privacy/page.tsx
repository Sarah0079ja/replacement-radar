import type { Metadata } from "next";
import { LegalCallout, LegalList, LegalPage, LegalSection } from "../legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy | ResponseHVAC",
  description: "How ResponseHVAC and Rynith, Inc. handle information.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="ResponseHVAC is a service operated by Rynith, Inc., a Delaware corporation. This Privacy Policy explains what information we collect, how we use it, and the choices available to people who use ResponseHVAC."
    >
      <LegalSection title="1. Introduction">
        <p>This policy applies to ResponseHVAC, including the website at responsehvac.com and the ResponseHVAC application. It describes our handling of information in connection with account creation, authentication, workspace use, subscriptions, customer support, and the property-opportunity information displayed through the service.</p>
        <p>By using ResponseHVAC, you acknowledge that you have had an opportunity to review this policy. Additional notices may apply to particular features or communications.</p>
      </LegalSection>

      <LegalSection title="2. Information We Collect">
        <p><strong>Account and identity information.</strong> We collect information you provide when creating or managing an account, such as your name, email address, company or business name, authentication identifiers, and information needed to maintain your ResponseHVAC workspace.</p>
        <p><strong>Google Sign-In information.</strong> If you use Continue with Google, ResponseHVAC may receive basic Google account information made available through the authentication scope, such as your name, email address, Google account identifier, and available profile information. We use this information to authenticate you, create or associate your ResponseHVAC account, maintain account and session security, and provide access to ResponseHVAC.</p>
        <LegalCallout><strong>Google access is limited.</strong> Using Google Sign-In does not give ResponseHVAC access to your Gmail messages, Google Drive files, Google Calendar, Google Contacts, or other Google content. ResponseHVAC does not currently request those permissions. If a future feature separately requests additional Google access, we will request authorization for that feature and provide appropriate notice.</LegalCallout>
        <p><strong>Business and service information.</strong> We collect information customers choose to provide about their HVAC business and service area, including selected service ZIP codes, weekly opportunity capacity, business information, and mailing information entered through the service.</p>
        <p><strong>Billing information.</strong> Payments and payment-card processing are handled by third-party payment processors such as Stripe. ResponseHVAC may receive subscription, transaction, billing-status, and related account information, but does not need to store complete payment-card numbers itself.</p>
        <p><strong>Usage and technical information.</strong> We may collect information needed to operate and secure the service, such as IP address, browser and device characteristics, login and session information, pages or features used, timestamps, and diagnostic or security information.</p>
        <p><strong>Property and public-record information.</strong> ResponseHVAC processes property-related information obtained from public, governmental, licensed, commercially available, or otherwise lawfully available sources. This may include property characteristics, permit information, geographic and service-area information, and other property-related evidence used to generate and prioritize opportunities. This information may concern properties rather than ResponseHVAC account holders.</p>
      </LegalSection>

      <LegalSection title="3. How We Use Information">
        <LegalList>
          <li>Operate, maintain, and provide ResponseHVAC.</li>
          <li>Authenticate users, manage accounts, and maintain secure sessions.</li>
          <li>Generate and prioritize property opportunities for customer prospecting.</li>
          <li>Provide customer support and respond to requests.</li>
          <li>Process subscriptions and maintain billing records.</li>
          <li>Maintain security, detect abuse or fraud, and troubleshoot issues.</li>
          <li>Improve product reliability and understand operational performance.</li>
          <li>Comply with legal obligations and protect rights, safety, and the service.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="4. Property Signals and Inferences">
        <p>ResponseHVAC may derive or infer property-related signals from available information. These signals are informational and may be incomplete, delayed, inaccurate, or outdated. They do not establish the actual condition of HVAC equipment, the age of a currently installed system, or whether a property requires replacement.</p>
        <p>Signals should not be treated as definitive facts about a homeowner or property. ResponseHVAC does not guarantee that an opportunity will result in a contact, appointment, sale, or revenue.</p>
      </LegalSection>

      <LegalSection title="5. How Information May Be Disclosed">
        <p>We may disclose information to the following categories of recipients when reasonably necessary for the purposes described in this policy:</p>
        <p><strong>Service providers.</strong> We use service providers that support functions such as cloud hosting and database infrastructure, authentication, payment processing, email delivery, and security. Relevant providers may include Supabase, Stripe, Resend, and Google for Google authentication.</p>
        <p><strong>Legal and safety disclosures.</strong> We may disclose information where reasonably necessary to comply with law or legal process, protect rights and security, investigate fraud or abuse, or enforce our agreements.</p>
        <p><strong>Business transfers.</strong> Information may be transferred in connection with a merger, acquisition, financing, reorganization, sale of assets, or similar corporate transaction, subject to applicable law.</p>
      </LegalSection>

      <LegalSection title="6. Sale and Targeted Advertising">
        <p>Rynith, Inc. does not sell ResponseHVAC customer account information for monetary consideration. ResponseHVAC does not use Google authentication data for targeted advertising. We do not use Google Sign-In to access content from other Google services.</p>
        <p>Privacy laws can define terms such as “sale” or “targeted advertising” differently. Where applicable law grants additional rights, you may contact us using the information below.</p>
      </LegalSection>

      <LegalSection title="7. Cookies and Session Technology">
        <p>ResponseHVAC may use cookies or similar browser and session technologies that are necessary for authentication, security, maintaining sessions, and essential application functionality. We do not describe an advertising-cookie system here because ResponseHVAC does not currently operate one as part of the service.</p>
      </LegalSection>

      <LegalSection title="8. Data Retention">
        <p>We retain information for as long as reasonably necessary to provide the service, maintain an account, satisfy legal or compliance requirements, resolve disputes, enforce agreements, and prevent fraud or security abuse. Retention periods vary depending on the nature and purpose of the information.</p>
      </LegalSection>

      <LegalSection title="9. Security">
        <p>ResponseHVAC uses reasonable administrative, technical, and organizational safeguards designed to protect information. No method of transmission or storage can be guaranteed completely secure, and we cannot promise perfect security.</p>
      </LegalSection>

      <LegalSection title="10. Privacy Rights and Requests">
        <p>Where applicable law grants you these rights, you may request access to, correction of, deletion of, or a copy of your information. You may also have rights to portability, to opt out of qualifying sale or targeted advertising, to limit certain profiling, or to appeal a privacy-request decision.</p>
        <p>To submit a privacy request, contact <a href="mailto:support@responsehvac.com">support@responsehvac.com</a>. You do not need to create a new account to submit a request. We may need to verify your identity before completing a request. Rights vary by jurisdiction and may be subject to legal exceptions.</p>
        <p><strong>United States state rights.</strong> Residents of states with applicable comprehensive privacy laws may have additional rights. Where applicable law grants you these rights, we will handle qualifying requests as required by law; this policy does not represent that every state law applies to Rynith, Inc. or every user.</p>
      </LegalSection>

      <LegalSection title="11. International Users">
        <p>ResponseHVAC is operated for the United States. Information may be processed in the United States and in other locations where our service providers operate. Where applicable law gives you additional privacy rights, ResponseHVAC will address qualifying requests as required by that law.</p>
      </LegalSection>

      <LegalSection title="12. Children">
        <p>ResponseHVAC is a business service and is not intended for children under 13. We do not knowingly seek to collect personal information from children under 13 through customer accounts.</p>
      </LegalSection>

      <LegalSection title="13. Third-Party Services">
        <p>Third-party services, including Google and Stripe, have their own privacy practices and policies. Their handling of information is governed by their respective notices, not solely by this policy.</p>
      </LegalSection>

      <LegalSection title="14. Changes to This Policy">
        <p>We may update this policy from time to time. We will update the effective date and use reasonable means to communicate material changes where required. Your continued use of ResponseHVAC after an updated policy becomes effective is subject to the updated policy to the extent permitted by law.</p>
      </LegalSection>

      <LegalSection title="15. Contact">
        <p><strong>Rynith, Inc.</strong><br />ResponseHVAC<br /><a href="mailto:support@responsehvac.com">support@responsehvac.com</a></p>
      </LegalSection>
    </LegalPage>
  );
}
